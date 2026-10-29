import type { Endpoint } from "payload";
import { APIError } from "payload";

import { isAdminOrEditor } from "../access";
import { concludeInGrowthBook } from "../lib/growthbook";

/**
 * POST /api/experiments/:id/conclude-without-promoting (008-ab-testing,
 * FR-010) — the other equally first-class way a running test ends: no
 * variant is promoted, `winner` stays unset, and the control page's own
 * fields are never touched at all (spec.md User Story 3, Scenario 3).
 */
export const concludeTestWithoutPromotingEndpoint: Endpoint = {
  path: "/:id/conclude-without-promoting",
  method: "post",
  handler: async (req) => {
    if (!isAdminOrEditor({ req } as never)) return new Response(null, { status: 403 });

    const experimentId = req.routeParams?.id as string | undefined;
    if (!experimentId) return Response.json({ error: "missing experiment id" }, { status: 400 });

    const experiment = await req.payload.findByID({
      collection: "experiments",
      id: experimentId,
      depth: 0,
      overrideAccess: true,
    });
    if (!experiment) return Response.json({ error: "experiment not found" }, { status: 404 });
    if (experiment.status !== "running") {
      throw new APIError("Only a running test can be concluded.", 400, undefined, true);
    }

    const concluded = await req.payload.update({
      collection: "experiments",
      id: experimentId,
      data: { status: "concluded", endedAt: new Date().toISOString() },
      overrideAccess: true,
    });

    // 018-ab-significance — last analysis, then closed in GrowthBook (after the response).
    void concludeInGrowthBook(req.payload, concluded as never, null);

    return Response.json({ doc: concluded });
  },
};
