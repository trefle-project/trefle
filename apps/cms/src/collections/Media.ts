import type { CollectionBeforeChangeHook, CollectionConfig, TextFieldSingleValidation } from "payload";
import { uploadEditsOnce } from "../hooks/upload-edits-once";

import { isAdminOrEditor, isStaffOrService } from "../access";
import { mediaAliasesEndpoint } from "../endpoints/mediaAliases";
import { mediaUsageEndpoint } from "../endpoints/mediaUsage";
import { recordPreviousFilename, revalidateAliasesOnChange, revalidateAliasesOnDelete } from "../hooks/media-aliases";
import { mediaDeleteGuard } from "../hooks/media-delete-guard";
import { mediaUniqueKey } from "../hooks/media-unique-key";
import { sameInBoth } from "../i18n";

type MediaData = { alt?: unknown; altPending?: unknown };

const hasText = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";

/** `alt` is required unless the image is flagged `altPending`. */
export const validateAlt: TextFieldSingleValidation = (value, { siblingData }) => {
  if (hasText(value)) return true;
  if ((siblingData as MediaData | undefined)?.altPending === true) return true;
  return "Décrivez l'image (texte alternatif), pour les lecteurs d'écran et le référencement.";
};

export const clearAltPendingOnDescribe: CollectionBeforeChangeHook = ({ data }) => {
  const d = data as MediaData;
  if (d && hasText(d.alt) && d.altPending) return { ...data, altPending: false };
  return data;
};

/**
 * Uploaded assets (T028). Stored in the S3-compatible bucket (Garage / MinIO)
 * via the storage-s3 plugin; only the object key + metadata live in Postgres.
 * Published pages reference images through ImgProxy signed URLs (T086).
 */
export const Media: CollectionConfig = {
  slug: "media",
  admin: {
    group: sameInBoth("Contents"),
    listSearchableFields: ["filename", "alt"],
    // 012-url-page-import — "À décrire" shows which imported images still need
    // a description; the list's filter ("À décrire" is true) finds them all.
    defaultColumns: ["filename", "alt", "altPending", "updatedAt"],
    components: {
      // 017-edge-protection — where the image is used, and a confirmation
      // before a new file replaces it on every page (contracts/media-usage.md).
      edit: {
        beforeDocumentControls: ["@/components/MediaUsage.client#default"],
        SaveButton: "@/components/MediaReplaceConfirm.client#default",
      },
      // 010-date-range-filters — no custom date field on this collection,
      // only Payload's own implicit createdAt/updatedAt.
      beforeListTable: [
        {
          path: "@/components/CollectionDateRangeFilter.client#default",
          clientProps: {
            fields: [
              { name: "createdAt", label: { fr: "Ajout", en: "Added" } },
              { name: "updatedAt", label: { fr: "Dernière modification", en: "Last modified" } },
            ],
          },
        },
      ],
    },
  },
  access: {
    read: isStaffOrService,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  upload: {
    mimeTypes: ["image/*", "application/pdf"],
  },
  hooks: {
    // 017-edge-protection — never-reused object keys, old keys kept as aliases.
    beforeOperation: [mediaUniqueKey, uploadEditsOnce],
    // 012-url-page-import — writing a description clears "À décrire".
    beforeChange: [clearAltPendingOnDescribe, recordPreviousFilename],
    afterChange: [revalidateAliasesOnChange],
    beforeDelete: [mediaDeleteGuard],
    afterDelete: [revalidateAliasesOnDelete],
  },
  endpoints: [mediaAliasesEndpoint, mediaUsageEndpoint],
  fields: [
    {
      name: "alt",
      type: "text",
      // Required, except for an image imported without a source description
      // and flagged "À décrire" (FR-013): manual uploads still need one.
      validate: validateAlt,
      admin: { description: sameInBoth("Describe the image for screen readers and SEO.") },
    },
    {
      name: "altPending",
      label: { fr: "À décrire", en: "To describe" },
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description: { fr: "Image importée sans description : ajoutez-en une avant de publier.", en: "Imported image without a description: add one before publishing." },
      },
    },
    {
      name: "importedBy",
      label: sameInBoth("Import"),
      type: "relationship",
      relationTo: "page-imports",
      admin: { position: "sidebar", readOnly: true, condition: (data) => Boolean(data?.importedBy) },
    },
    {
      // 017-edge-protection (data-model.md) — every key this media item has had
      // before its current one, oldest first; the renderer maps them to the
      // current key so pages keep working after a replacement. Appended by
      // `recordPreviousFilename`. Never edited by people.
      name: "previousFilenames",
      type: "array",
      access: { create: () => false, update: () => false },
      admin: { hidden: true, readOnly: true },
      fields: [{ name: "filename", type: "text", required: true }],
    },
  ],
};
