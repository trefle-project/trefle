import type { GlobalConfig } from "payload";

import { isAdmin } from "../access";

/**
 * 019-admin-access (data-model, research R7) — the member list that
 * `infra/cloudflare/apply.sh --sync-members` last applied to the Cloudflare
 * Access allow-list, and when. Written only by `POST /api/edge-access/synced`
 * (sync secret, `overrideAccess`); hidden and read-only in the admin. The
 * drift banner (US3) compares it with the active members.
 */
export const EdgeAccess: GlobalConfig = {
  slug: "edge-access",
  admin: { hidden: true },
  access: {
    read: isAdmin,
    update: () => false,
  },
  fields: [
    { name: "emails", type: "text", hasMany: true },
    { name: "syncedAt", type: "date" },
  ],
};
