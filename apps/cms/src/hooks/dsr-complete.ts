import type { CollectionBeforeChangeHook } from "payload";

/**
 * T064 (FR-027) — when a request transitions to `completed`, stamp
 * `completedAt`; for an **erasure** request also clear `email` + personal
 * `notes` so the row survives only as dated, non-personal proof.
 *
 * Runs in `beforeChange` (mutates `data` directly) — no nested write, no
 * re-entrancy.
 */
export const dsrOnComplete: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const becameCompleted = originalDoc?.status !== "completed" && data?.status === "completed";
  if (!becameCompleted) return data;

  data.completedAt = data.completedAt ?? new Date().toISOString();
  const type = data.type ?? originalDoc?.type;
  if (type === "erasure") {
    data.email = null;
    data.notes = null;
  }
  return data;
};
