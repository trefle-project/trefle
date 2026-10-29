import type { CollectionConfig } from "payload";

import { isAdminOrEditor } from "../access";
import { pageStatsExportEndpoint, pageStatsSeriesEndpoint } from "../endpoints/pageStatsReport";
import { sameInBoth } from "../i18n";

/**
 * Per-page daily counters (T039, FR-037 / SC-009). One row per (page, date).
 * Incremented only by the service endpoints (page-view, lead-intake) with
 * overrideAccess; never written through the admin.
 */
export const PageStats: CollectionConfig = {
  slug: "page-stats",
  labels: { singular: sameInBoth("Pages Stats"), plural: sameInBoth("Pages Stats") },
  admin: {
    group: sameInBoth("Reports"),
    useAsTitle: "date",
    components: {
      // 022-ux-improvement (US1) — one row per page with its totals over the
      // period (the stored rows are per page and day); replaces the list and
      // its 010 date filter.
      views: { list: { Component: "@/components/PageStatsView#default" } },
    },
  },
  access: {
    read: isAdminOrEditor,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  indexes: [{ fields: ["page", "date"], unique: true }],
  // 022-ux-improvement (US1) — chart data and CSV of the totals view.
  endpoints: [pageStatsSeriesEndpoint, pageStatsExportEndpoint],
  fields: [
    // 022-ux-improvement (US1, spec FR-004) — not required: deleting a page
    // keeps its counters (page → null by the FK) so Pages Stats can sum them
    // on one « Pages supprimées » row; they used to be deleted with the page.
    { name: "page", type: "relationship", relationTo: "pages" },
    { name: "date", type: "date", required: true, admin: { date: { pickerAppearance: "dayOnly" } } },
    { name: "views", type: "number", defaultValue: 0, required: true },
    { name: "submissions", type: "number", defaultValue: 0, required: true },
  ],
};
