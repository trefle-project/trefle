import { describe, expect, it, vi } from "vitest";

import { LegalVersions } from "../src/collections/LegalVersions";
import { atMostOneHost, requireFrenchLegalTexts } from "../src/hooks/settings-cookie-banner";

/** 021-legal-pages (data-model.md, contracts/admin.md) — Settings rules and the archive's access. */
type Hook = (args: unknown) => Promise<unknown> | unknown;
const req = { payload: { find: vi.fn().mockResolvedValue({ docs: [{ id: 1 }] }) }, i18n: { language: "fr" } };

describe("requireFrenchLegalTexts", () => {
  it("accepts texts that keep a French row, and a save that does not touch them", async () => {
    await expect((requireFrenchLegalTexts as Hook)({ data: { legalTexts: [{ language: 1 }, { language: { id: 2 } }] }, req })).resolves.toBeTruthy();
    await expect((requireFrenchLegalTexts as Hook)({ data: { operator: {} }, req })).resolves.toBeTruthy();
  });

  it("refuses texts without a French row, in French", async () => {
    await expect((requireFrenchLegalTexts as Hook)({ data: { legalTexts: [{ language: 2 }] }, req })).rejects.toThrow(/version en français/);
    await expect((requireFrenchLegalTexts as Hook)({ data: { legalTexts: [{ language: 2 }] }, req: { ...req, i18n: { language: "en" } } })).rejects.toThrow(
      "The legal texts must keep a French (fr) version: it is the fallback language of every page.",
    );
  });
});

describe("atMostOneHost", () => {
  it("accepts zero or one host", () => {
    expect(() => (atMostOneHost as Hook)({ data: { suppliers: [{ isHost: true }, { isHost: false }] } })).not.toThrow();
    expect(() => (atMostOneHost as Hook)({ data: {} })).not.toThrow();
  });

  it("refuses two hosts", () => {
    const two = { suppliers: [{ isHost: true }, { isHost: true }] };
    expect(() => (atMostOneHost as Hook)({ data: two, req })).toThrow(/Un seul sous-traitant/);
    expect(() => (atMostOneHost as Hook)({ data: two, req: { i18n: { language: "en" } } })).toThrow("Only one processor can be marked as the host.");
  });
});

describe("legal-versions access", () => {
  const member = { role: "editor", isActive: true };
  it("members read, nobody writes", async () => {
    const access = LegalVersions.access!;
    expect(await (access.read as Hook)({ req: { user: member } })).toBe(true);
    expect(await (access.read as Hook)({ req: { user: null } })).toBe(false);
    for (const op of ["create", "update", "delete"] as const) {
      expect(await (access[op] as Hook)({ req: { user: { role: "admin", isActive: true } } })).toBe(false);
    }
  });
});
