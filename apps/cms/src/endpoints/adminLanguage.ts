import type { Endpoint } from "payload";

import { DEFAULT_ADMIN_LANGUAGE, isAdminLanguage } from "../lib/admin-locale";

/**
 * 023-admin-i18n (contracts/admin-language.md, research R2) — the
 * installation's admin language, for proxy.ts, which puts it in the
 * Accept-Language Payload reads. Public on purpose: it runs before any
 * sign-in (login page) and tells nothing but « fr » or « en ».
 * GET /api/globals/settings/admin-language → { "language": "fr" }.
 */
export const ADMIN_LANGUAGE_PATH = "/api/globals/settings/admin-language";

export const adminLanguageEndpoint: Endpoint = {
  path: "/admin-language",
  method: "get",
  handler: async (req) => {
    const settings = (await req.payload
      .findGlobal({ slug: "settings", depth: 0, overrideAccess: true })
      .catch(() => null)) as { adminLanguage?: string | null } | null;
    const language = isAdminLanguage(settings?.adminLanguage) ? settings.adminLanguage : DEFAULT_ADMIN_LANGUAGE;
    return Response.json({ language });
  },
};
