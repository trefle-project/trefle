"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import React from "react";

import { useAdminText } from "../i18n/useAdminText";

import { UsageList, useMediaUsage } from "./MediaUsageList.client";

/**
 * 017-edge-protection (FR-020, contracts/media-usage.md) — « Utilisée dans »
 * at the top of a media item's edit view, so an editor sees which pages a
 * replacement would change, and why a deletion is refused.
 */
const panel: React.CSSProperties = {
  margin: "0 0 16px",
  padding: "12px 16px",
  border: "1px solid var(--theme-elevation-150)",
  borderRadius: 4,
  background: "var(--theme-elevation-50)",
  width: "100%",
};

export default function MediaUsage() {
  const { t } = useAdminText();
  const { id, lastUpdateTime } = useDocumentInfo();
  const state = useMediaUsage(id ?? undefined, lastUpdateTime);
  if (!id || !state) return null;

  let content: React.ReactNode;
  if (state.status === "loading") content = t("media.usageLoading");
  else if (state.status === "error") content = t("media.usageFailed");
  else if (state.usage.total === 0) content = t("media.unused");
  else
    content = (
      <>
        <strong>{t("media.usedIn", { n: state.usage.total })}</strong>
        <UsageList usage={state.usage} />
        <p style={{ margin: "8px 0 0" }}>{t("media.deleteBlocked")}</p>
      </>
    );
  return (
    <div style={panel} data-testid="media-usage">
      {content}
    </div>
  );
}
