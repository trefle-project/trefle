import { describe, expect, it, vi } from "vitest";

import { preventDeleteIfReferenced, preventLastActiveDeactivation } from "../src/hooks/languages-lifecycle";

// 005-content-language-tagging, US1 (FR-004/FR-004a, research.md §6).
// Duplicate-`code` rejection isn't covered here — it's Payload's own
// `unique: true` field option, no custom hook logic to unit test against a
// mocked `req.payload` — it's verified live instead, per quickstart.md §2,
// the same way this repo already verifies other DB-enforced constraints
// (e.g. 004-page-types' migration backfill).

function reqWithFind(mock: ReturnType<typeof vi.fn>) {
  return { payload: { find: mock } };
}

describe("preventLastActiveDeactivation", () => {
  it("allows deactivating a language while another stays active", async () => {
    const find = vi.fn().mockResolvedValue({ totalDocs: 1, docs: [{ id: 2 }] });
    const req = reqWithFind(find);
    const out = await preventLastActiveDeactivation({
      data: { isActive: false },
      originalDoc: { id: 1, isActive: true },
      req,
    } as never);
    expect(out).toEqual({ isActive: false });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "languages",
        where: { and: [{ isActive: { equals: true } }, { id: { not_equals: 1 } }] },
      }),
    );
  });

  it("blocks deactivating the last remaining active language", async () => {
    const find = vi.fn().mockResolvedValue({ totalDocs: 0, docs: [] });
    const req = reqWithFind(find);
    await expect(
      preventLastActiveDeactivation({
        data: { isActive: false },
        originalDoc: { id: 1, isActive: true },
        req,
      } as never),
    ).rejects.toThrow(/at least one active language must remain/);
  });

  it("does nothing for an already-inactive language staying inactive", async () => {
    const find = vi.fn();
    const req = reqWithFind(find);
    const out = await preventLastActiveDeactivation({
      data: { isActive: false },
      originalDoc: { id: 1, isActive: false },
      req,
    } as never);
    expect(out).toEqual({ isActive: false });
    expect(find).not.toHaveBeenCalled();
  });

  it("does nothing when reactivating a language", async () => {
    const find = vi.fn();
    const req = reqWithFind(find);
    const out = await preventLastActiveDeactivation({
      data: { isActive: true },
      originalDoc: { id: 1, isActive: false },
      req,
    } as never);
    expect(out).toEqual({ isActive: true });
    expect(find).not.toHaveBeenCalled();
  });
});

describe("preventDeleteIfReferenced", () => {
  it("blocks deleting a language a page still uses, naming that page", async () => {
    const find = vi.fn().mockImplementation(async ({ collection }: { collection: string }) =>
      collection === "pages" ? { docs: [{ id: 9, title: "Landing A" }] } : { docs: [] },
    );
    const req = reqWithFind(find);
    await expect(preventDeleteIfReferenced({ id: 1, req } as never)).rejects.toThrow(/Landing A/);
  });

  it("blocks deleting a language a domain's default still uses, naming that domain", async () => {
    const find = vi.fn().mockImplementation(async ({ collection }: { collection: string }) =>
      collection === "domains" ? { docs: [{ id: 3, hostname: "promo.example.com" }] } : { docs: [] },
    );
    const req = reqWithFind(find);
    await expect(preventDeleteIfReferenced({ id: 1, req } as never)).rejects.toThrow(/promo\.example\.com/);
  });

  it("allows deleting a language nothing references", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [] });
    const req = reqWithFind(find);
    await expect(preventDeleteIfReferenced({ id: 1, req } as never)).resolves.toBeUndefined();
  });
});
