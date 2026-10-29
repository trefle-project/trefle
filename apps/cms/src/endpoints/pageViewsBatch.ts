import type { Endpoint } from "payload";
import { sql } from "@payloadcms/db-postgres/drizzle";

import { drizzleOf, incrementPageStat } from "../lib/page-stats";
import { readJson } from "../lib/req";
import { isServiceOrAdmin } from "../access";

/**
 * POST /api/page-views/batch — 020-edge-html-cache, contracts/edge-ingest.md.
 * Page views counted at the edge, per minute window, forwarded by the
 * renderer (`/api/edge/views`). Service caller only.
 *
 * A window arrives up to 10 times (the edge re-sends the last 10 every
 * minute) and its counts may grow between sends. Per window, in one
 * transaction: lock or create its ledger row, add only `n − applied[page]`
 * when positive to the page's day and hour (those of the window), remember `n`.
 * Re-sending adds nothing; a lower count (sampling rounding) changes nothing;
 * two concurrent posts of the same window wait on the row lock and add once.
 */
type Window = { start: string; counts: Record<string, number> };

const MINUTE_MS = 60_000;

function validWindows(body: unknown): Window[] | null {
  const windows = (body as { windows?: unknown } | null)?.windows;
  if (!Array.isArray(windows) || windows.length > 20) return null;
  const out: Window[] = [];
  for (const w of windows as { start?: unknown; counts?: unknown }[]) {
    const time = typeof w?.start === "string" ? Date.parse(w.start) : NaN;
    if (!Number.isFinite(time) || time % MINUTE_MS !== 0) return null;
    if (!w.counts || typeof w.counts !== "object" || Array.isArray(w.counts)) return null;
    const counts: Record<string, number> = {};
    for (const [page, n] of Object.entries(w.counts as Record<string, unknown>)) {
      if (!/^\d+$/.test(page) || typeof n !== "number" || !Number.isInteger(n) || n < 0) return null;
      counts[page] = n;
    }
    out.push({ start: new Date(time).toISOString(), counts });
  }
  return out;
}

export const pageViewsBatchEndpoint: Endpoint = {
  path: "/page-views/batch",
  method: "post",
  handler: async (req) => {
    if (!isServiceOrAdmin({ req } as never)) return new Response(null, { status: 403 });
    const windows = validWindows(await readJson(req));
    if (!windows) return Response.json({ error: "bad body" }, { status: 400 });

    const db = drizzleOf(req.payload);
    let added = 0;
    for (const { start, counts } of windows) {
      added += await db.transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO edge_view_windows (window_start, applied, updated_at, created_at)
          VALUES (${start}, '{}'::jsonb, now(), now())
          ON CONFLICT (window_start) DO NOTHING`);
        const { rows } = await tx.execute(sql`SELECT id, applied FROM edge_view_windows WHERE window_start = ${start} FOR UPDATE`);
        const row = rows[0] as { id: number; applied: Record<string, number> | null };
        const applied = { ...(row.applied ?? {}) };

        const ids = Object.keys(counts).map(Number);
        const known = ids.length
          ? new Set(((await tx.execute(sql`SELECT id FROM pages WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`)).rows as { id: number }[]).map((r) => String(r.id)))
          : new Set<string>();

        let windowAdded = 0;
        for (const [page, n] of Object.entries(counts)) {
          if (!known.has(page)) continue;
          const delta = n - (applied[page] ?? 0);
          if (delta <= 0) continue;
          await incrementPageStat(req.payload, page, "views", delta, { at: new Date(start), db: tx });
          applied[page] = n;
          windowAdded += delta;
        }
        if (windowAdded > 0) {
          await tx.execute(sql`UPDATE edge_view_windows SET applied = ${JSON.stringify(applied)}::jsonb, updated_at = now() WHERE id = ${row.id}`);
        }
        return windowAdded;
      });
    }
    return Response.json({ added, windows: windows.length });
  },
};
