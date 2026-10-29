import { z } from "zod/v4";

import {
  OMIT_REASONS,
  type IRBoxStyle,
  type IRDeviceOverride,
  type IRDevices,
  type IRLeaf,
  type IRRow,
  type IRSection,
  type IRTextStyle,
  type ImportIR,
} from "./ir";

/**
 * What the model actually writes (012-url-page-import, contracts/import-ir.md
 * "Wire format"). The structured Import IR — every style property an optional
 * field, per-device overrides nested at every level — compiles into a grammar
 * too large for structured outputs (API 400 "compiled grammar is too large").
 * On the wire each element's styles are therefore one short CSS-like string:
 *
 *   "background-color:#ecfdf5; padding:80px 24px; text-align:center;
 *    @tablet{padding:48px 16px} @mobile{padding:40px 16px; display:none}"
 *
 * Background images are kept on sections and columns only.
 * `fromWire` turns it back into the structured IR, keeping only the known
 * properties with valid values; the serializer validates them again.
 */

const Ref = z.string().describe('Id from the page extract: "t12" (text or link), "i4" (image), "f1" (form)');
const Css = z
  .string()
  .describe(
    "Declarations `property:value;` from the allowed list, then optional `@tablet{…}` / `@mobile{…}` overrides",
  );

const WireLeaf = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("hero"),
    heading: Ref,
    headingLevel: z.union([z.literal(1), z.literal(2)]),
    text: z.array(Ref).optional(),
    cta: z.object({ label: Ref, href: Ref }).optional(),
    css: Css.optional().describe("Banner box"),
    headingCss: Css.optional().describe("Heading text"),
    textCss: Css.optional().describe("Supporting texts"),
  }),
  z.object({
    kind: z.literal("rich-text"),
    parts: z.array(
      z.object({
        ref: Ref,
        as: z.enum(["h1", "h2", "h3", "h4", "p", "li-ul", "li-ol", "blockquote"]),
        css: Css.optional().describe("Text"),
      }),
    ),
    css: Css.optional().describe("Block box"),
  }),
  z.object({
    kind: z.literal("image"),
    image: Ref,
    caption: Ref.optional(),
    css: Css.optional().describe("Block box; max-width = image width"),
  }),
  z.object({
    kind: z.literal("call-to-action"),
    label: Ref,
    href: Ref,
    css: Css.optional().describe("Block box"),
    buttonCss: Css.optional().describe("Button: background-color, color"),
  }),
  z.object({
    kind: z.literal("testimonial"),
    quote: Ref,
    author: Ref.optional(),
    css: Css.optional().describe("Block box"),
    textCss: Css.optional().describe("Quote text"),
  }),
  z.object({ kind: z.literal("lead-form"), form: Ref }),
]);

const WireColumn = z.object({ blocks: z.array(WireLeaf), css: Css.optional().describe("Column box; background-image = image id") });

const WireRow = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("blocks"), blocks: z.array(WireLeaf) }),
  z.object({
    kind: z.literal("columns"),
    columns: z.array(WireColumn).describe("2–4 columns; more in the source → several rows"),
    css: Css.optional().describe("gap, and @mobile/@tablet overrides"),
  }),
]);

const WireSection = z.object({
  source: z.string().describe("Short French label of the source section, for the report"),
  rows: z.array(WireRow),
  css: Css.optional().describe("Section band; background-image = image id; max-width = content width"),
});

export const WireIR = z.object({
  sections: z.array(WireSection),
  sourceHadMobileLayout: z
    .boolean()
    .describe("false when the source's mobile rendering is only its desktop layout shrunk"),
  simplified: z.array(z.object({ what: z.string(), how: z.string() })),
  omitted: z.array(z.object({ what: z.string(), reason: z.enum(OMIT_REASONS) })),
});

export type WireIR = z.infer<typeof WireIR>;
type WireLeaf = z.infer<typeof WireLeaf>;
type RichTextPart = Extract<IRLeaf, { kind: "rich-text" }>["parts"][number];

// ---------------------------------------------------------------- repair

const LEAF_KINDS = new Set(["hero", "rich-text", "image", "call-to-action", "testimonial", "lead-form"]);
const PART_TAGS = new Set(["h1", "h2", "h3", "h4", "p", "li-ul", "li-ol", "blockquote"]);
const REASONS = new Set<string>(OMIT_REASONS);

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Structured outputs only pass enum and literal constraints to the model as
 * descriptions (SDK behaviour), so an otherwise good answer can carry an
 * out-of-list value (`h5`, `headingLevel: 3`, a new block kind…) and fail
 * validation after the conversion was paid for. The obvious slips are
 * mapped to the nearest allowed value; unknown blocks are dropped and
 * reported. Everything else is left for `WireIR` to validate.
 */
export function repairWire(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  const omitted: Json[] = Array.isArray(raw.omitted) ? raw.omitted.filter(isObj) : [];
  for (const o of omitted) if (!REASONS.has(String(o.reason))) o.reason = "other";
  const leaves = (blocks: unknown) =>
    (Array.isArray(blocks) ? blocks : []).filter((b) => {
      if (!isObj(b)) return false;
      if (!LEAF_KINDS.has(String(b.kind))) {
        omitted.push({ what: `Bloc « ${String(b.kind)} » non reconnu`, reason: "other" });
        return false;
      }
      if (b.kind === "hero" && b.headingLevel !== 1 && b.headingLevel !== 2) b.headingLevel = 2;
      if (b.kind === "rich-text" && Array.isArray(b.parts)) {
        for (const p of b.parts.filter(isObj)) {
          const tag = String(p.as);
          if (!PART_TAGS.has(tag)) p.as = /^h[5-6]$/.test(tag) ? "h4" : tag === "li" || tag === "ul" ? "li-ul" : tag === "ol" ? "li-ol" : "p";
        }
      }
      return true;
    });
  if (Array.isArray(raw.sections)) {
    for (const section of raw.sections.filter(isObj)) {
      if (!Array.isArray(section.rows)) continue;
      section.rows = section.rows.filter(isObj).filter((row) => {
        if (row.kind === "blocks") return (row.blocks = leaves(row.blocks)), true;
        if (row.kind === "columns") {
          row.columns = (Array.isArray(row.columns) ? row.columns : []).filter(isObj);
          for (const c of row.columns as Json[]) c.blocks = leaves(c.blocks);
          return true;
        }
        return false;
      });
    }
  }
  return { ...raw, omitted };
}

// ---------------------------------------------------------------- CSS-like strings

type Decls = Record<string, string>;
type ParsedCss = { base: Decls; tablet: Decls; mobile: Decls };

/** "a:1; b:2 @mobile{a:3}" → { base: {a:"1", b:"2"}, mobile: {a:"3"}, tablet: {} } — lower-cased names, unknown blocks ignored. */
export function parseCss(css: string | undefined): ParsedCss {
  const out: ParsedCss = { base: {}, tablet: {}, mobile: {} };
  if (!css) return out;
  const decls = (s: string, into: Decls) => {
    for (const decl of s.split(";")) {
      const i = decl.indexOf(":");
      if (i <= 0) continue;
      const name = decl.slice(0, i).trim().toLowerCase();
      const value = decl.slice(i + 1).trim().replace(/\s*!important$/i, "");
      if (name && value) into[name] = value;
    }
  };
  const blockRe = /@(tablet|mobile)\s*\{([^}]*)\}/gi;
  decls(css.replace(blockRe, ";"), out.base);
  for (const m of css.matchAll(blockRe)) decls(m[2]!, out[m[1]!.toLowerCase() as "tablet" | "mobile"]);
  return out;
}

const px = (v: string | undefined): number | undefined => {
  const m = v === undefined ? null : /^(-?\d+(?:\.\d+)?)(px)?$/i.exec(v.trim());
  return m ? Math.round(Number(m[1])) : undefined;
};
const color = (v: string | undefined): string | undefined => {
  const s = v?.trim().toLowerCase();
  if (!s) return undefined;
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join("")}`;
  return undefined;
};
const align = (v: string | undefined) =>
  v === "left" || v === "center" || v === "right" ? (v as "left" | "center" | "right") : undefined;
const WEIGHTS = { normal: 400, bold: 700 } as Record<string, number>;
const weight = (v: string | undefined) => {
  const n = v === undefined ? undefined : (WEIGHTS[v.trim().toLowerCase()] ?? Number(v));
  return n === 400 || n === 500 || n === 600 || n === 700 || n === 800 ? n : undefined;
};

/** `padding` shorthand (1–4 values) then the longhands, which win. */
function padding(d: Decls) {
  const out: Pick<IRBoxStyle, "paddingTop" | "paddingRight" | "paddingBottom" | "paddingLeft"> = {};
  const parts = (d["padding"] ?? "").trim().split(/\s+/).filter(Boolean).map(px);
  if (parts.length >= 1 && parts.length <= 4 && parts.every((p) => p !== undefined)) {
    const [t, r = t, b = t, l = r] = parts as number[];
    Object.assign(out, { paddingTop: t, paddingRight: r, paddingBottom: b, paddingLeft: l });
  }
  const set = (key: keyof typeof out, name: string) => {
    const v = px(d[name]);
    if (v !== undefined) out[key] = v;
  };
  set("paddingTop", "padding-top");
  set("paddingRight", "padding-right");
  set("paddingBottom", "padding-bottom");
  set("paddingLeft", "padding-left");
  return out;
}

const clean = <T extends object>(o: T): T | undefined => {
  const kept = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
  return Object.keys(kept).length ? kept : undefined;
};

function box(d: Decls, withImage = false): IRBoxStyle | undefined {
  const image = d["background-image"]?.trim().replace(/^url\((.*)\)$/i, "$1").replace(/^["']|["']$/g, "");
  return clean<IRBoxStyle>({
    backgroundColor: color(d["background-color"] ?? d["background"]),
    backgroundImage: withImage && image && /^i\d+$/.test(image) ? image : undefined,
    ...padding(d),
    borderRadius: px(d["border-radius"]),
    textAlign: align(d["text-align"]),
  });
}

function text(d: Decls): IRTextStyle | undefined {
  const style = d["font-style"]?.trim();
  return clean<IRTextStyle>({
    color: color(d["color"]),
    fontSize: px(d["font-size"]),
    fontWeight: weight(d["font-weight"]),
    fontStyle: style === "italic" || style === "normal" ? style : undefined,
    textAlign: align(d["text-align"]),
  });
}

const hidden = (d: Decls) => (d["display"]?.trim() === "none" ? true : undefined);

/** Device overrides: box and hidden from the element's own string, text from its text string (if any). */
function devices(boxCss: ParsedCss, textCss?: ParsedCss): IRDevices | undefined {
  const one = (k: "tablet" | "mobile"): IRDeviceOverride | undefined =>
    clean<IRDeviceOverride>({
      box: box(boxCss[k]),
      text: textCss ? text(textCss[k]) : undefined,
      hidden: hidden(boxCss[k]),
    });
  return clean<IRDevices>({ tablet: one("tablet"), mobile: one("mobile") });
}

function leaf(w: WireLeaf): IRLeaf {
  switch (w.kind) {
    case "hero": {
      const c = parseCss(w.css);
      const h = parseCss(w.headingCss);
      return clean({
        kind: "hero" as const,
        heading: w.heading,
        headingLevel: w.headingLevel,
        text: w.text,
        cta: w.cta,
        style: box(c.base),
        headingStyle: text(h.base),
        textStyle: text(parseCss(w.textCss).base),
        devices: devices(c, h),
      }) as IRLeaf;
    }
    case "rich-text": {
      const c = parseCss(w.css);
      return clean({
        kind: "rich-text" as const,
        parts: w.parts.map((p) => {
          const t = parseCss(p.css);
          const dev = clean<IRDevices>({
            tablet: clean<IRDeviceOverride>({ text: text(t.tablet), hidden: hidden(t.tablet) }),
            mobile: clean<IRDeviceOverride>({ text: text(t.mobile), hidden: hidden(t.mobile) }),
          });
          return clean<RichTextPart>({ ref: p.ref, as: p.as, style: text(t.base), devices: dev })!;
        }),
        style: box(c.base),
        devices: devices(c),
      }) as IRLeaf;
    }
    case "image": {
      const c = parseCss(w.css);
      return clean({
        kind: "image" as const,
        image: w.image,
        maxWidth: px(c.base["max-width"] ?? c.base["width"]),
        caption: w.caption,
        style: box(c.base),
        devices: devices(c),
      }) as IRLeaf;
    }
    case "call-to-action": {
      const c = parseCss(w.css);
      const b = parseCss(w.buttonCss);
      return clean({
        kind: "call-to-action" as const,
        label: w.label,
        href: w.href,
        buttonColor: color(b.base["background-color"] ?? b.base["background"]),
        labelColor: color(b.base["color"]),
        style: box(c.base),
        devices: devices(c),
      }) as IRLeaf;
    }
    case "testimonial": {
      const c = parseCss(w.css);
      return clean({
        kind: "testimonial" as const,
        quote: w.quote,
        author: w.author,
        style: box(c.base),
        textStyle: text(parseCss(w.textCss).base),
        devices: devices(c),
      }) as IRLeaf;
    }
    case "lead-form":
      return { kind: "lead-form", form: w.form };
  }
}

function row(w: WireIR["sections"][number]["rows"][number]): IRRow {
  if (w.kind === "blocks") return { kind: "blocks", blocks: w.blocks.map(leaf) };
  const c = parseCss(w.css);
  return clean({
    kind: "columns" as const,
    columns: w.columns.map((col) => {
      const cc = parseCss(col.css);
      return clean({ blocks: col.blocks.map(leaf), style: box(cc.base, true), devices: devices(cc) })!;
    }),
    gap: px(c.base["gap"] ?? c.base["column-gap"]),
    devices: devices(c),
  }) as IRRow;
}

/**
 * A banner photo belongs to the section (the band that spans the page): when
 * the model puts `background-image` on the hero rather than on its section,
 * it is lifted there, unless the section already has one.
 */
function heroBackground(w: WireIR["sections"][number]): string | undefined {
  for (const r of w.rows) {
    const leaves = r.kind === "blocks" ? r.blocks : r.columns.flatMap((c) => c.blocks);
    for (const l of leaves) {
      if (l.kind !== "hero") continue;
      const image = box(parseCss(l.css).base, true)?.backgroundImage;
      if (image) return image;
    }
  }
  return undefined;
}

function section(w: WireIR["sections"][number]): IRSection {
  const c = parseCss(w.css);
  const style = box(c.base, true);
  const lifted = style?.backgroundImage ? undefined : heroBackground(w);
  return clean({
    source: w.source,
    rows: w.rows.map(row),
    style: lifted ? { ...style, backgroundImage: lifted } : style,
    contentMaxWidth: px(c.base["max-width"]),
    devices: devices(c),
  }) as IRSection;
}

/** The model's wire output → the structured Import IR the serializer consumes. */
export function fromWire(w: WireIR): ImportIR {
  return {
    sections: w.sections.map(section),
    sourceHadMobileLayout: w.sourceHadMobileLayout,
    simplified: w.simplified,
    omitted: w.omitted,
  };
}
