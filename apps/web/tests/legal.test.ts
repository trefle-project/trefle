import { beforeEach, describe, expect, it, vi } from "vitest";

const getSettings = vi.fn();
const getLegalPage = vi.fn();
vi.mock("../src/lib/payload-client", () => ({ getSettings, getLegalPage }));

const { consentPolicy, legalHref, legalLinks } = await import("../src/lib/legal");

/** 021-legal-pages (contracts/renderer.md, T011) — legal links and the consent's policy. */
beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockResolvedValue({
    cookieBannerTranslations: [],
    legalTexts: [
      { language: { code: "fr" }, policyLinkLabel: "Confidentialité", noticeLinkLabel: "Mentions légales" },
      { language: { code: "en" }, policyLinkLabel: "Privacy policy", noticeLinkLabel: "Legal notice" },
    ],
  });
  getLegalPage.mockResolvedValue({ version: "abc123def456" });
});

describe("legalLinks", () => {
  it("links the generated pages with the page language and its labels", async () => {
    expect(await legalLinks({}, "en")).toEqual({
      policyHref: "/privacy?lang=en",
      noticeHref: "/legal-notice?lang=en",
      policyLabel: "Privacy policy",
      noticeLabel: "Legal notice",
      language: "en",
    });
  });

  it("falls back to the French labels, and to bare paths without a page language", async () => {
    expect(await legalLinks({}, "es")).toMatchObject({ policyLabel: "Confidentialité", policyHref: "/privacy?lang=es" });
    expect(await legalLinks(null, undefined)).toMatchObject({ policyHref: "/privacy", noticeHref: "/legal-notice", language: "fr" });
  });

  it("uses the domain's own pages when it has them", async () => {
    const links = await legalLinks({ ownPrivacyPolicyUrl: "https://owner.example/p", ownLegalNoticeUrl: "https://owner.example/n" }, "fr");
    expect(links).toMatchObject({ policyHref: "https://owner.example/p", noticeHref: "https://owner.example/n" });
  });

  it("still links with default labels when the settings cannot be read", async () => {
    getSettings.mockRejectedValueOnce(new Error("down"));
    expect(await legalLinks({}, "fr")).toMatchObject({ policyLabel: "Confidentialité", noticeLabel: "Mentions légales" });
  });

  it("legalHref encodes the language", () => {
    expect(legalHref("/privacy", "fr-BE")).toBe("/privacy?lang=fr-BE");
  });
});

describe("consentPolicy", () => {
  const domain = { id: "3" };
  it("keeps a form's own link and version", async () => {
    expect(await consentPolicy(domain, { privacyNoticeUrl: "https://x.example/p", privacyNoticeVersion: "v2" }, "fr", "https://site.example")).toEqual({
      url: "https://x.example/p",
      version: "v2",
    });
    expect(getLegalPage).not.toHaveBeenCalled();
  });

  it("else the domain's own policy, else the generated one in the page language, with its current version", async () => {
    expect(await consentPolicy({ ...domain, ownPrivacyPolicyUrl: "https://owner.example/p" }, {}, "fr", "https://site.example")).toEqual({
      url: "https://owner.example/p",
      version: "abc123def456",
    });
    expect(await consentPolicy(domain, { privacyNoticeUrl: "" }, "en", "https://site.example")).toEqual({
      url: "https://site.example/privacy?lang=en",
      version: "abc123def456",
    });
    expect(getLegalPage).toHaveBeenLastCalledWith("privacy", "3", "en");
  });

  it("never fails the lead: an unreadable version is « indisponible »", async () => {
    getLegalPage.mockRejectedValueOnce(new Error("down"));
    expect(await consentPolicy(domain, null, "fr", "https://site.example")).toEqual({ url: "https://site.example/privacy?lang=fr", version: "indisponible" });
  });
});
