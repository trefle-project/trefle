import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PageShell } from "../src/components/page-shell";
import type { PublishedPage } from "../src/lib/payload-client";

/**
 * 004-page-types, FR-002/SC-006 (plan.md Phase 5 risk note) — `pageType` is
 * an internal, editorial-only concept (Pages.ts) that must never reach the
 * renderer's output. `PublishedPage`/`PageShell` never declare or read it,
 * so this is a forward-looking regression guard: it trivially passes today
 * (PageShell never touches `.pageType`) and exists to catch a future change
 * that accidentally starts echoing it into the DOM.
 */
describe("PageShell (004-page-types, FR-002/SC-006)", () => {
  it("never renders the literal string 'pageType', even if the fetched page carries one", () => {
    // Cast in an extraneous pageType — PublishedPage never declares this
    // field; a real API response could still include it if the renderer's
    // read API surface ever widened by mistake.
    const page = {
      id: "1",
      title: "Test",
      path: "/test",
      domain: "d1",
      pageType: "subscription",
      builder: { html: '<section data-block="hero"><h1>Hello</h1></section>', css: "" },
      form: { fields: [], submitLabel: "", successMessage: "", consentPurposeText: "", privacyNoticeUrl: "", privacyNoticeVersion: "" },
    } as unknown as PublishedPage;

    const html = renderToStaticMarkup(<PageShell page={page} formToken="test-token" />);
    expect(html).not.toContain("pageType");
  });
});

/**
 * A GrapesJS canvas background colour is exported as `#<id>{background-color:
 * ...}` targeting the wrapper (exportHtml.ts turns `<body>` into `<div>` so it
 * survives sanitizeHtml). `.trefle-page-shell` (globals.css, `min-height:
 * 100vh; display: flow-root`) IS that wrapper — page-shell.tsx applies its
 * id/class/style directly to it, a single real element spanning the whole
 * page, rather than to the individual `before`/`after` fragments (an
 * earlier version did that: it left white bands either side of a lead-form
 * sitting between two narrower, centred fragments).
 */
describe("PageShell — page background wrapper", () => {
  const basePage = {
    id: "1",
    title: "Test",
    path: "/test",
    domain: "d1",
    form: { fields: [], submitLabel: "", successMessage: "", consentPurposeText: "", privacyNoticeUrl: "", privacyNoticeVersion: "" },
  };

  it("applies the export's wrapper id to .trefle-page-shell when the page has no lead-form", () => {
    const page = {
      ...basePage,
      builder: { html: '<div id="ibody"><section data-block="hero"><h1>Hello</h1></section></div>', css: "#ibody{background-color:red}" },
    } as unknown as PublishedPage;

    const html = renderToStaticMarkup(<PageShell page={page} formToken="test-token" />);
    expect(html).toContain('id="ibody" class="trefle-page-shell"');
    expect(html).toContain('<h1>Hello</h1>');
  });

  it("still applies the wrapper id to the single .trefle-page-shell when a lead-form splits the export in two", () => {
    const page = {
      ...basePage,
      builder: {
        html:
          '<div id="ibody"><section data-block="hero"><h1>Hello</h1></section>' +
          '<div data-block="lead-form"></div><section data-block="rich-text">More</section></div>',
        css: "#ibody{background-color:red}",
      },
    } as unknown as PublishedPage;

    const html = renderToStaticMarkup(<PageShell page={page} formToken="test-token" />);
    expect(html).toContain('id="ibody" class="trefle-page-shell"');
    // Only ONE element carries the wrapper id — content on both sides of
    // the form (and the form itself) all sit inside it, not duplicated.
    expect(html.match(/id="ibody"/g)).toHaveLength(1);
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("More");
  });
});

/**
 * The lead-form placeholder's own `id`/`class`/`style` (whatever an editor
 * sets on it in GrapesJS's Style Manager — position, width, background)
 * must reach a real element around the actual server-driven form, or it's
 * silently discarded the moment the placeholder itself is thrown away.
 */
describe("PageShell — lead-form wrapper carries the placeholder's own attributes", () => {
  const basePage = {
    id: "1",
    title: "Test",
    path: "/test",
    domain: "d1",
    form: { fields: [], submitLabel: "", successMessage: "", consentPurposeText: "", privacyNoticeUrl: "", privacyNoticeVersion: "" },
  };

  it("applies the placeholder's id, class and inline style to a real wrapper around <LeadForm>", () => {
    const page = {
      ...basePage,
      builder: {
        html: '<div id="ibody"><div data-block="lead-form" id="form" class="my-form" style="max-width:480px;margin:0 auto"></div></div>',
        css: "",
      },
    } as unknown as PublishedPage;

    const html = renderToStaticMarkup(<PageShell page={page} formToken="test-token" />);
    expect(html).toContain('id="form"');
    expect(html).toContain('class="my-form"');
    expect(html).toContain("max-width:480px");
    expect(html).toContain("margin:0 auto");
    expect(html).toContain('action="/api/leads"');
  });
});

/**
 * 009-lead-form-error-recovery — `formValues`/`formErrors` (rendered
 * by `/form-retry` after a validation failure) reach `LeadForm`'s own
 * already-existing `values`/`errors` props unchanged, and any submitted
 * value/error text is escaped by JSX the same way every other page render
 * already is (research.md §3, FR-006) — no bespoke escaping needed here.
 */
describe("PageShell — formValues/formErrors reach LeadForm (009)", () => {
  const page = {
    id: "1",
    title: "Test",
    path: "/test",
    domain: "d1",
    builder: { html: '<div id="ibody"><div data-block="lead-form"></div></div>', css: "" },
    form: {
      fields: [
        { name: "firstName", label: "Prénom", type: "text", required: true },
        { name: "email", label: "Email", type: "email", required: true },
      ],
      submitLabel: "Envoyer",
      successMessage: "",
      consentPurposeText: "But",
      privacyNoticeUrl: "/p",
      privacyNoticeVersion: "1",
    },
  } as unknown as PublishedPage;

  it("pre-fills every field's previous value and marks only the field(s) with an error", () => {
    const html = renderToStaticMarkup(
      <PageShell
        page={page}
        formToken="test-token"
        formValues={{ firstName: "Ada", email: "not-an-email" }}
        formErrors={{ email: "Adresse email invalide." }}
      />,
    );
    expect(html).toContain('value="Ada"');
    expect(html).toContain('value="not-an-email"');
    expect(html).toContain("Adresse email invalide.");
    // only the email field's error is present — firstName has none
    expect(html.match(/trefle-error/g)).toHaveLength(1);
  });

  it("escapes a value/label that looks like markup instead of executing it", () => {
    const crafted = {
      ...page,
      form: {
        ...page.form,
        fields: [{ name: "evil", label: '<script>alert(1)</script>', type: "text", required: true }],
      },
    } as unknown as PublishedPage;
    const html = renderToStaticMarkup(
      <PageShell
        page={crafted}
        formToken="test-token"
        formValues={{ evil: '<img src=x onerror=alert(1)>' }}
        formErrors={{ evil: '<script>alert(2)</script>' }}
      />,
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<script>alert(2)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("consent error is shown inline next to the consent control, not as a generic message", () => {
    const html = renderToStaticMarkup(
      <PageShell page={page} formToken="test-token" formValues={{}} formErrors={{ consent: "Vous devez accepter pour envoyer le formulaire." }} />,
    );
    expect(html).toContain("trefle-consent-error");
    expect(html).toContain("Vous devez accepter pour envoyer le formulaire.");
  });
});

/**
 * 014-custom-code-editing, research R7b — `builder.css` is now free text in
 * the editor's « Code » view. It is emitted inside a `<style>` element, so a
 * `</style>` sequence in it must not be able to close that element and
 * inject markup into the page.
 */
describe("PageShell — page CSS can't break out of its <style> (014, R7b)", () => {
  it("escapes </style inside builder.css", () => {
    const page = {
      id: "1",
      title: "Test",
      path: "/test",
      domain: "d1",
      builder: {
        html: '<section data-block="hero"><h1>Hello</h1></section>',
        css: 'h1{color:red}</style><h2 id="injected">x</h2><STYLE>p{}</StYlE >',
      },
      form: { fields: [], submitLabel: "", successMessage: "", consentPurposeText: "", privacyNoticeUrl: "", privacyNoticeVersion: "" },
    } as unknown as PublishedPage;

    const html = renderToStaticMarkup(<PageShell page={page} formToken="test-token" />);
    expect(html).toContain("h1{color:red}");
    // Exactly one real closing tag: the shell's own.
    expect(html.match(/<\/style/gi)).toHaveLength(1);
    const styleEnd = html.search(/<\/style/i);
    expect(html.indexOf('<h2 id="injected">')).toBeLessThan(styleEnd);
  });
});

/**
 * 016-carousel-block — smoke check of the published template with a carousel
 * (constitution IV): it renders through sanitising and parsing, next to the
 * lead form, with every slide's content.
 */
describe("PageShell — carousel (016)", () => {
  it("renders a page with a carousel next to the lead form", () => {
    const page = {
      id: "1",
      title: "Test",
      path: "/test",
      domain: "d1",
      language: { code: "fr" },
      builder: {
        html:
          '<section data-block="carousel" aria-label="Avis">' +
          '<div data-block="carousel-slide"><p>Avis un</p></div>' +
          '<div data-block="carousel-slide"><p>Avis deux</p></div>' +
          "</section>" +
          '<div data-block="lead-form" id="form"></div>',
        css: "",
      },
      form: {
        fields: [{ name: "email", label: "Email", type: "email", required: true }],
        submitLabel: "Envoyer",
        successMessage: "",
        consentPurposeText: "",
        privacyNoticeUrl: "",
        privacyNoticeVersion: "",
      },
    } as unknown as PublishedPage;

    const html = renderToStaticMarkup(<PageShell page={page} formToken="test-token" />);
    expect(html).toContain('aria-roledescription="carrousel" aria-label="Avis"');
    expect(html).toContain("Avis un");
    expect(html).toContain("Avis deux");
    expect(html).toContain("<form");
    // 023 (US6): the page declares its language; Trefle's words need no mark of their own.
    expect(html).toContain('<div class="trefle-page-shell" lang="fr" data-page-lang="">');
    expect(html).toContain('<a href="/privacy" target="_blank" rel="noreferrer">Politique de confidentialité');
  });

  it("an English page gets the form's own words in English; a Spanish one gets them in English, marked so (023 US6)", () => {
    const page = (code: string) =>
      ({
        id: "1",
        title: "Test",
        path: "/test",
        domain: "d1",
        language: { code },
        builder: { html: '<div data-block="lead-form" id="form"></div>', css: "" },
        form: { fields: [], submitLabel: "", successMessage: "", consentPurposeText: "", privacyNoticeUrl: "", privacyNoticeVersion: "" },
      }) as unknown as PublishedPage;
    const en = renderToStaticMarkup(<PageShell page={page("en")} formToken="t" />);
    expect(en).toContain('rel="noreferrer">Privacy policy<span class="trefle-visually-hidden"> (new window)</span></a>');
    expect(en).toContain('<button type="submit">Send</button>');
    const es = renderToStaticMarkup(<PageShell page={page("es")} formToken="t" />);
    expect(es).toContain('<div class="trefle-page-shell" lang="es" data-page-lang="">');
    expect(es).toContain('rel="noreferrer" lang="en">Privacy policy');
    expect(es).toContain('<button type="submit" lang="en">Send</button>');
  });

});

describe("PageShell — legal footer (021)", () => {
  const page = {
    id: "1",
    title: "Test",
    path: "/test",
    domain: "d1",
    builder: { html: '<section data-block="hero"><h1>Hello</h1></section><div data-block="lead-form" id="form"></div>', css: "" },
    form: { fields: [{ name: "email", label: "Email", type: "email", required: true }], submitLabel: "Envoyer", successMessage: "", consentPurposeText: "But", privacyNoticeUrl: "", privacyNoticeVersion: "" },
  } as unknown as PublishedPage;
  const legal = { policyHref: "/privacy?lang=en", noticeHref: "/legal-notice?lang=en", policyLabel: "Privacy policy", noticeLabel: "Legal notice", language: "en" };

  it("adds the footer line and points a form without its own link to the domain policy", () => {
    const html = renderToStaticMarkup(<PageShell page={page} formToken="test-token" legal={legal} />);
    expect(html).toContain('<footer class="trefle-legal-footer" lang="en"><a href="/legal-notice?lang=en">Legal notice</a><span aria-hidden="true"> · </span><a href="/privacy?lang=en">Privacy policy</a></footer>');
    expect(html).toMatch(/<a href="\/privacy\?lang=en" target="_blank"/);
  });

  it("keeps a form's own link, and adds nothing without legal links", () => {
    const own = { ...page, form: { ...page.form, privacyNoticeUrl: "https://own.example/p" } } as PublishedPage;
    expect(renderToStaticMarkup(<PageShell page={own} formToken="t" legal={legal} />)).toContain('href="https://own.example/p"');
    expect(renderToStaticMarkup(<PageShell page={page} formToken="t" />)).not.toContain("trefle-legal-footer");
  });
});
