import { redirectLegacyPath } from "../../../components/legacy-path";

/** 023-admin-i18n (US7) — the audience-measurement page's path until 023: redirects to the new one. */
export const dynamic = "force-dynamic";

export default async function LegacyPath({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return redirectLegacyPath("/mesure-audience", searchParams);
}
