import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageShell } from "../src/components/page-shell";
import type { PageCustomCode, PublishedPage } from "../src/lib/payload-client";

/**
 * 014-custom-code-editing, User Story 3 (research R5) — each « Code
 * personnalisé » placeholder renders its own row's code, in place, keeping
 * the layout the editor gave the block.
 */
const NONCE = "N";
const placeholder = (id: string, extra = "") => `<div data-block="custom-code" data-code-id="${id}"${extra}></div>`;

const render = (html: string, customCode: PageCustomCode, code = true) =>
  renderToStaticMarkup(
    <PageShell
      page={
        {
          id: "1",
          title: "T",
          path: "/t",
          domain: "d1",
          builder: { html, css: "" },
          form: { fields: [], submitLabel: "Envoyer", successMessage: "", consentPurposeText: "", privacyNoticeUrl: "", privacyNoticeVersion: "" },
          customCode,
        } as PublishedPage
      }
      formToken="t"
      code={code ? { nonce: NONCE } : undefined}
    />,
  );

describe("PageShell — « Code personnalisé » blocks (014 US3)", () => {
  it("renders a block's code at its position, with the nonce, and keeps the placeholder's id/class/style", () => {
    const html = render(
      `<section data-block="hero"><h1>Avant</h1></section>${placeholder("cal", ' id="b1" class="widget" style="margin:0 auto;max-width:600px"')}<p>Après</p>`,
      { blocks: [{ codeId: "cal", code: '<div id="calendly"></div><script>go()</script>', consent: "essential" }] },
    );
    expect(html).toContain(
      `<div id="b1" class="widget" style="margin:0 auto;max-width:600px" data-tf-code="block"><div id="calendly"></div><script nonce="${NONCE}">go()</script></div>`,
    );
    expect(html.indexOf("Avant")).toBeLessThan(html.indexOf('id="calendly"'));
    expect(html.indexOf('id="calendly"')).toBeLessThan(html.indexOf("Après"));
  });

  it("works nested in a section › columns › column", () => {
    const html = render(
      `<section data-block="section"><div data-block="columns"><div data-block="column">${placeholder("m")}</div></div></section>`,
      { blocks: [{ codeId: "m", code: "<iframe src=\"https://maps.example/x\"></iframe>", consent: "essential" }] },
    );
    expect(html).toMatch(/<div data-block="column"><div data-tf-code="block"><iframe src="https:\/\/maps\.example\/x"><\/iframe><\/div><\/div>/);
  });

  it("renders a consent block as an inert template in place (its position stays empty until accepted)", () => {
    const html = render(placeholder("px"), { blocks: [{ codeId: "px", code: "<script>pixel()</script>", consent: "consent" }] });
    expect(html).toContain(`<div data-tf-code="block"><template data-tf-consent=""><script nonce="${NONCE}">pixel()</script></template></div>`);
  });

  it("renders nothing for an unknown id, an empty block, or without a request context", () => {
    expect(render(placeholder("ghost"), { blocks: [] })).not.toContain("data-tf-code");
    expect(render(placeholder("e"), { blocks: [{ codeId: "e", code: "" }] })).not.toContain("data-tf-code");
    expect(render(placeholder("a"), { blocks: [{ codeId: "a", code: "<b>x</b>", consent: "essential" }] }, false)).not.toContain("<b>x</b>");
  });

  it("renders several blocks each with its own code, in page order", () => {
    const html = render(placeholder("one") + "<hr>" + placeholder("two"), {
      blocks: [
        { codeId: "two", code: "<i>deux</i>", consent: "essential" },
        { codeId: "one", code: "<i>un</i>", consent: "essential" },
      ],
    });
    expect(html.indexOf("<i>un</i>")).toBeLessThan(html.indexOf("<hr/>"));
    expect(html.indexOf("<hr/>")).toBeLessThan(html.indexOf("<i>deux</i>"));
  });

  it("never takes code from the page HTML itself", () => {
    // A placeholder carrying markup of its own (e.g. pasted in the « Code »
    // view) is still just a placeholder: its content is discarded.
    const html = render(`<div data-block="custom-code" data-code-id="a"><em>injected</em></div>`, {
      blocks: [{ codeId: "a", code: "<b>stored</b>", consent: "essential" }],
    });
    expect(html).toContain("<b>stored</b>");
    expect(html).not.toContain("injected");
  });

  it("leaves the lead form replacement untouched", () => {
    const html = render(`${placeholder("a")}<div data-block="lead-form" id="form"></div>`, {
      blocks: [{ codeId: "a", code: "<b>x</b>", consent: "essential" }],
    });
    expect(html).toContain("<b>x</b>");
    expect(html).toContain("Envoyer");
  });
});
