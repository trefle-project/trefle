import type { GlobalBeforeChangeHook } from "payload";
import { APIError } from "payload";

import { adminText, type AdminText } from "../i18n";

/**
 * 007-gtm-tagging, FR-014 — `settings.cookieBannerTranslations` must always
 * keep at least one row for French: it's the banner's ultimate fallback
 * when a page's own language (or the domain's default) has no translation
 * yet. If the `languages` collection has no `fr` entry at all, this guard
 * is a no-op — that's 005-content-language-tagging's concern, not this
 * field's.
 */
type LanguageRow = { language?: string | number | { id: string | number } | null };
const languageIds = (rows: LanguageRow[] | undefined) =>
  (rows ?? []).map((row) => {
    const lang = row.language;
    return String(typeof lang === "object" && lang !== null ? lang.id : lang);
  });

/**
 * A Settings array of per-language rows must keep its French row (the
 * fallback). A save that leaves this array's languages as they were never
 * fails: Payload hands the hook the stored rows for fields the save didn't
 * touch, and an installation whose array never had a French row must still
 * be able to save the rest of Settings (021's migration did exactly that).
 */
export function requireFrenchRow(field: string, message: (t: AdminText) => string): GlobalBeforeChangeHook {
  return async ({ data, originalDoc, req }) => {
    const rows = data?.[field] as LanguageRow[] | undefined;
    if (rows === undefined) return data;
    const before = languageIds(originalDoc?.[field] as LanguageRow[] | undefined);
    const after = languageIds(rows);
    if (after.length === before.length && after.every((id, i) => id === before[i])) return data;

    const french = await req.payload.find({
      collection: "languages",
      where: { code: { equals: "fr" } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const frenchId = french.docs[0]?.id;
    if (frenchId === undefined) return data;

    if (!after.includes(String(frenchId))) throw new APIError(message(adminText(req.i18n?.language)), 400, undefined, true);
    return data;
  };
}

export const requireFrenchBannerTranslation = requireFrenchRow(
  "cookieBannerTranslations",
  () => "At least one French (fr) cookie-banner translation must remain.",
);

/** 021-legal-pages — the legal texts keep a French row: it is every page's fallback. */
export const requireFrenchLegalTexts = requireFrenchRow(
  "legalTexts",
  (t) => t("settings.legalNeedsFrench"),
);

/** 021-legal-pages — at most one supplier is the host (the legal notice names it). */
export const atMostOneHost: GlobalBeforeChangeHook = ({ data, req }) => {
  const suppliers = (data?.suppliers ?? []) as { isHost?: boolean }[];
  if (suppliers.filter((s) => s.isHost).length > 1) {
    throw new APIError(adminText(req?.i18n?.language)("settings.oneHost"), 400, undefined, true);
  }
  return data;
};
