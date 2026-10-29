import type { Config, Endpoint, Payload } from "payload";

import { writeActivity } from "./activity";

const TOTP_ATTEMPTS = "totp-attempts";
const CODE_ENDPOINTS = new Set(["/verify-totp", "/remove-totp"]);

const lockedUntil = async (payload: Payload, userId: string | number): Promise<number> => {
  const row = (await payload.db.findOne({
    collection: TOTP_ATTEMPTS,
    where: { id: { equals: String(userId) } },
  })) as { lockUntil?: string | null } | null;
  return row?.lockUntil ? new Date(row.lockUntil).getTime() : 0;
};

/**
 * 019-admin-access (data-model, `totp-locked`) — payload-totp writes its
 * lockout straight through the database adapter, so no collection hook sees
 * it. Wrap its two code endpoints instead: when a call leaves the member
 * locked and they were not before, record it. Never fails the call.
 */
export const logTotpLockouts = (config: Config): Config => ({
  ...config,
  endpoints: (config.endpoints ?? []).map((endpoint): Endpoint => {
    if (!CODE_ENDPOINTS.has(endpoint.path) || endpoint.method !== "post") return endpoint;
    return {
      ...endpoint,
      handler: async (req) => {
        const userId = req.user?.id;
        if (userId == null) return endpoint.handler(req);
        const before = await lockedUntil(req.payload, userId).catch(() => 0);
        const response = await endpoint.handler(req);
        try {
          const after = await lockedUntil(req.payload, userId);
          if (after > Date.now() && after !== before) {
            await writeActivity(req.payload, { type: "totp-locked", targetType: "user", targetId: String(userId) });
          }
        } catch {
          /* best effort — the lockout itself is the plugin's */
        }
        return response;
      },
    };
  }),
});
