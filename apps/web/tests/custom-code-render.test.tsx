import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageShell } from "../src/components/page-shell";
import { HeadSnippet, splitHeadSnippet } from "../src/lib/custom-code";
import type { PageCustomCode, PublishedPage } from "../src/lib/payload-client";

/**
 * 014-custom-code-editing — contracts/rendering.md "Per-snippet emission
 * rule" and "Output order", on the real PageShell.
 */
const NONCE = "TESTNONCE";
const page = (customCode: PageCustomCode): PublishedPage =>
  ({
    id: "1",
    title: "T",
    path: "/t",
    domain: "d1",
    builder: { html: '<section data-block="hero"><h1>Contenu</h1></section>', css: "" },
    form: { fields: [], submitLabel: "", successMessage: "", consentPurposeText: "", privacyNoticeUrl: "", privacyNoticeVersion: "" },
    customCode,
  }) as PublishedPage;

const render = (customCode: PageCustomCode, opts: { preview?: boolean; code?: boolean } = {}) =>
  renderToStaticMarkup(
    <PageShell
      page={page(customCode)}
      formToken="t"
      preview={opts.preview}
      code={opts.code === false ? undefined : { nonce: NONCE, preview: opts.preview }}
    />,
  );

describe("PageShell custom code — emission rule", () => {
  it("emits an « Essentiel » snippet live, with the nonce on every script", () => {
    const html = render({ bodyEnd: { code: "<script>window.a=1</script><script src='https://x.example/w.js'></script>", consent: "essential" } });
    expect(html).toContain(`<script nonce="${NONCE}">window.a=1</script><script nonce="${NONCE}" src='https://x.example/w.js'></script>`);
    expect(html).not.toContain("<template");
  });

  it("wraps a consent snippet in an inert template, and adds the runner", () => {
    const html = render({ bodyEnd: { code: "<script>window.b=1</script>", consent: "consent" } });
    expect(html).toContain(`<template data-tf-consent="">`);
    expect(html).toMatch(/<template data-tf-consent="">\s*<script nonce="TESTNONCE">window\.b=1<\/script><\/template>/);
  });

  it("treats a missing consent setting as « consent » (the safe side)", () => {
    expect(render({ bodyEnd: { code: "<script>x()</script>" } })).toContain("<template data-tf-consent");
  });

  it("emits nothing for an empty snippet", () => {
    const html = render({ head: { code: "   ", consent: "essential" }, bodyEnd: { code: "" } });
    expect(html).not.toContain("data-tf-code");
  });

  it("emits no page code at all when the route gives no request context", () => {
    const html = render({ bodyEnd: { code: "<script>x()</script>", consent: "essential" } }, { code: false });
    expect(html).not.toContain("x()");
  });

  it("puts the head snippet before the page content and the end snippet after it", () => {
    const html = render({
      head: { code: "<script>window.head=1</script>", consent: "essential" },
      bodyEnd: { code: "<script>window.end=1</script>", consent: "essential" },
    });
    const head = html.indexOf("window.head=1");
    const content = html.indexOf("<h1>Contenu</h1>");
    const end = html.indexOf("window.end=1");
    expect(head).toBeGreaterThan(-1);
    expect(head).toBeLessThan(content);
    expect(content).toBeLessThan(end);
  });

  it("replaces a nonce pasted with the vendor snippet", () => {
    expect(render({ bodyEnd: { code: '<script nonce="stale">x()</script>', consent: "essential" } })).toContain(
      `<script nonce="${NONCE}">x()</script>`,
    );
  });
});

describe("head snippet split (research R2)", () => {
  it("separates meta/link/title from scripts, leaving scripts and noscripts untouched", () => {
    const code =
      '<meta name="google-site-verification" content="abc"><link rel="preconnect" href="https://x.example">' +
      "<script>var s='<link rel=\"x\">';</script><noscript><img src=\"https://x.example/p.gif\"></noscript><title>T</title>";
    const { rest } = splitHeadSnippet(code);
    expect(rest).toBe("<script>var s='<link rel=\"x\">';</script><noscript><img src=\"https://x.example/p.gif\"></noscript>");
  });

  it("renders head tags as elements (hoisted by React) even when the rest waits for a consent", () => {
    const html = renderToStaticMarkup(
      <HeadSnippet snippet={{ code: '<meta name="v" content="1"><script>x()</script>', consent: "consent" }} ctx={{ nonce: NONCE }} />,
    );
    expect(html).toContain('<meta name="v" content="1"/>');
    expect(html).toMatch(/<template data-tf-consent="">\s*<script nonce="TESTNONCE">x\(\)<\/script><\/template>/);
  });
});
