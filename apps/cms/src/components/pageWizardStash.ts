import { STARTER_TEMPLATES } from "../fields/grapesjs/starterTemplates";

// 004-page-types, research.md §9 — the fixed sessionStorage key the wizard
// (PageCreateWizard.tsx) writes under and the bootstrap (PageWizardBootstrap.tsx)
// reads and clears. Payload's field-level `defaultValue` can't see a sibling
// field's chosen value or a URL query param, so this is the handoff instead.
export const PAGE_WIZARD_STASH_KEY = "trefle:pageWizardStash";

export type PageType = "subscription" | "free" | "confirmation";

export interface PageWizardStash {
  pageType: PageType;
  templateId: string;
  domain?: string;
  path?: string;
  title: string;
  // 005-content-language-tagging, US4 — pre-filled from the chosen domain's
  // `defaultLanguage` when one is set (or picked by hand); the standard
  // create form's own `language` field is required with no default, so
  // this is what lets the wizard hand it a value before the document even
  // exists (same reasoning as `domain`/`path` above).
  language?: string;
}

/**
 * FR-016 — pure mapping from a wizard stash to the `{path, value}` field
 * updates `PageWizardBootstrap` applies to the standard create form. Kept
 * out of the component so it's unit-testable without a browser (Principle
 * IV — this is the wizard's one non-trivial decision, not just UI wiring).
 */
export function stashToFieldUpdates(stash: PageWizardStash): { path: string; value: unknown }[] {
  const templates = STARTER_TEMPLATES[stash.pageType];
  const template = templates.find((t) => t.id === stash.templateId) ?? templates[0];

  const updates: { path: string; value: unknown }[] = [
    { path: "title", value: stash.title },
    { path: "pageType", value: stash.pageType },
  ];
  // The wizard's plain HTML `<select>` only ever produces string values
  // (`String(domain.id)`), but `domain` is a `relationship` field and
  // `domains` uses Payload's default numeric (Postgres serial) id — handing
  // the form a string here made the create POST fail with "This
  // relationship field has the following invalid relationships" (found via
  // a live wizard walkthrough, not caught by this file's own unit tests,
  // which only ever exercised a non-numeric placeholder id). Coerce a
  // digit-only string to a number; leave anything else untouched in case
  // the id type ever stops being numeric.
  if (stash.domain) {
    const domainValue = /^\d+$/.test(stash.domain) ? Number(stash.domain) : stash.domain;
    updates.push({ path: "domain", value: domainValue });
  }
  if (stash.path) updates.push({ path: "path", value: stash.path });
  // Same numeric-id coercion as `domain` above — `languages` also uses
  // Payload's default numeric id.
  if (stash.language) {
    const languageValue = /^\d+$/.test(stash.language) ? Number(stash.language) : stash.language;
    updates.push({ path: "language", value: languageValue });
  }
  updates.push({ path: "builder.projectData", value: template.projectData });
  updates.push({ path: "builder.html", value: template.html });
  updates.push({ path: "builder.css", value: template.css });
  return updates;
}

/**
 * FR-017 — the redirect decision: land on the wizard first, unless the
 * bootstrap is running because the wizard itself just navigated here (a
 * stash is present) or this is an existing document being edited (it has an
 * id) — only a truly fresh, direct visit to the create route redirects.
 */
export function shouldRedirectToWizard(args: { hasStash: boolean; hasDocId: boolean }): boolean {
  return !args.hasStash && !args.hasDocId;
}
