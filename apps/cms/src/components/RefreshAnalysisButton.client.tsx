"use client";

import React from "react";

import { useAdminText } from "../i18n/useAdminText";

/**
 * 018-ab-significance (FR-012) — « Rafraîchir »: a fresh GrowthBook analysis of
 * this test now (it can take a minute or two), then the page reloads, like
 * `PromoteActions`. Before a first analysis has gone through, a failure is
 * shown as a wait (« Premières données dans N min »), not as an error.
 */
export default function RefreshAnalysisButton({ experimentId }: { experimentId: number | string }) {
  const { t } = useAdminText();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [waiting, setWaiting] = React.useState<string | null>(null);

  async function refresh() {
    setPending(true);
    setError(null);
    setWaiting(null);
    try {
      const res = await fetch(`/api/experiments/${experimentId}/refresh-analysis`, { method: "POST", credentials: "same-origin" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; waiting?: boolean };
      if (data.waiting) {
        setWaiting(data.error ?? t("ab.waitingFirstData"));
        setPending(false);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? t("common.failedStatus", { status: res.status }));
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ab.refreshFailed"));
      setPending(false);
    }
  }

  return (
    <span>
      <button type="button" onClick={() => void refresh()} disabled={pending} aria-busy={pending}>
        {pending ? t("ab.analysing") : t("ab.refresh")}
      </button>
      {waiting ? (
        <span role="status" style={{ marginLeft: 8, color: "var(--theme-elevation-600, #555)" }}>
          {waiting}
        </span>
      ) : null}
      {error ? (
        <span role="alert" style={{ marginLeft: 8, color: "var(--theme-error-500, #b00020)" }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
