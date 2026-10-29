import type { Analysis } from "../lib/ab-verdict";
import { adminText } from "../i18n";
import { chanceLine, parisTime, rangeLine, splitWarning, verdictLine } from "../lib/ab-verdict-copy";
import type { AdminLanguage } from "../lib/admin-locale";
import { analysisEnabled } from "../lib/growthbook";
import RefreshAnalysisButton from "./RefreshAnalysisButton.client";

/**
 * 018-ab-significance (US1, US2, contracts/analysis.md « Screens ») — the
 * statistical verdict under the visits/conversions table. Reads what the
 * hourly task stored on the test: never waits on GrowthBook, and shows
 * nothing new while the analysis is not configured. Aggregates only.
 */
export type AnalysisFields = {
  id: number | string;
  status?: string;
  startedAt?: string | null;
  analysis?: unknown;
  analysisStartedAt?: string | null;
  analysisRefreshedAt?: string | null;
  analysisError?: string | null;
};

const box = { margin: "12px 0", padding: "12px 16px", border: "1px solid var(--theme-elevation-150, #ddd)", borderRadius: 4 } as const;
const MINUTE = 60_000;

export function ExperimentAnalysis({
  experiment,
  labels,
  periodSelected,
  lang,
}: {
  experiment: AnalysisFields;
  /** Page id → label shown in the table. */
  labels: Map<number, string>;
  /** A sub-period is selected: the counts follow it, the analysis does not. */
  periodSelected: boolean;
  lang: AdminLanguage;
}) {
  if (!analysisEnabled()) return null;
  const t = adminText(lang);
  const analysis = (experiment.analysis ?? null) as Analysis | null;
  const running = experiment.status === "running";
  const lateStart =
    experiment.analysisStartedAt && experiment.startedAt && Date.parse(experiment.analysisStartedAt) - Date.parse(experiment.startedAt) > MINUTE;

  return (
    <section style={box} aria-labelledby={`analysis-${experiment.id}`}>
      <h4 id={`analysis-${experiment.id}`} style={{ marginTop: 0 }}>
        {t("ab.analysisTitle")}
      </h4>

      {experiment.analysisError ? <p role="status">{experiment.analysisError}.</p> : null}

      {!analysis ? (
        !experiment.analysisError ? <p>{t("ab.firstAnalysis")}</p> : null
      ) : analysis.splitWarning ? (
        <p role="alert" style={{ fontWeight: 600 }}>
          {t("ab.checkBeforeConcluding", { warning: splitWarning(lang) })}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {analysis.challengers.map((c) => {
            const label = labels.get(c.pageId) ?? t("ab.variantN", { id: c.pageId });
            const chance = c.verdict === "not-enough-data" ? null : chanceLine(c, lang);
            const range = c.verdict === "not-enough-data" ? null : rangeLine(c, lang);
            return (
              <li key={c.pageId} style={{ marginBottom: 8 }}>
                <strong>{label}</strong> — {verdictLine(c, label, lang)}
                {chance ? <div>{chance}</div> : null}
                {range ? <div>{range}</div> : null}
              </li>
            );
          })}
        </ul>
      )}

      <p style={{ fontSize: "0.85em", opacity: 0.75, marginBottom: 8 }}>
        {lateStart ? t("ab.lateStart", { date: parisTime(experiment.analysisStartedAt!, lang) }) : null}
        {t("ab.coversWholeTest")}
        {periodSelected ? t("ab.periodNote") : null}.
        {experiment.analysisRefreshedAt ? t("ab.updatedOn", { date: parisTime(experiment.analysisRefreshedAt, lang) }) : null}
        {!running && analysis ? t("ab.frozen") : null}
      </p>
      {running ? <RefreshAnalysisButton experimentId={experiment.id} /> : null}
    </section>
  );
}
