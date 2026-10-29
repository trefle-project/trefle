import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetGrowthBookCache, refreshAnalysis, stopExperiment } from "../src/lib/growthbook";

/**
 * 018-ab-significance (contracts/analysis.md, T025) — GrowthBook calls with a
 * mocked fetch: objects created once then found by name, test declared with
 * its pages (control first), analysis stored, failures kept off the screen's
 * counts, nothing at all without an API key.
 */
type Call = { method: string; path: string; body?: Record<string, unknown> };
let calls: Call[];
let factTables: { id: string; name: string; userIdTypes?: string[] }[];
let factMetrics: { id: string; name: string }[];
let gbExperiments: { id: string }[];
let snapshotStatus: string[];
let fail: string | null;

const RESULTS = {
  experiment: {
    variations: [
      { variationId: "v0", key: "12" },
      { variationId: "v1", key: "57" },
    ],
  },
  result: {
    results: [
      {
        totalUsers: 2000,
        checks: { srm: 0.6 },
        metrics: [
          {
            metricId: "fm_lead",
            variations: [
              { variationId: "v0", users: 1000, analyses: [{ engine: "bayesian", numerator: 40, ciLow: 0, ciHigh: 0 }] },
              { variationId: "v1", users: 1000, analyses: [{ engine: "bayesian", numerator: 60, chanceToBeatControl: 0.97, ciLow: 0.04, ciHigh: 0.9 }] },
            ],
          },
          {
            metricId: "fm_confirmed",
            variations: [
              { variationId: "v0", users: 1000, analyses: [{ engine: "bayesian", numerator: 20, ciLow: 0, ciHigh: 0 }] },
              { variationId: "v1", users: 1000, analyses: [{ engine: "bayesian", numerator: 33, ciLow: 0, ciHigh: 0 }] },
            ],
          },
        ],
      },
    ],
  },
};

function respond(call: Call): unknown {
  const { method, path } = call;
  if (fail && path.startsWith(fail)) return new Response("boom", { status: 500 });
  if (method === "GET" && path.startsWith("/fact-tables")) return { factTables };
  if (method === "POST" && path.startsWith("/fact-tables/")) {
    const t = factTables.find((x) => path === `/fact-tables/${x.id}`)!;
    t.userIdTypes = call.body!.userIdTypes as string[];
    return { factTable: t };
  }
  if (method === "POST" && path === "/fact-tables") {
    const t = { id: `ft_${factTables.length}`, name: String(call.body!.name), userIdTypes: call.body!.userIdTypes as string[] };
    factTables.push(t);
    return { factTable: t };
  }
  if (method === "GET" && path.startsWith("/fact-metrics")) return { factMetrics };
  if (method === "POST" && path === "/fact-metrics") {
    const m = { id: call.body!.name === "Lead envoyé" ? "fm_lead" : "fm_confirmed", name: String(call.body!.name) };
    factMetrics.push(m);
    return { factMetric: m };
  }
  if (method === "GET" && path.startsWith("/experiments?trackingKey")) return { experiments: gbExperiments };
  if (method === "POST" && path === "/experiments") return { experiment: { id: "exp_1" } };
  if (method === "POST" && path.endsWith("/snapshot")) return { snapshot: { id: "snap_1", status: snapshotStatus.shift() ?? "success" } };
  if (method === "GET" && path.startsWith("/snapshots/")) return { snapshot: { id: "snap_1", status: snapshotStatus.shift() ?? "success" } };
  if (method === "GET" && path.endsWith("/results")) return RESULTS;
  if (method === "GET" && path === "/experiments/exp_1") return { experiment: RESULTS.experiment };
  if (method === "POST" && path.endsWith("/stop")) return {};
  throw new Error(`unexpected ${method} ${path}`);
}

function makePayload() {
  return {
    findByID: vi.fn().mockResolvedValue({ id: 12, title: "Accueil" }),
    find: vi.fn().mockResolvedValue({ docs: [{ id: 57, title: "Accueil B" }] }),
    update: vi.fn().mockResolvedValue({}),
  };
}
const experiment = (over: Record<string, unknown> = {}) => ({
  id: 4,
  name: "Accueil — test",
  status: "running",
  controlPage: 12,
  growthbookExperimentKey: "page-12-1760",
  startedAt: "2026-10-01T00:00:00.000Z",
  analysisStartedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});
const updatesOf = (payload: ReturnType<typeof makePayload>) => payload.update.mock.calls.map(([arg]) => (arg as { data: Record<string, unknown> }).data);

beforeEach(() => {
  calls = [];
  factTables = [];
  factMetrics = [];
  gbExperiments = [];
  snapshotStatus = [];
  fail = null;
  __resetGrowthBookCache();
  vi.stubEnv("GROWTHBOOK_API_KEY", "secret_test");
  vi.stubEnv("GROWTHBOOK_API_URL", "http://gb.test/api");
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const call = { method: init?.method ?? "GET", path: url.pathname.replace("/api/v1", "") + url.search, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const out = respond(call);
    return out instanceof Response ? out : Response.json(out);
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("refreshAnalysis", () => {
  it("does nothing without GROWTHBOOK_API_KEY", async () => {
    vi.stubEnv("GROWTHBOOK_API_KEY", "");
    const payload = makePayload();
    expect(await refreshAnalysis(payload as never, experiment())).toEqual({ ok: false });
    expect(calls).toEqual([]);
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("creates the fact tables and metrics once, then finds them by name", async () => {
    await refreshAnalysis(makePayload() as never, experiment({ growthbookId: "exp_1" }), { pollEveryMs: 0 });
    __resetGrowthBookCache();
    await refreshAnalysis(makePayload() as never, experiment({ growthbookId: "exp_1" }), { pollEveryMs: 0 });
    const created = calls.filter((c) => c.method === "POST" && (c.path === "/fact-tables" || c.path === "/fact-metrics"));
    expect(created.map((c) => c.body!.name)).toEqual(["Trefle — leads attribués", "Trefle — leads confirmés", "Lead envoyé", "Lead confirmé"]);
    expect(created[1]!.body!.sql).toContain("WHERE confirmed_at IS NOT NULL");
  });

  it("declares an undeclared test with its pages, control first, running since the test started", async () => {
    const payload = makePayload();
    await refreshAnalysis(payload as never, experiment(), { pollEveryMs: 0 });
    const post = calls.find((c) => c.method === "POST" && c.path === "/experiments")!;
    expect(post.body).toMatchObject({
      trackingKey: "page-12-1760",
      datasourceId: "trefle",
      assignmentQueryId: "trefle_exposures",
      variations: [
        { key: "12", name: "Accueil" },
        { key: "57", name: "Accueil B" },
      ],
      metrics: ["fm_lead"],
      secondaryMetrics: ["fm_confirmed"],
      status: "running",
      phases: [{ name: "Main", dateStarted: "2026-10-01T00:00:00.000Z" }],
    });
    expect(updatesOf(payload)[0]).toEqual({ growthbookId: "exp_1", analysisStartedAt: "2026-10-01T00:00:00.000Z" });
  });

  it("a test started before 018 still counts from its start in GrowthBook; measured from now in Trefle", async () => {
    const payload = makePayload();
    await refreshAnalysis(payload as never, experiment({ analysisStartedAt: undefined }), { pollEveryMs: 0 });
    const post = calls.find((c) => c.method === "POST" && c.path === "/experiments")!;
    expect(post.body!.phases).toEqual([{ name: "Main", dateStarted: "2026-10-01T00:00:00.000Z" }]);
    expect(Date.parse(String(updatesOf(payload)[0]!.analysisStartedAt))).toBeGreaterThan(Date.parse("2026-10-02T00:00:00.000Z"));
  });

  it("reuses a GrowthBook experiment already declared under the tracking key", async () => {
    gbExperiments = [{ id: "exp_9" }];
    const payload = makePayload();
    await refreshAnalysis(payload as never, experiment(), { pollEveryMs: 0 });
    expect(calls.some((c) => c.method === "POST" && c.path === "/experiments")).toBe(false);
    expect(calls.some((c) => c.path === "/experiments/exp_9/snapshot")).toBe(true);
  });

  it("waits for the snapshot, then stores the analysis with the confirmed-lead counts", async () => {
    snapshotStatus = ["running", "running", "success"];
    const payload = makePayload();
    expect(await refreshAnalysis(payload as never, experiment({ growthbookId: "exp_1" }), { pollEveryMs: 0 })).toEqual({ ok: true });
    const data = updatesOf(payload).at(-1)!;
    expect(data.analysisError).toBeNull();
    expect(data.analysisRefreshedAt).toEqual(expect.any(String));
    expect(data.analysis).toMatchObject({
      splitWarning: false,
      arms: [
        { pageId: 12, users: 1000, conversions: 40, confirmed: 20 },
        { pageId: 57, users: 1000, conversions: 60, confirmed: 33 },
      ],
      challengers: [{ pageId: 57, chanceToBeatControl: 0.97, ciLow: 0.04, ciHigh: 0.9, verdict: "leaning-better", reading: "better" }],
    });
  });

  it("carries the previous reading across refreshes (72-hour hold)", async () => {
    const since = new Date(Date.now() - 73 * 3600 * 1000).toISOString();
    const previous = { challengers: [{ pageId: 57, reading: "better", readingSince: since }] };
    const payload = makePayload();
    await refreshAnalysis(payload as never, experiment({ growthbookId: "exp_1", analysis: previous }), { pollEveryMs: 0 });
    expect(updatesOf(payload).at(-1)!.analysis).toMatchObject({ challengers: [{ pageId: 57, verdict: "better", readingSince: since }] });
  });

  it("gives the fact tables their visitor id type back when GrowthBook emptied it (empty table), and only then", async () => {
    factTables = [
      { id: "ft_a", name: "Trefle — leads attribués", userIdTypes: [] },
      { id: "ft_b", name: "Trefle — leads confirmés", userIdTypes: ["visitor_id"] },
      { id: "ft_x", name: "Someone else's table", userIdTypes: [] },
    ];
    expect((await refreshAnalysis(makePayload() as never, experiment({ growthbookId: "exp_1" }), { pollEveryMs: 0 })).ok).toBe(true);
    const updates = calls.filter((c) => c.method === "POST" && c.path.startsWith("/fact-tables/"));
    expect(updates).toEqual([{ method: "POST", path: "/fact-tables/ft_a", body: { userIdTypes: ["visitor_id"] } }]);
    const snapshotAt = calls.findIndex((c) => c.path.endsWith("/snapshot"));
    expect(calls.indexOf(updates[0]!)).toBeLessThan(snapshotAt);
  });

  it("before any analysis went through, a failure is a wait with the minutes to the next automatic run", async () => {
    fail = "/experiments/exp_1/snapshot";
    const payload = makePayload();
    const out = await refreshAnalysis(payload as never, experiment({ growthbookId: "exp_1" }), { pollEveryMs: 0 });
    expect(out.ok).toBe(false);
    expect(out.waiting).toBe(true);
    expect(out.error).toMatch(/^Premières données dans \d+ min/);
    expect(updatesOf(payload)).toEqual([{ analysisError: "En attente des premières données (analyse automatique toutes les heures)" }]);
  });

  it("on failure keeps the previous analysis and stores a French message", async () => {
    fail = "/experiments/exp_1/results";
    const payload = makePayload();
    const out = await refreshAnalysis(payload as never, experiment({ growthbookId: "exp_1", analysisRefreshedAt: "2026-10-22T10:00:00.000Z" }), { pollEveryMs: 0 });
    expect(out).toEqual({ ok: false, error: "Analyse statistique momentanément indisponible" });
    expect(updatesOf(payload)).toEqual([{ analysisError: "Analyse statistique momentanément indisponible" }]);
  });

  it("a snapshot that errors or never finishes is a failure", async () => {
    snapshotStatus = ["error"];
    expect((await refreshAnalysis(makePayload() as never, experiment({ growthbookId: "exp_1" }), { pollEveryMs: 0 })).ok).toBe(false);
    snapshotStatus = Array(5).fill("running");
    expect((await refreshAnalysis(makePayload() as never, experiment({ growthbookId: "exp_1" }), { pollEveryMs: 0, pollForMs: 0 })).ok).toBe(false);
  });
});

describe("stopExperiment", () => {
  it("closes a promoted test as won by the promoted page's variation", async () => {
    await stopExperiment(experiment({ growthbookId: "exp_1" }), 57);
    expect(calls.at(-1)).toMatchObject({ path: "/experiments/exp_1/stop", body: { results: "won", winnerVariationId: "v1" } });
  });

  it("closes a test concluded without promotion as inconclusive; never throws", async () => {
    await stopExperiment(experiment({ growthbookId: "exp_1" }), null);
    expect(calls.at(-1)).toMatchObject({ body: { results: "inconclusive" } });
    fail = "/experiments/exp_1";
    await expect(stopExperiment(experiment({ growthbookId: "exp_1" }), 57)).resolves.toBeUndefined();
  });
});
