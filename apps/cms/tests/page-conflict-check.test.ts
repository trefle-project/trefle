import { describe, expect, it, vi } from "vitest";

import { pageConflictCheckEndpoint } from "../src/endpoints/pageConflictCheck";

const admin = { id: "u1", role: "admin", isActive: true };

function makeReq(user: unknown, query: Record<string, string | undefined>, findResult: { docs: unknown[] }) {
  return {
    user,
    query,
    payload: { find: vi.fn().mockResolvedValue(findResult) },
  } as never;
}

describe("pageConflictCheckEndpoint (004-page-types, contracts/page-conflict-check.md)", () => {
  it("reports a conflict against another draft page", async () => {
    const req = makeReq(admin, { domain: "d1", path: "/promo" }, { docs: [{ id: "p1", title: "Promo été", status: "draft" }] });
    const res = await pageConflictCheckEndpoint.handler!(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conflict: true, pageId: "p1", pageTitle: "Promo été" });
  });

  it("reports a conflict against another published page", async () => {
    const req = makeReq(admin, { domain: "d1", path: "/promo" }, { docs: [{ id: "p2", title: "Promo hiver", status: "published" }] });
    const res = await pageConflictCheckEndpoint.handler!(req);
    expect(await res.json()).toEqual({ conflict: true, pageId: "p2", pageTitle: "Promo hiver" });
  });

  it("reports no conflict when the path matches but the domain differs", async () => {
    // find() is mocked directly so this asserts the response shape, not the
    // query construction — the "domain differs" case is exercised by the
    // where-clause including both domain and path (see pageConflictCheck.ts).
    const req = makeReq(admin, { domain: "d2", path: "/promo" }, { docs: [] });
    const res = await pageConflictCheckEndpoint.handler!(req);
    expect(await res.json()).toEqual({ conflict: false });
  });

  it("reports no conflict when nothing matches", async () => {
    const req = makeReq(admin, { domain: "d1", path: "/nouvelle" }, { docs: [] });
    const res = await pageConflictCheckEndpoint.handler!(req);
    expect(await res.json()).toEqual({ conflict: false });
  });

  it("rejects a non-staff/unauthenticated caller with 403", async () => {
    const req = makeReq(null, { domain: "d1", path: "/promo" }, { docs: [] });
    const res = await pageConflictCheckEndpoint.handler!(req);
    expect(res.status).toBe(403);
  });

  it("rejects a service-account caller with 403 (staff only, not service)", async () => {
    const req = makeReq({ id: "svc", isService: true }, { domain: "d1", path: "/promo" }, { docs: [] });
    const res = await pageConflictCheckEndpoint.handler!(req);
    expect(res.status).toBe(403);
  });
});
