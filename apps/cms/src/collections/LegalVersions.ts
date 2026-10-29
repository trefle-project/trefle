import type { CollectionConfig } from "payload";

import { isAdminOrEditor } from "../access";
import { sameInBoth } from "../i18n";

/**
 * 021-legal-pages (data-model.md, research R5) — every version of a domain's
 * privacy policy or legal notice, as published: written by the legal page
 * builder the first time it produces a version, then never changed. Read-only
 * proof of what a visitor was given (a consent record's version leads here);
 * never served online, never purged.
 */
export const LegalVersions: CollectionConfig = {
  slug: "legal-versions",
  labels: { singular: sameInBoth("Legal Page"), plural: sameInBoth("Legal Pages") },
  admin: {
    group: sameInBoth("Contents"),
    useAsTitle: "version",
    listSearchableFields: ["hostname", "version"],
    defaultColumns: ["hostname", "kind", "language", "version", "createdAt"],
    description: { fr: "Archive en lecture seule : chaque version de la politique de confidentialité et des mentions légales, telle que publiée.", en: "Read-only archive: every version of the privacy policy and the legal notice, as published." },
  },
  access: {
    read: isAdminOrEditor,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  indexes: [{ fields: ["domain", "kind", "language", "version"], unique: true }],
  fields: [
    // Not required: the archive outlives a deleted domain (its host name stays).
    { name: "domain", type: "relationship", relationTo: "domains" },
    { name: "hostname", type: "text", required: true },
    {
      name: "kind",
      type: "select",
      required: true,
      options: [
        { label: { fr: "Politique de confidentialité", en: "Privacy policy" }, value: "privacy" },
        { label: { fr: "Mentions légales", en: "Legal notice" }, value: "notice" },
      ],
    },
    { name: "language", type: "text", required: true },
    { name: "version", type: "text", required: true, index: true },
    { name: "html", label: { fr: "Texte publié (HTML)", en: "Published text (HTML)" }, type: "textarea", required: true },
  ],
};
