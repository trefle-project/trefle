import type { Payload } from "payload";

import { type Analysis as TrefleAnalysis, type ArmStats, buildAnalysis } from "./ab-verdict";
import { log } from "./log";

/**
 * 018-ab-significance (research R4–R7, contracts/analysis.md) — GrowthBook's
 * REST API (5.0.1), reached on the internal network. GrowthBook reads the A/B
 * tables itself (data source `trefle` in infra/growthbook/config.yml); the
 * CMS declares each test, asks for a fresh analysis and stores the verdict on
 * the experiment, so no screen ever waits on GrowthBook.
 *
 * Off (every call returns early) while GROWTHBOOK_API_KEY is empty.
 */
const DATASOURCE = "trefle";
const ASSIGNMENT_QUERY = "trefle_exposures";
const ID_TYPE = "visitor_id";
const POLL_EVERY_MS = 3_000;
const POLL_FOR_MS = 120_000;

/** GrowthBook objects found again by these names (created once). */
export const GB_NAMES = {
  leadsTable: "Trefle — leads attribués",
  confirmedTable: "Trefle — leads confirmés",
  leadMetric: "Lead envoyé",
  confirmedMetric: "Lead confirmé",
} as const;

export const analysisEnabled = () => Boolean(process.env.GROWTHBOOK_API_KEY);

/** A refusal or failure of GrowthBook's API; `message` is safe to log. */
export class GrowthBookError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function gb<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const base = (process.env.GROWTHBOOK_API_URL || "http://growthbook:3100/api").replace(/\/+$/, "");
  const res = await fetch(`${base}/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${process.env.GROWTHBOOK_API_KEY}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new GrowthBookError(res.status, `GrowthBook ${method} ${path.split("?")[0]} → ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

type Named = { id: string; name: string };

/** The two fact tables and their metrics; created on first use, then cached for the process. */
let metricIds: Promise<{ lead: string; confirmed: string }> | null = null;

async function ensureFactTable(name: string, sql: string): Promise<string> {
  const { factTables } = await gb<{ factTables: Named[] }>("GET", `/fact-tables?datasourceId=${DATASOURCE}&limit=100`);
  const found = factTables.find((t) => t.name === name);
  if (found) return found.id;
  const { factTable } = await gb<{ factTable: Named }>("POST", "/fact-tables", {
    name,
    datasource: DATASOURCE,
    userIdTypes: [ID_TYPE],
    sql,
    description: "018-ab-significance — managed by Trefle's CMS, do not edit.",
    managedBy: "api",
  });
  return factTable.id;
}

async function ensureProportionMetric(name: string, factTableId: string): Promise<string> {
  const { factMetrics } = await gb<{ factMetrics: Named[] }>("GET", `/fact-metrics?factTableId=${factTableId}&limit=100`);
  const found = factMetrics.find((m) => m.name === name);
  if (found) return found.id;
  const { factMetric } = await gb<{ factMetric: Named }>("POST", "/fact-metrics", {
    name,
    metricType: "proportion",
    numerator: { factTableId },
    description: "018-ab-significance — managed by Trefle's CMS, do not edit.",
    managedBy: "api",
  });
  return factMetric.id;
}

export function ensureMetrics(): Promise<{ lead: string; confirmed: string }> {
  metricIds ??= (async () => {
    const leads = await ensureFactTable(
      GB_NAMES.leadsTable,
      "SELECT visitor_id, converted_at AS timestamp FROM ab_conversions",
    );
    const confirmed = await ensureFactTable(
      GB_NAMES.confirmedTable,
      "SELECT visitor_id, confirmed_at AS timestamp FROM ab_conversions WHERE confirmed_at IS NOT NULL",
    );
    return {
      lead: await ensureProportionMetric(GB_NAMES.leadMetric, leads),
      confirmed: await ensureProportionMetric(GB_NAMES.confirmedMetric, confirmed),
    };
  })().catch((err) => {
    metricIds = null;
    throw err;
  });
  return metricIds;
}

/**
 * GrowthBook re-derives a fact table's id types from the columns it detects,
 * and detects none while the table is empty (no lead attributed yet): the
 * metrics are then unjoinable and every snapshot fails with « Experiment must
 * have at least 1 metric selected » (seen in production, 2026-10-22). Set
 * them back before each analysis; an update that leaves the SQL alone does
 * not re-run the detection.
 */
async function keepIdTypes(): Promise<void> {
  const ours = new Set<string>([GB_NAMES.leadsTable, GB_NAMES.confirmedTable]);
  const { factTables } = await gb<{ factTables: (Named & { userIdTypes?: string[] })[] }>("GET", `/fact-tables?datasourceId=${DATASOURCE}&limit=100`);
  for (const table of factTables) {
    if (ours.has(table.name) && !table.userIdTypes?.includes(ID_TYPE)) {
      await gb("POST", `/fact-tables/${table.id}`, { userIdTypes: [ID_TYPE] });
    }
  }
}

/** Test seam: forget the cached metric ids. */
export const __resetGrowthBookCache = () => {
  metricIds = null;
};

type ExperimentDoc = {
  id: number | string;
  name: string;
  status: string;
  controlPage: number | string | { id: number | string };
  growthbookExperimentKey?: string | null;
  growthbookId?: string | null;
  startedAt?: string | null;
  analysisStartedAt?: string | null;
  /** The analysis stored at the previous refresh. */
  analysis?: unknown;
  analysisRefreshedAt?: string | null;
};

const idOf = (v: ExperimentDoc["controlPage"]) => Number(typeof v === "object" ? v.id : v);

/** The test's pages, control first (every arm is a page, 008). */
async function armsOf(payload: Payload, controlId: number): Promise<{ id: number; title: string }[]> {
  const control = await payload.findByID({ collection: "pages", id: controlId, depth: 0, overrideAccess: true });
  const variants = await payload.find({
    collection: "pages",
    where: { experimentOf: { equals: controlId } },
    sort: "id",
    limit: 50,
    depth: 0,
    overrideAccess: true,
  });
  return [control, ...variants.docs].map((p) => ({ id: Number(p.id), title: String((p as { title?: string }).title ?? p.id) }));
}

/**
 * FR-011 — declare a test to GrowthBook, running since the test started (all
 * its recorded exposures count, whenever it is declared). `analysisStartedAt`
 * records when Trefle began measuring it: its start, or the declaration for a
 * test started before 018 (no exposure exists before) — the screen then says
 * « Analyse disponible pour les visites à partir du … ». Reuses an experiment
 * already declared under the same tracking key.
 */
export async function declareExperiment(payload: Payload, experiment: ExperimentDoc): Promise<{ growthbookId: string; analysisStartedAt: string }> {
  const metrics = await ensureMetrics();
  const key = experiment.growthbookExperimentKey!;
  const existing = await gb<{ experiments: { id: string; phases?: { dateStarted?: string }[] }[] }>(
    "GET",
    `/experiments?trackingKey=${encodeURIComponent(key)}&limit=1`,
  );
  const analysisStartedAt = experiment.analysisStartedAt ?? new Date().toISOString();
  let growthbookId = existing.experiments[0]?.id;
  if (!growthbookId) {
    const arms = await armsOf(payload, idOf(experiment.controlPage));
    const created = await gb<{ experiment: { id: string } }>("POST", "/experiments", {
      trackingKey: key,
      name: experiment.name,
      datasourceId: DATASOURCE,
      assignmentQueryId: ASSIGNMENT_QUERY,
      variations: arms.map((arm) => ({ key: String(arm.id), name: arm.title })),
      metrics: [metrics.lead],
      secondaryMetrics: [metrics.confirmed],
      statsEngine: "bayesian",
      status: "running",
      phases: [{ name: "Main", dateStarted: experiment.startedAt ?? analysisStartedAt }],
    });
    growthbookId = created.experiment.id;
  }
  await payload.update({
    collection: "experiments",
    id: experiment.id,
    data: { growthbookId, analysisStartedAt },
    overrideAccess: true,
  });
  return { growthbookId, analysisStartedAt };
}

type Analysis = {
  engine: string;
  numerator: number;
  chanceToBeatControl?: number;
  ciLow: number;
  ciHigh: number;
};
type Results = {
  experiment: { variations: { variationId: string; key: string }[] };
  result: {
    results: {
      totalUsers: number;
      checks: { srm: number };
      metrics: { metricId: string; variations: { variationId: string; users?: number; analyses: Analysis[] }[] }[];
    }[];
  };
};

/** GrowthBook's results → Trefle's analysis (aggregates only). */
export function analysisFromResults(
  results: Results,
  controlPageId: number,
  metrics: { lead: string; confirmed: string },
  previous: TrefleAnalysis | null = null,
) {
  const pageOf = new Map<string, number>();
  for (const v of results.experiment.variations) pageOf.set(v.variationId, Number(v.key));
  const overall = results.result.results[0];
  const metric = (id: string) => overall?.metrics.find((m) => m.metricId === id);
  const lead = metric(metrics.lead);
  const confirmed = metric(metrics.confirmed);
  const arms: ArmStats[] = results.experiment.variations.map((v) => {
    const pageId = Number(v.key);
    const row = lead?.variations.find((x) => pageOf.get(x.variationId) === pageId);
    const bayes = row?.analyses.find((a) => a.engine === "bayesian") ?? row?.analyses[0];
    const conf = confirmed?.variations.find((x) => pageOf.get(x.variationId) === pageId)?.analyses[0];
    return {
      pageId,
      users: row?.users ?? 0,
      conversions: bayes?.numerator ?? 0,
      confirmed: conf?.numerator ?? 0,
      ...(pageId !== controlPageId && bayes?.chanceToBeatControl !== undefined
        ? { chanceToBeatControl: bayes.chanceToBeatControl, ciLow: bayes.ciLow, ciHigh: bayes.ciHigh }
        : {}),
    };
  });
  return buildAnalysis({ controlPageId, arms, srmPValue: overall?.checks.srm ?? null, totalUsers: overall?.totalUsers ?? 0, previous });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * contracts/analysis.md steps 1–5 — the one refresh path (hourly task,
 * « Rafraîchir », conclusion). A failure keeps the previous analysis and
 * stores a short French message for the screen; it never throws.
 */
export async function refreshAnalysis(payload: Payload, experiment: ExperimentDoc, opts: { pollEveryMs?: number; pollForMs?: number } = {}): Promise<{ ok: boolean; error?: string; waiting?: boolean; waitMinutes?: number }> {
  if (!analysisEnabled() || !experiment.growthbookExperimentKey) return { ok: false };
  try {
    const metrics = await ensureMetrics();
    await keepIdTypes();
    const growthbookId = experiment.growthbookId ?? (await declareExperiment(payload, experiment)).growthbookId;

    const { snapshot } = await gb<{ snapshot: { id: string; status: string } }>("POST", `/experiments/${growthbookId}/snapshot`, {});
    const deadline = Date.now() + (opts.pollForMs ?? POLL_FOR_MS);
    let status = snapshot.status;
    while (status === "running" && Date.now() < deadline) {
      await sleep(opts.pollEveryMs ?? POLL_EVERY_MS);
      status = (await gb<{ snapshot: { status: string } }>("GET", `/snapshots/${snapshot.id}`)).snapshot.status;
    }
    if (status !== "success") throw new GrowthBookError(0, `GrowthBook snapshot ${snapshot.id} ended as "${status}"`);

    const results = await gb<Results>("GET", `/experiments/${growthbookId}/results`);
    const analysis = analysisFromResults(results, idOf(experiment.controlPage), metrics, (experiment.analysis ?? null) as TrefleAnalysis | null);
    await payload.update({
      collection: "experiments",
      id: experiment.id,
      data: { analysis: analysis as unknown as Record<string, unknown>, analysisRefreshedAt: new Date().toISOString(), analysisError: null },
      overrideAccess: true,
    });
    return { ok: true };
  } catch (err) {
    log.warn("ab analysis refresh failed", { experiment: experiment.id, err: err instanceof Error ? err.message : String(err) });
    // Before a first analysis has gone through, a failure most often means
    // too little data yet: the screen says when the next automatic run is.
    const waiting = !experiment.analysisRefreshedAt;
    const stored = waiting ? "En attente des premières données (analyse automatique toutes les heures)" : "Analyse statistique momentanément indisponible";
    await payload
      .update({ collection: "experiments", id: experiment.id, data: { analysisError: stored }, overrideAccess: true })
      .catch(() => {});
    if (!waiting) return { ok: false, error: stored };
    const waitMinutes = 60 - new Date().getMinutes();
    return { ok: false, waiting: true, waitMinutes, error: `Premières données dans ${waitMinutes} min (analyse automatique toutes les heures).` };
  }
}

/** FR-011 — close the test in GrowthBook once concluded (best effort). */
export async function stopExperiment(experiment: ExperimentDoc, winnerPageId?: number | string | null): Promise<void> {
  if (!analysisEnabled() || !experiment.growthbookId) return;
  try {
    const { experiment: gbExperiment } = await gb<{ experiment: { variations: { variationId: string; key: string }[] } }>(
      "GET",
      `/experiments/${experiment.growthbookId}`,
    );
    const winner = gbExperiment.variations.find((v) => winnerPageId != null && v.key === String(winnerPageId));
    await gb("POST", `/experiments/${experiment.growthbookId}/stop`, {
      ...(winner ? { results: "won", winnerVariationId: winner.variationId } : { results: "inconclusive" }),
      reason: winner ? `Variante ${winnerPageId} promue dans Trefle` : "Test conclu sans promotion dans Trefle",
    });
  } catch (err) {
    log.warn("ab analysis stop failed", { experiment: experiment.id, err: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Conclusion (promote or conclude without promoting): one last analysis, then
 * the test is stopped in GrowthBook. Runs after the response (it may take a
 * couple of minutes); never throws. The hourly task skips concluded tests, so
 * the analysis stays as it was at the conclusion.
 */
export async function concludeInGrowthBook(payload: Payload, experiment: ExperimentDoc, winnerPageId?: number | string | null): Promise<void> {
  if (!analysisEnabled() || !experiment.growthbookId) return;
  await refreshAnalysis(payload, experiment);
  await stopExperiment(experiment, winnerPageId);
}

/** FR-011 — declare a test as it starts (best effort: the hourly task retries). */
export async function declareOnStart(payload: Payload, experiment: ExperimentDoc): Promise<void> {
  if (!analysisEnabled()) return;
  try {
    await declareExperiment(payload, { ...experiment, analysisStartedAt: experiment.startedAt ?? null });
  } catch (err) {
    log.warn("ab analysis declare failed", { experiment: experiment.id, err: err instanceof Error ? err.message : String(err) });
  }
}

/** The hourly task: every running test, one after the other. */
export async function refreshRunningAnalyses(payload: Payload): Promise<{ refreshed: number; failed: number }> {
  if (!analysisEnabled()) return { refreshed: 0, failed: 0 };
  const running = await payload.find({ collection: "experiments", where: { status: { equals: "running" } }, limit: 100, depth: 0, overrideAccess: true });
  let refreshed = 0;
  let failed = 0;
  for (const doc of running.docs as unknown as ExperimentDoc[]) {
    if ((await refreshAnalysis(payload, doc)).ok) refreshed += 1;
    else failed += 1;
  }
  return { refreshed, failed };
}
