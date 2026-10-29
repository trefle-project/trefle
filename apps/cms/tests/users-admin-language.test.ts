import { describe, expect, it, vi } from "vitest";

import { adminLanguageEndpoint } from "../src/endpoints/adminLanguage";
import { adminLanguageOnChange, adminLanguageOnLogin, adminLanguageOnLogout } from "../src/hooks/users-admin-language";

/** 023-admin-i18n (T011 endpoint part, T016) — the language cookie table of contracts/admin-language.md, and the public endpoint. */
function makeReq(opts: { userId?: number; https?: boolean; responseHeaders?: Headers } = {}) {
  return {
    payload: { config: { cookiePrefix: "payload" } },
    headers: new Headers(opts.https ? { "x-forwarded-proto": "https" } : {}),
    user: opts.userId === undefined ? null : { id: opts.userId },
    responseHeaders: opts.responseHeaders,
  } as never as { responseHeaders?: Headers };
}

const cookies = (req: { responseHeaders?: Headers }) => req.responseHeaders?.getSetCookie() ?? [];

describe("sign-in", () => {
  it("sets the member's language for a year", async () => {
    const req = makeReq();
    const user = { id: 1, adminLanguage: "en" };
    expect(await adminLanguageOnLogin({ user, req } as never)).toBe(user);
    expect(cookies(req)).toEqual(["payload-lng=en; Path=/; Max-Age=31536000; SameSite=Lax"]);
  });

  it("expires the cookie when the member has no choice, so the installation's language applies", async () => {
    const req = makeReq();
    await adminLanguageOnLogin({ user: { id: 1, adminLanguage: null }, req } as never);
    expect(cookies(req)).toEqual(["payload-lng=; Path=/; Max-Age=0; SameSite=Lax"]);
  });

  it("marks the cookie Secure behind HTTPS and keeps Payload's own headers", async () => {
    const responseHeaders = new Headers();
    responseHeaders.append("Set-Cookie", "payload-token=x");
    const req = makeReq({ https: true, responseHeaders });
    await adminLanguageOnLogin({ user: { id: 1, adminLanguage: "fr" }, req } as never);
    expect(cookies(req)).toEqual(["payload-token=x", "payload-lng=fr; Path=/; Max-Age=31536000; SameSite=Lax; Secure"]);
  });
});

describe("sign-out", () => {
  it("expires the cookie: the login page then uses the installation's language", async () => {
    const req = makeReq({ userId: 1 });
    await adminLanguageOnLogout({ req } as never);
    expect(cookies(req)).toEqual(["payload-lng=; Path=/; Max-Age=0; SameSite=Lax"]);
  });
});

describe("saving an account", () => {
  const change = (req: unknown, adminLanguage: string | null, previous: string | null, id = 1) =>
    adminLanguageOnChange({ doc: { id, adminLanguage, email: "a@b.c" }, previousDoc: { id, adminLanguage: previous, email: "a@b.c" }, operation: "update", req } as never);

  it("updates the cookie when members change their own language", async () => {
    const req = makeReq({ userId: 1 });
    await change(req, "en", "fr");
    expect(cookies(req)).toEqual(["payload-lng=en; Path=/; Max-Age=31536000; SameSite=Lax"]);
  });

  it("clears it when they go back to the installation default", async () => {
    const req = makeReq({ userId: 1 });
    await change(req, null, "en");
    expect(cookies(req)).toEqual(["payload-lng=; Path=/; Max-Age=0; SameSite=Lax"]);
  });

  it("sets nothing when the language did not change", async () => {
    const req = makeReq({ userId: 1 });
    await change(req, "en", "en");
    expect(cookies(req)).toEqual([]);
  });

  it("sets nothing when an administrator edits another member", async () => {
    const req = makeReq({ userId: 2 });
    await change(req, "en", "fr", 1);
    expect(cookies(req)).toEqual([]);
  });

  it("sets nothing on create, and returns the document unchanged (FR-015)", async () => {
    const req = makeReq({ userId: 1 });
    const doc = { id: 1, adminLanguage: "en", email: "a@b.c" };
    expect(await adminLanguageOnChange({ doc, previousDoc: {}, operation: "create", req } as never)).toBe(doc);
    expect(doc).toEqual({ id: 1, adminLanguage: "en", email: "a@b.c" });
    expect(cookies(req)).toEqual([]);
  });
});

describe("GET /api/globals/settings/admin-language", () => {
  const call = (findGlobal: () => Promise<unknown>) =>
    adminLanguageEndpoint.handler({ payload: { findGlobal: vi.fn(findGlobal) }, user: null } as never) as Promise<Response>;

  it("answers the stored language and nothing else, with no sign-in", async () => {
    const res = await call(async () => ({ adminLanguage: "fr", senderEmail: "x@y.z", operator: { name: "Secret SA" } }));
    expect(await res.json()).toEqual({ language: "fr" });
  });

  it("answers English when the value is missing or unreadable", async () => {
    expect(await (await call(async () => ({ adminLanguage: null }))).json()).toEqual({ language: "en" });
    expect(await (await call(async () => Promise.reject(new Error("db down")))).json()).toEqual({ language: "en" });
  });
});
