import type { CollectionConfig } from "payload";

import { isAdmin, isStaffOrService } from "../access";
import { domainFontUsageEndpoint } from "../endpoints/domainFontUsage";
import { domainFontsBeforeChange } from "../hooks/domains-fonts";
import { normalizeGtmContainerId, validateGtmContainerId } from "../hooks/domains-gtm-validate";
import { FONT_WEIGHTS } from "../lib/fonts";
import { revalidateTags } from "../hooks/revalidate";
import { sameInBoth } from "../i18n";

const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})*$/;

/**
 * A host the renderer serves pages for (FR-006a). One shared workspace —
 * a domain is routing/presentation only, NOT a tenant boundary.
 * Register/edit: Administrator. Assign a page to a domain: any member.
 */
export const Domains: CollectionConfig = {
  slug: "domains",
  admin: {
    group: sameInBoth("Contents"),
    useAsTitle: "hostname",
    listSearchableFields: ["hostname", "label"],
    defaultColumns: ["hostname", "isActive", "label", "legalStatus"],
    components: {
      edit: {
        // 015-penpot-site-import — « Importer un site Penpot » for this (saved, active) domain.
        beforeDocumentControls: [{ path: "@/components/SiteImportButton#default", clientProps: { forDomain: true } }],
      },
    },
  },
  access: {
    read: isStaffOrService,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  endpoints: [domainFontUsageEndpoint],
  hooks: {
    beforeChange: [domainFontsBeforeChange],
    afterChange: [
      ({ doc }) => {
        void revalidateTags({
          reason: "domain-changed",
          tags: [`domain:${doc.id}`, `domain:host:${String(doc.hostname).toLowerCase()}`, "page-list"],
        });
      },
    ],
    afterDelete: [
      ({ doc }) => {
        void revalidateTags({
          reason: "domain-deleted",
          tags: [`domain:${doc.id}`, `domain:host:${String(doc.hostname).toLowerCase()}`, "page-list"],
        });
      },
    ],
  },
  fields: [
    {
      name: "hostname",
      type: "text",
      required: true,
      unique: true,
      index: true,
      hooks: { beforeValidate: [({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value)] },
      validate: (value: unknown) =>
        typeof value === "string" && HOSTNAME_RE.test(value)
          ? true
          : "Enter a bare hostname, lowercase, no scheme or path (e.g. promo.example.com or site.localhost).",
    },
    { name: "isActive", type: "checkbox", defaultValue: true, admin: { description: sameInBoth("Inactive ⇒ the renderer returns not-found for this host.") } },
    { name: "label", type: "text", admin: { description: sameInBoth("Admin-facing name.") } },
    {
      // 005-content-language-tagging, FR-006 — optional; pre-fills a new
      // page's `language` in the creation wizard when this domain is
      // chosen there. No effect on pages that already exist.
      name: "defaultLanguage",
      type: "relationship",
      relationTo: "languages",
      filterOptions: { isActive: { equals: true } },
      admin: { description: sameInBoth("Pre-fills the language of a new page created under this domain.") },
    },
    {
      // 006-double-optin-email, FR-006/FR-007 — optional; used as the
      // `From` for the opt-in confirmation email sent for pages on this
      // domain. Unset ⇒ leadIntakeEndpoint falls back to the platform's
      // default sender (SMTP_FROM) — no error, no admin action required.
      name: "senderName",
      type: "text",
      admin: { description: sameInBoth("Outgoing email display name, e.g. \"Trefle\". Optional.") },
    },
    {
      name: "senderEmail",
      type: "email",
      admin: { description: sameInBoth("Outgoing email address for this domain's opt-in confirmation emails. Optional — falls back to the platform default.") },
    },
    {
      name: "branding",
      type: "group",
      fields: [
        { name: "faviconUrl", type: "text" },
        { name: "defaultOgImage", type: "relationship", relationTo: "media" },
        { name: "themeTokens", type: "json" },
      ],
    },
    { name: "notFoundPagePath", type: "text", admin: { description: sameInBoth("Optional path to serve for unmatched paths on this host.") } },
    {
      // 007-gtm-tagging, FR-001/FR-002/FR-012 — per-domain, optional. Empty
      // ⇒ the renderer loads no GTM snippet for this domain, no error.
      name: "gtmContainerId",
      type: "text",
      admin: { description: sameInBoth("Google Tag Manager container id (e.g. GTM-ABC1234). Empty ⇒ no GTM snippet on this domain's pages.") },
      hooks: { beforeValidate: [({ value }) => normalizeGtmContainerId(value)] },
      validate: (value: unknown) => validateGtmContainerId(value),
    },
    {
      // 007-gtm-tagging, FR-005 — independent of gtmContainerId: an operator
      // can run a container with the banner off, or show the banner with no
      // container configured yet. Defaults to the safer (shown) state.
      name: "consentBannerEnabled",
      type: "checkbox",
      defaultValue: true,
      admin: { description: sameInBoth("Show the cookie-consent banner on this domain. Independent of the GTM container id above.") },
    },
    {
      // 015-penpot-site-import, User Story 4 (FR-024–FR-028) — Google Fonts
      // families every page of this domain can use. Saved files live in the
      // `fonts` collection; the renderer writes their @font-face rules and
      // the editor offers the families. Admin-only like the rest of the
      // domain; a Penpot import may add rows (never removes or changes one).
      name: "fonts",
      label: { fr: "Polices du domaine", en: "Domain fonts" },
      type: "array",
      labels: { singular: { fr: "Police", en: "Font" }, plural: { fr: "Polices", en: "Fonts" } },
      admin: {
        description:
          { fr: "Polices Google Fonts utilisables sur toutes les pages de ce domaine. Trefle les télécharge une fois et les sert lui-même (aucune requête vers Google depuis les pages).", en: "Google Fonts usable on every page of this domain. Trefle downloads them once and serves them itself (no request to Google from the pages)." },
        components: { RowLabel: "@/components/DomainFontRow.client#default" },
      },
      fields: [
        { name: "family", label: { fr: "Famille", en: "Family" }, type: "text", required: true, admin: { description: { fr: "Nom exact sur Google Fonts, ex. « Inter Tight », « EB Garamond ».", en: "Exact name on Google Fonts, e.g. “Inter Tight”, “EB Garamond”." } } },
        {
          name: "weights",
          label: { fr: "Graisses", en: "Weights" },
          type: "select",
          hasMany: true,
          required: true,
          defaultValue: ["400", "700"],
          options: FONT_WEIGHTS.map((w) => ({ label: sameInBoth(String(w)), value: String(w) })),
        },
        { name: "italic", label: { fr: "Aussi en italique", en: "Also in italic" }, type: "checkbox", defaultValue: false },
        { name: "files", type: "relationship", relationTo: "fonts", hasMany: true, admin: { hidden: true, readOnly: true } },
      ],
    },
    // 021-legal-pages (US4) — completeness of the domain's legal pages: banner
    // on the edit view, « Pages légales » column in the list.
    {
      name: "legalStatus",
      label: { fr: "Pages légales", en: "Legal pages" },
      type: "ui",
      admin: {
        components: {
          Field: "@/components/LegalCompleteness#DomainLegalStatus",
          Cell: "@/components/LegalCompleteness#DomainLegalStatusCell",
        },
      },
    },
    // 021-legal-pages (data-model.md) — the domain's owner: controller of its
    // leads and publisher of the site, named in its legal pages.
    {
      name: "owner",
      label: { fr: "Propriétaire du domaine", en: "Domain owner" },
      type: "group",
      admin: { description: { fr: "Responsable du traitement des leads et éditeur du site. Apparaît dans la politique de confidentialité et les mentions légales du domaine.", en: "Controller of the leads' data and publisher of the site. Appears in the domain's privacy policy and legal notice." } },
      fields: [
        { name: "name", label: { fr: "Raison sociale ou nom", en: "Company or person name" }, type: "text" },
        { name: "legalForm", label: { fr: "Forme juridique et capital", en: "Legal form and share capital" }, type: "text" },
        { name: "registration", label: { fr: "Immatriculation (RCS, SIREN…)", en: "Registration (RCS, SIREN…)" }, type: "text" },
        { name: "address", label: { fr: "Adresse", en: "Address" }, type: "textarea" },
        { name: "email", label: { fr: "E-mail pour les demandes sur les données personnelles", en: "Email for personal data requests" }, type: "email" },
        { name: "director", label: { fr: "Directeur de la publication", en: "Publication director" }, type: "text" },
      ],
    },
    {
      name: "ownPrivacyPolicyUrl",
      label: { fr: "Politique de confidentialité propre (adresse)", en: "Own privacy policy (address)" },
      type: "text",
      admin: { description: { fr: "Si le propriétaire publie sa propre politique ailleurs : les liens y mènent et /privacy y redirige.", en: "If the owner publishes their own policy elsewhere: links lead there and /privacy redirects to it." } },
    },
    {
      name: "ownLegalNoticeUrl",
      label: { fr: "Mentions légales propres (adresse)", en: "Own legal notice (address)" },
      type: "text",
      admin: { description: { fr: "Si le propriétaire publie ses propres mentions légales ailleurs : les liens y mènent et /legal-notice y redirige.", en: "If the owner publishes their own legal notice elsewhere: links lead there and /legal-notice redirects to it." } },
    },
    {
      name: "legalExtras",
      label: { fr: "Paragraphes propres au domaine", en: "Domain-specific paragraphs" },
      type: "array",
      admin: { description: { fr: "Un paragraphe par langue ajouté à la place de {{extra}} dans la politique et dans les mentions légales (par exemple un autre prestataire du propriétaire).", en: "One paragraph per language, added in place of {{extra}} in the policy and in the legal notice (for example another provider of the owner)." } },
      fields: [
        { name: "language", type: "relationship", relationTo: "languages", required: true, filterOptions: { isActive: { equals: true } } },
        { name: "privacyParagraph", label: { fr: "Politique de confidentialité", en: "Privacy policy" }, type: "richText" },
        { name: "noticeParagraph", label: { fr: "Mentions légales", en: "Legal notice" }, type: "richText" },
      ],
    },
  ],
};
