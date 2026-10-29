import { DEVICE_BREAKPOINTS } from "../layout";
import type { Style } from "./style";

/**
 * The converter's output tree, before it becomes GrapesJS JSON + HTML + CSS
 * (015-penpot-site-import, research P3). Styles are written as id rules,
 * which is what the editor's Style Manager writes; per-device styles go
 * under the editor's own Tablet / Mobile portrait media queries.
 */

export type Node = {
  tag: string;
  /** GrapesJS component type (`text`, `image`, `link`, `svg`, `svg-in`); none = default. */
  type?: string;
  attrs: [string, string][];
  /** Assigned when the node has any style. */
  id?: string;
  /** Child nodes, or raw inner HTML for text components. */
  children: Node[] | string;
  base: Style;
  tablet: Style;
  mobile: Style;
  /** Rules on descendants, e.g. `{ " a": {...} }` → `#<id> a{...}` (links inside a text). */
  descendants?: Record<string, Style>;
};

export const node = (tag: string, opts: Partial<Omit<Node, "tag">> = {}): Node => ({
  tag,
  type: opts.type,
  attrs: opts.attrs ?? [],
  id: opts.id,
  children: opts.children ?? [],
  base: opts.base ?? {},
  tablet: opts.tablet ?? {},
  mobile: opts.mobile ?? {},
});

const VOID = new Set(["img", "br", "hr"]);
const escAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const attrsOf = (n: Node): [string, string][] => [
  ...n.attrs,
  ...(n.id ? ([["id", n.id]] as [string, string][]) : []),
];

export function toHtml(n: Node): string {
  const attrs = attrsOf(n)
    .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
    .join("");
  if (VOID.has(n.tag)) return `<${n.tag}${attrs}/>`;
  const inner = typeof n.children === "string" ? n.children : n.children.map(toHtml).join("");
  return `<${n.tag}${attrs}>${inner}</${n.tag}>`;
}

export type ComponentJson = {
  [prop: string]: unknown;
  type?: string;
  tagName?: string;
  attributes?: Record<string, string>;
  components?: ComponentJson[] | string;
};

export function toComponent(n: Node): ComponentJson {
  const c: ComponentJson = { tagName: n.tag };
  if (n.type) c.type = n.type;
  const attributes = Object.fromEntries(attrsOf(n));
  if (Object.keys(attributes).length) c.attributes = attributes;
  if (!VOID.has(n.tag))
    c.components = typeof n.children === "string" ? n.children : n.children.map(toComponent);
  return c;
}

export type StyleRule = {
  selectors: string[];
  selectorsAdd?: string;
  style: Style;
  mediaText?: string;
  atRuleType?: "media";
};

const cssBlock = (rules: StyleRule[]) =>
  rules
    .map(
      (r) =>
        `${[...r.selectors, ...(r.selectorsAdd ? [r.selectorsAdd] : [])].join(",")}{${Object.entries(
          r.style,
        )
          .map(([k, v]) => `${k}:${v};`)
          .join("")}}`,
    )
    .join("");

/** Walks the tree once: id rules for every styled node, base first, then tablet, then mobile. */
export function collectRules(root: Node): { styles: StyleRule[]; css: string } {
  const base: StyleRule[] = [];
  const tablet: StyleRule[] = [];
  const mobile: StyleRule[] = [];
  const walk = (n: Node) => {
    if (n.id) {
      const sel = [`#${n.id}`];
      if (Object.keys(n.base).length) base.push({ selectors: sel, style: n.base });
      for (const [suffix, style] of Object.entries(n.descendants ?? {})) {
        base.push({ selectors: [], selectorsAdd: `#${n.id}${suffix}`, style });
      }
      if (Object.keys(n.tablet).length)
        tablet.push({
          selectors: sel,
          style: n.tablet,
          mediaText: DEVICE_BREAKPOINTS.tablet,
          atRuleType: "media",
        });
      if (Object.keys(n.mobile).length) {
        mobile.push({
          selectors: sel,
          style: n.mobile,
          mediaText: DEVICE_BREAKPOINTS.mobilePortrait,
          atRuleType: "media",
        });
      }
    }
    if (typeof n.children !== "string") n.children.forEach(walk);
  };
  walk(root);
  const css =
    cssBlock(base) +
    (tablet.length ? `@media ${DEVICE_BREAKPOINTS.tablet}{${cssBlock(tablet)}}` : "") +
    (mobile.length ? `@media ${DEVICE_BREAKPOINTS.mobilePortrait}{${cssBlock(mobile)}}` : "");
  return { styles: [...base, ...tablet, ...mobile], css };
}

/** Short, stable component ids from Penpot shape ids (`p` + base36), unique within a page. */
export function idMaker(): (shapeId: string, suffix?: string) => string {
  const used = new Set<string>();
  return (shapeId, suffix = "") => {
    const hex = shapeId.replace(/[^0-9a-f]/gi, "").slice(-10) || "0";
    let id = `p${parseInt(hex, 16).toString(36).slice(-6)}${suffix}`;
    for (let n = 2; used.has(id); n++)
      id = `p${parseInt(hex, 16).toString(36).slice(-6)}${suffix}-${n}`;
    used.add(id);
    return id;
  };
}
