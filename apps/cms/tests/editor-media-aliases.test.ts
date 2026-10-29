import { describe, expect, it } from "vitest";

import { applyMediaAliases } from "../src/fields/grapesjs/mediaAliases";

/**
 * A replaced image opens in the editor with its current file (2026-10-12):
 * old keys in projectData are mapped through the 017 alias map.
 */
const ORIGIN = "https://assets.example.com";
const ALIASES = { "photo-3fa1c09b.jpg": "photo-9c2e1d44.jpg", "fond-aaaa1111.png": "fond-bbbb2222.png" };

describe("applyMediaAliases", () => {
  it("maps image sources, inline styles and CSS rules", () => {
    const projectData = {
      pages: [
        {
          frames: [
            {
              component: {
                components: [
                  { type: "image", attributes: { src: `${ORIGIN}/photo-3fa1c09b.jpg` } },
                  { tagName: "div", attributes: { style: `background-image:url("${ORIGIN}/fond-aaaa1111.png")` } },
                  { type: "image", src: `${ORIGIN}/photo-3fa1c09b.jpg?w=400` },
                ],
              },
            },
          ],
        },
      ],
      styles: [{ selectors: ["#hero"], style: { "background-image": `url(${ORIGIN}/fond-aaaa1111.png)` } }],
    };
    const out = applyMediaAliases(projectData, ALIASES);
    const comps = out.pages[0]!.frames[0]!.component.components;
    expect(comps[0]!.attributes!.src).toBe(`${ORIGIN}/photo-9c2e1d44.jpg`);
    expect(comps[1]!.attributes!.style).toBe(`background-image:url("${ORIGIN}/fond-bbbb2222.png")`);
    expect(comps[2]!.src).toBe(`${ORIGIN}/photo-9c2e1d44.jpg?w=400`);
    expect(out.styles[0]!.style["background-image"]).toBe(`url(${ORIGIN}/fond-bbbb2222.png)`);
  });

  it("only replaces a whole path segment", () => {
    const out = applyMediaAliases({ a: `${ORIGIN}/xphoto-3fa1c09b.jpg`, b: `${ORIGIN}/photo-3fa1c09b.jpg.bak`, c: "photo-3fa1c09b.jpg" }, ALIASES);
    expect(out).toEqual({ a: `${ORIGIN}/xphoto-3fa1c09b.jpg`, b: `${ORIGIN}/photo-3fa1c09b.jpg.bak`, c: "photo-3fa1c09b.jpg" });
  });

  it("leaves other values, numbers and booleans alone and does not mutate the input", () => {
    const input = { n: 3, ok: true, none: null, src: `${ORIGIN}/other-12345678.jpg`, list: [`${ORIGIN}/photo-3fa1c09b.jpg`] };
    const copy = structuredClone(input);
    const out = applyMediaAliases(input, ALIASES);
    expect(input).toEqual(copy);
    expect(out).toEqual({ ...copy, list: [`${ORIGIN}/photo-9c2e1d44.jpg`] });
  });

  it("returns the input as is with an empty map", () => {
    const input = { src: `${ORIGIN}/photo-3fa1c09b.jpg` };
    expect(applyMediaAliases(input, {})).toBe(input);
  });
});
