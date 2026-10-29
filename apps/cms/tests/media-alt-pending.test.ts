import { describe, expect, it } from "vitest";

import { clearAltPendingOnDescribe, validateAlt } from "../src/collections/Media";

/**
 * 012-url-page-import (T020, FR-013) — a description stays required for
 * manual uploads; only an image flagged "À décrire" (imported without one)
 * may have none, and writing a description clears the flag.
 */
const validate = (value: unknown, siblingData: Record<string, unknown>) =>
  validateAlt(value as string, { siblingData } as never);

describe("media alt", () => {
  it("rejects a manual upload without a description", () => {
    expect(validate("", {})).toMatch(/Décrivez l'image/);
    expect(validate("   ", { altPending: false })).toMatch(/Décrivez l'image/);
    expect(validate(undefined, {})).toMatch(/Décrivez l'image/);
  });

  it("accepts an empty description when the image is flagged À décrire", () => {
    expect(validate("", { altPending: true })).toBe(true);
  });

  it("accepts any real description", () => {
    expect(validate("Un potager en été", {})).toBe(true);
  });

  it("writing a description clears À décrire", () => {
    const hook = (data: Record<string, unknown>) => clearAltPendingOnDescribe({ data } as never);
    expect(hook({ alt: "Un potager", altPending: true })).toMatchObject({ altPending: false });
    expect(hook({ alt: "", altPending: true })).toMatchObject({ altPending: true });
    expect(hook({ alt: "Déjà décrite", altPending: false })).toMatchObject({ altPending: false });
  });
});
