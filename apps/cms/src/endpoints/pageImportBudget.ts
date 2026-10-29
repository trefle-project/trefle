import type { Endpoint } from "payload";

import { isAdminOrEditor } from "../access";
import { sweepStaleImports } from "../jobs/pageImport";
import { budgetStatus } from "../lib/import/budget";

/**
 * GET /api/page-imports/budget (012-url-page-import, contracts/import-api.md)
 * — lets the wizard show upfront whether imports are available, and why not.
 * `enabled` is the feature flag (Principle III): false hides the import
 * option entirely.
 *
 * Also sweeps imports left `running` by a lost process, so a stuck import
 * resolves the next time anyone opens the wizard, even where the jobs
 * autoRun worker is off (local stack).
 */
export const pageImportBudgetEndpoint: Endpoint = {
  path: "/budget",
  method: "get",
  handler: async (req) => {
    if (!isAdminOrEditor({ req } as never) || !req.user) return new Response(null, { status: 403 });
    await sweepStaleImports(req.payload).catch(() => undefined);
    return Response.json(await budgetStatus(req.payload, req.user as never));
  },
};
