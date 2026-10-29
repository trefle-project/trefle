import type { Payload, PayloadRequest } from "payload";

import type { ActivityType } from "@trefle/shared";

/**
 * Append a non-personal audit entry (FR-034b). Writes bypass collection access
 * (the collection forbids `create` through the API) and never throw into the
 * caller — an audit failure must not fail the underlying operation.
 */
export async function writeActivity(
  payload: Payload,
  entry: {
    type: ActivityType;
    actor?: string | number | null;
    targetType?: string;
    targetId?: string;
    meta?: Record<string, unknown>;
    req?: PayloadRequest;
  },
): Promise<void> {
  try {
    const actor =
      entry.actor == null ? null : typeof entry.actor === "number" ? entry.actor : Number(entry.actor);
    await payload.create({
      collection: "activity-log",
      overrideAccess: true,
      data: {
        type: entry.type,
        actor: Number.isNaN(actor as number) ? null : actor,
        targetType: entry.targetType,
        targetId: entry.targetId,
        at: new Date().toISOString(),
        meta: entry.meta,
      },
    });
  } catch (err) {
    payload.logger.warn(`activity-log write failed (${entry.type}): ${String(err)}`);
  }
}
