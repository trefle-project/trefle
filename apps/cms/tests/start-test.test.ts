import { describe, expect, it, vi } from "vitest";

import { startTestEndpoint } from "../src/endpoints/startTest";

const admin = { id: "u1", role: "admin", isActive: true };
const control = { id: 180, title: "manualtest", status: "published" };

function makeReq(opts: {
  user?: unknown;
  body?: Record<string, unknown>;
  control?: unknown;
  variantsTotalDocs?: number;
  runningTotalDocs?: number;
  create?: ReturnType<typeof vi.fn>;
}) {
  const find = vi
    .fn()
    .mockResolvedValueOnce({ totalDocs: opts.variantsTotalDocs ?? 1 })
    .mockResolvedValueOnce({ totalDocs: opts.runningTotalDocs ?? 0 });
  return {
    user: opts.user === undefined ? admin : opts.user,
    json: async () => opts.body ?? { controlPage: "180" },
    payload: {
      findByID: vi.fn().mockResolvedValue(opts.control === undefined ? control : opts.control),
      find,
      create: opts.create ?? vi.fn().mockResolvedValue({ id: 1, status: "running" }),
    },
  } as never;
}

describe("startTestEndpoint (008-ab-testing, FR-002/FR-004)", () => {
  it("starts a running experiment when the control has a published variant and no other running test", async () => {
    const create = vi.fn().mockResolvedValue({ id: 1, status: "running" });
    const req = makeReq({ create });
    const res = await startTestEndpoint.handler!(req);
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "experiments",
        data: expect.objectContaining({ controlPage: 180, status: "running" }),
      }),
    );
  });

  it("rejects starting with zero published variants", async () => {
    const req = makeReq({ variantsTotalDocs: 0 });
    await expect(startTestEndpoint.handler!(req)).rejects.toThrow(/at least one published test variant/);
  });

  it("rejects starting a second test while one is already running", async () => {
    const req = makeReq({ runningTotalDocs: 1 });
    await expect(startTestEndpoint.handler!(req)).rejects.toThrow(/already has a running test/);
  });

  it("rejects an unpublished control page", async () => {
    const req = makeReq({ control: { ...control, status: "draft" } });
    await expect(startTestEndpoint.handler!(req)).rejects.toThrow(/must be published/);
  });

  it("400s when controlPage is missing from the body", async () => {
    const req = makeReq({ body: {} });
    const res = await startTestEndpoint.handler!(req);
    expect(res.status).toBe(400);
  });

  it("404s when the control page doesn't exist", async () => {
    const req = makeReq({ control: null });
    const res = await startTestEndpoint.handler!(req);
    expect(res.status).toBe(404);
  });

  it("rejects a non-staff caller with 403", async () => {
    const req = makeReq({ user: null });
    const res = await startTestEndpoint.handler!(req);
    expect(res.status).toBe(403);
  });
});
