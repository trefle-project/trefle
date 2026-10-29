import { describe, expect, it, vi } from "vitest";

import { consentWithdrawEndpoint } from "../src/endpoints/consentWithdraw";
import { dsrEraseEndpoint } from "../src/endpoints/dsrErase";
import { dsrExportEndpoint } from "../src/endpoints/dsrExport";

type Handler = (req: unknown) => Promise<Response>;
const withdraw = consentWithdrawEndpoint.handler as unknown as Handler;
const erase = dsrEraseEndpoint.handler as unknown as Handler;
const doExport = dsrExportEndpoint.handler as unknown as Handler;

const admin = { role: "admin", isActive: true, id: 1 };
const editor = { role: "editor", isActive: true, id: 2 };
const service = { isService: true };

// ---- consent-withdraw (T056) ----------------------------------------------

describe("consent-withdraw endpoint (T061)", () => {
  const lead = { id: 5, consentStatus: "consented", consentRecord: 9 };
  const makeReq = (user: unknown, over: Record<string, unknown> = {}) => {
    const update = vi.fn().mockResolvedValue({});
    return {
      user,
      payload: {
        findByID: vi.fn().mockImplementation(async ({ collection }: { collection: string }) =>
          collection === "leads" ? { ...lead, ...over } : { withdrawnAt: null },
        ),
        update,
        delete: vi.fn().mockResolvedValue({ docs: [] }),
      },
      json: async () => ({ leadId: 5 }),
    };
  };

  it("403 for an anonymous caller", async () => {
    const res = await withdraw({ user: null, payload: {}, json: async () => ({ leadId: 5 }) });
    expect(res.status).toBe(403);
  });

  it("sets consentStatus=withdrawn + stamps consent-record.withdrawnAt", async () => {
    const req = makeReq(service);
    const res = await withdraw(req);
    expect(res.status).toBe(200);
    expect(req.payload.update).toHaveBeenCalledWith(expect.objectContaining({ collection: "leads", data: { consentStatus: "withdrawn" } }));
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "consent-records", data: expect.objectContaining({ withdrawnAt: expect.any(String) }) }),
    );
    // 018 FR-008 — the A/B attribution goes
    expect(req.payload.delete).toHaveBeenCalledWith(expect.objectContaining({ collection: "ab-conversions", where: { lead: { equals: 5 } } }));
  });

  it("is idempotent — already withdrawn ⇒ 200, no lead update", async () => {
    const req = makeReq(service, { consentStatus: "withdrawn" });
    const res = await withdraw(req);
    expect(res.status).toBe(200);
    expect(req.payload.update).not.toHaveBeenCalledWith(expect.objectContaining({ collection: "leads" }));
  });

  it("unknown lead ⇒ 200 (non-enumerating), nothing written", async () => {
    const req = { user: service, payload: { findByID: vi.fn().mockResolvedValue(null), update: vi.fn() }, json: async () => ({ leadId: 99 }) };
    const res = await withdraw(req);
    expect(res.status).toBe(200);
    expect(req.payload.update).not.toHaveBeenCalled();
  });
});

// ---- dsr-erase (T057) -----------------------------------------------------

describe("dsr-erase endpoint (T063)", () => {
  const makeReq = (user: unknown, leads: { id: number }[]) => {
    const update = vi.fn().mockResolvedValue({});
    const create = vi.fn().mockResolvedValue({});
    return {
      user,
      json: async () => ({ email: "Jane@Example.com", requestId: 3 }),
      payload: {
        find: vi.fn().mockImplementation(async ({ collection }: { collection: string }) => {
          if (collection === "leads") return { docs: leads, totalDocs: leads.length };
          if (collection === "consent-records") return { docs: [{ id: 100 }], totalDocs: 1 };
          return { docs: [], totalDocs: 0 };
        }),
        findByID: vi.fn().mockImplementation(async ({ id }: { id: number }) => ({ id, erasedAt: null, consentRecord: 100 })),
        update,
        create,
        delete: vi.fn().mockResolvedValue({ docs: [] }),
        logger: { warn: vi.fn() },
      },
    };
  };

  it("403 for an Editor (erasure is Administrator-only)", async () => {
    const res = await erase(makeReq(editor, [{ id: 1 }]));
    expect(res.status).toBe(403);
  });

  it("erases every matching lead + its consent record, completes the request, logs it", async () => {
    const req = makeReq(admin, [{ id: 1 }, { id: 2 }]);
    const res = await erase(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, erased: 2 });
    // lead scrub
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "leads", data: expect.objectContaining({ email: null, erasedAt: expect.any(String) }) }),
    );
    // consent-record scrub (T057 / FR-031a)
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "consent-records", data: { email: null, ipAddress: null, userAgent: null } }),
    );
    // request completed
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "data-subject-requests", id: 3, data: { status: "completed" } }),
    );
    // 018 FR-008 — each erased lead's A/B attribution goes
    for (const id of [1, 2]) {
      expect(req.payload.delete).toHaveBeenCalledWith(expect.objectContaining({ collection: "ab-conversions", where: { lead: { equals: id } } }));
    }
    // activity entry
    expect(req.payload.create).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "activity-log", data: expect.objectContaining({ type: "dsr-completed" }) }),
    );
  });
});

// ---- dsr-export (T058) --------------------------------------------------

describe("dsr-export endpoint (T062)", () => {
  const makeReq = (user: unknown) => ({
    user,
    json: async () => ({ email: "Jane@Example.com" }),
    payload: {
      find: vi.fn().mockImplementation(async ({ collection }: { collection: string }) => ({
        docs: collection === "leads" ? [{ id: 1, email: "jane@example.com" }] : [{ id: 9, email: "jane@example.com" }],
        totalDocs: 1,
      })),
      create: vi.fn().mockResolvedValue({}),
      logger: { warn: vi.fn() },
    },
  });

  it("403 for a non-staff caller", async () => {
    expect((await doExport(makeReq(service))).status).toBe(403);
  });

  it("returns all leads + consent records for the (lowercased) email and logs the export", async () => {
    const req = makeReq(editor);
    const res = await doExport(req);
    const body = (await res.json()) as { email: string; leads: unknown[]; consentRecords: unknown[] };
    expect(body.email).toBe("jane@example.com");
    expect(body.leads).toHaveLength(1);
    expect(body.consentRecords).toHaveLength(1);
    expect(req.payload.create).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "activity-log", data: expect.objectContaining({ type: "dsr-completed" }) }),
    );
  });
});
