import type { CollectionConfig } from "payload";

import { isAdmin, isAdminOrEditor } from "../access";
import { sameInBoth } from "../i18n";

/**
 * Append-only audit trail (T014) — FR-034b. Never holds personal data.
 * Entries are written by hooks/endpoints (T036, T054, T063, T073, T074, T082);
 * no one edits or deletes them through the API.
 */
export const ActivityLog: CollectionConfig = {
  slug: "activity-log",
  labels: { singular: sameInBoth("Activity entry"), plural: sameInBoth("Activity log") },
  admin: {
    group: sameInBoth("Settings"),
    defaultColumns: ["type", "actor", "targetType", "targetId", "at"],
    listSearchableFields: ["type", "targetType"],
    useAsTitle: "type",
    components: {
      // 010-date-range-filters — graphical period filter on `at`.
      beforeListTable: [
        {
          path: "@/components/CollectionDateRangeFilter.client#default",
          clientProps: { fields: [{ name: "at", label: { fr: "Date", en: "Date" } }] },
        },
      ],
    },
  },
  access: {
    read: isAdminOrEditor,
    create: () => false, // written server-side only, via payload.create with overrideAccess
    update: () => false,
    delete: isAdmin, // allowed only for data-retention housekeeping of the log itself
  },
  fields: [
    {
      name: "type",
      type: "select",
      required: true,
      options: [
        "page-published",
        "page-unpublished",
        "page-content-changed",
        "page-code-changed",
        "member-invited",
        "member-role-changed",
        "member-removed",
        "settings-changed",
        "leads-exported",
        "dsr-completed",
        "retention-deletion",
        // 019-admin-access
        "totp-enrolled",
        "totp-reset",
        "totp-locked",
        "edge-synced",
      ],
    },
    {
      name: "actor",
      type: "relationship",
      relationTo: "users",
      admin: {
        description: sameInBoth("Null for system actions (e.g. retention sweep)."),
        // 022-ux-improvement (US5) — the member's avatar before their e-mail.
        components: { Cell: "@/components/Avatar.client#ActorCell" },
      },
    },
    { name: "targetType", type: "text" },
    { name: "targetId", type: "text", admin: { description: sameInBoth("Id or short label — never PII.") } },
    { name: "at", type: "date", required: true, defaultValue: () => new Date().toISOString() },
    { name: "meta", type: "json", admin: { description: sameInBoth("Non-personal detail only (counts, paths, role names).") } },
  ],
};
