/**
 * Domain fonts (015-penpot-site-import, User Story 4, research P8): one
 * `@font-face` rule per stored font file, written once per page by the
 * renderer and injected into the editor canvas. Files are served from
 * Trefle's own storage; nothing here ever points at a font service.
 */

/** A stored font file, as the renderer and the editor read it (a `fonts` document). */
export type FontFile = {
  family: string;
  weight: number;
  style: "normal" | "italic";
  url: string;
  unicodeRange?: string | null;
};

const FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/;
const RANGE_RE =
  /^U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?(,\s*U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?)*$/;
const SAFE_URL_RE = /^(https?:\/\/|\/)[^\s"'()\\<>]+$/;

export const isValidFontFamily = (family: string) => FAMILY_RE.test(family);

/** `@font-face` rules for the given files; invalid entries are skipped, never emitted. */
export function fontFaceCss(files: FontFile[]): string {
  return files
    .filter(
      (f) =>
        f &&
        isValidFontFamily(f.family) &&
        SAFE_URL_RE.test(f.url) &&
        Number.isInteger(f.weight) &&
        f.weight >= 100 &&
        f.weight <= 900,
    )
    .map((f) => {
      const range =
        f.unicodeRange && RANGE_RE.test(f.unicodeRange) ? `unicode-range:${f.unicodeRange};` : "";
      const style = f.style === "italic" ? "italic" : "normal";
      return `@font-face{font-family:"${f.family}";font-style:${style};font-weight:${f.weight};font-display:swap;src:url("${f.url}") format("woff2");${range}}`;
    })
    .join("");
}
