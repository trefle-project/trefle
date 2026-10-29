"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * T095 — Core Web Vitals field-metrics beacon (stub). Off unless
 * `NEXT_PUBLIC_VITALS_ENABLED === "1"`. Sends only the metric name, a rounded
 * value, the rating and an anonymous per-navigation id — no URL, no user data.
 * Promote to an enforced signal once production monitoring lands
 * (constitution delivery roadmap Phase 4).
 */
export function WebVitals(): null {
  useReportWebVitals((metric) => {
    if (process.env.NEXT_PUBLIC_VITALS_ENABLED !== "1") return;
    try {
      const body = JSON.stringify({
        name: metric.name,
        value: Math.round(metric.value),
        rating: (metric as { rating?: string }).rating,
        id: metric.id,
      });
      navigator.sendBeacon?.("/api/vitals", body);
    } catch {
      /* never let telemetry throw */
    }
  });
  return null;
}
