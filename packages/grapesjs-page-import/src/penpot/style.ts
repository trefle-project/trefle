import type { Fill, Gradient, Shape, Stroke } from "./model";

/**
 * Penpot visual properties → CSS (015-penpot-site-import, research P4).
 * Values are re-validated here: colours must be #rgb/#rrggbb, numbers are
 * clamped, anything unexpected is dropped.
 */

export type Style = Record<string, string>;

/** Lengths: plain px, or `cqw` of the nearest freely positioned container (research P6). */
export type Units = { len: (px: number) => string; free: boolean };
export const PX: Units = { len: (v) => `${round(v)}px`, free: false };
export const cqwUnits = (width: number): Units => ({
  len: (v) => (width > 0 ? `${round((v / width) * 100, 3)}cqw` : `${round(v)}px`),
  free: true,
});

export const round = (n: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
export const clamp = (n: unknown, min: number, max: number, fallback = 0): number => {
  const v = typeof n === "string" ? parseFloat(n) : typeof n === "number" ? n : NaN;
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#rrggbb`, or `rgba()` when not fully opaque; undefined for anything that isn't a hex colour. */
export function color(hex: unknown, opacity: unknown = 1): string | undefined {
  if (typeof hex !== "string" || !HEX_RE.test(hex)) return undefined;
  let h = hex.slice(1).toLowerCase();
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const a = clamp(opacity, 0, 1, 1);
  if (a >= 1) return `#${h}`;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${round(a, 3)})`;
}

export function gradientCss(g: Gradient | undefined): string | undefined {
  if (!g || !Array.isArray(g.stops) || g.stops.length < 2) return undefined;
  const stops = g.stops
    .map((s) => {
      const c = color(s.color, s.opacity ?? 1);
      return c ? `${c} ${round(clamp(s.offset, 0, 1) * 100)}%` : undefined;
    })
    .filter(Boolean);
  if (stops.length < 2) return undefined;
  const [sx, sy, ex, ey] = [g.startX, g.startY, g.endX, g.endY].map((v) => clamp(v, -10, 10, 0));
  if (g.type === "radial")
    return `radial-gradient(circle at ${round(sx! * 100)}% ${round(sy! * 100)}%, ${stops.join(", ")})`;
  // CSS angles: 0deg points up, clockwise. Penpot points are relative to the box (y down).
  const angle = round((Math.atan2(ex! - sx!, -(ey! - sy!)) * 180) / Math.PI);
  return `linear-gradient(${angle}deg, ${stops.join(", ")})`;
}

export type FillResult = {
  style: Style;
  image?: NonNullable<Fill["fillImage"]>;
  extraFills: number;
};

/**
 * The shape's fill. Only the first visible fill is reproduced (Penpot lists
 * the top-most first); further fills are counted for the report.
 */
export function fillCss(fills: Fill[] | undefined): FillResult {
  const list = (fills ?? []).filter(
    (f) => f && (f.fillColor || f.fillColorGradient || f.fillImage),
  );
  const first = list[0];
  const out: FillResult = { style: {}, extraFills: Math.max(0, list.length - 1) };
  if (!first) return out;
  if (first.fillImage?.id) out.image = first.fillImage;
  else if (first.fillColorGradient) {
    const g = gradientCss(first.fillColorGradient);
    if (g) out.style["background-image"] = g;
  } else {
    const c = color(first.fillColor, first.fillOpacity ?? 1);
    if (c) out.style["background-color"] = c;
  }
  return out;
}

const STROKE_STYLES = new Set(["solid", "dashed", "dotted"]);

export function strokeColor(s: Stroke): string | undefined {
  return color(s.strokeColor ?? s.color, s.strokeOpacity ?? s.opacity ?? 1);
}

/** First visible stroke as a border (inner) or an outline (center/outer) so the box doesn't grow. */
export function strokeCss(
  strokes: Stroke[] | undefined,
  u: Units,
): { style: Style; extraStrokes: number } {
  const list = (strokes ?? []).filter(
    (s) => s && clamp(s.strokeWidth, 0, 200) > 0 && s.strokeStyle !== "none" && strokeColor(s),
  );
  const s = list[0];
  if (!s) return { style: {}, extraStrokes: 0 };
  const w = clamp(s.strokeWidth, 0, 200);
  const kind = STROKE_STYLES.has(s.strokeStyle ?? "") ? s.strokeStyle! : "solid";
  const c = strokeColor(s)!;
  const align = s.strokeAlignment ?? "inner";
  const style: Style =
    align === "inner"
      ? { border: `${u.len(w)} ${kind} ${c}`, "box-sizing": "border-box" }
      : {
          outline: `${u.len(w)} ${kind} ${c}`,
          "outline-offset": align === "center" ? u.len(-w / 2) : "0",
        };
  return { style, extraStrokes: list.length - 1 };
}

export function radiusCss(s: Shape, u: Units): Style {
  const r = [s.r1, s.r2, s.r3, s.r4].map((v) => clamp(v ?? s.rx, 0, 10_000));
  if (r.every((v) => v === 0)) return {};
  return {
    "border-radius": r.every((v) => v === r[0]) ? u.len(r[0]!) : r.map((v) => u.len(v)).join(" "),
  };
}

/** Drop and inner shadows → `box-shadow` (or `text-shadow` on texts, which has no spread). */
export function shadowCss(s: Shape, u: Units, text = false): Style {
  const parts = (s.shadow ?? [])
    .filter((sh) => sh && !sh.hidden)
    .map((sh) => {
      const c = color(sh.color?.color, sh.color?.opacity ?? 1);
      if (!c) return undefined;
      const [x, y, blur, spread] = [sh.offsetX, sh.offsetY, sh.blur, sh.spread].map((v) =>
        clamp(v, -2000, 2000),
      );
      if (text) return `${u.len(x!)} ${u.len(y!)} ${u.len(Math.max(0, blur!))} ${c}`;
      return `${sh.style === "inner-shadow" ? "inset " : ""}${u.len(x!)} ${u.len(y!)} ${u.len(Math.max(0, blur!))} ${u.len(spread!)} ${c}`;
    })
    .filter(Boolean);
  if (!parts.length) return {};
  return { [text ? "text-shadow" : "box-shadow"]: parts.join(", ") };
}

export type EffectsResult = { style: Style; notes: string[] };

/** Opacity, layer blur, rotation; blend modes and masks are only reported (research P4). */
export function effectsCss(s: Shape, u: Units): EffectsResult {
  const style: Style = {};
  const notes: string[] = [];
  const opacity = clamp(s.opacity, 0, 1, 1);
  if (opacity < 1) style.opacity = String(round(opacity, 3));
  if (s.blur && !s.blur.hidden && clamp(s.blur.value, 0, 500) > 0)
    style.filter = `blur(${u.len(clamp(s.blur.value, 0, 500))})`;
  const rot = clamp(s.rotation, -360, 360);
  if (rot % 360 !== 0) {
    style.transform = `rotate(${round(rot)}deg)`;
    notes.push("rotation");
  }
  if (s.blendMode && s.blendMode !== "normal") notes.push("blend-mode");
  if (s.maskedGroup) notes.push("mask");
  return { style, notes };
}

/**
 * A colour as it shows over an opaque `#rrggbb` background: `rgba()` is
 * blended into it (for contrast checks); `#rrggbb` is returned as is;
 * anything else → undefined.
 */
export function flatten(c: string | undefined, over: string): string | undefined {
  if (!c) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(c);
  const bg = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(over);
  if (!m || !bg) return undefined;
  const a = Number(m[4]);
  const mix = (fg: string, back: string) => Math.round(Number(fg) * a + parseInt(back, 16) * (1 - a));
  return `#${[mix(m[1]!, bg[1]!), mix(m[2]!, bg[2]!), mix(m[3]!, bg[3]!)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
