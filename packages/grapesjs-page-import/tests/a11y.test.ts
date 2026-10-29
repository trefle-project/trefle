import { describe, expect, it } from "vitest";

import { checkAccessibility, contrastRatio, type A11yItem } from "../src/a11y";

/** 012-url-page-import (T026, research R11, FR-030). */
const text = (over: Partial<Extract<A11yItem, { kind: "text" }>>): A11yItem => ({
  kind: "text",
  tag: "p",
  color: "#000000",
  background: "#ffffff",
  where: "Section 1",
  ...over,
});

describe("contrastRatio", () => {
  it("matches the WCAG formula", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#047857")).toBeCloseTo(5.48, 1);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(contrastRatio("red", "#ffffff")).toBeNull();
  });
});

describe("checkAccessibility", () => {
  it("passes normal text at 4.5:1 and fails it below", () => {
    expect(checkAccessibility([text({ color: "#767676" })])).toEqual([]);
    const [f] = checkAccessibility([text({ color: "#777777" })]);
    expect(f).toMatchObject({ kind: "low-contrast", where: "Section 1" });
    expect(f!.detail).toContain("4.5:1");
  });

  it("uses 3:1 for large text (≥ 24px, or ≥ 18.66px bold)", () => {
    expect(checkAccessibility([text({ color: "#949494", fontSize: 24 })])).toEqual([]);
    expect(checkAccessibility([text({ color: "#949494", fontSize: 19, bold: true })])).toEqual([]);
    expect(checkAccessibility([text({ color: "#949494", fontSize: 19 })])[0]?.kind).toBe("low-contrast");
    expect(checkAccessibility([text({ color: "#a0a0a0", fontSize: 30 })])[0]?.kind).toBe("low-contrast");
  });

  it("reports text over a background image as not verifiable", () => {
    expect(checkAccessibility([text({ background: "image" })])).toEqual([
      { kind: "contrast-unverifiable", where: "Section 1" },
    ]);
  });

  it("reports a skipped heading level (h1 → h3) and a first heading below h1", () => {
    const f = checkAccessibility([text({ tag: "h1" }), text({ tag: "h3", where: "Section 2" })]);
    expect(f).toEqual([{ kind: "heading-skip", where: "Section 2", detail: "h1 → h3" }]);
    expect(checkAccessibility([text({ tag: "h2" })])[0]?.kind).toBe("heading-skip");
    expect(checkAccessibility([text({ tag: "h1" }), text({ tag: "h2" }), text({ tag: "h2" }), text({ tag: "h1" }), text({ tag: "h2" })])).toEqual([]);
  });

  it("reports an empty link text and a missing alt, not a decorative empty alt", () => {
    expect(checkAccessibility([{ kind: "link", text: "  ", where: "Bouton" }])).toEqual([{ kind: "empty-link", where: "Bouton" }]);
    expect(checkAccessibility([{ kind: "link", text: "Go", where: "Bouton" }])).toEqual([]);
    expect(checkAccessibility([{ kind: "image", alt: null, where: "Image" }])).toEqual([{ kind: "missing-alt", where: "Image" }]);
    expect(checkAccessibility([{ kind: "image", alt: "", where: "Image" }])).toEqual([]); // decorative
    expect(checkAccessibility([{ kind: "image", alt: "Un potager", where: "Image" }])).toEqual([]);
  });
});
