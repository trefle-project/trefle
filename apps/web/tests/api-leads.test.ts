import { createHmac } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const getActiveDomainByHost = vi.fn();
const getPageForSubmission = vi.fn();
const postLeadIntake = vi.fn();
const pingPageView = vi.fn();
class PayloadUnavailableError extends Error {}

vi.mock("../src/lib/payload-client", () => ({
  getActiveDomainByHost,
  getPageForSubmission,
  postLeadIntake,
  pingPageView,
  PayloadUnavailableError,
}));

beforeAll(() => {
  process.env.FORM_TOKEN_SECRET = "test-form";
});

const { POST } = await import("../src/app/api/leads/route");
const { __resetRateLimits } = await import("../src/lib/rate-limit");
const { signFormToken } = await import("../src/lib/tokens");
const { take: takeFormError, __resetFormErrorStore } = await import("../src/lib/form-error-store");

const form = (body: Record<string, string>) =>
  new Request("http://site-a.localhost/api/leads", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", host: "site-a.localhost", referer: "http://site-a.localhost/promo" },
    body: new URLSearchParams(body).toString(),
  });

const goodToken = () => signFormToken("7", Date.now() - 5000);

describe("POST /api/leads (T047)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimits();
    __resetFormErrorStore();
    getActiveDomainByHost.mockResolvedValue({ id: "1", hostname: "site-a.localhost", isActive: true, defaultLanguage: { code: "fr" } });
    getPageForSubmission.mockResolvedValue({
      id: 7,
      status: "published",
      language: { code: "fr" },
      form: { fields: [{ name: "email", label: "Email", type: "email", required: true }], consentPurposeText: "But", privacyNoticeUrl: "/p", privacyNoticeVersion: "1" },
    });
    postLeadIntake.mockResolvedValue({ ok: true, successMessage: "Merci", unsubscribeUrl: "http://site-a.localhost/unsubscribe?token=x" });
  });

  it("403 for an unknown host", async () => {
    getActiveDomainByHost.mockResolvedValueOnce(null);
    const res = await POST(form({ formToken: goodToken(), email: "a@b.com", consent: "on" }));
    expect(res.status).toBe(403);
  });

  it("silently accepts (200) and stores nothing when the honeypot is filled", async () => {
    const res = await POST(form({ formToken: goodToken(), email: "a@b.com", consent: "on", hp_check: "bot" }));
    expect(res.status).toBe(200);
    expect(postLeadIntake).not.toHaveBeenCalled();
  });

  it("422 timing when the form token is too fresh", async () => {
    const res = await POST(form({ formToken: signFormToken("7", Date.now()), email: "a@b.com", consent: "on" }));
    expect(res.status).toBe(422);
  });

  it("429 after the per-IP minute window is exceeded", async () => {
    for (let i = 0; i < 10; i++) await POST(form({ formToken: goodToken(), email: `u${i}@b.com`, consent: "on" }));
    const res = await POST(form({ formToken: goodToken(), email: "u11@b.com", consent: "on" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  // 009-lead-form-error-recovery — a per-field validation failure now
  // redirects to /form-retry with the submitted values + per-field errors
  // stashed in the flash store, instead of returning a generic 422 page.
  const takeFromRedirect = (res: Response) => {
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/form-retry");
    const err = location.searchParams.get("err")!;
    const page = location.searchParams.get("page")!;
    return { location, record: takeFormError(err), page };
  };

  it("redirects to /form-retry with a consent field error, preserving the submitted email", async () => {
    const res = await POST(form({ formToken: goodToken(), email: "a@b.com" }));
    const { record, page } = takeFromRedirect(res);
    expect(page).toBe("7");
    expect(record).toEqual({ pageId: "7", values: { email: "a@b.com" }, fieldErrors: { consent: expect.stringContaining("accepter") } });
  });

  it("redirects to /form-retry with an email field error", async () => {
    const res = await POST(form({ formToken: goodToken(), email: "not-an-email", consent: "on" }));
    const { record } = takeFromRedirect(res);
    expect(record?.fieldErrors).toEqual({ email: "Adresse email invalide." });
    expect(record?.values.email).toBe("not-an-email");
  });

  it("preserves every other field's value when only one required field is missing", async () => {
    getPageForSubmission.mockResolvedValue({
      id: 7,
      status: "published",
      language: { code: "fr" },
      form: {
        fields: [
          { name: "email", label: "Email", type: "email", required: true },
          { name: "firstName", label: "Prénom", type: "text", required: true },
          { name: "message", label: "Message", type: "textarea", required: false },
        ],
        consentPurposeText: "But",
        privacyNoticeUrl: "/p",
        privacyNoticeVersion: "1",
      },
    });
    const res = await POST(form({ formToken: goodToken(), email: "a@b.com", consent: "on", message: "Bonjour" }));
    const { record } = takeFromRedirect(res);
    expect(record?.fieldErrors).toEqual({ firstName: expect.stringContaining("requis") });
    expect(record?.values).toEqual({ email: "a@b.com", firstName: "", message: "Bonjour" });
  });

  describe("tel / number / date / radio formats", () => {
    beforeEach(() => {
      getPageForSubmission.mockResolvedValue({
        id: 7,
        status: "published",
      language: { code: "fr" },
        form: {
          fields: [
            { name: "email", label: "Email", type: "email", required: true },
            { name: "phone", label: "Téléphone", type: "tel", required: false },
            { name: "budget", label: "Budget", type: "number", required: false },
            { name: "when", label: "Date", type: "date", required: false },
            { name: "plan", label: "Offre", type: "radio", required: true, options: [{ label: "A", value: "a" }, { label: "B", value: "b" }] },
          ],
          consentPurposeText: "But",
          privacyNoticeUrl: "/p",
          privacyNoticeVersion: "1",
        },
      });
    });

    it("accepts well-formed values and forwards them to the CMS", async () => {
      const res = await POST(
        form({ formToken: goodToken(), email: "a@b.com", consent: "on", phone: "+33 6 12 34 56 78", budget: "1500,50", when: "2026-10-01", plan: "b" }),
      );
      expect(res.status).toBe(200);
      expect(postLeadIntake).toHaveBeenCalledWith(
        expect.objectContaining({ fieldValues: expect.objectContaining({ phone: "+33 6 12 34 56 78", budget: "1500,50", when: "2026-10-01", plan: "b" }) }),
      );
    });

    it("leaves optional empty fields alone but still requires the radio choice", async () => {
      const res = await POST(form({ formToken: goodToken(), email: "a@b.com", consent: "on" }));
      const { record } = takeFromRedirect(res);
      expect(record?.fieldErrors).toEqual({ plan: expect.stringContaining("requis") });
    });

    it("flags each malformed value on its own field", async () => {
      const res = await POST(
        form({ formToken: goodToken(), email: "a@b.com", consent: "on", phone: "appelez-moi", budget: "beaucoup", when: "2026-02-31", plan: "z" }),
      );
      const { record } = takeFromRedirect(res);
      expect(record?.fieldErrors).toEqual({
        phone: expect.stringContaining("téléphone"),
        budget: expect.stringContaining("nombre"),
        when: expect.stringContaining("date"),
        plan: expect.stringContaining("option"),
      });
    });
  });

  it("a second /form-retry visit with the same token finds nothing (single-use)", async () => {
    const res = await POST(form({ formToken: goodToken(), email: "a@b.com" }));
    const { record, location } = takeFromRedirect(res);
    expect(record).not.toBeNull();
    expect(takeFormError(location.searchParams.get("err")!)).toBeNull();
  });

  it("200 and calls the CMS intake on a valid consented submission", async () => {
    const res = await POST(form({ formToken: goodToken(), email: "jane@example.com", consent: "on" }));
    expect(res.status).toBe(200);
    expect(postLeadIntake).toHaveBeenCalledWith(expect.objectContaining({ pageId: "7", email: "jane@example.com", consent: true }));
    expect(await res.text()).toContain("Merci");
  });

  it("keeps <title> in the <head> when the domain has a GTM container, even for a no-JS browser (regression)", async () => {
    getActiveDomainByHost.mockResolvedValue({
      id: "1",
      hostname: "site-a.localhost",
      defaultLanguage: { code: "fr" },
      isActive: true,
      gtmContainerId: "GTM-ABC1234",
      consentBannerEnabled: true,
    });
    const res = await POST(form({ formToken: goodToken(), email: "jane@example.com", consent: "on" }));
    const html = await res.text();
    expect(html).toContain("googletagmanager.com/ns.html"); // the <noscript><iframe> that used to close <head> early
    // jsdom parses with scripting disabled, exactly like the no-JS browser.
    const { JSDOM } = await import("jsdom");
    const doc = new JSDOM(html).window.document;
    expect(doc.head.querySelector("title")?.textContent).toBe("Merci");
    expect(doc.body.querySelector("title")).toBeNull();
    expect(doc.body.textContent).toContain("Merci");
  });

  it("503 when the CMS stays unavailable through the retry window", async () => {
    postLeadIntake.mockRejectedValue(new PayloadUnavailableError("down"));
    const res = await POST(form({ formToken: goodToken(), email: "jane@example.com", consent: "on" }));
    expect(res.status).toBe(503);
  }, 10_000);

  // 003-post-launch-improvements, FR-001 — X-Real-IP (Caddy-owned) is trusted
  // for rate limiting, never a client-supplied X-Forwarded-For first hop.
  const formWithHeaders = (body: Record<string, string>, headers: Record<string, string>) =>
    new Request("http://site-a.localhost/api/leads", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", host: "site-a.localhost", referer: "http://site-a.localhost/promo", ...headers },
      body: new URLSearchParams(body).toString(),
    });

  it("rate-limits on X-Real-IP even when X-Forwarded-For is spoofed differently on every request", async () => {
    for (let i = 0; i < 10; i++) {
      await POST(
        formWithHeaders(
          { formToken: goodToken(), email: `u${i}@b.com`, consent: "on" },
          { "x-real-ip": "203.0.113.9", "x-forwarded-for": `10.0.0.${i}` },
        ),
      );
    }
    const res = await POST(
      formWithHeaders(
        { formToken: goodToken(), email: "u10@b.com", consent: "on" },
        { "x-real-ip": "203.0.113.9", "x-forwarded-for": "10.0.0.99" },
      ),
    );
    expect(res.status).toBe(429);
  });

  it("does not rate-limit a distinct X-Real-IP sharing the same spoofed X-Forwarded-For", async () => {
    for (let i = 0; i < 10; i++) {
      await POST(
        formWithHeaders(
          { formToken: goodToken(), email: `v${i}@b.com`, consent: "on" },
          { "x-real-ip": "203.0.113.1", "x-forwarded-for": "10.0.0.1" },
        ),
      );
    }
    const res = await POST(
      formWithHeaders(
        { formToken: goodToken(), email: "w0@b.com", consent: "on" },
        { "x-real-ip": "203.0.113.2", "x-forwarded-for": "10.0.0.1" },
      ),
    );
    expect(res.status).toBe(200);
  });

  // 003-post-launch-improvements, FR-002 / 009-lead-form-error-recovery,
  // research.md §3 — this route no longer builds an HTML body for a
  // validation failure at all (it redirects), so there is nothing here for
  // a crafted field label to inject into; the flash record legitimately
  // carries the raw label text, and escaping is JSX's job at render time
  // (see page-shell.test.tsx's "escapes a value/label that looks like
  // markup" case for that guarantee).
  it("carries a crafted field label into the flash record unescaped (escaping happens at render, not here)", async () => {
    getPageForSubmission.mockResolvedValue({
      id: 7,
      status: "published",
      language: { code: "fr" },
      form: {
        fields: [
          { name: "email", label: "Email", type: "email", required: true },
          { name: "evil", label: "<script>alert(1)</script>", type: "text", required: true },
        ],
        consentPurposeText: "But",
        privacyNoticeUrl: "/p",
        privacyNoticeVersion: "1",
      },
    });
    const res = await POST(form({ formToken: goodToken(), email: "a@b.com", consent: "on" }));
    const { record } = takeFromRedirect(res);
    expect(record?.fieldErrors.evil).toContain("<script>alert(1)</script>");
  });

  // 003-post-launch-improvements, FR-010/FR-011/FR-012 — the actual
  // rendering (placeholder substitution, fallback on a since-deleted page)
  // happens in the dedicated /confirmation route (see confirmation/page.test.tsx);
  // this only has to prove the redirect carries the right identity.
  it("redirects to /confirmation with the confirmation page's identity and the unsubscribe link", async () => {
    postLeadIntake.mockResolvedValue({
      ok: true,
      successMessage: "Merci perso",
      unsubscribeUrl: "http://site-a.localhost/unsubscribe?token=abc",
      confirmationPage: { id: "9", path: "/merci" },
    });
    const res = await POST(form({ formToken: goodToken(), email: "jane@example.com", consent: "on" }));
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("http://site-a.localhost");
    expect(location.pathname).toBe("/confirmation");
    expect(location.searchParams.get("domain")).toBe("1");
    expect(location.searchParams.get("path")).toBe("/merci");
    expect(location.searchParams.get("unsub")).toBe("http://site-a.localhost/unsubscribe?token=abc");
    expect(location.searchParams.get("fallback")).toBe("Merci perso");
  });

  // Regression: some deployments (confirmed in the dockerised e2e runner)
  // see a Request whose own .url origin does NOT match the Host header the
  // client actually used (e.g. the server's internal bind address vs. the
  // public/container-network hostname) — building the redirect from req.url
  // produced a Location unreachable by the client that just followed it.
  it("builds the /confirmation redirect from the Host header, not the request's own internal URL", async () => {
    postLeadIntake.mockResolvedValue({ ok: true, confirmationPage: { id: "9", path: "/merci" } });
    const req = new Request("http://127.0.0.1:3001/api/leads", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        host: "site-a.localhost:3001",
        referer: "http://site-a.localhost:3001/promo",
      },
      body: new URLSearchParams({ formToken: goodToken(), email: "jane@example.com", consent: "on" }).toString(),
    });
    const res = await POST(req);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("http://site-a.localhost:3001");
  });

  it("carries the default fallback message when the CMS didn't set a custom one", async () => {
    postLeadIntake.mockResolvedValue({ ok: true, confirmationPage: { id: "9", path: "/merci" } });
    const res = await POST(form({ formToken: goodToken(), email: "jane@example.com", consent: "on" }));
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("fallback")).toBe("Merci, votre demande a bien été enregistrée.");
  });

  it("two submissions with different confirmation pages each redirect with their own identity", async () => {
    postLeadIntake.mockResolvedValueOnce({ ok: true, confirmationPage: { id: "9", path: "/merci-a" } });
    const resA = await POST(form({ formToken: goodToken(), email: "a@example.com", consent: "on" }));
    expect(new URL(resA.headers.get("location")!).searchParams.get("path")).toBe("/merci-a");

    postLeadIntake.mockResolvedValueOnce({ ok: true, confirmationPage: { id: "10", path: "/merci-b" } });
    const resB = await POST(form({ formToken: goodToken(), email: "b@example.com", consent: "on" }));
    expect(new URL(resB.headers.get("location")!).searchParams.get("path")).toBe("/merci-b");
  });

describe("POST /api/leads — 018 A/B attribution (R15: view number from the form token)", () => {
  const VIEW = "AbC-_09xYz1";
  /** A token as the edge Worker signs it: `pageId.issuedAt.<view number>`. */
  const edgeToken = (pageId: string, issuedAt: number, salt: string) => {
    const body = `${pageId}.${issuedAt}.${salt}`;
    const b64 = (b: Buffer) => b.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    return `${b64(Buffer.from(body))}.${b64(createHmac("sha256", "test-form").update(body).digest())}`;
  };
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimits();
    getActiveDomainByHost.mockResolvedValue({ id: "1", hostname: "site-a.localhost", isActive: true, defaultLanguage: { code: "fr" } });
    getPageForSubmission.mockResolvedValue({
      id: 7,
      status: "published",
      language: { code: "fr" },
      form: { fields: [{ name: "email", label: "Email", type: "email", required: true }], consentPurposeText: "But", privacyNoticeUrl: "/p", privacyNoticeVersion: "1" },
    });
    postLeadIntake.mockResolvedValue({ ok: true, successMessage: "Merci", unsubscribeUrl: "http://site-a.localhost/unsubscribe?token=x" });
  });

  it("sends the view number an edge-signed token carries — no cookie needed", async () => {
    await POST(form({ formToken: edgeToken("7", Date.now() - 5000, VIEW), email: "a@b.com", consent: "on" }));
    expect(postLeadIntake).toHaveBeenCalledWith(expect.objectContaining({ pageId: "7", visitorId: VIEW }));
  });

  it("sends none for a renderer-signed token (no view number) or a malformed salt", async () => {
    for (const token of [goodToken(), edgeToken("7", Date.now() - 5000, "not-a-view-number")]) {
      postLeadIntake.mockClear();
      __resetRateLimits();
      await POST(form({ formToken: token, email: "a@b.com", consent: "on" }));
      expect(postLeadIntake.mock.calls[0]?.[0]?.visitorId).toBeUndefined();
    }
  });
});

});

describe("POST /api/leads — the page's language (023 US6)", () => {
  const pageIn = (code: string | undefined) => ({
    id: 7,
    status: "published",
    ...(code ? { language: { code } } : {}),
    form: {
      fields: [
        { name: "email", label: "Email", type: "email", required: true },
        { name: "phone", label: "Phone", type: "tel", required: false },
      ],
      consentPurposeText: "Purpose",
      privacyNoticeUrl: "/p",
      privacyNoticeVersion: "1",
    },
  });
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimits();
    __resetFormErrorStore();
    getActiveDomainByHost.mockResolvedValue({ id: "1", hostname: "site-a.localhost", isActive: true, defaultLanguage: { code: "fr" } });
  });

  it.each([
    ["en", "en"],
    ["es", "en"],
    ["fr", "fr"],
  ])("a %s page's validation messages are in %s, the editor's field label kept, the retry page told the language", async (code, lang) => {
    getPageForSubmission.mockResolvedValue(pageIn(code));
    const res = await POST(form({ formToken: goodToken(), email: "nope", phone: "abc" }));
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("lang")).toBe(lang);
    const record = takeFormError(location.searchParams.get("err")!);
    expect(record?.fieldErrors).toEqual(
      lang === "en"
        ? {
            email: "Invalid email address.",
            phone: "The field “Phone” must be a valid phone number.",
            consent: "You must agree to send the form.",
          }
        : {
            email: "Adresse email invalide.",
            phone: "Le champ « Phone » doit être un numéro de téléphone valide.",
            consent: "Vous devez accepter pour envoyer le formulaire.",
          },
    );
  });

  it("an English page's thank-you page is English and says so; the page's own message keeps priority", async () => {
    getPageForSubmission.mockResolvedValue(pageIn("en"));
    postLeadIntake.mockResolvedValue({ ok: true, unsubscribeUrl: "http://site-a.localhost/unsubscribe?token=x" });
    const html = await (await POST(form({ formToken: goodToken(), email: "a@b.com", consent: "on" }))).text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<title>Thank you</title>");
    expect(html).toContain("<p>Thank you, your request has been received.</p>");
    expect(html).toContain('You can <a href="http://site-a.localhost/unsubscribe?token=x">withdraw your consent</a> at any time.');

    postLeadIntake.mockResolvedValue({ ok: true, successMessage: "Merci beaucoup !" });
    expect(await (await POST(form({ formToken: goodToken(), email: "c@d.com", consent: "on" }))).text()).toContain("<p>Merci beaucoup !</p>");
  });

  it("the confirmation page's fallback is the page's language", async () => {
    getPageForSubmission.mockResolvedValue(pageIn("en"));
    postLeadIntake.mockResolvedValue({ ok: true, confirmationPage: { id: "9", path: "/thanks" } });
    const location = new URL((await POST(form({ formToken: goodToken(), email: "a@b.com", consent: "on" }))).headers.get("location")!);
    expect(location.searchParams.get("fallback")).toBe("Thank you, your request has been received.");
    expect(location.searchParams.get("lang")).toBe("en");
  });

  it("a too-fast submission is refused in its (signed) page's language", async () => {
    getActiveDomainByHost.mockResolvedValueOnce({ id: "1", hostname: "site-a.localhost", isActive: true });
    getPageForSubmission.mockResolvedValue(pageIn("fr"));
    const html = await (await POST(form({ formToken: signFormToken("7", Date.now()), email: "a@b.com", consent: "on" }))).text();
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain("Merci de réessayer dans quelques secondes.");
  });

  it("before the page is known, the domain's default language; an unknown host gets English", async () => {
    getActiveDomainByHost.mockResolvedValueOnce({ id: "1", hostname: "site-a.localhost", isActive: true, defaultLanguage: { code: "en" } });
    const wait = await (await POST(form({ formToken: "bad", email: "a@b.com", consent: "on" }))).text();
    expect(wait).toContain("<title>One moment</title>");
    getActiveDomainByHost.mockResolvedValueOnce(null);
    const unknown = await (await POST(form({ formToken: goodToken(), email: "a@b.com", consent: "on" }))).text();
    expect(unknown).toContain('<html lang="en">');
    expect(unknown).toContain("This site does not accept this form.");
  });
});
