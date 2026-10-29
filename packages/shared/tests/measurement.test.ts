import { describe, expect, it } from "vitest";

import { formTokenBody, isViewNumber } from "../src/edge";

/** 018-ab-significance (research R15) — the view number shared by the Worker, the renderer and the CMS. */
describe("isViewNumber", () => {
  it("accepts the Worker's salt format (8 bytes, base64url, 11 characters)", () => {
    expect(isViewNumber("AbC-_09xYz1")).toBe(true);
  });

  it("rejects anything else", () => {
    for (const v of ["", "short", "AbC-_09xYz12", "AbC+/09xYz1", "11111111-1111-4111-8111-111111111111", 42, undefined]) {
      expect(isViewNumber(v)).toBe(false);
    }
  });

  it("is the third segment of an edge-signed form token body", () => {
    expect(formTokenBody("57", 1760000000000, "AbC-_09xYz1").split(".")[2]).toBe("AbC-_09xYz1");
  });
});
