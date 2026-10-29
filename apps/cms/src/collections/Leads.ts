import type { CollectionConfig } from "payload";

import { isAdmin, isAdminOrEditor } from "../access";
import { cascadeConsentRecordsOnDelete } from "../hooks/leads-consent-cascade";
import { sameInBoth } from "../i18n";

/**
 * A captured, consented form submission (T038, FR-010–013).
 *  - Page deletion never cascades to leads / consent records (FR-001a,
 *    FR-026); as of 005-content-language-tagging, a page can no longer be
 *    deleted at all while any lead still references it (`pages-lead-guard.ts`,
 *    a pre-existing bug fix — `page` was `required: true` but its FK was
 *    `ON DELETE SET NULL`, so a page with leads always failed to delete
 *    rather than actually orphaning them as this comment used to promise).
 *  - Rectification (`update`) is Administrator-only (FR-028); read + export are
 *    Admin + Editor.
 *  - Erasure-in-place nulls `email` / `fieldValues` / `metadata` and stamps
 *    `erasedAt`; erased leads are filtered out of every list/export.
 *  - Rows are created only by the lead-intake endpoint (service, overrideAccess).
 */
export const Leads: CollectionConfig = {
  slug: "leads",
  hooks: {
    // See leads-consent-cascade.ts: consent-records.lead is NOT NULL but
    // its FK is ON DELETE SET NULL, so deleting a lead with a consent
    // record always 500'd. Cascades the delete to the consent record(s)
    // instead of blocking it.
    beforeDelete: [cascadeConsentRecordsOnDelete],
  },
  admin: {
    group: sameInBoth("Leads"),
    useAsTitle: "email",
    // T052 — list view: default columns + email search; Payload's built-in
    // column filters cover page / date / consentStatus. `baseListFilter` hides
    // erased leads. The "Export CSV" action sits above the table (T055).
    // 005-content-language-tagging, US5 — `language` added after `page` so
    // staff can filter/scan by it directly from the list view.
    // 006-double-optin-email, US5 — `optInConfirmedAt` likewise.
    defaultColumns: ["email", "page", "language", "consentStatus", "optInConfirmedAt", "isDuplicate", "submittedAt"],
    listSearchableFields: ["email", "domainHostname"],
    baseListFilter: () => ({ erasedAt: { equals: null } }),
    components: {
      beforeListTable: [
        "@/components/ExportLeadsButton#default",
        // 010-date-range-filters — period filter on submittedAt/optInConfirmedAt.
        // `erasedAt` is deliberately excluded: `baseListFilter` above already
        // hides every lead where it's non-null, so filtering this list by an
        // `erasedAt` period could never match anything.
        {
          path: "@/components/CollectionDateRangeFilter.client#default",
          clientProps: {
            fields: [
              { name: "submittedAt", label: { fr: "Soumission", en: "Submission" } },
              { name: "optInConfirmedAt", label: { fr: "Confirmation opt-in", en: "Opt-in confirmation" } },
            ],
          },
        },
      ],
    },
  },
  access: {
    read: isAdminOrEditor,
    create: () => false,
    update: isAdmin, // rectification only (FR-028)
    delete: isAdmin,
  },
  fields: [
    { name: "page", type: "relationship", relationTo: "pages", required: true },
    { name: "domainHostname", type: "text" },
    {
      // 005-content-language-tagging, FR-007/FR-008 — the source page's
      // language *code*, copied once by leadIntake.ts at creation time.
      // Deliberately a plain text copy, not a relationship to `languages`:
      // same shape as `domainHostname` above (a denormalized capture-time
      // fact), which is what makes "never changes afterward" true for free
      // — there's nothing live to drift out of sync. Not personal data, so
      // (like domainHostname/consentStatus/submittedAt/isDuplicate) it is
      // NOT nulled by the erasure-in-place hook below.
      name: "language",
      type: "text",
      required: true,
      admin: { readOnly: true, description: sameInBoth("The source page's language at the moment this lead was captured; never changes afterward.") },
    },
    { name: "email", type: "email" },
    { name: "fieldValues", type: "json" },
    {
      name: "metadata",
      type: "group",
      fields: [
        { name: "pageUrl", type: "text" },
        { name: "referrer", type: "text" },
        { name: "utm", type: "json" },
        { name: "userAgent", type: "text" },
      ],
    },
    {
      name: "consentStatus",
      type: "select",
      required: true,
      defaultValue: "consented",
      options: [
        { label: sameInBoth("Consented"), value: "consented" },
        { label: sameInBoth("Withdrawn"), value: "withdrawn" },
      ],
    },
    { name: "consentRecord", type: "relationship", relationTo: "consent-records" },
    { name: "isDuplicate", type: "checkbox", defaultValue: false },
    // 022-ux-improvement (US6) — set at intake, never rectified: read-only, so
    // the admin shows it in the member's display time zone.
    { name: "submittedAt", type: "date", required: true, admin: { readOnly: true } },
    { name: "erasedAt", type: "date", admin: { readOnly: true, position: "sidebar" } },
    {
      // 006-double-optin-email, FR-009/FR-010 — set exactly once, by
      // POST /api/leads-confirm, never by any other code path. Independent
      // of `consentStatus`: never read by the export "consented only"
      // filter, retention, or DSR (Clarifications, FR-012). Not personal
      // data, so (like `language`) not nulled by erasure-in-place below.
      name: "optInConfirmedAt",
      type: "date",
      admin: { readOnly: true, position: "sidebar", description: sameInBoth("When this lead confirmed via the double opt-in link; set once, never changes afterward.") },
    },
  ],
};
