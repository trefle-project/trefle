import type { CollectionConfig } from "payload";

import { isAdminOrEditor, publishedOnly } from "../access";
import { builderField } from "../fields/grapesjs/field";
import { customCodeField } from "../fields/customCode";
import { formField } from "../fields/form";
import { recomputeBlockCount } from "../hooks/pages-block-count";
import { applyStarterTemplate } from "../hooks/pages-starter-template";
import { rejectInlineImages } from "../hooks/pages-no-inline-images";
import { pagesCustomCodeGuard } from "../hooks/pages-custom-code-guard";
import { pageActivity } from "../hooks/pages-activity";
import { confirmationGuardOnDelete, confirmationGuardOnUnpublish } from "../hooks/pages-confirmation-guard";
import { leadReferenceGuardOnDelete } from "../hooks/pages-lead-guard";
import { validateOptInEmailLanguage } from "../hooks/pages-optin-email-validate";
import { validatePagePath } from "../hooks/pages-path-validate";
import { pageRevalidate, pageRevalidateOnDelete } from "../hooks/pages-revalidate";
import { publishGuard } from "../hooks/pages-publish-guard";
import { pageConflictCheckEndpoint } from "../endpoints/pageConflictCheck";
import { createTestVariantEndpoint } from "../endpoints/createTestVariant";
import { sameInBoth } from "../i18n";

/**
 * A publishable landing page (T029/T030/T031). One shared workspace owns all
 * pages; each is assigned to a domain + path (FR-006a). Deleting a page never
 * deletes its leads / consent records (FR-001a) — the `leads.page` relationship
 * is not configured to cascade.
 */
export const Pages: CollectionConfig = {
  slug: "pages",
  // T031a: concurrent-edit protection is Payload's built-in document locking —
  // a second editor can't open a locked doc, so there is no silent overwrite.
  // No custom version guard (the earlier attempt fought Payload's group-merge).
  lockDocuments: { duration: 300 },
  admin: {
    group: sameInBoth("Contents"),
    useAsTitle: "title",
    listSearchableFields: ["title", "path"],
    defaultColumns: ["title", "domain", "path", "status", "pageType", "updatedAt"],
    components: {
      // PageStatsPanel (T055a) intentionally unregistered here per the
      // operator's request — the panel and the `page-stats` collection it
      // reads are still around, just no longer surfaced above the Pages
      // list. Re-add `beforeListTable: ["@/components/PageStatsPanel#default"]`
      // to bring it back.
      //
      // 010-date-range-filters — a separate, unrelated `beforeListTable`
      // entry below (the period filter) does not reference PageStatsPanel.
      beforeListTable: [
        // 015-penpot-site-import — « Importer un site Penpot » (flag + role checked inside).
        "@/components/SiteImportButton#default",
        {
          path: "@/components/CollectionDateRangeFilter.client#default",
          clientProps: {
            fields: [
              { name: "updatedAt", label: { fr: "Dernière modification", en: "Last modified" } },
              { name: "publishedAt", label: { fr: "Publication", en: "Publication" } },
              { name: "createdAt", label: { fr: "Création", en: "Creation" } },
            ],
          },
        },
      ],
      edit: {
        beforeDocumentControls: [
          // 004-page-types, FR-016/FR-017 — applies the wizard's stashed
          // answers on the create view, or redirects there first if this
          // create view was reached directly (research.md §8/§9).
          "@/components/PageWizardBootstrap#default",
        ],
      },
      views: {
        // 004-page-types, FR-014/FR-015, research.md §8 — the guided,
        // mandatory-preliminary step before the standard create form.
        wizard: {
          Component: "@/components/PageCreateWizard#default",
          path: "/wizard",
          exact: true,
        },
        // 015-penpot-site-import — the four-step « Importer un site Penpot » wizard.
        importPenpot: {
          Component: "@/components/SiteImportWizard.client#default",
          path: "/import-penpot",
          exact: true,
        },
        // 008-ab-testing, US2, research.md §6 — a real document tab
        // (`DocumentTabConfig`), not a sidebar panel, per the operator's own
        // preference for keeping the page-edit view uncluttered. Deviation
        // from research.md's exact placement, found only by typechecking
        // against the installed Payload 3.88 types: `tab` support lives on
        // `EditConfig`'s own per-key entries (`views.edit.<key>`), not on
        // the generic view registry `wizard` above uses (`views.<key>`,
        // `AdminViewConfig` — no `tab` field at all).
        //
        // Second deviation, found live (reported by a real user — the tab
        // was unreachable by clicking it, only by a direct URL): `tab.href`
        // is a separate field from this view's own `path`, and without it
        // Payload defaults the tab's link to an empty string, which
        // resolves to the *same* URL as the "Edit" tab. That made both tabs
        // register as simultaneously "active" on the plain edit view, and
        // Payload renders an active tab as a disabled, non-navigable `<div>`
        // (`DocumentTabLink`'s own `disabled: isActive`) — so "Tests A/B"
        // could never actually be clicked into. Every one of this feature's
        // own manual-verification passes used `page.goto(".../experiments")`
        // directly, which bypassed the tab link entirely and never caught
        // this. `href` must mirror `path` (same as Payload's own built-in
        // "API" tab does with its `path`/`href` both `/api`).
        edit: {
          experiments: {
            Component: "@/components/PageExperimentsTab#default",
            path: "/experiments",
            tab: { label: "Tests A/B", href: "/experiments" },
          },
        },
      },
    },
  },
  access: {
    read: publishedOnly,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  // 004-page-types — a collection-level endpoint, not a top-level one; see
  // pageConflictCheck.ts's header comment for why (`/api/pages/*` routing
  // never falls back to top-level endpoints once "pages" matches a
  // collection slug). Listed first so it's matched before Payload's
  // built-in `GET /:id` route.
  endpoints: [pageConflictCheckEndpoint, createTestVariantEndpoint],
  hooks: {
    beforeValidate: [applyStarterTemplate, recomputeBlockCount, rejectInlineImages, pagesCustomCodeGuard],
    beforeChange: [publishGuard, confirmationGuardOnUnpublish],
    // Guards first — they throw and abort the delete when the page is still
    // referenced, so the stats cascade below only runs once deletion is
    // actually going ahead.
    // 022-ux-improvement — a deleted page's stats are kept (Pages Stats' « Pages supprimées »).
    beforeDelete: [confirmationGuardOnDelete, leadReferenceGuardOnDelete],
    afterChange: [pageRevalidate, pageActivity],
    afterDelete: [pageRevalidateOnDelete],
  },
  fields: [
    {
      // 012-url-page-import, FR-019 — the import report at the top of an
      // imported page's edit view, until the editor dismisses it.
      name: "importReport",
      type: "ui",
      admin: {
        condition: (data) => Boolean(data?.importedFrom || data?.siteImport),
        components: { Field: "@/components/ImportReportPanel.client#default" },
      },
    },
    {
      // The page's live address (PageLiveUrl — see its header comment for the
      // incident behind it) and « saving a published page republishes it »
      // (003, FR-009). 022: moved here from the Save bar, too low for them on
      // narrow screens.
      name: "pageNotices",
      type: "ui",
      admin: { components: { Field: "@/components/PageNotices#default" } },
    },
    {
      name: "title",
      type: "text",
      required: true,
      hooks: {
        // Payload's own default beforeDuplicate only touches fields marked
        // `unique: true`; `title` isn't (it doesn't need to be — only the
        // (domain, path) pair among *published* pages does, per publishGuard
        // below), so an unmodified duplicate silently carried the same
        // title. Suffixing it here just keeps it visually obvious in the
        // list view — `path` is the one whose suffix actually matters.
        beforeDuplicate: [({ value }) => (typeof value === "string" && value ? `${value}-copy` : value)],
      },
    },
    {
      // 008-ab-testing — set only on a challenger variant, pointing at its
      // control page. A variant is never resolved by its own (domain, path)
      // — only the control's URL is ever public (data-model.md) — so
      // domain/path are hidden below rather than asked for, and
      // publishGuard skips their checks entirely for a document with this set.
      name: "experimentOf",
      type: "relationship",
      relationTo: "pages",
      admin: {
        position: "sidebar",
        description: sameInBoth("Set automatically when this page is created as a test variant."),
        readOnly: true,
        condition: () => false,
      },
    },
    {
      name: "domain",
      type: "relationship",
      relationTo: "domains",
      admin: {
        position: "sidebar",
        description: sameInBoth("Required to publish."),
        condition: (data) => !data?.experimentOf,
      },
    },
    {
      name: "path",
      type: "text",
      admin: {
        position: "sidebar",
        description: sameInBoth("Leading slash, unique within the domain, e.g. / or /promo-x."),
        condition: (data) => !data?.experimentOf,
      },
      hooks: {
        beforeValidate: [
          ({ value }) => {
            if (typeof value !== "string" || value.trim() === "") return value;
            const v = value.trim();
            return v.startsWith("/") ? v : `/${v}`;
          },
        ],
        // Same reasoning as `title` above, but load-bearing here: duplicating
        // a *published* page otherwise hands publishGuard's create-time call
        // a (domain, path) pair that's already published — the source
        // document itself — which it correctly rejects as a clash. Appending
        // `-copy` gives the duplicate its own path so it publishes clean;
        // `beforeValidate` above still runs after this and just re-confirms
        // the leading slash, a no-op on an already-normalised value.
        beforeDuplicate: [
          ({ value }) => (typeof value === "string" && value.trim() !== "" ? `${value}-copy` : value),
        ],
      },
      validate: validatePagePath,
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: sameInBoth("Draft"), value: "draft" },
        { label: sameInBoth("Published"), value: "published" },
      ],
      admin: { position: "sidebar" },
      hooks: {
        // A duplicate starts life as a draft, full stop — never silently
        // republishes a copy of a live page under its `-copy` path the
        // moment it's created. The operator reviews/edits it and publishes
        // deliberately, same as any other new page.
        beforeDuplicate: [() => "draft"],
      },
    },
    {
      name: "publishedAt",
      type: "date",
      admin: { position: "sidebar", readOnly: true },
      // Forced to draft above — clear the inherited timestamp so the field
      // doesn't show a stale "published" date on a document that isn't.
      hooks: { beforeDuplicate: [() => null] },
    },
    {
      // 004-page-types, FR-001/FR-012 — internal, editor-facing only; never
      // exposed to the renderer (FR-002). Determines which pages-publish-guard.ts
      // rule branch applies and which starter template a new page begins from.
      name: "pageType",
      type: "select",
      required: true,
      defaultValue: "subscription",
      options: [
        { label: sameInBoth("Subscription (lead-gen form)"), value: "subscription" },
        { label: sameInBoth("Free (no form)"), value: "free" },
        { label: sameInBoth("Confirmation (post-submission)"), value: "confirmation" },
      ],
      admin: {
        position: "sidebar",
        description: sameInBoth("Internal — never shown publicly. Determines publish requirements and the starter template."),
      },
    },
    {
      // 005-content-language-tagging, FR-005/FR-006 — required at every save
      // (not only at publish, unlike domain/path below): spec.md's
      // clarification session settled that saving without an explicit
      // language, when the domain has no default, must be blocked outright.
      // No defaultValue — the creation wizard pre-fills this from the
      // chosen domain's `defaultLanguage` when one is set (see
      // PageCreateWizard.tsx); the editor can always override before saving.
      name: "language",
      type: "relationship",
      relationTo: "languages",
      required: true,
      filterOptions: { isActive: { equals: true } },
      admin: {
        position: "sidebar",
        description: sameInBoth("Required. Determines which language this page's leads are captured under."),
      },
    },
    {
      // 003-post-launch-improvements, FR-010/FR-012/FR-013 — optional, per-page,
      // never enforced by publishGuard: unset MUST remain publishable (Question 2).
      name: "confirmationPage",
      type: "relationship",
      relationTo: "pages",
      admin: {
        position: "sidebar",
        description:
          sameInBoth("Optional; shown after a successful submission on this page. When unset, the generic message is used."),
      },
    },
    {
      // 006-double-optin-email, FR-003/FR-004 — optional; meaningful only
      // for pageType: "subscription" (free/confirmation pages can never
      // carry a lead-form at all, per publishGuard, so nothing would ever
      // read this on them regardless). `filterOptions` scopes the admin
      // picker to this page's own language; the async `validate` is the
      // real, API-level enforcement of the same rule (research.md §4) —
      // NOT the same concept as `confirmationPage` above (see this file's
      // header / spec.md Context: this is emailed content, never rendered).
      name: "optInEmail",
      type: "relationship",
      relationTo: "opt-in-emails",
      filterOptions: ({ siblingData }) => ({ language: { equals: (siblingData as { language?: unknown })?.language } }),
      admin: {
        position: "sidebar",
        description: sameInBoth("Optional. Sent to a lead who submits this page's form — must be in the page's own language."),
      },
      validate: validateOptInEmailLanguage,
    },
    {
      name: "publicUrl",
      type: "ui",
      admin: {
        position: "sidebar",
        components: { Field: "@/components/PublishedUrl#default" },
      },
    },
    {
      // 012-url-page-import — set by the import job on the draft it creates;
      // links the page to its import and report.
      name: "importedFrom",
      type: "relationship",
      relationTo: "page-imports",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: { fr: "Page créée par un import depuis une page web.", en: "Page created by an import from a web page." },
        condition: (data) => Boolean(data?.importedFrom),
      },
      hooks: { beforeDuplicate: [() => null] },
    },
    {
      // 015-penpot-site-import — set by the site import job on each draft it
      // creates; the page's report lives in that import's `boards` row.
      name: "siteImport",
      type: "relationship",
      relationTo: "site-imports",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: { fr: "Page créée par un import de site Penpot.", en: "Page created by a Penpot site import." },
        condition: (data) => Boolean(data?.siteImport),
      },
      hooks: { beforeDuplicate: [() => null] },
    },
    builderField,
    formField,
    {
      name: "seo",
      type: "group",
      fields: [
        { name: "metaTitle", type: "text" },
        { name: "metaDescription", type: "textarea" },
        { name: "ogImage", type: "relationship", relationTo: "media" },
      ],
    },
    // 014-custom-code-editing — admin-only page scripts and code-block contents.
    customCodeField,
  ],
};
