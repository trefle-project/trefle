import type { Payload, PayloadRequest } from "payload";

import { isAdmin } from "../access";
import { adminText } from "../i18n";
import { activeMemberEmails, computeDrift } from "../lib/edge-access";

/**
 * 019-admin-access (FR-008, SC-005, contracts/cms-endpoints.md « Drift
 * banner ») — on every admin page, for Administrators: the Cloudflare Access
 * allow-list (as apply.sh last reported it) differs from the active members.
 * Computed on each page load; nothing shown when they match.
 */
const box = {
  margin: "0",
  padding: "10px 16px",
  borderBottom: "1px solid var(--theme-warning-500)",
  background: "var(--theme-warning-100)",
  color: "var(--theme-warning-900)",
  fontSize: 14,
} as const;

const list = (emails: string[]) => emails.join(", ");

export default async function EdgeDriftBanner({ payload, req }: { payload: Payload; req?: PayloadRequest }) {
  if (!req || !isAdmin({ req } as never)) return null;

  const t = adminText(req.i18n?.language);
  let drift;
  try {
    const [global, active] = await Promise.all([
      payload.findGlobal({ slug: "edge-access", depth: 0, overrideAccess: true }),
      activeMemberEmails(payload),
    ]);
    drift = computeDrift(active, global.syncedAt ? (global.emails ?? []) : null);
  } catch {
    return null;
  }

  if (drift.state === "in-step") return null;
  if (drift.state === "never-synced") {
    return (
      <div role="status" style={box}>
        {t("settings.edgeNeverSynced")}
      </div>
    );
  }
  const parts = [
    drift.toAdd.length ? t("settings.edgeToAdd", { list: list(drift.toAdd) }) : null,
    drift.toRemove.length ? t("settings.edgeToRemove", { list: list(drift.toRemove) }) : null,
  ].filter(Boolean);
  return (
    <div role="status" style={box}>
      {t("settings.edgeOutOfStep", { parts: parts.join(", ") })}{" "}
      <code>infra/cloudflare/apply.sh --sync-members</code>.
    </div>
  );
}
