"use client";

import React from "react";

import { useAdminText } from "../i18n/useAdminText";

/**
 * 022-ux-improvement (US1, research R2) — one page's views and submissions
 * per day or per hour, as an inline SVG (no chart library). « Heure » only
 * for periods of at most 7 days within the last 90 (the hourly counters'
 * life); hours without hourly data are drawn as gaps, not as 0.
 */
type Point = { t: string; views: number | null; submissions: number | null };
type Series = { step: "day" | "hour"; tz: string; dayBasis: "zone" | "utc"; points: Point[] };

const W = 760;
const H = 220;
const PAD = { left: 44, right: 12, top: 12, bottom: 40 };
const COLORS = { views: "var(--theme-success-500, #2f9e44)", submissions: "var(--theme-warning-500, #e67700)" };

function hourAllowed(from: string, to: string, now = new Date()): boolean {
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  return span <= 7 && Date.parse(`${from}T00:00:00Z`) >= now.getTime() - 89 * 86_400_000;
}

const label = (p: Point, step: Series["step"]) =>
  step === "day" ? p.t.split("-").reverse().join("/") : `${p.t.slice(8, 10)}/${p.t.slice(5, 7)} ${p.t.slice(11, 16)}`;

export default function PageStatsChart({ api, page, title, from, to }: { api: string; page: string; title: string; from: string; to: string }) {
  const { t } = useAdminText();
  const canHour = hourAllowed(from, to);
  const [step, setStep] = React.useState<"day" | "hour">("day");
  const [data, setData] = React.useState<Series | null>(null);
  const [error, setError] = React.useState(false);
  const [hover, setHover] = React.useState<number | null>(null);

  React.useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    fetch(`${api}/page-stats/series?${new URLSearchParams({ page, from, to, step }).toString()}`, { credentials: "include" })
      .then((res) => (res.ok ? (res.json() as Promise<Series>) : Promise.reject(new Error(String(res.status)))))
      .then((json) => alive && setData(json))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [api, page, from, to, step]);

  const points = data?.points ?? [];
  const max = Math.max(1, ...points.flatMap((p) => [p.views ?? 0, p.submissions ?? 0]));
  const x = (i: number) => PAD.left + (points.length <= 1 ? 0 : (i * (W - PAD.left - PAD.right)) / (points.length - 1));
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / max);
  const path = (key: "views" | "submissions") =>
    points
      .map((p, i) => (p[key] === null ? null : `${i === 0 || points[i - 1]![key] === null ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]!).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");
  const every = Math.max(1, Math.ceil(points.length / 8));
  const hovered = hover !== null ? points[hover] : null;

  return (
    <figure style={{ margin: 0 }} aria-label={t("pageStats.chartLabel", { title })}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>{title}</strong>
        <div role="group" aria-label={t("pageStats.chartStep")} style={{ display: "flex", gap: 4 }}>
          {(["day", "hour"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`btn btn--size-small ${step === s ? "btn--style-primary" : "btn--style-secondary"}`}
              aria-pressed={step === s}
              disabled={s === "hour" && !canHour}
              title={s === "hour" && !canHour ? t("pageStats.hourDisabled") : undefined}
              onClick={() => setStep(s)}
            >
              {s === "day" ? t("pageStats.day") : t("pageStats.hour")}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: "var(--theme-elevation-700)" }}>
          <span style={{ color: COLORS.views }}>■</span> {t("pageStats.views")} <span style={{ color: COLORS.submissions }}>■</span> {t("pageStats.submissions")}
        </span>
      </div>

      {error ? (
        <p role="alert">{t("pageStats.chartFailed")}</p>
      ) : !data ? (
        <p aria-busy="true">{t("common.loading")}</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block" }} role="img" aria-label={step === "day" ? t("pageStats.chartByDay") : t("pageStats.chartByHour")} onMouseLeave={() => setHover(null)}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(max * f)} y2={y(max * f)} stroke="var(--theme-elevation-150)" />
                <text x={PAD.left - 6} y={y(max * f) + 4} fontSize="11" textAnchor="end" fill="var(--theme-elevation-700)">
                  {Math.round(max * f)}
                </text>
              </g>
            ))}
            {points.map((p, i) =>
              i % every === 0 ? (
                <text key={p.t} x={x(i)} y={H - PAD.bottom + 16} fontSize="11" textAnchor={i === 0 ? "start" : i >= points.length - every ? "end" : "middle"} fill="var(--theme-elevation-700)">
                  {label(p, data.step)}
                </text>
              ) : null,
            )}
            <path d={path("views")} fill="none" stroke={COLORS.views} strokeWidth={2} />
            <path d={path("submissions")} fill="none" stroke={COLORS.submissions} strokeWidth={2} />
            {points.map((p, i) => (
              <rect
                key={`hit-${p.t}`}
                x={x(i) - (W - PAD.left - PAD.right) / Math.max(1, points.length) / 2}
                y={PAD.top}
                width={(W - PAD.left - PAD.right) / Math.max(1, points.length)}
                height={H - PAD.top - PAD.bottom}
                fill={hover === i ? "var(--theme-elevation-100)" : "transparent"}
                fillOpacity={0.5}
                onMouseEnter={() => setHover(i)}
              />
            ))}
          </svg>
          <p style={{ fontSize: 12, minHeight: 18, margin: "4px 0 0" }} aria-live="polite">
            {hovered
              ? hovered.views === null
                ? t("pageStats.noHourlyData", { at: label(hovered, data.step) })
                : t("pageStats.pointLine", { at: label(hovered, data.step), views: hovered.views, submissions: hovered.submissions ?? 0 })
              : data.step === "hour"
                ? t("pageStats.hoursOf", { tz: data.tz })
                : data.dayBasis === "utc"
                  ? t("pageStats.utcDaysNote")
                  : t("pageStats.daysOf", { tz: data.tz })}
          </p>
          <table className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            <caption>{title}</caption>
            <tbody>
              {points.map((p) => (
                <tr key={`row-${p.t}`}>
                  <th scope="row">{label(p, data.step)}</th>
                  <td>{t("pageStats.viewsN", { n: p.views ?? "—" })}</td>
                  <td>{t("pageStats.submissionsN", { n: p.submissions ?? "—" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </figure>
  );
}
