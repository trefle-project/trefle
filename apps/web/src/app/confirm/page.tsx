import { redirect } from "next/navigation";

import { Tagging } from "../../components/tagging";
import { resolveDomain } from "../../lib/domains";
import { getLeadLanguage } from "../../lib/payload-client";
import { resolveBannerLanguage } from "../../lib/tagging-language";
import { verifyConfirmToken } from "../../lib/tokens";
import { visitorCopy, type VisitorLanguage } from "../../lib/visitor-copy";

/**
 * Double opt-in confirmation (006-double-optin-email, FR-009/FR-010/FR-011).
 * Mirrors `../unsubscribe/page.tsx` exactly: no login, the token is the
 * bearer, works without JavaScript — the confirm button posts a Server
 * Action. Neutral, non-enumerating responses throughout.
 */
export const dynamic = "force-dynamic";

const shell = (lang: VisitorLanguage, children: React.ReactNode) => (
  <main lang={lang} style={{ font: "16px/1.5 system-ui, sans-serif", maxWidth: "32rem", margin: "4rem auto", padding: "0 1rem" }}>
    {children}
  </main>
);

async function confirm(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const check = verifyConfirmToken(token);
  if (check.ok) {
    const base = process.env.CMS_API_URL ?? "http://cms:3000/api";
    const key = process.env.CMS_SERVICE_API_KEY;
    try {
      await fetch(`${base}/leads-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { Authorization: `users API-Key ${key}` } : {}) },
        body: JSON.stringify({ leadId: check.leadId }),
        cache: "no-store",
      });
    } catch {
      /* idempotent + neutral — fall through to the done page regardless */
    }
  }
  // 023 (US6) — the done page has no token left to find the lead's language by.
  const lang = check.ok ? await getLeadLanguage(check.leadId) : null;
  redirect(`/confirm?done=1${lang ? `&lang=${encodeURIComponent(lang)}` : ""}`);
}

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string; lang?: string }>;
}) {
  const { token, done, lang: doneLang } = await searchParams;
  const check = done ? null : verifyConfirmToken(token ?? "");

  // 023-admin-i18n (US6) — the language of the lead's page (the done page
  // carries it as `lang`), else the domain's default; the texts fall back to
  // English, the banner to French (007-gtm-tagging, FR-014).
  const domain = await resolveDomain();
  const pageLanguage = (done ? doneLang : check?.ok ? await getLeadLanguage(check.leadId) : null) || undefined;
  const language = resolveBannerLanguage({ pageLanguage, domainDefaultLanguage: domain?.defaultLanguage?.code });
  const { lang, copy } = visitorCopy(pageLanguage ?? domain?.defaultLanguage?.code);
  const tagging = domain ? <Tagging domain={domain} language={language} /> : null;

  if (done) {
    return (
      <>
        {tagging}
        {shell(
          lang,
          <>
            <h1>{copy.confirm.doneTitle}</h1>
            <p>{copy.confirm.done}</p>
          </>,
        )}
      </>
    );
  }

  if (!check?.ok) {
    return (
      <>
        {tagging}
        {shell(
          lang,
          <>
            <h1>{copy.link.invalidTitle}</h1>
            <p>{copy.link.invalid}</p>
          </>,
        )}
      </>
    );
  }

  return (
    <>
      {tagging}
      {shell(
        lang,
        <>
          <h1>{copy.confirm.title}</h1>
          <p>{copy.confirm.text}</p>
          <form action={confirm}>
            <input type="hidden" name="token" value={token} />
            <button type="submit" style={{ padding: "10px 18px", font: "inherit", cursor: "pointer" }}>
              {copy.confirm.button}
            </button>
          </form>
        </>,
      )}
    </>
  );
}
