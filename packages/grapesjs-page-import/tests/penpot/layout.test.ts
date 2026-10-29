import { describe, expect, it } from "vitest";

import {
  containerCss,
  fitsMobile,
  freeItemCss,
  itemCss,
  mobileGap,
  mobilePad,
  tabletPad,
} from "../../src/penpot/layout";
import type { Shape } from "../../src/penpot/model";
import { cqwUnits, PX } from "../../src/penpot/style";

/** 015-penpot-site-import T010 — research P4–P6. */

const sel = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
  x1: x,
  y1: y,
  x2: x + width,
  y2: y + height,
});
const frame = (over: Partial<Shape>): Shape => ({
  id: "f",
  name: "f",
  type: "frame",
  selrect: sel(0, 0, 1200, 400),
  ...over,
});
const kid = (id: string, x: number, w: number, over: Partial<Shape> = {}): Shape => ({
  id,
  name: id,
  type: "frame",
  selrect: sel(x, 0, w, 100),
  ...over,
});

describe("flex containers", () => {
  it("direction, wrap, gap, padding (p1..p4 = top right bottom left), justify, align", () => {
    const s = frame({
      layout: "flex",
      layoutFlexDir: "row",
      layoutWrapType: "wrap",
      layoutGap: { rowGap: 8, columnGap: 16 },
      layoutPadding: { p1: 1, p2: 2, p3: 3, p4: 4 },
      layoutJustifyContent: "space-between",
      layoutAlignItems: "center",
      layoutAlignContent: "start",
    });
    expect(containerCss(s, [], PX).base).toEqual({
      padding: "1px 2px 3px 4px",
      display: "flex",
      "flex-direction": "row",
      "flex-wrap": "wrap",
      gap: "8px 16px",
      "justify-content": "space-between",
      "align-items": "center",
      "align-content": "flex-start",
    });
  });
  it("a wide row wraps on tablet and stacks on mobile; a row that fits 360 px, or an icon + label, does not", () => {
    const row = frame({ layout: "flex", layoutFlexDir: "row", layoutGap: { columnGap: 20 } });
    const wide = containerCss(row, [kid("a", 0, 400), kid("b", 420, 400)], PX);
    expect(wide.tablet["flex-wrap"]).toBe("wrap");
    expect(wide.mobile).toMatchObject({ "flex-direction": "column", "align-items": "stretch" });
    expect(fitsMobile(row, [kid("a", 0, 100), kid("b", 120, 100)])).toBe(true);
    expect(fitsMobile(row, [kid("icon", 0, 18), kid("label", 48, 347)])).toBe(true);
    expect(containerCss(row, [kid("a", 0, 100), kid("b", 120, 100)], PX).mobile).toEqual({});
  });
  it("row-reverse stacks as column-reverse", () => {
    const row = frame({ layout: "flex", layoutFlexDir: "row-reverse" });
    expect(
      containerCss(row, [kid("a", 0, 400), kid("b", 420, 400)], PX).mobile["flex-direction"],
    ).toBe("column-reverse");
  });
  it("large paddings and gaps shrink, capped", () => {
    expect([tabletPad(320), mobilePad(320), mobilePad(30), mobilePad(20), mobileGap(120)]).toEqual([
      64, 24, 16, 20, 32,
    ]);
    const s = frame({
      layout: "flex",
      layoutFlexDir: "column",
      layoutPadding: { p1: 80, p2: 320, p3: 80, p4: 320 },
      layoutGap: { rowGap: 60, columnGap: 0 },
    });
    const css = containerCss(s, [], PX);
    expect(css.tablet).toEqual({ padding: "80px 64px 80px 64px", gap: "45px 0px" });
    expect(css.mobile).toEqual({ padding: "80px 24px 80px 24px", gap: "30px 0px" });
  });
  it("nothing responsive inside a free container", () => {
    const row = frame({
      layout: "flex",
      layoutFlexDir: "row",
      layoutPadding: { p2: 200, p4: 200 },
    });
    const css = containerCss(row, [kid("a", 0, 400), kid("b", 420, 400)], cqwUnits(1440));
    expect(css.tablet).toEqual({});
    expect(css.mobile).toEqual({});
    expect(css.base.padding).toMatch(/cqw/);
  });
});

describe("grid containers", () => {
  it("tracks: flex → minmax(0, Nfr), fixed → px, percent → %, auto", () => {
    const g = frame({
      layout: "grid",
      layoutGridColumns: [
        { type: "flex", value: 1 },
        { type: "fixed", value: 24 },
        { type: "percent", value: 25 },
        { type: "auto" },
      ],
      layoutGridRows: [{ type: "auto" }],
    });
    expect(containerCss(g, [], PX).base).toMatchObject({
      display: "grid",
      "grid-template-columns": "minmax(0, 1fr) 24px 25% auto",
      "grid-template-rows": "auto",
    });
  });
  it("two or more stretchy tracks collapse (2 on tablet, 1 on mobile); an icon + text grid does not", () => {
    const three = frame({
      layout: "grid",
      layoutGridColumns: [
        { type: "flex", value: 1 },
        { type: "flex", value: 1 },
        { type: "flex", value: 1 },
      ],
    });
    const css = containerCss(three, [], PX);
    expect(css.tablet["grid-template-columns"]).toBe("repeat(2, minmax(0, 1fr))");
    expect(css.mobile["grid-template-columns"]).toBe("minmax(0, 1fr)");
    const iconText = frame({
      layout: "grid",
      layoutGridColumns: [
        { type: "fixed", value: 24 },
        { type: "flex", value: 1 },
      ],
    });
    expect(containerCss(iconText, [], PX).mobile["grid-template-columns"]).toBeUndefined();
  });
  it("cells: explicit placement on desktop, auto on mobile; items may shrink", () => {
    const g = frame({
      layout: "grid",
      layoutGridColumns: [
        { type: "flex", value: 1 },
        { type: "flex", value: 1 },
      ],
    });
    const css = itemCss(kid("a", 0, 300), g, PX, {
      leaf: false,
      cell: { row: 1, column: 2, columnSpan: 2, rowSpan: 1, justifySelf: "center" },
    });
    expect(css.base).toMatchObject({
      "grid-column": "2 / span 2",
      "grid-row": "1",
      "min-width": "0",
      "justify-self": "center",
    });
    expect(css.mobile).toEqual({ "grid-column": "auto", "grid-row": "auto" });
  });
});

describe("item sizing", () => {
  const row = frame({ layout: "flex", layoutFlexDir: "row" });
  const col = frame({ layout: "flex", layoutFlexDir: "column" });
  it("fix → min(width, 100%) so ancestors can shrink; fill → flex 1 / stretch; auto → content", () => {
    expect(itemCss(kid("a", 0, 347), col, PX, { leaf: false }).base.width).toBe("min(347px, 100%)");
    expect(
      itemCss(kid("a", 0, 347, { layoutItemHSizing: "fill" }), row, PX, { leaf: false }).base,
    ).toMatchObject({ flex: "1 1 0", "min-width": "0" });
    expect(
      itemCss(kid("a", 0, 347, { layoutItemHSizing: "fill" }), col, PX, { leaf: false }).base[
        "align-self"
      ],
    ).toBe("stretch");
    expect(
      itemCss(kid("a", 0, 347, { layoutItemHSizing: "auto" }), col, PX, { leaf: false }).base.width,
    ).toBeUndefined();
  });
  it("in a row, a small fixed item (avatar, icon, button) keeps its width; a wide one may shrink", () => {
    expect(itemCss(kid("avatar", 0, 49), row, PX, { leaf: false }).base).toMatchObject({
      width: "49px",
      "flex-shrink": "0",
    });
    expect(itemCss(kid("card", 0, 400), row, PX, { leaf: false }).base).toMatchObject({
      width: "min(400px, 100%)",
      "flex-shrink": "1",
    });
  });
  it("in a grid, « fill » stretches the item whatever the grid's alignment", () => {
    const grid = frame({ layout: "grid", layoutAlignItems: "center" });
    const fill = { layoutItemHSizing: "fill", layoutItemVSizing: "fill" } as const;
    expect(itemCss(kid("a", 0, 600, fill), grid, PX, { leaf: false }).base).toMatchObject({
      "align-self": "stretch",
      "justify-self": "stretch",
    });
    expect(itemCss(kid("a", 0, 600), grid, PX, { leaf: false }).base["align-self"]).toBeUndefined();
  });
  it("fixed height: exact on leaves, a minimum on containers", () => {
    expect(itemCss(kid("a", 0, 10), col, PX, { leaf: true }).base.height).toBe("100px");
    expect(itemCss(kid("a", 0, 10), col, PX, { leaf: false }).base["min-height"]).toBe("100px");
  });
  it("a child of a row that stacks on mobile keeps its height there", () => {
    expect(itemCss(kid("a", 0, 400), row, PX, { leaf: false, parentStacks: true }).mobile).toEqual({
      flex: "0 0 auto",
    });
  });
  it("absolute items: left and width relative to the parent; decorations hidden on mobile", () => {
    const css = itemCss(kid("line", 600, 1, { layoutItemAbsolute: true }), row, PX, { leaf: true });
    expect(css.base).toMatchObject({
      position: "absolute",
      left: "50%",
      width: "0.083%",
      top: "0px",
      height: "100px",
    });
    expect(css.mobile).toEqual({ display: "none" });
  });
  it("free items: absolute, in cqw, painting order as z-index", () => {
    expect(
      freeItemCss(kid("a", 144, 288), frame({ selrect: sel(0, 0, 1440, 900) }), cqwUnits(1440), 3),
    ).toEqual({
      position: "absolute",
      left: "10cqw",
      top: "0cqw",
      width: "20cqw",
      height: "6.944cqw",
      "z-index": "3",
    });
  });
});
