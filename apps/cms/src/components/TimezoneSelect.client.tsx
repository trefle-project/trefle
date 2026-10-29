"use client";

import React from "react";
import type { TextFieldClientProps } from "payload";
import { SelectInput, useField } from "@payloadcms/ui";

import { zoneOptions } from "../lib/admin-time";

/**
 * 022-ux-improvement (US6) — a time-zone picker over a plain text field: the
 * IANA list comes from the browser's `Intl`, so no database enum has to
 * follow it. `emptyLabel` (from `clientProps`) names the « no choice »
 * option of `users.displayTimezone`.
 */
const TimezoneSelect: React.FC<TextFieldClientProps & { emptyLabel?: string }> = ({ field, path, readOnly, emptyLabel }) => {
  const { value, setValue, showError } = useField<string | null>({ path: path ?? field.name });
  const options = React.useMemo(
    () => [...(emptyLabel ? [{ label: emptyLabel, value: "" }] : []), ...zoneOptions().map((tz) => ({ label: tz.replace(/_/g, " "), value: tz }))],
    [emptyLabel],
  );
  return (
    <SelectInput
      name={field.name}
      path={path ?? field.name}
      label={field.label}
      description={field.admin?.description}
      required={field.required}
      readOnly={readOnly || field.admin?.readOnly}
      showError={showError}
      options={options}
      value={value ?? ""}
      isClearable={false}
      onChange={(option) => {
        const picked = Array.isArray(option) ? option[0] : option;
        setValue((picked as { value?: string } | null)?.value || null);
      }}
    />
  );
};

export default TimezoneSelect;
