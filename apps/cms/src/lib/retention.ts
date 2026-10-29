import type { Payload } from "payload";
import { sql } from "@payloadcms/db-postgres/drizzle";

import { writeActivity } from "./activity";
import { eraseLeadPersonalData } from "./erase";
import { drizzleOf, HOURLY_KEEP_DAYS } from "./page-stats";

/**
 * Retention sweep (T074, FR-030–032, FR-031a, SC-007). Erases the personal data
 * of every lead older than the configured window (default from `settings`),
 * plus its consent record's personal fields, and records a non-personal
 * `retention-deletion` activity entry (no actor).
 *
 * Strictly predicated on `submittedAt` age + `erasedAt == null`, batched, and
 * re-queried each run — so it is safe to interrupt and resume.
 */
export interface RetentionResult {
  cutoff: string;
  erased: number;
  /** 020-edge-html-cache — edge view windows removed (older than 30 days). */
  edgeWindowsDeleted: number;
  /** 018-ab-significance — A/B rows removed (tests ended more than 30 days ago). */
  abExposuresDeleted: number;
  abConversionsDeleted: number;
  /** 022-ux-improvement — hourly page counters removed (older than 90 days). */
  hourlyStatsDeleted: number;
}

/** 018-ab-significance, FR-007 — per-visitor A/B data outlives its test by 30 days. */
const AB_KEEP_DAYS_AFTER_END = 30;

/** Edge view windows are only re-sent for 10 minutes; a month is ample. */
const EDGE_WINDOW_KEEP_DAYS = 30;

export async function runRetentionSweep(
  payload: Payload,
  opts: { olderThan?: Date; batchSize?: number } = {},
): Promise<RetentionResult> {
  const batchSize = opts.batchSize ?? 200;

  let cutoff = opts.olderThan;
  if (!cutoff) {
    const settings = (await payload.findGlobal({ slug: "settings", overrideAccess: true })) as {
      retentionMonths?: number;
    };
    const months = Math.max(1, settings.retentionMonths ?? 24);
    cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
  }
  const cutoffIso = cutoff.toISOString();

  let erased = 0;
  // Each iteration re-queries from the top; erased rows drop out of the filter,
  // so a fixed `page: 1` walks the whole expired set even across restarts.
  for (;;) {
    const batch = await payload.find({
      collection: "leads",
      where: { and: [{ submittedAt: { less_than: cutoffIso } }, { erasedAt: { equals: null } }] },
      sort: "submittedAt",
      limit: batchSize,
      depth: 0,
      overrideAccess: true,
    });
    if (batch.docs.length === 0) break;
    for (const lead of batch.docs as { id: string | number }[]) {
      if (await eraseLeadPersonalData(payload, lead.id)) erased += 1;
    }
    if (!batch.hasNextPage && batch.docs.length < batchSize) break;
  }

  if (erased > 0) {
    await writeActivity(payload, {
      type: "retention-deletion",
      actor: null,
      targetType: "lead-batch",
      targetId: `${erased} leads`,
      meta: { erased, cutoff: cutoffIso },
    });
  }

  // 020-edge-html-cache — the ledger of edge view windows already counted
  // (data-model.md): nothing personal, only kept to make re-sends idempotent.
  const windowCutoff = new Date(Date.now() - EDGE_WINDOW_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const removed = await payload.delete({
    collection: "edge-view-windows",
    where: { windowStart: { less_than: windowCutoff } },
    depth: 0,
    overrideAccess: true,
  });

  // 018-ab-significance, FR-007 — exposures and attributions of tests that
  // ended more than 30 days ago (by key: one statement each, however many
  // rows). The analysis stored on the experiment stays.
  const abCutoff = new Date(Date.now() - AB_KEEP_DAYS_AFTER_END * 24 * 60 * 60 * 1000).toISOString();
  const endedKeys = sql`SELECT growthbook_experiment_key FROM experiments WHERE ended_at < ${abCutoff} AND growthbook_experiment_key IS NOT NULL`;
  const db = drizzleOf(payload);
  const exposures = await db.execute(sql`DELETE FROM ab_exposures WHERE experiment_key IN (${endedKeys}) RETURNING id`);
  const conversions = await db.execute(sql`DELETE FROM ab_conversions WHERE experiment_key IN (${endedKeys}) RETURNING id`);

  // 022-ux-improvement (US1) — hourly counters serve short charts only; the
  // daily rows (page_stats) are kept as before.
  const hourlyCutoff = new Date(Date.now() - HOURLY_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const hourly = await db.execute(sql`DELETE FROM page_stats_hourly WHERE hour < ${hourlyCutoff} RETURNING id`);

  return {
    cutoff: cutoffIso,
    erased,
    edgeWindowsDeleted: removed.docs.length,
    abExposuresDeleted: exposures.rows.length,
    abConversionsDeleted: conversions.rows.length,
    hourlyStatsDeleted: hourly.rows.length,
  };
}
