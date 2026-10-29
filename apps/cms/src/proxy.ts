import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ADMIN_LANGUAGE_PATH } from "./endpoints/adminLanguage";
import { DEFAULT_ADMIN_LANGUAGE, isAdminLanguage, type AdminLanguage } from "./lib/admin-locale";

/**
 * 023-admin-i18n (research R2, contracts/admin-language.md) — Payload takes
 * the admin's language from the `payload-lng` cookie (a member's own choice,
 * hooks/users-admin-language.ts), else from Accept-Language. Overwriting
 * Accept-Language with the installation's language means the browser's own
 * never decides: members without a choice, and the login page, get the
 * installation's. Read from Settings on the loopback address (the public
 * host is behind Cloudflare Access), kept CACHE_MS; on failure the last
 * known value, else English.
 */
const CACHE_MS = 30_000;
let cached: { language: AdminLanguage; at: number } | null = null;

export async function installationLanguage(fetcher: typeof fetch = fetch, now = Date.now()): Promise<AdminLanguage> {
  if (cached && now - cached.at < CACHE_MS) return cached.language;
  try {
    const res = await fetcher(`http://127.0.0.1:${process.env.PORT ?? 3000}${ADMIN_LANGUAGE_PATH}`, { cache: "no-store" });
    const body = (await res.json()) as { language?: unknown };
    if (!isAdminLanguage(body.language)) throw new Error("no admin language");
    cached = { language: body.language, at: now };
  } catch {
    cached = { language: cached?.language ?? DEFAULT_ADMIN_LANGUAGE, at: now };
  }
  return cached.language;
}

/** Tests only: forget the cached language. */
export function resetInstallationLanguage(): void {
  cached = null;
}

export async function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  // 019-admin-access — payload-totp's admin provider reads the current path
  // from an `x-pathname` request header to decide whether to send the member
  // to the code-entry or setup view (server components have no pathname). Set
  // on the forwarded request, overwriting anything the browser sent, so a
  // client cannot steer that redirect.
  headers.set("x-pathname", request.nextUrl.pathname);
  if (request.nextUrl.pathname !== ADMIN_LANGUAGE_PATH) headers.set("accept-language", await installationLanguage());
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/:path*"],
};
