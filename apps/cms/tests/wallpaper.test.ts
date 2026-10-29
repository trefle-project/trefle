import { describe, expect, it } from "vitest";

import { gridFor, placeVariants, seeded } from "../src/lib/wallpaper";

/** 022-ux-improvement (US4, T033) — where the variant tile goes. */
describe("placeVariants", () => {
  it("« K par écran »: exactly K distinct cells, capped by the grid", () => {
    expect(placeVariants({ cols: 256, rows: 144, mode: "perScreen", count: 1, oneIn: 0, random: seeded(1) }).size).toBe(1);
    expect(placeVariants({ cols: 10, rows: 10, mode: "perScreen", count: 7, oneIn: 0, random: seeded(2) }).size).toBe(7);
    expect(placeVariants({ cols: 2, rows: 2, mode: "perScreen", count: 50, oneIn: 0, random: seeded(3) }).size).toBe(4);
    for (const i of placeVariants({ cols: 3, rows: 3, mode: "perScreen", count: 5, oneIn: 0, random: seeded(4) })) expect(i).toBeLessThan(9);
  });

  it("« 1 sur N »: about one cell in N, sometimes none", () => {
    const random = seeded(5);
    let total = 0;
    for (let i = 0; i < 200; i++) total += placeVariants({ cols: 100, rows: 100, mode: "oneIn", count: 0, oneIn: 50, random }).size;
    expect(total / 200).toBeGreaterThan(180);
    expect(total / 200).toBeLessThan(220);
    const rare = Array.from({ length: 200 }, () => placeVariants({ cols: 256, rows: 144, mode: "oneIn", count: 0, oneIn: 36864, random }).size);
    expect(rare.filter((n) => n === 0).length).toBeGreaterThan(40); // ~37 % of screens without one
  });

  it("is deterministic with a seeded source; the grid covers the screen", () => {
    const a = [...placeVariants({ cols: 50, rows: 50, mode: "perScreen", count: 3, oneIn: 0, random: seeded(9) })];
    const b = [...placeVariants({ cols: 50, rows: 50, mode: "perScreen", count: 3, oneIn: 0, random: seeded(9) })];
    expect(a).toEqual(b);
    expect(gridFor(3840, 2160, 15, 15)).toEqual({ cols: 256, rows: 144 });
    expect(gridFor(1000, 700, 30, 30)).toEqual({ cols: 34, rows: 24 });
  });
});
