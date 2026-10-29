/**
 * 018-ab-significance (research R8, contracts/analysis.md) — the operator's
 * verdict, from the numbers GrowthBook computes. Pure: no I/O.
 *
 * 1. Split check first: a sample-ratio mismatch (p < 0.001, GrowthBook's own
 *    threshold) means the numbers cannot be trusted — no verdict at all.
 * 2. Minimum sample, in BOTH compared arms (challenger and original):
 *    30 leads and 300 visitors (clarified 2026-10-19). Below it, say what is
 *    missing.
 * 3. Then GrowthBook's chance to beat the original: ≥ 95 % better, ≤ 5 %
 *    worse, otherwise no clear difference yet.
 * 4. A better/worse reading is only announced once it has held for 72 hours
 *    of refreshes in a row (decided 2026-10-20 on the gbstats simulation,
 *    research R9: with the screen checked every hour, an instant 95 % called
 *    identical variants winners in 6.6 % of runs; held 72 h, 1.4 %). Until
 *    then it is a trend « à confirmer ».
 */
export const MIN_LEADS_PER_ARM = 30;
export const MIN_VISITORS_PER_ARM = 300;
export const WIN_THRESHOLD = 0.95;
export const SRM_THRESHOLD = 0.001;
export const HOLD_MS = 72 * 3600 * 1000;

export type Verdict =
  | "not-enough-data"
  | "no-clear-difference"
  | "leaning-better"
  | "leaning-worse"
  | "better"
  | "worse"
  | "unreliable";

export interface ArmStats {
  pageId: number;
  users: number;
  /** « Lead envoyé » — the primary metric. */
  conversions: number;
  /** « Lead confirmé » — the secondary metric (FR-017). */
  confirmed: number;
  /** GrowthBook's Bayesian figures against the original (challengers only). */
  chanceToBeatControl?: number;
  ciLow?: number;
  ciHigh?: number;
}

export interface ChallengerAnalysis {
  pageId: number;
  chanceToBeatControl: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  verdict: Verdict;
  /** The better/worse reading before the 72-hour hold, and since when it has held (to carry across refreshes). */
  reading?: "better" | "worse" | null;
  readingSince?: string | null;
  /** With "leaning-*": when the verdict will be announced if the reading holds. */
  confirmAt?: string;
  /** With "not-enough-data": visitors still needed in each arm (when it can be estimated). */
  missingVisitorsPerArm?: number;
  /** With "not-enough-data" and no conversion rate to estimate from: leads still needed per arm. */
  missingLeads?: number;
}

export interface Analysis {
  totalUsers: number;
  srmPValue: number | null;
  splitWarning: boolean;
  arms: { pageId: number; users: number; conversions: number; confirmed: number }[];
  challengers: ChallengerAnalysis[];
}

function shortfall(control: ArmStats, challenger: ArmStats): Pick<ChallengerAnalysis, "missingVisitorsPerArm" | "missingLeads"> {
  const pair = [control, challenger];
  const users = pair.reduce((n, a) => n + a.users, 0);
  const leads = pair.reduce((n, a) => n + a.conversions, 0);
  const visitorGap = Math.max(0, ...pair.map((a) => MIN_VISITORS_PER_ARM - a.users));
  if (leads === 0 || users === 0) {
    return { missingVisitorsPerArm: visitorGap || undefined, missingLeads: Math.max(...pair.map((a) => MIN_LEADS_PER_ARM - a.conversions)) };
  }
  const rate = leads / users;
  const leadGap = Math.max(0, ...pair.map((a) => Math.ceil((MIN_LEADS_PER_ARM - a.conversions) / rate)));
  return { missingVisitorsPerArm: Math.max(visitorGap, leadGap) };
}

const hasSample = (arm: ArmStats) => arm.users >= MIN_VISITORS_PER_ARM && arm.conversions >= MIN_LEADS_PER_ARM;

export function buildAnalysis(input: {
  controlPageId: number;
  arms: ArmStats[];
  srmPValue: number | null;
  totalUsers: number;
  /** The analysis stored at the previous refresh (for the 72-hour hold). */
  previous?: Analysis | null;
  now?: Date;
}): Analysis {
  const now = input.now ?? new Date();
  const control = input.arms.find((a) => a.pageId === input.controlPageId);
  const splitWarning = input.srmPValue !== null && input.srmPValue < SRM_THRESHOLD;
  const challengers = input.arms
    .filter((a) => a.pageId !== input.controlPageId)
    .map((arm): ChallengerAnalysis => {
      const base = {
        pageId: arm.pageId,
        chanceToBeatControl: arm.chanceToBeatControl ?? null,
        ciLow: arm.ciLow ?? null,
        ciHigh: arm.ciHigh ?? null,
      };
      if (splitWarning) return { ...base, verdict: "unreliable" };
      if (!control || !hasSample(control) || !hasSample(arm) || arm.chanceToBeatControl === undefined) {
        return { ...base, verdict: "not-enough-data", ...(control ? shortfall(control, arm) : {}) };
      }
      const reading = arm.chanceToBeatControl >= WIN_THRESHOLD ? "better" : arm.chanceToBeatControl <= 1 - WIN_THRESHOLD ? "worse" : null;
      if (!reading) return { ...base, verdict: "no-clear-difference", reading: null, readingSince: null };
      const before = input.previous?.challengers.find((c) => c.pageId === arm.pageId);
      const since = before?.reading === reading && before.readingSince ? before.readingSince : now.toISOString();
      const confirmAt = Date.parse(since) + HOLD_MS;
      if (now.getTime() >= confirmAt) return { ...base, verdict: reading, reading, readingSince: since };
      return {
        ...base,
        verdict: reading === "better" ? "leaning-better" : "leaning-worse",
        reading,
        readingSince: since,
        confirmAt: new Date(confirmAt).toISOString(),
      };
    });
  return {
    totalUsers: input.totalUsers,
    srmPValue: input.srmPValue,
    splitWarning,
    arms: input.arms.map(({ pageId, users, conversions, confirmed }) => ({ pageId, users, conversions, confirmed })),
    challengers,
  };
}
