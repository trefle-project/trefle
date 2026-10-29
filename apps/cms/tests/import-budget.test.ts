import { afterEach, describe, expect, it, vi } from "vitest";

import { budgetStatus, formatParisMidnight, monthBounds, userBudgetEur, resetDay } from "../src/lib/import/budget";

/**
 * 012-url-page-import (T027, research R10, FR-027) — monthly totals in
 * Europe/Paris, workspace cap and per-user budgets, user checked first.
 */
type Imp = { startedAt: string; costEur: number; createdBy: number };

/** A fake Payload that evaluates the budget module's where clause on an in-memory list. */
function fakePayload(imports: Imp[], settings: Record<string, unknown> = {}) {
  const matches = (doc: Imp, where: { and: Record<string, Record<string, unknown>>[] }) =>
    where.and.every((clause) => {
      const [field, cond] = Object.entries(clause)[0]!;
      const v = doc[field as keyof Imp];
      if ("greater_than_equal" in cond) return String(v) >= String(cond.greater_than_equal);
      if ("less_than" in cond) return String(v) < String(cond.less_than);
      if ("equals" in cond) return v === cond.equals;
      return true;
    });
  return {
    find: vi.fn(async ({ where }: { where: { and: Record<string, Record<string, unknown>>[] } }) => ({
      docs: imports.filter((d) => matches(d, where)),
    })),
    findGlobal: vi.fn(async () => ({ importMonthlyCapEur: 20, importDefaultUserBudgetEur: 10, ...settings })),
  } as never;
}

afterEach(() => vi.unstubAllEnvs());

describe("monthBounds (Europe/Paris)", () => {
  it("puts 31 Oct 23:30 Paris in October and 1 Nov 00:30 Paris in November", () => {
    // 2026-10-31 23:30 Paris = 22:30 UTC (CET, after the 25 Oct DST change).
    const oct = monthBounds(new Date("2026-10-31T22:30:00Z"));
    expect(oct.start.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(oct.end.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    // 2026-11-01 00:30 Paris = 2026-10-31 23:30 UTC.
    const nov = monthBounds(new Date("2026-10-31T23:30:00Z"));
    expect(nov.start.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("handles the 31 Aug → 1 Sep boundary in summer time and the year change", () => {
    expect(monthBounds(new Date("2026-08-31T21:30:00Z")).end.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(monthBounds(new Date("2026-08-31T22:30:00Z")).start.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(monthBounds(new Date("2026-12-31T23:30:00Z")).start.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });

  it("writes the reset instant in Paris time with its offset", () => {
    expect(formatParisMidnight(monthBounds(new Date("2026-09-27T12:00:00Z")).end)).toBe("2026-10-01T00:00:00+02:00");
    expect(formatParisMidnight(monthBounds(new Date("2026-11-15T12:00:00Z")).end)).toBe("2026-12-01T00:00:00+01:00");
  });
});

describe("userBudgetEur", () => {
  it("uses the user's own budget, including 0, else the Settings default", () => {
    expect(userBudgetEur({ id: 1, importMonthlyBudgetEur: 3 }, { importDefaultUserBudgetEur: 10 })).toEqual({ budgetEur: 3, isDefault: false });
    expect(userBudgetEur({ id: 1, importMonthlyBudgetEur: 0 }, { importDefaultUserBudgetEur: 10 })).toEqual({ budgetEur: 0, isDefault: false });
    expect(userBudgetEur({ id: 1, importMonthlyBudgetEur: null }, { importDefaultUserBudgetEur: 7 })).toEqual({ budgetEur: 7, isDefault: true });
  });
});

describe("budgetStatus", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  const sept = (costEur: number, createdBy: number) => ({ startedAt: "2026-09-10T10:00:00.000Z", costEur, createdBy });
  const lastMonth = { startedAt: "2026-08-31T21:30:00.000Z", costEur: 50, createdBy: 1 }; // 23:30 Paris, 31 Aug

  it("sums the current Paris month only, per workspace and per user", async () => {
    vi.stubEnv("IMPORT_AI_MODE", "fixture");
    const s = await budgetStatus(fakePayload([sept(2.5, 1), sept(4, 2), lastMonth]), { id: 1 }, now);
    expect(s.workspace).toEqual({ capEur: 20, spentEur: 6.5, remainingEur: 13.5 });
    expect(s.user).toEqual({ budgetEur: 10, spentEur: 2.5, remainingEur: 7.5, isDefault: true });
    expect(s).toMatchObject({ enabled: true, available: true, blockedBy: null, resetsAt: "2026-10-01T00:00:00+02:00" });
  });

  it("blocks when the workspace total reaches the cap", async () => {
    vi.stubEnv("IMPORT_AI_MODE", "fixture");
    const s = await budgetStatus(fakePayload([sept(20, 2)]), { id: 1 }, now);
    expect(s).toMatchObject({ available: false, blockedBy: "workspace" });
  });

  it("disables the feature when the cap is 0 or no conversion is configured", async () => {
    vi.stubEnv("IMPORT_AI_MODE", "fixture");
    expect(await budgetStatus(fakePayload([], { importMonthlyCapEur: 0 }), { id: 1 }, now)).toMatchObject({ enabled: false, available: false, blockedBy: "workspace" });
    vi.stubEnv("IMPORT_AI_MODE", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await budgetStatus(fakePayload([]), { id: 1 }, now)).enabled).toBe(false);
  });

  it("blocks a user at their own budget (0 included) while another user can still import", async () => {
    vi.stubEnv("IMPORT_AI_MODE", "fixture");
    const payload = fakePayload([sept(3, 1)]);
    expect(await budgetStatus(payload, { id: 1, importMonthlyBudgetEur: 3 }, now)).toMatchObject({ available: false, blockedBy: "user" });
    expect(await budgetStatus(payload, { id: 2 }, now)).toMatchObject({ available: true, blockedBy: null });
    expect(await budgetStatus(fakePayload([]), { id: 3, importMonthlyBudgetEur: 0 }, now)).toMatchObject({ blockedBy: "user" });
  });

  it("reports the user first when both limits are reached", async () => {
    vi.stubEnv("IMPORT_AI_MODE", "fixture");
    const s = await budgetStatus(fakePayload([sept(20, 1)]), { id: 1 }, now);
    expect(s.blockedBy).toBe("user");
  });

  it("lowering a budget below current spending blocks new imports without touching past costs", async () => {
    vi.stubEnv("IMPORT_AI_MODE", "fixture");
    const imports = [sept(6, 1)];
    const s = await budgetStatus(fakePayload(imports), { id: 1, importMonthlyBudgetEur: 5 }, now);
    expect(s).toMatchObject({ blockedBy: "user", user: { spentEur: 6, remainingEur: 0 } });
    expect(imports[0]!.costEur).toBe(6);
  });
});

describe("resetDay (023)", () => {
  it("names the next 1st of the month in the member's language, Paris time", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    expect(resetDay("fr", now)).toBe("1er novembre");
    expect(resetDay("en", now)).toBe("1 November");
  });
});
