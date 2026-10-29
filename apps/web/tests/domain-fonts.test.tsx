import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageShell } from "../src/components/page-shell";
import { domainFontFiles, type PublishedPage } from "../src/lib/payload-client";

/** 015-penpot-site-import T042 — the domain's fonts on published pages (FR-026). */

const page = {
  id: "1",
  title: "Accueil",
  path: "/",
  domain: "3",
  builder: {
    html: "<section><h1>Bonjour</h1></section>",
    css: '#a{font-family:"EB Garamond", serif;}',
  },
  form: {
    fields: [],
    submitLabel: "",
    successMessage: "",
    consentPurposeText: "",
    privacyNoticeUrl: "",
    privacyNoticeVersion: "",
  },
} as unknown as PublishedPage;

const domain = {
  fonts: [
    {
      family: "EB Garamond",
      files: [
        {
          family: "EB Garamond",
          weight: 400,
          style: "normal" as const,
          url: "https://assets.example/fonts/eb-garamond-400-latin.woff2",
          unicodeRange: "U+0000-00FF",
        },
        7, // not expanded: skipped
        { family: "EB Garamond", weight: 700, style: "italic" as const, url: null }, // no URL: skipped
      ],
    },
  ],
};

describe("domain fonts on published pages", () => {
  it("one style of @font-face rules, before the page CSS, pointing at Trefle's assets only", () => {
    const html = renderToStaticMarkup(
      <PageShell page={page} formToken="t" fonts={domainFontFiles(domain)} />,
    );
    const fonts = html.indexOf('data-trefle="domain-fonts"');
    expect(fonts).toBeGreaterThan(-1);
    expect(fonts).toBeLessThan(html.indexOf("#a{font-family"));
    expect(html.match(/@font-face/g)).toHaveLength(1);
    expect(html).toContain(
      'src:url("https://assets.example/fonts/eb-garamond-400-latin.woff2") format("woff2")',
    );
    expect(html).not.toMatch(/googleapis|gstatic/);
  });
  it("no fonts → no font style element", () => {
    expect(renderToStaticMarkup(<PageShell page={page} formToken="t" />)).not.toContain(
      "domain-fonts",
    );
    expect(
      renderToStaticMarkup(<PageShell page={page} formToken="t" fonts={domainFontFiles({})} />),
    ).not.toContain("domain-fonts");
  });
});
