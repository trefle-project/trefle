"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useConfig, useStepNav } from "@payloadcms/ui";

import type { PageTotals, StatsFilters, Totals } from "../lib/page-stats";
import DateRangePicker from "./DateRangePicker.client";
import PageStatsChart from "./PageStatsChart.client";
import { useAdminText } from "../i18n/useAdminText";
import type { AdminKey } from "../i18n";
import { formatNumber, type AdminLanguage } from "../lib/admin-locale";

/**
 * 022-ux-improvement (US1) — the Pages Stats table: period picker, sortable
 * columns, CSV export, and a day/hour chart under the clicked row. The period,
 * sort, search and filters live in the URL; the server view recomputes the
 * totals (Payload's own search bar and filters went with its list view).
 */
type Props = { from: string; to: string; sort: string; tz: string; filters: StatsFilters; totals: Totals | null; error: string | null };

const COLUMNS: { key: string; label: AdminKey; numeric?: boolean }[] = [
  { key: "id", label: "pageStats.colPageId", numeric: true },
  { key: "title", label: "pageStats.colPage" },
  { key: "domain", label: "pageStats.colDomain" },
  { key: "views", label: "pageStats.colViews", numeric: true },
  { key: "submissions", label: "pageStats.colSubmissions", numeric: true },
  { key: "rate", label: "pageStats.colRate", numeric: true },
];

const toLocalDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};
const toDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const frDay = (day: string) => day.split("-").reverse().join("/");
// French keeps today's « 12.5 % »; English « 12.5% ».
const rate = (r: PageTotals, lang: AdminLanguage) => (r.rate === null ? "—" : `${(r.rate * 100).toFixed(1)}${lang === "fr" ? " %" : "%"}`);
const rowKey = (r: PageTotals) => (r.id === null ? "deleted" : String(r.id));

export default function PageStatsTable({ from, to, sort, tz, filters, totals, error }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { t, lang } = useAdminText();
  const { config } = useConfig();
  const [open, setOpen] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const api = `${config.serverURL ?? ""}${config.routes.api}`;
  const { setStepNav } = useStepNav();
  // Breadcrumb « / Pages Stats », as Payload's own list views show.
  React.useEffect(() => setStepNav([{ label: "Pages Stats" }]), [setStepNav]);
  const [search, setSearch] = React.useState(filters.q ?? "");
  const lastQ = React.useRef(filters.q ?? "");
  // The controls show a change at once; the URL (and the totals) follow.
  const [domain, setDomain] = React.useState(filters.domain ?? "");
  const [status, setStatus] = React.useState<string>(filters.status ?? "");
  const [withViews, setWithViews] = React.useState(Boolean(filters.withViews));
  React.useEffect(() => {
    setDomain(filters.domain ?? "");
    setStatus(filters.status ?? "");
    setWithViews(Boolean(filters.withViews));
  }, [filters.domain, filters.status, filters.withViews]);

  // Current query (period, sort, search, filters), as URL parameters.
  const current = (): Record<string, string> => ({
    from,
    to,
    sort,
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.domain ? { domain: filters.domain } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.withViews ? { withViews: "1" } : {}),
  });

  // Start from the address bar, so the parameters Payload's list keeps there
  // (depth, limit) stay and it has nothing to rewrite from a stale snapshot.
  const go = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    for (const [k, v] of Object.entries(current())) params.set(k, v);
    for (const k of ["q", "domain", "status", "withViews"]) if (!(k in current())) params.delete(k);
    if ("q" in next) lastQ.current = next.q ?? "";
    for (const [k, v] of Object.entries(next)) if (v === null) params.delete(k);
    else params.set(k, v);
    setOpen(null);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };
  const sortKey = sort.replace(/^-/, "");
  const desc = sort.startsWith("-");
  const sortHref = (key: string) => {
    const next = sortKey === key && desc ? key : `-${key}`;
    return `${pathname}?${new URLSearchParams({ ...current(), sort: next }).toString()}`;
  };

  // Search: applied 400 ms after the last keystroke.
  React.useEffect(() => {
    if (search.trim() === lastQ.current) return;
    const timer = setTimeout(() => go({ q: search.trim() || null }), 400);
    return () => clearTimeout(timer);
    // `go` reads the current URL state on purpose: only `search` triggers it.
  }, [search]);
  const filtered = Boolean(filters.q || filters.domain || filters.status || filters.withViews);

  const rows = totals ? [...totals.rows, ...(totals.deleted ? [totals.deleted] : [])] : [];

  return (
    <div aria-busy={pending}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <DateRangePicker
          from={toLocalDate(from)}
          to={toLocalDate(to)}
          toBound={new Date()}
          onApply={(f, t) => go({ from: toDay(f), to: toDay(t) })}
          onClear={() => go({ from: null, to: null })}
        />
        <a className="btn btn--style-secondary btn--size-small" href={`${api}/page-stats/export?${new URLSearchParams(current()).toString()}`}>
          {t("pageStats.exportCsv")}
        </a>
        <span style={{ fontSize: 13, color: "var(--theme-elevation-700)" }}>
          {t("pageStats.period", { from: frDay(from), to: frDay(to) })} · {totals?.dayBasis === "utc" ? t("pageStats.utcDays") : t("pageStats.zoneDaysHours", { tz })}
          {pending ? t("pageStats.loadingSuffix") : ""}
        </span>
      </div>

      <div className="trefle-stats-filters" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("pageStats.searchPlaceholder")}
          aria-label={t("pageStats.searchLabel")}
          style={{ flex: "1 1 260px", padding: "8px 12px", border: "1px solid var(--theme-elevation-150)", borderRadius: 4, background: "var(--theme-input-bg, var(--theme-bg))", color: "var(--theme-text)" }}
        />
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          {t("pageStats.domain")}
          <select
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              go({ domain: e.target.value || null });
            }}
          >
            <option value="">{t("common.all")}</option>
            {(totals?.domains ?? []).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          {t("pageStats.status")}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              go({ status: e.target.value || null });
            }}
          >
            <option value="">{t("common.all")}</option>
            <option value="published">{t("pageStats.published")}</option>
            <option value="draft">{t("pageStats.drafts")}</option>
          </select>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={withViews}
            onChange={(e) => {
              setWithViews(e.target.checked);
              go({ withViews: e.target.checked ? "1" : null });
            }}
          />
          {t("pageStats.withViewsOnly")}
        </label>
        {filtered ? (
          <button
            type="button"
            className="btn btn--style-secondary btn--size-small"
            onClick={() => {
              setSearch("");
              setDomain("");
              setStatus("");
              setWithViews(false);
              go({ q: null, domain: null, status: null, withViews: null });
            }}
          >
            {t("pageStats.clearFilters")}
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" style={{ color: "var(--theme-error-500)" }}>
          {error}{" "}
          <button type="button" className="btn btn--style-secondary btn--size-small" onClick={() => router.refresh()}>
            {t("common.retry")}
          </button>
        </p>
      ) : rows.length === 0 ? (
        <p>{filtered ? t("pageStats.noMatch") : t("pageStats.noPage")}</p>
      ) : (
        <div className="table" style={{ overflowX: "auto" }}>
          <table cellPadding={0} cellSpacing={0} style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: 44, minWidth: 0 }}>
                  <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                    {t("pageStats.chart")}
                  </span>
                </th>
                {COLUMNS.map((c) => (
                  <th key={c.key} style={{ textAlign: c.numeric ? "right" : "left" }} aria-sort={sortKey === c.key ? (desc ? "descending" : "ascending") : "none"}>
                    <Link href={sortHref(c.key)} onClick={() => setOpen(null)} style={{ color: "var(--theme-elevation-800)" }}>
                      {t(c.label)}
                      {sortKey === c.key ? (desc ? " ↓" : " ↑") : ""}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = rowKey(r);
                const isOpen = open === key;
                return (
                  <React.Fragment key={key}>
                    {/* The whole row opens the chart for the mouse; the button is the keyboard and screen-reader way. */}
                    <tr className={isOpen ? "row--open" : undefined} style={{ cursor: "pointer" }} onClick={() => setOpen(isOpen ? null : key)}>
                      <td style={{ width: 44, minWidth: 0 }}>
                        <button
                          type="button"
                          className="trefle-stats-toggle"
                          aria-expanded={isOpen}
                          aria-label={t("pageStats.chartOf", { title: r.title || t("pageStats.thePage", { id: String(r.id) }) })}
                          title={isOpen ? t("pageStats.closeChart") : t("pageStats.openChart")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpen(isOpen ? null : key);
                          }}
                        >
                          <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
                            <path d="M6 3 11 8 6 13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{r.id ?? ""}</td>
                      <td>
                        {r.id === null ? (
                          <em>{r.title}</em>
                        ) : (
                          <Link href={`${config.routes.admin}/collections/pages/${r.id}`} onClick={(e) => e.stopPropagation()}>
                            {r.title || t("pageStats.pageN", { id: String(r.id) })}
                          </Link>
                        )}
                      </td>
                      <td>{r.domain ?? ""}</td>
                      <td style={{ textAlign: "right" }}>{formatNumber(r.views, lang)}</td>
                      <td style={{ textAlign: "right" }}>{formatNumber(r.submissions, lang)}</td>
                      <td style={{ textAlign: "right" }}>{rate(r, lang)}</td>
                    </tr>
                    {isOpen ? (
                      <tr>
                        <td colSpan={COLUMNS.length + 1} style={{ padding: "8px 0 16px" }}>
                          <PageStatsChart api={api} page={key} title={r.title || t("pageStats.pageN", { id: String(r.id) })} from={from} to={to} />
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
