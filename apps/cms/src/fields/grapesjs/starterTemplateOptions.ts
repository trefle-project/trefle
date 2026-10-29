import { STARTER_TEMPLATES } from "./starterTemplates";

export type PageType = keyof typeof STARTER_TEMPLATES;

/**
 * 004-page-types, FR-014/FR-015 — a pure, presentation-only view of
 * `STARTER_TEMPLATES` for the wizard's template `<select>` (and any future
 * caller that needs to list templates without pulling in full block/HTML
 * content). Today every type has exactly one template.
 */
export function templatesFor(pageType: PageType): { id: string; label: { fr: string; en: string } }[] {
  return STARTER_TEMPLATES[pageType].map(({ id, label }) => ({ id, label }));
}
