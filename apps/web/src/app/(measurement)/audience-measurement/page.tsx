import type { Metadata } from "next";

import { resolveDomain } from "../../../lib/domains";
import { visitorCopy } from "../../../lib/visitor-copy";

/**
 * 018-ab-significance (contracts/measurement-page.md, research R10, R15) —
 * the page every domain serves about its A/B tests and their measurement,
 * linked from the privacy policy. Information only: since 2026-10-20 the tests
 * store nothing on and read nothing from the visitor's device, so there is no
 * choice to make here. Never cached at the edge (a Worker pass path), never
 * indexed, no tag manager, no form.
 */
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ lang?: string }> };

/** 023-admin-i18n (US6) — `?lang=` as on the legal pages, else the domain's default, else English. */
async function copyFor(searchParams: Props["searchParams"]) {
  const { lang } = await searchParams;
  const domain = lang ? null : await resolveDomain().catch(() => null);
  return visitorCopy(lang ?? domain?.defaultLanguage?.code);
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { copy } = await copyFor(searchParams);
  return { title: copy.measurement.metaTitle, robots: { index: false, follow: false } };
}

export default async function MeasurementPage({ searchParams }: Props) {
  const { lang, copy } = await copyFor(searchParams);
  const t = copy.measurement;
  return (
    <main lang={lang} style={{ font: "16px/1.5 system-ui, sans-serif", maxWidth: "40rem", margin: "4rem auto", padding: "0 1rem" }}>
      <h1>{t.title}</h1>

      <h2>{t.whatTitle}</h2>
      <p>{t.what}</p>

      <h2>{t.storedTitle}</h2>
      <p>{t.stored}</p>
      <p>{t.use}</p>
    </main>
  );
}
