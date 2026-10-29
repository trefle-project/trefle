import type { CollectionConfig } from "payload";

import { isAdmin, isAdminOrEditor } from "../access";
import { dsrOnComplete } from "../hooks/dsr-complete";
import { sameInBoth } from "../i18n";

/**
 * A recorded GDPR data-subject request (T060, FR-025–029). Editors record
 * requests and run access/portability exports; **executing an erasure** and
 * rectifying another person's data are Administrator-only (enforced on the
 * `dsr-erase` endpoint and `leads` update access, not here).
 *
 * No reopen — a new request is a new row. On completion of an erasure the
 * `email` + personal `notes` are cleared (T064).
 */
export const DataSubjectRequests: CollectionConfig = {
  slug: "data-subject-requests",
  labels: { singular: sameInBoth("Data-subject request"), plural: sameInBoth("Data-subject requests") },
  admin: {
    group: sameInBoth("Leads"),
    useAsTitle: "email",
    listSearchableFields: ["email"],
    defaultColumns: ["email", "type", "status", "receivedAt", "completedAt"],
    components: {
      beforeListTable: [
        "@/components/DsrActions.client#default", // T065
        // 010-date-range-filters — period filter on receivedAt/completedAt.
        {
          path: "@/components/CollectionDateRangeFilter.client#default",
          clientProps: {
            fields: [
              { name: "receivedAt", label: { fr: "Réception", en: "Received" } },
              { name: "completedAt", label: { fr: "Traitement terminé", en: "Completed" } },
            ],
          },
        },
      ],
    },
  },
  access: {
    // contracts §D: Editors create / read / progress requests; only an
    // Administrator may delete a recorded request (T084). Erasure execution
    // and rectification are Administrator-only on their own surfaces.
    read: isAdminOrEditor,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [dsrOnComplete],
  },
  fields: [
    // Required at creation (enforced by the UI / recording flow); cleared to
    // null by the dsr-complete hook once an erasure it covers is done (FR-027).
    { name: "email", type: "email" },
    {
      name: "type",
      type: "select",
      required: true,
      options: [
        { label: sameInBoth("Access"), value: "access" },
        { label: sameInBoth("Portability"), value: "portability" },
        { label: sameInBoth("Rectification"), value: "rectification" },
        { label: sameInBoth("Erasure"), value: "erasure" },
      ],
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "received",
      options: [
        { label: sameInBoth("Received"), value: "received" },
        { label: sameInBoth("In progress"), value: "in_progress" },
        { label: sameInBoth("Completed"), value: "completed" },
      ],
    },
    { name: "receivedAt", type: "date", required: true, defaultValue: () => new Date().toISOString() },
    { name: "completedAt", type: "date", admin: { readOnly: true } },
    { name: "notes", type: "textarea", admin: { description: sameInBoth("Non-personal handling notes.") } },
    { name: "resultRef", type: "text", admin: { readOnly: true, description: sameInBoth("Pointer to the generated export, if any.") } },
  ],
};
