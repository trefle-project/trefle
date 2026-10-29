"use client";

import React from "react";

import { useAdminText } from "../i18n/useAdminText";

/**
 * 008-ab-testing, US1 (FR-001/FR-002/FR-003/FR-004) — the two actions that
 * turn "no test" into "a running test," from the "Tests A/B" tab
 * (`PageExperimentsTab.tsx`). Found live (page 11, reported by the user):
 * `createTestVariantEndpoint`/`startTestEndpoint` had been fully built and
 * exercised throughout the whole feature's live verification, but only
 * ever driven directly over HTTP (curl/Node scripts) — no admin UI button
 * ever called them, unlike `PromoteActions.client.tsx`'s pair for US3.
 * Same plain `fetch` + `window.confirm`/`window.prompt` style, no new UI
 * dependency, matching `PromoteActions.client.tsx` exactly.
 */
export default function VariantActions({
  controlPageId,
  controlTitle,
  hasPublishedVariant,
}: {
  controlPageId: number | string;
  controlTitle: string;
  hasPublishedVariant: boolean;
}) {
  const { t } = useAdminText();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function call(url: string, body?: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(url, {
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
    <div style={{ marginTop: "12px" }}>
      <button
        type="button"
        disabled={pending}
        onClick={() => void call(`/api/pages/${controlPageId}/create-test-variant`)}
      >
        {t("ab.createVariant")}
      </button>
      {hasPublishedVariant ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const name = window.prompt(t("ab.testNamePrompt"), t("ab.testNameDefault", { title: controlTitle }));
            if (name === null) return; // cancelled
            if (window.confirm(t("ab.startConfirm")))
              void call(`/api/experiments/start`, { controlPage: String(controlPageId), name: name || undefined });
          }}
          style={{ marginLeft: "8px" }}
        >
          {t("ab.startTest")}
        </button>
      ) : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
    </div>
  );
}
