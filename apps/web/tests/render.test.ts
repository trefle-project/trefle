import { Fragment, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { extractWrapper, hasLeadForm, renderPageBody, sanitizeHtml, type LeadFormSlot } from "../src/lib/render";

/** Renders `html` with the lead-form placeholder replaced by a marker that
 * echoes the slot it received. */
function renderWithMarker(html: string): { markup: string; slots: LeadFormSlot[] } {
  const slots: LeadFormSlot[] = [];
  const node: ReactNode = renderPageBody(html, (slot) => {
    slots.push(slot);
    return createElement("form", { "data-testid": "lead-form" });
  });
  return { markup: renderToStaticMarkup(createElement(Fragment, null, node)), slots };
}

/**
 * exportHtml.ts wraps a whole GrapesJS export in one top-level element (the
 * ex-`<body>`) only when the canvas background itself was styled.
 * `extractWrapper` peels that wrapper's own tag off and returns its
 * id/class/style separately — page-shell.tsx applies them once, to a single
 * real element spanning the whole page (painting a background on narrower
 * fragments left white bands either side of the form).
 */
describe("extractWrapper", () => {
  it("peels the wrapper's own tag off and returns its id separately", () => {
    const html =
      '<div id="ibody"><section data-block="hero">Hero</section>' +
      '<div data-block="lead-form"></div><section data-block="rich-text">More</section></div>';
    const { inner, wrapperId } = extractWrapper(html);
    expect(wrapperId).toBe("ibody");
    expect(inner).toBe(
      '<section data-block="hero">Hero</section><div data-block="lead-form"></div><section data-block="rich-text">More</section>',
    );
  });

  it("extracts the wrapper's class/style too, not just its id", () => {
    const html = '<div id="ibody" class="my-page" style="background-color:red"><section data-block="hero">Hero</section></div>';
    const { wrapperId, wrapperClassName, wrapperStyle } = extractWrapper(html);
    expect(wrapperId).toBe("ibody");
    expect(wrapperClassName).toBe("my-page");
    expect(wrapperStyle).toEqual({ backgroundColor: "red" });
  });

  it("leaves a flat run of sibling blocks sharing the first one's tag name untouched (regression: dropped the form silently)", () => {
    // No canvas background was styled, so there is no wrapper — the first
    // block (hero) merely shares its tag with the lead-form block after it.
    // Exact shape of the e2e fixtures that caught this (global-setup.ts,
    // confirmation-page.spec.ts).
    const html = '<div data-block="hero"><h1>Promo</h1></div><div data-block="lead-form"></div>';
    const result = extractWrapper(html);
    expect(result).toEqual({ inner: html });
    expect(renderWithMarker(result.inner).slots).toHaveLength(1);
  });

  it("never peels a lone block: a page of a single block keeps its tag (regression, 014)", () => {
    const html = '<section data-block="hero" style="padding:64px"><h1>Seul bloc</h1></section>';
    expect(extractWrapper(html)).toEqual({ inner: html });
    const code = '<div data-block="custom-code" data-code-id="a"></div>';
    expect(extractWrapper(code)).toEqual({ inner: code });
  });

  it("still recognises a genuine single wrapper that nests a same-tag child", () => {
    const html =
      '<div id="ibody"><div data-block="rich-text"><p>Texte</p></div><div data-block="lead-form"></div></div>';
    const result = extractWrapper(html);
    expect(result.wrapperId).toBe("ibody");
    expect(result.inner).toBe('<div data-block="rich-text"><p>Texte</p></div><div data-block="lead-form"></div>');
  });
});

describe("hasLeadForm", () => {
  it("finds the placeholder at the top level and nested (012, FR-025)", () => {
    expect(hasLeadForm('<div data-block="hero"></div><div data-block="lead-form"></div>')).toBe(true);
    expect(
      hasLeadForm('<section data-block="section"><div data-block="column"><div id="form" data-block="lead-form"></div></div></section>'),
    ).toBe(true);
    expect(hasLeadForm('<section data-block="hero">Hero</section>')).toBe(false);
  });
});

describe("renderPageBody", () => {
  it("replaces the placeholder in place, keeping content on both sides", () => {
    const { markup } = renderWithMarker(
      '<section data-block="hero">Hero</section><div data-block="lead-form"></div><section data-block="rich-text">More</section>',
    );
    expect(markup).toBe(
      '<section data-block="hero">Hero</section><form data-testid="lead-form"></form><section data-block="rich-text">More</section>',
    );
  });

  it("hands the placeholder's own id/class/style to the form renderer", () => {
    const { slots } = renderWithMarker(
      '<div data-block="lead-form" id="form" class="my-form" style="max-width:480px;margin:0 auto"></div>',
    );
    expect(slots).toEqual([{ id: "form", className: "my-form", style: { maxWidth: "480px", margin: "0 auto" } }]);
  });

  it("returns undefined attributes when the placeholder has none beyond data-block", () => {
    const { slots } = renderWithMarker('<div data-block="lead-form"></div>');
    expect(slots).toEqual([{ id: undefined, className: undefined, style: undefined }]);
  });

  it("renders the page unchanged and never calls the form renderer without a placeholder", () => {
    const { markup, slots } = renderWithMarker('<section data-block="hero" style="padding:24px">Hero</section>');
    expect(slots).toHaveLength(0);
    expect(markup).toBe('<section data-block="hero" style="padding:24px">Hero</section>');
  });

  it("renders only the first placeholder as a form", () => {
    const { markup, slots } = renderWithMarker('<div data-block="lead-form"></div><div data-block="lead-form"></div>');
    expect(slots).toHaveLength(1);
    expect(markup.match(/<form/g)).toHaveLength(1);
  });

  it("returns nothing for empty html", () => {
    expect(renderWithMarker("").markup).toBe("");
  });
});

/**
 * 003-post-launch-improvements, FR-003 — editor-authored HTML must render
 * with script vectors removed while the real GrapesJS block vocabulary
 * (apps/cms/src/fields/grapesjs/blocks.ts) survives untouched.
 */
describe("sanitizeHtml", () => {
  it("strips a <script> tag while keeping surrounding block content and the lead-form marker", () => {
    const dirty =
      '<section data-block="hero" style="padding:64px"><h1>Titre</h1><script>alert(1)</script><p>Texte</p></section>' +
      '<div data-block="lead-form" id="form"></div>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("<script>");
    expect(clean).not.toContain("alert(1)");
    expect(clean).toContain('data-block="hero"');
    expect(clean).toContain("<h1>Titre</h1>");
    expect(clean).toContain("<p>Texte</p>");
    // the split still finds the lead-form marker in the sanitised output
    expect(hasLeadForm(clean)).toBe(true);
  });

  it("strips an inline event handler", () => {
    const clean = sanitizeHtml('<div data-block="rich-text" onclick="alert(1)">Texte</div>');
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("alert(1)");
    expect(clean).toContain("Texte");
  });

  it("strips a javascript: URL from a link but keeps a real href", () => {
    const clean = sanitizeHtml(
      '<div data-block="call-to-action"><a href="javascript:alert(1)">Bad</a><a href="#form">Je m\'inscris</a></div>',
    );
    expect(clean).not.toContain("javascript:");
    expect(clean).toContain('href="#form"');
  });

  it("keeps the built-in Image block's data:image/svg+xml placeholder", () => {
    const src =
      "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='960'%20height='480'%3E%3C/svg%3E";
    const clean = sanitizeHtml(`<figure data-block="image"><img src="${src}" alt="" style="max-width:100%"/></figure>`);
    expect(clean).toContain("data:image/svg+xml");
  });

  it("strips a non-image data: URI (e.g. data:text/html)", () => {
    const clean = sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">click</a>');
    expect(clean).not.toContain("data:text/html");
  });
});

/**
 * 014-custom-code-editing, FR-011/FR-012/FR-013 — the widened allow-list for
 * markup editors now write by hand in the « Code » view. Everything added
 * must survive publication; every script vector must still be removed.
 */
describe("sanitizeHtml — 014 widened allow-list", () => {
  it.each([
    ["a table", '<table><caption>Prix</caption><thead><tr><th scope="col">Offre</th></tr></thead><tbody><tr><td colspan="2" rowspan="1">49 €</td></tr></tbody><tfoot><tr><td>x</td></tr></tfoot></table>'],
    ["a button", '<button type="button" aria-label="Plus d\'infos">Info</button>'],
    ["a video with sources and track", '<video controls="" muted="" loop="" playsinline="" poster="https://cdn.example.com/p.jpg" width="640" height="360"><source src="https://cdn.example.com/v.mp4" type="video/mp4"><track kind="captions" srclang="fr" label="Français" src="https://cdn.example.com/v.vtt" default=""></video>'],
    ["an audio player", '<audio controls="" preload="none" src="https://cdn.example.com/a.mp3"></audio>'],
    ["an iframe embed", '<iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ" width="560" height="315" allow="autoplay; encrypted-media" allowfullscreen="" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" title="Vidéo"></iframe>'],
    ["a picture with srcset", '<picture><source media="(min-width: 800px)" srcset="https://cdn.example.com/l.jpg 2x"><img src="https://cdn.example.com/s.jpg" alt="" sizes="100vw"></picture>'],
    ["details/summary", '<details open=""><summary>Question</summary><p>Réponse</p></details>'],
    ["sectioning elements", "<header><nav><a href=\"#a\">A</a></nav></header><main><article><aside>x</aside></article></main><footer><small>©</small></footer>"],
    ["text-level elements", "<p><mark>m</mark><sub>2</sub><sup>3</sup><code>c</code><kbd>k</kbd><abbr title=\"t\">a</abbr><q>q</q><time datetime=\"2026-09-30\">30/09</time></p><hr><pre>p</pre><dl><dt>t</dt><dd>d</dd></dl>"],
    ["the custom-code placeholder", '<div data-block="custom-code" data-code-id="7f3c" id="x1" class="c" style="margin:0"></div>'],
    ["a role attribute", '<div role="region" aria-labelledby="t">x</div>'],
  ])("keeps %s intact", (_label, html) => {
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("keeps inline SVG with its drawing elements and presentation attributes", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">' +
      '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"></stop></linearGradient></defs>' +
      '<g transform="translate(1 1)"><path d="M0 0L10 10" stroke="#000" stroke-width="2" fill="none"></path>' +
      '<circle cx="5" cy="5" r="2" fill="url(#g)"></circle><rect x="1" y="1" width="3" height="3" rx="1"></rect>' +
      '<polygon points="0,0 1,1 2,0"></polygon><text x="0" y="20" text-anchor="middle">A</text></g></svg>';
    const clean = sanitizeHtml(svg);
    for (const piece of ["<svg", "viewBox=", "<linearGradient", "<stop", "<path", 'd="M0 0L10 10"', "<circle", "<rect", "<polygon", "<text", "text-anchor"]) {
      expect(clean, piece).toContain(piece);
    }
  });

  it.each([
    ["<script>", '<div>ok</div><script>alert(1)</script>', ["<script", "alert(1)"]],
    ["<style>", "<style>body{display:none}</style><p>ok</p>", ["<style", "display:none"]],
    ["an on-attribute on a new element", '<button onclick="alert(1)">x</button>', ["onclick", "alert(1)"]],
    ["an SVG onload", '<svg onload="alert(1)"><rect></rect></svg>', ["onload"]],
    ["a javascript: iframe", '<iframe src="javascript:alert(1)"></iframe>', ["javascript:"]],
    ["iframe srcdoc", '<iframe srcdoc="<script>alert(1)</script>"></iframe>', ["srcdoc", "alert(1)"]],
    ["a form and inputs", '<form action="https://evil.example"><input name="email"><select></select><textarea></textarea></form><p>ok</p>', ["<form", "<input", "<select", "<textarea", "evil.example"]],
    ["object/embed", '<object data="x.swf"></object><embed src="x.swf">', ["<object", "<embed"]],
    ["a name attribute", '<img name="getElementById" src="https://cdn.example.com/a.png" alt="">', ["name="]],
    ["a javascript: link on use", '<svg><use href="javascript:alert(1)"></use></svg>', ["javascript:"]],
  ])("still removes %s", (_label, html, forbidden) => {
    const clean = sanitizeHtml(html);
    for (const f of forbidden) expect(clean, f).not.toContain(f);
  });
});
