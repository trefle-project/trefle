import { describe, expect, it, vi } from "vitest";

import { leadLanguageEndpoint } from "../src/endpoints/leadLanguage";

/** 023-admin-i18n (US6) — GET /api/lead-language/:id: the lead's page language, nothing else. */
type Handler = (req: unknown) => Promise<Response>;
const handler = leadLanguageEndpoint.handler as unknown as Handler;

const makeReq = (id: string, lead: unknown, user: unknown = { isService: true }) => ({
  user,
  routeParams: { id },
  payload: { findByID: vi.fn(async () => (lead instanceof Error ? Promise.reject(lead) : lead)) },
});

describe("lead-language endpoint", () => {
  it("403 for anyone but the service account", async () => {
    expect((await handler(makeReq("1", null, { role: "admin", isActive: true }))).status).toBe(403);
  });

  it("400 for an id that is not a number", async () => {
    expect((await handler(makeReq("abc", null))).status).toBe(400);
  });

  it("answers the page's language code, and only that", async () => {
    const req = makeReq("12", { id: 12, language: "en" });
    const res = await handler(req);
    expect(await res.json()).toEqual({ language: "en" });
    expect(req.payload.findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: "leads", id: 12, select: { language: true }, overrideAccess: true }));
  });

  it.each([
    ["a missing lead", new Error("not found")],
    ["a lead without language", { id: 12, language: null }],
  ])("null for %s", async (_, lead) => {
    expect(await (await handler(makeReq("12", lead))).json()).toEqual({ language: null });
  });
});
