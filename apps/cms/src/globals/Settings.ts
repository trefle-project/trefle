import type { GlobalConfig } from "payload";

import { isAdmin, isStaffOrService } from "../access";
import { revalidateTags } from "../hooks/revalidate";
import { atMostOneHost, requireFrenchBannerTranslation, requireFrenchLegalTexts } from "../hooks/settings-cookie-banner";
import { settingsActivity } from "../hooks/settings-activity";
import { reapplyBranding, variantSameSizeAsPattern } from "../hooks/settings-branding";
import { adminLanguageEndpoint } from "../endpoints/adminLanguage";
import { ADMIN_LANGUAGE_OPTIONS } from "../lib/admin-locale";
import { DEFAULT_ZONE, isValidZone } from "../lib/admin-time";
import { sameInBoth } from "../i18n";

/**
 * Workspace settings (T013) — one shared workspace, so a Payload global.
 * Read: Administrator + Editor + the renderer's service account (widened
 * for 007-gtm-tagging — the public renderer must read
 * `cookieBannerTranslations` live, the same way it already reads `domains`
 * under `isStaffOrService`; nothing else here is more sensitive than what
 * the renderer already reads off `domains`, e.g. `senderEmail`). Update:
 * Administrator only (FR-034a). The `settings-changed` activity entry +
 * no-cascade guarantee land in T073.
 */
export const Settings: GlobalConfig = {
  slug: "settings",
  // 022-ux-improvement (US2) — menu: Settings → Default.
  label: sameInBoth("Default"),
  admin: {
    group: sameInBoth("Settings"),
    // T083 (US5): Editors may read settings (contracts §D) but never manage
    // them — hide the nav entry so it is not openable in the admin UI.
    hidden: ({ user }) => (user as { role?: string } | null)?.role !== "admin",
  },
  access: {
    read: isStaffOrService,
    update: isAdmin,
  },
  // 023-admin-i18n — the installation's admin language, for proxy.ts.
  endpoints: [adminLanguageEndpoint],
  hooks: {
    beforeChange: [requireFrenchBannerTranslation, requireFrenchLegalTexts, atMostOneHost, variantSameSizeAsPattern],
    afterChange: [
      settingsActivity,
      // 022-ux-improvement (US4) — tab title, favicon, 2FA issuer follow the operator.
      reapplyBranding,
      // 007-gtm-tagging — a cookieBannerTranslations edit takes effect on
      // the next request rather than waiting for the ISR fallback window.
      () => {
        void revalidateTags({ reason: "settings-changed", tags: ["settings"] });
      },
    ],
  },
  fields: [
    // 022-ux-improvement (US2, FR-012) — unnamed tabs: layout only, the
    // stored data and the API keep the same top-level fields.
    {
      type: "tabs",
      tabs: [
        {
          label: { fr: "Général", en: "General" },
          fields: [
            {
              name: "retentionMonths",
              label: { fr: "Conservation des leads (mois)", en: "Lead retention (months)" },
              type: "number",
              required: true,
              defaultValue: 24,
              min: 1,
              admin: { description: { fr: "Les leads plus anciens sont effacés automatiquement.", en: "Older leads are erased automatically." } },
            },
            {
              // 022-ux-improvement (US6) — members without their own choice see
              // admin dates in this zone; the login page too.
              name: "adminTimezone",
              label: { fr: "Fuseau horaire par défaut", en: "Default time zone" },
              type: "text",
              required: true,
              defaultValue: DEFAULT_ZONE,
              validate: (value: unknown) => (isValidZone(value) ? true : "Fuseau horaire inconnu."),
              admin: {
                description: { fr: "Fuseau des dates de l'admin pour les membres qui n'en ont pas choisi un dans leur compte.", en: "Time zone of the admin's dates for members who have not chosen one in their account." },
                components: { Field: "@/components/TimezoneSelect.client#default" },
              },
            },
            {
              // 023-admin-i18n (US1) — members without their own choice see the
              // admin in this language; the login page too. A fresh install
              // starts in English, an upgraded one in French (migration).
              name: "adminLanguage",
              label: { fr: "Langue de l'admin par défaut", en: "Default admin language" },
              type: "select",
              required: true,
              defaultValue: "en",
              options: ADMIN_LANGUAGE_OPTIONS,
              admin: {
                description: {
                  fr: "Langue de l'admin pour les membres qui n'en ont pas choisi une dans leur compte, et de la page de connexion.",
                  en: "Admin language for members who have not chosen one in their account, and for the login page.",
                },
              },
            },
            {
              name: "exportConsentedOnlyByDefault",
              label: { fr: "Exporter uniquement les leads consentants par défaut", en: "Export only consenting leads by default" },
              type: "checkbox",
              defaultValue: true,
              admin: { description: { fr: "Les exports de leads excluent les consentements retirés, sauf choix contraire.", en: "Lead exports leave out withdrawn consents, unless chosen otherwise." } },
            },
            {
              // 012-url-page-import (FR-027) — the workspace's monthly ceiling on
              // import spending, and the default per-user budget.
              name: "importMonthlyCapEur",
              label: { fr: "Plafond mensuel des imports (€)", en: "Monthly import cap (€)" },
              type: "number",
              required: true,
              defaultValue: 20,
              min: 0,
              admin: { description: { fr: "0 désactive les imports.", en: "0 turns imports off." } },
            },
            {
              name: "importDefaultUserBudgetEur",
              label: { fr: "Budget d'import par défaut par utilisateur (€)", en: "Default import budget per user (€)" },
              type: "number",
              required: true,
              defaultValue: 10,
              min: 0,
              admin: { description: { fr: "Budget mensuel des utilisateurs sans budget propre", en: "Monthly budget of the users without a budget of their own" } },
            },
            {
              name: "importUsdToEurRate",
              label: { fr: "Taux de change USD → EUR des imports", en: "USD → EUR exchange rate of the imports" },
              type: "number",
              required: true,
              defaultValue: 0.92,
              min: 0.01,
              admin: { description: { fr: "Convertit le coût du service de conversion (facturé en dollars).", en: "Converts the cost of the conversion service (billed in dollars)." } },
            },
            { name: "senderEmail", label: { fr: "Adresse d'envoi des e-mails", en: "Sender address of the emails" }, type: "text", admin: { description: { fr: "Expéditeur des invitations et des notifications.", en: "Sender of the invitations and the notifications." } } },
            { name: "notifyOnNewLead", label: { fr: "Prévenir à chaque nouveau lead", en: "Notify on every new lead" }, type: "checkbox", defaultValue: false },
            {
              name: "notifyEmails",
              label: { fr: "Adresses à prévenir", en: "Addresses to notify" },
              type: "array",
              fields: [{ name: "email", label: { fr: "E-mail", en: "Email" }, type: "email", required: true }],
              admin: { condition: (data) => Boolean(data?.notifyOnNewLead) },
            },
            {
              // 022-ux-improvement (US4, contracts/admin-ui.md) — the operator's
              // identity in the admin; an empty image slot shows Trefle's own
              // (lib/branding.ts DEFAULT_IMAGES).
              type: "collapsible",
              label: { fr: "Apparence de l'admin", en: "Admin appearance" },
              admin: { initCollapsed: false },
              fields: [
                { name: "adminLogo", label: { fr: "Logo (page de connexion)", en: "Logo (login page)" }, type: "upload", relationTo: "admin-images", admin: { description: { fr: "Vide : le trèfle Trefle.", en: "Empty: the Trefle clover." } } },
                { name: "adminIcon", label: { fr: "Icône du menu (carrée)", en: "Menu icon (square)" }, type: "upload", relationTo: "admin-images", admin: { description: { fr: "Vide : le trèfle Trefle.", en: "Empty: the Trefle clover." } } },
                { name: "adminFavicon", label: { fr: "Favicon (carré)", en: "Favicon (square)" }, type: "upload", relationTo: "admin-images", admin: { description: { fr: "Vide : le trèfle Trefle.", en: "Empty: the Trefle clover." } } },
                {
                  name: "adminPattern",
                  label: { fr: "Motif du fond d'écran", en: "Background pattern" },
                  type: "upload",
                  relationTo: "admin-images",
                  admin: { description: { fr: "Répété en mosaïque derrière tous les écrans de l'admin et la page de connexion. Vide : petits trèfles Trefle.", en: "Tiled behind every admin screen and the login page. Empty: small Trefle clovers." } },
                },
                {
                  name: "adminVariant",
                  label: { fr: "Variante du motif", en: "Pattern variant" },
                  type: "upload",
                  relationTo: "admin-images",
                  admin: { description: { fr: "Même taille que le motif ; remplace le motif sur quelques cases tirées au hasard. Vide avec le motif Trefle : un trèfle à quatre feuilles.", en: "Same size as the pattern; replaces the pattern on a few tiles picked at random. Empty with the Trefle pattern: a four-leaf clover." } },
                },
                {
                  name: "variantMode",
                  label: { fr: "Apparition de la variante", en: "How the variant shows" },
                  type: "select",
                  defaultValue: "oneIn",
                  options: [
                    { label: { fr: "K par écran", en: "K per screen" }, value: "perScreen" },
                    { label: { fr: "1 sur N", en: "1 in N" }, value: "oneIn" },
                  ],
                  admin: { condition: (data) => Boolean(data?.adminVariant) || !data?.adminPattern },
                },
                {
                  name: "variantCount",
                  label: { fr: "Nombre de variantes par écran (K)", en: "Number of variants per screen (K)" },
                  type: "number",
                  defaultValue: 1,
                  min: 1,
                  max: 100,
                  admin: { condition: (data) => (Boolean(data?.adminVariant) || !data?.adminPattern) && data?.variantMode !== "oneIn" },
                },
                {
                  name: "variantOneIn",
                  label: { fr: "Une case sur N", en: "One tile in N" },
                  type: "number",
                  defaultValue: 100,
                  min: 2,
                  max: 1000000,
                  admin: {
                    condition: (data) => (Boolean(data?.adminVariant) || !data?.adminPattern) && data?.variantMode === "oneIn",
                    description: { fr: "Ex. motif 15×15 sur un écran 4K : 36 864 cases ; « 1 sur 36 864 » donne une variante par écran en moyenne.", en: "E.g. a 15×15 pattern on a 4K screen: 36,864 tiles; “1 in 36,864” gives one variant per screen on average." },
                  },
                },
                {
                  name: "veilOpacity",
                  label: { fr: "Opacité du voile (%)", en: "Veil opacity (%)" },
                  type: "number",
                  defaultValue: 60,
                  min: 0,
                  max: 100,
                  admin: {
                    description: { fr: "Couleur de fond de l'admin posée sur le motif pour garder les écrans lisibles. 0 = motif brut, 100 = motif caché.", en: "The admin's background colour laid over the pattern to keep the screens readable. 0 = bare pattern, 100 = pattern hidden." },
                  },
                },
              ],
            },
            // 021-legal-pages — no longer used: forms link to their domain's policy.
            // Kept (hidden) until a later release removes them (Principle III).
            { name: "defaultPrivacyNoticeUrl", type: "text", admin: { hidden: true } },
            { name: "defaultPrivacyNoticeVersion", type: "text", admin: { hidden: true } },
          ],
        },
        {
          label: { fr: "Entités légales", en: "Legal entities" },
          fields: [
            // 021-legal-pages (data-model.md) — the installation's operator (processor
            // and host), its suppliers, and the legal texts per language. Never
            // hard-coded: whoever runs a Trefle installation fills them.
            {
              name: "operatorLegalStatus",
              type: "ui",
              admin: { components: { Field: "@/components/LegalCompleteness#OperatorLegalStatus" } },
            },
            {
              name: "operator",
              label: { fr: "Opérateur de l'installation", en: "Operator of the installation" },
              type: "group",
              admin: { description: { fr: "La société qui fournit et héberge les sites (sous-traitant des propriétaires de domaine). Apparaît dans chaque politique de confidentialité et mentions légales.", en: "The company that provides and hosts the sites (processor for the domain owners). Appears in every privacy policy and legal notice." } },
              fields: [
                { name: "name", label: { fr: "Raison sociale", en: "Company name" }, type: "text" },
                { name: "legalForm", label: { fr: "Forme juridique et capital", en: "Legal form and share capital" }, type: "text" },
                { name: "registration", label: { fr: "Immatriculation (RCS, SIREN…)", en: "Registration (RCS, SIREN…)" }, type: "text" },
                { name: "address", label: { fr: "Adresse", en: "Address" }, type: "textarea" },
                { name: "email", label: { fr: "E-mail de contact", en: "Contact email" }, type: "email" },
                { name: "phone", label: { fr: "Téléphone", en: "Phone" }, type: "text" },
              ],
            },
            {
              name: "suppliers",
              label: { fr: "Sous-traitants", en: "Processors" },
              type: "array",
              admin: { description: { fr: "Prestataires qui traitent des données des visiteurs pour l'opérateur (sous-traitants ultérieurs), dans l'ordre d'affichage. Marquez celui qui héberge les sites.", en: "Providers that process visitor data for the operator (sub-processors), in display order. Mark the one that hosts the sites." } },
              fields: [
                { name: "name", label: { fr: "Nom", en: "Name" }, type: "text", required: true },
                { name: "role", label: { fr: "Rôle", en: "Role" }, type: "text", required: true },
                { name: "location", label: { fr: "Localisation", en: "Location" }, type: "text" },
                { name: "safeguards", label: { fr: "Garanties (transferts hors UE)", en: "Safeguards (transfers outside the EU)" }, type: "text" },
                { name: "isHost", label: { fr: "Hébergeur des sites", en: "Host of the sites" }, type: "checkbox", defaultValue: false },
                { name: "address", label: { fr: "Adresse (hébergeur)", en: "Address (host)" }, type: "textarea", admin: { condition: (_data, sibling) => Boolean(sibling?.isHost) } },
                { name: "phone", label: { fr: "Téléphone (hébergeur)", en: "Phone (host)" }, type: "text", admin: { condition: (_data, sibling) => Boolean(sibling?.isHost) } },
              ],
            },
          ],
        },
        {
          label: { fr: "Textes légaux", en: "Legal texts" },
          fields: [
            {
              name: "legalTexts",
              label: { fr: "Textes juridiques", en: "Legal texts" },
              type: "array",
              admin: {
                description: {
                  fr: `Politique de confidentialité et mentions légales, une ligne par langue (le français est obligatoire : langue de repli). Variables : {{owner.name}}, {{owner.legalForm}}, {{owner.registration}}, {{owner.address}}, {{owner.email}}, {{owner.director}}, {{operator.name}}, {{operator.legalForm}}, {{operator.registration}}, {{operator.address}}, {{operator.email}}, {{operator.phone}}, {{host.name}}, {{host.address}}, {{host.phone}}, {{site}}, {{retention.leads}} ; seules dans un paragraphe : {{suppliers}} (liste des sous-traitants), {{extra}} (paragraphe propre au domaine) ; en tête de paragraphe : {{cookieBanner}} (paragraphe gardé seulement si le domaine affiche le bandeau). Un paragraphe dont une variable est vide n'est pas affiché. Modèle à relire : ce n'est pas un avis juridique.`,
                  en: `Privacy policy and legal notice, one row per language (French is required: fallback language). Variables: {{owner.name}}, {{owner.legalForm}}, {{owner.registration}}, {{owner.address}}, {{owner.email}}, {{owner.director}}, {{operator.name}}, {{operator.legalForm}}, {{operator.registration}}, {{operator.address}}, {{operator.email}}, {{operator.phone}}, {{host.name}}, {{host.address}}, {{host.phone}}, {{site}}, {{retention.leads}}; alone in a paragraph: {{suppliers}} (list of processors), {{extra}} (the domain's own paragraph); at the start of a paragraph: {{cookieBanner}} (paragraph kept only if the domain shows the banner). A paragraph with an empty variable is not shown. A template to review: this is not legal advice.`,
                },
              },
              fields: [
                { name: "language", label: { fr: "Langue", en: "Language" }, type: "relationship", relationTo: "languages", required: true, filterOptions: { isActive: { equals: true } } },
                { name: "privacyPolicy", label: { fr: "Politique de confidentialité", en: "Privacy policy" }, type: "richText" },
                { name: "legalNotice", label: { fr: "Mentions légales", en: "Legal notice" }, type: "richText" },
                { name: "policyLinkLabel", label: { fr: "Libellé du lien « Confidentialité »", en: "Label of the “Privacy” link" }, type: "text" },
                { name: "noticeLinkLabel", label: { fr: "Libellé du lien « Mentions légales »", en: "Label of the “Legal notice” link" }, type: "text" },
              ],
            },
          ],
        },
        {
          label: sameInBoth("Consents default"),
          fields: [
            {
              name: "defaultConsentPurposeText",
              label: { fr: "Texte de consentement par défaut des formulaires", en: "Default consent text of the forms" },
              type: "textarea",
            },
            {
              // 007-gtm-tagging, FR-014 — the cookie-consent banner's text, one row
              // per language, reusing 005-content-language-tagging's Languages list
              // rather than a second one. A French row must always remain (enforced
              // by requireFrenchBannerTranslation below) — it's FR-014's ultimate
              // fallback when a page's language has no translation of its own yet.
              name: "cookieBannerTranslations",
              label: { fr: "Bandeau cookies", en: "Cookie banner" },
              type: "array",
              admin: { description: { fr: "Texte du bandeau de consentement aux cookies, une ligne par langue. Une ligne en français est obligatoire.", en: "Text of the cookie consent banner, one row per language. A row in French is required." } },
              fields: [
                { name: "language", label: { fr: "Langue", en: "Language" }, type: "relationship", relationTo: "languages", required: true, filterOptions: { isActive: { equals: true } } },
                { name: "title", label: { fr: "Titre", en: "Title" }, type: "text", required: true },
                { name: "body", label: { fr: "Texte", en: "Text" }, type: "textarea", required: true },
                { name: "acceptLabel", label: { fr: "Bouton « Accepter »", en: "“Accept” button" }, type: "text", required: true },
                { name: "rejectLabel", label: { fr: "Bouton « Refuser »", en: "“Reject” button" }, type: "text", required: true },
                { name: "revisitLabel", label: { fr: "Bouton « Gérer les cookies »", en: "“Manage cookies” button" }, type: "text", required: true },
              ],
            },
          ],
        },
      ],
    },
  ],
};
