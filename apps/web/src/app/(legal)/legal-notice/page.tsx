import type { Metadata } from "next";

import { LegalPage, legalMetadata } from "../../../components/legal-page";

/** 021-legal-pages — the domain's legal notice (contracts/renderer.md). */
export const dynamic = "force-dynamic";
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const { lang } = await searchParams;
  return legalMetadata("notice", lang);
}

export default async function LegalNoticePage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return <LegalPage kind="notice" lang={lang} />;
}
