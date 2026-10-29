import type { CollectionConfig } from "payload";

/**
 * 020-edge-html-cache (data-model.md, research R7–R8) — one row per minute
 * window of edge page views already added to `page-stats`. The edge sends the
 * last 10 closed windows every minute, so each window arrives up to 10 times:
 * `applied` (page id → views already added) makes every re-send add only what
 * is new. Written only by `POST /api/page-views/batch`, never through the
 * admin; rows older than 30 days are removed by the retention sweep.
 */
export const EdgeViewWindows: CollectionConfig = {
  slug: "edge-view-windows",
  admin: { hidden: true },
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: "windowStart", type: "date", required: true, unique: true, index: true },
    { name: "applied", type: "json", required: true, defaultValue: {} },
  ],
};
