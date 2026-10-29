import type { Payload } from "payload";

/**
 * 019-admin-access (data-model, research R7) — the Cloudflare Access
 * allow-list as the CMS sees it: who should be on it (the active members) and
 * how far the list apply.sh last applied is from that.
 */

/** Lower-cased, de-duplicated, sorted. */
export const normaliseEmails = (emails: string[]): string[] =>
  [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))].sort();

/** Active human members' e-mail addresses (service account and deactivated members left out). */
export async function activeMemberEmails(payload: Payload): Promise<string[]> {
  const res = await payload.find({
    collection: "users",
    where: { and: [{ isService: { not_equals: true } }, { isActive: { not_equals: false } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  return normaliseEmails(res.docs.map((u) => String((u as { email?: string }).email ?? "")));
}

export type EdgeDrift =
  | { state: "never-synced" }
  | { state: "in-step" }
  | { state: "drift"; toAdd: string[]; toRemove: string[] };

/**
 * `toAdd = active − synced`, `toRemove = synced − active`, case-insensitive.
 * `synced` null = apply.sh never reported a list.
 */
export function computeDrift(active: string[], synced: string[] | null | undefined): EdgeDrift {
  if (synced == null) return { state: "never-synced" };
  const a = normaliseEmails(active);
  const s = normaliseEmails(synced);
  const toAdd = a.filter((e) => !s.includes(e));
  const toRemove = s.filter((e) => !a.includes(e));
  return toAdd.length || toRemove.length ? { state: "drift", toAdd, toRemove } : { state: "in-step" };
}
