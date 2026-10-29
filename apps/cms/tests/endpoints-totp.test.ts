import { describe, expect, it, vi } from "vitest";

import { dsrEraseEndpoint } from "../src/endpoints/dsrErase";
import { leadIntakeEndpoint } from "../src/endpoints/leadIntake";
import { leadsExportEndpoint } from "../src/endpoints/leadsExport";
import { mediaUsageEndpoint } from "../src/endpoints/mediaUsage";
import { consentWithdrawEndpoint } from "../src/endpoints/consentWithdraw";

/**
 * 019-admin-access (T008) — custom endpoints are not wrapped by payload-totp;
 * each auth pattern (admin-only, staff, staff-or-service, service-or-admin,
 * collection endpoint) must refuse a password-only session with the plugin on.
 * The 403 comes before any database call.
 */
type Handler = (req: unknown) => Promise<Response>;
const h = (e: { handler: unknown }) => e.handler as Handler;

const payload = {
  config: { custom: { totp: { pluginOptions: { disabled: false } } } },
  find: vi.fn(),
  findByID: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};
const req = (user: unknown) => ({
  user,
  payload,
  headers: new Headers(),
  url: "http://cms/api/x",
  searchParams: new URLSearchParams(),
  routeParams: { id: "1" },
  json: async () => ({}),
});

const passwordOnlyAdmin = { id: 1, role: "admin", isActive: true, _strategy: "local-jwt" };
const passwordOnlyEditor = { id: 2, role: "editor", isActive: true, _strategy: "local-jwt" };

describe("custom endpoints refuse a password-only session (plugin on)", () => {
  it.each([
    ["dsr-erase (admin only)", dsrEraseEndpoint, passwordOnlyAdmin],
    ["leads-export (staff)", leadsExportEndpoint, passwordOnlyEditor],
    ["consent-withdraw (staff or service)", consentWithdrawEndpoint, passwordOnlyEditor],
    ["lead-intake (service or admin)", leadIntakeEndpoint, passwordOnlyAdmin],
    ["media usage (collection endpoint, staff)", mediaUsageEndpoint, passwordOnlyEditor],
  ])("%s → 403", async (_name, endpoint, user) => {
    const res = await h(endpoint)(req(user));
    expect(res.status).toBe(403);
    expect(payload.find).not.toHaveBeenCalled();
    expect(payload.findByID).not.toHaveBeenCalled();
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("the renderer's API key still reaches lead-intake", async () => {
    const res = await h(leadIntakeEndpoint)(req({ id: 3, isService: true, _strategy: "api-key" }));
    expect(res.status).not.toBe(403);
  });
});
