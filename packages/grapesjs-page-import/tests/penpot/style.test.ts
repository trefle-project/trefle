import { describe, expect, it } from "vitest";

import type { Shape } from "../../src/penpot/model";
import {
  color,
  cqwUnits,
  effectsCss,
  fillCss,
  flatten,
  gradientCss,
  PX,
  radiusCss,
  shadowCss,
  strokeCss,
} from "../../src/penpot/style";

/** 015-penpot-site-import T012 — research P4. */

const shape = (over: Partial<Shape>): Shape => ({ id: "s", type: "rect", name: "s", ...over });

describe("colours", () => {
  it("hex, short hex, opacity → rgba, anything else dropped", () => {
    expect(color("#ABCDEF")).toBe("#abcdef");
    expect(color("#fff")).toBe("#ffffff");
    expect(color("#000000", 0.08)).toBe("rgba(0,0,0,0.08)");
    for (const bad of ["red", "#12345z", "url(x)", 3, undefined])
      expect(color(bad)).toBeUndefined();
  });
  it("flattens a translucent colour over an opaque background (contrast checks)", () => {
    // The Journal's e-mail field: rgba(0,0,0,0.3) text on rgba(0,0,0,0.05) over white.
    const field = flatten("rgba(0,0,0,0.05)", "#ffffff");
    expect(field).toBe("#f2f2f2");
    expect(flatten("rgba(0,0,0,0.3)", field!)).toBe("#a9a9a9");
    expect(flatten("#ABCDEF", "#000000")).toBe("#abcdef");
    expect(flatten("rgba(0,0,0,0.3)", "image")).toBeUndefined();
    expect(flatten(undefined, "#ffffff")).toBeUndefined();
  });
});

describe("fills", () => {
  it("solid, gradient, image; only the first fill, extras counted", () => {
    expect(fillCss([{ fillColor: "#112233", fillOpacity: 1 }]).style).toEqual({
      "background-color": "#112233",
    });
    const g = fillCss([
      {
        fillColorGradient: {
          type: "linear",
          startX: 0.5,
          startY: 0,
          endX: 0.5,
          endY: 1,
          stops: [
            { color: "#000000", offset: 0 },
            { color: "#ffffff", offset: 1 },
          ],
        },
      },
    ]);
    expect(g.style["background-image"]).toBe("linear-gradient(180deg, #000000 0%, #ffffff 100%)");
    const img = fillCss([{ fillImage: { id: "m-1" } }, { fillColor: "#ffffff" }]);
    expect(img.image?.id).toBe("m-1");
    expect(img.extraFills).toBe(1);
    expect(fillCss(undefined).style).toEqual({});
  });
  it("radial gradients and invalid stops", () => {
    expect(
      gradientCss({
        type: "radial",
        startX: 0.5,
        startY: 0.5,
        endX: 1,
        endY: 1,
        stops: [
          { color: "#ff0000", offset: 0 },
          { color: "#0000ff", offset: 1, opacity: 0.5 },
        ],
      }),
    ).toBe("radial-gradient(circle at 50% 50%, #ff0000 0%, rgba(0,0,255,0.5) 100%)");
    expect(
      gradientCss({
        type: "linear",
        startX: 0,
        startY: 0,
        endX: 1,
        endY: 1,
        stops: [
          { color: "nope", offset: 0 },
          { color: "#fff", offset: 1 },
        ],
      }),
    ).toBeUndefined();
  });
});

describe("strokes, radii, shadows, effects", () => {
  it("inner → border-box border; center/outer → outline; extra strokes counted", () => {
    expect(
      strokeCss([{ strokeColor: "#000000", strokeWidth: 2, strokeAlignment: "inner" }], PX).style,
    ).toEqual({ border: "2px solid #000000", "box-sizing": "border-box" });
    expect(
      strokeCss(
        [
          {
            strokeColor: "#000000",
            strokeWidth: 2,
            strokeAlignment: "center",
            strokeStyle: "dashed",
          },
        ],
        PX,
      ).style,
    ).toEqual({ outline: "2px dashed #000000", "outline-offset": "-1px" });
    expect(
      strokeCss(
        [
          { color: "#ff0000", opacity: 1, strokeWidth: 1, strokeAlignment: "outer" },
          { strokeColor: "#000000", strokeWidth: 1 },
        ],
        PX,
      ),
    ).toEqual({ style: { outline: "1px solid #ff0000", "outline-offset": "0" }, extraStrokes: 1 });
    expect(strokeCss([{ strokeColor: "#000000", strokeWidth: 0 }], PX).style).toEqual({});
  });
  it("radii: one value or four", () => {
    expect(radiusCss(shape({ r1: 8, r2: 8, r3: 8, r4: 8 }), PX)).toEqual({
      "border-radius": "8px",
    });
    expect(radiusCss(shape({ r1: 8, r2: 0, r3: 4, r4: 0 }), PX)).toEqual({
      "border-radius": "8px 0px 4px 0px",
    });
    expect(radiusCss(shape({}), PX)).toEqual({});
  });
  it("drop and inner shadows; hidden ones skipped; text shadows have no spread", () => {
    const s = shape({
      shadow: [
        {
          style: "drop-shadow",
          offsetX: 6,
          offsetY: 4,
          blur: 6,
          spread: 0,
          color: { color: "#000000", opacity: 0.15 },
        },
        {
          style: "inner-shadow",
          offsetX: 0,
          offsetY: 1,
          blur: 2,
          spread: 1,
          color: { color: "#ffffff", opacity: 1 },
        },
        { style: "drop-shadow", hidden: true, color: { color: "#000000" } },
      ],
    });
    expect(shadowCss(s, PX)["box-shadow"]).toBe(
      "6px 4px 6px 0px rgba(0,0,0,0.15), inset 0px 1px 2px 1px #ffffff",
    );
    expect(shadowCss(s, PX, true)["text-shadow"]).toBe(
      "6px 4px 6px rgba(0,0,0,0.15), 0px 1px 2px #ffffff",
    );
  });
  it("opacity, blur, rotation (reported), blend modes and masks (reported only)", () => {
    const e = effectsCss(
      shape({
        opacity: 0.5,
        blur: { value: 4 },
        rotation: 15,
        blendMode: "multiply",
        maskedGroup: true,
      }),
      PX,
    );
    expect(e.style).toEqual({ opacity: "0.5", filter: "blur(4px)", transform: "rotate(15deg)" });
    expect(e.notes.sort()).toEqual(["blend-mode", "mask", "rotation"]);
  });
  it("cqw units inside free containers", () => {
    expect(cqwUnits(1440).len(144)).toBe("10cqw");
    expect(radiusCss(shape({ r1: 14.4, r2: 14.4, r3: 14.4, r4: 14.4 }), cqwUnits(1440))).toEqual({
      "border-radius": "1cqw",
    });
  });
  it("clamps absurd numbers", () => {
    expect(strokeCss([{ strokeColor: "#000000", strokeWidth: 1e9 }], PX).style.border).toBe(
      "200px solid #000000",
    );
  });
});
