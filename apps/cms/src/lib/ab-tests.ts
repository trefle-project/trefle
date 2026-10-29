import type { Payload } from "payload";
import { sql } from "@payloadcms/db-postgres/drizzle";

import { drizzleOf } from "./page-stats";
import { log } from "./log";

/**
 * 018-ab-significance — the running test a page belongs to, and the lead
 * attribution (research R3, contracts/exposure-intake.md). Every arm of a
 * whole-page test is its own page (008): the control, and the pages whose
 * `experimentOf` is the control.
 */

type PageRef = { id: number | string; experimentOf?: number | string | { id: number | string } | null };

const idOf = (ref: PageRef["experimentOf"]) => (ref && typeof ref === "object" ? ref.id : ref);

/** The `growthbookExperimentKey` of the running test `page` is an arm of, or null. */
export async function runningTestKeyOfPage(payload: Payload, page: PageRef): Promise<string | null> {
  const controlId = idOf(page.experimentOf) ?? page.id;
  const found = await payload.find({
    collection: "experiments",
    where: { and: [{ controlPage: { equals: controlId } }, { status: { equals: "running" } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const experiment = found.docs[0] as { growthbookExperimentKey?: string | null } | undefined;
  return experiment?.growthbookExperimentKey ?? null;
}

/**
 * FR-003 — attribute a new lead to the visitor and the variant they were
 * shown (the lead's own page) when that page is under test. Never throws: a
 * failure is logged and the lead stands.
 */
export async function attributeLead(
  payload: Payload,
  lead: { id: number | string; submittedAt: string },
  page: PageRef,
  visitorId: string,
): Promise<void> {
  try {
    const experimentKey = await runningTestKeyOfPage(payload, page);
    if (!experimentKey) return;
    await payload.create({
      collection: "ab-conversions",
      overrideAccess: true,
      data: {
        lead: Number(lead.id),
        visitorId,
        experimentKey,
        variant: Number(page.id),
        convertedAt: lead.submittedAt,
      },
    });
  } catch (err) {
    log.warn("ab-conversion attribution failed", { err: String(err) });
  }
}

/** Arms and domain of every running test, by experiment key (one query each). */
export async function runningTestsByKey(payload: Payload): Promise<Map<string, { arms: Set<number>; domainId: number }>> {
  const db = drizzleOf(payload);
  const { rows } = await db.execute(sql`
    SELECT e.growthbook_experiment_key AS key, e.control_page_id AS control, c.domain_id AS domain, p.id AS arm
    FROM experiments e
    JOIN pages c ON c.id = e.control_page_id
    JOIN pages p ON p.id = e.control_page_id OR p.experiment_of_id = e.control_page_id
    WHERE e.status = 'running' AND e.growthbook_experiment_key IS NOT NULL`);
  const tests = new Map<string, { arms: Set<number>; domainId: number }>();
  for (const row of rows as { key: string; domain: number; arm: number }[]) {
    const test = tests.get(row.key) ?? { arms: new Set<number>(), domainId: Number(row.domain) };
    test.arms.add(Number(row.arm));
    tests.set(row.key, test);
  }
  return tests;
}

/** FR-008 — a lead erased (DSR, retention) or whose consent is withdrawn leaves no attribution behind. */
export async function forgetLeadAttribution(payload: Payload, leadId: number | string): Promise<void> {
  await payload.delete({ collection: "ab-conversions", where: { lead: { equals: leadId } }, overrideAccess: true });
}

/** FR-017 — the secondary metric: the attributed lead's opt-in was confirmed. */
export async function markAttributedLeadConfirmed(payload: Payload, leadId: number | string, at: string): Promise<void> {
  await payload.update({
    collection: "ab-conversions",
    where: { and: [{ lead: { equals: leadId } }, { confirmedAt: { equals: null } }] },
    data: { confirmedAt: at },
    overrideAccess: true,
  });
}
