import type { Endpoint } from "payload";
import { APIError } from "payload";

import { isAdminOrEditor } from "../access";

/**
 * Strips every array-row's own `id` from a value read back from one
 * document before reusing it to create a *different* document. Payload
 * array-field rows (here: `form.fields`, and each field's own `options`)
 * carry the source document's row ids; the Postgres adapter then tries to
 * reuse them for the new document's own rows and rejects the whole create
 * as a duplicate (found live: "Value must be unique, path: id, tableName:
 * pages" creating the very first variant). Payload assigns fresh ids to
 * any row with none, so simply omitting them is enough — recurses so a
 * nested array (`options` inside a `fields` row) is cleaned too.
 */
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
 * POST /api/pages/:id/create-test-variant (008-ab-testing, FR-001/FR-003,
 * docs/ab-testing-exploration.md §5.1) — copies `builder`/`form`/`seo` (and,
 * since 014-custom-code-editing, the admin-only `customCode`, FR-006) from
 * a published page into a new challenger-variant document: `experimentOf`
 * set to the source id, `domain`/`path` left unset (a variant is never
 * resolved by its own URL — publishGuard skips those checks for it).
 *
 * Repeatable by design (multivariate is the committed default, not a later
 * extension) — a second call on the same source adds a third variant, and
 * so on; nothing here assumes exactly one challenger.
 *
 * The new variant starts as `draft`, same as any freshly created page — an
 * operator edits it through the ordinary GrapesJS canvas and publishes it
 * when ready, the same flow as any other page. `startTest` (a separate
 * endpoint) only considers *published* variants eligible.
 *
 * Collection-level endpoint on `Pages.ts` (`pageConflictCheckEndpoint`'s
 * own header comment explains why: any `/api/pages/*` request is routed by
 * matching against `pages`'s own `endpoints` array only).
 */
export const createTestVariantEndpoint: Endpoint = {
  path: "/:id/create-test-variant",
  method: "post",
  handler: async (req) => {
    if (!isAdminOrEditor({ req } as never)) return new Response(null, { status: 403 });

    const sourceId = req.routeParams?.id as string | undefined;
    if (!sourceId) return Response.json({ error: "missing source page id" }, { status: 400 });

    const source = await req.payload.findByID({
      collection: "pages",
      id: sourceId,
      depth: 0,
      overrideAccess: true,
    });
    if (!source) return Response.json({ error: "source page not found" }, { status: 404 });
    if (source.status !== "published") {
      throw new APIError("Only a published page can have test variants created from it.", 400, undefined, true);
    }
    if (source.experimentOf) {
      throw new APIError("A test variant cannot itself have variants — create them from the control page.", 400, undefined, true);
    }

    const variant = await req.payload.create({
      collection: "pages",
      data: {
        title: `${source.title} (variant)`,
        pageType: source.pageType,
        language: source.language,
        experimentOf: Number(sourceId),
        status: "draft",
        builder: source.builder,
        form: stripArrayRowIds(source.form),
        seo: source.seo,
        // Read and written with overrideAccess: a variant keeps the control's
        // scripts and code blocks whoever creates it (research R6/R10).
        customCode: stripArrayRowIds(source.customCode),
      },
      overrideAccess: true,
    });

    return Response.json({ doc: { id: variant.id, title: variant.title, experimentOf: sourceId } }, { status: 201 });
  },
};
