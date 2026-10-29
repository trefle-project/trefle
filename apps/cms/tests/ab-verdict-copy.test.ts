import { describe, expect, it } from "vitest";

import type { Analysis, ChallengerAnalysis } from "../src/lib/ab-verdict";
import { chanceLine, listLine, rangeLine, splitWarning, verdictLine } from "../src/lib/ab-verdict-copy";

/** 018-ab-significance (FR-013, FR-015, SC-002) — the words the operator reads. */
const c = (over: Partial<ChallengerAnalysis>): ChallengerAnalysis => ({
  pageId: 2,
  chanceToBeatControl: 0.87,
  ciLow: -0.04,
  ciHigh: 0.31,
  verdict: "no-clear-difference",
  ...over,
});
const analysis = (challengers: ChallengerAnalysis[], splitWarning = false): Analysis => ({
  totalUsers: 0,
  srmPValue: 0.5,
  splitWarning,
  arms: [],
  challengers,
});

describe("verdict copy", () => {
  it("says each verdict in plain French", () => {
    expect(verdictLine(c({ verdict: "better" }), "B", "fr")).toBe("B est probablement meilleure");
    expect(verdictLine(c({ verdict: "worse" }), "B", "fr")).toBe("B est probablement moins bonne");
    expect(verdictLine(c({}), "B", "fr")).toBe("Pas de différence nette pour l’instant");
    expect(verdictLine(c({ verdict: "leaning-better", confirmAt: "2026-10-23T08:00:00.000Z" }), "B", "fr")).toBe(
      "Tendance : B semble meilleure (à confirmer le 23/10/2026 10:00)",
    );
    expect(verdictLine(c({ verdict: "leaning-worse" }), "B", "fr")).toBe("Tendance : B semble moins bonne (à confirmer)");
    expect(verdictLine(c({ verdict: "not-enough-data", missingVisitorsPerArm: 1200 }), "B", "fr")).toBe(
      "Pas encore assez de données (encore environ 1 200 affichages par variante)",
    );
    expect(verdictLine(c({ verdict: "not-enough-data", missingLeads: 30 }), "B", "fr")).toBe("Pas encore assez de données (encore au moins 30 leads par variante)");
  });

  it("formats the probability and the likely effect", () => {
    expect(chanceLine(c({}), "fr")).toBe("Probabilité de battre l’original : 87 %");
    expect(rangeLine(c({}), "fr")).toBe("Effet probable : entre −4 % et +31 %");
    expect(chanceLine(c({ chanceToBeatControl: null }), "fr")).toBeNull();
    expect(rangeLine(c({ ciLow: null }), "fr")).toBeNull();
  });

  it("the list shows the split warning first, else the most decided challenger", () => {
    expect(listLine(null, "fr")).toBe("—");
    expect(listLine(analysis([c({ verdict: "better" })], true), "fr")).toBe(splitWarning("fr"));
    expect(listLine(analysis([c({ verdict: "not-enough-data" }), c({ verdict: "better", chanceToBeatControl: 0.97 })]), "fr")).toBe(
      "Une variante est probablement meilleure (97 %)",
    );
    expect(listLine(analysis([c({})]), "fr")).toBe("Pas de différence nette pour l’instant");
  });

  it("023 — says the same in English, with English number and date formats", () => {
    expect(splitWarning("fr")).toBe("Répartition des visiteurs anormale : les résultats ne sont pas fiables");
    expect(verdictLine(c({ verdict: "better" }), "B", "en")).toBe("B is probably better");
    expect(verdictLine(c({}), "B", "en")).toBe("No clear difference yet");
    expect(verdictLine(c({ verdict: "leaning-better", confirmAt: "2026-10-23T08:00:00.000Z" }), "B", "en")).toBe(
      "Trend: B looks better (to be confirmed on 23/10/2026, 10:00)",
    );
    expect(verdictLine(c({ verdict: "not-enough-data", missingVisitorsPerArm: 1200 }), "B", "en")).toBe(
      "Not enough data yet (about 1,200 more views per variant)",
    );
    expect(chanceLine(c({}), "en")).toBe("Chance to beat the original: 87%");
    expect(rangeLine(c({}), "en")).toBe("Likely effect: between −4% and +31%");
    expect(listLine(analysis([c({ verdict: "better", chanceToBeatControl: 0.97 })]), "en")).toBe("A variant is probably better (97%)");
    expect(listLine(analysis([c({})], true), "en")).toBe("Unusual split of visitors: the results are not reliable");
  });
});
