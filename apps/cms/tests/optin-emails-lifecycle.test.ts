import { describe, expect, it, vi } from "vitest";

import { preventDeleteIfReferenced } from "../src/hooks/optin-emails-lifecycle";

// 006-double-optin-email, US1 (research.md §9). `body`'s placeholder
// requirement (FR-002) is Payload's own field-level `validate` — no hook
// code to unit test for it, matching 005's precedent for native Payload
// constraints; verified live instead, per quickstart.md §2.

const reqWithPages = (docs: { id: string | number; title?: string }[]) => ({
  payload: { find: vi.fn().mockResolvedValue({ totalDocs: docs.length, docs }) },
});

describe("preventDeleteIfReferenced (opt-in-emails)", () => {
  it("blocks deleting an opt-in email a page still uses, naming that page", async () => {
    const req = reqWithPages([{ id: 9, title: "Landing A" }]);
    await expect(preventDeleteIfReferenced({ id: 1, req } as never)).rejects.toThrow(/Landing A/);
  });

  it("allows deleting an opt-in email nothing references", async () => {
    const req = reqWithPages([]);
    await expect(preventDeleteIfReferenced({ id: 1, req } as never)).resolves.toBeUndefined();
  });
});
