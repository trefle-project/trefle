import { beforeEach, describe, expect, it, vi } from "vitest";

import { leadIntakeEndpoint } from "../src/endpoints/leadIntake";

process.env.UNSUBSCRIBE_SECRET = "test-unsub";
process.env.CONFIRM_TOKEN_SECRET = "test-confirm";

type Handler = (req: unknown) => Promise<Response>;
const handler = leadIntakeEndpoint.handler as unknown as Handler;

const publishedPage = {
  id: 7,
  status: "published",
  domain: { id: 3, hostname: "site-a.localhost" },
  // 005-content-language-tagging — resolved at depth: 1, like `domain` above.
  language: { id: 2, code: "en", label: "English", isActive: true },
  form: {
    fields: [
      { name: "email", label: "Email", type: "email", required: true },
      { name: "firstName", label: "Prénom", type: "text", required: true },
    ],
    successMessage: "Merci",
    consentPurposeText: "But",
    privacyNoticeUrl: "/p",
    privacyNoticeVersion: "1",
  },
};

function makeReq(overrides: {
  user?: unknown;
  body?: Record<string, unknown>;
  page?: unknown;
  dupeCount?: number;
}) {
  const payload = {
    findByID: vi.fn().mockResolvedValue(overrides.page ?? publishedPage),
    find: vi.fn().mockResolvedValue({ totalDocs: overrides.dupeCount ?? 0, docs: [] }),
    create: vi
      .fn()
      .mockResolvedValueOnce({ id: 101 }) // lead
      .mockResolvedValueOnce({ id: 202 }), // consent-record
    update: vi.fn().mockResolvedValue({}),
    sendEmail: vi.fn().mockResolvedValue({}),
  };
  return {
    payload,
    user: overrides.user ?? { isService: true },
    headers: new Headers({ host: "site-a.localhost" }),
    json: async () =>
      overrides.body ?? {
        pageId: 7,
        email: "jane@example.com",
        fieldValues: { firstName: "Jane" },
        consent: true,
        consentContext: { consentText: "ok", capturedAt: "2026-01-01T00:00:00Z" },
        metadata: { pageUrl: "u" },
      },
  };
}

describe("lead-intake endpoint (T040)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 for a non-service, non-admin caller", async () => {
    const res = await handler(makeReq({ user: { role: "editor" } }));
    expect(res.status).toBe(403);
  });

  it("422 when consent is not exactly true", async () => {
    const res = await handler(makeReq({ body: { pageId: 7, email: "a@b.com", consent: "on" } }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "consent_required" });
  });

  it("409 when the page is not published", async () => {
    const res = await handler(makeReq({ page: { ...publishedPage, status: "draft" } }));
    expect(res.status).toBe(409);
  });

  it("422 when a required non-email field is missing", async () => {
    const res = await handler(
      makeReq({ body: { pageId: 7, email: "a@b.com", consent: true, fieldValues: {}, consentContext: {}, metadata: {} } }),
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "validation" });
  });

  it("happy path: creates lead + consent record, links them, returns unsubscribe url", async () => {
    const req = makeReq({});
    const res = await handler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, leadId: 101, duplicate: false });
    expect(body.unsubscribeUrl).toContain("http://site-a.localhost/unsubscribe?token=");
    expect(req.payload.create).toHaveBeenCalledWith(expect.objectContaining({ collection: "leads" }));
    expect(req.payload.create).toHaveBeenCalledWith(expect.objectContaining({ collection: "consent-records" }));
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "leads", id: 101, data: { consentRecord: 202 } }),
    );
  });

  // Dev-environment bug: apps/web is only reachable on :3001 locally (no
  // port-80 proxy in front, unlike Caddy in prod) — a link built without a
  // port is unreachable. PUBLIC_SITE_PORT is already set for exactly this in
  // infra/docker-compose.override.yml (reused from PublishedUrl.tsx's "Lien
  // public" link); this endpoint just needed to read it too.
  it("includes PUBLIC_SITE_PORT in the unsubscribe link when set (dev)", async () => {
    process.env.PUBLIC_SITE_PORT = "3001";
    try {
      const res = await handler(makeReq({}));
      const body = await res.json();
      expect(body.unsubscribeUrl).toContain("http://site-a.localhost:3001/unsubscribe?token=");
    } finally {
      delete process.env.PUBLIC_SITE_PORT;
    }
  });

  it("omits the port when PUBLIC_SITE_PORT is unset (prod)", async () => {
    const res = await handler(makeReq({}));
    const body = await res.json();
    expect(body.unsubscribeUrl).toBe(`http://site-a.localhost/unsubscribe?token=${body.unsubscribeUrl.split("token=")[1]}`);
    expect(body.unsubscribeUrl).not.toMatch(/localhost:\d+/);
  });

  // 005-content-language-tagging, FR-007
  it("stamps the created lead with the source page's language code", async () => {
    const req = makeReq({});
    await handler(req);
    expect(req.payload.create).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "leads", data: expect.objectContaining({ language: "en" }) }),
    );
  });

  // 005-content-language-tagging, contracts/lead-language-capture.md — defensive
  // fallback for the (practically unreachable) case where `page.language`
  // somehow isn't resolved to an object.
  it("falls back to fr if the page's language wasn't resolved to an object", async () => {
    const req = makeReq({ page: { ...publishedPage, language: 4 } });
    await handler(req);
    expect(req.payload.create).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "leads", data: expect.objectContaining({ language: "fr" }) }),
    );
  });

  // 006-double-optin-email, US3 (FR-005/FR-006)
  describe("opt-in confirmation email", () => {
    const optInEmail = { subject: "Confirmez", body: "Cliquez : {{confirmUrl}}" };

    it("sends nothing when the page has no optInEmail attached", async () => {
      const req = makeReq({});
      await handler(req);
      expect(req.payload.sendEmail).not.toHaveBeenCalled();
    });

    it("sends the opt-in email, substituting the placeholder with a real confirm link", async () => {
      const req = makeReq({ page: { ...publishedPage, optInEmail } });
      await handler(req);
      expect(req.payload.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "jane@example.com",
          subject: "Confirmez",
          html: expect.stringContaining("http://site-a.localhost/confirm?token="),
        }),
      );
      const sent = req.payload.sendEmail.mock.calls[0]![0] as { html: string };
      expect(sent.html).not.toContain("{{confirmUrl}}");
    });

    it("uses the page's domain sender identity as `from` when set", async () => {
      const req = makeReq({
        page: { ...publishedPage, optInEmail, domain: { id: 3, hostname: "site-a.localhost", senderName: "Trefle", senderEmail: "no-reply@site-a.example" } },
      });
      await handler(req);
      expect(req.payload.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ from: "Trefle <no-reply@site-a.example>" }),
      );
    });

    it("omits `from` entirely (not just sets it to undefined) when the domain has no sender identity", async () => {
      // `objectContaining({ from: undefined })` can't distinguish "key
      // omitted" from "key present as undefined" — both read as `undefined`
      // through property access — which is exactly how a real bug here
      // slipped past this test once already (an explicit `from: undefined`
      // clobbers nodemailerAdapter's own default via its `{ ...message }`
      // spread merge). Assert key presence directly instead.
      const req = makeReq({ page: { ...publishedPage, optInEmail } });
      await handler(req);
      const sent = req.payload.sendEmail.mock.calls[0]![0] as Record<string, unknown>;
      expect("from" in sent).toBe(false);
    });

    it("a sendEmail failure never fails the response — the lead is still created", async () => {
      const req = makeReq({ page: { ...publishedPage, optInEmail } });
      req.payload.sendEmail.mockRejectedValue(new Error("smtp down"));
      const res = await handler(req);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, leadId: 101 });
    });
  });

  it("sets duplicate=true when a prior non-erased lead exists for email+page", async () => {
    const res = await handler(makeReq({ dupeCount: 1 }));
    expect(await res.json()).toMatchObject({ duplicate: true });
  });

  // 003-post-launch-improvements, FR-010/FR-013
  it("includes confirmationPage when the submitted page has one set", async () => {
    const res = await handler(
      makeReq({ page: { ...publishedPage, confirmationPage: { id: 9, path: "/merci" } } }),
    );
    expect(await res.json()).toMatchObject({ confirmationPage: { id: 9, path: "/merci" } });
  });

  it("leaves the thank-you message to the renderer when the page has none of its own (023 US6)", async () => {
    const res = await handler(makeReq({ page: { ...publishedPage, form: { ...publishedPage.form, successMessage: "" } } }));
    expect((await res.json()).successMessage).toBeUndefined();
  });

  it("omits confirmationPage when the submitted page has none set", async () => {
    const res = await handler(makeReq({}));
    const body = await res.json();
    expect(body).not.toHaveProperty("confirmationPage");
  });
});
