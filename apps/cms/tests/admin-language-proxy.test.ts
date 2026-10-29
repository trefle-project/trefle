import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { config, installationLanguage, proxy, resetInstallationLanguage } from "../src/proxy";

/** 023-admin-i18n (T011) — the installation's language replaces the browser's on every admin and API request. */
const answering = (language: unknown) => vi.fn(async () => Response.json({ language })) as unknown as typeof fetch;
const failing = () => vi.fn(async () => Promise.reject(new Error("down"))) as unknown as typeof fetch;

/** The request headers Next forwards, as NextResponse.next({ request: { headers } }) encodes them. */
function forwarded(res: Response, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name}`);
}

beforeEach(() => resetInstallationLanguage());

describe("installationLanguage", () => {
  it("reads Settings on the loopback address and keeps the answer 30 s", async () => {
    const fetcher = answering("fr");
    expect(await installationLanguage(fetcher, 0)).toBe("fr");
    expect(await installationLanguage(fetcher, 29_999)).toBe("fr");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetcher).mock.calls[0]![0]).toBe("http://127.0.0.1:3000/api/globals/settings/admin-language");
    expect(await installationLanguage(answering("en"), 30_000)).toBe("en");
  });

  it("keeps the last known language when Settings cannot be read", async () => {
    await installationLanguage(answering("fr"), 0);
    expect(await installationLanguage(failing(), 60_000)).toBe("fr");
    expect(await installationLanguage(answering("de"), 120_000)).toBe("fr");
  });

  it("falls back to English when it never could", async () => {
    expect(await installationLanguage(failing(), 0)).toBe("en");
  });
});

describe("proxy", () => {
  it("overwrites the browser's Accept-Language and keeps x-pathname", async () => {
    await installationLanguage(answering("fr"), Date.now());
    const res = await proxy(new NextRequest("http://cms.test/admin/collections/pages", { headers: { "accept-language": "en-US,en;q=0.9", "x-pathname": "/forged" } }));
    expect(forwarded(res, "accept-language")).toBe("fr");
    expect(forwarded(res, "x-pathname")).toBe("/admin/collections/pages");
  });

  it("does not look the language up for the language endpoint itself", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const res = await proxy(new NextRequest("http://cms.test/api/globals/settings/admin-language", { headers: { "accept-language": "de" } }));
    expect(fetcher).not.toHaveBeenCalled();
    expect(forwarded(res, "accept-language")).toBe("de");
    fetcher.mockRestore();
  });

  it("covers the admin and the REST API", () => {
    expect(config.matcher).toEqual(["/admin", "/admin/:path*", "/api/:path*"]);
  });
});
