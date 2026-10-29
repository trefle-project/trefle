import React from "react";
import type { Payload } from "payload";

import { DEFAULT_ZONE, isValidZone } from "../lib/admin-time";
import { AdminTimezoneProvider } from "./AdminTimezone.client";

/**
 * 022-ux-improvement (US6, research R12) — `admin.components.providers`:
 * reads the installation default (Settings → Default) on the server, so the
 * login page has it too; the member's own choice is applied client-side.
 */
export default async function AdminTimezone({ children, payload }: { children: React.ReactNode; payload: Payload }) {
  const settings = (await payload.findGlobal({ slug: "settings", depth: 0, overrideAccess: true }).catch(() => null)) as { adminTimezone?: string | null } | null;
  const defaultZone = isValidZone(settings?.adminTimezone) ? settings.adminTimezone : DEFAULT_ZONE;
  return <AdminTimezoneProvider defaultZone={defaultZone}>{children}</AdminTimezoneProvider>;
}
