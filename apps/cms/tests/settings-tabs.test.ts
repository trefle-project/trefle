import { describe, expect, it } from "vitest";

import { Settings } from "../src/globals/Settings";
import { atMostOneHost, requireFrenchBannerTranslation, requireFrenchLegalTexts } from "../src/hooks/settings-cookie-banner";
import { variantSameSizeAsPattern } from "../src/hooks/settings-branding";

/**
 * 022-ux-improvement (US2, FR-012, T026) — Settings → Default in four unnamed
 * tabs: a layout change only. The stored fields stay top-level (same API,
 * no migration) and the save hooks still run.
 */
type F = { type?: string; name?: string; label?: unknown; tabs?: { label: { fr: string; en: string }; name?: string; fields: F[] }[]; admin?: { hidden?: boolean } };

describe("Settings tabs", () => {
  const tabs = (Settings.fields as F[]).find((f) => f.type === "tabs")!;

  it("are « Général », « Entités légales », « Textes légaux », « Consents default », unnamed", () => {
    expect(tabs.tabs!.map((t) => t.label.fr)).toEqual(["Général", "Entités légales", "Textes légaux", "Consents default"]);
    expect(tabs.tabs!.map((t) => t.label.en)).toEqual(["General", "Legal entities", "Legal texts", "Consents default"]);
    expect(tabs.tabs!.every((t) => t.name === undefined)).toBe(true);
  });

  it("keep every stored field at the top level, in its agreed tab", () => {
    const byTab = Object.fromEntries(tabs.tabs!.map((t) => [t.label.fr, t.fields.map((f) => f.name).filter(Boolean)]));
    expect(byTab["Général"]).toEqual(expect.arrayContaining(["retentionMonths", "adminTimezone", "exportConsentedOnlyByDefault", "importMonthlyCapEur", "importDefaultUserBudgetEur", "importUsdToEurRate", "senderEmail", "notifyOnNewLead", "notifyEmails", "defaultPrivacyNoticeUrl", "defaultPrivacyNoticeVersion"]));
    expect(byTab["Entités légales"]).toEqual(["operatorLegalStatus", "operator", "suppliers"]);
    expect(byTab["Textes légaux"]).toEqual(["legalTexts"]);
    expect(byTab["Consents default"]).toEqual(["defaultConsentPurposeText", "cookieBannerTranslations"]);
    expect((Settings.fields as F[]).filter((f) => f.type !== "tabs")).toEqual([]);
  });

  it("give every visible field a French label", () => {
    const unlabelled = tabs.tabs!.flatMap((t) => t.fields).filter((f) => f.name && f.type !== "ui" && !f.admin?.hidden && !f.label);
    expect(unlabelled.map((f) => f.name)).toEqual([]);
  });

  it("still run the save hooks", () => {
    expect(Settings.hooks?.beforeChange).toEqual([requireFrenchBannerTranslation, requireFrenchLegalTexts, atMostOneHost, variantSameSizeAsPattern]);
  });
});
