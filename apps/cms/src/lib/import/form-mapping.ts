import type { ExtractForm, ExtractFormField, ReportText } from "@trefle/grapesjs-page-import/serialize";

import type { Page } from "../../payload-types";

/**
 * Source form → the page's own form settings (012-url-page-import, FR-016,
 * FR-016a). Only the existing form tools are used: the fields of `pages.form`
 * with the product's field types, and the workspace defaults from Settings.
 * Nothing the source can't tell (success message, consent wording, privacy
 * notice) is invented — it is left to the editor and listed in the report.
 *
 * - Radio buttons sharing a name become one `radio` field whose options are
 *   the buttons' labels (label: the fieldset legend).
 * - A source consent checkbox is dropped: every Trefle form renders its own
 *   consent control (never a normal field).
 * - Exactly one `email` field is kept; a form without one is reported.
 * - Field names are the source's, made safe and unique, never one of the
 *   names the published form already uses (`consent`, `pageId`…).
 */

export type PageForm = NonNullable<Page["form"]>;
type PageField = NonNullable<PageForm["fields"]>[number];
type FieldType = PageField["type"];

export type FormDefaults = {
  defaultConsentPurposeText?: string | null;
  defaultPrivacyNoticeUrl?: string | null;
  defaultPrivacyNoticeVersion?: string | null;
};

export type MappedForm = {
  form: PageForm;
  /** Source fields with no supported equivalent (report `formFieldsUnmapped`). */
  unmapped: ReportText[];
  simplified: { what: ReportText; how: ReportText }[];
  actions: ReportText[];
};

const TYPES: Record<string, FieldType> = {
  email: "email",
  text: "text",
  search: "text",
  url: "text",
  tel: "tel",
  number: "number",
  range: "number",
  date: "date",
  textarea: "textarea",
  select: "select",
  checkbox: "checkbox",
  radio: "radio",
};

/** Names the published form already posts (apps/web lead-form.tsx). */
const RESERVED = new Set(["consent", "pageid", "formtoken", "hp_check"]);

const CONSENT_RE =
  /(j'accepte|accepte|consent|rgpd|gdpr|confidentialit|privacy|conditions|cgu|cgv|politique|données personnelles|donnees personnelles|agree)/i;

const clean = (s: string | undefined) => (s ?? "").replace(/\s*\*\s*$/, "").replace(/\s+/g, " ").trim();

/** "form[first_name]" → "first_name"; "Votre prénom" → "votrePrenom". */
function safeName(raw: string | undefined, label: string): string {
  const fromName = (raw ?? "").replace(/^.*\[([^\]]+)\]$/, "$1");
  const base = fromName.trim() ? fromName : label;
  const words = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9_]+/)
    .filter(Boolean);
  const name = fromName.trim()
    ? words.join("_")
    : words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase())).join("");
  return /^[A-Za-z_]/.test(name) ? name : `champ${name ? `_${name}` : ""}`;
}

/** "first_name" → "First name". */
const humanise = (name: string | undefined) => {
  const s = (name ?? "").replace(/^.*\[([^\]]+)\]$/, "$1").replace(/[_-]+/g, " ").trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : "";
};

export function mapForm(source: ExtractForm, defaults: FormDefaults): MappedForm {
  const fields: PageField[] = [];
  const unmapped: ReportText[] = [];
  const simplified: MappedForm["simplified"] = [];
  const used = new Set<string>();

  const uniqueName = (raw: string | undefined, label: string) => {
    let name = safeName(raw, label);
    if (RESERVED.has(name.toLowerCase())) name = `${name}_source`;
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${name}${n}`;
    used.add(candidate.toLowerCase());
    return candidate;
  };

  // Radio buttons and checkboxes sharing a name are one question.
  const groups = new Map<string, ExtractFormField[]>();
  for (const f of source.fields) {
    if ((f.type === "radio" || f.type === "checkbox") && f.name) {
      const key = `${f.type}:${f.name}`;
      groups.set(key, [...(groups.get(key) ?? []), f]);
    }
  }
  const handled = new Set<string>();

  let emailKept = false;
  source.fields.forEach((f, index) => {
    const label = clean(f.label) || clean(f.group) || humanise(f.name) || `Champ ${index + 1}`;
    const groupKey = f.name && (f.type === "radio" || f.type === "checkbox") ? `${f.type}:${f.name}` : null;
    if (groupKey && handled.has(groupKey)) return;
    if (groupKey) handled.add(groupKey);
    const members = groupKey ? groups.get(groupKey)! : [f];

    if (f.type === "checkbox" && members.length === 1 && CONSENT_RE.test(label)) {
      simplified.push({ what: { key: "imports.report.consentCheckbox", values: { label } }, how: { key: "imports.report.consentCheckboxHow" } });
      return;
    }
    if (f.type === "checkbox" && members.length > 1) {
      unmapped.push({ key: "imports.report.unmappedCheckboxes", values: { label: clean(f.group) || humanise(f.name) || label } });
      return;
    }
    const type = TYPES[f.type];
    if (!type) {
      unmapped.push(`${label} (${f.type})`);
      return;
    }
    if (type === "email") {
      if (emailKept) {
        unmapped.push({ key: "imports.report.unmappedSecondEmail", values: { label } });
        return;
      }
      emailKept = true;
    }

    const field: PageField = { name: "", label, type, required: members.some((m) => m.required) };
    if (type === "radio") {
      field.label = clean(f.group) || humanise(f.name) || label;
      const labels = [...new Set(members.map((m) => clean(m.label)).filter(Boolean))];
      if (!labels.length) {
        unmapped.push({ key: "imports.report.unmappedNoChoiceLabels", values: { label: field.label } });
        return;
      }
      field.options = labels.map((l) => ({ label: l, value: l }));
    }
    if (type === "select") {
      const options = [...new Set((f.options ?? []).map(clean).filter(Boolean))];
      if (!options.length) {
        unmapped.push({ key: "imports.report.unmappedNoChoices", values: { label } });
        return;
      }
      field.options = options.map((l) => ({ label: l, value: l }));
    }
    field.name = uniqueName(f.name, field.label);
    fields.push(field);
  });

  const actions: ReportText[] = [{ key: "imports.report.writeSuccessMessage" }];
  if (!emailKept) actions.push({ key: "imports.report.addEmailField" });
  const consentPurposeText = defaults.defaultConsentPurposeText?.trim() || undefined;
  const privacyNoticeUrl = defaults.defaultPrivacyNoticeUrl?.trim() || undefined;
  const privacyNoticeVersion = defaults.defaultPrivacyNoticeVersion?.trim() || undefined;
  if (!consentPurposeText) actions.push({ key: "imports.report.setConsentText" });
  if (!privacyNoticeUrl) actions.push({ key: "imports.report.setPrivacyUrl" });
  if (!privacyNoticeVersion) actions.push({ key: "imports.report.setPrivacyVersion" });

  return {
    form: {
      fields,
      submitLabel: clean(source.submitLabel) || "Envoyer",
      consentPurposeText,
      privacyNoticeUrl,
      privacyNoticeVersion,
    },
    unmapped,
    simplified,
    actions,
  };
}
