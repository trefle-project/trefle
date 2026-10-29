import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formTokenPlaceholder } from "@trefle/shared";

import { PageShell } from "../../components/page-shell";
import { codeContext } from "../../lib/code-context";
import { Tagging } from "../../components/tagging";
import { pathFromSlug, resolveDomain } from "../../lib/domains";
import { legalLinks } from "../../lib/legal";
import { PayloadUnavailableError, domainFontFiles, getMediaAliases, getPublishedPage, pingPageView } from "../../lib/payload-client";
import { hasLeadForm, sanitizeHtml } from "../../lib/render";
import { signFormToken } from "../../lib/tokens";
import { isEdgeRender } from "../../lib/edge-mode";
import { resolveBannerLanguage } from "../../lib/tagging-language";

// SSR + ISR: a warm page is served from cache; publish events invalidate by tag.
export const revalidate = 3600;
export const dynamicParams = true;

type Props = { params: Promise<{ slug?: string[] }> };

async function load(slug: string[] | undefined) {
  const domain = await resolveDomain();
  if (!domain) notFound();
  const path = pathFromSlug(slug);
  try {
    const page = await getPublishedPage(domain.id, path);
    if (page) return { domain, page };
    // 003-post-launch-improvements, FR-014/FR-015 — no page at this exact
    // path: fall back to the domain's default landing experience if one is
    // configured. A real page at the requested path always wins (this branch
    // only runs on a miss); an unregistered/inactive host never reaches here
    // at all (resolveDomain() already returned null for those, FR-017).
    if (domain.notFoundPagePath && domain.notFoundPagePath !== path) {
      const fallback = await getPublishedPage(domain.id, domain.notFoundPagePath);
      if (fallback) return { domain, page: fallback };
    }
    notFound();
  } catch (err) {
    if (err instanceof PayloadUnavailableError) {
      // Let ISR serve the last good render; a hard failure here would blank the page.
      notFound();
    }
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { page } = await load(slug);
    return {
      title: page.seo?.metaTitle || page.title,
      description: page.seo?.metaDescription,
    };
  } catch {
    return { title: "Introuvable" };
  }
}

export default async function LandingPage({ params }: Props) {
  const { slug } = await params;
  const { domain, page } = await load(slug);

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
  // 007-gtm-tagging, contracts/datalayer-events.md — lead_form_view only
  // fires for a page that actually renders the lead-form block, the same
  // detection PageShell itself uses (not just "has a form config").
  const hasForm = hasLeadForm(sanitizeHtml(page.builder?.html ?? ""));
  return (
    <>
      <Tagging domain={domain} language={language} path={page.path} formPageId={hasForm ? String(page.id) : undefined} />
      <PageShell page={page} formToken={formToken} code={await codeContext()} fonts={domainFontFiles(domain)} mediaAliases={await getMediaAliases()} legal={await legalLinks(domain, page.language?.code)} />
    </>
  );
}
