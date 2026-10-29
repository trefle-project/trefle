import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { renderPageBody } from "../src/lib/render";

/**
 * 016-carousel-block — `renderPageBody` turns the carousel markup
 * (specs/016-carousel-block/contracts/markup.md) into `<Carousel>`. This is the
 * server render: what a visitor without JavaScript gets, before any control
 * exists (the controls are mount-only, checked by the e2e suite).
 */
const slide = (inner: string, extra = "") => `<div data-block="carousel-slide"${extra}>${inner}</div>`;
const carousel = (slides: string[], extra = "") => `<section data-block="carousel"${extra}>${slides.join("")}</section>`;

const render = (html: string, renderCode?: (slot: { codeId: string }) => string, language = "fr") =>
  renderToStaticMarkup(
    <>
      {renderPageBody(
        html,
        () => <form data-testid="lead-form" />,
        renderCode ? (slot) => <span data-code={slot.codeId}>{renderCode(slot)}</span> : undefined,
        { language },
      )}
    </>,
  );

/** The slides' own `aria-label`s, in order. */
const slideLabels = (html: string) => [...html.matchAll(/aria-roledescription="diapositive" aria-label="([^"]+)"/g)].map((m) => m[1]);

describe("renderPageBody — carousel (016)", () => {
  it("renders every slide, in order, with its content", () => {
    const html = render(carousel([slide("<h2>Un</h2>"), slide("<h2>Deux</h2>"), slide("<h2>Trois</h2>")]));
    expect(slideLabels(html)).toEqual(["1 sur 3", "2 sur 3", "3 sur 3"]);
    expect(html.indexOf("Un")).toBeLessThan(html.indexOf("Deux"));
    expect(html.indexOf("Deux")).toBeLessThan(html.indexOf("Trois"));
  });

  it("is a named carousel region with a keyboard-focusable track and no control yet", () => {
    const html = render(carousel([slide("a"), slide("b")], ' aria-label="Avis clients"'));
    expect(html).toMatch(/<section[^>]* aria-roledescription="carrousel" aria-label="Avis clients"/);
    expect(html).toMatch(/<div class="[^"]*" tabindex="0">/);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("inert");
  });

  it("names the region « Carrousel » by default", () => {
    expect(render(carousel([slide("a")]))).toContain('aria-label="Carrousel"');
  });

  it("keeps the editor's id, class and style on the carousel and on each slide", () => {
    const html = render(
      carousel([slide("a", ' id="s1" class="pad" style="padding:8px"')], ' id="c1" class="band" style="background-color:#eee"'),
    );
    expect(html).toMatch(/<section id="c1" class="[^"]* band" style="background-color:#eee;--per-view:1"/);
    expect(html).toMatch(/<div id="s1" class="[^"]* pad" style="padding:8px" role="group"/);
  });

  it("drops a direct child that is not a slide, and keeps at most 12 slides", () => {
    const html = render(carousel(["<p>intrus</p>", ...Array.from({ length: 14 }, (_, i) => slide(`n${i}`))]));
    expect(html).not.toContain("intrus");
    expect(slideLabels(html)).toHaveLength(12);
    expect(html).not.toContain("n12");
  });

  it("still replaces a « Code personnalisé » placeholder inside a slide", () => {
    const html = render(carousel([slide('<div data-block="custom-code" data-code-id="cal"></div>')]), () => "code!");
    expect(html).toContain('<span data-code="cal">code!</span>');
  });

  it("renders a carousel nested in a slide as plain markup, not as a second carousel", () => {
    const html = render(carousel([slide(carousel([slide("<p>dedans</p>")]))]));
    expect(html.match(/aria-roledescription="carrousel"/g)).toHaveLength(1);
    expect(html).toContain('<section data-block="carousel"><div data-block="carousel-slide"><p>dedans</p></div></section>');
  });

  it("lazy-loads images of every slide but the first, unless told otherwise", () => {
    const html = render(
      carousel([
        slide('<img src="/a.png" alt="a">'),
        slide('<figure><img src="/b.png" alt="b"></figure>'),
        slide('<img src="/c.png" alt="c" loading="eager">'),
      ]),
    );
    expect(html).toMatch(/<img src="\/a.png" alt="a"\/>/);
    expect(html).toMatch(/<img src="\/b.png" alt="b" loading="lazy"\/>/);
    expect(html).toMatch(/<img src="\/c.png" alt="c" loading="eager"\/>/);
  });

  it("lets React preload only the first slide's images", () => {
    // React 19 emits <link rel="preload" as="image"> for server-rendered
    // images, except lazy ones: later slides must not compete with the page.
    const html = render(carousel([slide('<img src="/a.png" alt="a">'), slide('<img src="/b.png" alt="b">')]));
    expect(html).toContain('<link rel="preload" as="image" href="/a.png"/>');
    expect(html).not.toContain('href="/b.png"');
  });

  it("leaves a page without carousel untouched", () => {
    const page = '<section data-block="hero"><h1>Titre</h1><p>Texte</p></section>';
    expect(render(page)).toBe(page);
  });

  it("speaks the page's language (023 US6): English words on an English page, marked English on a Spanish one", () => {
    const en = render(carousel([slide("a"), slide("b")]), undefined, "en");
    expect(en).toContain('aria-roledescription="carousel" aria-label="Carousel"');
    expect([...en.matchAll(/aria-roledescription="slide" aria-label="([^"]+)"/g)].map((m) => m[1])).toEqual(["1 of 2", "2 of 2"]);
    const named = render(carousel([slide("a")], ' aria-label="Opiniones"'), undefined, "es");
    expect(named).toContain('aria-roledescription="carousel" aria-label="Opiniones"');
  });
});
