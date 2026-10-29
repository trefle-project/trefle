import type { CookieBannerTranslation } from "./payload-client";

/**
 * 007-gtm-tagging, FR-014 — picks the consent-banner copy row for a resolved
 * language code, falling back to French, then to `null` (only reachable if
 * `settings.cookieBannerTranslations` has no French row at all — guarded
 * against at save time by `requireFrenchBannerTranslation`, apps/cms).
 */
export function resolveBannerCopy(
  languageCode: string,
  translations: CookieBannerTranslation[],
): CookieBannerTranslation | null {
  return (
    translations.find((t) => t.language.code === languageCode) ??
    translations.find((t) => t.language.code === "fr") ??
    null
  );
}
