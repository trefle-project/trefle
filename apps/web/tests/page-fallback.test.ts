import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveDomain = vi.fn();
vi.mock("../src/lib/domains", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/domains")>("../src/lib/domains");
  return { ...actual, resolveDomain };
});

const getPublishedPage = vi.fn();
const pingPageView = vi.fn();
const getSettings = vi.fn().mockResolvedValue({ cookieBannerTranslations: [] });
class PayloadUnavailableError extends Error {}
// 015 — domain fonts: none for these pages.
vi.mock("../src/lib/payload-client", () => ({ getPublishedPage, pingPageView, getSettings, PayloadUnavailableError, domainFontFiles: () => [], getMediaAliases: async () => ({}) }));

vi.mock("../src/lib/tokens", () => ({ signFormToken: () => "test-token" }));
// 014 — the request nonce comes from `headers()`, unavailable outside a real request.
vi.mock("../src/lib/code-context", () => ({ codeContext: async () => ({ nonce: "test-nonce" }) }));
// 020 — same for the edge-mode flag; legacy mode here.
vi.mock("../src/lib/edge-mode", () => ({ isEdgeRender: async () => false }));

const { default: LandingPage } = await import("../src/app/[[...slug]]/page");

const realPage = { id: "1", title: "Real", path: "/", builder: { html: "<p>real</p>", css: "" }, form: {} };
const fallbackPage = { id: "2", title: "Fallback", path: "/default", builder: { html: "<p>fallback</p>", css: "" }, form: {} };

// 007-gtm-tagging — LandingPage now returns <><Tagging /><PageShell /></>;
// pull PageShell's own props out of the Fragment's children.
function pageShellProps(el: { props: { children: { type: unknown; props: unknown }[] } }) {
  return el.props.children[1]!.props as { page: unknown };
}

/**
 * 003-post-launch-improvements, FR-014/FR-015/FR-017 — a registered, active
 * domain with no page at the requested path falls back to its
 * notFoundPagePath page; a real page always wins; an unregistered host, or a
 * domain with no notFoundPagePath configured, is unaffected.
 */
describe("[[...slug]]/page.tsx domain fallback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("falls back to notFoundPagePath when nothing is at the requested path", async () => {
    resolveDomain.mockResolvedValue({ id: "1", hostname: "site-a.localhost", isActive: true, notFoundPagePath: "/default" });
    getPublishedPage.mockImplementation(async (_domainId: string, path: string) => (path === "/default" ? fallbackPage : null));

    const el = await LandingPage({ params: Promise.resolve({ slug: undefined }) });
    expect(getPublishedPage).toHaveBeenCalledWith("1", "/");
    expect(getPublishedPage).toHaveBeenCalledWith("1", "/default");
    expect(pageShellProps(el).page).toBe(fallbackPage);
  });

  it("a real page at the requested path always wins — fallback never consulted", async () => {
    resolveDomain.mockResolvedValue({ id: "1", hostname: "site-a.localhost", isActive: true, notFoundPagePath: "/default" });
    getPublishedPage.mockImplementation(async (_domainId: string, path: string) =>
      path === "/" ? realPage : path === "/default" ? fallbackPage : null,
    );

    const el = await LandingPage({ params: Promise.resolve({ slug: undefined }) });
    expect(pageShellProps(el).page).toBe(realPage);
    expect(getPublishedPage).toHaveBeenCalledTimes(1);
    expect(getPublishedPage).not.toHaveBeenCalledWith("1", "/default");
  });

  it("behaves exactly as today (404) when notFoundPagePath is unset", async () => {
    resolveDomain.mockResolvedValue({ id: "1", hostname: "site-a.localhost", isActive: true, notFoundPagePath: null });
    getPublishedPage.mockResolvedValue(null);

    await expect(LandingPage({ params: Promise.resolve({ slug: undefined }) })).rejects.toThrow();
    expect(getPublishedPage).toHaveBeenCalledTimes(1);
  });

  it("still 404s when the domain is unregistered/inactive, regardless of any notFoundPagePath", async () => {
    resolveDomain.mockResolvedValue(null);

    await expect(LandingPage({ params: Promise.resolve({ slug: undefined }) })).rejects.toThrow();
    expect(getPublishedPage).not.toHaveBeenCalled();
  });
});
