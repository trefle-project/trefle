import type { Endpoint } from "payload";
import { APIError } from "payload";

import { isAdminOrEditor } from "../access";
import { concludeInGrowthBook } from "../lib/growthbook";

/** Same fix as `createTestVariant.ts`'s own copy (Principle I: two call
 * sites copy, the third may extract) — see that file's header comment for
 * the live bug this closes. */
function stripArrayRowIds<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === "object" && "id" in item) {
        const rest: Record<string, unknown> = { ...(item as Record<string, unknown>) };
        delete rest.id;
        return stripArrayRowIds(rest);
      }
      return stripArrayRowIds(item);
    }) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = stripArrayRowIds(v);
    return out as T;
  }
  return value;
}

/**
 * POST /api/experiments/:id/promote (008-ab-testing, FR-010/FR-011,
 * docs/ab-testing-exploration.md §5.2) — concludes a running test by
 * copying the chosen variant's `builder`/`form`/`seo` **onto** the control
 * page document, via an ordinary `payload.update` — never swaps document
 * identity. The control keeps its own id, `domain`, `path`, and every
 * lead already attached to it; only its content changes. Because this is
 * a normal update, the control's own `afterChange` hooks
 * (`pageRevalidate`, `pageActivity`) fire exactly as they would for any
 * other page edit — cache invalidation for the promoted content is free,
 * no separate revalidation call needed here.
 *
 * The non-promoted variant(s) are never touched or flagged — "lost" is
 * derived, not stored (`Experiments.ts`'s own header comment, Principle
 * I): once `experiments.status` is `concluded` and `winner` differs from
 * a variant's own id, that variant is implicitly the loser. Both winner
 * and loser stay reachable exactly as before — nothing here deletes
 * anything.
 */
export const promoteVariantEndpoint: Endpoint = {
  path: "/:id/promote",
  method: "post",
  handler: async (req) => {
    if (!isAdminOrEditor({ req } as never)) return new Response(null, { status: 403 });

    const experimentId = req.routeParams?.id as string | undefined;
    if (!experimentId) return Response.json({ error: "missing experiment id" }, { status: 400 });

    const body = (await req.json?.()) as { winnerPageId?: string } | undefined;
    const winnerPageId = body?.winnerPageId;
    if (!winnerPageId) return Response.json({ error: "winnerPageId is required" }, { status: 400 });

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

    const controlPageId =
      typeof experiment.controlPage === "object" ? experiment.controlPage.id : experiment.controlPage;

    const winner = await req.payload.findByID({
      collection: "pages",
      id: winnerPageId,
      depth: 0,
      overrideAccess: true,
    });
    if (!winner) return Response.json({ error: "winner page not found" }, { status: 404 });
    const winnerExperimentOf = typeof winner.experimentOf === "object" ? winner.experimentOf?.id : winner.experimentOf;
    if (String(winnerExperimentOf) !== String(controlPageId)) {
      throw new APIError("The chosen winner is not a variant of this test's control page.", 400, undefined, true);
    }
    if (winner.status !== "published") {
      throw new APIError("Only a published variant can be promoted.", 400, undefined, true);
    }

    await req.payload.update({
      collection: "pages",
      id: controlPageId,
      data: {
        builder: winner.builder,
        form: stripArrayRowIds(winner.form),
        seo: winner.seo,
      },
      overrideAccess: true,
    });

    const concluded = await req.payload.update({
      collection: "experiments",
      id: experimentId,
      data: { status: "concluded", winner: Number(winnerPageId), endedAt: new Date().toISOString() },
      overrideAccess: true,
    });

    // 018-ab-significance — last analysis, then closed in GrowthBook (after the response).
    void concludeInGrowthBook(req.payload, concluded as never, winnerPageId);

    return Response.json({ doc: concluded });
  },
};
