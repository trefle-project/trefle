import { describe, expect, it, vi } from "vitest";

import { validateOptInEmailLanguage } from "../src/hooks/pages-optin-email-validate";

const reqWithEmail = (email: { language: unknown } | null) => ({
  payload: { findByID: vi.fn().mockResolvedValue(email) },
});

describe("validateOptInEmailLanguage (006-double-optin-email, FR-004)", () => {
  it("accepts an unset value (the field is optional)", async () => {
    const req = reqWithEmail(null);
    const result = await validateOptInEmailLanguage(undefined, { req, siblingData: { language: 1 } } as never);
    expect(result).toBe(true);
  });

  it("accepts when the opt-in email's language matches the page's", async () => {
    const req = reqWithEmail({ language: 1 });
    const result = await validateOptInEmailLanguage(5, { req, siblingData: { language: 1 } } as never);
    expect(result).toBe(true);
  });

  it("accepts when both languages are resolved relationship objects with matching ids", async () => {
    const req = reqWithEmail({ language: { id: 1 } });
    const result = await validateOptInEmailLanguage(5, { req, siblingData: { language: { id: 1 } } } as never);
    expect(result).toBe(true);
  });

  it("rejects when the opt-in email's language differs from the page's", async () => {
    const req = reqWithEmail({ language: 2 });
    const result = await validateOptInEmailLanguage(5, { req, siblingData: { language: 1 } } as never);
    expect(result).toMatch(/doesn't match/);
  });

  it("doesn't double-report when the page's own language is still unset", async () => {
    const req = reqWithEmail({ language: 2 });
    const result = await validateOptInEmailLanguage(5, { req, siblingData: {} } as never);
    expect(result).toBe(true);
  });

  it("doesn't fail the save if the referenced opt-in email can't be resolved", async () => {
    const req = { payload: { findByID: vi.fn().mockRejectedValue(new Error("not found")) } };
    const result = await validateOptInEmailLanguage(999, { req, siblingData: { language: 1 } } as never);
    expect(result).toBe(true);
  });
});
