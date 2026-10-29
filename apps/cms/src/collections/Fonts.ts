import type { CollectionBeforeValidateHook, CollectionConfig } from "payload";
import { ValidationError } from "payload";

import { isAdmin, isStaffOrService } from "../access";
import { mediaUniqueKey } from "../hooks/media-unique-key";
import { sameInBoth } from "../i18n";

/** One file per (family, weight, style, subset): a second domain using the family reuses it. */
const uniqueFace: CollectionBeforeValidateHook = async ({ data, req, originalDoc }) => {
  if (!data?.family || originalDoc) return data;
  const dup = await req.payload.find({
    collection: "fonts",
    where: {
      and: [
        { family: { equals: data.family } },
        { weight: { equals: data.weight } },
        { style: { equals: data.style } },
        { subset: { equals: data.subset } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (dup.totalDocs > 0) {
    throw new ValidationError({
      errors: [
        {
          path: "family",
          message: `Ce fichier de police existe déjà (${data.family} ${data.weight} ${data.style} ${data.subset}).`,
        },
      ],
    });
  }
  return data;
};

/**
 * Self-hosted web font files (015-penpot-site-import, User Story 4,
 * data-model.md). Created only by the domain fonts hook (`lib/fonts.ts`),
 * stored in the asset bucket under `fonts/`, served publicly like Media.
 * Never deleted automatically: a file is shared by every domain using its
 * family, and is a few KB.
 */
export const Fonts: CollectionConfig = {
  slug: "fonts",
  labels: { singular: sameInBoth("Font"), plural: sameInBoth("Fonts") },
  admin: {
    group: sameInBoth("Contents"),
    useAsTitle: "filename",
    listSearchableFields: ["family", "filename"],
    defaultColumns: ["family", "weight", "style", "subset", "filename", "domains"],
    description: { fr: "Fichiers que Trefle télécharge lui-même quand une famille est ajoutée aux « Polices du domaine » d'un domaine. Pour ajouter ou retirer une police, passez par ce domaine.", en: "Files Trefle downloads itself when a family is added to a domain's “Domain fonts”. To add or remove a font, go through that domain." },
  },
  access: {
    read: isStaffOrService,
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  upload: { mimeTypes: ["font/woff2"] },
  // 017-edge-protection — never-reused object keys, as for media.
  hooks: { beforeOperation: [mediaUniqueKey], beforeValidate: [uniqueFace] },
  fields: [
    { name: "family", type: "text", required: true, index: true, admin: { readOnly: true } },
    {
      name: "weight",
      type: "number",
      required: true,
      min: 100,
      max: 900,
      admin: { readOnly: true },
    },
    {
      name: "style",
      type: "select",
      required: true,
      defaultValue: "normal",
      options: [
        { label: sameInBoth("Normal"), value: "normal" },
        { label: { fr: "Italique", en: "Italic" }, value: "italic" },
      ],
      admin: { readOnly: true },
    },
    {
      name: "subset",
      type: "select",
      required: true,
      options: [
        { label: sameInBoth("Latin"), value: "latin" },
        { label: { fr: "Latin étendu", en: "Latin extended" }, value: "latin-ext" },
      ],
      admin: { readOnly: true },
    },
    { name: "unicodeRange", type: "text", admin: { readOnly: true } },
    {
      name: "source",
      type: "select",
      required: true,
      defaultValue: "google",
      options: [{ label: sameInBoth("Google Fonts"), value: "google" }],
      admin: { readOnly: true },
    },
    { name: "sha256", type: "text", index: true, admin: { readOnly: true } },
    // Which domains use this file (list column): it may be shared, or used by none.
    {
      name: "domains",
      label: { fr: "Domaines", en: "Domains" },
      type: "ui",
      admin: { components: { Cell: "@/components/FontDomains#FontDomainsCell" } },
    },
  ],
};
