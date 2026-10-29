import type { Shape, TextNode, TextStyle, Typography } from "./model";
import { clamp, color, round, type Style, type Units } from "./style";

/**
 * Penpot texts → paragraphs of HTML (015-penpot-site-import, research P7).
 * Texts are copied verbatim (HTML-escaped). A paragraph carries its own
 * style; a `span` is only written for a run whose style differs from it.
 */

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Paragraph nodes of a text shape, in order. */
export function paragraphs(content: unknown): TextNode[] {
  const out: TextNode[] = [];
  const walk = (n: TextNode | undefined) => {
    if (!n || typeof n !== "object") return;
    if (n.type === "paragraph") out.push(n);
    else (n.children ?? []).forEach(walk);
  };
  walk(content as TextNode);
  return out;
}

const leaves = (p: TextNode): TextNode[] =>
  (p.children ?? []).filter((c) => typeof c?.text === "string");

/** The text of a paragraph, exactly as stored. */
export const paragraphText = (p: TextNode) =>
  leaves(p)
    .map((l) => l.text)
    .join("");

/** Largest font size used in a shape's text (px). */
export function maxFontSize(s: Shape): number {
  let max = 0;
  for (const p of paragraphs(s.content))
    for (const l of [p, ...leaves(p)]) max = Math.max(max, clamp(l.fontSize, 0, 400));
  return max;
}

// ---------------------------------------------------------------- fonts

/** Penpot's built-in default font is Google's « Source Sans 3 ». */
export function familyOf(t: TextStyle): string | undefined {
  if (t.fontId === "sourcesanspro" || t.fontFamily === "sourcesanspro") return "Source Sans 3";
  const f = typeof t.fontFamily === "string" ? t.fontFamily.trim() : "";
  return f || undefined;
}

/** Whether a family is a Google font (Penpot `gfont-…` ids, or the default font). */
export const isGoogleFont = (t: TextStyle) =>
  typeof t.fontId === "string" && (t.fontId.startsWith("gfont-") || t.fontId === "sourcesanspro");

export function genericFamily(family: string): string {
  const f = family.toLowerCase();
  if (/mono|code|courier|consol/.test(f)) return "monospace";
  if (/sans/.test(f)) return "sans-serif";
  if (
    /serif|garamond|times|georgia|playfair|merriweather|lora|baskerville|caslon|bodoni|didot|crimson|cormorant|libre caslon|spectral/.test(
      f,
    )
  )
    return "serif";
  return "sans-serif";
}

export type FontContext = { available: Set<string>; substituted: Set<string> };

function fontFamilyCss(t: TextStyle, fonts: FontContext): string | undefined {
  const family = familyOf(t);
  if (!family) return undefined;
  const generic = genericFamily(family);
  if (fonts.available.has(family)) return `"${family.replace(/["\\]/g, "")}", ${generic}`;
  fonts.substituted.add(family);
  return generic;
}

// ---------------------------------------------------------------- styles

const WEIGHTS = new Set(["100", "200", "300", "400", "500", "600", "700", "800", "900"]);
const ALIGN = new Set(["left", "center", "right", "justify"]);
const TRANSFORM = new Set(["uppercase", "lowercase", "capitalize"]);
const DECORATION = new Set(["underline", "line-through"]);

export function textStyleCss(t: TextStyle, u: Units, fonts: FontContext): Style {
  const s: Style = {};
  const family = fontFamilyCss(t, fonts);
  if (family) s["font-family"] = family;
  const size = clamp(t.fontSize, 0, 400);
  if (size > 0) s["font-size"] = u.len(Math.max(1, size));
  const weight = String(t.fontWeight ?? "");
  if (WEIGHTS.has(weight)) s["font-weight"] = weight;
  if (t.fontStyle === "italic") s["font-style"] = "italic";
  const lh = clamp(t.lineHeight, 0, 10);
  if (lh > 0) s["line-height"] = String(round(lh, 3));
  const ls = clamp(t.letterSpacing, -100, 100);
  if (ls !== 0) s["letter-spacing"] = u.len(ls);
  if (TRANSFORM.has(String(t.textTransform))) s["text-transform"] = String(t.textTransform);
  if (DECORATION.has(String(t.textDecoration))) s["text-decoration"] = String(t.textDecoration);
  const fill = (t.fills ?? []).find((f) => f?.fillColor);
  const c = fill ? color(fill.fillColor, fill.fillOpacity ?? 1) : undefined;
  if (c) s.color = c;
  return s;
}

const styleAttr = (s: Style) =>
  Object.entries(s)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");

export type BuiltParagraph = {
  /** Paragraph-level CSS (goes on the element's id rule). */
  style: Style;
  /** Inner HTML: escaped text, with `span style` for differing runs. */
  html: string;
  text: string;
  align?: string;
  fontSize: number;
  bold: boolean;
  color?: string;
};

export function buildParagraph(p: TextNode, u: Units, fonts: FontContext): BuiltParagraph {
  const style = textStyleCss(p, u, fonts);
  const align = ALIGN.has(String(p.textAlign)) ? String(p.textAlign) : undefined;
  if (align && align !== "left") style["text-align"] = align;
  const parts = leaves(p).map((l) => {
    const ls = textStyleCss(l, u, fonts);
    const diff: Style = {};
    for (const [k, v] of Object.entries(ls)) if (style[k] !== v) diff[k] = v;
    const text = escapeHtml(l.text ?? "");
    return Object.keys(diff).length
      ? `<span style="${escapeHtml(styleAttr(diff))}">${text}</span>`
      : text;
  });
  return {
    style,
    html: parts.join(""),
    text: paragraphText(p),
    align,
    fontSize: clamp(p.fontSize ?? leaves(p)[0]?.fontSize, 0, 400, 16),
    bold: Number(p.fontWeight ?? leaves(p)[0]?.fontWeight ?? 400) >= 600,
    color: style.color,
  };
}

// ---------------------------------------------------------------- headings

const HEADING_NAME_RE = /(?:^|[^a-z0-9])(?:h|heading|titre|title)\s*-?\s*([1-6])(?![0-9])/i;

/** `H1`, `H2 Heading`, `Titre 1`, `Heading 3` → the level; anything else → undefined. */
export function headingLevelFromName(name: string | undefined): number | undefined {
  const m = name ? HEADING_NAME_RE.exec(name) : null;
  return m ? Number(m[1]) : undefined;
}

/**
 * Heading tag per text shape of a board (research P7). `texts` must be in
 * reading (DOM) order. Only single-paragraph texts become headings.
 */
export function assignHeadings(
  texts: Shape[],
  typographies: Map<string, Typography>,
): Map<string, string> {
  const tags = new Map<string, string>();
  const candidates = texts.filter(
    (t) => paragraphs(t.content).length === 1 && paragraphText(paragraphs(t.content)[0]!).trim(),
  );
  // (1) named typographies
  for (const t of candidates) {
    const p = paragraphs(t.content)[0]!;
    const ref = p.typographyRefId ?? leaves(p)[0]?.typographyRefId;
    const typo = ref ? typographies.get(ref) : undefined;
    const level = headingLevelFromName(typo ? `${typo.path ?? ""} ${typo.name}` : undefined);
    if (level) tags.set(t.id, `h${level}`);
  }
  // (2) sizes, when no typography gave a level
  const unnamed = candidates.filter((t) => !tags.has(t.id));
  if (![...tags.values()].includes("h1")) {
    const sizes = [...new Set(unnamed.map(maxFontSize))].sort((a, b) => b - a);
    const [s1, s2, s3] = sizes;
    let h1Given = false;
    for (const t of unnamed) {
      const size = maxFontSize(t);
      if (size === s1 && !h1Given) {
        tags.set(t.id, "h1");
        h1Given = true;
      } else if (size === s1 || (size === s2 && size! >= 24)) tags.set(t.id, "h2");
      else if (size === s3 && size! >= 24) tags.set(t.id, "h3");
    }
  } else {
    const sizes = [...new Set(unnamed.map(maxFontSize))]
      .filter((s) => s >= 24)
      .sort((a, b) => b - a);
    for (const t of unnamed) {
      const i = sizes.indexOf(maxFontSize(t));
      if (i === 0 || i === 1) tags.set(t.id, `h${i + 2}`);
    }
  }
  // (3) exactly one h1
  let seenH1 = false;
  for (const t of candidates) {
    if (tags.get(t.id) !== "h1") continue;
    if (seenH1) tags.set(t.id, "h2");
    seenH1 = true;
  }
  if (!seenH1) {
    const firstH2 = candidates.find((t) => tags.get(t.id) === "h2");
    if (firstH2) tags.set(firstH2.id, "h1");
  }
  return tags;
}
