import { adminText } from "../i18n";
import type { AdminLanguage } from "./admin-locale";
import { formatNumber, intlLocale } from "./admin-locale";
import type { Analysis, ChallengerAnalysis } from "./ab-verdict";

/**
 * 018-ab-significance (FR-013–FR-015, SC-002) — the analysis in plain words,
 * for the test screen and the tests list, in the member's language (023). No
 * statistics vocabulary beyond the probability.
 */
export const splitWarning = (lang: AdminLanguage) => adminText(lang)("ab.splitWarning");

// French keeps today's « 87 % » (a plain space); English « 87% ».
const pct = (x: number, lang: AdminLanguage) => `${Math.round(x * 100)}${lang === "fr" ? " %" : "%"}`;
const signed = (x: number, lang: AdminLanguage) => {
  const n = Math.round(x * 100);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${pct(Math.abs(n) / 100, lang)}`;
};

export function verdictLine(c: ChallengerAnalysis, label: string, lang: AdminLanguage): string {
  const t = adminText(lang);
  switch (c.verdict) {
    case "better":
      return t("ab.better", { label });
    case "worse":
      return t("ab.worse", { label });
    case "leaning-better":
      return t("ab.leaningBetter", { label, confirm: confirmLine(c, lang) });
    case "leaning-worse":
      return t("ab.leaningWorse", { label, confirm: confirmLine(c, lang) });
    case "no-clear-difference":
      return t("ab.noClearDifference");
    case "unreliable":
      return splitWarning(lang);
    case "not-enough-data": {
      const missing =
        c.missingVisitorsPerArm !== undefined
          ? t("ab.missingViews", { n: formatNumber(c.missingVisitorsPerArm, lang) })
          : c.missingLeads !== undefined
            ? t("ab.missingLeads", { n: formatNumber(c.missingLeads, lang) })
            : null;
      return missing ? t("ab.notEnoughDataYet", { missing }) : t("ab.notEnoughData");
    }
  }
}

export const chanceLine = (c: ChallengerAnalysis, lang: AdminLanguage) =>
  c.chanceToBeatControl === null ? null : adminText(lang)("ab.chance", { pct: pct(c.chanceToBeatControl, lang) });

export const rangeLine = (c: ChallengerAnalysis, lang: AdminLanguage) =>
  c.ciLow === null || c.ciHigh === null ? null : adminText(lang)("ab.range", { low: signed(c.ciLow, lang), high: signed(c.ciHigh, lang) });

/** One line for the tests list: the split warning, else the most decided challenger. */
export function listLine(analysis: Analysis | null | undefined, lang: AdminLanguage): string {
  if (!analysis) return "—";
  if (analysis.splitWarning) return splitWarning(lang);
  const rank: Record<ChallengerAnalysis["verdict"], number> = {
    better: 0,
    worse: 1,
    "leaning-better": 2,
    "leaning-worse": 3,
    "no-clear-difference": 4,
    "not-enough-data": 5,
    unreliable: 6,
  };
  const best = [...analysis.challengers].sort((a, b) => rank[a.verdict] - rank[b.verdict])[0];
  if (!best) return "—";
  const line = verdictLine(best, adminText(lang)("ab.aVariant"), lang);
  return best.chanceToBeatControl !== null && (best.verdict === "better" || best.verdict === "worse")
    ? `${line} (${pct(best.chanceToBeatControl, lang)})`
    : line;
}

export const parisTime = (iso: string, lang: AdminLanguage) =>
  new Date(iso).toLocaleString(intlLocale(lang), { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

/** A trend is announced as a verdict only once it has held 72 hours (research R9). */
const confirmLine = (c: ChallengerAnalysis, lang: AdminLanguage) =>
  c.confirmAt ? adminText(lang)("ab.confirmOn", { date: parisTime(c.confirmAt, lang) }) : adminText(lang)("ab.toConfirm");
