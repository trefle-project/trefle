import Script from "next/script";

import { resolveBannerCopy } from "../lib/banner-copy";
import { legalLinks } from "../lib/legal";
import { escapeHtml } from "../lib/escape-html";
import { getSettings, type Domain } from "../lib/payload-client";
import { CookieConsentBanner } from "./cookie-consent-banner";

const GTM_CONTAINER_ID_RE = /^GTM-[A-Z0-9]+$/;

function validGtmId(domain: Domain): string | undefined {
  return domain.gtmContainerId && GTM_CONTAINER_ID_RE.test(domain.gtmContainerId) ? domain.gtmContainerId : undefined;
}

/**
 * 007-gtm-tagging, research.md §7 — the raw-HTML equivalent of what
 * `<Tagging>` renders, for `apps/web/src/app/api/leads/route.ts`'s
 * hand-built HTML responses, which never pass through React/RootLayout at
 * all. No consent banner here by design (these are error/fallback
 * responses, not primary pages) — Consent Mode still defaults to denied,
 * which is the compliance-relevant guarantee. Every interpolated value is
 * escaped even though `gtmContainerId` is already format-validated and
 * `dataLayerEvent.reason` is drawn from a fixed enum — defense in depth
 * (plan.md Risks).
 *
 * `nonce` is required: `middleware.ts`'s strict CSP (`script-src 'self'
 * 'nonce-...' 'strict-dynamic'`, no `'unsafe-inline'`) applies to this route
 * like any other — `next/script` auto-nonces itself for the React path
 * (`<Tagging>`), but a hand-built `<script>` string does not get that for
 * free. The caller reads it off the request via the `x-nonce` header the
 * middleware sets.
 */
export function renderTaggingHtml(
  domain: Domain,
  nonce: string,
  dataLayerEvent?: { event: string; reason?: string },
): string {
  const consentModeApplies = Boolean(domain.consentBannerEnabled || domain.gtmContainerId);
  const gtmId = validGtmId(domain);
  if (!consentModeApplies) return "";

  const safeNonce = escapeHtml(nonce);
  const hostname = escapeHtml(domain.hostname);
  let html =
    `<script nonce="${safeNonce}">window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments);}window.gtag=gtag;` +
    `gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});</script>`;

  if (gtmId) {
    const safeId = escapeHtml(gtmId);
    html +=
      `<script nonce="${safeNonce}">(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});` +
      `var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;` +
      `j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);` +
      `})(window,document,'script','dataLayer','${safeId}');</script>` +
      `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${safeId}" height="0" width="0" style="display:none;visibility:hidden" title="gtm"></iframe></noscript>`;
    if (dataLayerEvent) {
      const event = escapeHtml(dataLayerEvent.event);
      const reason = dataLayerEvent.reason ? `,reason:"${escapeHtml(dataLayerEvent.reason)}"` : "";
      html += `<script nonce="${safeNonce}">window.dataLayer.push({event:"${event}",domain:"${hostname}"${reason}});</script>`;
    }
  }
  return html;
}

/**
 * 007-gtm-tagging — renders, for one already-resolved `domain`, in order:
 * (1) the Consent Mode default-deny script, (2) the GTM snippet (when a
 * container id is configured), (3) the documented `dataLayer` page-view /
 * lead-form-view events (contracts/datalayer-events.md — only pushed when
 * a container is actually configured, since nothing reads them otherwise),
 * (4) the consent banner (when enabled), localized to `language`
 * (research.md §3-§5). Rendered explicitly by every public entry point
 * that resolves a domain — never by `RootLayout` (research.md §5) and
 * never by the preview route (FR-010).
 */
export async function Tagging({
  domain,
  language,
  path,
  formPageId,
  extraEvent,
}: {
  domain: Domain;
  language: string;
  /** Current page path, for the page_view/lead_form_view events. Omit on routes with no page of their own (/unsubscribe, /confirm). */
  path?: string;
  /** The page's id when it carries a lead-capture form — triggers the lead_form_view push (contracts/datalayer-events.md). */
  formPageId?: string;
  /**
   * A non-personal event to push alongside page_view — e.g.
   * "unsubscribe_complete", or `{ event: "lead_form_submit_error", reason:
   * "validation_failed" }` (009-lead-form-error-recovery). A bare string is
   * shorthand for `{ event }`. `path`/`formPageId` (above) are echoed into
   * this push too, same as `lead_form_view`'s — contracts/datalayer-events.md
   * requires them on `lead_form_submit_success`/`lead_form_submit_error`.
   */
  extraEvent?: string | { event: string; reason?: string };
}) {
  const consentModeApplies = Boolean(domain.consentBannerEnabled || domain.gtmContainerId);
  const gtmId = validGtmId(domain);
  const extraEventObj = typeof extraEvent === "string" ? { event: extraEvent } : extraEvent;

  let bannerCopy = null;
  let privacy: { href: string; label: string } | undefined;
  if (domain.consentBannerEnabled) {
    const settings = await getSettings().catch(() => ({ cookieBannerTranslations: [] }));
    bannerCopy = resolveBannerCopy(language, settings.cookieBannerTranslations);
    // 021-legal-pages — the banner links the domain's privacy policy: the
    // footer line sits under the banner until the visitor answers it.
    const links = await legalLinks(domain, language);
    privacy = { href: links.policyHref, label: links.policyLabel };
  }

  return (
    <>
      {consentModeApplies ? (
        // Next.js only supports the `beforeInteractive` script strategy in
        // the root layout (app/layout.tsx) — `<Tagging>` deliberately isn't
        // rendered there (research.md §5), so `afterInteractive` is the
        // correct strategy here. Order is still preserved (this script
        // always renders before the GTM one below), which is what FR-004
        // actually needs: default-denied set before GTM's own tags
        // evaluate, not literally before hydration.
        <Script id="tf-consent-default" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments);}window.gtag=gtag;` +
            `gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});`}
        </Script>
      ) : null}
      {gtmId ? (
        <>
          <Script id="tf-gtm" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});` +
              `var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;` +
              `j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);` +
              `})(window,document,'script','dataLayer','${gtmId}');`}
          </Script>
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
              title="gtm"
            />
          </noscript>
          {/* next/script dedupes by id across client-side navigations in the
              same session (e.g. /unsubscribe's Server-Action redirect to
              ?done=1) — varying `id` alone isn't enough to get a fresh
              script instance, because React reconciles this element
              against the *same* position's previous render and only
              updates props rather than remounting; `key` matching `id`
              forces the remount `next/script` needs to actually re-run. */}
          <Script
            key={extraEventObj ? `tf-datalayer-events-${extraEventObj.event}` : "tf-datalayer-events"}
            id={extraEventObj ? `tf-datalayer-events-${extraEventObj.event}` : "tf-datalayer-events"}
            strategy="afterInteractive"
          >
            {`window.dataLayer=window.dataLayer||[];` +
              `window.dataLayer.push({event:'page_view',domain:${JSON.stringify(domain.hostname)},path:${JSON.stringify(path ?? "")}});` +
              (formPageId
                ? `window.dataLayer.push({event:'lead_form_view',domain:${JSON.stringify(domain.hostname)},path:${JSON.stringify(path ?? "")},formPageId:${JSON.stringify(formPageId)}});`
                : "") +
              (extraEventObj
                ? `window.dataLayer.push({event:${JSON.stringify(extraEventObj.event)},domain:${JSON.stringify(domain.hostname)}` +
                  (path ? `,path:${JSON.stringify(path)}` : "") +
                  (formPageId ? `,formPageId:${JSON.stringify(formPageId)}` : "") +
                  (extraEventObj.reason ? `,reason:${JSON.stringify(extraEventObj.reason)}` : "") +
                  `});`
                : "")}
          </Script>
        </>
      ) : null}
      {domain.consentBannerEnabled && bannerCopy ? (
        <CookieConsentBanner
          title={bannerCopy.title}
          body={bannerCopy.body}
          acceptLabel={bannerCopy.acceptLabel}
          rejectLabel={bannerCopy.rejectLabel}
          revisitLabel={bannerCopy.revisitLabel}
          privacy={privacy}
        />
      ) : null}
    </>
  );
}
