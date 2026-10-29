import { describe, expect, it } from "vitest";

import { countBlocks } from "../src/blocks";

const page = (component: unknown) => ({ pages: [{ frames: [{ component }] }] });

describe("countBlocks", () => {
  it("returns zeros for empty / non-object input", () => {
    expect(countBlocks(null)).toEqual({ total: 0, leadForm: 0, leadFormInCarousel: 0, byType: {} });
    expect(countBlocks({})).toEqual({ total: 0, leadForm: 0, leadFormInCarousel: 0, byType: {} });
  });

  it("counts blocks by data-block attribute, nested", () => {
    const tree = page({
      attributes: { "data-block": "hero" },
      components: [
        { attributes: { "data-block": "rich-text" } },
        { components: [{ attributes: { "data-block": "lead-form" } }] },
      ],
    });
    const c = countBlocks(tree);
    expect(c.total).toBe(3);
    expect(c.leadForm).toBe(1);
    expect(c.byType).toEqual({ hero: 1, "rich-text": 1, "lead-form": 1 });
  });

  it("flags multiple lead-form blocks", () => {
    const tree = page({
      components: [
        { attributes: { "data-block": "lead-form" } },
        { attributes: { "data-block": "lead-form" } },
      ],
    });
    expect(countBlocks(tree).leadForm).toBe(2);
  });

  it("ignores unknown block markers", () => {
    const tree = page({ attributes: { "data-block": "not-a-real-block" } });
    expect(countBlocks(tree).total).toBe(0);
  });

  it("handles the {models:[]} component shape", () => {
    const tree = page({ components: { models: [{ attributes: { "data-block": "lead-form" } }] } });
    expect(countBlocks(tree).leadForm).toBe(1);
  });

  it("does not count GrapesJS-native components by type (e.g. <img> is type 'image')", () => {
    const tree = page({
      attributes: { "data-block": "image" },
      components: [{ type: "image", tagName: "img", attributes: { src: "/x.png" } }],
    });
    const c = countBlocks(tree);
    expect(c.total).toBe(1);
    expect(c.byType).toEqual({ image: 1 });
  });

  it("counts the 012 layout blocks and still finds a lead form nested in a column", () => {
    const tree = page({
      components: [
        {
          attributes: { "data-block": "section" },
          components: [
            {
              attributes: { "data-block-inner": "" },
              components: [
                {
                  attributes: { "data-block": "columns", "data-cols": "2" },
                  components: [
                    { attributes: { "data-block": "column" }, components: [{ attributes: { "data-block": "hero" } }] },
                    { attributes: { "data-block": "column" }, components: [{ attributes: { "data-block": "lead-form" } }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const c = countBlocks(tree);
    expect(c.leadForm).toBe(1);
    expect(c.byType).toEqual({ section: 1, columns: 1, column: 2, hero: 1, "lead-form": 1 });
  });

  it("counts a custom-code block like any block, without touching the lead-form count (014)", () => {
    const c = countBlocks(
      page({
        components: [
          { attributes: { "data-block": "hero" } },
          { attributes: { "data-block": "custom-code", "data-code-id": "a1" } },
          { attributes: { "data-block": "lead-form" } },
        ],
      }),
    );
    expect(c.byType).toEqual({ hero: 1, "custom-code": 1, "lead-form": 1 });
    expect(c.leadForm).toBe(1);
  });

  describe("016 — carousel", () => {
    const slide = (...components: unknown[]) => ({ attributes: { "data-block": "carousel-slide" }, components });
    const carousel = (...slides: unknown[]) => ({ attributes: { "data-block": "carousel" }, components: slides });
    const leadForm = { attributes: { "data-block": "lead-form" } };

    it("counts the carousel and its slides", () => {
      const c = countBlocks(page({ components: [carousel(slide(), slide(), slide())] }));
      expect(c.byType).toEqual({ carousel: 1, "carousel-slide": 3 });
      expect(c.leadFormInCarousel).toBe(0);
    });

    it("does not flag a lead form outside any carousel", () => {
      const c = countBlocks(page({ components: [carousel(slide()), leadForm] }));
      expect(c.leadForm).toBe(1);
      expect(c.leadFormInCarousel).toBe(0);
    });

    it("flags a lead form directly in a slide", () => {
      const c = countBlocks(page({ components: [carousel(slide(leadForm))] }));
      expect(c.leadForm).toBe(1);
      expect(c.leadFormInCarousel).toBe(1);
    });

    it("flags a lead form nested in a Section inside a slide", () => {
      const section = { attributes: { "data-block": "section" }, components: [{ components: [leadForm] }] };
      const c = countBlocks(page({ components: [carousel(slide(section)), leadForm] }));
      expect(c.leadForm).toBe(2);
      expect(c.leadFormInCarousel).toBe(1);
    });
  });
});
