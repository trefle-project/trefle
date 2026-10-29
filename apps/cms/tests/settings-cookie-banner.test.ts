import { describe, expect, it, vi } from "vitest";

import { requireFrenchBannerTranslation } from "../src/hooks/settings-cookie-banner";

// 007-gtm-tagging, FR-014.

function reqWithFrenchId(id: string | number | undefined) {
  return { payload: { find: vi.fn().mockResolvedValue({ docs: id === undefined ? [] : [{ id }] }) } };
}

describe("requireFrenchBannerTranslation", () => {
  it("does nothing when cookieBannerTranslations isn't part of this update", async () => {
    const req = reqWithFrenchId(1);
    const out = await requireFrenchBannerTranslation({ data: { retentionMonths: 24 }, req } as never);
    expect(out).toEqual({ retentionMonths: 24 });
    expect(req.payload.find).not.toHaveBeenCalled();
  });

  it("accepts an update that keeps a French row", async () => {
    const req = reqWithFrenchId(1);
    const data = { cookieBannerTranslations: [{ language: 1, title: "t" }] };
    const out = await requireFrenchBannerTranslation({ data, req } as never);
    expect(out).toBe(data);
  });

  it("accepts a French row expressed as a resolved relationship object", async () => {
    const req = reqWithFrenchId(1);
    const data = { cookieBannerTranslations: [{ language: { id: 1 }, title: "t" }] };
    const out = await requireFrenchBannerTranslation({ data, req } as never);
    expect(out).toBe(data);
  });

  it("rejects removing the last French row", async () => {
    const req = reqWithFrenchId(1);
    const data = { cookieBannerTranslations: [{ language: 2, title: "en title" }] };
    await expect(requireFrenchBannerTranslation({ data, req } as never)).rejects.toThrow(/French/);
  });

  it("rejects clearing every translation", async () => {
    const req = reqWithFrenchId(1);
    const data = { cookieBannerTranslations: [] };
    const originalDoc = { cookieBannerTranslations: [{ language: 1, title: "t" }] };
    await expect(requireFrenchBannerTranslation({ data, originalDoc, req } as never)).rejects.toThrow(/French/);
  });

  it("does not fail the save if the languages collection has no fr entry at all", async () => {
    const req = reqWithFrenchId(undefined);
    const data = { cookieBannerTranslations: [{ language: 2, title: "en title" }] };
    const out = await requireFrenchBannerTranslation({ data, req } as never);
    expect(out).toBe(data);
  });

  it("lets an unrelated save through when the stored rows never had a French row (021 migration)", async () => {
    const req = reqWithFrenchId(1);
    const stored = [{ language: 2, title: "en title" }];
    const data = { cookieBannerTranslations: [{ language: { id: 2 }, title: "en title" }], legalTexts: [{ language: 1 }] };
    expect(await requireFrenchBannerTranslation({ data, originalDoc: { cookieBannerTranslations: stored }, req } as never)).toBe(data);
    const empty = { cookieBannerTranslations: [] };
    expect(await requireFrenchBannerTranslation({ data: empty, originalDoc: { cookieBannerTranslations: [] }, req } as never)).toBe(empty);
  });

  it("still rejects a save that changes the rows and leaves no French one", async () => {
    const req = reqWithFrenchId(1);
    const data = { cookieBannerTranslations: [{ language: 2 }, { language: 3 }] };
    await expect(requireFrenchBannerTranslation({ data, originalDoc: { cookieBannerTranslations: [{ language: 2 }] }, req } as never)).rejects.toThrow(/French/);
  });
});
