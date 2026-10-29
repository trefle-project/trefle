import { NextResponse } from "next/server";

import { bump } from "../../../lib/counters";
import { consentPolicy } from "../../../lib/legal";
import { escapeHtml } from "../../../lib/escape-html";
import { put as putFormError } from "../../../lib/form-error-store";
import { getActiveDomainByHost, getPageForSubmission, PayloadUnavailableError, postLeadIntake, type Domain, type FormFieldConfig } from "../../../lib/payload-client";
import { leadSubmissionLog } from "../../../lib/log";
import { checkEmailPageLimit, checkIpLimit } from "../../../lib/rate-limit";
import { renderTaggingHtml } from "../../../components/tagging";
import { verifyFormToken } from "../../../lib/tokens";
import { fill, visitorCopy, type VisitorCopy } from "../../../lib/visitor-copy";

/**
 * POST /api/leads (T047) — see contracts/lead-intake.md. Plain HTML in / HTML
 * out so it works with JavaScript disabled. Edge checks live here; persistence
 * + the consent record live in the CMS `lead-intake` endpoint.
 */
export const dynamic = "force-dynamic";

// Request-influenced values (field labels, the referer-derived back link)
// reach `page()`'s body unescaped otherwise — encode before interpolating
// (003-post-launch-improvements, FR-002).
const backLink = (ref: string | null, copy: VisitorCopy) =>
  ref ? `<p><a href="${escapeHtml(ref)}">${copy.lead.back}</a></p>` : "";

// Build the redirect's origin from the request's own Host header (with
// port, unlike the lowercased/port-stripped `host` used for the domain
// allow-list) — NOT from `req.url`, which in some deployments/containers
// reflects the server's own listening address rather than the address the
// client actually connected to, producing a Location a different client
// can't follow. Shared by every redirect this route issues (confirmation
// page, 009-lead-form-error-recovery's /form-retry).
const requestOrigin = (req: Request): string => {
  const rawHost = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0]!.trim();
  const scheme = req.headers.get("x-forwarded-proto") ?? (rawHost.includes(".localhost") ? "http" : "https");
  return `${scheme}://${rawHost}`;
};

// The form is `noValidate`, so the browser's own tel/number/date/radio checks
// never run — enforce the format here. Empty values are handled by the caller.
const fieldFormatError = (f: FormFieldConfig, v: string, copy: VisitorCopy): string | undefined => {
  const label = { label: f.label };
  switch (f.type) {
    case "tel": {
      const digits = v.replace(/\D/g, "").length;
      return /^\+?[\d\s().-]+$/.test(v) && digits >= 6 && digits <= 15
        ? undefined
        : fill(copy.lead.tel, label);
    }
    case "number":
      return Number.isFinite(Number(v.replace(",", "."))) ? undefined : fill(copy.lead.number, label);
    case "date": {
      // <input type="date"> always submits YYYY-MM-DD; reject impossible dates like 2026-02-31.
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      const d = m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)) : undefined;
      return d && d.toISOString().startsWith(v) ? undefined : fill(copy.lead.date, label);
    }
    case "radio":
      return (f.options ?? []).some((o) => o.value === v) ? undefined : fill(copy.lead.radio, label);
    default:
      return undefined;
  }
};

export async function POST(req: Request) {
  // 007-gtm-tagging, research.md §7 — `middleware.ts`'s strict CSP requires
  // a nonce on every inline <script>; it forwards one via this header.
  // `page()` needs it per-request, so it's defined here as a closure rather
  // than at module scope.
  const nonce = req.headers.get("x-nonce") ?? "";
  // 023-admin-i18n (US6) — the built-in texts follow the page's language
  // once the page is known, the domain's default before; `<html lang>` says
  // which (English for any language without built-in texts, FR-017).
  let { lang, copy } = visitorCopy(undefined);
  const page = (
    title: string,
    body: string,
    status = 200,
    tagging?: { domain: Domain; dataLayerEvent?: { event: string; reason?: string } },
  ) =>
    // An explicit <head>/<body>, with <title> in the head and the tagging
    // markup at the start of the body. The tagging HTML ends with GTM's
    // <noscript><iframe> fallback: with scripting disabled, an <iframe>
    // inside <noscript> implicitly closes the <head>, so a <title> placed
    // after it landed in the <body> — found as an order-dependent e2e
    // failure (us1-capture's no-JS submit after gtm-consent had left a GTM
    // container on the domain). The consent default-deny script still runs
    // before the GTM snippet: both stay in their original order.
    new NextResponse(
      `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>${title}</title></head><body>` +
        (tagging ? renderTaggingHtml(tagging.domain, nonce, tagging.dataLayerEvent) : "") +
        `<div style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">${body}</div>` +
        `</body></html>`,
      { status, headers: { "content-type": "text/html; charset=utf-8" } },
    );

  const referer = req.headers.get("referer");
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase().replace(/:\d+$/, "");
  // Trust only a header the connecting proxy itself sets: Caddy overwrites
  // X-Real-IP with the real TCP peer address, so a client cannot spoof it.
  // X-Forwarded-For is only ever appended to by Caddy, so its FIRST hop can
  // still be attacker-supplied — fall back to its LAST hop, and only when
  // X-Real-IP is absent (host-mode dev without Caddy in front). Never trust
  // the first hop (003-post-launch-improvements, FR-001).
  const xff = req.headers.get("x-forwarded-for");
  const ip =
    req.headers.get("x-real-ip")?.trim() ||
    xff
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .pop() ||
    "0.0.0.0";
  const userAgent = req.headers.get("user-agent") ?? "";

  // parse body (urlencoded form OR json)
  let fields: Record<string, string> = {};
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    fields = (await req.json().catch(() => ({}))) as Record<string, string>;
  } else {
    const fd = await req.formData().catch(() => null);
    if (fd) for (const [k, v] of fd.entries()) fields[k] = typeof v === "string" ? v : "";
  }

  // 1. host allow-list
  const domain = await getActiveDomainByHost(host).catch(() => null);
  if (!domain) {
    leadSubmissionLog({ outcome: "rejected", reason: "unknown_host" });
    return page(copy.lead.unknownHostTitle, `<p>${copy.lead.unknownHost}</p>`, 403);
  }
  ({ lang, copy } = visitorCopy(domain.defaultLanguage?.code));

  // 2. honeypot — silent success, store nothing. No dataLayer event: this
  // never was a genuine submission, and counting it would inflate
  // conversion analytics with bot traffic (contracts/datalayer-events.md).
  if (fields.hp_check && fields.hp_check.trim() !== "") {
    bump("abuse_rejected_honeypot");
    leadSubmissionLog({ outcome: "rejected", reason: "honeypot" });
    return page(copy.lead.thanksTitle, `<p>${copy.lead.thanks}</p>`, 200, { domain });
  }

  // 3. form token / timing — an anti-bot heuristic, not a reason a real
  // visitor's error is attributed to; no dataLayer event for the same
  // reason as the honeypot branch above.
  const tok = verifyFormToken(fields.formToken ?? "");
  if (!tok.ok) {
    if (tok.reason === "timing") {
      const signed = await getPageForSubmission(tok.pageId).catch(() => null);
      if (signed?.language?.code) ({ lang, copy } = visitorCopy(signed.language.code));
    }
    bump("abuse_rejected_timing");
    leadSubmissionLog({ outcome: "rejected", reason: "timing" });
    return page(copy.lead.waitTitle, `<p>${copy.lead.wait}</p>${backLink(referer, copy)}`, 422, { domain });
  }
  const pageId = tok.payload.pageId;

  // 4. rate limits
  const ipLim = checkIpLimit(ip);
  const email = (fields.email ?? "").trim();
  const epLim = email ? checkEmailPageLimit(email, pageId) : { ok: true, retryAfterSec: 0, remaining: 3 };
  if (!ipLim.ok || !epLim.ok) {
    bump("abuse_rejected_rate_limit");
    leadSubmissionLog({ outcome: "rejected", reason: "rate_limited", pageId });
    const retry = Math.max(ipLim.retryAfterSec, epLim.retryAfterSec);
    return new NextResponse(
      renderTaggingHtml(domain, nonce, { event: "lead_form_submit_error", reason: "rate_limited" }) +
        `<title>${copy.lead.tooManyTitle}</title><p lang="${lang}">${copy.lead.tooMany}</p>`,
      { status: 429, headers: { "content-type": "text/html; charset=utf-8", "retry-after": String(retry) } },
    );
  }

  // 5. load form config, validate
  let cfg;
  try {
    cfg = await getPageForSubmission(pageId);
  } catch (err) {
    if (err instanceof PayloadUnavailableError) {
      bump("transient_upstream_failure");
      leadSubmissionLog({ outcome: "rejected", reason: "upstream_unavailable", pageId });
      return page(copy.lead.unavailableTitle, `<p>${copy.lead.unavailable}</p>${backLink(referer, copy)}`, 503, {
        domain,
        dataLayerEvent: { event: "lead_form_submit_error", reason: "upstream_unavailable" },
      });
    }
    throw err;
  }
  if (cfg?.language?.code) ({ lang, copy } = visitorCopy(cfg.language.code));
  if (!cfg || cfg.status !== "published") {
    leadSubmissionLog({ outcome: "rejected", reason: "unpublished", pageId });
    // No dataLayer event: "the page stopped accepting submissions" isn't
    // one of the documented reasons (contracts/datalayer-events.md) and
    // mislabeling it as validation_failed would blame the visitor for a
    // content-state problem — still gets the base GTM/Consent Mode markup.
    return page(copy.lead.closedTitle, `<p>${copy.lead.closed}</p>`, 409, { domain });
  }

  // 009-lead-form-error-recovery, FR-001-FR-006 — keyed by field `name` (plus
  // "consent") so /form-retry can mark exactly the field(s) at fault, instead
  // of the flat error list this used to build for a generic bullet-list page.
  const fieldErrors: Record<string, string> = {};
  const emailFieldName = cfg.form?.fields?.find((f) => f.type === "email")?.name ?? "email";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fieldErrors[emailFieldName] = copy.lead.invalidEmail;
  for (const f of cfg.form?.fields ?? []) {
    if (f.type === "email") continue;
    const v = fields[f.name];
    if (!v || v.trim() === "") {
      if (f.required) fieldErrors[f.name] = fill(copy.lead.required, { label: f.label });
      continue;
    }
    const formatError = fieldFormatError(f, v.trim(), copy);
    if (formatError) fieldErrors[f.name] = formatError;
  }
  if (fields.consent !== "on") fieldErrors.consent = copy.lead.consentRequired;
  if (Object.keys(fieldErrors).length) {
    const consentMissing = fields.consent !== "on";
    leadSubmissionLog({ outcome: "rejected", reason: consentMissing ? "consent_required" : "validation", pageId });
    // Submitted values only, never formToken/hp_check — those aren't form
    // fields and must never be echoed back into the re-rendered form.
    const values: Record<string, string> = {};
    for (const f of cfg.form?.fields ?? []) values[f.name] = fields[f.name] ?? "";
    const errToken = putFormError({ pageId, values, fieldErrors });
    // Only an opaque lookup token + the (non-personal) page id ever reach the
    // URL — never the submitted values themselves (research.md §2), so
    // nothing personal can end up in a reverse-proxy access log here.
    const retryUrl = new URL("/form-retry", requestOrigin(req));
    retryUrl.searchParams.set("err", errToken);
    retryUrl.searchParams.set("page", pageId);
    retryUrl.searchParams.set("lang", lang);
    return NextResponse.redirect(retryUrl, 303);
  }

  // 6. persist via CMS with retry on transient failure
  const fieldValues: Record<string, unknown> = {};
  for (const f of cfg.form?.fields ?? []) if (f.type !== "email") fieldValues[f.name] = fields[f.name];
  const utm: Record<string, string> = {};
  try {
    const refUrl = referer ? new URL(referer) : null;
    for (const k of ["source", "medium", "campaign", "term", "content"]) {
      const v = refUrl?.searchParams.get(`utm_${k}`);
      if (v) utm[k] = v;
    }
  } catch {
    /* ignore */
  }

  // 021-legal-pages — the policy this consent refers to (research R6).
  const policy = await consentPolicy(domain, cfg.form, cfg.language?.code, requestOrigin(req));
  const intakeBody = {
    pageId,
    email,
    fieldValues,
    consent: true,
    consentContext: {
      consentText: `${cfg.form?.consentPurposeText ?? ""}`,
      purposeText: cfg.form?.consentPurposeText ?? "",
      privacyNoticeUrl: policy.url,
      privacyNoticeVersion: policy.version,
      capturedAt: new Date().toISOString(),
      ipAddress: ip,
      userAgent,
    },
    metadata: { pageUrl: referer ?? `https://${host}`, referrer: req.headers.get("referer") ?? undefined, utm },
    // 018-ab-significance (R15) — the view number the edge signed into the form
    // token: attributes the lead to that view's A/B version. No cookie is read.
    visitorId: tok.payload.viewNumber,
  };

  const deadline = Date.now() + 5000;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const result = await postLeadIntake(intakeBody);
      if (result.ok) {
        leadSubmissionLog({ outcome: "accepted", reason: "ok", pageId });
        // 003-post-launch-improvements, FR-010/FR-011 — an editable confirmation
        // page, rendered by the dedicated /confirmation route (a real Server
        // Component — react-dom/server cannot be used from a Route Handler).
        // Post/Redirect/Get: works with JavaScript unavailable. The route
        // itself falls back to the generic message below if the page can no
        // longer be resolved (e.g. deleted/unpublished since being selected).
        if (result.confirmationPage) {
          const confirmUrl = new URL("/confirmation", requestOrigin(req));
          confirmUrl.searchParams.set("domain", String(domain.id));
          confirmUrl.searchParams.set("path", result.confirmationPage.path);
          if (result.unsubscribeUrl) confirmUrl.searchParams.set("unsub", result.unsubscribeUrl);
          // carried through as the fallback if the confirmation page can no
          // longer be resolved by the time /confirmation renders
          confirmUrl.searchParams.set("fallback", result.successMessage ?? copy.lead.thanks);
          confirmUrl.searchParams.set("lang", lang);
          return NextResponse.redirect(confirmUrl, 303);
        }
        return page(
          copy.lead.thanksTitle,
          `<p>${result.successMessage ?? copy.lead.thanks}</p>` +
            (result.unsubscribeUrl
              ? `<p style="font-size:13px;color:#666">${copy.lead.withdrawBefore}<a href="${result.unsubscribeUrl}">${copy.lead.withdrawLink}</a>${copy.lead.withdrawAfter}</p>`
              : ""),
          200,
          { domain, dataLayerEvent: { event: "lead_form_submit_success" } },
        );
      }
      // a 4xx from the CMS (unpublished, validation) — surface generically
      leadSubmissionLog({ outcome: "rejected", reason: "validation", pageId });
      return page(copy.lead.notSavedTitle, `<p>${copy.lead.notSaved}</p>${backLink(referer, copy)}`, 422, {
        domain,
        dataLayerEvent: { event: "lead_form_submit_error", reason: "validation_failed" },
      });
    } catch (err) {
      lastErr = err;
      if (!(err instanceof PayloadUnavailableError)) throw err;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  bump("transient_upstream_failure");
  leadSubmissionLog({ outcome: "rejected", reason: "upstream_unavailable", pageId });
  void lastErr;
  return page(copy.lead.unavailableTitle, `<p>${copy.lead.unavailable}</p>${backLink(referer, copy)}`, 503, {
    domain,
    dataLayerEvent: { event: "lead_form_submit_error", reason: "upstream_unavailable" },
  });
}
