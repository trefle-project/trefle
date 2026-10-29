/**
 * 023-admin-i18n (research R2, R8) — the admin's language. Each member may
 * choose one (`users.adminLanguage`); otherwise the installation's
 * (`settings.adminLanguage`); otherwise English, a fresh install's default.
 * Numbers are formatted per language with `Intl` (no dependency). Pure: safe
 * in server and client components and in the proxy.
 */
export const ADMIN_LANGUAGES = ["fr", "en"] as const;
export type AdminLanguage = (typeof ADMIN_LANGUAGES)[number];
export const DEFAULT_ADMIN_LANGUAGE: AdminLanguage = "en";

export function isAdminLanguage(value: unknown): value is AdminLanguage {
  return typeof value === "string" && (ADMIN_LANGUAGES as readonly string[]).includes(value);
}

type Member = { adminLanguage?: string | null } | null | undefined;
type Defaults = { adminLanguage?: string | null } | null | undefined;

/** The member's choice, else the installation's, else English. */
export function effectiveLanguage(member: Member, settings: Defaults): AdminLanguage {
  for (const lang of [member?.adminLanguage, settings?.adminLanguage]) if (isAdminLanguage(lang)) return lang;
  return DEFAULT_ADMIN_LANGUAGE;
}

/** The `Intl` locale of an admin language: day-month-year order in both. */
export function intlLocale(lang: string): string {
  return lang === "fr" ? "fr-FR" : "en-GB";
}

export function formatNumber(n: number, lang: string, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale(lang), options).format(n);
}

/** `ratio` 0.123 → « 12,3 % » / « 12.3% ». */
export function formatPercent(ratio: number, lang: string, digits = 1): string {
  return formatNumber(ratio, lang, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatEur(amount: number, lang: string): string {
  return formatNumber(amount, lang, { style: "currency", currency: "EUR" });
}

/** Whether `n` takes the plural: « 0 brouillon » but "0 drafts". */
export function isPlural(n: number, lang: string): boolean {
  return lang === "fr" ? n > 1 : n !== 1;
}

/** The select options of both language fields: each language named in itself. */
export const ADMIN_LANGUAGE_OPTIONS = [
  { value: "fr", label: { fr: "Français", en: "Français" } },
  { value: "en", label: { fr: "English", en: "English" } },
];
