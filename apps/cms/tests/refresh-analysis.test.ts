import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshAnalysis = vi.fn();
vi.mock("../src/lib/growthbook", () => ({
  analysisEnabled: () => Boolean(process.env.GROWTHBOOK_API_KEY),
  refreshAnalysis,
}));

const { refreshAnalysisEndpoint } = await import("../src/endpoints/refreshAnalysis");

/** 018-ab-significance (FR-012, T029) — « Rafraîchir » on one test. */
type Handler = (req: unknown) => Promise<Response>;
const handler = refreshAnalysisEndpoint.handler as unknown as Handler;
const admin = { id: "u1", role: "admin", isActive: true };
const req = (user: unknown, found: unknown = { id: 4, status: "running" }, language = "fr") => ({
  user,
  i18n: { language },
  routeParams: { id: "4" },
  payload: { findByID: vi.fn().mockResolvedValue(found) },
});

beforeEach(() => vi.stubEnv("GROWTHBOOK_API_KEY", "k"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/experiments/:id/refresh-analysis", () => {
  it("403 for anyone but an active member", async () => {
    expect((await handler(req(null))).status).toBe(403);
    expect((await handler(req({ isService: true }))).status).toBe(403);
    expect(refreshAnalysis).not.toHaveBeenCalled();
  });

  it("409 while the analysis is not configured", async () => {
    vi.stubEnv("GROWTHBOOK_API_KEY", "");
    expect((await handler(req(admin))).status).toBe(409);
  });

  it("404 for an unknown test", async () => {
    expect((await handler(req(admin, null))).status).toBe(404);
  });

  it("refreshes the test and answers its outcome", async () => {
    refreshAnalysis.mockResolvedValueOnce({ ok: true });
    expect((await handler(req(admin))).status).toBe(200);
    refreshAnalysis.mockResolvedValueOnce({ ok: false, error: "Analyse statistique momentanément indisponible" });
    const res = await handler(req(admin));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "Analyse statistique momentanément indisponible" });
  });

  it("answers in the member's language", async () => {
    refreshAnalysis.mockResolvedValueOnce({ ok: false, waiting: true, waitMinutes: 12, error: "Premières données dans 12 min (analyse automatique toutes les heures)." });
    const res = await handler(req(admin, undefined, "en"));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ waiting: true, error: "First data in 12 min (automatic analysis every hour)." });
    refreshAnalysis.mockResolvedValueOnce({ ok: false, error: "Analyse statistique momentanément indisponible" });
    expect(await (await handler(req(admin, undefined, "en"))).json()).toEqual({ ok: false, error: "Statistical analysis unavailable for the moment" });
  });
});
