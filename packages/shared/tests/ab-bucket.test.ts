import { describe, expect, it } from "vitest";

import { assignVariant } from "../src/ab-bucket";

describe("assignVariant (008-ab-testing, research.md §3)", () => {
  it("is deterministic: same visitor + experiment + variants always returns the same variant", () => {
    const variants = ["control", "b", "c"];
    const first = assignVariant("visitor-1", "exp-1", variants);
    for (let i = 0; i < 20; i++) {
      expect(assignVariant("visitor-1", "exp-1", variants)).toBe(first);
    }
  });

  it("partitions a large sample roughly evenly across variants", () => {
    const variants = ["control", "b", "c"];
    const counts: Record<string, number> = { control: 0, b: 0, c: 0 };
    const n = 3000;
    for (let i = 0; i < n; i++) {
      counts[assignVariant(`visitor-${i}`, "exp-1", variants)]!++;
    }
    for (const v of variants) {
      // Each bucket should land roughly within ±20% of the 1/3 share —
      // loose enough to never flake, tight enough to catch a broken hash
      // that collapses everyone into one variant.
      expect(counts[v]).toBeGreaterThan(n / variants.length - n * 0.2);
      expect(counts[v]).toBeLessThan(n / variants.length + n * 0.2);
    }
  });

  it("can assign a different variant when the experiment key changes for the same visitor", () => {
    const variants = ["control", "b", "c", "d", "e"];
    const results = new Set<string>();
    for (let i = 0; i < 20; i++) {
      results.add(assignVariant("visitor-1", `exp-${i}`, variants));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it("throws on an empty variant list rather than returning undefined", () => {
    expect(() => assignVariant("visitor-1", "exp-1", [])).toThrow(/must not be empty/);
  });

  it("returns the only variant when there is exactly one", () => {
    expect(assignVariant("visitor-1", "exp-1", ["only"])).toBe("only");
  });
});
