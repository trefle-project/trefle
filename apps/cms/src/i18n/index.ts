import { DEFAULT_ADMIN_LANGUAGE, isAdminLanguage, type AdminLanguage } from "../lib/admin-locale";
import { en } from "./en";
import { fr, type AdminKey } from "./fr";

/**
 * 023-admin-i18n (research R5) — Trefle's admin strings in the member's
 * language. Keys are dotted paths in the catalogues (`pageStats.empty`);
 * `{{name}}` placeholders take `vars`. The language is Payload's
 * (`i18n.language`: server props, `req.i18n`, or `useAdminText` in client
 * components); anything else reads English, Payload's fallback.
 */
const CATALOGUES = { fr, en } as const;

export type AdminText = (key: AdminKey, vars?: Record<string, string | number>) => string;

export function adminLanguageOf(language: unknown): AdminLanguage {
  return isAdminLanguage(language) ? language : DEFAULT_ADMIN_LANGUAGE;
}

export function adminText(language: unknown): AdminText {
  const catalogue = CATALOGUES[adminLanguageOf(language)] as unknown as Record<string, unknown>;
  return (key, vars) => {
    const text = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalogue) as string;
    return vars ? text.replace(/\{\{(\w+)\}\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all)) : text;
  };
}

/**
 * A Trefle label that is English today and stays English in the French admin
 * too (FR-014, decided 2026-10-28): translated, with the same wording in both.
 */
export const sameInBoth = (text: string) => ({ fr: text, en: text });

export type { AdminKey };
