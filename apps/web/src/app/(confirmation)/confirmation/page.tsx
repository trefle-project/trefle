import { PageShell } from "../../../components/page-shell";
import { codeContext } from "../../../lib/code-context";
import { resolveDomain } from "../../../lib/domains";
import { legalLinks } from "../../../lib/legal";
import { getDomainFonts, getMediaAliases, getPublishedPage, PayloadUnavailableError } from "../../../lib/payload-client";
import { signFormToken } from "../../../lib/tokens";
import { visitorCopy, type VisitorCopy, type VisitorLanguage } from "../../../lib/visitor-copy";

/**
 * Renders a landing page's selected confirmation page with the submitter's
 * own unsubscribe link resolved (003-post-launch-improvements, FR-010/FR-011).
 *
 * A dedicated route rather than folding this into `[[...slug]]/page.tsx`:
 * that route is ISR-cached (`revalidate = 3600`) and shared by every visitor,
 * so it must never render a request-specific value like a real unsubscribe
 * link — doing the substitution there would either leak one visitor's link to
 * another (if cached) or force the whole general page route dynamic for
 * everyone (if not). This route is inherently per-submission and un-cached
 * instead; the confirmation page itself is an ordinary published `Page` (no
 * new access control — a visitor could load it directly at its own path
 * anyway, just without the personalised link).
 *
 * `POST /api/leads` redirects here (303, so it works with JavaScript
 * unavailable) rather than rendering inline — react-dom/server's
 * renderToStaticMarkup cannot be imported into a Route Handler (Next.js
 * rejects the build: "You're importing a component that imports
 * react-dom/server ... render or return the content directly as a Server
 * Component instead"). This page IS that Server Component.
 */
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ domain?: string; path?: string; unsub?: string; fallback?: string; lang?: string }>;
};

// A minimal fallback — mirrors api/leads/route.ts's `page()` helper — for
// when the confirmation page can no longer be resolved (e.g. deleted or
// unpublished since being selected) or none of domain/path were supplied at
// all (this route reached directly rather than via the redirect).
// 023-admin-i18n (US6) — in the landing page's language (`lang`, set by the
// lead route); the message itself may be the editor's own (FR-018).
function fallbackPage(message: string, { lang, copy }: { lang: VisitorLanguage; copy: VisitorCopy }, unsub?: string) {
  return (
    <div lang={lang} style={{ font: "16px/1.5 system-ui,sans-serif", maxWidth: "32rem", margin: "4rem auto", padding: "0 1rem" }}>
      <p>{message}</p>
      {unsub ? (
        <p style={{ fontSize: 13, color: "#666" }}>
          {copy.lead.withdrawBefore}
          <a href={unsub}>{copy.lead.withdrawLink}</a>
          {copy.lead.withdrawAfter}
        </p>
      ) : null}
    </div>
  );
}

export default async function ConfirmationPage({ searchParams }: Props) {
  const { domain, path, unsub, fallback, lang } = await searchParams;
  const visitor = visitorCopy(lang);
  const fallbackMessage = fallback ?? visitor.copy.lead.thanks;
  if (!domain || !path) return fallbackPage(fallbackMessage, visitor, unsub);

  let page;
  try {
    page = await getPublishedPage(domain, path);
  } catch (err) {
    if (err instanceof PayloadUnavailableError) return fallbackPage(fallbackMessage, visitor, unsub);
    throw err;
  }
  if (!page) return fallbackPage(fallbackMessage, visitor, unsub);

  const withUnsubscribe = unsub
    ? { ...page, builder: { ...page.builder, html: page.builder.html.replaceAll("{{unsubscribeUrl}}", unsub) } }
    : page;

  return (
    <PageShell
      page={withUnsubscribe}
      formToken={signFormToken(String(page.id))}
      code={await codeContext()}
      fonts={await getDomainFonts(page.domain)}
      mediaAliases={await getMediaAliases()}
      legal={await legalLinks(await resolveDomain().catch(() => null), page.language?.code)}
    />
  );
}
