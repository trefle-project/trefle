import type { CollectionConfig } from "payload";

/**
 * 018-ab-significance (data-model.md, research R2–R3) — a lead sent by a
 * visitor with a `tf-visitor` id from a page under test: the variant is the
 * lead's own page. Created by the lead intake, `confirmedAt` set when the
 * opt-in is confirmed (006). Read by GrowthBook (role `growthbook_reader`)
 * for the « Lead envoyé » / « Lead confirmé » metrics. Never shown to anyone
 * (FR-009). Deleted 30 days after the test ends, or with the lead's erasure
 * or consent withdrawal (FR-007, FR-008).
 */
export const AbConversions: CollectionConfig = {
  slug: "ab-conversions",
  admin: { hidden: true },
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: "lead", type: "relationship", relationTo: "leads", required: true, unique: true },
    { name: "visitorId", type: "text", required: true },
    { name: "experimentKey", type: "text", index: true },
    { name: "variant", type: "relationship", relationTo: "pages" },
    { name: "convertedAt", type: "date" },
    { name: "confirmedAt", type: "date" },
  ],
};
