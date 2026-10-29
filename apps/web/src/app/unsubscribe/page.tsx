import { redirect } from "next/navigation";

import { Tagging } from "../../components/tagging";
import { resolveDomain } from "../../lib/domains";
import { getLeadLanguage } from "../../lib/payload-client";
import { resolveBannerLanguage } from "../../lib/tagging-language";
import { verifyUnsubscribeToken } from "../../lib/tokens";
import { visitorCopy, type VisitorLanguage } from "../../lib/visitor-copy";

/**
 * Consent withdrawal (T067, FR-019). No login. The token is the bearer.
 * Works without JavaScript — the confirm button posts a Server Action.
 * Neutral, non-enumerating responses throughout (never reveals the email).
 */
export const dynamic = "force-dynamic";

const shell = (lang: VisitorLanguage, children: React.ReactNode) => (
  <main lang={lang} style={{ font: "16px/1.5 system-ui, sans-serif", maxWidth: "32rem", margin: "4rem auto", padding: "0 1rem" }}>
    {children}
  </main>
);

async function withdraw(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const check = verifyUnsubscribeToken(token);
  if (check.ok) {
    const base = process.env.CMS_API_URL ?? "http://cms:3000/api";
    const key = process.env.CMS_SERVICE_API_KEY;
    try {
      await fetch(`${base}/consent-withdraw`, {
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
  redirect(`/unsubscribe?done=1${lang ? `&lang=${encodeURIComponent(lang)}` : ""}`);
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string; lang?: string }>;
}) {
  const { token, done, lang: doneLang } = await searchParams;
  const check = done ? null : verifyUnsubscribeToken(token ?? "");

  // 023-admin-i18n (US6) — the language of the lead's page (the done page
  // carries it as `lang`), else the domain's default; the texts fall back to
  // English, the banner to French (007-gtm-tagging, FR-014).
  const domain = await resolveDomain();
  const pageLanguage = (done ? doneLang : check?.ok ? await getLeadLanguage(check.leadId) : null) || undefined;
  const language = resolveBannerLanguage({ pageLanguage, domainDefaultLanguage: domain?.defaultLanguage?.code });
  const { lang, copy } = visitorCopy(pageLanguage ?? domain?.defaultLanguage?.code);
  const tagging = domain ? <Tagging domain={domain} language={language} /> : null;
  // 007-gtm-tagging, contracts/datalayer-events.md — unsubscribe_complete
  // fires only once the withdrawal actually succeeded (the `done` state).
  const taggingDone = domain ? <Tagging domain={domain} language={language} extraEvent="unsubscribe_complete" /> : null;

  if (done) {
    return (
      <>
        {taggingDone}
        {shell(
          lang,
          <>
            <h1>{copy.unsubscribe.doneTitle}</h1>
            <p>{copy.unsubscribe.done}</p>
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
          <h1>{copy.unsubscribe.title}</h1>
          <p>{copy.unsubscribe.text}</p>
          <form action={withdraw}>
            <input type="hidden" name="token" value={token} />
            <button type="submit" style={{ padding: "10px 18px", font: "inherit", cursor: "pointer" }}>
              {copy.unsubscribe.button}
            </button>
          </form>
        </>,
      )}
    </>
  );
}
