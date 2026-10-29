import type { Metadata } from "next";

import { LegalPage, legalMetadata } from "../../../components/legal-page";

/** 021-legal-pages — the domain's privacy policy (contracts/renderer.md). */
export const dynamic = "force-dynamic";
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const { lang } = await searchParams;
  return legalMetadata("privacy", lang);
}

export default async function PrivacyPolicyPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return <LegalPage kind="privacy" lang={lang} />;
}
