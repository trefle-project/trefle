import type { PayloadRequest } from "payload";

/**
 * 006-double-optin-email, FR-004, research.md §4 — `pages.optInEmail`'s
 * field-level validate. Extracted out of `Pages.ts` so it's directly
 * unit-testable (same reasoning `pageWizardStash.ts`'s
 * `stashToFieldUpdates`/`shouldRedirectToWizard` were pulled out of
 * `PageWizardBootstrap.tsx` in 004-page-types: business logic living
 * inside a field/component config still needs its own test).
 *
 * `filterOptions` on the field scopes the admin picker to the page's own
 * language already, so this async check is normally unreachable through
 * the UI — it's the real, API-level enforcement.
 */
export async function validateOptInEmailLanguage(
  value: unknown,
  { req, siblingData }: { req: PayloadRequest; siblingData: unknown },
): Promise<string | true> {
  if (!value) return true;
  const pageLanguage = (siblingData as { language?: unknown })?.language;
  if (!pageLanguage) return true; // language itself is separately required — don't double-report here

  const emailId = typeof value === "object" ? (value as { id: unknown }).id : value;
  const email = await req.payload
    .findByID({ collection: "opt-in-emails", id: emailId as string | number, depth: 0, overrideAccess: true })
    .catch(() => null);
  if (!email) return true; // an unresolvable id is its own (relationship-level) problem, not this check's

  const emailLanguageId = typeof email.language === "object" ? (email.language as { id: unknown })?.id : email.language;
  const pageLanguageId = typeof pageLanguage === "object" ? (pageLanguage as { id: unknown })?.id : pageLanguage;
  return String(emailLanguageId) === String(pageLanguageId) ? true : "This opt-in email's language doesn't match the page's language.";
}
