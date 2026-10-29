import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>([["host", "Site-A.localhost:3001"]]),
}));

const getActiveDomainByHost = vi.fn();
vi.mock("../src/lib/payload-client", () => ({ getActiveDomainByHost }));

const { pathFromSlug, requestHostname, resolveDomain } = await import("../src/lib/domains");

describe("domains helpers (T043)", () => {
  it("pathFromSlug builds a leading-slash path, `/` when empty", () => {
    expect(pathFromSlug(undefined)).toBe("/");
    expect(pathFromSlug([])).toBe("/");
    expect(pathFromSlug(["promo"])).toBe("/promo");
    expect(pathFromSlug(["a", "b"])).toBe("/a/b");
  });

  it("requestHostname lowercases and strips the port", async () => {
    expect(await requestHostname()).toBe("site-a.localhost");
  });

  it("resolveDomain looks up the active domain for the request host", async () => {
    getActiveDomainByHost.mockResolvedValueOnce({ id: "1", hostname: "site-a.localhost", isActive: true });
    const d = await resolveDomain();
    expect(getActiveDomainByHost).toHaveBeenCalledWith("site-a.localhost");
    expect(d?.id).toBe("1");
  });

  it("resolveDomain returns null when the host is unknown", async () => {
    getActiveDomainByHost.mockResolvedValueOnce(null);
    expect(await resolveDomain()).toBeNull();
  });
});
