import { describe, expect, it } from "vitest";

import { rejectInlineImages } from "../src/hooks/pages-no-inline-images";

const call = (data: unknown) => rejectInlineImages({ data } as never);

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

describe("rejectInlineImages (builder body-size guard)", () => {
  it("passes a page with no builder data", () => {
    expect(call({ title: "x" })).toEqual({ title: "x" });
  });

  it("passes when images are referenced by URL", () => {
    const data = {
      builder: {
        html: '<figure data-block="image"><img src="/api/media/file/hero.png"></figure>',
        css: "*{box-sizing:border-box}",
        projectData: {
          pages: [{ frames: [{ component: { attributes: { src: "/api/media/file/hero.png" } } }] }],
        },
      },
    };
    expect(call(data)).toBe(data);
  });

  it("rejects an inline base64 image in builder.html", () => {
    expect(() => call({ builder: { html: `<img src="${PNG}">` } })).toThrow(
      /inline \(base64\) image/,
    );
  });

  it("rejects an inline base64 image in builder.css", () => {
    expect(() => call({ builder: { css: `.hero{background:url(${PNG})}` } })).toThrow(
      /Media library/,
    );
  });

  it("rejects an inline base64 image nested in builder.projectData", () => {
    const projectData = { pages: [{ frames: [{ component: { attributes: { src: PNG } } }] }] };
    expect(() => call({ builder: { projectData } })).toThrow(/inline \(base64\) image/);
  });

  it("ignores a non-image data URI", () => {
    const data = { builder: { html: '<a href="data:text/plain;base64,SGk=">x</a>' } };
    expect(call(data)).toBe(data);
  });
});
