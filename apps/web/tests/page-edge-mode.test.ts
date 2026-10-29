import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveDomain, getPublishedPage, getPublishedPageById, pingPageView, isEdgeRender } = vi.hoisted(() => ({
  resolveDomain: vi.fn(),
  getPublishedPage: vi.fn(),
  getPublishedPageById: vi.fn(),
  pingPageView: vi.fn(),
  isEdgeRender: vi.fn(),
}));
vi.mock("../src/lib/domains", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/domains")>("../src/lib/domains");
  return { ...actual, resolveDomain };
});
vi.mock("../src/lib/payload-client", () => ({
  getPublishedPage,
  getPublishedPageById,
  pingPageView,
  getSettings: vi.fn().mockResolvedValue({ cookieBannerTranslations: [] }),
  PayloadUnavailableError: class extends Error {},
  domainFontFiles: () => [],
  getMediaAliases: async () => ({}),
}));
vi.mock("../src/lib/tokens", () => ({ signFormToken: () => "signed-token" }));
vi.mock("../src/lib/code-context", () => ({ codeContext: async () => ({ nonce: "test-nonce" }) }));
vi.mock("../src/lib/edge-mode", () => ({ isEdgeRender }));

const { default: LandingPage } = await import("../src/app/[[...slug]]/page");
const { default: VariantPage } = await import("../src/app/ab-variant/[pageId]/page");

const page = {
  id: 12,
  title: "Offre",
  path: "/",
  builder: { html: '<section data-block="hero"><h1>Hi</h1></section><div data-block="lead-form"></div>', css: "" },
  form: { fields: [], submitLabel: "Envoyer", successMessage: "", consentPurposeText: "", privacyNoticeUrl: "", privacyNoticeVersion: "" },
};

/** LandingPage/VariantPage return <><Tagging /><PageShell /></>: render the PageShell alone. */
async function renderShell(el: Promise<{ props: { children: unknown[] } }>) {
  return renderToStaticMarkup((await el).props.children[1] as Parameters<typeof renderToStaticMarkup>[0]);
}

/**
 * 020-edge-html-cache, contracts/origin-edge-mode.md — an edge render carries
 * the form-token placeholder and does not count the view (the Worker does);
 * a legacy render is unchanged. Both carry the page id meta.
 */
describe.each([
  ["[[...slug]]", () => LandingPage({ params: Promise.resolve({ slug: undefined }) })],
  ["ab-variant/[pageId]", () => VariantPage({ params: Promise.resolve({ pageId: "12" }) })],
])("%s page", (_name, render) => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveDomain.mockResolvedValue({ id: "3", hostname: "site-a.localhost", isActive: true });
    getPublishedPage.mockResolvedValue(page);
    getPublishedPageById.mockResolvedValue(page);
  });

  it("edge render → token placeholder, no view ping, page meta", async () => {
    isEdgeRender.mockResolvedValue(true);
    const html = await renderShell(render() as never);
    expect(html).toContain('value="TFEDGEFT12X"');
    expect(html).not.toContain("signed-token");
    expect(html).toContain('<meta name="tf-page" content="12"/>');
    expect(pingPageView).not.toHaveBeenCalled();
  });

  it("legacy render → signed token, view ping, page meta", async () => {
    isEdgeRender.mockResolvedValue(false);
    const html = await renderShell(render() as never);
    expect(html).toContain('value="signed-token"');
    expect(html).not.toContain("TFEDGEFT");
    expect(html).toContain('<meta name="tf-page" content="12"/>');
    expect(pingPageView).toHaveBeenCalledWith(12);
  });
});
