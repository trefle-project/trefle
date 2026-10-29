import type { CollectionConfig, Field, GlobalConfig } from "payload";

/**
 * 022-ux-improvement (US6, research R12) — one config pass instead of an
 * edit per collection: every `date` field, nested ones included, gets the
 * zone-aware list cell and document field (components/AdminDate.client).
 * Collections also get their `createdAt`/`updatedAt` declared explicitly —
 * the same definition Payload adds by itself (payload/collections/config/
 * sanitize), plus the cell — so list columns follow the zone too.
 */
export const DATE_CELL = "@/components/AdminDate.client#AdminDateCell";
export const DATE_FIELD = "@/components/AdminDate.client#AdminDateField";
export const DOCUMENT_DATES = "@/components/AdminDate.client#AdminDocumentDates";

type AnyField = Field & { type: string; name?: string; fields?: Field[]; tabs?: { fields: Field[] }[]; blocks?: { fields: Field[] }[]; admin?: Record<string, unknown> };

function withDateComponents(field: AnyField): AnyField {
  const admin = (field.admin ?? {}) as { components?: Record<string, unknown> };
  const components = admin.components ?? {};
  return {
    ...field,
    admin: { ...admin, components: { Cell: DATE_CELL, Field: DATE_FIELD, ...components } },
  } as AnyField;
}

export function zoneDateFields(fields: Field[]): Field[] {
  return fields.map((input) => {
    const field = input as AnyField;
    if (field.type === "date") return withDateComponents(field);
    if (field.fields) return { ...field, fields: zoneDateFields(field.fields) } as Field;
    if (field.tabs) return { ...field, tabs: field.tabs.map((tab) => ({ ...tab, fields: zoneDateFields(tab.fields) })) } as Field;
    if (field.blocks) return { ...field, blocks: field.blocks.map((b) => ({ ...b, fields: zoneDateFields(b.fields) })) } as Field;
    return field;
  });
}

const timestamp = (name: "createdAt" | "updatedAt"): Field =>
  withDateComponents({
    name,
    type: "date",
    index: true,
    label: ({ t }) => t(`general:${name}`),
    admin: { disableBulkEdit: true, hidden: true },
  } as AnyField) as Field;

const declares = (fields: Field[], name: string) => fields.some((f) => (f as AnyField).name === name);

export function withAdminDates(collection: CollectionConfig): CollectionConfig {
  const fields = zoneDateFields(collection.fields);
  if (collection.timestamps !== false) {
    for (const name of ["updatedAt", "createdAt"] as const) if (!declares(fields, name)) fields.push(timestamp(name));
  }
  if (collection.timestamps === false) return { ...collection, fields };
  const admin = collection.admin ?? {};
  const edit = admin.components?.edit ?? {};
  return {
    ...collection,
    fields,
    admin: {
      ...admin,
      components: { ...admin.components, edit: { ...edit, beforeDocumentControls: [...(edit.beforeDocumentControls ?? []), DOCUMENT_DATES] } },
    },
  };
}

export const withAdminDatesGlobal = (global: GlobalConfig): GlobalConfig => ({ ...global, fields: zoneDateFields(global.fields) });
