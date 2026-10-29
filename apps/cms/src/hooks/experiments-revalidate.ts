import type { CollectionAfterChangeHook, PayloadRequest } from "payload";

import { log } from "../lib/log";
import { revalidateTags } from "./revalidate";

const idOf = (v: unknown): string | undefined =>
  v == null ? undefined : typeof v === "object" ? String((v as { id?: unknown }).id) : String(v);

/**
 * 008-ab-testing, research.md §2 — invalidates the renderer's cached
 * "which paths currently have a running test" lookup (`ab-tests` tag,
 * read by `apps/web/src/middleware.ts`) whenever a test starts or
 * concludes. Draft ↔ draft changes (still `status: draft`) emit nothing —
 * only a transition into or out of `running` matters to the renderer.
 *
 * 020-edge-html-cache (contracts/purge.md) — also `domain:<id>` of the control
 * page's domain, so the edge drops that domain's cached pages (the tested
 * path's cached copy carries the A/B marker, or no longer should). If the
 * domain cannot be found, `html` instead: purging every page is the safe side.
 */
async function controlPageDomainTag(controlPage: unknown, req: PayloadRequest): Promise<string> {
  try {
    let domain = typeof controlPage === "object" && controlPage ? (controlPage as { domain?: unknown }).domain : undefined;
    if (domain === undefined) {
      const id = idOf(controlPage);
      if (!id) return "html";
      const page = await req.payload.findByID({ collection: "pages", id, depth: 0, req });
      domain = page?.domain;
    }
    const domainId = idOf(domain);
    return domainId ? `domain:${domainId}` : "html";
  } catch (err) {
    log.warn("experiment revalidate: control page domain not found", { message: String(err) });
    return "html";
  }
}

export const experimentsRevalidate: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const wasRunning = previousDoc?.status === "running";
  const isRunning = doc?.status === "running";
  if (wasRunning === isRunning) return doc;

  const controlPage = doc.controlPage ?? previousDoc?.controlPage;
  const controlPageId = idOf(controlPage);
  const tags = new Set<string>(["ab-tests"]);
  if (controlPageId) tags.add(`ab-test:${controlPageId}`);
  tags.add(await controlPageDomainTag(controlPage, req));

  void revalidateTags({ reason: "experiment-changed", tags: [...tags] });
  return doc;
};
