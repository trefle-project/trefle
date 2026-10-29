"use client";

import { useTranslation } from "@payloadcms/ui";

import { adminLanguageOf, adminText } from "./index";

/** 023-admin-i18n — `adminText` in the language Payload renders the admin in. */
export function useAdminText() {
  const { i18n } = useTranslation();
  const lang = adminLanguageOf(i18n.language);
  return { t: adminText(lang), lang };
}
