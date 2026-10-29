import type { CollectionBeforeChangeHook } from "payload";
import { APIError } from "payload";

/**
 * 008-ab-testing, FR-004 — a page may have at most one running test at a
 * time. Rejects transitioning an `experiments` document to `status:
 * running` while another `experiments` document for the same
 * `controlPage` is already `running`. Collection-level, not left to the
 * admin UI alone to prevent (plan.md Risks).
 */
export const oneRunningExperimentPerControl: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const nextStatus = data?.status ?? originalDoc?.status;
  if (nextStatus !== "running") return data;

  const controlPage = data?.controlPage ?? originalDoc?.controlPage;
  if (!controlPage) return data;
  const controlPageId = typeof controlPage === "object" ? (controlPage as { id: string }).id : controlPage;

  const clash = await req.payload.find({
    collection: "experiments",
    where: {
      and: [
        { controlPage: { equals: controlPageId } },
        { status: { equals: "running" } },
        ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (clash.totalDocs > 0) {
    throw new APIError("This page already has a running test — conclude it before starting another.", 400, undefined, true);
  }

  return data;
};
