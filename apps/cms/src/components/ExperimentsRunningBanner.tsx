import type { Payload } from "payload";

import { adminText } from "../i18n";

/**
 * 008-ab-testing, US4 (T043, spec.md Scenario 2) — mounted via
 * `admin.components.beforeList` on `Experiments.ts`, the native Payload
 * slot for a component rendered above the collection's own (otherwise
 * untouched) list table. Deliberately doesn't filter or replace that
 * table — concluded experiments must stay reachable there (spec.md User
 * Story 4 Scenario 3) — this only makes the "what's running right now"
 * answer explicit instead of requiring the operator to scan a `status`
 * column themselves, so an empty running set reads as "nothing running"
 * rather than as a possibly-broken or merely-empty list.
 */
type RunningExperiment = { id: number | string; name: string };

export default async function ExperimentsRunningBanner({ payload, i18n }: { payload: Payload; i18n?: { language?: string } }) {
  const t = adminText(i18n?.language);
  const running = await payload.find({
    collection: "experiments",
    where: { status: { equals: "running" } },
    sort: "-startedAt",
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });

  const runningDocs = running.docs as unknown as RunningExperiment[];

  return (
    <div style={{ margin: "16px 0", padding: "12px 16px", border: "1px solid var(--theme-elevation-150)", borderRadius: 4 }}>
      <strong>{t("ab.runningCount", { n: runningDocs.length })}</strong>
      {runningDocs.length === 0 ? (
        <p style={{ margin: "4px 0 0" }}>{t("ab.noneRunning")}</p>
      ) : (
        <ul style={{ margin: "4px 0 0" }}>
          {runningDocs.map((e) => (
            <li key={e.id}>
              <a href={`/admin/collections/experiments/${e.id}`}>{e.name}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
