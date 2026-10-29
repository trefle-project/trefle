import { permanentRedirect, redirect } from "next/navigation";

import { resolveDomain } from "../lib/domains";
import { legacyPathTarget, type LegacyPublicPath } from "../lib/legal";

/**
 * 023-admin-i18n (US7, contracts/public-paths.md) — an old French path
 * (/confidentialite, /mentions-legales, /mesure-audience): one redirect,
 * query kept, so old links, bookmarks and stored texts keep working.
 */
export async function redirectLegacyPath(oldPath: LegacyPublicPath, searchParams: Promise<Record<string, string | string[] | undefined>>): Promise<never> {
  const domain = await resolveDomain().catch(() => null);
  const target = legacyPathTarget(oldPath, domain, await searchParams);
  if (target.permanent) permanentRedirect(target.url);
  redirect(target.url);
}
