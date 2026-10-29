import type { CollectionConfig } from "payload";

/**
 * 022-ux-improvement (US1, data-model.md) — per-page hourly counters, next to
 * the daily `page-stats` rows and written by the same upsert
 * (`incrementPageStat`). They give Pages Stats its hour-by-hour chart and its
 * days cut in the member's time zone. Kept 90 days (retention sweep); never
 * written or shown through the admin.
 */
export const PageStatsHourly: CollectionConfig = {
  slug: "page-stats-hourly",
  admin: { hidden: true },
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  indexes: [{ fields: ["page", "hour"], unique: true }],
  fields: [
    // Not required: a deleted page's counters stay (page → null) and are
    // summed on Pages Stats' « Pages supprimées » row.
    { name: "page", type: "relationship", relationTo: "pages" },
    // UTC hour bucket, e.g. 2026-10-23T14:00:00.000Z
    { name: "hour", type: "date", required: true, index: true },
    { name: "views", type: "number", defaultValue: 0, required: true },
    { name: "submissions", type: "number", defaultValue: 0, required: true },
  ],
};
