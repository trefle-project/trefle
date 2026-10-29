import type { CollectionConfig } from "payload";

/**
 * 018-ab-significance (data-model.md, research R2) — the first time a visitor
 * (anonymous `tf-visitor` id) was shown a variant of a running test. Written
 * only by `POST /api/ab-exposure-batch` (batches from the edge Worker's
 * queue), first exposure wins; read by GrowthBook through the read-only role
 * `growthbook_reader` (infra/growthbook/config.yml). Never shown to anyone
 * (FR-009): no admin view, no API access. Deleted 30 days after the test
 * ends (retention sweep).
 */
export const AbExposures: CollectionConfig = {
  slug: "ab-exposures",
  admin: { hidden: true },
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  indexes: [{ fields: ["visitorId", "experimentKey"], unique: true }],
  fields: [
    { name: "visitorId", type: "text", required: true },
    { name: "experimentKey", type: "text", required: true, index: true },
    { name: "variant", type: "relationship", relationTo: "pages", required: true },
    { name: "domain", type: "relationship", relationTo: "domains", required: true },
    { name: "exposedAt", type: "date", required: true },
  ],
};
