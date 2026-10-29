import { describe, expect, it, vi } from "vitest";

import { settingsActivity } from "../src/hooks/settings-activity";

/**
 * T071 (FR-018, US4-3) — changing `settings` must NOT rewrite existing pages or
 * consent records. The afterChange hook only appends a `settings-changed`
 * activity entry; it never touches other collections.
 */
describe("settings afterChange — no cascade (T073/T071)", () => {
  it("writes exactly one settings-changed activity entry and updates nothing else", async () => {
    const create = vi.fn().mockResolvedValue({});
    const update = vi.fn().mockResolvedValue({});
    const req = { payload: { create, update, logger: { warn: vi.fn() } }, user: { id: 3 } };

    await settingsActivity({ req } as never);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "activity-log",
        data: expect.objectContaining({ type: "settings-changed", actor: 3, targetType: "settings" }),
      }),
    );
    // never rewrites pages / consent records / leads
    expect(update).not.toHaveBeenCalled();
    for (const call of create.mock.calls) {
      expect(["pages", "consent-records", "leads"]).not.toContain(call[0].collection);
    }
  });
});
