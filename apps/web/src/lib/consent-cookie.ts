import { CONSENT_COOKIE_NAME } from "@trefle/shared";

/**
 * 007-gtm-tagging, FR-006/FR-009, research.md §9 — the visitor's
 * cookie-consent choice, stored as one plain first-party cookie. No
 * `Domain=` attribute is ever set, so the browser scopes it to the exact
 * host that set it — FR-009's per-domain isolation falls out of that for
 * free. The 6-month `Max-Age` (FR-006) is the sole expiry mechanism: once
 * the browser stops sending the cookie back, treat the choice as unmade
 * again — no separate expiry check is needed in `parseConsentCookie`.
 */
export { CONSENT_COOKIE_NAME };
const SIX_MONTHS_SECONDS = 60 * 60 * 24 * 30 * 6;

export type ConsentChoice = "accepted" | "rejected";

export function serializeConsentCookie(choice: ConsentChoice): string {
  const value = encodeURIComponent(`${choice}|${new Date().toISOString()}`);
  return `${CONSENT_COOKIE_NAME}=${value}; Max-Age=${SIX_MONTHS_SECONDS}; Path=/; SameSite=Lax`;
}

export function parseConsentCookie(
  cookieHeader: string | null | undefined,
): { choice: ConsentChoice; decidedAt: string } | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CONSENT_COOKIE_NAME}=`));
  if (!match) return null;

  const raw = decodeURIComponent(match.slice(CONSENT_COOKIE_NAME.length + 1));
  const [choice, decidedAt] = raw.split("|");
  if (choice !== "accepted" && choice !== "rejected") return null;
  if (!decidedAt) return null;
  return { choice, decidedAt };
}
