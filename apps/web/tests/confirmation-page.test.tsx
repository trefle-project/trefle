import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const getPublishedPage = vi.fn();
class PayloadUnavailableError extends Error {}

// 015 — domain fonts: none for this page.
vi.mock("../src/lib/payload-client", () => ({
  getPublishedPage,
  PayloadUnavailableError,
  getDomainFonts: async () => [],
  getMediaAliases: async () => ({}),
  // 021 — the footer's labels.
  getSettings: async () => ({ cookieBannerTranslations: [], legalTexts: [] }),
}));
vi.mock("../src/lib/tokens", () => ({ signFormToken: () => "test-token" }));
// 014 — the request nonce comes from `headers()`, unavailable outside a real request.
vi.mock("../src/lib/code-context", () => ({ codeContext: async () => ({ nonce: "test-nonce" }) }));

const { default: ConfirmationPage } = await import("../src/app/(confirmation)/confirmation/page");

const confirmationPage = {
  id: "9",
  title: "Confirmation",
  path: "/merci",
  builder: { html: `<section data-block="rich-text"><p>Merci ! Lien : {{unsubscribeUrl}}</p></section>`, css: "" },
  form: { fields: [], submitLabel: "", successMessage: "", consentPurposeText: "", privacyNoticeUrl: "", privacyNoticeVersion: "" },
};

/**
 * 003-post-launch-improvements, FR-010/FR-011/FR-013 — the /confirmation
 * route is the Server Component that actually renders a landing page's
 * selected confirmation page (POST /api/leads only redirects here; see
 * api-leads.test.ts for the redirect itself).
 */
describe("/confirmation route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves the confirmation page and substitutes the unsubscribe placeholder", async () => {
    getPublishedPage.mockResolvedValue(confirmationPage);
    const el = await ConfirmationPage({
      searchParams: Promise.resolve({ domain: "1", path: "/merci", unsub: "http://site-a.localhost/unsubscribe?token=abc" }),
    });
    expect(getPublishedPage).toHaveBeenCalledWith("1", "/merci");
    const html = renderToStaticMarkup(el);
    expect(html).toContain("http://site-a.localhost/unsubscribe?token=abc");
    expect(html).not.toContain("{{unsubscribeUrl}}");
    // 021 — the legal footer line, French labels by default.
    expect(html).toMatch(/<footer class="trefle-legal-footer"[^>]*><a href="\/legal-notice">Mentions légales<\/a>.*<a href="\/privacy">Confidentialité<\/a><\/footer>/);
  });

  it("falls back to the generic message when the page can no longer be resolved", async () => {
    getPublishedPage.mockResolvedValue(null);
    const el = await ConfirmationPage({
      searchParams: Promise.resolve({ domain: "1", path: "/merci", fallback: "Message générique" }),
    });
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Message générique");
  });

  it("falls back to the generic message when domain/path are missing", async () => {
    const el = await ConfirmationPage({ searchParams: Promise.resolve({ fallback: "Message générique" }) });
    expect(getPublishedPage).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Message générique");
  });

  it("falls back to the generic message when the content backend is unavailable", async () => {
    getPublishedPage.mockRejectedValue(new PayloadUnavailableError("down"));
    const el = await ConfirmationPage({
      searchParams: Promise.resolve({ domain: "1", path: "/merci", fallback: "Message générique" }),
    });
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Message générique");
  });
});
