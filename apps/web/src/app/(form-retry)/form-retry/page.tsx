import { redirect } from "next/navigation";

import { PageShell } from "../../../components/page-shell";
import { codeContext } from "../../../lib/code-context";
import { Tagging } from "../../../components/tagging";
import { resolveDomain } from "../../../lib/domains";
import { legalLinks } from "../../../lib/legal";
import { take } from "../../../lib/form-error-store";
import { domainFontFiles, getDomainFonts, getMediaAliases, getPageForSubmission, PayloadUnavailableError } from "../../../lib/payload-client";
import { resolveBannerLanguage } from "../../../lib/tagging-language";
import { signFormToken } from "../../../lib/tokens";
import { visitorCopy } from "../../../lib/visitor-copy";

/**
 * Re-renders a lead-form validation failure's landing page with the
 * visitor's own values pre-filled and the failed field(s) marked inline
 * (009-lead-form-error-recovery, spec.md User Story 1).
 *
 * A dedicated route rather than folding this into `[[...slug]]/page.tsx`,
 * for the same two reasons `(confirmation)/confirmation/page.tsx` already
 * is one: `PageShell` cannot be imported into `POST /api/leads`'s Route
 * Handler (react-dom/server import restriction — Next.js rejects the
 * build), and the shared route is ISR-cached and must never render
 * per-visitor state (research.md §1). `POST /api/leads` redirects here
 * (303, so it works with JavaScript unavailable) with only an opaque
 * flash-store token and the page id in the query string — never the
 * submitted values themselves (research.md §2).
 */
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ err?: string; page?: string; lang?: string }>;
};

// 023-admin-i18n (US6) — in the landing page's language (`lang`, set by the lead route).
function fallbackMessage(language: string | undefined) {
  const { lang, copy } = visitorCopy(language);
  return (
    <div lang={lang} style={{ font: "16px/1.5 system-ui,sans-serif", maxWidth: "32rem", margin: "4rem auto", padding: "0 1rem" }}>
      <p>{copy.retry.fallback}</p>
    </div>
  );
}

export default async function FormRetryPage({ searchParams }: Props) {
  const { err, page: pageId, lang } = await searchParams;
  const record = err ? take(err) : null;

  // Happy path: a live, matching flash record — re-render with the
  // preserved values/errors (spec.md FR-001-FR-005).
  if (record && pageId && record.pageId === pageId) {
    let page;
    try {
      page = await getPageForSubmission(record.pageId);
    } catch (e) {
      if (e instanceof PayloadUnavailableError) return fallbackMessage(lang);
      throw e;
    }
    if (page && page.status === "published") {
      // 009-lead-form-error-recovery, spec.md User Story 2 — the same
      // <Tagging> every other real page render uses, so this response is
      // indistinguishable from a normal load. `reason` mirrors the old
      // inline error page's contracts/datalayer-events.md distinction
      // (007-gtm-tagging) between a real validation problem and a missing
      // consent tick — never a field name or the submitted value itself.
      const domain = await resolveDomain();
      const language = resolveBannerLanguage({
        pageLanguage: page.language?.code,
        domainDefaultLanguage: domain?.defaultLanguage?.code,
      });
      const reason = record.fieldErrors.consent ? "consent_not_given" : "validation_failed";
      return (
        <>
          {domain ? (
            <Tagging
              domain={domain}
              language={language}
              path={page.path}
              formPageId={String(page.id)}
              extraEvent={{ event: "lead_form_submit_error", reason }}
            />
          ) : null}
          <PageShell
            page={page}
            formToken={signFormToken(String(page.id))}
            formValues={record.values}
            formErrors={record.fieldErrors}
            code={await codeContext()}
            fonts={domain ? domainFontFiles(domain) : await getDomainFonts(page.domain)}
            mediaAliases={await getMediaAliases()}
            legal={await legalLinks(domain, page.language?.code)}
          />
        </>
      );
    }
    // page no longer resolvable/published since the original submission —
    // fall through to the pageId-only fallback below.
  }

  // No usable flash record (missing, expired, already consumed, or a
  // mismatched pageId) — degrade gracefully: send the visitor back to
  // their own page with a fresh, blank form rather than a dead end
  // (research.md §4), instead of erroring.
  if (pageId) {
    let page;
    try {
      page = await getPageForSubmission(pageId);
    } catch (e) {
      if (e instanceof PayloadUnavailableError) return fallbackMessage(lang);
      throw e;
    }
    if (page && page.status === "published") redirect(page.path);
  }
  return fallbackMessage(lang);
}
