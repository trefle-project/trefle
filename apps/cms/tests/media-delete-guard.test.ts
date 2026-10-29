import { describe, expect, it, vi } from "vitest";

import { mediaDeleteGuard } from "../src/hooks/media-delete-guard";

/**
 * 017-edge-protection (T049, FR-022) — a used image cannot be deleted; import
 * cleanups may. Bulk deletes run the hook per item (Payload collects each
 * item's error), so a mixed batch deletes only the unused ones.
 */
const usedHtml = `<img src="https://a.test/used.jpg">`;
const docs: Record<string, { id: number; filename: string }> = {
  "1": { id: 1, filename: "used.jpg" },
  "2": { id: 2, filename: "free.jpg" },
};

const req = (context: Record<string, unknown> = {}, language = "fr") => ({
  context,
  i18n: { language },
  payload: {
    findByID: vi.fn(async ({ id }: { id: string }) => docs[String(id)] ?? null),
    find: vi.fn(async ({ collection }: { collection: string }) => ({
      docs:
        collection === "pages"
          ? [1, 2, 3, 4, 5, 6].map((n) => ({ id: n, title: `Page ${n}`, status: "published", builder: { html: usedHtml, css: "" } }))
          : [],
    })),
  },
});

const guard = (id: string, r = req()) => mediaDeleteGuard({ id, req: r } as never);

describe("mediaDeleteGuard", () => {
  it("refuses a used image with 409 and the page titles (first 5, then « et N autres »)", async () => {
    const err = await guard("1").then(
      () => null,
      (e: { status?: number; message?: string }) => e,
    );
    expect(err?.status).toBe(409);
    expect(err?.message).toContain("Impossible de supprimer cette image : elle est utilisée dans 6 page(s) : Page 1, Page 2, Page 3, Page 4, Page 5 et 1 autres.");
    expect(err?.message).toContain("Retirez-la de ces pages ou remplacez son fichier, puis réessayez.");
  });

  it("refuses in the member's language", async () => {
    const err = await guard("1", req({}, "en")).then(
      () => null,
      (e: { message?: string }) => e,
    );
    expect(err?.message).toBe(
      "This image cannot be deleted: it is used in 6 page(s): Page 1, Page 2, Page 3, Page 4, Page 5 and 1 more. Remove it from these pages or replace its file, then try again.",
    );
  });

  it("lets an unused image go", async () => {
    await expect(guard("2")).resolves.toBeUndefined();
  });

  it("in a bulk delete, only the unused items pass", async () => {
    const results = await Promise.allSettled(["1", "2"].map((id) => guard(id)));
    expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled"]);
  });

  it("is skipped for import cleanups (context.allowUsedMediaDelete)", async () => {
    const r = req({ allowUsedMediaDelete: true });
    await expect(guard("1", r)).resolves.toBeUndefined();
    expect(r.payload.findByID).not.toHaveBeenCalled();
  });
});
