/**
 * Domain-level literal unions shared by both apps.
 * Kept hand-written so `@trefle/web` never has to import `payload`.
 * The CMS still generates its own `payload-types.ts` for internal use.
 */

export const ROLES = ["admin", "editor"] as const;
export type Role = (typeof ROLES)[number];

export const CONSENT_STATUS = ["consented", "withdrawn"] as const;
export type ConsentStatus = (typeof CONSENT_STATUS)[number];

export const PAGE_STATUS = ["draft", "published"] as const;
export type PageStatus = (typeof PAGE_STATUS)[number];

export const DSR_TYPES = ["access", "portability", "rectification", "erasure"] as const;
export type DsrType = (typeof DSR_TYPES)[number];

export const DSR_STATUS = ["received", "in_progress", "completed"] as const;
export type DsrStatus = (typeof DSR_STATUS)[number];

export const ACTIVITY_TYPES = [
  "page-published",
  "page-unpublished",
  "page-content-changed",
  // 014-custom-code-editing, FR-023 — an admin changed a page's scripts or code blocks.
  "page-code-changed",
  "member-invited",
  "member-role-changed",
  "member-removed",
  "settings-changed",
  "leads-exported",
  "dsr-completed",
  "retention-deletion",
  // 019-admin-access — second factor and edge allow-list.
  "totp-enrolled",
  "totp-reset",
  "totp-locked",
  "edge-synced",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const FORM_FIELD_TYPES = ["email", "text", "textarea", "select", "checkbox", "tel", "radio", "number", "date"] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

/** Default retention window applied when a workspace has not set one (FR-030). */
export const DEFAULT_RETENTION_MONTHS = 24;
