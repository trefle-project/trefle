import { LEGACY_PUBLIC_PATHS, LEGAL_NOTICE_PAGE_PATH, PRIVACY_PAGE_PATH } from "@trefle/shared";

import { getLegalPage, getSettings, type Domain } from "./payload-client";

/**
 * 021-legal-pages (contracts/renderer.md, research R6–R7) — where a page's
 * legal links go and what they say, in the page's language: the domain's own
 * pages when it has them, else Trefle's `/privacy` and `/legal-notice` with
 * the page language (the legal page then answers in
 * it when a text exists, research R4).
 */
export type LegalLinks = { policyHref: string; noticeHref: string; policyLabel: string; noticeLabel: string; language: string };

const DEFAULT_LABELS = { policy: "Confidentialité", notice: "Mentions légales" };

const codeOf = (language: unknown): string | null =>
  language && typeof language === "object" && "code" in language ? String((language as { code: unknown }).code) : null;

export function legalHref(path: typeof PRIVACY_PAGE_PATH | typeof LEGAL_NOTICE_PAGE_PATH, language?: string | null): string {
  return language ? `${path}?lang=${encodeURIComponent(language)}` : path;
}

export async function legalLinks(domain: Pick<Domain, "ownPrivacyPolicyUrl" | "ownLegalNoticeUrl"> | null | undefined, language?: string | null): Promise<LegalLinks> {
  const settings = await getSettings().catch(() => ({ legalTexts: [] as never[] }));
  const rows = settings.legalTexts ?? [];
  const row = rows.find((r) => codeOf(r.language) === language) ?? rows.find((r) => codeOf(r.language) === "fr");
  return {
    policyHref: domain?.ownPrivacyPolicyUrl || legalHref(PRIVACY_PAGE_PATH, language),
    noticeHref: domain?.ownLegalNoticeUrl || legalHref(LEGAL_NOTICE_PAGE_PATH, language),
    policyLabel: row?.policyLinkLabel || DEFAULT_LABELS.policy,
    noticeLabel: row?.noticeLinkLabel || DEFAULT_LABELS.notice,
    language: language || "fr",
  };
}

/**
 * 021-legal-pages (research R6, contracts/renderer.md) — the privacy policy a
 * lead's consent refers to: the form's own link (with its own version) when it
 * has one, else the domain's own policy, else the domain's generated policy in
 * the page's language with its current version. Never throws: a version that
 * cannot be read is stored as « indisponible », the lead is never refused.
 */
export async function consentPolicy(
  domain: Pick<Domain, "id" | "ownPrivacyPolicyUrl">,
  form: { privacyNoticeUrl?: string | null; privacyNoticeVersion?: string | null } | null | undefined,
  pageLanguage: string | null | undefined,
  origin: string,
): Promise<{ url: string; version: string }> {
  if (form?.privacyNoticeUrl) return { url: form.privacyNoticeUrl, version: form.privacyNoticeVersion ?? "" };
  const url = domain.ownPrivacyPolicyUrl || new URL(legalHref(PRIVACY_PAGE_PATH, pageLanguage), origin).toString();
  try {
    const page = await getLegalPage("privacy", domain.id, pageLanguage);
    return { url, version: page.version };
  } catch {
    return { url, version: "indisponible" };
  }
}

export type LegacyPublicPath = keyof typeof LEGACY_PUBLIC_PATHS;
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * 023-admin-i18n (US7, contracts/public-paths.md) — where an old French path
 * sends the visitor, in one hop: the domain owner's own page when it has one
 * (temporary, like the new path's own redirect: the owner may change it),
 * else the new path with the same query (permanent).
 */
export function legacyPathTarget(
  oldPath: LegacyPublicPath,
  domain: Pick<Domain, "ownPrivacyPolicyUrl" | "ownLegalNoticeUrl"> | null | undefined,
  searchParams: SearchParams,
): { url: string; permanent: boolean } {
  const own = oldPath === "/confidentialite" ? domain?.ownPrivacyPolicyUrl : oldPath === "/mentions-legales" ? domain?.ownLegalNoticeUrl : null;
  if (own) return { url: own, permanent: false };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
  }
  const search = query.toString();
  return { url: search ? `${LEGACY_PUBLIC_PATHS[oldPath]}?${search}` : LEGACY_PUBLIC_PATHS[oldPath], permanent: true };
}
