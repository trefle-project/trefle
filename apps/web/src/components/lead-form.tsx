import { PRIVACY_PAGE_PATH } from "@trefle/shared";

import type { FormFieldConfig, PublishedPage } from "../lib/payload-client";
import { langIfDifferent, visitorCopy } from "../lib/visitor-copy";

/**
 * Server-rendered lead form (T046). Plain HTML `<form method="post">` — works
 * with JavaScript disabled. The consent control is always present, never
 * pre-ticked (FR-015/020); a hidden honeypot + a signed form token guard against
 * bots (research.md §5).
 */
export function LeadForm({
  pageId,
  formToken,
  form,
  values,
  errors,
  privacyHref,
  language,
}: {
  pageId: string | number;
  formToken: string;
  form: PublishedPage["form"];
  values?: Record<string, string>;
  errors?: Record<string, string>;
  /** 021-legal-pages (research R6) — the domain's policy, used when the form has no link of its own. */
  privacyHref?: string;
  /** 023-admin-i18n (US6) — the page's language code: Trefle's own texts follow it. */
  language?: string;
}) {
  const { lang, copy } = visitorCopy(language);
  const own = langIfDifferent(lang, language);
  return (
    <form method="post" action="/api/leads" className="trefle-lead-form" noValidate>
      <input type="hidden" name="pageId" value={String(pageId)} />
      <input type="hidden" name="formToken" value={formToken} />
      {/* honeypot — visually hidden, aria-hidden, not tabbable */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          {copy.form.honeypot}
          {/* Named to avoid any resemblance to an email/contact field —
              browser autofill and password managers ignore autoComplete="off"
              for fields whose name looks like one, which was silently
              swallowing real submissions (filled decoy -> treated as a bot). */}
          <input type="text" name="hp_check" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {(form.fields ?? []).map((f: FormFieldConfig) => (
        <Field key={f.name} field={f} value={values?.[f.name]} error={errors?.[f.name]} />
      ))}

      <div className="trefle-field trefle-consent">
        <label>
          <input
            type="checkbox"
            name="consent"
            value="on"
            required
            aria-describedby={`trefle-consent-text${errors?.consent ? " trefle-consent-error" : ""}`}
            aria-invalid={errors?.consent ? true : undefined}
          />{" "}
          <span id="trefle-consent-text">{form.consentPurposeText}</span>{" "}
          <a href={form.privacyNoticeUrl || privacyHref || PRIVACY_PAGE_PATH} target="_blank" rel="noreferrer" lang={own}>
            {copy.form.privacyLink}
            <span className="trefle-visually-hidden">{copy.form.newWindow}</span>
          </a>
        </label>
        {errors?.consent ? (
          <p id="trefle-consent-error" className="trefle-error" role="alert">
            {errors.consent}
          </p>
        ) : null}
      </div>

      <button type="submit" lang={form.submitLabel ? undefined : own}>
        {form.submitLabel || copy.form.submit}
      </button>
    </form>
  );
}

function Field({ field, value, error }: { field: FormFieldConfig; value?: string; error?: string }) {
  const id = `trefle-${field.name}`;
  const errorId = `${id}-error`;
  const common = {
    id,
    name: field.name,
    required: field.required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
  };
  const errorEl = error ? (
    <p id={errorId} className="trefle-error" role="alert">
      {error}
    </p>
  ) : null;
  if (field.type === "radio") {
    // A group of inputs can't share one <label htmlFor> — fieldset/legend
    // gives screen readers the group name; the error hangs off the fieldset.
    return (
      <fieldset
        className="trefle-field trefle-radio-group"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      >
        <legend>
          {field.label}
          {field.required ? " *" : ""}
        </legend>
        {(field.options ?? []).map((o, i) => (
          <label key={o.value} htmlFor={`${id}-${i}`}>
            <input
              type="radio"
              id={`${id}-${i}`}
              name={field.name}
              value={o.value}
              required={field.required}
              defaultChecked={value === o.value}
            />{" "}
            {o.label}
          </label>
        ))}
        {errorEl}
      </fieldset>
    );
  }
  return (
    <div className="trefle-field">
      <label htmlFor={id}>
        {field.label}
        {field.required ? " *" : ""}
      </label>
      {field.type === "textarea" ? (
        <textarea {...common} defaultValue={value} />
      ) : field.type === "select" ? (
        <select {...common} defaultValue={value ?? ""}>
          <option value="" disabled>
            —
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "checkbox" ? (
        <input type="checkbox" {...common} defaultChecked={value === "on"} value="on" />
      ) : field.type === "tel" ? (
        <input type="tel" autoComplete="tel" {...common} defaultValue={value} />
      ) : field.type === "number" ? (
        <input type="number" inputMode="decimal" step="any" {...common} defaultValue={value} />
      ) : field.type === "date" ? (
        <input type="date" {...common} defaultValue={value} />
      ) : (
        <input type={field.type === "email" ? "email" : "text"} {...common} defaultValue={value} />
      )}
      {errorEl}
    </div>
  );
}
