import type { CollectionConfig, FieldAccess } from "payload";

import { isAdminOrEditor } from "../access";
import { siteImportAnalyseEndpoint } from "../endpoints/siteImportAnalyse";
import { siteImportCancelEndpoint } from "../endpoints/siteImportCancel";
import { siteImportStartEndpoint } from "../endpoints/siteImportStart";
import { validatePagePath } from "../hooks/pages-path-validate";
import { SITE_IMPORT_ERROR_CODES } from "../lib/import/site-errors";
import { sameInBoth } from "../i18n";

/**
 * One document per website import from a Penpot file (015-penpot-site-import,
 * data-model.md). Nobody writes these through the REST API: the analyse
 * endpoint creates them, the start endpoint fills in the choices, the
 * `site-import` job moves them through their states (`overrideAccess`), the
 * cancel endpoint sets `cancelRequested`. The one field staff may PATCH is
 * `dismissedReports` (« Supprimer le rapport » on an imported page).
 */
const system: { create: FieldAccess; update: FieldAccess } = { create: () => false, update: () => false };

export const SiteImports: CollectionConfig = {
  slug: "site-imports",
  labels: { singular: sameInBoth("Penpot Import"), plural: sameInBoth("Penpot Import") },
  admin: {
    group: sameInBoth("Imports"),
    useAsTitle: "fileName",
    listSearchableFields: ["fileName"],
    defaultColumns: ["fileName", "domain", "status", "createdBy", "startedAt", "boards"],
  },
  access: {
    read: isAdminOrEditor,
    create: () => false,
    update: isAdminOrEditor,
    delete: () => false,
  },
  // Collection-level, listed before Payload's own `/:id` routes (as in PageImports.ts).
  endpoints: [siteImportAnalyseEndpoint, siteImportStartEndpoint, siteImportCancelEndpoint],
  fields: [
    {
      name: "status",
      label: { fr: "Statut", en: "Status" },
      type: "select",
      required: true,
      defaultValue: "analysed",
      access: system,
      options: [
        { label: { fr: "Analysé (en attente du choix des pages)", en: "Analysed (waiting for the choice of pages)" }, value: "analysed" },
        { label: { fr: "En attente", en: "Queued" }, value: "queued" },
        { label: { fr: "En cours", en: "Running" }, value: "running" },
        { label: { fr: "Terminé", en: "Completed" }, value: "completed" },
        { label: { fr: "Échec", en: "Failed" }, value: "failed" },
        { label: { fr: "Annulé", en: "Cancelled" }, value: "cancelled" },
        { label: { fr: "Abandonné", en: "Abandoned" }, value: "abandoned" },
      ],
    },
    {
      name: "step",
      label: { fr: "Étape", en: "Step" },
      type: "select",
      access: system,
      options: [
        { label: { fr: "Lecture du fichier", en: "Reading the file" }, value: "parse" },
        { label: { fr: "Polices", en: "Fonts" }, value: "fonts" },
        { label: { fr: "Images", en: "Images" }, value: "images" },
        { label: { fr: "Construction des pages", en: "Building the pages" }, value: "build" },
        { label: { fr: "Vérification des formats d'écran", en: "Checking the screen sizes" }, value: "check" },
        { label: { fr: "Enregistrement des brouillons", en: "Saving the drafts" }, value: "save" },
      ],
    },
    { name: "progress", label: { fr: "Progression (%)", en: "Progress (%)" }, type: "number", min: 0, max: 100, access: system },
    { name: "fileName", label: { fr: "Fichier", en: "File" }, type: "text", maxLength: 200, required: true, access: system },
    { name: "penpotFileName", label: { fr: "Fichier Penpot", en: "Penpot file" }, type: "text", access: system },
    { name: "penpotPages", label: { fr: "Analyse", en: "Analysis" }, type: "json", access: system, admin: { hidden: true } },
    {
      name: "penpotPage",
      label: { fr: "Page Penpot importée", en: "Imported Penpot page" },
      type: "group",
      access: system,
      fields: [
        // Not `id`: Payload doesn't store a group sub-field named `id`.
        { name: "pageId", type: "text", access: system },
        { name: "name", label: { fr: "Nom", en: "Name" }, type: "text", access: system },
      ],
    },
    { name: "domain", label: { fr: "Domaine", en: "Domain" }, type: "relationship", relationTo: "domains", required: true, access: system },
    {
      name: "language",
      label: { fr: "Langue", en: "Language" },
      type: "relationship",
      relationTo: "languages",
      filterOptions: { isActive: { equals: true } },
      access: system,
    },
    {
      name: "boards",
      label: { fr: "Pages", en: "Pages" },
      type: "array",
      access: system,
      admin: { components: { Cell: "@/components/SiteImportPagesCell#default" } },
      fields: [
        { name: "boardId", type: "text", required: true, access: system },
        { name: "name", label: sameInBoth("Board"), type: "text", required: true, access: system },
        { name: "path", label: { fr: "Adresse", en: "Address" }, type: "text", required: true, access: system, validate: validatePagePath },
        { name: "page", label: { fr: "Brouillon créé", en: "Draft created" }, type: "relationship", relationTo: "pages", access: system },
        { name: "report", label: { fr: "Rapport", en: "Report" }, type: "json", access: system },
      ],
    },
    { name: "media", label: { fr: "Images importées", en: "Imported images" }, type: "relationship", relationTo: "media", hasMany: true, access: system },
    { name: "cancelRequested", label: { fr: "Annulation demandée", en: "Cancel requested" }, type: "checkbox", defaultValue: false, access: system },
    {
      name: "errorCode",
      label: { fr: "Code d'erreur", en: "Error code" },
      type: "select",
      access: system,
      options: SITE_IMPORT_ERROR_CODES.map((code) => ({ label: sameInBoth(code), value: code })),
    },
    { name: "errorMessage", label: { fr: "Erreur", en: "Error" }, type: "text", access: system },
    { name: "createdBy", label: { fr: "Importé par", en: "Imported by" }, type: "relationship", relationTo: "users", required: true, access: system },
    { name: "startedAt", label: { fr: "Démarré le", en: "Started on" }, type: "date", access: system },
    { name: "finishedAt", label: { fr: "Terminé le", en: "Finished on" }, type: "date", access: system },
    {
      // « Supprimer le rapport » on an imported page (data-model.md): the page ids whose report is gone for everyone.
      name: "dismissedReports",
      type: "json",
      admin: { hidden: true },
      access: { create: () => false, update: ({ req }) => Boolean(isAdminOrEditor({ req } as never)) },
    },
  ],
};
