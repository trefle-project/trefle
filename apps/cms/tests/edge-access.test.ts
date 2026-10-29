import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { edgeAccessListEndpoint, edgeAccessSyncedEndpoint } from "../src/endpoints/edgeAccess";

/**
 * 019-admin-access (T025, contracts/cms-endpoints.md) — the member list behind
 * the Cloudflare Access allow-list, guarded by the shared EDGE_SYNC_SECRET.
 */
type Handler = (req: unknown) => Promise<Response>;
const list = edgeAccessListEndpoint.handler as unknown as Handler;
const synced = edgeAccessSyncedEndpoint.handler as unknown as Handler;

const SECRET = "test-edge-sync-secret-0123456789abcdef";

const makeReq = (opts: { secret?: string; body?: unknown; users?: { email: string }[] } = {}) => {
  const payload = {
    find: vi.fn().mockResolvedValue({ docs: opts.users ?? [] }),
    updateGlobal: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
    logger: { warn: vi.fn() },
  };
  const headers = new Headers(opts.secret === undefined ? {} : { "x-edge-sync-secret": opts.secret });
  return { req: { payload, headers, json: async () => opts.body }, payload };
};

beforeEach(() => vi.stubEnv("EDGE_SYNC_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

describe("edge-access: shared secret", () => {
  it.each([
    ["GET", list],
    ["POST", synced],
  ])("%s: missing or wrong secret → 401, nothing read or written", async (_m, handler) => {
    for (const secret of [undefined, "wrong", `${SECRET}x`]) {
      const { req, payload } = makeReq({ secret, body: { emails: ["a@x.fr"] } });
      expect((await handler(req)).status).toBe(401);
      expect(payload.find).not.toHaveBeenCalled();
      expect(payload.updateGlobal).not.toHaveBeenCalled();
    }
  });

  it("secret unset on the server → 503", async () => {
    vi.stubEnv("EDGE_SYNC_SECRET", "");
    const { req } = makeReq({ secret: "" });
    expect((await list(req)).status).toBe(503);
  });
});

describe("GET /api/edge-access", () => {
  it("lists active human members: lower-cased, sorted, de-duplicated", async () => {
    const { req, payload } = makeReq({
      secret: SECRET,
      users: [{ email: "Zoe@Example.fr" }, { email: "anne@example.fr" }, { email: "zoe@example.fr" }],
    });
    const res = await list(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ emails: ["anne@example.fr", "zoe@example.fr"] });
    // service account and deactivated members are filtered in the query
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "users",
        overrideAccess: true,
        where: { and: [{ isService: { not_equals: true } }, { isActive: { not_equals: false } }] },
      }),
    );
  });
});

describe("POST /api/edge-access/synced", () => {
  it.each([
    ["no body", undefined],
    ["not a list", { emails: "a@x.fr" }],
    ["not addresses", { emails: ["a@x.fr", "nope"] }],
    ["too many", { emails: Array.from({ length: 51 }, (_, i) => `u${i}@x.fr`) }],
  ])("invalid body (%s) → 400", async (_name, body) => {
    const { req, payload } = makeReq({ secret: SECRET, body });
    expect((await synced(req)).status).toBe(400);
    expect(payload.updateGlobal).not.toHaveBeenCalled();
  });

  it("stores the applied list with the time, and logs edge-synced with the count only", async () => {
    const { req, payload } = makeReq({ secret: SECRET, body: { emails: ["B@x.fr", "a@x.fr", "b@x.fr"] } });
    expect((await synced(req)).status).toBe(204);
    expect(payload.updateGlobal).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "edge-access",
        overrideAccess: true,
        data: { emails: ["a@x.fr", "b@x.fr"], syncedAt: expect.any(String) },
      }),
    );
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "activity-log",
        data: expect.objectContaining({ type: "edge-synced", actor: null, meta: { count: 2 } }),
      }),
    );
    expect(JSON.stringify(payload.create.mock.calls)).not.toContain("@x.fr");
  });
});
