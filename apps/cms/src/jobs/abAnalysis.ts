import type { TaskConfig } from "payload";

import { refreshRunningAnalyses } from "../lib/growthbook";

/**
 * 018-ab-significance (FR-012, research R7) — every hour, a fresh GrowthBook
 * analysis of every running A/B test, stored on the test (declaring tests
 * GrowthBook does not know yet). Own queue, run by `jobs.autoRun` in
 * payload.config.ts (the `default` queue only runs at night).
 */
export const abAnalysisTask: TaskConfig<"ab-analysis"> = {
  slug: "ab-analysis",
  label: "A/B analysis refresh",
  schedule: [{ cron: "0 * * * *", queue: "ab-analysis" }],
  handler: async ({ req }) => ({ output: await refreshRunningAnalyses(req.payload) }),
};
