import { describe, expect, it } from "vitest";

import type { Shape } from "../../src/penpot/model";
import { toHtml } from "../../src/penpot/node";
import { readPenpotFile } from "../../src/penpot/read";
import {
  isVectorCluster,
  meaningfulName,
  pathData,
  svgNode,
  svgRawNode,
} from "../../src/penpot/svg";
import { scriptSvg } from "./builders";

/** 015-penpot-site-import T014 — research P9. */

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
const path = (id: string, d: string, over: Partial<Shape> = {}): Shape => ({
  id,
  name: id,
  type: "path",
  content: d,
  selrect: sel(10, 10, 20, 20),
  fills: [{ fillColor: "#000000" }],
  ...over,
});

describe("clusters", () => {
  const shapes = new Map<string, Shape>([
    [
      "icon",
      {
        id: "icon",
        name: "Icons / arrow",
        type: "group",
        shapes: ["p1", "c1"],
        selrect: sel(10, 10, 24, 24),
      },
    ],
    ["p1", path("p1", "M10,10L30,30")],
    [
      "c1",
      {
        id: "c1",
        name: "dot",
        type: "circle",
        selrect: sel(10, 10, 4, 4),
        fills: [{ fillColor: "#ff0000" }],
      },
    ],
    [
      "withText",
      {
        id: "withText",
        name: "Card",
        type: "group",
        shapes: ["p1", "t1"],
        selrect: sel(0, 0, 100, 100),
      },
    ],
    ["t1", { id: "t1", name: "t", type: "text", selrect: sel(0, 0, 10, 10) }],
    [
      "big",
      { id: "big", name: "Hero art", type: "group", shapes: ["p1"], selrect: sel(0, 0, 1440, 900) },
    ],
  ]);
  it("a small group of vectors is one svg; text inside or a big box is not", () => {
    expect(isVectorCluster(shapes.get("icon")!, shapes)).toBe(true);
    expect(isVectorCluster(shapes.get("withText")!, shapes)).toBe(false);
    expect(isVectorCluster(shapes.get("big")!, shapes)).toBe(false);
  });
  it("viewBox = the cluster's box, paths kept absolute, painting order kept", () => {
    const html = toHtml(svgNode(shapes.get("icon")!, shapes, "arrow")!);
    expect(html).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 10 24 24" role="img" aria-label="arrow"><path d="M10,10L30,30" fill="#000000"></path><ellipse cx="12" cy="12" rx="2" ry="2" fill="#ff0000"></ellipse></svg>',
    );
  });
  it("decorative (no meaningful name) → aria-hidden", () => {
    expect(toHtml(svgNode(shapes.get("p1")!, shapes)!)).toContain('aria-hidden="true"');
  });
});

describe("path data", () => {
  it("string data kept; segment lists converted; anything else refused", () => {
    expect(pathData("M0,0L1,1Z")).toBe("M0,0L1,1Z");
    expect(pathData("M0,0 url(x)")).toBeUndefined();
    expect(
      pathData([
        { command: "move-to", params: { x: 1, y: 2 } },
        { command: "curve-to", params: { c1x: 1, c1y: 2, c2x: 3, c2y: 4, x: 5, y: 6 } },
        { command: "line-to", relative: true, params: { x: 1, y: 1 } },
        { command: "close-path", params: {} },
      ]),
    ).toBe("M1,2C1,2,3,4,5,6l1,1Z");
    expect(pathData([{ command: "arc-to", params: {} }])).toBeUndefined();
  });
});

describe("meaningful names", () => {
  it.each([
    ["Rectangle 12", undefined],
    ["svg-path-4", undefined],
    ["IMG_2034", undefined],
    ["CleanShot 2024-06-21 at 16.46.52@2x", undefined],
    ["Sub-items / Atoms / Icons", undefined],
    ["logo-linkedin", "logo-linkedin"],
    ["Photo de l'équipe", "Photo de l'équipe"],
  ])("%s → %s", (name, expected) => expect(meaningfulName(name)).toBe(expected));
});

describe("svg-raw (FR-003)", () => {
  it("drops scripts, event handlers and external references; keeps allowed shapes and same-document anchors", () => {
    const f = readPenpotFile(scriptSvg());
    const shapes = f.shapes(f.pages[0]!.id);
    const html = toHtml(svgRawNode(shapes.get("svg-1")!, "Logo")!);
    expect(html).not.toMatch(/script|onload|onclick|alert|cms:3000|169\.254/);
    expect(html).toContain('<rect x="0" y="0" width="100" height="50" fill="#ff0000"></rect>');
    expect(html).toContain('<use href="#shape"></use>');
    expect(html).toContain('aria-label="Logo"');
  });
});
