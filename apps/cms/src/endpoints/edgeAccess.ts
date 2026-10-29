import { createHash, timingSafeEqual } from "node:crypto";

import type { Endpoint, PayloadRequest } from "payload";

import { writeActivity } from "../lib/activity";
import { activeMemberEmails, normaliseEmails } from "../lib/edge-access";
import { readJson } from "../lib/req";

/**
 * 019-admin-access (contracts/cms-endpoints.md, research R7) — the member list
 * behind the Cloudflare Access allow-list. Called by
 * `infra/cloudflare/apply.sh --sync-members` only, with the shared
 * `EDGE_SYNC_SECRET` in `X-Edge-Sync-Secret` (no user, no API key: the CMS
 * holds no Cloudflare credential and apply.sh no CMS account).
 */

const MAX_EMAILS = 50; // Cloudflare Access Free plan: 50 users

type SecretCheck = "ok" | "unset" | "denied";

const digest = (s: string) => createHash("sha256").update(s).digest();

function checkSecret(req: PayloadRequest): SecretCheck {
  const expected = process.env.EDGE_SYNC_SECRET ?? "";
  if (expected === "") return "unset";
  const given = req.headers.get("x-edge-sync-secret") ?? "";
  // Hash both sides first: same length, so the comparison is constant-time.
  return timingSafeEqual(digest(given), digest(expected)) ? "ok" : "denied";
}

function refusal(check: Exclude<SecretCheck, "ok">): Response {
  return check === "unset"
    ? Response.json({ error: "edge sync not configured" }, { status: 503 })
    : Response.json({ error: "unauthorized" }, { status: 401 });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const edgeAccessListEndpoint: Endpoint = {
  path: "/edge-access",
  method: "get",
  handler: async (req) => {
    const check = checkSecret(req);
    if (check !== "ok") return refusal(check);
    return Response.json({ emails: await activeMemberEmails(req.payload) });
  },
};

export const edgeAccessSyncedEndpoint: Endpoint = {
  path: "/edge-access/synced",
  method: "post",
  handler: async (req) => {
    const check = checkSecret(req);
    if (check !== "ok") return refusal(check);
    const body = await readJson<{ emails?: unknown }>(req);
    const raw = body?.emails;
    if (
      !Array.isArray(raw) ||
      raw.length > MAX_EMAILS ||
      !raw.every((e) => typeof e === "string" && e.length <= 254 && EMAIL.test(e.trim()))
    ) {
      return Response.json({ error: "emails must be a list of e-mail addresses" }, { status: 400 });
    }
    const emails = normaliseEmails(raw as string[]);
    await req.payload.updateGlobal({
      slug: "edge-access",
      data: { emails, syncedAt: new Date().toISOString() },
      overrideAccess: true,
    });
    await writeActivity(req.payload, {
      type: "edge-synced",
      targetType: "edge-access",
      meta: { count: emails.length },
      req,
    });
    return new Response(null, { status: 204 });
  },
};
