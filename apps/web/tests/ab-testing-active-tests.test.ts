import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getRunningTestFor } from "../src/lib/payload-client";

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;

describe("getRunningTestFor (008-ab-testing, research.md §2/§3, FR-016)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns null when no running experiment matches this domain/path", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse({ docs: [], totalDocs: 0 }));
    expect(await getRunningTestFor("d1", "/promo")).toBeNull();
  });

  it("returns the control + variant ids for a matching running experiment, normalised to strings", async () => {
    // Postgres (this project's actual adapter) returns integer ids, not
    // strings — reproduces the live bug found manually testing this against
    // the real stack: an un-normalised number/string mismatch here silently
    // broke cookie-based stickiness (`.includes()` never matching).
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        jsonResponse({
          docs: [
            {
              id: 1,
              growthbookExperimentKey: "exp-promo",
              controlPage: { id: 180, domain: 5, path: "/promo" },
            },
          ],
          totalDocs: 1,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ docs: [{ id: 181 }, { id: 182 }], totalDocs: 2 }));

    const result = await getRunningTestFor(5, "/promo");
    expect(result).toEqual({ experimentKey: "exp-promo", variantIds: ["180", "181", "182"] });
    expect(result?.variantIds.every((v) => typeof v === "string")).toBe(true);
  });

  it("returns null when the control has no published variants yet (not a live test)", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        jsonResponse({
          docs: [{ id: "e1", growthbookExperimentKey: "exp-promo", controlPage: { id: "p1", domain: "d1", path: "/promo" } }],
          totalDocs: 1,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ docs: [], totalDocs: 0 }));

    expect(await getRunningTestFor("d1", "/promo")).toBeNull();
  });

  it("fails open (returns null, never throws) when the lookup errors", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));
    await expect(getRunningTestFor("d1", "/promo")).resolves.toBeNull();
  });

  it("fails open when the response is malformed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse({ notDocs: true }));
    await expect(getRunningTestFor("d1", "/promo")).resolves.toBeNull();
  });
});
