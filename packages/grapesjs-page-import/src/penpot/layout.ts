import type { GridCell, Shape, Track } from "./model";
import { box } from "./read";
import { clamp, round, type Style, type Units } from "./style";

/**
 * Penpot layouts → CSS (015-penpot-site-import, research P4–P6).
 *
 * - Flex and grid boards keep their own rules; Penpot stores children
 *   last-shown-first, so the caller emits them **reversed** (verified on
 *   1 251 flex containers) and the CSS direction is kept as is.
 * - Freely positioned content becomes a size container whose children are
 *   absolutely positioned in `cqw` (research P6).
 * - The tablet/mobile rules of research P5 are returned separately; the
 *   caller writes them as device-view styles, never inside free containers.
 */

export type DeviceStyles = { base: Style; tablet: Style; mobile: Style };
const empty = (): DeviceStyles => ({ base: {}, tablet: {}, mobile: {} });

/** Narrowest device width a row must fit before it wraps (research P5 rule 2). */
export const MOBILE_WIDTH = 360;

const JUSTIFY: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  "space-between": "space-between",
  "space-around": "space-around",
  "space-evenly": "space-evenly",
  stretch: "stretch",
};
const ALIGN: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
};
const GRID_ALIGN: Record<string, string> = {
  start: "start",
  center: "center",
  end: "end",
  stretch: "stretch",
};

export const isRow = (s: Shape) => s.layoutFlexDir === "row" || s.layoutFlexDir === "row-reverse";

/** Padding p1..p4 = top, right, bottom, left. */
export function padding(s: Shape): [number, number, number, number] {
  const p = s.layoutPadding ?? {};
  return [p.p1, p.p2, p.p3, p.p4].map((v) => clamp(v, 0, 2000)) as [number, number, number, number];
}

function gaps(s: Shape): { row: number; column: number } {
  return {
    row: clamp(s.layoutGap?.rowGap, 0, 2000),
    column: clamp(s.layoutGap?.columnGap, 0, 2000),
  };
}

const lenList = (vals: number[], u: Units) =>
  vals.every((v) => v === vals[0]) ? u.len(vals[0]!) : vals.map((v) => u.len(v)).join(" ");

/**
 * Spacing on smaller screens (research P5 rule 4): values over 24 px shrink,
 * and are capped so that wide « centring » paddings don't eat a phone screen.
 */
export const tabletPad = (v: number) => (v > 24 ? Math.min(64, round(v * 0.75)) : v);
export const mobilePad = (v: number) => (v > 24 ? Math.min(24, Math.max(16, round(v * 0.5))) : v);
export const tabletGap = (v: number) => (v > 24 ? Math.min(48, round(v * 0.75)) : v);
export const mobileGap = (v: number) => (v > 24 ? Math.min(32, Math.max(16, round(v * 0.5))) : v);

function track(t: Track): string {
  const v = clamp(t.value, 0, 10_000);
  switch (t.type) {
    case "flex":
      return `minmax(0, ${round(v || 1, 3)}fr)`;
    case "fixed":
      return `${round(v)}px`;
    case "percent":
      return `${round(v, 3)}%`;
    default:
      return "auto";
  }
}

/** The container's own layout rules, plus its responsive overrides. */
export function containerCss(s: Shape, children: Shape[], u: Units): DeviceStyles {
  const out = empty();
  const [pt, pr, pb, pl] = padding(s);
  if (pt || pr || pb || pl) out.base.padding = lenList([pt, pr, pb, pl], u);
  const g = gaps(s);

  if (s.layout === "flex") {
    const row = isRow(s);
    out.base.display = "flex";
    out.base["flex-direction"] = s.layoutFlexDir ?? "column";
    if (s.layoutWrapType === "wrap") out.base["flex-wrap"] = "wrap";
    if (g.row || g.column)
      out.base.gap = g.row === g.column ? u.len(g.row) : `${u.len(g.row)} ${u.len(g.column)}`;
    const jc = JUSTIFY[s.layoutJustifyContent ?? ""];
    if (jc && jc !== "flex-start") out.base["justify-content"] = jc;
    const ai = ALIGN[s.layoutAlignItems ?? ""];
    if (ai) out.base["align-items"] = ai;
    const ac = JUSTIFY[s.layoutAlignContent ?? ""];
    if (ac && s.layoutWrapType === "wrap") out.base["align-content"] = ac;

    if (!u.free) {
      spacingOverrides(out, [pt, pr, pb, pl], g);
      if (row && !fitsMobile(s, children)) {
        out.tablet["flex-wrap"] = "wrap";
        out.mobile["flex-direction"] =
          s.layoutFlexDir === "row-reverse" ? "column-reverse" : "column";
        out.mobile["align-items"] = "stretch";
      }
    }
  } else if (s.layout === "grid") {
    out.base.display = "grid";
    const cols = s.layoutGridColumns ?? [];
    const rows = s.layoutGridRows ?? [];
    if (cols.length) out.base["grid-template-columns"] = cols.map(track).join(" ");
    if (rows.length) out.base["grid-template-rows"] = rows.map(track).join(" ");
    if (g.row || g.column)
      out.base.gap = g.row === g.column ? u.len(g.row) : `${u.len(g.row)} ${u.len(g.column)}`;
    const ji = GRID_ALIGN[s.layoutJustifyItems ?? ""];
    if (ji) out.base["justify-items"] = ji;
    const ai = GRID_ALIGN[s.layoutAlignItems ?? ""];
    if (ai) out.base["align-items"] = ai;

    if (!u.free) {
      spacingOverrides(out, [pt, pr, pb, pl], g);
      // Only grids with at least two stretchy tracks collapse (an icon + text grid stays as is).
      const stretchy = cols.filter((t) => t.type === "flex" || t.type === "percent").length;
      if (stretchy >= 2 && box(s).width > MOBILE_WIDTH) {
        if (cols.length > 2) out.tablet["grid-template-columns"] = "repeat(2, minmax(0, 1fr))";
        out.mobile["grid-template-columns"] = "minmax(0, 1fr)";
        out.mobile["grid-template-rows"] = "none";
      }
    }
  }
  return out;
}

function spacingOverrides(
  out: DeviceStyles,
  [pt, pr, pb, pl]: number[],
  g: { row: number; column: number },
) {
  if (pr! > 24 || pl! > 24) {
    out.tablet.padding = [pt, tabletPad(pr!), pb, tabletPad(pl!)]
      .map((v) => `${round(v!)}px`)
      .join(" ");
    out.mobile.padding = [pt, mobilePad(pr!), pb, mobilePad(pl!)]
      .map((v) => `${round(v!)}px`)
      .join(" ");
  }
  if (g.row > 24 || g.column > 24) {
    out.tablet.gap = `${tabletGap(g.row)}px ${tabletGap(g.column)}px`;
    out.mobile.gap = `${mobileGap(g.row)}px ${mobileGap(g.column)}px`;
  }
}

/** A row whose children and gaps fit in 360 px (an icon with its label, a button with an arrow) never wraps. */
export function fitsMobile(s: Shape, children: Shape[]): boolean {
  const inFlow = children.filter((c) => !c.layoutItemAbsolute);
  // An icon next to its label stays a row: the label shrinks and wraps.
  if (inFlow.length === 2 && Math.min(...inFlow.map((c) => box(c).width)) <= 48) return true;
  const [, pr, , pl] = padding(s);
  const total =
    inFlow.reduce((sum, c) => sum + box(c).width, 0) +
    gaps(s).column * Math.max(0, inFlow.length - 1) +
    pr +
    pl;
  return total <= MOBILE_WIDTH;
}

/** Whether a shape is a container (its fixed height becomes a minimum, research P4). */
export const isContainer = (s: Shape) => s.type === "frame" || s.type === "group";

/**
 * A child's sizing and placement inside a flex or grid parent.
 * `fullWidth`: a direct child of a board drawn at the board's full width spans the page.
 */
/** Fixed-width row items up to this width never shrink (avatars, icons, buttons); a 360 px phone still fits two. */
const SMALL_FIXED = 160;

export function itemCss(
  c: Shape,
  parent: Shape,
  u: Units,
  opts: { leaf: boolean; fullWidth?: boolean; cell?: GridCell; parentStacks?: boolean },
): DeviceStyles {
  const out = empty();
  const b = box(c);
  const pb = box(parent);
  if (c.layoutItemAbsolute) {
    // Horizontal position and width relative to the parent, so a stacked row never pushes them off screen.
    const pw = Math.max(1, pb.width);
    out.base.position = "absolute";
    out.base.left = u.free ? u.len(b.x - pb.x) : `${round(((b.x - pb.x) / pw) * 100, 3)}%`;
    out.base.top = u.len(b.y - pb.y);
    out.base.width = u.free ? u.len(b.width) : `${round(Math.min(100, (b.width / pw) * 100), 3)}%`;
    out.base.height = u.len(b.height);
    const z = clamp(c.layoutItemZIndex, -1000, 1000);
    if (z) out.base["z-index"] = String(z);
    // A decoration placed for the desktop layout (a divider, a background shape) means nothing once the content reflows.
    if (!u.free && opts.leaf) out.mobile.display = "none";
    return out;
  }
  const row = parent.layout === "flex" && isRow(parent);
  const column = parent.layout === "flex" && !row;
  const h = opts.fullWidth ? "fill" : (c.layoutItemHSizing ?? "fix");
  const v = c.layoutItemVSizing ?? "fix";

  if (h === "fix") {
    if (row && !u.free && b.width <= SMALL_FIXED) {
      // An avatar, an icon, a button: Penpot never shrinks it, and a frame whose content is
      // positioned freely has no width of its own, so a row would crush it (an avatar ended 3 px wide).
      Object.assign(out.base, { width: u.len(b.width), "flex-shrink": "0" });
    } else {
      // `min(…, 100%)`, not `width` + `max-width`: a fixed width would stop every ancestor from shrinking.
      out.base.width = u.free ? u.len(b.width) : `min(${u.len(b.width)}, 100%)`;
      if (row) out.base["flex-shrink"] = "1";
    }
  } else if (h === "fill") {
    if (row) Object.assign(out.base, { flex: "1 1 0", "min-width": "0" });
    else if (column) out.base["align-self"] = "stretch";
    else out.base.width = "100%";
  } else if (row) out.base["flex-shrink"] = "1";

  if (v === "fix") {
    if (opts.leaf) out.base.height = u.len(b.height);
    else out.base["min-height"] = u.len(b.height);
  } else if (v === "fill") {
    if (column) Object.assign(out.base, { flex: "1 1 0", "min-height": "0" });
    else if (row) out.base["align-self"] = "stretch";
  }
  // In a grid, « fill » wins over the grid's own alignment (a hero text stayed at the top of its cell).
  if (parent.layout === "grid") {
    if (v === "fill") out.base["align-self"] = "stretch";
    if (h === "fill") out.base["justify-self"] = "stretch";
  }

  const m = c.layoutItemMargin;
  if (m && [m.m1, m.m2, m.m3, m.m4].some((x) => clamp(x, -2000, 2000) !== 0)) {
    out.base.margin = [m.m1, m.m2, m.m3, m.m4].map((x) => u.len(clamp(x, -2000, 2000))).join(" ");
  }
  if (clamp(c.layoutItemMinW, 0, 20_000))
    out.base["min-width"] = u.len(clamp(c.layoutItemMinW, 0, 20_000));
  if (clamp(c.layoutItemMaxW, 0, 20_000))
    out.base["max-width"] = u.len(clamp(c.layoutItemMaxW, 0, 20_000));
  if (clamp(c.layoutItemMinH, 0, 20_000))
    out.base["min-height"] = u.len(clamp(c.layoutItemMinH, 0, 20_000));
  if (clamp(c.layoutItemMaxH, 0, 20_000))
    out.base["max-height"] = u.len(clamp(c.layoutItemMaxH, 0, 20_000));

  // Grid items may shrink below their content's width (CSS defaults them to `min-width: auto`).
  if (parent.layout === "grid" && !out.base["min-width"]) out.base["min-width"] = "0";

  if (opts.cell) {
    const col = clamp(opts.cell.column, 1, 1000, 0);
    const r = clamp(opts.cell.row, 1, 1000, 0);
    const cs = clamp(opts.cell.columnSpan, 1, 1000, 1);
    const rs = clamp(opts.cell.rowSpan, 1, 1000, 1);
    if (col) out.base["grid-column"] = cs > 1 ? `${col} / span ${cs}` : String(col);
    if (r) out.base["grid-row"] = rs > 1 ? `${r} / span ${rs}` : String(r);
    if (!u.free && parent.layout === "grid" && (col || r)) {
      out.mobile["grid-column"] = "auto";
      out.mobile["grid-row"] = "auto";
    }
    const js = GRID_ALIGN[opts.cell.justifySelf ?? ""];
    const as = GRID_ALIGN[opts.cell.alignSelf ?? ""];
    if (js) out.base["justify-self"] = js;
    if (as) out.base["align-self"] = as;
  }

  // A row stacked on mobile: children keep their own height (the column stretches them across).
  if (!u.free && row && opts.parentStacks) out.mobile.flex = "0 0 auto";
  return out;
}

/** Grid cells by child id, and the children in reading order (row, then column) for mobile stacking. */
export function gridCells(s: Shape): Map<string, GridCell> {
  const out = new Map<string, GridCell>();
  for (const cell of Object.values(s.layoutGridCells ?? {}))
    for (const id of cell?.shapes ?? []) out.set(id, cell);
  return out;
}

/**
 * Freely positioned child inside a free container (research P6): absolute,
 * every length in the container's `cqw`. `z` keeps Penpot's painting order
 * although the DOM order is reversed.
 */
export function freeItemCss(c: Shape, parent: Shape, u: Units, z: number): Style {
  const b = box(c);
  const pb = box(parent);
  return {
    position: "absolute",
    left: u.len(b.x - pb.x),
    top: u.len(b.y - pb.y),
    width: u.len(b.width),
    height: u.len(b.height),
    "z-index": String(z),
  };
}

/** The free container itself: as wide as drawn at most, shrinking in proportion. */
export function freeContainerCss(s: Shape, asBoard: boolean): Style {
  const b = box(s);
  const w = Math.max(1, round(b.width));
  const h = Math.max(1, round(b.height));
  return {
    position: "relative",
    "container-type": "inline-size",
    ...(asBoard ? { width: "100%", "max-width": `${w}px`, margin: "0 auto" } : {}),
    "aspect-ratio": `${w} / ${h}`,
  };
}
