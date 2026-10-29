"use client";

import React from "react";
import { useListQuery } from "@payloadcms/ui";
import type { Where } from "payload";

import DateRangePicker from "./DateRangePicker.client";
import { pickerDateOf, utcDayRangeBounds, zoneDayRangeBounds } from "../lib/dateRangeBounds";
import { useAdminTimezone } from "./AdminTimezone.client";
import { mergeDateRangeIntoWhere } from "../lib/mergeDateRangeWhere";
import { useAdminText } from "../i18n/useAdminText";

/** `label`: one text, or one per admin language (023). */
export type DateFieldOption = { name: string; label: string | { fr: string; en: string }; utcDay?: boolean };

/**
 * 010-date-range-filters — Payload list-view wrapper, registered on
 * `page-stats`/`activity-log`/`pages`/`experiments` via
 * `admin.components.beforeListTable`'s object `PayloadComponent` form, one
 * `clientProps.fields` array per collection (contracts/date-range-filter-component.md).
 * `pages` offers several date fields (`updatedAt`/`publishedAt`/`createdAt`)
 * — the operator picks which one via a `<select>`, shown only when more than
 * one option exists; the other three collections have a single date column
 * today and render no `<select>`.
 */

function seededRange(
  where: Where | undefined,
  fields: DateFieldOption[],
  tz: string,
): { fieldName?: string; from?: Date; to?: Date } {
  const candidates: Where[] = [];
  if (where) candidates.push(where);
  if (where?.and && Array.isArray(where.and)) candidates.push(...(where.and as Where[]));
  for (const clause of candidates) {
    for (const { name: fieldName, utcDay } of fields) {
      const condition = clause?.[fieldName] as { greater_than_equal?: string; less_than?: string } | undefined;
      if (condition?.greater_than_equal) {
        const zone = utcDay ? "UTC" : tz;
        return {
          fieldName,
          from: pickerDateOf(condition.greater_than_equal, zone),
          to: condition.less_than ? pickerDateOf(new Date(new Date(condition.less_than).getTime() - 1).toISOString(), zone) : undefined,
        };
      }
    }
  }
  return {};
}

export default function CollectionDateRangeFilter({ fields }: { fields: DateFieldOption[] }) {
  const { query, handleWhereChange } = useListQuery();
  const { t, lang } = useAdminText();
  const fieldNames = React.useMemo(() => fields.map((f) => f.name), [fields]);
  // 022-ux-improvement (US6) — days are the member's display time zone's.
  const tz = useAdminTimezone();
  const seeded = React.useMemo(() => seededRange(query?.where, fields, tz), [query?.where, fields, tz]);
  const [selectedFieldName, setSelectedFieldName] = React.useState(seeded.fieldName ?? fields[0]!.name);
  const activeField = fields.find((f) => f.name === selectedFieldName) ?? fields[0]!;
  const computeBounds = activeField.utcDay ? utcDayRangeBounds : (from: Date, to: Date) => zoneDayRangeBounds(from, to, tz);
  const isActiveFieldSeeded = seeded.fieldName === selectedFieldName;

  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      {fields.length > 1 ? (
        <select
          aria-label={t("common.dateFieldToFilter")}
          value={selectedFieldName}
          onChange={(e) => setSelectedFieldName(e.target.value)}
        >
          {fields.map((f) => (
            <option key={f.name} value={f.name}>
              {typeof f.label === "string" ? f.label : f.label[lang]}
            </option>
          ))}
        </select>
      ) : null}
      <DateRangePicker
        from={isActiveFieldSeeded ? seeded.from : undefined}
        to={isActiveFieldSeeded ? seeded.to : undefined}
        onApply={(from, to) => {
          const merged = mergeDateRangeIntoWhere(query?.where, fieldNames, selectedFieldName, computeBounds(from, to));
          void handleWhereChange?.(merged ?? {});
        }}
        onClear={() => {
          const merged = mergeDateRangeIntoWhere(query?.where, fieldNames, selectedFieldName, null);
          void handleWhereChange?.(merged ?? {});
        }}
      />
    </div>
  );
}
