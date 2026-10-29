"use client";

import React from "react";

import { useAdminText } from "../i18n/useAdminText";

/**
 * 008-ab-testing, US3 (FR-010) — the two equally first-class ways an
 * operator concludes a running test, from the "Tests A/B" tab
 * (`PageExperimentsTab.tsx`, the server component that renders this).
 * Plain `fetch` + `window.confirm` — no new UI dependency for a two-button
 * action, consistent with this codebase's existing hand-written
 * client-component style (e.g. `cookie-consent-banner.tsx`, 007-gtm-tagging).
 * Reloads the page on success so the tab reflects the concluded state
 * without a separate client-side state-management layer.
 */
export default function PromoteActions({
  experimentId,
  variants,
}: {
  experimentId: number | string;
  variants: { id: number | string; label: string }[];
}) {
  const { t } = useAdminText();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [winnerId, setWinnerId] = React.useState<string>(variants[0] ? String(variants[0].id) : "");

  async function call(path: string, body?: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/experiments/${experimentId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { errors?: { message?: string }[]; error?: string };
        throw new Error(data.errors?.[0]?.message ?? data.error ?? t("common.failedStatus", { status: res.status }));
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.actionFailed"));
      setPending(false);
    }
  }

  return (
    <div style={{ marginTop: "16px" }}>
      <label htmlFor="promote-winner-select">{t("ab.winningVariant")}</label>
      <select
        id="promote-winner-select"
        value={winnerId}
        onChange={(e) => setWinnerId(e.target.value)}
        disabled={pending || variants.length === 0}
      >
        {variants.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !winnerId}
        onClick={() => {
          if (window.confirm(t("ab.promoteConfirm")))
            void call("promote", { winnerPageId: winnerId });
        }}
        style={{ marginLeft: "8px" }}
      >
        {t("ab.promote")}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm(t("ab.concludeConfirm")))
            void call("conclude-without-promoting");
        }}
        style={{ marginLeft: "8px" }}
      >
        {t("ab.concludeWithoutPromoting")}
      </button>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
    </div>
  );
}
