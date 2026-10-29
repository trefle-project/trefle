import React from "react";
import type { ListViewServerProps } from "payload";

import { defaultPeriod } from "../endpoints/pageStatsReport";
import { adminText } from "../i18n";
import { effectiveZone } from "../lib/admin-time";
import { drizzleOf, pageStatsTotals, parseFilters, type Totals } from "../lib/page-stats";
import PageStatsTable from "./PageStatsTable.client";

/**
 * 022-ux-improvement (US1, contracts/page-stats.md) — replaces the
 * `page-stats` list view: one row per page with its totals over the period
 * (`from`/`to`/`sort` in the URL), instead of one stored row per page and
 * day. Days are those of the member's display time zone (US6).
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function PageStatsView({ payload, user, searchParams, i18n }: ListViewServerProps) {
  const t = adminText(i18n?.language);
  const settings = (await payload.findGlobal({ slug: "settings", depth: 0, overrideAccess: true })) as { adminTimezone?: string | null };
  const tz = effectiveZone(user as { displayTimezone?: string | null } | null, settings);
  const fallback = defaultPeriod(tz);
  const param = (key: string) => (typeof searchParams?.[key] === "string" ? (searchParams[key] as string) : undefined);
  const from = param("from") && DAY.test(param("from")!) ? param("from")! : fallback.from;
  const to = param("to") && DAY.test(param("to")!) && param("to")! >= from ? param("to")! : fallback.to;
  const sort = param("sort") ?? "-views";
  const filters = parseFilters(searchParams as Record<string, unknown> | undefined);

  let totals: Totals | null = null;
  let error: string | null = null;
  try {
    totals = await pageStatsTotals(drizzleOf(payload), { from, to, sort, tz, filters, deletedTitle: t("pageStats.deletedPages") });
  } catch (err) {
    payload.logger.error({ err }, "page-stats totals failed");
    error = t("pageStats.loadFailed");
  }

  return (
    <div className="collection-list">
      <div className="gutter--left gutter--right" style={{ paddingTop: 24, paddingBottom: 48 }}>
        <h1 style={{ marginBottom: 16 }}>Pages Stats</h1>
        <PageStatsTable from={from} to={to} sort={sort} tz={tz} filters={filters} totals={totals} error={error} />
      </div>
    </div>
  );
}
