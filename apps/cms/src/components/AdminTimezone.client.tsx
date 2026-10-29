"use client";

import React from "react";
import { useAuth } from "@payloadcms/ui";

import { isValidZone } from "../lib/admin-time";

/**
 * 022-ux-improvement (US6) — the signed-in member's display time zone for
 * every client component. The server provider passes the installation
 * default; the member's own choice is read from `useAuth()` so a change in
 * their account applies without a reload.
 */
const Ctx = React.createContext<string>("Europe/Paris");

export function AdminTimezoneProvider({ defaultZone, children }: { defaultZone: string; children: React.ReactNode }) {
  const { user } = useAuth<{ displayTimezone?: string | null }>();
  const own = user?.displayTimezone;
  return <Ctx.Provider value={isValidZone(own) ? own : defaultZone}>{children}</Ctx.Provider>;
}

export const useAdminTimezone = (): string => React.useContext(Ctx);
