import type { CollectionBeforeChangeHook } from "payload";
import { APIError } from "payload";

/**
 * T033 (FR-002a, FR-003), extended by 004-page-types (FR-003/FR-004/FR-005/FR-006/FR-007) —
 * a page may only move to `published` when:
 *  - `subscription` pages: exactly one lead-form block, a fully configured
 *    form (one email field, every field named/labelled, the consent/privacy
 *    settings set) — unchanged from 001/003;
 *  - `free`/`confirmation` pages: **zero** lead-form blocks, and NONE of the
 *    form-configuration checks apply (FR-007) — a page with no lead-gen
 *    purpose has no lead-gen form to configure;
 *  - `confirmation` pages additionally: `builder.html` must contain the
 *    `{{unsubscribeUrl}}` placeholder (FR-005/FR-006) — the token the
 *    /confirmation route substitutes before serving the page;
 *  - every type, unconditionally: a domain assigned, a path assigned, the
 *    block editor has produced non-empty html, and (domain, path) unique
 *    among published pages.
 * On rejection the currently-live version keeps serving.
 *
 * 008-ab-testing — a page with `experimentOf` set is a test variant, never
 * resolved by its own (domain, path); it skips every domain/path/URL check
 * below (data-model.md). Every other rule — lead-form/consent requirements —
 * still applies, since a variant's content is real, publishable content.
 *
 * 016-carousel-block — a lead-form block inside a carousel slide is refused:
 * the form must stay visible to every visitor without interaction. Editor
 * drop rules prevent it; this catches the « Code » view and the API.
 */
export const publishGuard: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const nextStatus = data?.status ?? originalDoc?.status;
  if (nextStatus !== "published") return data;

  const isVariant = !!(data?.experimentOf ?? originalDoc?.experimentOf);

  const pageType = (data?.pageType ?? originalDoc?.pageType ?? "subscription") as
    | "subscription"
    | "free"
    | "confirmation";

  const builder = (data?.builder ?? originalDoc?.builder ?? {}) as {
    blockCount?: { leadForm?: number; leadFormInCarousel?: number };
    html?: string;
  };
  const form = (data?.form ?? originalDoc?.form ?? {}) as {
    fields?: { name?: string; label?: string; type?: string; required?: boolean }[];
    successMessage?: string;
    consentPurposeText?: string;
    privacyNoticeUrl?: string;
    privacyNoticeVersion?: string;
  };
  const domain = data?.domain ?? originalDoc?.domain;
  const path = data?.path ?? originalDoc?.path;

  const problems: string[] = [];

  const leadForms = builder.blockCount?.leadForm ?? 0;
  if (pageType === "subscription") {
    if (leadForms !== 1) problems.push(`the page must contain exactly one lead-form block (found ${leadForms})`);
  } else if (leadForms !== 0) {
    problems.push(`the page must not contain a lead-form block (found ${leadForms})`);
  }
  if ((builder.blockCount?.leadFormInCarousel ?? 0) > 0) {
    problems.push("the lead-form block cannot be placed inside a carousel");
  }
  if (!builder.html || builder.html.trim() === "") problems.push("the block editor has not produced any content yet");
  if (!isVariant) {
    if (!domain) problems.push("assign the page to a domain");
    if (!path) problems.push("set a path for the page");
  }

  // 004-page-types, FR-005/FR-006 — a confirmation page must carry the
  // unsubscribe-link token; without it the substitution in
  // apps/web/src/app/(confirmation)/confirmation/page.tsx has nothing to
  // replace and the visitor gets no way to unsubscribe.
  if (pageType === "confirmation" && !builder.html?.includes("{{unsubscribeUrl}}")) {
    problems.push("the confirmation page must include the unsubscribe-link placeholder");
  }

  // 004-page-types, FR-007 — no lead-generation-form configuration
  // requirements outside `subscription`.
  if (pageType === "subscription") {
    const fields = form.fields ?? [];
    const emailFields = fields.filter((f) => f.type === "email");
    if (emailFields.length !== 1) problems.push("the form must have exactly one email field");
    if (fields.some((f) => !f.name || !f.label)) problems.push("every form field needs a name and a label");
    for (const key of ["successMessage", "consentPurposeText", "privacyNoticeUrl", "privacyNoticeVersion"] as const) {
      if (!form[key] || String(form[key]).trim() === "") problems.push(`form setting "${key}" is required to publish`);
    }
  }

  if (!isVariant && domain && path) {
    const domainId = typeof domain === "object" ? (domain as { id: string }).id : domain;
    const clash = await req.payload.find({
      collection: "pages",
      where: {
        and: [
          { domain: { equals: domainId } },
          { path: { equals: path } },
          { status: { equals: "published" } },
          ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if (clash.totalDocs > 0) problems.push(`another published page already uses ${path} on this domain`);
  }

  if (problems.length > 0) {
    throw new APIError(`Cannot publish: ${problems.join("; ")}.`, 400, undefined, true);
  }

  if (!originalDoc || originalDoc.status !== "published") {
    data.publishedAt = data.publishedAt ?? new Date().toISOString();
  }
  return data;
};
