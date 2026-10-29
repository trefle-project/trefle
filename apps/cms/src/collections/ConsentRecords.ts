import type { CollectionConfig } from "payload";
import { APIError } from "payload";

import { isAdminOrEditor } from "../access";
import { sameInBoth } from "../i18n";

/**
 * Immutable consent evidence, one per consented submission (T037, FR-017).
 * Created only by the lead-intake endpoint (service context). Every field is
 * write-once except `withdrawnAt`. The personal fields (`email`, `ipAddress`,
 * `userAgent`) are nulled when the linked lead is erased — by a DSR erasure or
 * by the retention sweep (FR-031a) — keeping the rest as non-personal proof.
 */
export const ConsentRecords: CollectionConfig = {
  slug: "consent-records",
  labels: { singular: sameInBoth("Consent record"), plural: sameInBoth("Consent records") },
  admin: {
    group: sameInBoth("Leads"),
    useAsTitle: "capturedAt",
    listSearchableFields: ["email"],
    defaultColumns: ["email", "capturedAt", "withdrawnAt"],
    components: {
      // 010-date-range-filters — period filter on capturedAt/withdrawnAt.
      beforeListTable: [
        {
          path: "@/components/CollectionDateRangeFilter.client#default",
          clientProps: {
            fields: [
              { name: "capturedAt", label: { fr: "Consentement enregistré", en: "Consent recorded" } },
              { name: "withdrawnAt", label: { fr: "Consentement retiré", en: "Consent withdrawn" } },
            ],
          },
        },
      ],
    },
  },
  access: {
    read: isAdminOrEditor,
    create: () => false, // service endpoint only, via overrideAccess
    update: () => false, // withdrawal + erasure go through overrideAccess in endpoints/jobs
    delete: () => false,
  },
  hooks: {
    beforeChange: [
      ({ operation, data, originalDoc }) => {
        if (operation !== "update" || !originalDoc) return data;
        // Allow only: setting withdrawnAt, or nulling the personal fields (erasure).
        const allowed = new Set(["withdrawnAt", "email", "ipAddress", "userAgent", "updatedAt"]);
        for (const key of Object.keys(data ?? {})) {
          if (!allowed.has(key) && data![key] !== originalDoc[key]) {
            throw new APIError(`consent-records.${key} is write-once`, 400, undefined, true);
          }
        }
        return data;
      },
    ],
  },
  fields: [
    { name: "lead", type: "relationship", relationTo: "leads", required: true },
    { name: "email", type: "email" },
    { name: "consentText", type: "textarea", required: true },
    { name: "purposeText", type: "textarea", required: true },
    { name: "privacyNoticeUrl", type: "text", required: true },
    { name: "privacyNoticeVersion", type: "text", required: true },
    // 021-legal-pages (FR-011) — the archived text of that version.
    { name: "acceptedPolicy", type: "ui", admin: { components: { Field: "@/components/ConsentPolicyLink#default" } } },
    { name: "capturedAt", type: "date", required: true },
    { name: "ipAddress", type: "text" },
    { name: "userAgent", type: "text" },
    { name: "withdrawnAt", type: "date" },
    { name: "pageSnapshotRef", type: "text", admin: { description: sameInBoth("page id + content hash at capture time") } },
  ],
};
