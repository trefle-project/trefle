import { REPORT_TEXT_FR, type ReportText } from "@trefle/grapesjs-page-import/serialize";
import { describe, expect, it } from "vitest";

import { adminText, type AdminKey } from "../src/i18n";
import { summariseDeviceChecks } from "../src/lib/import/device-summary";
import { reportLine } from "../src/lib/import/report-text";

/**
 * 023-admin-i18n (US5, T055) — import report lines: Trefle's own lines are
 * keyed and read in the reader's language; AI lines and reports made before
 * 023 are plain strings, shown as written; nothing ever renders empty.
 */
describe("import report lines", () => {
  it("the catalogue repeats the package's French, key for key", () => {
    const fr = adminText("fr");
    for (const [key, text] of Object.entries(REPORT_TEXT_FR)) expect(fr(key as AdminKey), key).toBe(text);
  });

  it("a keyed line follows the language, a plain string does not", () => {
    const keyed: ReportText = { key: "imports.report.describeMany", values: { n: 2 } };
    expect(reportLine(keyed, "fr")).toBe("Décrire les 2 images marquées « À décrire » dans la médiathèque");
    expect(reportLine(keyed, "en")).toBe("Describe the 2 images marked “To describe” in the media library");
    const ai = "Carrousel d'avis : premier avis conservé";
    expect(reportLine(ai, "fr")).toBe(ai);
    expect(reportLine(ai, "en")).toBe(ai);
  });

  it("a report made before 023 (plain French strings) reads as written in both languages", () => {
    const before = ["Ajouter un bloc Formulaire à l'endroit voulu et configurer ses champs", "Fin de la page"];
    for (const lang of ["fr", "en"]) expect(before.map((l) => reportLine(l, lang))).toEqual(before);
  });

  it("a key the catalogue does not know shows as itself, never empty", () => {
    expect(reportLine({ key: "imports.report.noSuchLine" }, "en")).toBe("imports.report.noSuchLine");
  });

  it("screen-format lines are summarised in the reader's language", () => {
    const checks = [
      { device: "mobilePortrait" as const, kind: "small-target" as const, where: "cta « S'inscrire »" },
      { device: "tablet" as const, kind: "small-target" as const, where: "cta « S'inscrire »" },
    ];
    expect(summariseDeviceChecks(checks, "fr")).toEqual(["Bouton ou lien trop petit pour le doigt (tablette, mobile portrait) — 1 élément : cta « S'inscrire »"]);
    expect(summariseDeviceChecks(checks, "en")).toEqual(["Button or link too small for a finger (tablet, mobile portrait) — 1 element: cta « S'inscrire »"]);
  });
});
