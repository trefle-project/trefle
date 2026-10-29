import { LEGACY_PUBLIC_PATHS, LEGAL_NOTICE_PAGE_PATH, MEASUREMENT_PAGE_PATH, PRIVACY_PAGE_PATH } from "@trefle/shared";

/**
 * `pages.path`'s field-level validate. Extracted out of `Pages.ts` so it's
 * directly unit-testable (see `pages-optin-email-validate.ts` for the same
 * reasoning).
 *
 * apps/web/src/app/(confirmation)/confirmation/page.tsx is a literal, static
 * route for exactly "/confirmation" — Next.js always resolves it ahead of
 * the catch-all `[[...slug]]` route that serves ordinary published pages. A
 * page saved with that same path would therefore never actually render on
 * direct navigation: visitors always get that route's generic fallback text
 * instead, no matter what is published, which looks indistinguishable from a
 * stale cache. Block it here so the editor gets the real explanation
 * immediately, at save time — runs after the field's `beforeValidate` hook
 * has already normalised a leading slash.
 */
export function validatePagePath(value: unknown): string | true {
  if (typeof value !== "string") return true;
  const normalized = value.trim().replace(/\/+$/, "");
  if (normalized === "/confirmation") {
    return '"/confirmation" is reserved by the post-submission redirect route and can never be reached directly — pick another path for this page (e.g. /merci).';
  }
  // 021-legal-pages — the legal pages every domain serves.
  if (normalized === PRIVACY_PAGE_PATH || normalized === LEGAL_NOTICE_PAGE_PATH) {
    return `"${normalized}" is reserved for the legal page every site serves — pick another path for this page.`;
  }
  // 023-admin-i18n (US7) — the French paths of before 023, which redirect.
  if (Object.hasOwn(LEGACY_PUBLIC_PATHS, normalized)) {
    const target = LEGACY_PUBLIC_PATHS[normalized as keyof typeof LEGACY_PUBLIC_PATHS];
    return `"${normalized}" is reserved: every site redirects it to ${target} — pick another path for this page.`;
  }
  // 018-ab-significance — the audience-measurement page, served on every domain.
  if (normalized === MEASUREMENT_PAGE_PATH) {
    return `"${MEASUREMENT_PAGE_PATH}" is reserved for the audience-measurement page every site serves — pick another path for this page.`;
  }
  return true;
}
