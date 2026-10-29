/**
 * @trefle/shared — types and schemas both apps agree on.
 *
 * Phase 1 scaffold: only the cache-tag helpers and a couple of DTO placeholders
 * live here so far. Payload-generated types are wired in during Phase 2 (T015).
 */
import { z } from "zod";

export * from "./domain";
export * from "./blocks";
export * from "./html-allowlist";
export * from "./custom-code";
export * from "./fonts";
export * from "./carousel";
export * from "./ab-bucket";
export * from "./edge";

// --- Cache tags (see contracts/revalidation.md) ------------------------------

export const pageTag = (id: string) => `page:${id}` as const;
export const domainTag = (id: string) => `domain:${id}` as const;
export const PAGE_LIST_TAG = "page-list" as const;
/** 017-edge-protection — the media alias map (old object key → current key). */
export const MEDIA_ALIASES_TAG = "media-aliases" as const;

// --- Lead intake DTO (see contracts/lead-intake.md) -------------------------

export const utmSchema = z.object({
  source: z.string().optional(),
  medium: z.string().optional(),
  campaign: z.string().optional(),
  term: z.string().optional(),
  content: z.string().optional(),
});
export type Utm = z.infer<typeof utmSchema>;

export const leadIntakeSchema = z.object({
  pageId: z.string().min(1),
  email: z.string().email(),
  fieldValues: z.record(z.string(), z.unknown()).default({}),
  consent: z.literal(true),
  consentContext: z.object({
    consentText: z.string(),
    purposeText: z.string(),
    privacyNoticeUrl: z.string(),
    privacyNoticeVersion: z.string(),
    capturedAt: z.string(),
    ip: z.string(),
    userAgent: z.string(),
  }),
  metadata: z.object({
    pageUrl: z.string(),
    referrer: z.string().optional(),
    utm: utmSchema.default({}),
  }),
});
export type LeadIntakePayload = z.infer<typeof leadIntakeSchema>;

// --- Revalidation DTO (see contracts/revalidation.md) ----------------------

export const revalidateSchema = z.object({
  reason: z.enum([
    "page-published",
    "page-unpublished",
    "page-changed",
    "domain-changed",
    "domain-deleted",
    "settings-changed",
    "experiment-changed",
    "media",
  ]),
  tags: z.array(z.string()).min(1),
  at: z.string(),
});
export type RevalidatePayload = z.infer<typeof revalidateSchema>;
