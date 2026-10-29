import { describe, expect, it } from "vitest";

import { type Analysis, type ArmStats, buildAnalysis } from "../src/lib/ab-verdict";

/** 018-ab-significance (research R8, T024/T035) — verdict rules. */
const control = (over: Partial<ArmStats> = {}): ArmStats => ({ pageId: 1, users: 1000, conversions: 40, confirmed: 20, ...over });
const challenger = (over: Partial<ArmStats> = {}): ArmStats => ({
  pageId: 2,
  users: 1000,
  conversions: 60,
  confirmed: 30,
  chanceToBeatControl: 0.97,
  ciLow: 0.05,
  ciHigh: 0.9,
  ...over,
});
const T0 = new Date("2026-10-20T10:00:00.000Z");
const hoursLater = (h: number) => new Date(T0.getTime() + h * 3600 * 1000);
const run = (arms: ArmStats[], srmPValue: number | null = 0.5, previous: Analysis | null = null, now = T0) =>
  buildAnalysis({ controlPageId: 1, arms, srmPValue, totalUsers: arms.reduce((n, a) => n + a.users, 0), previous, now });
/** The same reading at T0 and again 72 hours later: what the operator then sees. */
const held = (arms: ArmStats[], srm?: number | null) => run(arms, srm, run(arms, srm), hoursLater(72));
const verdictOf = (arms: ArmStats[], srm?: number | null) => held(arms, srm).challengers[0]!;

describe("buildAnalysis — verdicts", () => {
  it("better at ≥ 95 %, worse at ≤ 5 %, otherwise no clear difference", () => {
    expect(verdictOf([control(), challenger({ chanceToBeatControl: 0.95 })]).verdict).toBe("better");
    expect(verdictOf([control(), challenger({ chanceToBeatControl: 0.9499 })]).verdict).toBe("no-clear-difference");
    expect(verdictOf([control(), challenger({ chanceToBeatControl: 0.05 })]).verdict).toBe("worse");
    expect(verdictOf([control(), challenger({ chanceToBeatControl: 0.0501 })]).verdict).toBe("no-clear-difference");
  });

  it("keeps GrowthBook's figures on the challenger", () => {
    expect(verdictOf([control(), challenger()])).toMatchObject({ pageId: 2, chanceToBeatControl: 0.97, ciLow: 0.05, ciHigh: 0.9 });
  });

  it("needs exactly 30 leads and 300 visitors in BOTH compared arms", () => {
    expect(verdictOf([control({ conversions: 30, users: 300 }), challenger({ conversions: 30, users: 300 })]).verdict).toBe("better");
    expect(verdictOf([control({ conversions: 29 }), challenger()]).verdict).toBe("not-enough-data");
    expect(verdictOf([control(), challenger({ users: 299 })]).verdict).toBe("not-enough-data");
  });

  it("estimates the visitors still needed per arm from the pooled conversion rate", () => {
    // 10 leads per arm over 200 visitors each → rate 5 %; 20 more leads ≈ 400 visitors.
    const c = verdictOf([control({ users: 200, conversions: 10 }), challenger({ users: 200, conversions: 10 })]);
    expect(c).toMatchObject({ verdict: "not-enough-data", missingVisitorsPerArm: 400 });
    // Enough leads but too few visitors → the visitor gap.
    expect(verdictOf([control({ users: 250, conversions: 40 }), challenger({ users: 280, conversions: 45 })]).missingVisitorsPerArm).toBe(50);
  });

  it("with no lead yet, says how many leads are missing", () => {
    const c = verdictOf([control({ users: 120, conversions: 0 }), challenger({ users: 110, conversions: 0, chanceToBeatControl: 0.5 })]);
    expect(c).toMatchObject({ verdict: "not-enough-data", missingLeads: 30, missingVisitorsPerArm: 190 });
  });

  it("not enough data when GrowthBook has no chance figure for the challenger", () => {
    expect(verdictOf([control(), challenger({ chanceToBeatControl: undefined })]).verdict).toBe("not-enough-data");
  });

  it("compares every challenger with the original (three arms)", () => {
    const analysis = held([control(), challenger(), challenger({ pageId: 3, chanceToBeatControl: 0.02 })]);
    expect(analysis.challengers.map((c) => [c.pageId, c.verdict])).toEqual([
      [2, "better"],
      [3, "worse"],
    ]);
  });

  it("not enough data when the original is missing from the results", () => {
    expect(verdictOf([challenger()]).verdict).toBe("not-enough-data");
  });

  it("returns aggregates only, with the confirmed-lead counts", () => {
    const analysis = run([control(), challenger()]);
    expect(analysis.arms).toEqual([
      { pageId: 1, users: 1000, conversions: 40, confirmed: 20 },
      { pageId: 2, users: 1000, conversions: 60, confirmed: 30 },
    ]);
    expect(analysis.totalUsers).toBe(2000);
  });
});

describe("buildAnalysis — 72-hour hold (decided 2026-10-20, research R9)", () => {
  const arms = [control(), challenger()];

  it("a first better reading is only a trend, with the time it would be confirmed", () => {
    expect(run(arms).challengers[0]).toMatchObject({
      verdict: "leaning-better",
      reading: "better",
      readingSince: T0.toISOString(),
      confirmAt: hoursLater(72).toISOString(),
    });
  });

  it("is announced once the reading has held 72 hours, not before", () => {
    const first = run(arms);
    expect(run(arms, 0.5, first, hoursLater(71)).challengers[0]!.verdict).toBe("leaning-better");
    expect(run(arms, 0.5, first, hoursLater(72)).challengers[0]!.verdict).toBe("better");
  });

  it("the hold restarts when the reading drops or flips", () => {
    const first = run(arms);
    const dropped = run([control(), challenger({ chanceToBeatControl: 0.8 })], 0.5, first, hoursLater(30));
    expect(dropped.challengers[0]).toMatchObject({ verdict: "no-clear-difference", reading: null });
    const back = run(arms, 0.5, dropped, hoursLater(40));
    expect(back.challengers[0]).toMatchObject({ verdict: "leaning-better", readingSince: hoursLater(40).toISOString() });
    const flipped = run([control(), challenger({ chanceToBeatControl: 0.01 })], 0.5, first, hoursLater(80));
    expect(flipped.challengers[0]).toMatchObject({ verdict: "leaning-worse", readingSince: hoursLater(80).toISOString() });
  });

  it("a worse reading follows the same hold", () => {
    const worse = [control(), challenger({ chanceToBeatControl: 0.03 })];
    expect(run(worse).challengers[0]!.verdict).toBe("leaning-worse");
    expect(held(worse).challengers[0]!.verdict).toBe("worse");
  });
});

describe("buildAnalysis — split check (US2)", () => {
  it("a sample-ratio mismatch (p < 0.001) replaces every verdict", () => {
    const analysis = run([control(), challenger(), challenger({ pageId: 3 })], 0.0009);
    expect(analysis.splitWarning).toBe(true);
    expect(analysis.challengers.map((c) => c.verdict)).toEqual(["unreliable", "unreliable"]);
  });

  it("no warning at p ≥ 0.001 or when GrowthBook gave no p-value", () => {
    expect(run([control(), challenger()], 0.001).splitWarning).toBe(false);
    expect(run([control(), challenger()], null).splitWarning).toBe(false);
  });
});
