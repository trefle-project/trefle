"use client";

import React from "react";
import { Popup } from "@payloadcms/ui";
import { DayPicker, type DateRange } from "react-day-picker";
import { enGB, fr } from "react-day-picker/locale";
import "react-day-picker/style.css";
import "./DateRangePicker.css";

import { intlLocale, type AdminLanguage } from "../lib/admin-locale";
import { useAdminText } from "../i18n/useAdminText";

/**
 * 010-date-range-filters — pure calendar: knows nothing about Payload
 * `Where` clauses or URLs. Reused by `CollectionDateRangeFilter.client.tsx`
 * (the four Payload list views) and `ExperimentPeriodFilter.client.tsx`
 * (the A/B results panel), which each own their own "what apply means"
 * (contracts/date-range-filter-component.md).
 */
function formatDay(d: Date, lang: AdminLanguage): string {
  return d.toLocaleDateString(intlLocale(lang), { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function DateRangePicker({
  from,
  to,
  fromBound,
  toBound,
  onApply,
  onClear,
}: {
  from?: Date;
  to?: Date;
  fromBound?: Date;
  toBound?: Date;
  onApply: (from: Date, to: Date) => void;
  onClear: () => void;
}) {
  const { t, lang } = useAdminText();
  const [pending, setPending] = React.useState<DateRange | undefined>(
    from && to ? { from, to } : undefined,
  );

  const canApply = !!(pending?.from && pending?.to);
  const label = from && to ? `${formatDay(from, lang)} – ${formatDay(to, lang)}` : t("common.filterByPeriod");
  const disabled = [
    ...(fromBound ? [{ before: fromBound }] : []),
    ...(toBound ? [{ after: toBound }] : []),
  ];

  return (
    <div className="trefle-date-range-filter">
      <Popup
        buttonType="custom"
        button={
          <button type="button" className="btn btn--style-secondary btn--size-small" aria-label={t("common.choosePeriod")}>
            {label}
          </button>
        }
        render={({ close }) => (
          <div style={{ padding: "12px" }}>
            {/* Payload's Popup closes on any click on a nested <button> by
             * default (`handleActionableClick`, @payloadcms/ui) — every
             * react-day-picker day cell and month-nav control is a
             * <button>, so without this attribute the popup closed itself
             * the instant a start date was picked (found live). */}
            <div data-popup-prevent-close>
              <DayPicker
                mode="range"
                locale={lang === "fr" ? fr : enGB}
                numberOfMonths={2}
                selected={pending}
                onSelect={setPending}
                disabled={disabled}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn btn--style-secondary btn--size-small"
                onClick={() => {
                  setPending(undefined);
                  onClear();
                  close();
                }}
              >
                {t("common.clear")}
              </button>
              <button
                type="button"
                className="btn btn--style-primary btn--size-small"
                disabled={!canApply}
                onClick={() => {
                  if (pending?.from && pending?.to) {
                    onApply(pending.from, pending.to);
                    close();
                  }
                }}
              >
                {t("common.apply")}
              </button>
            </div>
          </div>
        )}
      />
    </div>
  );
}
