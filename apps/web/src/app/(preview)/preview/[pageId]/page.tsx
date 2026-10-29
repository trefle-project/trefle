import { notFound } from "next/navigation";

import { PageShell } from "../../../../components/page-shell";
import { legalLinks } from "../../../../lib/legal";
import { codeContext } from "../../../../lib/code-context";
import { PayloadUnavailableError, getDomainFonts, getMediaAliases, getPagePreview } from "../../../../lib/payload-client";
import { signFormToken, verifyPreviewToken } from "../../../../lib/tokens";

/**
 * Draft-accurate preview (T049a, FR-004) — same rendering path as the public
 * page, but any status and never cached. Access is a per-page signed token the
 * CMS admin links to; without a valid token this is a 404.
 */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function PreviewPage({ params, searchParams }: Props) {
  const { pageId } = await params;
  const { token } = await searchParams;

  const check = verifyPreviewToken(token ?? "");
  if (!check.ok || check.pageId !== pageId) notFound();

  let page;
  try {
    page = await getPagePreview(pageId);
  } catch (err) {
    if (err instanceof PayloadUnavailableError) notFound();
    throw err;
  }
  if (!page) notFound();

  return (
    <PageShell
      page={page}
      formToken={signFormToken(String(page.id))}
      preview
      code={await codeContext(true)}
      fonts={await getDomainFonts(page.domain)}
      mediaAliases={await getMediaAliases()}
      legal={await legalLinks(null, page.language?.code)}
    />
  );
}
