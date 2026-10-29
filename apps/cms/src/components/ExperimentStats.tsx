import type { Payload, Where } from "payload";

import ExperimentPeriodFilter from "./ExperimentPeriodFilter.client";
import { type AnalysisFields, ExperimentAnalysis } from "./ExperimentAnalysis";
import { adminText } from "../i18n";
import type { AdminLanguage } from "../lib/admin-locale";
import { formatNumber } from "../lib/admin-locale";
import { endOfDayExclusive, startOfDay } from "../lib/experimentDayBounds";

/**
 * 008-ab-testing, US2 (FR-007/FR-009) — one shared results component,
 * mounted both from `PageExperimentsTab` (scoped to one page's own test)
 * and, in a later phase, from the `experiments` collection's own admin
 * view — the same "compose one component at every call site" precedent
 * `007-gtm-tagging`'s research.md §5 already established for `<Tagging>`.
 *
 * Reads Payload's own `page-stats` collection directly (views/
 * submissions per page id, since the test's `startedAt`) rather than
 * calling GrowthBook — the Foundational-phase finding (docs/
 * ab-testing-exploration.md §2, research.md §3) that GrowthBook is never
 * on `apps/web`'s bucketing hot path extends here too: each variant is a
 * full, independently page-stats-tracked `pages` document, so "visits and
 * conversions per variant" (FR-007) is already fully answerable from data
 * this project already collects, with no GrowthBook API call needed to
 * satisfy that requirement. A confidence/significance figure computed by
 * GrowthBook's own stats engine remains a reasonable later enhancement on
 * top of this, not a blocker for it.
 *
 * Aggregate counts only, never a per-visitor breakdown (FR-009) —
 * `page-stats` itself has no visitor-level rows to leak in the first
 * place.
 */
export type ExperimentArm = { pageId: number | string; label: string };

async function armTotals(payload: Payload, pageId: number | string, since: string | null, until: string | null) {
  const where: Where = { page: { equals: pageId } };
  if (since || until) {
    where.date = {
      ...(since ? { greater_than_equal: startOfDay(since) } : {}),
      ...(until ? { less_than: endOfDayExclusive(until) } : {}),
    };
  }
  const rows = await payload.find({
    collection: "page-stats",
    where,
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  });
  let views = 0;
  let submissions = 0;
  for (const row of rows.docs as { views?: number; submissions?: number }[]) {
    views += row.views ?? 0;
    submissions += row.submissions ?? 0;
  }
  return { views, submissions };
}

export async function ExperimentStats({
  payload,
  arms,
  since,
  until = null,
  startedAt = null,
  endedAt = null,
  experiment,
  lang,
}: {
  payload: Payload;
  arms: ExperimentArm[];
  since: string | null;
  /** 010-date-range-filters — optional upper bound, from the period picker below. */
  until?: string | null;
  /** Bounds the picker to the test's real lifetime. */
  startedAt?: string | null;
  endedAt?: string | null;
  /** 018-ab-significance — the test, for its stored statistical analysis. */
  experiment?: AnalysisFields;
  lang: AdminLanguage;
}) {
  const t = adminText(lang);
  const totals = await Promise.all(arms.map((arm) => armTotals(payload, arm.pageId, since, until)));
  const allZero = totals.every((t) => t.views === 0 && t.submissions === 0);

  return (
    <div>
      <ExperimentPeriodFilter since={since} until={until} startedAt={startedAt} endedAt={endedAt} />
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>{t("ab.colVariant")}</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>{t("ab.colVisits")}</th>
            <th style={{ textAlign: "right", padding: "4px 8px" }}>{t("ab.colConversions")}</th>
          </tr>
        </thead>
        <tbody>
          {arms.map((arm, i) => (
            <tr key={arm.pageId}>
              <td style={{ padding: "4px 8px" }}>{arm.label}</td>
              <td style={{ textAlign: "right", padding: "4px 8px" }}>{formatNumber(totals[i]!.views, lang)}</td>
              <td style={{ textAlign: "right", padding: "4px 8px" }}>{formatNumber(totals[i]!.submissions, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {allZero ? <p>{t("ab.noVisitYet")}</p> : null}
      <p style={{ fontSize: "0.85em", opacity: 0.7 }}>
        {t("ab.aggregatesOnly")}
      </p>
      {experiment ? (
        <ExperimentAnalysis
          experiment={experiment}
          labels={new Map(arms.map((arm) => [Number(arm.pageId), arm.label.replace(/ \(original\)$/, "")]))}
          periodSelected={Boolean(until) || (since !== null && since !== startedAt)}
          lang={lang}
        />
      ) : null}
    </div>
  );
}
