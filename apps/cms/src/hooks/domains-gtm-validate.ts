/**
 * 007-gtm-tagging, FR-001 — `domains.gtmContainerId`'s normalize +
 * field-level validate. Extracted out of `Domains.ts` so it's directly
 * unit-testable, matching `pages-optin-email-validate.ts`'s precedent
 * (006-double-optin-email) for logic living inside a field config.
 */
const GTM_CONTAINER_ID_RE = /^GTM-[A-Z0-9]+$/;

export function normalizeGtmContainerId(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}

export function validateGtmContainerId(value: unknown): string | true {
  if (value === undefined || value === null || value === "") return true;
  return typeof value === "string" && GTM_CONTAINER_ID_RE.test(value)
    ? true
    : "Enter a GTM container id, e.g. GTM-ABC1234.";
}
