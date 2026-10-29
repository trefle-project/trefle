import type { Field } from "payload";

import { sameInBoth } from "../../i18n";

import { STARTER_TEMPLATES } from "./starterTemplates";

// GrapesJS exports are text (block markup + scoped CSS); images are referenced
// by URL, never inlined. The Payload `textarea` default caps at 40 000 chars,
// which a multi-block page can legitimately exceed — give it real headroom
// without letting a stray base64 data: URI through unnoticed.
const EXPORT_MAX_LENGTH = 200_000;

// 003-post-launch-improvements, FR-018/FR-019/FR-020, extended by
// 004-page-types (FR-008/FR-009/FR-010/FR-011) — a new page starts from a
// starter layout instead of a blank canvas. The field-level default below
// can't see the sibling `pageType` field's chosen value (Payload's
// `defaultValue` signature has no access to it), so it always falls back to
// the `subscription` starter; `pages-starter-template.ts` (a beforeValidate
// hook, which DOES see the whole document) then overwrites it with the
// correct type-specific starter when the page being created isn't
// `subscription`.
const STARTER = STARTER_TEMPLATES.subscription[0];

/**
 * The `builder` group on `pages` (T031).
 *  - projectData: GrapesJS project JSON, edited via the custom client component
 *  - html / css:  GrapesJS exports — the ONLY thing the renderer consumes
 *  - blockCount:  server-maintained tally (hook T032), drives the publish guard
 */
export const builderField: Field = {
  name: "builder",
  type: "group",
  fields: [
    {
      name: "projectData",
      type: "json",
      defaultValue: () => STARTER.projectData,
      admin: {
        components: {
          Field: "@/fields/grapesjs/Editor.client#default",
        },
      },
    },
    { name: "html", type: "textarea", maxLength: EXPORT_MAX_LENGTH, admin: { hidden: true }, defaultValue: () => STARTER.html },
    { name: "css", type: "textarea", maxLength: EXPORT_MAX_LENGTH, admin: { hidden: true }, defaultValue: () => STARTER.css },
    {
      name: "blockCount",
      type: "json",
      admin: { readOnly: true, description: sameInBoth("Auto-computed from the block editor.") },
    },
  ],
};
