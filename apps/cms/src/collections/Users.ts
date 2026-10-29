import type { CollectionConfig } from "payload";

import { adminFieldOnly, canOpenAdmin, isAdmin, readSelf, selfOrAdminField } from "../access";
import { resetTotpEndpoint } from "../endpoints/resetTotp";
import { ADMIN_LANGUAGE_OPTIONS } from "../lib/admin-locale";
import { isValidZone } from "../lib/admin-time";
import { adminLanguageOnChange, adminLanguageOnLogin, adminLanguageOnLogout } from "../hooks/users-admin-language";
import { usersActivity, usersActivityOnDelete } from "../hooks/users-activity";
import { usersActivateOnLogin, usersSendInvite } from "../hooks/users-invite";
import { lastAdminGuardBeforeChange, lastAdminGuardBeforeDelete } from "../hooks/users-last-admin";
import { sameInBoth } from "../i18n";

/**
 * Workspace members (T010) + the renderer's service account (T012).
 *
 * Roles: `admin` | `editor` (FR-034a). `isActive: false` revokes access.
 * `isService: true` marks the API-key account the renderer uses — it can only
 * read published content (enforced per-collection via `access/publishedOnly`).
 *
 * Membership management (T080–T083): Administrators only — create/update/
 * delete are admin-only and the collection is hidden from Editors' nav
 * (`admin.hidden`, same as the Settings global). Adding a member emails a
 * set-password link; the workspace always keeps at least one active
 * Administrator (last-admin guard); every change is recorded in the activity
 * log.
 *
 * `access.admin` is NOT the place for that: on the auth collection behind the
 * admin panel, Payload uses it to decide who may open the admin panel *at
 * all*. It was admin-only until 2026-09-30, which locked every Editor out of
 * the admin (they couldn't edit pages, the core of their role — 001 US5).
 * Any active member may open the panel; what they can do there is each
 * collection's own access.
 */
export const Users: CollectionConfig = {
  slug: "users",
  auth: {
    useAPIKey: true,
    tokenExpiration: 60 * 60 * 8,
  },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["avatar", "email", "role", "isActive", "invitationStatus"],
    group: sameInBoth("Settings"),
    listSearchableFields: ["email", "name"],
    hidden: ({ user }) => (user as { role?: string } | null)?.role !== "admin",
  },
  access: {
    read: readSelf,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
    // 019 — the plugin's lockout after wrong codes is lifted by Force Unlock;
    // only an Administrator may do that (payload-totp README).
    unlock: isAdmin,
    // On the password alone: the panel must load for the code-entry view (019).
    admin: (args) => Boolean(canOpenAdmin(args)),
  },
  // 019-admin-access — Administrators reset another member's second factor.
  endpoints: [resetTotpEndpoint],
  hooks: {
    beforeChange: [lastAdminGuardBeforeChange],
    beforeDelete: [lastAdminGuardBeforeDelete],
    afterChange: [usersSendInvite, usersActivity, adminLanguageOnChange],
    afterLogin: [usersActivateOnLogin, adminLanguageOnLogin],
    // 023-admin-i18n (US2) — the member's admin language as Payload's cookie.
    afterLogout: [adminLanguageOnLogout],
    afterDelete: [usersActivityOnDelete],
  },
  fields: [
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "editor",
      saveToJWT: true,
      access: { update: adminFieldOnly },
      options: [
        { label: sameInBoth("Administrator"), value: "admin" },
        { label: sameInBoth("Editor"), value: "editor" },
      ],
      admin: { description: sameInBoth("Administrators manage members, settings and irreversible GDPR actions.") },
    },
    { name: "name", type: "text" },
    {
      // 022-ux-improvement (US5, FR-024/025) — the member's own; an
      // Administrator may set anyone's. Stored apart from `media`.
      name: "avatar",
      label: sameInBoth("Avatar"),
      type: "upload",
      relationTo: "admin-images",
      access: { update: selfOrAdminField },
      filterOptions: ({ user }) => ((user as { role?: string } | null)?.role === "admin" ? true : { uploadedBy: { equals: (user as { id?: number } | null)?.id } }),
      admin: {
        description: { fr: "Image carrée de préférence (1 Mo au plus). Sans avatar : vos initiales.", en: "A square image is best (1 MB at most). Without an avatar: your initials." },
        components: { Cell: "@/components/Avatar.client#AvatarCell" },
      },
    },
    {
      // 022-ux-improvement (US6) — dates in the admin are shown in this zone;
      // empty = the installation default (Settings → Default).
      name: "displayTimezone",
      label: { fr: "Fuseau horaire d'affichage", en: "Display time zone" },
      type: "text",
      validate: (value: unknown) => (value == null || value === "" || isValidZone(value) ? true : "Fuseau horaire inconnu."),
      access: { update: selfOrAdminField },
      admin: {
        description: { fr: "Toutes les dates de l'admin s'affichent dans ce fuseau.", en: "Every date in the admin is shown in this time zone." },
        components: { Field: { path: "@/components/TimezoneSelect.client#default", clientProps: { emptyLabel: "Par défaut de l'installation" } } },
      },
    },
    {
      // 023-admin-i18n (US2) — the admin's language for this member; empty =
      // the installation's (Settings → Default). hooks/users-admin-language.ts
      // turns it into Payload's language cookie. No `placeholder`: a select's
      // only takes a string or a function, and a function cannot reach the
      // client field config (every admin page failed to render).
      name: "adminLanguage",
      label: { fr: "Langue de l'admin", en: "Admin language" },
      type: "select",
      options: ADMIN_LANGUAGE_OPTIONS,
      access: { update: selfOrAdminField },
      admin: {
        description: {
          fr: "Vide : la langue de l'installation (Settings → Default).",
          en: "Empty: the installation's language (Settings → Default).",
        },
        components: { afterInput: ["@/components/AdminLanguageRefresh.client#default"] },
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      saveToJWT: true,
      access: { update: adminFieldOnly },
      admin: { description: sameInBoth("Unchecked = access revoked immediately.") },
    },
    {
      name: "invitationStatus",
      type: "select",
      defaultValue: "invited",
      access: { update: adminFieldOnly },
      options: [
        { label: sameInBoth("Invited (password not set)"), value: "invited" },
        { label: sameInBoth("Active"), value: "active" },
      ],
      admin: {
        position: "sidebar",
        readOnly: true,
        description: sameInBoth("Flips to Active on first sign-in."),
      },
    },
    {
      // 012-url-page-import (FR-027f) — this person's own monthly import
      // budget; only an Administrator may set it (the user may read it).
      name: "importMonthlyBudgetEur",
      label: { fr: "Budget IA mensuel (€)", en: "Monthly AI budget (€)" },
      type: "number",
      min: 0,
      access: { update: adminFieldOnly, create: adminFieldOnly },
      admin: {
        position: "sidebar",
        description: { fr: "Vide = budget par défaut des réglages. 0 = pas d'import.", en: "Empty = the default budget from the settings. 0 = no import." },
      },
    },
    {
      name: "isService",
      type: "checkbox",
      defaultValue: false,
      saveToJWT: true,
      access: { update: adminFieldOnly, create: adminFieldOnly },
      admin: {
        description: sameInBoth("Internal: the renderer's read-only API-key account. Do not use for people."),
        position: "sidebar",
      },
    },
    {
      // 019-admin-access (FR-009) — « Réinitialiser la double authentification »,
      // shown to Administrators on other members' edit views.
      name: "resetTotp",
      type: "ui",
      admin: {
        position: "sidebar",
        components: { Field: "@/components/ResetTotpButton.client#default" },
        disableListColumn: true,
      },
    },
  ],
};
