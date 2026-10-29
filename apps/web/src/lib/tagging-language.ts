/**
 * 007-gtm-tagging, FR-014, research.md §3/§6 — resolves which language the
 * consent banner is shown in: the viewed page's own language first, falling
 * back to the domain's default, falling back to French.
 */
export function resolveBannerLanguage({
  pageLanguage,
  domainDefaultLanguage,
}: {
  pageLanguage?: string;
  domainDefaultLanguage?: string;
}): string {
  return pageLanguage ?? domainDefaultLanguage ?? "fr";
}
