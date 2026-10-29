import type { CollectionConfig } from "payload";

import { isAdmin, isStaffOrService } from "../access";
import { preventDeleteIfReferenced, preventLastActiveDeactivation } from "../hooks/languages-lifecycle";
import { sameInBoth } from "../i18n";

const CODE_RE = /^[a-z]{2}$/;

/**
 * 005-content-language-tagging, US1 — the admin-manageable set of languages
 * `pages.language`/`domains.defaultLanguage` can point at. Deliberately a
 * real collection, not a fixed `select` enum like `pageType`: adding a fifth
 * language later is an administrator task, not a deployment (spec.md
 * Clarifications). Seeded at launch with fr/en/es/de (FR-002) via the
 * migration — see research.md §5.
 *
 * Retiring a language is done by flipping `isActive` off, never by
 * deleting the row: deletion is guarded (see `../hooks/languages-lifecycle`)
 * and deactivation never touches anything that already references it
 * (FR-004).
 */
export const Languages: CollectionConfig = {
  slug: "languages",
  admin: { group: sameInBoth("Settings"), useAsTitle: "label", defaultColumns: ["code", "label", "isActive"], listSearchableFields: ["code", "label"] },
  access: {
    read: isStaffOrService,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [preventLastActiveDeactivation],
    beforeDelete: [preventDeleteIfReferenced],
  },
  fields: [
    {
      name: "code",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: { description: sameInBoth("ISO 639-1, e.g. fr, en, es, de.") },
      hooks: { beforeValidate: [({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value)] },
      validate: (value: unknown) =>
        typeof value === "string" && CODE_RE.test(value) ? true : "Enter a two-letter lowercase ISO 639-1 code (e.g. fr, en, es, de).",
    },
    { name: "label", type: "text", required: true, admin: { description: sameInBoth("Human-readable display name (e.g. Français).") } },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      admin: { description: sameInBoth("Inactive ⇒ no longer offered for a new page/domain selection; existing references are unaffected.") },
    },
  ],
};
