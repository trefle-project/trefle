import type { Field, PayloadRequest, TextareaField } from "payload";

import { CONSENT_VALUES, CUSTOM_CODE_MAX_LENGTH } from "@trefle/shared";

import { adminFieldOnly, adminOrServiceFieldRead } from "../access";
import { adminLanguageOf, adminText, sameInBoth } from "../i18n";
import { formatNumber } from "../lib/admin-locale";

/**
 * 014-custom-code-editing — the page's admin-only code (data-model.md):
 * the two page scripts (User Story 1) and the « Code personnalisé » block
 * contents (User Story 3). Kept apart from `builder.html` on purpose: it
 * never goes through the page-markup sanitizer, never reaches the GrapesJS
 * canvas, and never reaches an editor's browser (research R1, R5).
 *
 * Field-level access on the group is the whole permission model: editors
 * get the group omitted from every read and their writes to it ignored
 * (the stored value is kept), whatever the route; the renderer's service
 * account reads it to emit the code with the request's CSP nonce.
 */
const CONSENT_OPTIONS = CONSENT_VALUES.map((value) => ({
  value,
  label: value === "consent" ? { fr: "Nécessite le consentement cookies", en: "Needs cookie consent" } : { fr: "Essentiel", en: "Essential" },
}));

// French "50 000" with a no-break space — spelled out rather than
// toLocaleString, whose separator (narrow or plain no-break space) depends on
// the ICU build. English "50,000".
const MAX_LABEL = String(CUSTOM_CODE_MAX_LENGTH).replace(/\B(?=(\d{3})+$)/g, "\u00a0");
type ValidateOptions = { req?: Pick<PayloadRequest, "i18n"> } | undefined;
const languageOf = (options: ValidateOptions) => options?.req?.i18n?.language;
const tooLong = (value: unknown, options?: ValidateOptions) => {
  if (typeof value !== "string" || value.length <= CUSTOM_CODE_MAX_LENGTH) return true;
  const lang = languageOf(options);
  const max = adminLanguageOf(lang) === "fr" ? MAX_LABEL : formatNumber(CUSTOM_CODE_MAX_LENGTH, "en");
  return adminText(lang)("errors.codeTooLong", { max });
};

const codeField = (label: TextareaField["label"], description?: NonNullable<TextareaField["admin"]>["description"]): TextareaField => ({
  name: "code",
  type: "textarea",
  label,
  // No `maxLength`: Payload's own message is English; `validate` gives the
  // limit in the member's language (FR-021). Same limit, one place.
  validate: tooLong,
  admin: {
    description,
    rows: 8,
    style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  },
});

const consentField: Field = {
  name: "consent",
  type: "select",
  label: { fr: "Consentement", en: "Consent" },
  // Not `required`: that would make the whole group mandatory in every
  // page create's type. Absent means "consent" everywhere (the safe side).
  defaultValue: "consent",
  options: CONSENT_OPTIONS,
  admin: {
    description: {
      fr: "« Nécessite le consentement » : exécuté seulement après « Accepter » sur le bandeau cookies (pixels, statistiques). « Essentiel » : toujours exécuté (widget sans cookie de suivi).",
      en: "“Needs consent”: runs only after “Accept” on the cookie banner (pixels, statistics). “Essential”: always runs (widget without a tracking cookie).",
    },
  },
};

export const customCodeField: Field = {
  type: "collapsible",
  label: sameInBoth("Scripts"),
  admin: {
    initCollapsed: true,
    // The group inside is unreadable for editors anyway; this only avoids an
    // empty « Scripts » section in their edit view.
    condition: (_data, _sibling, { user }) => (user as { role?: string } | null)?.role === "admin",
  },
  fields: [
    {
      name: "customCode",
      type: "group",
      label: false,
      access: { read: adminOrServiceFieldRead, create: adminFieldOnly, update: adminFieldOnly },
      fields: [
        {
          // FR-008b — "these consent snippets can never run on this domain".
          name: "scriptsWarning",
          type: "ui",
          admin: { components: { Field: "@/components/ScriptsConsentWarning.client#default" } },
        },
        {
          name: "head",
          type: "group",
          label: { fr: "Dans l'en-tête de la page", en: "In the page head" },
          fields: [
            codeField(sameInBoth("Code"), {
              fr: "Balises <meta>/<link> placées dans l'en-tête ; scripts exécutés avant le contenu de la page.",
              en: "<meta>/<link> tags placed in the head; scripts run before the page content.",
            }),
            consentField,
          ],
        },
        {
          name: "bodyEnd",
          type: "group",
          label: { fr: "En fin de page", en: "At the end of the page" },
          fields: [codeField(sameInBoth("Code"), { fr: "Exécuté après le contenu de la page.", en: "Runs after the page content." }), consentField],
        },
        {
          // User Story 3 — rows created and edited from the GrapesJS block.
          name: "blocks",
          type: "array",
          admin: { hidden: true },
          validate: (rows: unknown, options?: ValidateOptions) => {
            const ids = ((rows as { codeId?: string }[] | null | undefined) ?? []).map((r) => r?.codeId);
            return new Set(ids).size === ids.length ? true : adminText(languageOf(options))("errors.codeIdsDuplicate");
          },
          fields: [
            { name: "codeId", type: "text", required: true },
            codeField(sameInBoth("Code")),
            consentField,
          ],
        },
      ],
    },
  ],
};
