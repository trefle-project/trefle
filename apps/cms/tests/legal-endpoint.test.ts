import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as LegalBuild from "../src/lib/legal/build";

const loadLegalInputs = vi.fn();
const archiveVersion = vi.fn().mockResolvedValue("2026-10-21T10:00:00.000Z");
vi.mock("../src/lib/legal/build", async (orig) => ({ ...(await orig<typeof LegalBuild>()), loadLegalInputs, archiveVersion }));

const { legalPageEndpoint } = await import("../src/endpoints/legalPage");

/** 021-legal-pages (contracts/legal-api.md, T010) — GET /api/legal/:kind. */
type Handler = (req: unknown) => Promise<Response>;
const handler = legalPageEndpoint.handler as unknown as Handler;
const doc = { root: { type: "root", children: [{ type: "paragraph", version: 1, children: [{ type: "text", text: "Éditeur : {{owner.name}}.", format: 0, version: 1 }] }] } };
const inputs = {
  operator: {},
  suppliers: [],
  texts: [{ language: "fr", privacyPolicy: doc, legalNotice: doc }],
  retentionMonths: 24,
  domain: { hostname: "site.example", defaultLanguage: "fr", consentBannerEnabled: true, owner: { name: "Traiteur SARL" }, extras: [] },
};
const req = (kind: string, query: string, user: object | null = { isService: true }) => ({
  user,
  routeParams: { kind },
  url: `http://cms/api/legal/${kind}?${query}`,
  payload: {},
});

beforeEach(() => {
  vi.clearAllMocks();
  loadLegalInputs.mockResolvedValue({ inputs, domain: { ownPrivacyPolicyUrl: "https://owner.example/privacy", ownLegalNoticeUrl: "" } });
});

describe("GET /api/legal/:kind", () => {
  it("403 for anyone but the service account", async () => {
    expect((await handler(req("privacy", "domain=3", { role: "admin", isActive: true }))).status).toBe(403);
    expect((await handler(req("privacy", "domain=3", null))).status).toBe(403);
  });

  it("400 on a bad kind or domain, 404 on an unknown domain", async () => {
    expect((await handler(req("terms", "domain=3"))).status).toBe(400);
    expect((await handler(req("privacy", "domain=abc"))).status).toBe(400);
    loadLegalInputs.mockResolvedValueOnce(null);
    expect((await handler(req("privacy", "domain=9"))).status).toBe(404);
  });

  it("answers the page, its archived version date and the domain's own address", async () => {
    const res = await handler(req("privacy", "domain=3&lang=en"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ language: "fr", title: "Politique de confidentialité", versionDate: "2026-10-21T10:00:00.000Z", ownUrl: "https://owner.example/privacy" });
    expect(body.html).toContain("Éditeur : Traiteur SARL.");
    expect(body.version).toMatch(/^[0-9a-f]{12}$/);
    expect(archiveVersion).toHaveBeenCalledWith({}, "3", "site.example", "privacy", expect.objectContaining({ version: body.version }));
    expect((await (await handler(req("notice", "domain=3"))).json()).ownUrl).toBeNull();
  });
});
