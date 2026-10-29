import type { Payload, PayloadRequest } from "payload";

import { writeActivity } from "./activity";

const TOTP_ATTEMPTS = "totp-attempts";

/**
 * 019-admin-access (research R6) — clear a member's second factor so they
 * enrol again at their next login (`forceSetup`), and lift the lockout left
 * by wrong codes or passwords. Shared by the SSH emergency script and, later,
 * the Administrators' reset endpoint. Logs `totp-reset` (actor null = system;
 * `meta.via` says which path).
 */
export async function resetTotp(
  payload: Payload,
  userId: string | number,
  opts: { actor?: string | number | null; via: "ssh" | "admin"; req?: PayloadRequest },
): Promise<void> {
  await payload.update({
    collection: "users",
    id: userId,
    data: { totpSecret: null, loginAttempts: 0, lockUntil: null } as never,
    overrideAccess: true,
    req: opts.req,
  });
  // The plugin's own count of wrong codes (one row per user who sent a code).
  const row = await payload.db.findOne({ collection: TOTP_ATTEMPTS, where: { id: { equals: String(userId) } } });
  if (row) {
    await payload.db.updateOne({
      collection: TOTP_ATTEMPTS,
      id: String(userId),
      data: { attempts: 0, lockUntil: null },
    });
  }
  await writeActivity(payload, {
    type: "totp-reset",
    actor: opts.actor ?? null,
    targetType: "user",
    targetId: String(userId),
    meta: { via: opts.via },
    req: opts.req,
  });
}
