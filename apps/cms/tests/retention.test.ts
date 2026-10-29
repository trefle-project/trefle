import { describe, expect, it, vi } from "vitest";

import { runRetentionSweep } from "../src/lib/retention";

/** A payload mock whose `leads` find returns `pages` batches in order. */
function makePayload(opts: {
  months?: number;
  leadBatches: { id: number; erasedAt?: string | null; consentRecord?: number }[][];
}) {
  let call = 0;
  const update = vi.fn().mockResolvedValue({});
  const create = vi.fn().mockResolvedValue({});
  const findGlobal = vi.fn().mockResolvedValue({ retentionMonths: opts.months ?? 24 });
  const find = vi.fn().mockImplementation(async ({ collection }: { collection: string }) => {
    if (collection === "consent-records") return { docs: [{ id: 500 }], totalDocs: 1 };
    const docs = opts.leadBatches[call] ?? [];
    call += 1;
    return { docs, hasNextPage: false, totalDocs: opts.leadBatches.flat().length };
  });
  const findByID = vi
    .fn()
    .mockImplementation(async ({ id }: { id: number }) => ({ id, erasedAt: null, consentRecord: 500 }));
  const del = vi.fn().mockResolvedValue({ docs: [{ id: 1 }, { id: 2 }], errors: [] });
  // 018 — the A/B purge runs as SQL (tests/db/ab-retention.test.ts covers it).
  const db = { drizzle: { execute: vi.fn().mockResolvedValue({ rows: [] }) } };
  return { find, findByID, findGlobal, update, create, delete: del, db, logger: { warn: vi.fn() } };
}

describe("runRetentionSweep (T074)", () => {
  it("020 — also removes edge view windows older than 30 days", async () => {
    const payload = makePayload({ leadBatches: [[]] });
    const before = Date.now();
    const result = await runRetentionSweep(payload as never);
    const call = payload.delete.mock.calls[0]![0] as { collection: string; where: { windowStart: { less_than: string } } };
    expect(call.collection).toBe("edge-view-windows");
    const cutoff = Date.parse(call.where.windowStart.less_than);
    expect(before - cutoff).toBeGreaterThanOrEqual(30 * 24 * 3600 * 1000 - 1000);
    expect(before - cutoff).toBeLessThan(30 * 24 * 3600 * 1000 + 1000);
    expect(result.edgeWindowsDeleted).toBe(2);
  });

  // 022-ux-improvement (US1) — hourly counters older than 90 days, by SQL.
  it("removes hourly page counters older than 90 days, never the daily ones", async () => {
    const payload = makePayload({ leadBatches: [[]] });
    const result = await runRetentionSweep(payload as never);
    const statements = payload.db.drizzle.execute.mock.calls.map((c) => JSON.stringify(c[0]));
    const hourly = statements.find((q) => q.includes("page_stats_hourly"));
    expect(hourly).toContain("DELETE FROM page_stats_hourly WHERE hour <");
    const cutoff = Date.parse(JSON.parse(hourly!).queryChunks.find((c: unknown) => typeof c === "string" && /^\d{4}-/.test(c)));
    expect(Date.now() - cutoff).toBeGreaterThan(90 * 24 * 3600 * 1000 - 5000);
    expect(statements.some((q) => /DELETE FROM page_stats[^_]/.test(q))).toBe(false);
    expect(result.hourlyStatsDeleted).toBe(0);
  });

  it("uses the configured retentionMonths to build the cutoff and erases expired leads", async () => {
    const p = makePayload({ months: 12, leadBatches: [[{ id: 1 }, { id: 2 }]] });
    const res = await runRetentionSweep(p as never);
    expect(p.findGlobal).toHaveBeenCalled();
    const where = JSON.stringify((p.find.mock.calls.find((c) => c[0].collection === "leads") as never[])[0]);
    expect(where).toContain('"erasedAt":{"equals":null}');
    expect(where).toContain('"submittedAt":{"less_than":');
    expect(res.erased).toBe(2);
    // lead + consent-record scrub per lead (FR-031/031a)
    expect(p.update).toHaveBeenCalledWith(expect.objectContaining({ collection: "leads", data: expect.objectContaining({ erasedAt: expect.any(String) }) }));
    expect(p.update).toHaveBeenCalledWith(expect.objectContaining({ collection: "consent-records", data: { email: null, ipAddress: null, userAgent: null } }));
    // non-personal retention-deletion activity entry, no actor
    expect(p.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "activity-log",
        data: expect.objectContaining({ type: "retention-deletion", actor: null, meta: expect.objectContaining({ erased: 2 }) }),
      }),
    );
  });

  it("honours an explicit `olderThan` cutoff (dev/ops override) and skips findGlobal", async () => {
    const p = makePayload({ leadBatches: [[]] });
    const cutoff = new Date("2020-01-01T00:00:00Z");
    const res = await runRetentionSweep(p as never, { olderThan: cutoff });
    expect(p.findGlobal).not.toHaveBeenCalled();
    expect(res.cutoff).toBe(cutoff.toISOString());
  });

  it("does nothing (and writes no activity) when there is nothing expired — resumable/no-op", async () => {
    const p = makePayload({ leadBatches: [[]] });
    const res = await runRetentionSweep(p as never);
    expect(res.erased).toBe(0);
    expect(p.create).not.toHaveBeenCalled();
    expect(p.update).not.toHaveBeenCalled();
  });

  it("skips a lead that is already erased (eraseLeadPersonalData returns false)", async () => {
    const p = makePayload({ leadBatches: [[{ id: 9 }]] });
    p.findByID = vi.fn().mockResolvedValue({ id: 9, erasedAt: "2026-01-01T00:00:00Z" });
    const res = await runRetentionSweep(p as never);
    expect(res.erased).toBe(0);
  });
});
