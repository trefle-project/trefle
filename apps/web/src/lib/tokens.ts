import { createHmac, timingSafeEqual } from "node:crypto";

import { isViewNumber } from "@trefle/shared";

/**
 * HMAC helpers (T018) — see contracts/lead-intake.md, consent-withdrawal.md,
 * revalidation.md. Three independent secrets, all read from env:
 *   FORM_TOKEN_SECRET   — anti-timing token issued at page render
 *   UNSUBSCRIBE_SECRET  — tamper-evident unsubscribe link per lead
 *   REVALIDATE_SECRET   — signs the cms → web revalidation webhook body
 */

const b64url = (buf: Buffer): string =>
  buf.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const fromB64url = (s: string): Buffer =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

const hmac = (secret: string, data: string): Buffer =>
  createHmac("sha256", secret).update(data).digest();

/** Constant-time compare of two base64url signatures. */
const sigEquals = (a: string, b: string): boolean => {
  const ba = fromB64url(a);
  const bb = fromB64url(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
};

const requireSecret = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
};

// --- Form token (pageId + issuedAt) ---------------------------------------

export interface FormTokenPayload {
  pageId: string;
  issuedAt: number; // epoch ms
  /** 018 R15 — the view number of an edge-signed token (its random salt); absent when the renderer signed it. */
  viewNumber?: string;
}

export function signFormToken(pageId: string, issuedAt: number = Date.now()): string {
  const secret = requireSecret("FORM_TOKEN_SECRET");
  const body = `${pageId}.${issuedAt}`;
  return `${b64url(Buffer.from(body))}.${b64url(hmac(secret, body))}`;
}

export interface FormTokenCheck {
  minAgeMs?: number; // reject submissions faster than this (bot heuristic)
  maxAgeMs?: number; // reject stale tokens
}

export function verifyFormToken(
  token: string,
  { minAgeMs = 2_000, maxAgeMs = 2 * 60 * 60 * 1000 }: FormTokenCheck = {},
): { ok: true; payload: FormTokenPayload } | { ok: false; reason: "signature" } | { ok: false; reason: "timing"; pageId: string } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "signature" };
  const [bodyB64, sig] = parts as [string, string];
  const body = fromB64url(bodyB64).toString("utf8");
  const expected = b64url(hmac(requireSecret("FORM_TOKEN_SECRET"), body));
  if (!sigEquals(sig, expected)) return { ok: false, reason: "signature" };

  const [pageId, issuedAtStr, salt] = body.split(".") as [string, string, string | undefined];
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return { ok: false, reason: "signature" };
  const age = Date.now() - issuedAt;
  // The signature holds: the page is a real one, named so its refusal can speak its language (023 US6).
  if (age < minAgeMs || age > maxAgeMs) return { ok: false, reason: "timing", pageId };
  return { ok: true, payload: { pageId, issuedAt, ...(isViewNumber(salt) ? { viewNumber: salt } : {}) } };
}

// --- Unsubscribe token (per lead, no expiry) -----------------------------

export function signUnsubscribeToken(leadId: string): string {
  const secret = requireSecret("UNSUBSCRIBE_SECRET");
  return `${b64url(Buffer.from(leadId))}.${b64url(hmac(secret, leadId))}`;
}

export function verifyUnsubscribeToken(token: string): { ok: true; leadId: string } | { ok: false } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false };
  const [idB64, sig] = parts as [string, string];
  const leadId = fromB64url(idB64).toString("utf8");
  const expected = b64url(hmac(requireSecret("UNSUBSCRIBE_SECRET"), leadId));
  if (!sigEquals(sig, expected)) return { ok: false };
  return { ok: true, leadId };
}

// --- Double opt-in confirmation token (per lead, no expiry) --------------
// 006-double-optin-email, research.md §6 — byte-for-byte the same shape as
// the unsubscribe token pair above, own dedicated secret. `apps/cms`'s
// leadIntake.ts signs its own copy locally (no cross-app import, same
// reasoning as unsubscribeUrl() there); this app only ever verifies.

export function signConfirmToken(leadId: string): string {
  const secret = requireSecret("CONFIRM_TOKEN_SECRET");
  return `${b64url(Buffer.from(leadId))}.${b64url(hmac(secret, leadId))}`;
}

export function verifyConfirmToken(token: string): { ok: true; leadId: string } | { ok: false } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false };
  const [idB64, sig] = parts as [string, string];
  const leadId = fromB64url(idB64).toString("utf8");
  const expected = b64url(hmac(requireSecret("CONFIRM_TOKEN_SECRET"), leadId));
  if (!sigEquals(sig, expected)) return { ok: false };
  return { ok: true, leadId };
}

// --- Preview token (per page; 24h expiry — 003-post-launch-improvements, FR-006) ---

const PREVIEW_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function signPreviewToken(pageId: string, issuedAt: number = Date.now()): string {
  const secret = requireSecret("FORM_TOKEN_SECRET");
  const body = `${pageId}.${issuedAt}`;
  return `${b64url(Buffer.from(body))}.${b64url(hmac(secret, body))}`;
}

export function verifyPreviewToken(token: string): { ok: true; pageId: string } | { ok: false } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false };
  const [bodyB64, sig] = parts as [string, string];
  const body = fromB64url(bodyB64).toString("utf8");
  const expected = b64url(hmac(requireSecret("FORM_TOKEN_SECRET"), body));
  if (!sigEquals(sig, expected)) return { ok: false };

  const [pageId, issuedAtStr] = body.split(".") as [string, string];
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > PREVIEW_TOKEN_TTL_MS) return { ok: false };
  return { ok: true, pageId };
}

// --- Revalidation webhook signature -------------------------------------

export function revalidateSignature(rawBody: string): string {
  return hmac(requireSecret("REVALIDATE_SECRET"), rawBody).toString("hex");
}

/**
 * 020-edge-html-cache (contracts/edge-ingest.md) — batches from the edge Worker
 * are signed with EDGE_SECRET: hex HMAC-SHA256 of the raw body. False when
 * EDGE_SECRET is unset.
 */
export function verifyEdgeSignature(rawBody: string, signatureHex: string): boolean {
  const secret = process.env.EDGE_SECRET;
  if (!secret || !/^[0-9a-f]{64}$/.test(signatureHex)) return false;
  return timingSafeEqual(createHmac("sha256", secret).update(rawBody).digest(), Buffer.from(signatureHex, "hex"));
}

export function verifyRevalidateSignature(rawBody: string, signatureHex: string): boolean {
  const expected = revalidateSignature(rawBody);
  if (expected.length !== signatureHex.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signatureHex, "hex"));
}
