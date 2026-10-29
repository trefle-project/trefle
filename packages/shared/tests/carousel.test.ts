import { describe, expect, it } from "vitest";

import { parseCarouselSettings } from "../src/carousel";

const defaults = { label: "Carrousel", perView: 1, autoplay: null, arrows: true, dots: true };

describe("parseCarouselSettings (016, contracts/markup.md)", () => {
  it("gives the defaults when no attribute is set", () => {
    expect(parseCarouselSettings({})).toEqual(defaults);
  });

  it.each([
    ["0", 1],
    ["2", 2],
    ["2.4", 2],
    ["7", 3],
    ["abc", 1],
    ["", 1],
  ])("data-per-view %j → %d", (value, perView) => {
    expect(parseCarouselSettings({ "data-per-view": value }).perView).toBe(perView);
  });

  it.each([
    [undefined, null],
    ["", null],
    ["0", null],
    ["-4", null],
    ["x", null],
    ["2", 3],
    ["4", 4],
    ["60", 10],
  ])("data-autoplay %j → %j", (value, autoplay) => {
    expect(parseCarouselSettings({ "data-autoplay": value }).autoplay).toBe(autoplay);
  });

  it.each([
    ["false", false],
    ["true", true],
    ["", true],
    [undefined, true],
  ])("data-arrows / data-dots %j → %j", (value, shown) => {
    const s = parseCarouselSettings({ "data-arrows": value, "data-dots": value });
    expect(s.arrows).toBe(shown);
    expect(s.dots).toBe(shown);
  });

  it("uses the trimmed aria-label, or the default when blank", () => {
    expect(parseCarouselSettings({ "aria-label": "  Avis clients " }).label).toBe("Avis clients");
    expect(parseCarouselSettings({ "aria-label": "   " }).label).toBe("Carrousel");
  });
});
