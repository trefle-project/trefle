import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formTokenPlaceholder } from "@trefle/shared";

import { PageShell } from "../../../components/page-shell";
import { codeContext } from "../../../lib/code-context";
import { Tagging } from "../../../components/tagging";
import { resolveDomain } from "../../../lib/domains";
import { legalLinks } from "../../../lib/legal";
import { PayloadUnavailableError, domainFontFiles, getMediaAliases, getPublishedPageById, pingPageView } from "../../../lib/payload-client";
import { hasLeadForm, sanitizeHtml } from "../../../lib/render";
import { signFormToken } from "../../../lib/tokens";
import { isEdgeRender } from "../../../lib/edge-mode";
import { resolveBannerLanguage } from "../../../lib/tagging-language";

/**
 * 008-ab-testing — the rewrite target `middleware.ts` sends a bucketed
 * visitor to (contracts/bucketing-and-caching.md). Reads only
 * `params.pageId` — never `cookies()`/`headers()`/`searchParams` — so this
 * route is ordinarily ISR-cacheable, one cache entry per distinct page id,
 * exactly like `[[...slug]]/page.tsx` (research.md §1). The visitor's
 * address bar still shows the original URL; only Next's internal routing
 * differs. `domain` still resolves from the real request Host header — a
 * `rewrite()` never changes it — so `<Tagging>`'s language fallback and the
 * lead form behave identically to the ordinary page this variant stands in
 * for.
 *
 * FR-006, second known residual gap (found live, same treatment as
 * `middleware.ts`'s `x-middleware-rewrite` one — documented, not hidden):
 * the address bar, canonical link, form `action`, and rendered content
 * never reveal this route or the assigned page id — verified. But the
 * matched *route segment name* is exactly what App Router's own RSC
 * "flight" hydration payload embeds in the initial HTML for every page
 * (unconditional Next.js behaviour, not something this feature adds), so a
 * visitor reading View Source can find the literal string `"ab-variant"`
 * plus this response's own `pageId` value in that payload. The page id
 * itself was never secret (every page, tested or not, already ships it in
 * a hidden `pageId` form field for lead intake); what's newly visible here
 * is proof that *this* response specifically came from the rewrite target
 * rather than the ordinary `[[...slug]]` route. Switching to
 * `headers()`/`cookies()` to avoid a route param would remove this, but
 * research.md §1 rejected exactly that for FR-018's per-arm ISR caching,
 * which depends on the page id being a real route segment — not
 * revisited here for the same reason.
 */
export const revalidate = 3600;
export const dynamicParams = true;

type Props = { params: Promise<{ pageId: string }> };

async function load(pageId: string) {
  const domain = await resolveDomain();
  if (!domain) notFound();
  try {
    const page = await getPublishedPageById(pageId);
    if (!page) notFound();
    return { domain, page };
  } catch (err) {
    if (err instanceof PayloadUnavailableError) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pageId } = await params;
  try {
    const { page } = await load(pageId);
    return { title: page.seo?.metaTitle || page.title, description: page.seo?.metaDescription };
  } catch {
    return { title: "Introuvable" };
  }
}

export default async function VariantPage({ params }: Props) {
  const { pageId } = await params;
  const { domain, page } = await load(pageId);

  // 020 — in edge mode the Worker counts the view and signs the token per
  // visit; the cached copy carries a placeholder instead.
  const edge = await isEdgeRender();
  // fire-and-forget view counter (not awaited into the response)
  if (!edge) void pingPageView(page.id);

  const formToken = edge ? formTokenPlaceholder(String(page.id)) : signFormToken(String(page.id));
  const language = resolveBannerLanguage({
    pageLanguage: page.language?.code,
    domainDefaultLanguage: domain.defaultLanguage?.code,
  });
  const hasForm = hasLeadForm(sanitizeHtml(page.builder?.html ?? ""));
  return (
    <>
      <Tagging domain={domain} language={language} path={page.path} formPageId={hasForm ? String(page.id) : undefined} />
      <PageShell page={page} formToken={formToken} code={await codeContext()} fonts={domainFontFiles(domain)} mediaAliases={await getMediaAliases()} legal={await legalLinks(domain, page.language?.code)} />
    </>
  );
}
