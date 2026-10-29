import { createHmac } from "node:crypto";

import type { Endpoint } from "payload";
import { isViewNumber } from "@trefle/shared";

import { attributeLead } from "../lib/ab-tests";
import { incrementPageStat } from "../lib/page-stats";
import { log } from "../lib/log";
import { readJson } from "../lib/req";
import { isServiceOrAdmin } from "../access";

/**
 * POST /api/lead-intake (T040) — see contracts/payload-collections.md §B.
 * Called by the renderer with the `service` API key. Persists a lead + its
 * immutable consent record + the submission counter. Consent records can never
 * be skipped: this endpoint is the only writer of `leads`.
 */

const b64url = (b: Buffer): string =>
  b.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");

// The renderer (`apps/web`) is host-routed — in prod it sits behind Caddy on
// 80/443, so a bare `scheme://host` is correct. In dev it's reached directly
// on :3001 (no port-80 proxy in front, per infra/docker-compose.override.yml),
// so a link built without a port is unreachable — the same "Lien public"
// problem `PublishedUrl.tsx`/`PageLiveUrl.tsx` already solve with
// `PUBLIC_SITE_PORT`, reused here instead of a second, port-less mechanism.
const publicSiteOrigin = (domainHostname: string): string => {
  const scheme = domainHostname.endsWith(".localhost") ? "http" : "https";
  const port = process.env.PUBLIC_SITE_PORT;
  return `${scheme}://${domainHostname}${port ? `:${port}` : ""}`;
};

function unsubscribeUrl(leadId: string, domainHostname: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error("UNSUBSCRIBE_SECRET is required to build the unsubscribe link");
  const sig = b64url(createHmac("sha256", secret).update(leadId).digest());
  const token = `${b64url(Buffer.from(leadId))}.${sig}`;
  return `${publicSiteOrigin(domainHostname)}/unsubscribe?token=${encodeURIComponent(token)}`;
}

// 006-double-optin-email, research.md §6 — same shape as unsubscribeUrl()
// above, own inline HMAC (no cross-app import — apps/cms and apps/web are
// separate workspaces), signed with CONFIRM_TOKEN_SECRET instead.
function confirmUrl(leadId: string, domainHostname: string): string {
  const secret = process.env.CONFIRM_TOKEN_SECRET;
  if (!secret) throw new Error("CONFIRM_TOKEN_SECRET is required to build the opt-in confirmation link");
  const sig = b64url(createHmac("sha256", secret).update(leadId).digest());
  const token = `${b64url(Buffer.from(leadId))}.${sig}`;
  return `${publicSiteOrigin(domainHostname)}/confirm?token=${encodeURIComponent(token)}`;
}

export const leadIntakeEndpoint: Endpoint = {
  path: "/lead-intake",
  method: "post",
  handler: async (req) => {
    if (!isServiceOrAdmin({ req } as never)) {
      return Response.json({ ok: false, code: "forbidden" }, { status: 403 });
    }
    const body = await readJson<{
      pageId?: string | number;
      email?: string;
      fieldValues?: Record<string, unknown>;
      consent?: unknown;
      consentContext?: Record<string, unknown>;
      metadata?: { pageUrl?: string; referrer?: string; utm?: Record<string, unknown>; userAgent?: string };
      /** 018-ab-significance (R15) — the view number of the edge-signed form token. */
      visitorId?: string;
    }>(req);

    if (!body?.pageId || !body.email) {
      return Response.json({ ok: false, code: "validation", errors: [{ field: "pageId|email" }] }, { status: 422 });
    }
    if (body.consent !== true) {
      return Response.json({ ok: false, code: "consent_required", field: "consent" }, { status: 422 });
    }

    const { payload } = req;
    const pageId = typeof body.pageId === "number" ? body.pageId : Number(body.pageId);
    const page = await payload
      .findByID({ collection: "pages", id: pageId, depth: 1, overrideAccess: true })
      .catch(() => null);
    if (!page) return Response.json({ ok: false, code: "not_found" }, { status: 404 });
    if (page.status !== "published") {
      return Response.json({ ok: false, code: "unpublished" }, { status: 409 });
    }

    const form = (page.form ?? {}) as {
      fields?: { name: string; required?: boolean; type?: string }[];
      successMessage?: string;
      consentPurposeText?: string;
      privacyNoticeUrl?: string;
      privacyNoticeVersion?: string;
    };
    const missing = (form.fields ?? [])
      .filter((f) => f.required && f.type !== "email")
      .filter((f) => body.fieldValues?.[f.name] == null || body.fieldValues[f.name] === "")
      .map((f) => ({ field: f.name, code: "required" }));
    if (missing.length) {
      return Response.json({ ok: false, code: "validation", errors: missing }, { status: 422 });
    }

    const domainHostname =
      (typeof page.domain === "object" && (page.domain as { hostname?: string })?.hostname) || req.headers.get("host") || "localhost";

    const dupe = await payload.find({
      collection: "leads",
      where: {
        and: [
          { page: { equals: pageId } },
          { email: { equals: body.email } },
          { erasedAt: { equals: null } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    const now = new Date().toISOString();
    const ctx = body.consentContext ?? {};

    // 005-content-language-tagging, FR-007/FR-008 (contracts/lead-language-capture.md)
    // — `page` is already fetched at depth: 1 above, so `page.language`
    // resolves to the full `languages` document, not just its id. `pages.language`
    // is itself `required: true`, so the `"fr"` fallback below is defensive
    // only — unreachable in practice, kept solely to satisfy `leads.language`
    // (also `required: true`) with a concrete string for TypeScript.
    const languageCode = typeof page.language === "object" && page.language ? page.language.code : "fr";

    const lead = await payload.create({
      collection: "leads",
      overrideAccess: true,
      data: {
        page: pageId,
        domainHostname,
        language: languageCode,
        email: body.email,
        fieldValues: body.fieldValues ?? {},
        metadata: {
          pageUrl: body.metadata?.pageUrl,
          referrer: body.metadata?.referrer,
          utm: body.metadata?.utm,
          userAgent: body.metadata?.userAgent,
        },
        consentStatus: "consented",
        isDuplicate: dupe.totalDocs > 0,
        submittedAt: now,
      },
    });

    const consent = await payload.create({
      collection: "consent-records",
      overrideAccess: true,
      data: {
        lead: lead.id,
        email: body.email,
        consentText: String(ctx.consentText ?? ""),
        purposeText: String(ctx.purposeText ?? form.consentPurposeText ?? ""),
        privacyNoticeUrl: String(ctx.privacyNoticeUrl ?? form.privacyNoticeUrl ?? ""),
        privacyNoticeVersion: String(ctx.privacyNoticeVersion ?? form.privacyNoticeVersion ?? ""),
        capturedAt: String(ctx.capturedAt ?? now),
        ipAddress: ctx.ipAddress ? String(ctx.ipAddress) : undefined,
        userAgent: ctx.userAgent ? String(ctx.userAgent) : body.metadata?.userAgent,
        pageSnapshotRef: `${page.id}`,
      },
    });

    await payload.update({
      collection: "leads",
      id: lead.id,
      data: { consentRecord: consent.id },
      overrideAccess: true,
    });

    try {
      await incrementPageStat(payload, pageId, "submissions");
    } catch (err) {
      log.warn("page-stats submission increment failed", { err: String(err) });
    }

    // 018-ab-significance, FR-003 — the lead's own page is the variant shown.
    // Never throws: the lead stands whatever happens here.
    if (isViewNumber(body.visitorId)) {
      await attributeLead(payload, { id: lead.id, submittedAt: now }, page as never, body.visitorId);
    }

    // 006-double-optin-email, US3 (contracts/optin-email-send.md, FR-005/FR-006/FR-008)
    // — `page.optInEmail` is already resolved at depth: 1. A send failure is
    // only logged: it must never fail or delay the response below (usersSendInvite's
    // exact "never throws into the create" discipline, research.md §5).
    const optInEmail = page.optInEmail as { subject?: string; body?: string } | null | undefined;
    if (optInEmail?.subject && optInEmail.body) {
      const domain = page.domain as { senderName?: string; senderEmail?: string } | undefined;
      const from = domain?.senderEmail
        ? domain.senderName
          ? `${domain.senderName} <${domain.senderEmail}>`
          : domain.senderEmail
        : undefined;
      try {
        await payload.sendEmail({
          to: body.email,
          // `nodemailerAdapter.sendEmail` merges this object over its own
          // `{ from: defaultFromAddress, ... }` via a plain object spread —
          // an explicit `from: undefined` key would still win and clobber
          // the default (object spread assigns `undefined`, it doesn't skip
          // it). Omitting the key entirely is required for the fallback in
          // FR-006/research.md §8 to actually work. Found live, in Mailpit,
          // not by the mocked unit test above (which only asserted the key
          // *was* `undefined`, not what that does downstream).
          ...(from ? { from } : {}),
          subject: optInEmail.subject,
          html: optInEmail.body.replaceAll("{{confirmUrl}}", confirmUrl(String(lead.id), domainHostname)),
        });
      } catch (err) {
        log.warn("optin-email send failed", { err: String(err) });
      }
    }

    // 003-post-launch-improvements, FR-010 — `page.confirmationPage` is
    // already populated at depth: 1 (findByID above). Only `id`/`path` are
    // surfaced: the renderer looks it up on the SAME domain as the page
    // being submitted (it already has that domain resolved), so no
    // cross-domain id needs to travel in this response at all.
    const confirmationPage = page.confirmationPage as { id?: string | number; path?: string } | null | undefined;

    return Response.json({
      ok: true,
      leadId: lead.id,
      unsubscribeUrl: unsubscribeUrl(String(lead.id), domainHostname),
      // 023 (US6): no message of the page's own → the renderer's, in the page's language.
      successMessage: form.successMessage || undefined,
      duplicate: dupe.totalDocs > 0,
      ...(confirmationPage?.id && confirmationPage.path
        ? { confirmationPage: { id: confirmationPage.id, path: confirmationPage.path } }
        : {}),
    });
  },
};
