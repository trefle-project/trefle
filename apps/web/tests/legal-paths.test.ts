import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/payload-client", () => ({ getSettings: vi.fn(), getLegalPage: vi.fn() }));

const { legacyPathTarget } = await import("../src/lib/legal");

/** 023-admin-i18n (US7, T023, contracts/public-paths.md) — the old French paths, one hop. */
describe("legacyPathTarget", () => {
  const owner = { ownPrivacyPolicyUrl: "https://owner.example/privacy", ownLegalNoticeUrl: "https://owner.example/legal" };

  it.each([
    ["/confidentialite", "/privacy"],
    ["/mentions-legales", "/legal-notice"],
    ["/mesure-audience", "/audience-measurement"],
  ] as const)("%s → %s, permanent, query kept", (oldPath, newPath) => {
    expect(legacyPathTarget(oldPath, null, {})).toEqual({ url: newPath, permanent: true });
    expect(legacyPathTarget(oldPath, {}, { lang: "en" })).toEqual({ url: `${newPath}?lang=en`, permanent: true });
    expect(legacyPathTarget(oldPath, null, { lang: "fr-BE", ref: ["a", "b"] })).toEqual({ url: `${newPath}?lang=fr-BE&ref=a&ref=b`, permanent: true });
  });

  it("goes straight to the owner's own page when the domain has one, temporarily, like the new path", () => {
    expect(legacyPathTarget("/confidentialite", owner, { lang: "en" })).toEqual({ url: owner.ownPrivacyPolicyUrl, permanent: false });
    expect(legacyPathTarget("/mentions-legales", owner, {})).toEqual({ url: owner.ownLegalNoticeUrl, permanent: false });
  });

  it("the measurement page has no owner address", () => {
    expect(legacyPathTarget("/mesure-audience", owner, {})).toEqual({ url: "/audience-measurement", permanent: true });
  });
});
