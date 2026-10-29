import { describe, expect, it, vi } from "vitest";

import { leadReferenceGuardOnDelete } from "../src/hooks/pages-lead-guard";

// Pre-existing bug found while verifying 005-content-language-tagging's US3
// (`leads.page_id` NOT NULL vs. its FK's ON DELETE SET NULL) — see the
// hook's own header comment. Not a language-tagging concern; fixed as its
// own unit of work.

const reqWithLeadCount = (totalDocs: number) => ({
  payload: { find: vi.fn().mockResolvedValue({ totalDocs, docs: [] }) },
});

describe("leadReferenceGuardOnDelete", () => {
  it("blocks deleting a page that still has leads pointing at it", async () => {
    const req = reqWithLeadCount(3);
    await expect(leadReferenceGuardOnDelete({ id: 9, req } as never)).rejects.toThrow(/3 lead\(s\)/);
  });

  it("allows deleting a page no lead references", async () => {
    const req = reqWithLeadCount(0);
    await expect(leadReferenceGuardOnDelete({ id: 9, req } as never)).resolves.toBeUndefined();
  });
});
