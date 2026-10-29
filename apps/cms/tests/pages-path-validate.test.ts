import { describe, expect, it } from "vitest";

import { validatePagePath } from "../src/hooks/pages-path-validate";

describe("validatePagePath", () => {
  it("accepts an ordinary path", () => {
    expect(validatePagePath("/merci")).toBe(true);
  });

  it("accepts a non-string value (another rule's problem)", () => {
    expect(validatePagePath(undefined)).toBe(true);
  });

  it("rejects the reserved /confirmation path", () => {
    expect(validatePagePath("/confirmation")).toMatch(/reserved/);
  });

  it("rejects it with a trailing slash", () => {
    expect(validatePagePath("/confirmation/")).toMatch(/reserved/);
  });

  it("doesn't itself add the leading slash — that's beforeValidate's job, which always runs first", () => {
    expect(validatePagePath("confirmation")).toBe(true);
  });

  it("does not reject a path that merely starts with /confirmation", () => {
    expect(validatePagePath("/confirmation-merci")).toBe(true);
  });

  it("018 — rejects the audience-measurement page path, with or without a trailing slash", () => {
    expect(validatePagePath("/audience-measurement")).toMatch(/"\/audience-measurement" is reserved/);
    expect(validatePagePath("/audience-measurement/")).toMatch(/reserved/);
    expect(validatePagePath("/audience-measurement-2")).toBe(true);
  });

  it("021 — rejects the legal pages' paths", () => {
    expect(validatePagePath("/privacy")).toMatch(/"\/privacy" is reserved/);
    expect(validatePagePath("/legal-notice/")).toMatch(/"\/legal-notice" is reserved/);
    expect(validatePagePath("/privacy-2")).toBe(true);
  });

  it.each([
    ["/confidentialite", "/privacy"],
    ["/mentions-legales", "/legal-notice"],
    ["/mesure-audience", "/audience-measurement"],
  ])("023 — rejects the old path %s, naming it and where it redirects", (oldPath, target) => {
    expect(validatePagePath(oldPath)).toBe(`"${oldPath}" is reserved: every site redirects it to ${target} — pick another path for this page.`);
    expect(validatePagePath(`${oldPath}/`)).toMatch(/reserved/);
    expect(validatePagePath(`${oldPath}-2`)).toBe(true);
  });
});
