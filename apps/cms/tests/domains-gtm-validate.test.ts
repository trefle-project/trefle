import { describe, expect, it } from "vitest";

import { normalizeGtmContainerId, validateGtmContainerId } from "../src/hooks/domains-gtm-validate";

// 007-gtm-tagging, FR-001.

describe("normalizeGtmContainerId", () => {
  it("trims and upper-cases a string value", () => {
    expect(normalizeGtmContainerId("  gtm-abc1234  ")).toBe("GTM-ABC1234");
  });

  it("passes through a non-string value unchanged", () => {
    expect(normalizeGtmContainerId(undefined)).toBeUndefined();
    expect(normalizeGtmContainerId(null)).toBeNull();
  });
});

describe("validateGtmContainerId", () => {
  it("accepts a well-formed container id", () => {
    expect(validateGtmContainerId("GTM-ABC1234")).toBe(true);
  });

  it("accepts an empty/unset value (the field is optional)", () => {
    expect(validateGtmContainerId(undefined)).toBe(true);
    expect(validateGtmContainerId(null)).toBe(true);
    expect(validateGtmContainerId("")).toBe(true);
  });

  it("rejects a value missing the GTM- prefix", () => {
    expect(validateGtmContainerId("ABC1234")).not.toBe(true);
  });

  it("rejects a value with no suffix after GTM-", () => {
    expect(validateGtmContainerId("GTM-")).not.toBe(true);
  });
});
