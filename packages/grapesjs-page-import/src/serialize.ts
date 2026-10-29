import { checkAccessibility, type A11yFinding, type A11yItem } from "./a11y";
import type {
  IRBoxStyle,
  IRDeviceOverride,
  IRDevices,
  IRLeaf,
  IRRow,
  IRSection,
  IRTextStyle,
  ImportIR,
} from "./ir";
import {
  COLUMNS_STYLE,
  COLUMN_STYLE,
  DEVICE_BREAKPOINTS,
  LAYOUT_MARKERS,
  LAYOUT_TYPES,
  MAX_COLUMNS,
  SECTION_INNER_ATTR,
  SECTION_INNER_STYLE,
  SECTION_STYLE,
  type Style,
} from "./layout";

/**
 * Import IR + DOM extract → native GrapesJS content (012-url-page-import,
 * contracts/import-ir.md, research R13/R15). Pure: no GrapesJS, no Payload,
 * so it runs in the CMS job and in unit tests alike.
 *
 * Output is what the editor itself would store for a page built by hand from
 * the block library: `projectData` (component JSON with explicit types, so
 * every text is editable in place) plus the matching `html`/`css` exports.
 * Styles live where GrapesJS keeps them — `#<id>` rules in
 * `projectData.styles`, device adjustments under the editor's own Tablet /
 * Mobile portrait media conditions — never as inline `style` attributes
 * (GrapesJS would give those random ids on load).
 *
 * Guarantees (tested): only renderer-allow-listed markup; every text is a
 * DOM-extract text byte for byte; unknown refs are dropped and reported;
 * invalid style values are dropped, never passed through.
 */

// ---------------------------------------------------------------- extract

export type Box = { x: number; y: number; width: number; height: number };
/** What differs at a narrower width, for one extracted element (same DOM, resized). */
export type DeviceDiff = { box?: Box; hidden?: boolean; style?: Record<string, string> };
export type ExtractDevices = { tablet?: DeviceDiff; mobile?: DeviceDiff };

export type ExtractText = {
  id: string;
  /** Source tag: h1–h6, p, li, a, button, span… */
  tag: string;
  /**
   * Visible content as safe inline markup only (`b strong i em u s br a[href]`),
   * escaped the way GrapesJS exports text (see `isSafeInlineHtml`).
   */
  html: string;
  /** Absolute target, for links and link-like buttons. */
  href?: string;
  box: Box;
  style: Record<string, string>;
  devices?: ExtractDevices;
};

export type ExtractImage = {
  id: string;
  kind: "img" | "background";
  /** Largest first: currentSrc, srcset entries, src, or the CSS url(). */
  candidates: string[];
  alt: string | null;
  box: Box;
  devices?: ExtractDevices;
};

export type ExtractFormField = {
  name?: string;
  label: string;
  /** Input type (`email`, `radio`…), or `select` / `textarea`. */
  type: string;
  required: boolean;
  /** `select` choices, placeholder choices (empty value) left out. */
  options?: string[];
  /** Radio buttons and checkboxes: the legend of their `<fieldset>`. */
  group?: string;
};
export type ExtractForm = {
  id: string;
  box: Box;
  fields: ExtractFormField[];
  /** Text of the form's submit button. */
  submitLabel?: string;
};

export type PageExtract = {
  url: string;
  viewport: { width: number; height: number };
  texts: ExtractText[];
  images: ExtractImage[];
  forms: ExtractForm[];
  unsupported: { kind: string; box: Box }[];
  fonts: string[];
};

// ---------------------------------------------------------------- report

export type DeviceCheck = {
  device: "desktop" | "tablet" | "mobileLandscape" | "mobilePortrait";
  kind: "horizontal-scroll" | "small-text" | "small-target" | "overflow";
  where: string;
  detail?: string;
};

/**
 * 023-admin-i18n (data-model.md) — a report line Trefle writes is a key of the
 * admin catalogue with its values, shown in the reader's language; a plain
 * string is shown as written (AI lines, reports made before 023).
 */
export type ReportText = string | { key: string; values?: Record<string, string | number> };

/**
 * The French of the lines this package writes — the admin catalogue repeats
 * it under the same keys (apps/cms `imports.report`, checked by a test).
 */
export const REPORT_TEXT_FR: Record<string, string> = {
  "imports.report.missingElement": "{{where}} (élément {{ref}} introuvable dans la page source)",
  "imports.report.emptyAfterConversion": "{{where}} (vide après conversion)",
  "imports.report.extraForm": "Formulaire supplémentaire de la page source{{fields}}",
  "imports.report.formOnFreePage": "Formulaire de la page source{{fields}} : une page libre ne peut pas porter de formulaire",
  "imports.report.formOnConfirmationPage": "Formulaire de la page source{{fields}} : une page de confirmation ne peut pas porter de formulaire",
  "imports.report.addFormBlock": "Ajouter un bloc Formulaire à l'endroit voulu et configurer ses champs",
  "imports.report.backgroundsOne": "1 image de fond",
  "imports.report.backgroundsMany": "{{n}} images de fond",
  "imports.report.backgroundsHow": "non importée(s) : la couleur de fond est conservée",
  "imports.report.describeOne": "Décrire l'image marquée « À décrire » dans la médiathèque",
  "imports.report.describeMany": "Décrire les {{n}} images marquées « À décrire » dans la médiathèque",
  "imports.report.placeholdersOne": "Remplacer l'image provisoire par une image de la médiathèque",
  "imports.report.placeholdersMany": "Remplacer les {{n}} images provisoires par des images de la médiathèque",
};

/** A line as text: keyed lines through `texts` (French by default), plain strings as written. */
export function reportText(line: ReportText, texts: Record<string, string> = REPORT_TEXT_FR): string {
  if (typeof line === "string") return line;
  const template = texts[line.key] ?? line.key;
  return template.replace(/\{\{(\w+)\}\}/g, (all, name: string) => (line.values && name in line.values ? String(line.values[name]) : all));
}

/** A report whose lines are all text. */
export type TextReport = Omit<ImportReport, "simplified" | "omitted" | "actionsBeforePublish" | "formFieldsUnmapped"> & {
  simplified: { what: string; how: string }[];
  omitted: { what: string; reason: string }[];
  actionsBeforePublish: string[];
  formFieldsUnmapped?: string[];
};

/** The report with every line as French text (tests, plain-text uses). */
export function reportInFrench(report: ImportReport): TextReport {
  const { formFieldsUnmapped, ...rest } = report;
  return {
    ...rest,
    simplified: report.simplified.map((s) => ({ what: reportText(s.what), how: reportText(s.how) })),
    omitted: report.omitted.map((o) => ({ ...o, what: reportText(o.what) })),
    actionsBeforePublish: report.actionsBeforePublish.map((a) => reportText(a)),
    ...(formFieldsUnmapped ? { formFieldsUnmapped: formFieldsUnmapped.map((f) => reportText(f)) } : {}),
  };
}

export type ImportReport = {
  finalUrl: string;
  reproduced: { sections: number; columns: number; blocks: Record<string, number>; images: number };
  simplified: { what: ReportText; how: ReportText }[];
  omitted: { what: ReportText; reason: string }[];
  failedImages: { sourceUrl: string; reason: "unreachable" | "too-large" | "not-an-image" }[];
  fontSubstitutions: string[];
  accessibility: A11yFinding[];
  deviceChecks: DeviceCheck[];
  sourceHadMobileLayout: boolean;
  actionsBeforePublish: ReportText[];
  formFieldsUnmapped?: ReportText[];
  /** The language of the AI-written lines (absent: French, before 023). */
  language?: "fr" | "en";
};

// ---------------------------------------------------------------- options / result

/** A block of the editor's library (apps/cms/src/fields/grapesjs/blocks.ts `GJS_BLOCKS`). */
export type BlockDef = { id: string; content: string | Record<string, unknown> };

export type SerializeOptions = {
  pageType: "subscription" | "free" | "confirmation";
  /** The editor's block library, so imported blocks have the exact library shapes. */
  blocks: BlockDef[];
  /**
   * Image ref → stored Media (images step). Missing → the Image block's
   * placeholder. `altPending`: stored without a description ("À décrire"),
   * so the page gets `alt=""` until the editor writes one.
   */
  media?: Record<string, { url: string; alt: string; altPending?: boolean }>;
  /** Images the images step could not fetch or fit, for the report. */
  failedImages?: ImportReport["failedImages"];
  finalUrl?: string;
};

export type ProjectData = {
  assets: unknown[];
  styles: StyleRule[];
  pages: { frames: { component: ComponentJson }[] }[];
};
type StyleRule = { selectors: string[]; selectorsAdd?: string; style: Style; mediaText?: string; atRuleType?: "media" };
type ComponentJson = {
  [prop: string]: unknown;
  type?: string;
  tagName?: string;
  attributes?: Record<string, string>;
  components?: ComponentJson[] | string;
};

export type SerializeResult = {
  projectData: ProjectData;
  html: string;
  css: string;
  report: ImportReport;
  /** Text refs placed, in document order. */
  textsUsed: string[];
  /** Image refs placed (content images and section backgrounds). */
  imagesPlaced: string[];
  /** The source form ("f…") the lead-form block stands for, when one was placed. */
  leadForm: string | null;
};

// ---------------------------------------------------------------- safe values

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const color = (v: unknown): string | undefined =>
  typeof v === "string" && COLOR_RE.test(v) ? v.toLowerCase() : undefined;
const px = (v: unknown, min: number, max: number): string | undefined =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? `${v}px` : undefined;

const BOX_PX: [min: number, max: number] = [0, 400];
const FONT_PX: [min: number, max: number] = [10, 96];
const WIDTH_PX: [min: number, max: number] = [240, 1920];
const IMAGE_PX: [min: number, max: number] = [40, 1920];

const SAFE_HREF_RE = /^(?:https?:\/\/|mailto:|tel:|#)/i;
const safeHref = (href: string | undefined): string | undefined =>
  href && SAFE_HREF_RE.test(href) && !/[\s<>"]/.test(href) ? href : undefined;

/**
 * The only markup a text may carry: escaped text (`&amp; &lt; &gt;`, as
 * GrapesJS exports it) and `b strong i em u s`, `<br/>`, `<a href="…">` with
 * a safe, attribute-escaped target. Anything else means the extract was not
 * produced by our filter, and the text is dropped rather than trusted.
 */
export function isSafeInlineHtml(html: string): boolean {
  const token = /<\/?(?:b|strong|i|em|u|s)>|<br\/>|<a href="(?:https?:\/\/|mailto:|tel:|#)[^"<>\s]*">|<\/a>|[^<>&]+|&(?:amp|lt|gt);/gy;
  let pos = 0;
  while (pos < html.length) {
    token.lastIndex = pos;
    const m = token.exec(html);
    if (!m) return false;
    pos = token.lastIndex;
  }
  return true;
}

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const plainText = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function boxCss(s: Omit<IRBoxStyle, "backgroundImage"> | undefined): Style {
  const out: Style = {};
  if (!s) return out;
  const bg = color(s.backgroundColor);
  if (bg) out["background-color"] = bg;
  for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
    const v = px(s[`padding${side}`], ...BOX_PX);
    if (v) out[`padding-${side.toLowerCase()}`] = v;
  }
  const radius = px(s.borderRadius, ...BOX_PX);
  if (radius) out["border-radius"] = radius;
  if (s.textAlign && ["left", "center", "right"].includes(s.textAlign)) out["text-align"] = s.textAlign;
  return out;
}

function textCss(s: IRTextStyle | undefined): Style {
  const out: Style = {};
  if (!s) return out;
  const c = color(s.color);
  if (c) out.color = c;
  const size = px(s.fontSize, ...FONT_PX);
  if (size) out["font-size"] = size;
  if (s.fontWeight && [400, 500, 600, 700, 800].includes(s.fontWeight)) out["font-weight"] = String(s.fontWeight);
  if (s.fontStyle === "normal" || s.fontStyle === "italic") out["font-style"] = s.fontStyle;
  if (s.textAlign && ["left", "center", "right"].includes(s.textAlign)) out["text-align"] = s.textAlign;
  return out;
}

function parseStyle(s: string | undefined): Style {
  const out: Style = {};
  for (const decl of (s ?? "").split(";")) {
    const i = decl.indexOf(":");
    if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

// ---------------------------------------------------------------- library block shapes

type BlockShape = { tag: string; style: Style; linkStyle: Style; imgStyle: Style; placeholderSrc: string };

/** Wrapper tag and default styles of a library block, read from its definition. */
function shapeOf(blocks: BlockDef[], id: string): BlockShape {
  const def = blocks.find((b) => b.id === id);
  const shape: BlockShape = { tag: "div", style: {}, linkStyle: {}, imgStyle: {}, placeholderSrc: "" };
  if (!def) return shape;
  if (typeof def.content !== "string") {
    const c = def.content as { tagName?: string; style?: Style };
    return { ...shape, tag: c.tagName ?? "div", style: { ...(c.style ?? {}) } };
  }
  const root = /^\s*<([a-z0-9]+)\b([^>]*)>/i.exec(def.content);
  shape.tag = root?.[1]?.toLowerCase() ?? "div";
  shape.style = parseStyle(/style="([^"]*)"/.exec(root?.[2] ?? "")?.[1]);
  shape.linkStyle = parseStyle(/<a\b[^>]*style="([^"]*)"/i.exec(def.content)?.[1]);
  const img = /<img\b([^>]*)>/i.exec(def.content)?.[1] ?? "";
  shape.imgStyle = parseStyle(/style="([^"]*)"/.exec(img)?.[1]);
  shape.placeholderSrc = /src="([^"]*)"/.exec(img)?.[1] ?? "";
  return shape;
}

// ---------------------------------------------------------------- nodes

type DeviceStyles = { tablet?: Style; mobile?: Style };

type Node = {
  tag: string;
  type?: string;
  attrs: [string, string][];
  /** Child nodes, or a text's safe inline markup. */
  children: Node[] | string;
  id?: string;
  /** Extra component properties (the lead-form block's `droppable`/`editable`). */
  props?: Record<string, unknown>;
};

const VOID = new Set(["img", "br"]);

function toHtml(n: Node): string {
  const attrs = [...n.attrs, ...(n.id ? ([["id", n.id]] as [string, string][]) : [])]
    .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
    .join("");
  if (VOID.has(n.tag)) return `<${n.tag}${attrs}/>`;
  const inner = typeof n.children === "string" ? n.children : n.children.map(toHtml).join("");
  return `<${n.tag}${attrs}>${inner}</${n.tag}>`;
}

function toComponent(n: Node): ComponentJson {
  const c: ComponentJson = { tagName: n.tag };
  if (n.type) c.type = n.type;
  const attributes = Object.fromEntries([...n.attrs, ...(n.id ? [["id", n.id]] : [])]);
  if (Object.keys(attributes).length) c.attributes = attributes;
  if (!VOID.has(n.tag)) c.components = typeof n.children === "string" ? n.children : n.children.map(toComponent);
  return { ...c, ...n.props };
}

const cssBlock = (rules: StyleRule[]) =>
  rules
    .map((r) => `${[...r.selectors, ...(r.selectorsAdd ? [r.selectorsAdd] : [])].join(",")}{${Object.entries(r.style).map(([k, v]) => `${k}:${v};`).join("")}}`)
    .join("");

// ---------------------------------------------------------------- serializer

const HEADING_SIZES: Record<string, number> = { h1: 32, h2: 24, h3: 18.72, h4: 16 };
const GENERIC_FONTS = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "-apple-system",
  "blinkmacsystemfont",
  "emoji",
  "math",
  "inherit",
  "initial",
]);

export function serializeImport(ir: ImportIR, extract: PageExtract, options: SerializeOptions): SerializeResult {
  const texts = new Map(extract.texts.map((t) => [t.id, t]));
  const images = new Map(extract.images.map((i) => [i.id, i]));
  const shapes = Object.fromEntries(
    ["hero", "rich-text", "image", "call-to-action", "testimonial"].map((id) => [id, shapeOf(options.blocks, id)]),
  ) as Record<"hero" | "rich-text" | "image" | "call-to-action" | "testimonial", BlockShape>;

  const baseRules: StyleRule[] = [];
  const tabletRules: StyleRule[] = [];
  const mobileRules: StyleRule[] = [];
  const report: ImportReport = {
    finalUrl: options.finalUrl ?? extract.url,
    reproduced: { sections: 0, columns: 0, blocks: {}, images: 0 },
    simplified: ir.simplified.map((s) => ({ what: s.what, how: s.how })),
    omitted: ir.omitted.map((o) => ({ what: o.what, reason: o.reason })),
    failedImages: [],
    fontSubstitutions: [],
    accessibility: [],
    deviceChecks: [],
    sourceHadMobileLayout: ir.sourceHadMobileLayout,
    actionsBeforePublish: [],
  };
  const a11y: A11yItem[] = [];
  const textsUsed: string[] = [];
  const imagesPlaced: string[] = [];
  let placeholders = 0;
  let droppedBackgrounds = 0;
  let nextId = 1;

  // Lead form (FR-016/FR-017): on a subscription page the most prominent of
  // the forms the IR places becomes the library's lead-form block; every
  // other source form is reported.
  const forms = new Map(extract.forms.map((f) => [f.id, f]));
  const placedForms = placedFormRefs(ir).filter((ref) => forms.has(ref));
  const keptForm =
    options.pageType === "subscription" ? prominentForm(placedForms.map((ref) => forms.get(ref)!))?.id ?? null : null;
  let leadFormPlaced = false;

  /** An element, with its styles stored as GrapesJS id rules. */
  const el = (
    tag: string,
    opts: { type?: string; attrs?: [string, string][]; base?: Style; devices?: DeviceStyles },
    children: Node[] | string,
  ): Node => {
    const node: Node = { tag, type: opts.type, attrs: opts.attrs ?? [], children };
    const base = opts.base ?? {};
    const tablet = opts.devices?.tablet ?? {};
    const mobile = opts.devices?.mobile ?? {};
    if (Object.keys(base).length || Object.keys(tablet).length || Object.keys(mobile).length) {
      node.id = `imp-${nextId++}`;
      const sel = [`#${node.id}`];
      if (Object.keys(base).length) baseRules.push({ selectors: sel, style: base });
      if (Object.keys(tablet).length) {
        tabletRules.push({ selectors: sel, style: tablet, mediaText: DEVICE_BREAKPOINTS.tablet, atRuleType: "media" });
      }
      if (Object.keys(mobile).length) {
        mobileRules.push({
          selectors: sel,
          style: mobile,
          mediaText: DEVICE_BREAKPOINTS.mobilePortrait,
          atRuleType: "media",
        });
      }
    }
    return node;
  };

  /** Device adjustments as CSS, minus anything equal to the value it would inherit. */
  const deviceStyles = (
    base: Style,
    devices: IRDevices | undefined,
    pick: (o: IRDeviceOverride) => Style,
  ): DeviceStyles => {
    const diff = (wanted: Style, inherited: Style) =>
      Object.fromEntries(Object.entries(wanted).filter(([k, v]) => inherited[k] !== v));
    const resolve = (o: IRDeviceOverride | undefined): Style =>
      o ? { ...pick(o), ...(o.hidden ? { display: "none" } : {}) } : {};
    const tablet = diff(resolve(devices?.tablet), base);
    const mobile = diff(resolve(devices?.mobile), { ...base, ...tablet });
    return { tablet, mobile };
  };
  const boxDevices = (base: Style, d: IRDevices | undefined) => deviceStyles(base, d, (o) => boxCss(o.box));
  const textDevices = (base: Style, d: IRDevices | undefined) =>
    deviceStyles(base, d ? { tablet: stripHidden(d.tablet), mobile: stripHidden(d.mobile) } : undefined, (o) =>
      textCss(o.text),
    );

  const drop = (where: string, ref: string) =>
    report.omitted.push({ what: { key: "imports.report.missingElement", values: { where, ref } }, reason: "other" });

  /** A source text, if the ref exists and its markup is safe. */
  const textOf = (ref: string | undefined, where: string) => {
    if (!ref) return null;
    const t = texts.get(ref);
    if (!t || !t.html.trim() || !isSafeInlineHtml(t.html)) {
      drop(where, ref);
      return null;
    }
    textsUsed.push(ref);
    return t;
  };

  const countBlock = (kind: string) => {
    report.reproduced.blocks[kind] = (report.reproduced.blocks[kind] ?? 0) + 1;
  };

  /** A text element, recorded for the accessibility checks. */
  const textEl = (
    tag: string,
    t: ExtractText,
    ctx: { background: string; color?: string },
    style: Style,
    devices: DeviceStyles,
    where: string,
  ): Node => {
    a11y.push({
      kind: "text",
      tag,
      color: style.color ?? ctx.color ?? "#000000",
      background: ctx.background,
      fontSize: style["font-size"] ? parseFloat(style["font-size"]) : HEADING_SIZES[tag] ?? 16,
      bold: style["font-weight"] ? Number(style["font-weight"]) >= 700 : tag in HEADING_SIZES,
      where,
    });
    const node = el(tag, { type: "text", base: style, devices }, t.html);
    // A text that is one link as a whole (a card title) looks like the
    // source's text, not like a default blue underlined link.
    if (/^<a href="[^"]*">[\s\S]*<\/a>$/.test(t.html.trim())) {
      node.id ??= `imp-${nextId++}`;
      baseRules.push({ selectors: [], selectorsAdd: `#${node.id} a`, style: { color: "inherit", "text-decoration": "none" } });
    }
    return node;
  };

  const background = (box: Style, parent: string) => box["background-color"] ?? parent;

  /** The library's lead-form block, exactly as dragging it in would make it (id `form`, style as a `#form` rule). */
  const leadFormNode = (): Node => {
    const def = options.blocks.find((d) => d.id === "lead-form")?.content;
    const c = (def && typeof def === "object" ? def : {}) as {
      tagName?: string;
      attributes?: Record<string, string>;
      style?: Style;
      [prop: string]: unknown;
    };
    const { tagName, attributes, style, components: _components, ...props } = c;
    const attrs = Object.entries(attributes ?? { "data-block": "lead-form", id: "form" });
    const id = attrs.find(([k]) => k === "id")?.[1] ?? "form";
    if (style && Object.keys(style).length) baseRules.push({ selectors: [`#${id}`], style: { ...style } });
    countBlock("lead-form");
    return { tag: tagName ?? "div", attrs: attrs.filter(([k]) => k !== "id"), children: [], id, props };
  };

  const leaf = (b: IRLeaf, bg: string, where: string): Node | null => {
    if (b.kind === "lead-form") {
      if (b.form !== keptForm || leadFormPlaced) return null; // reported below
      leadFormPlaced = true;
      return leadFormNode();
    }
    const shape = shapes[b.kind];
    const box = { ...shape.style, ...boxCss(b.style) };
    const inner = background(boxCss(b.style), bg);
    const label = `${where} › ${LEAF_LABELS[b.kind]}`;

    if (b.kind === "hero") {
      const heading = textOf(b.heading, `${label} › titre`);
      if (!heading) return null;
      const tag = `h${b.headingLevel === 2 ? 2 : 1}`;
      const hStyle = textCss(b.headingStyle);
      const children = [
        textEl(tag, heading, { background: inner }, hStyle, textDevices(hStyle, b.devices), `${label} › titre`),
      ];
      const pStyle = textCss(b.textStyle);
      for (const ref of b.text ?? []) {
        const t = textOf(ref, `${label} › texte`);
        if (t) children.push(textEl("p", t, { background: inner }, pStyle, { tablet: {}, mobile: {} }, `${label} › texte`));
      }
      if (b.cta) {
        const link = ctaLink(b.cta.label, b.cta.href, undefined, undefined, `${label} › bouton`);
        if (link) children.push(link);
      }
      countBlock("hero");
      return el(shape.tag, { attrs: [["data-block", "hero"]], base: box, devices: boxDevices(box, b.devices) }, children);
    }

    if (b.kind === "rich-text") {
      const children: Node[] = [];
      // A run of consecutive list items becomes one ul/ol.
      const list: { tag: "ul" | "ol" | null; items: Node[] } = { tag: null, items: [] };
      const flush = () => {
        if (list.tag && list.items.length) children.push(el(list.tag, {}, list.items));
        list.tag = null;
        list.items = [];
      };
      for (const part of b.parts) {
        const t = textOf(part.ref, `${label} › paragraphe`);
        if (!t) continue;
        const style = textCss(part.style);
        const devices = textDevices(style, part.devices);
        const hidden = hiddenStyles(part.devices);
        const merged = { tablet: { ...devices.tablet, ...hidden.tablet }, mobile: { ...devices.mobile, ...hidden.mobile } };
        const ctx = { background: inner };
        if (part.as === "li-ul" || part.as === "li-ol") {
          const tag = part.as === "li-ul" ? "ul" : "ol";
          if (list.tag !== tag) flush();
          list.tag = tag;
          list.items.push(textEl("li", t, ctx, style, merged, label));
        } else {
          flush();
          children.push(textEl(part.as, t, ctx, style, merged, label));
        }
      }
      flush();
      if (!children.length) return null;
      // The library's text block is a centred 720px reading column; in an
      // imported page the section already sets the content width, and a
      // centred column would shift a title away from the cards under it.
      delete box["max-width"];
      delete box.margin;
      countBlock("rich-text");
      return el(shape.tag, { attrs: [["data-block", "rich-text"]], base: box, devices: boxDevices(box, b.devices) }, children);
    }

    if (b.kind === "image") {
      const source = images.get(b.image);
      if (!source) {
        drop(`${label}`, b.image);
        return null;
      }
      const media = options.media?.[b.image];
      imagesPlaced.push(b.image);
      if (!media) placeholders += 1;
      a11y.push({ kind: "image", alt: source.alt, where: label });
      // The model's width, else the one measured in the source: an image keeps
      // its size relative to the rest instead of filling its column.
      const width = px(b.maxWidth, ...IMAGE_PX) ?? px(Math.round(source.box.width), ...IMAGE_PX);
      const imgStyle = { ...shape.imgStyle, ...(width ? { width } : {}) };
      const children: Node[] = [
        el(
          "img",
          {
            type: "image",
            attrs: [
              ["src", media?.url ?? shape.placeholderSrc],
              ["alt", media && !media.altPending ? media.alt : ""],
            ],
            base: imgStyle,
          },
          [],
        ),
      ];
      if (b.caption) {
        const t = textOf(b.caption, `${label} › légende`);
        if (t) children.push(textEl("figcaption", t, { background: inner }, {}, textDevices({}, b.devices), `${label} › légende`));
      }
      report.reproduced.images += 1;
      countBlock("image");
      return el(shape.tag, { attrs: [["data-block", "image"]], base: box, devices: boxDevices(box, b.devices) }, children);
    }

    if (b.kind === "call-to-action") {
      const link = ctaLink(b.label, b.href, b.buttonColor, b.labelColor, label, b.devices);
      if (!link) return null;
      countBlock("call-to-action");
      return el(
        shape.tag,
        { attrs: [["data-block", "call-to-action"]], base: box, devices: boxDevices(box, b.devices) },
        [link],
      );
    }

    // testimonial
    const quote = textOf(b.quote, `${label} › citation`);
    if (!quote) return null;
    const tStyle = textCss(b.textStyle);
    const children = [textEl("p", quote, { background: inner }, tStyle, textDevices(tStyle, b.devices), `${label} › citation`)];
    if (b.author) {
      const t = textOf(b.author, `${label} › auteur`);
      if (t) children.push(textEl("p", t, { background: inner }, tStyle, { tablet: {}, mobile: {} }, `${label} › auteur`));
    }
    countBlock("testimonial");
    return el(shape.tag, { attrs: [["data-block", "testimonial"]], base: box, devices: boxDevices(box, b.devices) }, children);
  };

  /** The call-to-action button: the library block's link, recoloured if asked. */
  function ctaLink(
    labelRef: string,
    hrefRef: string,
    buttonColor: string | undefined,
    labelColor: string | undefined,
    where: string,
    devices?: IRDevices,
  ): Node | null {
    const label = textOf(labelRef, where);
    if (!label) return null;
    const target = texts.get(hrefRef);
    const href = safeHref(target?.href);
    if (!href) {
      drop(`${where} (lien)`, hrefRef);
      return null;
    }
    const style = { ...shapes["call-to-action"].linkStyle };
    const bg = color(buttonColor);
    const fg = color(labelColor);
    if (bg) style.background = bg;
    if (fg) style.color = fg;
    const text = plainText(label.html);
    a11y.push({ kind: "link", text, where });
    a11y.push({
      kind: "text",
      tag: "a",
      color: color(style.color) ?? expandShortHex(style.color) ?? "#ffffff",
      background: color(style.background) ?? expandShortHex(style.background) ?? "#047857",
      fontSize: 16,
      where,
    });
    return el("a", { type: "link", attrs: [["href", href]], base: style, devices: textDevices(style, devices) }, label.html);
  }

  /** Width spanned in the source by what the section places (desktop boxes), if measurable. */
  const sectionSpan = (s: IRSection): number | undefined => {
    const boxes: Box[] = [];
    const add = (ref: string | undefined) => {
      const b = ref ? (texts.get(ref) ?? images.get(ref))?.box : undefined;
      if (b && b.width > 0 && b.height > 0) boxes.push(b);
    };
    const leaves = (blocks: IRLeaf[]) =>
      blocks.forEach((b) => {
        if (b.kind === "hero") [b.heading, ...(b.text ?? []), b.cta?.label].forEach(add);
        else if (b.kind === "rich-text") b.parts.forEach((p) => add(p.ref));
        else if (b.kind === "image") [b.image, b.caption].forEach(add);
        else if (b.kind === "call-to-action") add(b.label);
        else if (b.kind === "testimonial") [b.quote, b.author].forEach(add);
      });
    for (const r of s.rows) {
      if (r.kind === "blocks") leaves(r.blocks);
      else
        r.columns.forEach((c) => {
          add(c.style?.backgroundImage);
          leaves(c.blocks);
        });
    }
    if (boxes.length < 2) return undefined;
    return Math.round(Math.max(...boxes.map((b) => b.x + b.width)) - Math.min(...boxes.map((b) => b.x)));
  };

  const sectionNode = (s: IRSection, index: number): Node | null => {
    const where = s.source?.trim() ? `Section « ${s.source.trim()} »` : `Section ${index + 1}`;
    const box: Style = { ...SECTION_STYLE, ...boxCss(s.style) };
    let bg = background(boxCss(s.style), "#ffffff");
    if (s.style?.backgroundImage) {
      const ref = s.style.backgroundImage;
      const media = images.has(ref) ? options.media?.[ref] : undefined;
      if (media) {
        box["background-image"] = `url(${media.url})`;
        box["background-size"] = "cover";
        box["background-position"] = "center";
        imagesPlaced.push(ref);
        bg = "image";
      } else {
        droppedBackgrounds += 1;
      }
    }
    const rows = s.rows.flatMap((r) => rowNodes(r, bg, where));
    if (!rows.length) {
      report.omitted.push({ what: { key: "imports.report.emptyAfterConversion", values: { where } }, reason: "other" });
      return null;
    }
    const innerStyle: Style = { ...SECTION_INNER_STYLE };
    // Content width: measured on the source (the span of the section's texts
    // and images) rather than the model's estimate, which can be far off and
    // then blows every card and image of the section up.
    const maxWidth = px(sectionSpan(s), ...WIDTH_PX) ?? px(s.contentMaxWidth, ...WIDTH_PX);
    if (maxWidth) innerStyle["max-width"] = maxWidth;
    const inner = el(
      "div",
      { type: LAYOUT_TYPES.sectionInner, attrs: [[SECTION_INNER_ATTR, ""]], base: innerStyle },
      rows,
    );
    report.reproduced.sections += 1;
    return el(
      "section",
      {
        type: LAYOUT_TYPES.section,
        attrs: [["data-block", LAYOUT_MARKERS.section]],
        base: box,
        devices: boxDevices(box, s.devices),
      },
      [inner],
    );
  };

  const rowNodes = (r: IRRow, bg: string, where: string): Node[] => {
    if (r.kind === "blocks") return r.blocks.map((b) => leaf(b, bg, where)).filter((n): n is Node => n !== null);
    // More than four columns in the source → several rows of at most four (FR-023).
    const out: Node[] = [];
    for (let i = 0; i < r.columns.length; i += MAX_COLUMNS) {
      const chunk = r.columns.slice(i, i + MAX_COLUMNS);
      const cols = chunk
        .map((c) => {
          let cBox = { ...COLUMN_STYLE, ...boxCss(c.style) };
          let cDevices = c.devices;
          let cBg = background(boxCss(c.style), bg);
          // A card whose text sits on a photo: the photo is the column's background.
          if (c.style?.backgroundImage) {
            const ref = c.style.backgroundImage;
            const source = images.get(ref);
            const media = source ? options.media?.[ref] : undefined;
            if (media) {
              Object.assign(cBox, { "background-image": `url(${media.url})`, "background-size": "cover", "background-position": "center" });
              // The card keeps its photo's shape in the source, text at the
              // bottom, instead of a tall spacer above the text (the model
              // tends to fake the photo's height with padding-top).
              const ratio = aspectRatio(source!.box);
              if (ratio) {
                cBox = { ...cBox, ...photoCardStyle(cBox), "aspect-ratio": ratio };
                cDevices = withoutPaddingTop(c.devices);
              }
              imagesPlaced.push(ref);
              cBg = "image";
            } else {
              droppedBackgrounds += 1;
            }
          }
          const blocks = c.blocks.map((b) => leaf(b, cBg, where)).filter((n): n is Node => n !== null);
          return { blocks, node: () => el("div", { type: LAYOUT_TYPES.column, attrs: [["data-block", LAYOUT_MARKERS.column]], base: cBox, devices: boxDevices(cBox, cDevices) }, blocks) };
        })
        .filter((c) => c.blocks.length > 0);
      if (cols.length === 0) continue;
      if (cols.length === 1) {
        out.push(...cols[0]!.blocks);
        continue;
      }
      const style = { ...COLUMNS_STYLE };
      const gap = px(r.gap, ...BOX_PX);
      if (gap) style.gap = gap;
      report.reproduced.columns += 1;
      out.push(
        el(
          "div",
          {
            type: LAYOUT_TYPES.columns,
            attrs: [
              ["data-block", LAYOUT_MARKERS.columns],
              ["data-cols", String(cols.length)],
            ],
            base: style,
            devices: boxDevices(style, r.devices),
          },
          cols.map((c) => c.node()),
        ),
      );
    }
    return out;
  };

  const sections = ir.sections.map(sectionNode).filter((n): n is Node => n !== null);

  // Forms: whatever didn't become the lead form is reported (FR-016, FR-017).
  const formLabel = (f: ExtractForm) => {
    const fields = f.fields.map((x) => x.label).filter(Boolean).slice(0, 3).join(", ");
    return fields ? ` (${fields})` : "";
  };
  for (const form of extract.forms) {
    if (form.id === keptForm && leadFormPlaced) continue;
    if (options.pageType === "subscription") {
      report.omitted.push({ what: { key: "imports.report.extraForm", values: { fields: formLabel(form) } }, reason: "extra-form" });
    } else {
      const key = options.pageType === "free" ? "imports.report.formOnFreePage" : "imports.report.formOnConfirmationPage";
      report.omitted.push({ what: { key, values: { fields: formLabel(form) } }, reason: "other" });
    }
  }
  if (options.pageType === "subscription" && !leadFormPlaced) {
    report.actionsBeforePublish.push({ key: "imports.report.addFormBlock" });
  }

  if (droppedBackgrounds > 0) {
    report.simplified.push({
      what: { key: droppedBackgrounds > 1 ? "imports.report.backgroundsMany" : "imports.report.backgroundsOne", values: { n: droppedBackgrounds } },
      how: { key: "imports.report.backgroundsHow" },
    });
  }
  const toDescribe = new Set(
    imagesPlaced.map((ref) => options.media?.[ref]).filter((m) => m?.altPending).map((m) => m!.url),
  ).size;
  if (toDescribe > 0) {
    report.actionsBeforePublish.push({
      key: toDescribe > 1 ? "imports.report.describeMany" : "imports.report.describeOne",
      values: { n: toDescribe },
    });
  }
  report.failedImages = [...(options.failedImages ?? [])];
  if (placeholders > 0) {
    report.actionsBeforePublish.push({
      key: placeholders > 1 ? "imports.report.placeholdersMany" : "imports.report.placeholdersOne",
      values: { n: placeholders },
    });
  }

  report.fontSubstitutions = [
    ...new Set(extract.fonts.map((f) => f.trim().replace(/^["']|["']$/g, "")).filter((f) => f && !GENERIC_FONTS.has(f.toLowerCase()))),
  ];
  report.accessibility = checkAccessibility(a11y);

  const wrapper: ComponentJson = { type: "wrapper", components: sections.map(toComponent) };
  const styles = [...baseRules, ...tabletRules, ...mobileRules];
  const css =
    cssBlock(baseRules) +
    (tabletRules.length ? `@media ${DEVICE_BREAKPOINTS.tablet}{${cssBlock(tabletRules)}}` : "") +
    (mobileRules.length ? `@media ${DEVICE_BREAKPOINTS.mobilePortrait}{${cssBlock(mobileRules)}}` : "");

  return {
    projectData: { assets: [], styles, pages: [{ frames: [{ component: wrapper }] }] },
    html: sections.map(toHtml).join(""),
    css,
    report,
    textsUsed,
    imagesPlaced,
    leadForm: leadFormPlaced ? keptForm : null,
  };
}

/** Form refs of the IR's lead-form leaves, in document order. */
function placedFormRefs(ir: ImportIR): string[] {
  const refs: string[] = [];
  const leaves = (blocks: IRLeaf[]) => blocks.forEach((b) => b.kind === "lead-form" && refs.push(b.form));
  for (const section of ir.sections) {
    for (const row of section.rows) {
      if (row.kind === "blocks") leaves(row.blocks);
      else row.columns.forEach((c) => leaves(c.blocks));
    }
  }
  return refs;
}

/** The most prominent form (Story 4 AS-2): the first with an email field, otherwise the first. */
export function prominentForm(forms: ExtractForm[]): ExtractForm | undefined {
  return forms.find((f) => f.fields.some((x) => x.type === "email")) ?? forms[0];
}

/**
 * Image refs the IR places (content images and section backgrounds) that the
 * extract knows, in document order, without repeats: what the images step
 * has to fetch before `serializeImport` runs.
 */
export function placedImageRefs(ir: ImportIR, extract: PageExtract): string[] {
  const known = new Set(extract.images.map((i) => i.id));
  const refs: string[] = [];
  const add = (ref: string | undefined) => {
    if (ref && known.has(ref) && !refs.includes(ref)) refs.push(ref);
  };
  const leaves = (blocks: IRLeaf[]) => blocks.forEach((b) => b.kind === "image" && add(b.image));
  for (const section of ir.sections) {
    add(section.style?.backgroundImage);
    for (const row of section.rows) {
      if (row.kind === "blocks") leaves(row.blocks);
      else
        row.columns.forEach((c) => {
          add(c.style?.backgroundImage);
          leaves(c.blocks);
        });
    }
  }
  return refs;
}

const LEAF_LABELS: Record<Exclude<IRLeaf["kind"], "lead-form">, string> = {
  hero: "bandeau",
  "rich-text": "texte",
  image: "image",
  "call-to-action": "bouton",
  testimonial: "témoignage",
};

const stripHidden = (o: IRDeviceOverride | undefined): IRDeviceOverride | undefined =>
  o ? { ...o, hidden: undefined } : undefined;

const hiddenStyles = (d: IRDevices | undefined): DeviceStyles => ({
  tablet: d?.tablet?.hidden ? { display: "none" } : {},
  mobile: d?.mobile?.hidden && !d?.tablet?.hidden ? { display: "none" } : {},
});

/** "w / h" of a measured source box, or undefined when it can't be trusted (hidden, lazy, sliver). */
function aspectRatio(box: Box): string | undefined {
  const { width: w, height: h } = box;
  if (!(w >= 40 && h >= 40) || w / h > 4 || h / w > 4) return undefined;
  return `${Math.round(w)} / ${Math.round(h)}`;
}

/** A photo card: content stacked at the bottom, top padding no larger than the bottom one. */
function photoCardStyle(box: Style): Style {
  const bottom = box["padding-bottom"] ?? "20px";
  const top = box["padding-top"];
  return {
    display: "flex",
    "flex-direction": "column",
    "justify-content": "flex-end",
    "padding-top": top && parseFloat(top) <= parseFloat(bottom) ? top : bottom,
  };
}

const withoutPaddingTop = (d: IRDevices | undefined): IRDevices | undefined => {
  const strip = (o: IRDeviceOverride | undefined) => (o?.box ? { ...o, box: { ...o.box, paddingTop: undefined } } : o);
  return d ? { tablet: strip(d.tablet), mobile: strip(d.mobile) } : undefined;
};

/** "#fff" → "#ffffff" (the library blocks' own colours use the short form). */
function expandShortHex(v: string | undefined): string | undefined {
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v ?? "");
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase() : undefined;
}

