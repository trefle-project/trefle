"use client";

import React from "react";
import type { DateFieldClientProps, DefaultCellComponentProps } from "payload";
import { getTranslation } from "@payloadcms/translations";
import { DateTimeField, FieldDescription, FieldLabel, useConfig, useDocumentInfo, useField, useTranslation } from "@payloadcms/ui";

import { useAdminText } from "../i18n/useAdminText";
import { formatAdminDate, zoneOffset } from "../lib/admin-time";
import { useAdminTimezone } from "./AdminTimezone.client";

/**
 * 022-ux-improvement (US6, research R12) — every date of the admin shown in
 * the member's display time zone (`withAdminDates` puts these on every date
 * field). A day-only field is a calendar day stored at UTC midnight: shown
 * as that day, never shifted by a zone.
 */
const isDayOnly = (field: unknown): boolean =>
  (field as { admin?: { date?: { pickerAppearance?: string } } }).admin?.date?.pickerAppearance === "dayOnly";

function useZonedText(value: unknown, dayOnly: boolean): { text: string; title?: string } {
  const zone = useAdminTimezone();
  const { t } = useAdminText();
  if (value == null || value === "") return { text: "" };
  const date = new Date(value as string);
  if (dayOnly) return { text: formatAdminDate(date, "UTC", "date") };
  return { text: formatAdminDate(date, zone), title: t("settings.timeOf", { zone, offset: zoneOffset(date, zone) }) };
}

export function AdminDateCell({ cellData, field, link, linkURL, collectionSlug, rowData }: DefaultCellComponentProps) {
  const { config } = useConfig();
  const { text, title } = useZonedText(cellData, isDayOnly(field));
  if (!text) return null;
  // First column: Payload passes `link` and leaves the URL to the cell.
  const href = linkURL ?? `${config.routes.admin}/collections/${collectionSlug}/${encodeURIComponent(String((rowData as { id?: unknown }).id))}`;
  return link ? (
    <a href={href} title={title}>
      {text}
    </a>
  ) : (
    <span title={title}>{text}</span>
  );
}

/**
 * Document view: a read-only date (system dates — most of them) is shown as
 * zoned text; an editable one keeps Payload's picker, which follows the
 * computer's clock, and says so (known exception, spec edge cases).
 */
export function AdminDateField(props: DateFieldClientProps) {
  const { field, path, readOnly } = props;
  const { value } = useField<string | null>({ path: path ?? field.name });
  const { text, title } = useZonedText(value, isDayOnly(field));
  const { t } = useAdminText();
  const { i18n } = useTranslation();
  // A `{ fr, en }` description (023) in the member's language; a function one is left out.
  const own = field.admin?.description;
  const ownText = own && typeof own !== "function" ? getTranslation(own, i18n) : "";
  if (!(readOnly || field.admin?.readOnly)) {
    const note = t("settings.computerTime");
    const description = ownText ? `${ownText} ${note}` : note;
    return <DateTimeField {...props} field={{ ...field, admin: { ...field.admin, description } } as typeof field} />;
  }
  return (
    <div className="field-type date-time-field read-only" style={{ marginBottom: "var(--spacing-field, 1rem)" }}>
      <FieldLabel label={field.label} path={path ?? field.name} />
      <div title={title} style={{ padding: "8px 0" }}>
        {text || "—"}
      </div>
      {ownText ? <FieldDescription description={ownText} path={path ?? field.name} /> : null}
    </div>
  );
}

/**
 * Payload draws « Last Modified / Created » at the top of a document itself,
 * in the browser's zone, with no slot to replace them (checked in 3.88's
 * DocumentControls). They are hidden in custom.scss and shown here instead,
 * through `edit.beforeDocumentControls` (set by `withAdminDates`). If a
 * Payload upgrade renames `doc-controls__value-wrap`, both would show: check
 * this header after every Payload upgrade.
 */
export function AdminDocumentDates() {
  const { savedDocumentData, id } = useDocumentInfo();
  const zone = useAdminTimezone();
  const { t } = useAdminText();
  if (!id || !savedDocumentData) return null;
  const { updatedAt, createdAt } = savedDocumentData as { updatedAt?: string; createdAt?: string };
  const item = (label: string, value?: string) =>
    value ? (
      <span title={t("settings.timeOf", { zone, offset: zoneOffset(new Date(value), zone) })}>
        {t("settings.labelColon", { label })}
        <strong>{formatAdminDate(value, zone)}</strong>
      </span>
    ) : null;
  return (
    <div className="trefle-doc-dates">
      {item(t("settings.modified"), updatedAt)}
      {item(t("settings.created"), createdAt)}
    </div>
  );
}
