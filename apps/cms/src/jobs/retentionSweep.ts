import type { TaskConfig } from "payload";

import { runRetentionSweep } from "../lib/retention";

/**
 * Scheduled retention sweep (T074/T075). Runs daily at 03:00 via the Payload
 * Jobs Queue (needs a long-running worker — see `jobs.autoRun` in
 * payload.config.ts, or a cron container invoking `payload jobs:run`). Can also
 * be triggered on demand through `POST /api/run-retention` (Admin).
 */
export const retentionSweepTask: TaskConfig<"retention-sweep"> = {
  slug: "retention-sweep",
  label: "Retention sweep",
  schedule: [{ cron: "0 3 * * *", queue: "default" }],
  handler: async ({ req }) => {
    const result = await runRetentionSweep(req.payload);
    return { output: result };
  },
};
