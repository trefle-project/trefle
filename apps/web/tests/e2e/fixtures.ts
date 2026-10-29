import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Shared inputs the e2e specs need, produced once by `global-setup.ts`.
 *
 * Resolution order for each value: explicit env var → the fixture file written
 * by global-setup → a sensible default (or `test.skip` in the spec if there is
 * none). This keeps a bare `playwright test` working when the stack is already
 * seeded, and a fully hands-off `npm run test:e2e:local` working from cold.
 */
// Playwright transpiles these as CJS (no "type":"module"), so __dirname is safe
// and stable regardless of the invoking cwd.
export const FIXTURE_FILE = join(__dirname, ".artifacts", "fixtures.json");

interface Fixtures {
  pageUrl?: string;
  unsubUrl?: string;
  siteHost?: string;
  adminToken?: string;
}

// Re-read on every call — global-setup writes this after the module first loads.
function fromFile(): Fixtures {
  try {
    if (existsSync(FIXTURE_FILE)) return JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as Fixtures;
  } catch {
    /* ignore — treat as absent */
  }
  return {};
}

/** URL of a published page carrying the single lead-form block. */
export function pageUrl(): string {
  return (
    process.env.E2E_PAGE_URL ??
    fromFile().pageUrl ??
    `${process.env.E2E_BASE_URL ?? "http://site-a.localhost:3001"}/promo`
  );
}

/** A real unsubscribe link for a captured lead, or undefined (spec should skip). */
export function unsubUrl(): string | undefined {
  return process.env.E2E_UNSUB_URL ?? fromFile().unsubUrl;
}

/** The Host header value the renderer expects for the published page. */
export function siteHost(): string {
  return process.env.E2E_SITE_HOST ?? fromFile().siteHost ?? "site-a.localhost";
}

/**
 * A client address of its own for one lead submission. The lead API
 * rate-limits per X-Real-IP (10/min, 100/day — src/lib/rate-limit.ts), and
 * with no proxy in front every browser-driven spec otherwise shares one
 * address: a single full run sits close to the per-minute cap, so reruns
 * (or a new submitting spec) tipped unrelated tests into "Trop de
 * tentatives". Addresses come from 198.51.100.0/24 (RFC 5737, never
 * routed); a rare collision only shares a bucket between two submissions.
 */
export function testClientIp(): string {
  return `198.51.100.${1 + Math.floor(Math.random() * 254)}`;
}

/**
 * The admin JWT global-setup obtained with its single login. Spec files must
 * use this instead of logging in themselves: Payload 3.x records a session
 * per login on the user document, and concurrent logins of the same account
 * from parallel spec files race on that record — the loser's token is then
 * rejected (403 "You are not allowed to perform this action"), which made
 * whichever spec lost fail at random. Falls back to one login of its own
 * only when global-setup couldn't provide a token (bare runs).
 */
export async function adminToken(): Promise<string | undefined> {
  const cached = process.env.E2E_ADMIN_TOKEN ?? fromFile().adminToken;
  if (cached) return cached;
  const res = await fetch(`${process.env.CMS_API_URL ?? "http://localhost:3000/api"}/users/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: process.env.E2E_ADMIN_EMAIL ?? "admin@trefle.localhost",
      password: process.env.E2E_ADMIN_PASSWORD ?? "trefle-dev-123",
    }),
  });
  if (!res.ok) return undefined;
  return ((await res.json()) as { token?: string }).token;
}
