import { describe, expect, it, vi } from "vitest";

import { confirmationGuardOnDelete, confirmationGuardOnUnpublish } from "../src/hooks/pages-confirmation-guard";

const reqWith = (docs: { id: string | number; title?: string }[]) => ({
  payload: { find: vi.fn().mockResolvedValue({ docs }) },
});

describe("confirmationGuardOnDelete (003-post-launch-improvements, spec.md edge case)", () => {
  it("blocks deleting a page referenced as someone's confirmationPage", async () => {
    const req = reqWith([{ id: 5, title: "Landing A" }]);
    await expect(confirmationGuardOnDelete({ id: 9, req } as never)).rejects.toThrow(/Landing A/);
  });

  it("allows deleting a page nothing references", async () => {
    const req = reqWith([]);
    await expect(confirmationGuardOnDelete({ id: 9, req } as never)).resolves.toBeUndefined();
  });
});

describe("confirmationGuardOnUnpublish", () => {
  it("blocks unpublishing a page referenced as someone's confirmationPage", async () => {
    const req = reqWith([{ id: 5, title: "Landing A" }, { id: 6, title: "Landing B" }]);
    await expect(
      confirmationGuardOnUnpublish({
        data: { status: "draft" },
        originalDoc: { id: 9, status: "published" },
        req,
      } as never),
    ).rejects.toThrow(/Landing A, Landing B/);
  });

  it("allows unpublishing a page nothing references", async () => {
    const req = reqWith([]);
    const out = await confirmationGuardOnUnpublish({
      data: { status: "draft" },
      originalDoc: { id: 9, status: "published" },
      req,
    } as never);
    expect(out).toEqual({ status: "draft" });
  });

  it("does nothing for a draft-to-draft save (no publish-state transition)", async () => {
    const req = reqWith([{ id: 5, title: "Landing A" }]);
    const out = await confirmationGuardOnUnpublish({
      data: { status: "draft" },
      originalDoc: { id: 9, status: "draft" },
      req,
    } as never);
    expect(out).toEqual({ status: "draft" });
    expect(req.payload.find).not.toHaveBeenCalled();
  });

  it("does nothing when a published page stays published", async () => {
    const req = reqWith([{ id: 5, title: "Landing A" }]);
    const out = await confirmationGuardOnUnpublish({
      data: { status: "published", title: "x" },
      originalDoc: { id: 9, status: "published" },
      req,
    } as never);
    expect(out).toEqual({ status: "published", title: "x" });
    expect(req.payload.find).not.toHaveBeenCalled();
  });
});
