import type { CollectionConfig } from "payload";

import { isAdminOrEditor, isStaffOrService } from "../access";
import { preventDeleteIfReferenced } from "../hooks/optin-emails-lifecycle";
import { sameInBoth } from "../i18n";

const CONFIRM_URL_PLACEHOLDER = "{{confirmUrl}}";

/**
 * 006-double-optin-email, US1 — the double opt-in confirmation email a
 * subscription page can attach (`pages.optInEmail`). Deliberately its own
 * collection, mirroring `pages.confirmationPage`'s "optional attached
 * content" shape — NOT the same concept as `pageType: "confirmation"` /
 * `pages.confirmationPage` (the post-submission thank-you page): this is
 * content that gets emailed, never rendered on the site. Every
 * name here says "opt-in"/"email", never bare "confirmation" (spec.md
 * Context).
 */
export const OptInEmails: CollectionConfig = {
  slug: "opt-in-emails",
  labels: { singular: sameInBoth("Conf. email"), plural: sameInBoth("Conf. emails") },
  admin: { group: sameInBoth("Contents"), useAsTitle: "subject", defaultColumns: ["subject", "language"], listSearchableFields: ["subject", "body"] },
  access: {
    read: isStaffOrService,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  hooks: {
    beforeDelete: [preventDeleteIfReferenced],
  },
  fields: [
    { name: "subject", type: "text", required: true },
    {
      name: "body",
      type: "textarea",
      required: true,
      admin: {
        description: sameInBoth(
          `Sent as-is as the email's HTML body. Must contain the literal ${CONFIRM_URL_PLACEHOLDER} placeholder — it's replaced with the lead's own confirmation link at send time.`,
        ),
      },
      validate: (value: unknown) =>
        typeof value === "string" && value.includes(CONFIRM_URL_PLACEHOLDER)
          ? true
          : `The body must include the ${CONFIRM_URL_PLACEHOLDER} placeholder.`,
    },
    {
      name: "language",
      type: "relationship",
      relationTo: "languages",
      required: true,
      filterOptions: { isActive: { equals: true } },
      admin: { description: sameInBoth("Must match the language of any page this is attached to.") },
    },
  ],
};
