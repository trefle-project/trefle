import { describe, expect, it } from "vitest";

import { type LegalInputs, pickLanguage, renderLegalPage } from "../src/lib/legal/build";
import { DEFAULT_LEGAL_NOTICE_FR, DEFAULT_PRIVACY_POLICY_FR } from "../src/lib/legal/defaults";

/** 021-legal-pages (contracts/legal-api.md, T009) — the legal page builder. */
type N = { type: string; [k: string]: unknown };
const t = (text: string, format = 0): N => ({ type: "text", text, format, detail: 0, mode: "normal", style: "", version: 1 });
const p = (...children: N[]): N => ({ type: "paragraph", children, direction: "ltr", format: "", indent: 0, version: 1, textFormat: 0 });
const heading = (tag: string) => (txt: string): N => ({ type: "heading", tag, children: [t(txt)], direction: "ltr", format: "", indent: 0, version: 1 });
const h2 = heading("h2");
const h3 = heading("h3");
const doc = (...children: N[]) => ({ root: { type: "root", children, direction: "ltr", format: "", indent: 0, version: 1 } });

const base = (over: Partial<LegalInputs> = {}, domain: Partial<LegalInputs["domain"]> = {}): LegalInputs => ({
  operator: { name: "Opérateur SAS", address: "1 rue A, Lille", email: "dpo@op.example" },
  suppliers: [
    { name: "Hostinger", role: "hébergement", location: "UE", isHost: true, address: "Kaunas", phone: "+370" },
    { name: "Cloudflare", role: "diffusion", location: "États-Unis", safeguards: "DPF" },
  ],
  texts: [
    {
      language: "fr",
      privacyPolicy: doc(h2("Responsable"), p(t("Responsable : {{owner.name}}.")), p(t("Forme : {{owner.legalForm}}.")), p(t("{{suppliers}}")), p(t("{{cookieBanner}} "), t("Cookies.", 1)), p(t("Durée : {{retention.leads}}.")), p(t("{{extra}}"))),
      legalNotice: doc(p(t("Hébergeur : {{host.name}}, {{host.address}}.")), p(t("Inconnu : {{nope}}."))),
      policyLinkLabel: "Confidentialité",
    },
    { language: "en", privacyPolicy: doc(p(t("Controller: {{owner.name}}."))), legalNotice: doc(p(t("Host: {{host.name}}."))), policyLinkLabel: "Privacy policy", noticeLinkLabel: "Legal notice" },
  ],
  retentionMonths: 24,
  domain: { hostname: "site.example", defaultLanguage: "fr", consentBannerEnabled: true, owner: { name: "Traiteur SARL", email: "rgpd@traiteur.example" }, extras: [], ...domain },
  ...over,
});

describe("pickLanguage", () => {
  const texts = base().texts;
  it("requested, else the domain default, else French", () => {
    expect(pickLanguage(texts, "en", "fr")).toBe("en");
    expect(pickLanguage(texts, "es", "en")).toBe("en");
    expect(pickLanguage(texts, "es", "de")).toBe("fr");
    expect(pickLanguage(texts, null, null)).toBe("fr");
  });
});

describe("renderLegalPage", () => {
  it("fills placeholders, lists suppliers, keeps the banner paragraph when the banner is on", () => {
    const page = renderLegalPage(base(), "privacy");
    expect(page.html).toContain("Responsable : Traiteur SARL.");
    expect(page.html).toContain("Durée : 24 mois.");
    expect(page.html).toMatch(/<ul[^>]*>.*Hostinger : hébergement \(UE\)\..*Cloudflare : diffusion \(États-Unis — DPF\)\..*<\/ul>/s);
    expect(page.html).toContain("Cookies.");
    expect(page.html).not.toContain("{{");
    expect(page.language).toBe("fr");
    expect(page.title).toBe("Politique de confidentialité");
  });

  it("drops a block whose placeholder is empty or unknown — never a raw placeholder", () => {
    const privacy = renderLegalPage(base(), "privacy");
    expect(privacy.html).not.toContain("Forme :");
    const notice = renderLegalPage(base(), "notice");
    expect(notice.html).toContain("Hébergeur : Hostinger, Kaunas.");
    expect(notice.html).not.toContain("Inconnu");
    expect(notice.html).not.toContain("{{");
  });

  it("drops the cookie paragraph when the domain has no banner, and the suppliers block when there are none", () => {
    const page = renderLegalPage(base({ suppliers: [] }, { consentBannerEnabled: false }), "privacy");
    expect(page.html).not.toContain("Cookies.");
    expect(page.html).not.toContain("<ul");
  });

  it("inserts the domain's paragraph for that page and language only", () => {
    const extras = [{ language: "fr", privacyParagraph: doc(p(t("Notre CRM : {{owner.name}}."))), noticeParagraph: doc(p(t("Note mentions."))) }];
    const privacy = renderLegalPage(base({}, { extras }), "privacy");
    expect(privacy.html).toContain("Notre CRM : Traiteur SARL.");
    expect(privacy.html).not.toContain("Note mentions.");
    expect(renderLegalPage(base({}, { extras }), "privacy", "en").html).not.toContain("Notre CRM");
  });

  it("serves the requested language with its own title", () => {
    const page = renderLegalPage(base(), "notice", "en");
    expect(page).toMatchObject({ language: "en", title: "Legal notice" });
    expect(page.html).toContain("Host: Hostinger.");
  });

  it("version: stable for the same inputs, different after any change", () => {
    const a = renderLegalPage(base(), "privacy").version;
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(renderLegalPage(base(), "privacy").version).toBe(a);
    expect(renderLegalPage(base({}, { owner: { name: "Autre SARL" } }), "privacy").version).not.toBe(a);
    expect(renderLegalPage(base({ retentionMonths: 12 }), "privacy").version).not.toBe(a);
  });

  it("an empty text gives an empty page, not an error", () => {
    expect(renderLegalPage(base({ texts: [{ language: "fr" }] }), "privacy").html).toBe("");
  });
});

describe("headings over an empty section (022 US3)", () => {
  const privacyOf = (...children: N[]) => base({ texts: [{ language: "fr", privacyPolicy: doc(...children) }] });
  const headingsIn = (html: string) => [...html.matchAll(/<h[2-6][^>]*>(.*?)<\/h[2-6]>/g)].map((m) => m[1]);

  it("drops a heading whose every block was left out", () => {
    const page = renderLegalPage(privacyOf(h2("Vide"), p(t("{{owner.legalForm}}")), h2("Plein"), p(t("Texte."))), "privacy");
    expect(headingsIn(page.html)).toEqual(["Plein"]);
  });

  it("keeps a heading when one block under it remains", () => {
    const page = renderLegalPage(privacyOf(h2("Responsable"), p(t("{{owner.legalForm}}")), p(t("{{owner.name}}"))), "privacy");
    expect(headingsIn(page.html)).toEqual(["Responsable"]);
  });

  it("keeps the parent and the filled sub-heading, drops the empty one", () => {
    const page = renderLegalPage(privacyOf(h2("Parent"), h3("Vide"), p(t("{{owner.legalForm}}")), h3("Plein"), p(t("Texte."))), "privacy");
    expect(headingsIn(page.html)).toEqual(["Parent", "Plein"]);
  });

  it("drops the parent when all its sub-sections are empty", () => {
    const page = renderLegalPage(privacyOf(h2("Parent"), h3("A"), p(t("{{owner.legalForm}}")), h3("B"), p(t("{{owner.registration}}")), h2("Suite"), p(t("Texte."))), "privacy");
    expect(headingsIn(page.html)).toEqual(["Suite"]);
  });

  // Production, 2026-10-22: a domain whose owner was not filled in yet.
  it("default texts with an empty owner: no owner heading left alone", () => {
    const fromMarkdown = (md: string) =>
      doc(
        ...md
          .split(/\n\s*\n/)
          .map((chunk) => chunk.trim())
          .filter(Boolean)
          .map((chunk) => (chunk.startsWith("## ") ? h2(chunk.slice(3)) : p(t(chunk)))),
      );
    const inputs = base({ texts: [{ language: "fr", privacyPolicy: fromMarkdown(DEFAULT_PRIVACY_POLICY_FR), legalNotice: fromMarkdown(DEFAULT_LEGAL_NOTICE_FR) }] }, { owner: {} });
    expect(headingsIn(renderLegalPage(inputs, "privacy").html)).not.toContain("Qui est responsable de vos données");
    expect(headingsIn(renderLegalPage(inputs, "notice").html)).not.toContain("Éditeur du site");
    expect(headingsIn(renderLegalPage(inputs, "notice").html)).toContain("Hébergement");
  });
});

describe("default French texts", () => {
  const known = /^(operator\.(name|legalForm|registration|address|email|phone)|owner\.(name|legalForm|registration|address|email|director)|host\.(name|address|phone)|site|retention\.leads|suppliers|cookieBanner|extra)$/;
  it("use only known placeholders", () => {
    for (const text of [DEFAULT_PRIVACY_POLICY_FR, DEFAULT_LEGAL_NOTICE_FR]) {
      for (const m of text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) expect(m[1]).toMatch(known);
    }
  });

  it("never put an optional detail in the same paragraph as the owner's or operator's name", () => {
    for (const text of [DEFAULT_PRIVACY_POLICY_FR, DEFAULT_LEGAL_NOTICE_FR]) {
      for (const para of text.split(/\n\s*\n/)) {
        if (/\{\{(owner|operator)\.name\}\}/.test(para)) expect(para).not.toMatch(/legalForm|registration|phone/);
      }
    }
  });
});
