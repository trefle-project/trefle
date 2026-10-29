import { describe, expect, it } from "vitest";

import { exportHtml } from "../src/fields/grapesjs/exportHtml";

/**
 * Regression for a live bug: styling the GrapesJS canvas background (not a
 * block) makes `editor.getHtml()` wrap the whole export in a literal
 * `<body id="...">` tag. apps/web's DOMPurify allow-list excludes
 * `body`/`html` on purpose, so that tag — and the id its background-color
 * rule was keyed to — was silently stripped on publish, orphaning the CSS
 * rule with no error anywhere (reported: background colour "not applying").
 */
describe("exportHtml", () => {
  it("turns a <body id=...> wrapper into a <div> with the same id", () => {
    const raw = '<body id="itwm"><section id="i95l"><h1>Votre titre</h1></section></body>';
    expect(exportHtml(raw)).toBe('<div id="itwm"><section id="i95l"><h1>Votre titre</h1></section></div>');
  });

  it("preserves other attributes on the body tag (e.g. a class)", () => {
    const raw = '<body id="x" class="y"><p>hi</p></body>';
    expect(exportHtml(raw)).toBe('<div id="x" class="y"><p>hi</p></div>');
  });

  it("handles a bare <body> with no attributes", () => {
    const raw = "<body><p>hi</p></body>";
    expect(exportHtml(raw)).toBe("<div><p>hi</p></div>");
  });

  it("leaves ordinary exports (no wrapper-level styling) untouched", () => {
    const raw = '<section data-block="hero"><h1>Votre titre</h1></section>';
    expect(exportHtml(raw)).toBe(raw);
  });

  it("leaves an empty export untouched", () => {
    expect(exportHtml("")).toBe("");
  });
});
