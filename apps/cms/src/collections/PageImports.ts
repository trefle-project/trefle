import type { CollectionConfig, FieldAccess } from "payload";

import { isAdminOrEditor } from "../access";
import { pageImportBudgetEndpoint } from "../endpoints/pageImportBudget";
import { pageImportCancelEndpoint } from "../endpoints/pageImportCancel";
import { pageImportStartEndpoint } from "../endpoints/pageImportStart";
import { IMPORT_ERROR_CODES } from "../lib/import/errors";
import { sameInBoth } from "../i18n";

/**
 * One document per page import attempt (012-url-page-import, data-model.md).
 *
 * Nobody writes these through the REST API: the start endpoint creates them,
 * the `page-import` job moves them through their states (`overrideAccess`),
 * the cancel endpoint sets `cancelRequested`. The one exception is
 * `reportDismissed`, which the page's report panel PATCHes — so the
 * collection-level `update` lets staff through and every other field locks
 * itself with `system` below.
 */
const system: { create: FieldAccess; update: FieldAccess } = { create: () => false, update: () => false };

export const PageImports: CollectionConfig = {
  slug: "page-imports",
  labels: { singular: sameInBoth("Pages Import"), plural: sameInBoth("Pages Import") },
  admin: {
    group: sameInBoth("Imports"),
    // `title` (the new page's title), not `sourceUrl`: an import from a saved
    // file may have no address (013-saved-page-import).
    useAsTitle: "title",
    listSearchableFields: ["title", "sourceUrl"],
    // `title` added to data-model.md's columns: it's what tells imports of the same site apart.
    defaultColumns: ["sourceUrl", "sourceKind", "title", "status", "createdBy", "startedAt", "costEur", "page"],
    components: {
      // Month total vs cap + per-user spending, admins only (FR-027a/f).
      beforeListTable: ["@/components/ImportBudgetBanner#default"],
    },
  },
  access: {
    read: isAdminOrEditor,
    create: () => false,
    update: isAdminOrEditor,
    delete: () => false,
  },
  // Collection-level, not top-level: `/api/page-imports/*` is only ever
  // matched against this array once "page-imports" matches the slug (see
  // pageConflictCheck.ts). Listed before Payload's own `/:id` routes.
  endpoints: [pageImportStartEndpoint, pageImportBudgetEndpoint, pageImportCancelEndpoint],
  fields: [
    {
      // 013-saved-page-import: an address, or a page saved from the editor's browser.
      name: "sourceKind",
      label: { fr: "Source", en: "Source" },
      type: "select",
      required: true,
      defaultValue: "url",
      options: [
        { label: { fr: "Adresse", en: "Address" }, value: "url" },
        { label: { fr: "Fichier enregistré", en: "Saved file" }, value: "file" },
      ],
      access: system,
    },
    // For a file: the original address the file declares when it is public, else empty.
    { name: "sourceUrl", label: { fr: "Adresse importée", en: "Imported address" }, type: "text", access: system },
    { name: "sourceFileName", label: { fr: "Fichier importé", en: "Imported file" }, type: "text", maxLength: 200, access: system },
    { name: "finalUrl", label: { fr: "Adresse chargée", en: "Loaded address" }, type: "text", access: system },
    {
      name: "pageType",
      label: { fr: "Type de page", en: "Page type" },
      type: "select",
      required: true,
      access: system,
      options: [
        { label: { fr: "Inscription", en: "Subscription" }, value: "subscription" },
        { label: { fr: "Libre", en: "Free" }, value: "free" },
        { label: sameInBoth("Confirmation"), value: "confirmation" },
      ],
    },
    { name: "title", label: { fr: "Titre de la page", en: "Page title" }, type: "text", required: true, access: system },
    { name: "domain", label: { fr: "Domaine", en: "Domain" }, type: "relationship", relationTo: "domains", access: system },
    { name: "path", label: { fr: "Chemin", en: "Path" }, type: "text", access: system },
    { name: "language", label: { fr: "Langue", en: "Language" }, type: "relationship", relationTo: "languages", access: system },
    // 023-admin-i18n (T053): the launcher's admin language, which the AI writes its report lines in. Empty (before 023): French.
    {
      name: "reportLanguage",
      label: { fr: "Langue du rapport", en: "Report language" },
      type: "select",
      access: system,
      admin: { hidden: true },
      options: [
        { label: sameInBoth("Français"), value: "fr" },
        { label: sameInBoth("English"), value: "en" },
      ],
    },
    {
      name: "status",
      label: { fr: "Statut", en: "Status" },
      type: "select",
      required: true,
      defaultValue: "queued",
      access: system,
      options: [
        { label: { fr: "En attente", en: "Queued" }, value: "queued" },
        { label: { fr: "En cours", en: "Running" }, value: "running" },
        { label: { fr: "Terminé", en: "Completed" }, value: "completed" },
        { label: { fr: "Échec", en: "Failed" }, value: "failed" },
        { label: { fr: "Annulé", en: "Cancelled" }, value: "cancelled" },
      ],
    },
    {
      name: "step",
      label: { fr: "Étape", en: "Step" },
      type: "select",
      access: system,
      options: [
        { label: { fr: "Chargement de la page", en: "Loading the page" }, value: "render" },
        { label: { fr: "Conversion en blocs", en: "Converting to blocks" }, value: "convert" },
        { label: { fr: "Images", en: "Images" }, value: "images" },
        { label: { fr: "Construction", en: "Building" }, value: "build" },
        { label: { fr: "Vérification des formats d'écran", en: "Checking the screen sizes" }, value: "check" },
        { label: { fr: "Enregistrement", en: "Saving" }, value: "save" },
      ],
    },
    { name: "progress", label: { fr: "Progression (%)", en: "Progress (%)" }, type: "number", min: 0, max: 100, access: system },
    { name: "cancelRequested", label: { fr: "Annulation demandée", en: "Cancel requested" }, type: "checkbox", defaultValue: false, access: system },
    {
      name: "errorCode",
      label: { fr: "Code d'erreur", en: "Error code" },
      type: "select",
      access: system,
      options: IMPORT_ERROR_CODES.map((code) => ({ label: sameInBoth(code), value: code })),
    },
    // Shown on the document view (FR-004a): the reason, in plain French.
    { name: "errorMessage", label: { fr: "Erreur", en: "Error" }, type: "text", access: system },
    { name: "costUsd", label: { fr: "Coût (USD)", en: "Cost (USD)" }, type: "number", access: system },
    { name: "costEur", label: { fr: "Coût (€)", en: "Cost (€)" }, type: "number", access: system },
    { name: "aiModel", label: { fr: "Modèle IA", en: "AI model" }, type: "text", access: system },
    { name: "startedAt", label: { fr: "Démarré le", en: "Started on" }, type: "date", required: true, access: system },
    { name: "finishedAt", label: { fr: "Terminé le", en: "Finished on" }, type: "date", access: system },
    {
      name: "createdBy",
      label: { fr: "Importé par", en: "Imported by" },
      type: "relationship",
      relationTo: "users",
      required: true,
      access: system,
    },
    {
      name: "page",
      label: { fr: "Brouillon créé", en: "Draft created" },
      type: "relationship",
      relationTo: "pages",
      access: system,
      admin: { components: { Cell: "@/components/ImportPageCell#default" } },
    },
    { name: "media", label: { fr: "Images importées", en: "Imported images" }, type: "relationship", relationTo: "media", hasMany: true, access: system },
    { name: "report", label: { fr: "Rapport", en: "Report" }, type: "json", access: system },
    {
      name: "reportDismissed",
      label: { fr: "Rapport masqué", en: "Report hidden" },
      type: "checkbox",
      defaultValue: false,
      access: { create: () => false, update: ({ req }) => Boolean(isAdminOrEditor({ req } as never)) },
    },
  ],
};
