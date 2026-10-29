import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { resolveDomain } from "../lib/domains";
import { getLegalPage, PayloadUnavailableError } from "../lib/payload-client";
import { sanitizeHtml } from "../lib/render";
import { fill, visitorCopy } from "../lib/visitor-copy";

/**
 * 021-legal-pages (contracts/renderer.md) — a domain's privacy policy or legal
 * notice, built by the CMS from the editable texts and the identities, in the
 * language the link asked for (`?lang=`, else the domain's default, else
 * French). Redirects to the owner's own page when the domain has one. Served
 * by the origin (an edge pass path: the language is in the query).
 */
const longDate = (iso: string, lang: "fr" | "en") =>
  new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { timeZone: "Europe/Paris", dateStyle: "long" });
const fallbackTitle = (kind: "privacy" | "notice", lang?: string | null) => {
  const { copy } = visitorCopy(lang);
  return kind === "privacy" ? copy.legal.privacyTitle : copy.legal.noticeTitle;
};

/** The tab title in the page's language (same cached request as the page itself). */
export async function legalMetadata(kind: "privacy" | "notice", lang?: string): Promise<Metadata> {
  // 023 (US6) — the fallback title in the page's language: the one the CMS
  // chose, else the link's, else the domain's default.
  const domain = await resolveDomain().catch(() => null);
  if (!domain) return { title: fallbackTitle(kind, lang) };
  const data = await getLegalPage(kind, domain.id, lang).catch(() => null);
  return { title: data?.title || fallbackTitle(kind, data?.language ?? lang ?? domain.defaultLanguage?.code) };
}

export async function LegalPage({ kind, lang }: { kind: "privacy" | "notice"; lang?: string }) {
  const domain = await resolveDomain();
  if (!domain) notFound();
  let data;
  try {
    data = await getLegalPage(kind, domain.id, lang);
  } catch (err) {
    if (err instanceof PayloadUnavailableError) throw err; // the error page: no legal text is ever invented
    notFound();
  }
  if (data.ownUrl) redirect(data.ownUrl);
  const visitor = visitorCopy(data.language);

  return (
    <main lang={data.language} style={{ font: "16px/1.6 system-ui, sans-serif", maxWidth: "46rem", margin: "3rem auto", padding: "0 1rem" }}>
      <h1>{data.title || fallbackTitle(kind, data.language)}</h1>
      {data.html ? (
        <div className="trefle-legal-text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.html) }} />
      ) : (
        <p lang={visitor.lang === data.language ? undefined : visitor.lang}>{visitor.copy.legal.beingWritten}</p>
      )}
      {data.versionDate ? (
        <p style={{ fontSize: "0.85em", opacity: 0.75, marginTop: "2rem" }}>
          {fill(visitor.copy.legal.version, { version: data.version, date: longDate(data.versionDate, visitor.lang) })}
        </p>
      ) : null}
    </main>
  );
}
