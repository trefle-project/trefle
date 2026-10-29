import { ALLOWED_ATTR, ALLOWED_TAGS } from "@trefle/shared";

import type { Shape, SvgRawNode } from "./model";
import { node, type Node } from "./node";
import { box } from "./read";
import { clamp, color, round, strokeColor } from "./style";

/**
 * Vectors → inline SVG (015-penpot-site-import, research P9). A shape made
 * only of vector parts (icons, logos, decorative shapes) becomes one
 * `<svg>` whose viewBox is its own box; Penpot path data is absolute, so it
 * is used as is. `svg-raw` content is filtered through the published-page
 * allow-list, and references to other resources are dropped.
 */

const VECTOR_LEAVES = new Set(["path", "bool"]);
const VECTOR_PARTS = new Set(["path", "bool", "circle", "rect", "group", "frame"]);
const PATH_DATA_RE = /^[MLCQZHVASTmlcqzhvast0-9.,\-eE\s]*$/;
/** Clusters larger than this are not icons: they are laid out as boxes. */
const MAX_CLUSTER = 640;

const visible = (s: Shape | undefined): s is Shape => Boolean(s && !s.hidden);
const kids = (s: Shape, shapes: Map<string, Shape>) =>
  (s.shapes ?? []).map((id) => shapes.get(id)).filter(visible);
const hasImageFill = (s: Shape) => (s.fills ?? []).some((f) => f?.fillImage);

export function isVectorLeaf(s: Shape): boolean {
  return VECTOR_LEAVES.has(s.type);
}

/** A group/frame/bool whose visible content is only vector parts, with at least one path, small enough to be an icon. */
export function isVectorCluster(s: Shape, shapes: Map<string, Shape>): boolean {
  if (!["group", "frame", "bool"].includes(s.type) || (s.type === "frame" && s.layout))
    return false;
  const b = box(s);
  if (b.width > MAX_CLUSTER || b.height > MAX_CLUSTER) return false;
  let paths = 0;
  const ok = (x: Shape): boolean => {
    if (!VECTOR_PARTS.has(x.type) || hasImageFill(x) || (x.type === "frame" && x.layout))
      return false;
    if (VECTOR_LEAVES.has(x.type)) paths++;
    return kids(x, shapes).every(ok);
  };
  if (s.type === "bool") return true;
  return kids(s, shapes).every(ok) && paths > 0;
}

/** A layer name worth reading out (not « Rectangle 12 », « svg-path-4 », « IMG_2034 »). */
export function meaningfulName(name: string | undefined): string | undefined {
  const last = (name ?? "").split("/").pop()!.trim();
  if (last.length < 3 || !/[a-zà-ÿ]{3}/i.test(last)) return undefined;
  if (
    /^(rectangle|ellipse|path|svg-path|group|board|frame|vector|image|img|icon|icons|bool|union|layer|copy|component|shape|line|base-background|placeholder|mask)[\s_\-]*\d*$/i.test(
      last,
    )
  )
    return undefined;
  if (/^(img|dsc|image|screenshot|cleanshot|photo)[\s_\-]?\d/i.test(last)) return undefined;
  if (/^[0-9a-f-]{16,}$/i.test(last)) return undefined;
  return last;
}

function paint(s: Shape, attrs: [string, string][]) {
  const fill = (s.fills ?? []).find((f) => f?.fillColor || f?.fillColorGradient);
  const fc = fill?.fillColor
    ? color(fill.fillColor, fill.fillOpacity ?? 1)
    : fill?.fillColorGradient?.stops?.[0]
      ? color(fill.fillColorGradient.stops[0].color, fill.fillColorGradient.stops[0].opacity ?? 1)
      : undefined;
  attrs.push(["fill", fc ?? "none"]);
  const st = (s.strokes ?? []).find((x) => x && clamp(x.strokeWidth, 0, 200) > 0 && strokeColor(x));
  if (st) {
    attrs.push(
      ["stroke", strokeColor(st)!],
      ["stroke-width", String(round(clamp(st.strokeWidth, 0, 200)))],
    );
    const cap = st.strokeCapStart ?? st.strokeCapEnd;
    if (cap === "round" || cap === "square") attrs.push(["stroke-linecap", cap]);
    const join = s.svgAttrs?.strokeLinejoin;
    if (join === "round" || join === "bevel" || join === "miter")
      attrs.push(["stroke-linejoin", String(join)]);
    if (st.strokeStyle === "dashed")
      attrs.push(["stroke-dasharray", `${round(clamp(st.strokeWidth, 0, 200) * 3)}`]);
  }
  const op = clamp(s.opacity, 0, 1, 1);
  if (op < 1) attrs.push(["opacity", String(round(op, 3))]);
}

type Segment = { command?: string; relative?: boolean; params?: Record<string, number> };

/**
 * Path data as an SVG `d` string. Current exports store a string (absolute
 * M/L/C/Z); older files store a list of segments, converted here.
 */
export function pathData(content: unknown): string | undefined {
  if (typeof content === "string")
    return content && PATH_DATA_RE.test(content) ? content : undefined;
  if (!Array.isArray(content)) return undefined;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? String(round(Number(v), 3)) : "0");
  const parts: string[] = [];
  for (const seg of content as Segment[]) {
    const p = seg?.params ?? {};
    const rel = seg?.relative === true;
    switch (seg?.command) {
      case "move-to":
        parts.push(`${rel ? "m" : "M"}${n(p.x)},${n(p.y)}`);
        break;
      case "line-to":
        parts.push(`${rel ? "l" : "L"}${n(p.x)},${n(p.y)}`);
        break;
      case "curve-to":
        parts.push(
          `${rel ? "c" : "C"}${n(p.c1x)},${n(p.c1y)},${n(p.c2x)},${n(p.c2y)},${n(p.x)},${n(p.y)}`,
        );
        break;
      case "close-path":
        parts.push("Z");
        break;
      default:
        return undefined;
    }
  }
  return parts.length ? parts.join("") : undefined;
}

/** One vector shape (and its vector children) as SVG elements, in painting order (Penpot's array order). */
function parts(s: Shape, shapes: Map<string, Shape>): Node[] {
  const attrs: [string, string][] = [];
  const b = box(s);
  switch (s.type) {
    case "path":
    case "bool": {
      const d = pathData(s.content);
      if (!d) return [];
      attrs.push(["d", d]);
      paint(s, attrs);
      return [node("path", { type: "svg-in", attrs })];
    }
    case "circle":
      attrs.push(
        ["cx", String(round(b.x + b.width / 2))],
        ["cy", String(round(b.y + b.height / 2))],
        ["rx", String(round(b.width / 2))],
        ["ry", String(round(b.height / 2))],
      );
      paint(s, attrs);
      return [node("ellipse", { type: "svg-in", attrs })];
    case "rect": {
      attrs.push(
        ["x", String(round(b.x))],
        ["y", String(round(b.y))],
        ["width", String(round(b.width))],
        ["height", String(round(b.height))],
      );
      const r = clamp(s.r1 ?? s.rx, 0, 10_000);
      if (r > 0) attrs.push(["rx", String(round(r))]);
      paint(s, attrs);
      return [node("rect", { type: "svg-in", attrs })];
    }
    default: {
      // group / frame: a frame's own fill becomes a background rect
      const inner: Node[] = [];
      if (s.type === "frame" && (s.fills ?? []).length)
        inner.push(...parts({ ...s, type: "rect", shapes: [] }, shapes));
      for (const c of kids(s, shapes)) inner.push(...parts(c, shapes));
      const op = clamp(s.opacity, 0, 1, 1);
      if (!inner.length) return [];
      return [
        node("g", {
          type: "svg-in",
          attrs: op < 1 ? [["opacity", String(round(op, 3))]] : [],
          children: inner,
        }),
      ];
    }
  }
}

/** The `<svg>` for a vector cluster or a lone path: viewBox = its box, accessible name from a meaningful layer name. */
export function svgNode(s: Shape, shapes: Map<string, Shape>, label?: string): Node | null {
  const b = box(s);
  const children =
    s.type === "group" || s.type === "frame"
      ? kids(s, shapes).flatMap((c) => parts(c, shapes))
      : parts(s, shapes);
  if (!children.length) return null;
  const w = Math.max(b.width, 0.01);
  const h = Math.max(b.height, 0.01);
  const attrs: [string, string][] = [
    ["xmlns", "http://www.w3.org/2000/svg"],
    ["viewBox", `${round(b.x)} ${round(b.y)} ${round(w)} ${round(h)}`],
  ];
  if (label) attrs.push(["role", "img"], ["aria-label", label]);
  else attrs.push(["aria-hidden", "true"]);
  return node("svg", { type: "svg", attrs, children });
}

// ---------------------------------------------------------------- svg-raw

const TAGS = new Set(ALLOWED_TAGS.map((t) => t.toLowerCase()));
const ATTRS = new Set(ALLOWED_ATTR.map((a) => a.toLowerCase()));
const TEXT_TAGS = new Set(["text", "tspan", "title", "desc"]);
const URL_ATTRS = new Set(["href", "xlink:href", "src"]);

const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Penpot camelCase attribute keys back to SVG names (`strokeWidth` → `stroke-width`, `viewBox` kept). */
const attrName = (k: string) =>
  k === "viewBox" || k === "preserveAspectRatio"
    ? k
    : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function rawElement(n: SvgRawNode | string, depth: number): Node | string | null {
  if (typeof n === "string") return null;
  const tag = String(n?.tag ?? "").toLowerCase();
  if (!TAGS.has(tag) || depth > 30) return null;
  const attrs: [string, string][] = [];
  for (const [k, v] of Object.entries(n.attrs ?? {})) {
    const name = attrName(k);
    const lower = name.toLowerCase();
    if (
      lower.startsWith("on") ||
      !ATTRS.has(lower) ||
      (typeof v !== "string" && typeof v !== "number")
    )
      continue;
    const value = String(v);
    // Never let a published page fetch something the file names; same-document anchors only.
    if (URL_ATTRS.has(lower) && !value.startsWith("#")) continue;
    if (/javascript:|data:(?!image\/)/i.test(value)) continue;
    // A base64 image would make the page unsavable (Pages hook `rejectInlineImages`).
    if (/data:image\/[a-z0-9.+-]+;base64,/i.test(value)) continue;
    attrs.push([name, value]);
  }
  const content = n.content ?? [];
  if (TEXT_TAGS.has(tag)) {
    const text = content.filter((c): c is string => typeof c === "string").join("");
    return node(tag, { type: "svg-in", attrs, children: escText(text) });
  }
  const children = content
    .map((c) => rawElement(c, depth + 1))
    .filter((c): c is Node => Boolean(c) && typeof c !== "string");
  return node(tag, { type: tag === "svg" ? "svg" : "svg-in", attrs, children });
}

/** An `svg-raw` shape → a filtered `<svg>` (wrapped in one when its root is a fragment). */
export function svgRawNode(s: Shape, label?: string): Node | null {
  const c = s.content as SvgRawNode | undefined;
  if (!c || typeof c !== "object") return null;
  const el = rawElement(c, 0);
  if (!el || typeof el === "string") return null;
  const b = box(s);
  const root =
    el.tag === "svg"
      ? el
      : node("svg", {
          type: "svg",
          attrs: [["viewBox", `0 0 ${round(b.width)} ${round(b.height)}`]],
          children: [{ ...el, type: "svg-in" }],
        });
  if (!root.attrs.some(([k]) => k === "xmlns"))
    root.attrs.unshift(["xmlns", "http://www.w3.org/2000/svg"]);
  root.attrs = root.attrs.filter(([k]) => k !== "width" && k !== "height");
  root.attrs.push(
    ...(label
      ? ([
          ["role", "img"],
          ["aria-label", label],
        ] as [string, string][])
      : ([["aria-hidden", "true"]] as [string, string][])),
  );
  return root;
}
