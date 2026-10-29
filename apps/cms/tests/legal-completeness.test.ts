import { describe, expect, it } from "vitest";

import { legalCompleteness, operatorMissing, ownerMissing } from "../src/lib/legal/completeness";

/** 021-legal-pages (research R8, T021) — what the admin says is missing. */
const text = { root: { children: [{ type: "paragraph" }] } };
const settings = {
  operator: { name: "Op SAS", address: "Lille", email: "op@example.com" },
  legalTexts: [{ language: { code: "fr" }, privacyPolicy: text, legalNotice: text }],
};
const domain = { owner: { name: "Traiteur", address: "Lille", email: "rgpd@example.com", director: "J. Dupont" } };

describe("legalCompleteness", () => {
  it("nothing missing when operator, French texts and owner are filled", () => {
    expect(legalCompleteness(settings, domain)).toEqual([]);
  });

  it("names the operator's missing details and missing French texts", () => {
    expect(operatorMissing({ operator: { name: " " }, legalTexts: [{ language: { code: "en" }, privacyPolicy: text, legalNotice: text }] })).toEqual([
      "raison sociale de l'opérateur",
      "adresse de l'opérateur",
      "e-mail de l'opérateur",
      "politique de confidentialité en français",
      "mentions légales en français",
    ]);
    expect(operatorMissing({ ...settings, legalTexts: [{ language: { code: "fr" }, privacyPolicy: { root: { children: [] } }, legalNotice: text }] })).toEqual([
      "politique de confidentialité en français",
    ]);
  });

  it("names the owner's missing details", () => {
    expect(ownerMissing({ owner: { name: "Traiteur" } })).toEqual([
      "adresse du propriétaire",
      "e-mail du propriétaire pour les données personnelles",
      "directeur de la publication",
    ]);
    expect(ownerMissing(null)).toHaveLength(4);
  });

  it("speaks English to an English-speaking member", () => {
    expect(legalCompleteness({ operator: { name: "Op SAS", address: "Lille", email: "op@example.com" } }, { owner: { name: "T", address: "L", email: "e@x" } }, "en")).toEqual([
      "privacy policy in French",
      "legal notice in French",
      "publication director",
    ]);
  });
});
