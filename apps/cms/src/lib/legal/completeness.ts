/**
 * 021-legal-pages (research R8, US4) — what is still missing for a domain's
 * legal pages to be complete, in the admin language (French by default). Pages are served
 * anyway (missing lines are left out); this only warns.
 */
import { adminText } from "../../i18n";

type Maybe = string | null | undefined;
type Settings = {
  operator?: { name?: Maybe; address?: Maybe; email?: Maybe } | null;
  legalTexts?: { language?: unknown; privacyPolicy?: unknown; legalNotice?: unknown }[] | null;
};
type Domain = { owner?: { name?: Maybe; address?: Maybe; email?: Maybe; director?: Maybe } | null } | null | undefined;

const filled = (v: Maybe) => Boolean(v && v.trim());
const isFrench = (lang: unknown) => (lang && typeof lang === "object" && "code" in lang ? (lang as { code: unknown }).code === "fr" : false);
const hasText = (rich: unknown) => {
  const children = (rich as { root?: { children?: unknown[] } } | null | undefined)?.root?.children;
  return Array.isArray(children) && children.length > 0;
};

export function operatorMissing(settings: Settings, lang: string = "fr"): string[] {
  const t = adminText(lang);
  const op = settings.operator ?? {};
  const out: string[] = [];
  if (!filled(op.name)) out.push(t("legal.missingOperatorName"));
  if (!filled(op.address)) out.push(t("legal.missingOperatorAddress"));
  if (!filled(op.email)) out.push(t("legal.missingOperatorEmail"));
  const fr = (settings.legalTexts ?? []).find((t) => isFrench(t.language));
  if (!fr || !hasText(fr.privacyPolicy)) out.push(t("legal.missingFrenchPrivacy"));
  if (!fr || !hasText(fr.legalNotice)) out.push(t("legal.missingFrenchNotice"));
  return out;
}

export function ownerMissing(domain: Domain, lang: string = "fr"): string[] {
  const t = adminText(lang);
  const owner = domain?.owner ?? {};
  const out: string[] = [];
  if (!filled(owner.name)) out.push(t("legal.missingOwnerName"));
  if (!filled(owner.address)) out.push(t("legal.missingOwnerAddress"));
  if (!filled(owner.email)) out.push(t("legal.missingOwnerEmail"));
  if (!filled(owner.director)) out.push(t("legal.missingDirector"));
  return out;
}

/** Everything missing for this domain's legal pages (operator part first). */
export const legalCompleteness = (settings: Settings, domain: Domain, lang: string = "fr"): string[] => [
  ...operatorMissing(settings, lang),
  ...ownerMissing(domain, lang),
];
