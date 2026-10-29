import type { CollectionConfig } from "payload";

import { isAdminOrEditor, isStaffOrService } from "../access";
import { oneRunningExperimentPerControl } from "../hooks/experiments-one-running-guard";
import { experimentsRevalidate } from "../hooks/experiments-revalidate";
import { startTestEndpoint } from "../endpoints/startTest";
import { promoteVariantEndpoint } from "../endpoints/promoteVariant";
import { concludeTestWithoutPromotingEndpoint } from "../endpoints/concludeTestWithoutPromoting";
import { refreshAnalysisEndpoint } from "../endpoints/refreshAnalysis";
import { sameInBoth } from "../i18n";

/**
 * 008-ab-testing — one document per whole-page A/B test (data-model.md).
 * Variants are never stored here as an array: any `pages` document whose
 * `experimentOf` equals this document's `controlPage` id is a variant of
 * this test (single copy of the relationship, no array to keep in sync —
 * docs/ab-testing-exploration.md §5.3). `status` doubles as the "flag"
 * constitution Principle III requires: every commit up to the first
 * `running` row ships to `main` and stays provably inert.
 *
 * A losing (non-promoted) variant is never flagged with its own field —
 * "lost" is derived by joining `pages.experimentOf` against a `concluded`
 * experiment whose `winner` is a different page (Principle I: no field
 * that only restates data already present elsewhere).
 */
export const Experiments: CollectionConfig = {
  slug: "experiments",
  labels: { singular: sameInBoth("A/B experiment"), plural: sameInBoth("A/B experiments") },
  admin: {
    group: sameInBoth("Reports"),
    useAsTitle: "name",
    listSearchableFields: ["name"],
    defaultColumns: ["name", "controlPage", "status", "startedAt", "analysis"],
    components: {
      beforeList: ["@/components/ExperimentsRunningBanner#default"],
      // 010-date-range-filters — independent slot from `beforeList` above,
      // no conflict (research.md §4).
      beforeListTable: [
        {
          path: "@/components/CollectionDateRangeFilter.client#default",
          clientProps: { fields: [{ name: "startedAt", label: { fr: "Début du test", en: "Test start" } }] },
        },
      ],
    },
  },
  access: {
    // 008-ab-testing — read must include the renderer's `isService` account
    // (`apps/web`'s bucketing lookup, research.md §2), same shape as
    // `Domains.ts`'s `read: isStaffOrService` — found live: the renderer was
    // silently 403'd on `/api/experiments` with plain `isAdminOrEditor`,
    // the exact class of bug `007-gtm-tagging` already hit once on
    // `settings`. Only read is widened; create/update/delete stay
    // editor/admin-only (FR-015).
    read: isStaffOrService,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  hooks: {
    beforeChange: [oneRunningExperimentPerControl],
    afterChange: [experimentsRevalidate],
  },
  endpoints: [startTestEndpoint, promoteVariantEndpoint, concludeTestWithoutPromotingEndpoint, refreshAnalysisEndpoint],
  fields: [
    { name: "name", type: "text", required: true },
    {
      name: "controlPage",
      type: "relationship",
      relationTo: "pages",
      required: true,
      admin: { description: sameInBoth("The page under test.") },
    },
    {
      name: "growthbookExperimentKey",
      type: "text",
      admin: { description: sameInBoth("Set automatically when the test starts."), readOnly: true },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: sameInBoth("Draft"), value: "draft" },
        { label: sameInBoth("Running"), value: "running" },
        { label: sameInBoth("Concluded"), value: "concluded" },
      ],
    },
    { name: "startedAt", type: "date", admin: { readOnly: true } },
    { name: "endedAt", type: "date", admin: { readOnly: true } },
    {
      name: "winner",
      type: "relationship",
      relationTo: "pages",
      admin: { description: sameInBoth("Set only when the test concludes by promoting a variant."), readOnly: true },
    },
    // 018-ab-significance (data-model.md) — GrowthBook's analysis, written
    // only by `refreshAnalysis` (hourly task, « Rafraîchir », conclusion).
    // Aggregates only, never a per-visitor value (FR-009).
    {
      name: "growthbookId",
      type: "text",
      admin: { readOnly: true, description: sameInBoth("GrowthBook's id for this test, set when it is declared.") },
    },
    { name: "analysisStartedAt", type: "date", admin: { readOnly: true } },
    {
      name: "analysis",
      type: "json",
      label: sameInBoth("Verdict"),
      // Never edited or shown raw: only its one-line verdict in the list (FR-015).
      admin: { readOnly: true, condition: () => false, components: { Cell: "@/components/ExperimentVerdictCell#default" } },
    },
    { name: "analysisRefreshedAt", type: "date", admin: { readOnly: true } },
    { name: "analysisError", type: "text", admin: { readOnly: true, hidden: true } },
    {
      name: "resultsPanel",
      type: "ui",
      admin: {
        components: { Field: "@/components/ExperimentResultsPanel#default" },
      },
    },
  ],
};
