import type { Field } from "payload";
import { sameInBoth } from "../i18n";

/**
 * The `form` group on `pages` (T030, FR-007/008).
 * Exactly one `email` field is required; the consent control is implicit
 * (always rendered by the renderer, never a normal field, never pre-ticked).
 * Defaults for the consent/privacy text come from the `settings` global at
 * create time (T072) — editing `settings` afterwards never rewrites existing
 * pages (FR-018 / US4-3).
 */
const fromSettings =
  (key: "defaultConsentPurposeText" | "defaultPrivacyNoticeUrl" | "defaultPrivacyNoticeVersion") =>
  async ({ req }: { req: { payload: { findGlobal: (a: unknown) => Promise<Record<string, unknown>> } } }) => {
    try {
      const s = await req.payload.findGlobal({ slug: "settings", overrideAccess: true });
      return (s?.[key] as string | undefined) ?? undefined;
    } catch {
      return undefined;
    }
  };
export const formField: Field = {
  name: "form",
  type: "group",
  fields: [
    {
      name: "fields",
      type: "array",
      labels: { singular: sameInBoth("Field"), plural: sameInBoth("Fields") },
      admin: { description: sameInBoth("Include exactly one field of type Email.") },
      fields: [
        { name: "name", type: "text", required: true, admin: { description: sameInBoth("Machine name, e.g. firstName.") } },
        { name: "label", type: "text", required: true },
        {
          name: "type",
          type: "select",
          required: true,
          defaultValue: "text",
          options: ["email", "text", "textarea", "select", "checkbox", "tel", "radio", "number", "date"],
        },
        { name: "required", type: "checkbox", defaultValue: false },
        {
          name: "options",
          type: "array",
          admin: { condition: (_, sibling) => sibling?.type === "select" || sibling?.type === "radio" },
          fields: [
            { name: "label", type: "text", required: true },
            { name: "value", type: "text", required: true },
          ],
        },
      ],
    },
    // 023-admin-i18n (US6) — no default of its own any more: an empty label
    // is « Envoyer » or "Send" in the page's language (apps/web visitor-copy).
    // Pages saved before keep the « Envoyer » they stored.
    {
      name: "submitLabel",
      type: "text",
      admin: { description: { fr: "Laisser vide : « Envoyer », ou “Send” sur une page qui n'est pas en français.", en: "Leave empty: “Send”, or « Envoyer » on a French page." } },
    },
    { name: "successMessage", type: "textarea" },
    {
      name: "consentPurposeText",
      type: "textarea",
      defaultValue: fromSettings("defaultConsentPurposeText"),
      admin: { description: sameInBoth("Shown next to the consent checkbox. Defaults from Settings.") },
    },
    // 021-legal-pages (research R6) — empty = the domain's privacy policy
    // (/privacy); set only to point this form elsewhere on purpose.
    {
      name: "privacyNoticeUrl",
      type: "text",
      admin: { description: { fr: "Laisser vide : le lien mène à la politique de confidentialité du domaine.", en: "Leave empty: the link leads to the domain's privacy policy." } },
    },
    { name: "privacyNoticeVersion", type: "text", admin: { description: { fr: "Seulement avec une adresse propre ci-dessus.", en: "Only with an own address above." } } },
  ],
};
