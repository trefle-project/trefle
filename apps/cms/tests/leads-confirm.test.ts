import { describe, expect, it, vi } from "vitest";

import { leadsConfirmEndpoint } from "../src/endpoints/leadsConfirm";

type Handler = (req: unknown) => Promise<Response>;
const handler = leadsConfirmEndpoint.handler as unknown as Handler;

function makeReq(overrides: { user?: unknown; body?: Record<string, unknown>; lead?: unknown | null }) {
  const payload = {
    findByID: vi.fn().mockResolvedValue("lead" in overrides ? overrides.lead : { id: 101, optInConfirmedAt: null }),
    update: vi.fn().mockResolvedValue({}),
  };
  return {
    payload,
    user: overrides.user ?? { isService: true },
    json: async () => overrides.body ?? { leadId: 101 },
  };
}

describe("leads-confirm endpoint (006-double-optin-email, FR-009/FR-010/FR-011)", () => {
  it("403 for a non-service, non-staff caller", async () => {
    const res = await handler(makeReq({ user: { role: "editor", isActive: false } }));
    expect(res.status).toBe(403);
  });

  it("400 when leadId is missing", async () => {
    const res = await handler(makeReq({ body: {} }));
    expect(res.status).toBe(400);
  });

  it("sets optInConfirmedAt when currently unset", async () => {
    const req = makeReq({ lead: { id: 101, optInConfirmedAt: null } });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "leads", id: 101, data: { optInConfirmedAt: expect.any(String) } }),
    );
    // 018 FR-017 — the attributed lead (if any) becomes « Lead confirmé »
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "ab-conversions",
        where: { and: [{ lead: { equals: 101 } }, { confirmedAt: { equals: null } }] },
        data: { confirmedAt: expect.any(String) },
      }),
    );
  });

  it("is idempotent: a lead already confirmed is not written again", async () => {
    const req = makeReq({ lead: { id: 101, optInConfirmedAt: "2026-01-01T00:00:00.000Z" } });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(req.payload.update).not.toHaveBeenCalled();
  });

  it("non-enumerating: an unknown leadId still returns ok:true, no error", async () => {
    const req = makeReq({ lead: null });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(req.payload.update).not.toHaveBeenCalled();
  });

  it("staff (admin/editor) can also call it", async () => {
    const req = makeReq({ user: { role: "admin", isActive: true }, lead: { id: 101, optInConfirmedAt: null } });
    const res = await handler(req);
    expect(res.status).toBe(200);
  });
});
