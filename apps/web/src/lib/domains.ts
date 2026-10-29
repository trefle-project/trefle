import { headers } from "next/headers";

import { getActiveDomainByHost, type Domain } from "./payload-client";

/** Bare hostname from the request Host header, lowercased, port stripped. */
export async function requestHostname(): Promise<string> {
  const h = await headers();
  const raw = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return raw.split(",")[0]!.trim().toLowerCase().replace(/:\d+$/, "");
}

/** Resolve the current request's Host to an active domain, or null. */
export async function resolveDomain(): Promise<Domain | null> {
  const host = await requestHostname();
  if (!host) return null;
  return getActiveDomainByHost(host);
}

/** `/a/b` from a catch-all slug; `/` when empty. */
export function pathFromSlug(slug: string[] | undefined): string {
  const joined = (slug ?? []).join("/");
  return joined ? `/${joined}` : "/";
}
