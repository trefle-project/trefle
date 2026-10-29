import type { Endpoint } from "payload";
import { APIError } from "payload";

import { isAdminOrEditor } from "../access";
import { declareOnStart } from "../lib/growthbook";

/**
 * POST /api/experiments/start (008-ab-testing, FR-002/FR-004) — creates a
 * `running` `experiments` document for a control page that has at least
 * one *published* challenger variant. `oneRunningExperimentPerControl`
 * (Experiments.ts's own `beforeChange` hook) is the real, collection-level
 * enforcement of "at most one running test per page" (FR-004); the check
 * here exists only to give a friendlier, more specific error before ever
 * reaching that hook.
 *
 * `growthbookExperimentKey` is generated locally (control id + timestamp)
 * rather than registered with GrowthBook via an API call — the bucketing
 * hot path never calls GrowthBook at all (research.md §2/§3;
 * `apps/web`'s `getRunningTestFor` sources everything from Payload), and
 * GrowthBook itself computes stats by querying Postgres directly
 * (warehouse-native — `.claude/skills/growthbook/references/self-hosting.md`).
 * A real GrowthBook integration for significance/confidence reporting is
 * `ExperimentStats`' concern (a later phase), not this endpoint's.
 */
export const startTestEndpoint: Endpoint = {
  path: "/start",
  method: "post",
  handler: async (req) => {
    if (!isAdminOrEditor({ req } as never)) return new Response(null, { status: 403 });

    const body = (await req.json?.()) as { controlPage?: string; name?: string } | undefined;
    const controlPageId = body?.controlPage;
    if (!controlPageId) return Response.json({ error: "controlPage is required" }, { status: 400 });

    const control = await req.payload.findByID({ collection: "pages", id: controlPageId, depth: 0, overrideAccess: true });
    if (!control) return Response.json({ error: "control page not found" }, { status: 404 });
    if (control.status !== "published") {
      throw new APIError("The control page must be published to start a test.", 400, undefined, true);
    }

    const variants = await req.payload.find({
      collection: "pages",
      where: { and: [{ experimentOf: { equals: controlPageId } }, { status: { equals: "published" } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if (variants.totalDocs === 0) {
      throw new APIError(
        "This page needs at least one published test variant before a test can start.",
        400,
        undefined,
        true,
      );
    }

    const alreadyRunning = await req.payload.find({
      collection: "experiments",
      where: { and: [{ controlPage: { equals: controlPageId } }, { status: { equals: "running" } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if (alreadyRunning.totalDocs > 0) {
      throw new APIError("This page already has a running test — conclude it before starting another.", 400, undefined, true);
    }

    const experiment = await req.payload.create({
      collection: "experiments",
      data: {
        name: body?.name || `${control.title} — test`,
        controlPage: Number(controlPageId),
        growthbookExperimentKey: `page-${controlPageId}-${Date.now()}`,
        status: "running",
        startedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    });

    // 018-ab-significance, FR-011 — declared to GrowthBook (best effort, after the response).
    void declareOnStart(req.payload, experiment as never);

    return Response.json({ doc: experiment }, { status: 201 });
  },
};
