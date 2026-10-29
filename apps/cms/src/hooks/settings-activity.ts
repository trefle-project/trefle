import type { GlobalAfterChangeHook } from "payload";

import { writeActivity } from "../lib/activity";

/**
 * T073 (FR-018, US4-3) — record a `settings-changed` activity entry with the
 * acting member. Changing the defaults here never touches existing pages or
 * consent records: this hook only appends to the activity log.
 */
export const settingsActivity: GlobalAfterChangeHook = ({ req }) => {
  void writeActivity(req.payload, {
    type: "settings-changed",
    actor: req.user?.id ?? null,
    targetType: "settings",
    targetId: "workspace",
    req,
  });
};
