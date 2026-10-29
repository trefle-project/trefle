import type { CollectionBeforeValidateHook } from "payload";

import { STARTER_TEMPLATES } from "../fields/grapesjs/starterTemplates";

const SUBSCRIPTION_DEFAULT = STARTER_TEMPLATES.subscription[0];

/**
 * 004-page-types, FR-008/FR-009/FR-010/FR-011 — on create, if the editor
 * picked a `pageType` other than `subscription` and hasn't touched the block
 * editor yet (it still holds the field-level `subscription` default from
 * `field.ts`, since `defaultValue` can't see the sibling `pageType` field),
 * swap `builder` for that type's starter template instead. Runs
 * `beforeValidate`, before `recomputeBlockCount`, so the block count the
 * publish guard sees always matches whichever content actually ships.
 *
 * Leaves `builder` alone whenever it already differs from the untouched
 * `subscription` default (empty, or genuinely customised) — never clobbers
 * editor work.
 */
export const applyStarterTemplate: CollectionBeforeValidateHook = ({ data, operation }) => {
  if (operation !== "create" || !data) return data;

  const pageType = (data.pageType as "subscription" | "free" | "confirmation" | undefined) ?? "subscription";
  if (pageType === "subscription") return data;

  const builder = (data.builder ?? {}) as { projectData?: unknown; html?: unknown; css?: unknown };
  const isEmpty = !builder.projectData && !builder.html && !builder.css;
  const isUntouchedSubscriptionDefault =
    JSON.stringify(builder.projectData) === JSON.stringify(SUBSCRIPTION_DEFAULT.projectData) &&
    builder.html === SUBSCRIPTION_DEFAULT.html &&
    builder.css === SUBSCRIPTION_DEFAULT.css;

  if (!isEmpty && !isUntouchedSubscriptionDefault) return data;

  const template = STARTER_TEMPLATES[pageType][0];
  data.builder = {
    ...builder,
    projectData: template.projectData,
    html: template.html,
    css: template.css,
  };
  return data;
};
