/**
 * Accessibility checks on an imported page (012-url-page-import, research
 * R11, FR-030). Pure functions over what the serializer placed, in document
 * order — no browser. They only feed the import report: axe on the
 * published page stays the authority.
 */

export type A11yItem =
  | {
      kind: "text";
      /** h1–h4, p, li, blockquote, figcaption, a… */
      tag: string;
      /** Resolved text colour (#rrggbb). */
      color: string;
      /** Nearest background: a colour, or "image" when a background image sits behind. */
      background: string;
      /** Resolved font size in px, when known. */
      fontSize?: number;
      bold?: boolean;
      where: string;
    }
  | { kind: "image"; alt: string | null; where: string }
  | { kind: "link"; text: string; where: string };

export type A11yFinding = {
  kind: "missing-alt" | "low-contrast" | "heading-skip" | "empty-link" | "contrast-unverifiable";
  where: string;
  detail?: string;
};

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => channel(parseInt(h!, 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2.x contrast ratio, or null when a colour can't be read. */
export function contrastRatio(fg: string, bg: string): number | null {
  const a = luminance(fg);
  const b = luminance(bg);
  if (a == null || b == null) return null;
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Large text: ≥ 24px, or ≥ 18.66px bold (WCAG "large scale"). */
const isLarge = (item: { fontSize?: number; bold?: boolean }) =>
  (item.fontSize ?? 16) >= 24 || (Boolean(item.bold) && (item.fontSize ?? 16) >= 18.66);

export function checkAccessibility(items: A11yItem[]): A11yFinding[] {
  const findings: A11yFinding[] = [];
  let lastHeading = 0;
  for (const item of items) {
    if (item.kind === "image") {
      // No alt attribute at all. An empty alt is the source marking the
      // image decorative, which is correct.
      if (item.alt === null) findings.push({ kind: "missing-alt", where: item.where });
      continue;
    }
    if (item.kind === "link") {
      if (item.text.trim() === "") findings.push({ kind: "empty-link", where: item.where });
      continue;
    }
    const level = /^h([1-6])$/.exec(item.tag)?.[1];
    if (level) {
      const n = Number(level);
      if (lastHeading > 0 && n > lastHeading + 1) {
        findings.push({ kind: "heading-skip", where: item.where, detail: `h${lastHeading} → h${n}` });
      } else if (lastHeading === 0 && n > 1) {
        findings.push({ kind: "heading-skip", where: item.where, detail: `premier titre de niveau ${n}` });
      }
      lastHeading = n;
    }
    if (item.background === "image") {
      findings.push({ kind: "contrast-unverifiable", where: item.where });
      continue;
    }
    const ratio = contrastRatio(item.color, item.background);
    if (ratio == null) continue;
    const needed = isLarge(item) ? 3 : 4.5;
    if (ratio < needed) {
      findings.push({
        kind: "low-contrast",
        where: item.where,
        detail: `${ratio.toFixed(2)}:1 (minimum ${needed}:1)`,
      });
    }
  }
  return findings;
}
