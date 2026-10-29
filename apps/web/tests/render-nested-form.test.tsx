import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageShell } from "../src/components/page-shell";
import type { PublishedPage } from "../src/lib/payload-client";

/**
 * 012-url-page-import, FR-025 / US3 AS-4 — the lead-form block works inside
 * a Section and a Column exactly as at the top level. With the old string
 * split, a nested placeholder produced unbalanced fragments.
 */
const basePage = {
  id: "1",
  title: "Test",
  path: "/test",
  domain: "d1",
  form: { fields: [], submitLabel: "", successMessage: "", consentPurposeText: "", privacyNoticeUrl: "", privacyNoticeVersion: "" },
};

const nested =
  '<section data-block="section" style="padding:48px 24px"><div data-block-inner="" style="max-width:1120px;margin:0 auto">' +
  '<div data-block="columns" data-cols="2" style="display:flex;flex-wrap:wrap;gap:24px">' +
  '<div data-block="column" style="flex:1 1 calc((600px - 100%) * 999);min-width:0"><section data-block="hero"><h1>Offre</h1></section></div>' +
  '<div data-block="column" style="flex:1 1 calc((600px - 100%) * 999);min-width:0"><div data-block="lead-form" id="form" class="my-form" style="max-width:480px"></div></div>' +
  "</div></div></section>" +
  '<section data-block="rich-text"><p>Après</p></section>';

function render(html: string, css = "") {
  const page = { ...basePage, builder: { html, css } } as unknown as PublishedPage;
  return renderToStaticMarkup(<PageShell page={page} formToken="t" />);
}

describe("PageShell — lead form nested in Section › Columns › Column (012, FR-025)", () => {
  it("renders the real form inside its column, with the placeholder's own id/class/style", () => {
    const html = render(nested);
    const column = html.indexOf('<div data-block="column"', html.indexOf("<h1>Offre</h1>"));
    const form = html.indexOf('action="/api/leads"');
    expect(form).toBeGreaterThan(column);
    expect(html).toContain('<div id="form" class="my-form" style="max-width:480px">');
    // The section still closes after the form, then the next block follows.
    expect(html.indexOf("</section>", form)).toBeLessThan(html.indexOf("<p>Après</p>"));
    expect(html.match(/action="\/api\/leads"/g)).toHaveLength(1);
  });

  it("keeps the layout markup that publishing must not strip", () => {
    const html = render(nested);
    for (const marker of ['data-block="section"', "data-block-inner", 'data-block="columns"', 'data-cols="2"', 'data-block="column"']) {
      expect(html).toContain(marker);
    }
    expect(html).toContain("flex-wrap:wrap");
  });

  it("still applies the page background wrapper around a nested form", () => {
    const html = render(`<div id="ibody">${nested}</div>`, "#ibody{background-color:red}");
    expect(html).toContain('id="ibody" class="trefle-page-shell"');
    expect(html.match(/id="ibody"/g)).toHaveLength(1);
  });
});
