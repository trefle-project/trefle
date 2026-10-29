import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.FORM_TOKEN_SECRET = "test-form-secret";
  process.env.UNSUBSCRIBE_SECRET = "test-unsub-secret";
  process.env.CONFIRM_TOKEN_SECRET = "test-confirm-secret";
  process.env.REVALIDATE_SECRET = "test-reval-secret";
});

// Imported after env is set (module reads secrets lazily, but keep it explicit).
const tokens = () => import("../src/lib/tokens.js");

describe("form token", () => {
  it("round-trips a fresh token outside the timing window", async () => {
    const { signFormToken, verifyFormToken } = await tokens();
    const t = signFormToken("page-1", Date.now() - 5_000);
    const r = verifyFormToken(t);
    expect(r).toEqual({ ok: true, payload: { pageId: "page-1", issuedAt: expect.any(Number) } });
  });

  it("rejects a tampered signature", async () => {
    const { signFormToken, verifyFormToken } = await tokens();
    const t = signFormToken("page-1", Date.now() - 5_000);
    const bad = `${t.slice(0, -2)}xx`;
    expect(verifyFormToken(bad)).toEqual({ ok: false, reason: "signature" });
  });

  it("rejects a submission that is too fast (bot heuristic)", async () => {
    const { signFormToken, verifyFormToken } = await tokens();
    const t = signFormToken("page-1", Date.now()); // age ~0ms
    expect(verifyFormToken(t)).toEqual({ ok: false, reason: "timing", pageId: "page-1" });
  });

  it("accepts a token signed at the edge with a salt segment (020, SC-005)", async () => {
    const { verifyFormToken } = await tokens();
    const { createHmac } = await import("node:crypto");
    const issuedAt = Date.now() - 5_000;
    const body = `12.${issuedAt}.c2FsdA`;
    const t = `${Buffer.from(body).toString("base64url")}.${createHmac("sha256", "test-form-secret").update(body).digest("base64url")}`;
    expect(verifyFormToken(t)).toEqual({ ok: true, payload: { pageId: "12", issuedAt } });
    expect(verifyFormToken(`${t.slice(0, -2)}xx`)).toEqual({ ok: false, reason: "signature" });
  });

  it("rejects a stale token", async () => {
    const { signFormToken, verifyFormToken } = await tokens();
    const t = signFormToken("page-1", Date.now() - 3 * 60 * 60 * 1000);
    expect(verifyFormToken(t)).toEqual({ ok: false, reason: "timing", pageId: "page-1" });
  });
});

describe("unsubscribe token", () => {
  it("round-trips a lead id", async () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } = await tokens();
    const t = signUnsubscribeToken("lead-42");
    expect(verifyUnsubscribeToken(t)).toEqual({ ok: true, leadId: "lead-42" });
  });

  it("rejects a forged token", async () => {
    const { verifyUnsubscribeToken } = await tokens();
    expect(verifyUnsubscribeToken("bogus.value")).toEqual({ ok: false });
  });
});

describe("confirm token (006-double-optin-email)", () => {
  it("round-trips a lead id", async () => {
    const { signConfirmToken, verifyConfirmToken } = await tokens();
    const t = signConfirmToken("lead-42");
    expect(verifyConfirmToken(t)).toEqual({ ok: true, leadId: "lead-42" });
  });

  it("rejects a forged token", async () => {
    const { verifyConfirmToken } = await tokens();
    expect(verifyConfirmToken("bogus.value")).toEqual({ ok: false });
  });

  it("rejects a tampered signature", async () => {
    const { signConfirmToken, verifyConfirmToken } = await tokens();
    const t = signConfirmToken("lead-42");
    expect(verifyConfirmToken(`${t.slice(0, -2)}xx`)).toEqual({ ok: false });
  });

  it("isn't interchangeable with an unsubscribe token (different secret)", async () => {
    const { signUnsubscribeToken, verifyConfirmToken } = await tokens();
    const unsubToken = signUnsubscribeToken("lead-42");
    expect(verifyConfirmToken(unsubToken)).toEqual({ ok: false });
  });
});

describe("preview token (003-post-launch-improvements, FR-006)", () => {
  it("round-trips a fresh token", async () => {
    const { signPreviewToken, verifyPreviewToken } = await tokens();
    const t = signPreviewToken("42");
    expect(verifyPreviewToken(t)).toEqual({ ok: true, pageId: "42" });
  });

  it("rejects a tampered signature", async () => {
    const { signPreviewToken, verifyPreviewToken } = await tokens();
    const t = signPreviewToken("42");
    expect(verifyPreviewToken(`${t.slice(0, -2)}xx`)).toEqual({ ok: false });
  });

  it("accepts a token right at the 24h boundary", async () => {
    const { signPreviewToken, verifyPreviewToken } = await tokens();
    const t = signPreviewToken("42", Date.now() - 24 * 60 * 60 * 1000 + 1000);
    expect(verifyPreviewToken(t)).toEqual({ ok: true, pageId: "42" });
  });

  it("rejects a token issued more than 24h ago", async () => {
    const { signPreviewToken, verifyPreviewToken } = await tokens();
    const t = signPreviewToken("42", Date.now() - (24 * 60 * 60 * 1000 + 1000));
    expect(verifyPreviewToken(t)).toEqual({ ok: false });
  });
});

describe("revalidate signature", () => {
  it("verifies its own signature and rejects a changed body", async () => {
    const { revalidateSignature, verifyRevalidateSignature } = await tokens();
    const body = JSON.stringify({ tags: ["page:1"], at: new Date().toISOString() });
    const sig = revalidateSignature(body);
    expect(verifyRevalidateSignature(body, sig)).toBe(true);
    expect(verifyRevalidateSignature(body + " ", sig)).toBe(false);
  });
});
