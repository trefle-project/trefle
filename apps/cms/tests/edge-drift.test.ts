import { describe, expect, it } from "vitest";

import { computeDrift } from "../src/lib/edge-access";

/**
 * 019-admin-access (T039, data-model « Drift ») — what the admin banner shows.
 */
describe("computeDrift", () => {
  it("never synced", () => {
    expect(computeDrift(["a@x.fr"], null)).toEqual({ state: "never-synced" });
    expect(computeDrift(["a@x.fr"], undefined)).toEqual({ state: "never-synced" });
  });

  it("in step, whatever the case and order", () => {
    expect(computeDrift(["B@x.fr", "a@x.fr"], ["a@x.fr", "b@X.fr"])).toEqual({ state: "in-step" });
  });

  it("names the addresses to add and to remove", () => {
    expect(computeDrift(["a@x.fr", "new@x.fr"], ["a@x.fr", "gone@x.fr"])).toEqual({
      state: "drift",
      toAdd: ["new@x.fr"],
      toRemove: ["gone@x.fr"],
    });
  });

  it("an empty synced list is a drift, not « never synced »", () => {
    expect(computeDrift(["a@x.fr"], [])).toEqual({ state: "drift", toAdd: ["a@x.fr"], toRemove: [] });
  });
});
