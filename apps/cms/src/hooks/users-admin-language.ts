import type { CollectionAfterChangeHook, CollectionAfterLoginHook, CollectionAfterLogoutHook, PayloadRequest } from "payload";

import { isAdminLanguage } from "../lib/admin-locale";

/**
 * 023-admin-i18n (US2, contracts/admin-language.md « Cookie ») — a member's
 * own admin language reaches Payload as its `payload-lng` cookie, which wins
 * over the installation's language (proxy.ts). Set at sign-in, cleared at
 * sign-out, and updated when a member saves their own account; an
 * administrator editing someone else changes no cookie. Only REST requests
 * carry `responseHeaders`; the local API sets nothing.
 */
const YEAR = 60 * 60 * 24 * 365;

function cookieName(req: PayloadRequest): string {
  return `${req.payload.config.cookiePrefix || "payload"}-lng`;
}

/** `Set-Cookie` for the member's choice, or one that expires the cookie when there is none. */
export function languageCookie(req: PayloadRequest, language: unknown): string {
  const secure = req.headers.get("x-forwarded-proto") === "https" ? "; Secure" : "";
  return isAdminLanguage(language)
    ? `${cookieName(req)}=${language}; Path=/; Max-Age=${YEAR}; SameSite=Lax${secure}`
    : `${cookieName(req)}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function setLanguageCookie(req: PayloadRequest, language: unknown): void {
  if (!req.responseHeaders) req.responseHeaders = new Headers();
  req.responseHeaders.append("Set-Cookie", languageCookie(req, language));
}

export const adminLanguageOnLogin: CollectionAfterLoginHook = async ({ user, req }) => {
  setLanguageCookie(req, (user as { adminLanguage?: unknown }).adminLanguage);
  return user;
};

export const adminLanguageOnLogout: CollectionAfterLogoutHook = async ({ req }) => {
  setLanguageCookie(req, null);
};

export const adminLanguageOnChange: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (operation !== "update" || req.user?.id !== doc.id) return doc;
  if (doc.adminLanguage === previousDoc?.adminLanguage) return doc;
  setLanguageCookie(req, doc.adminLanguage);
  return doc;
};
