import type { Field } from "payload";
import { describe, expect, it } from "vitest";

import { adminFieldOnly, adminOrServiceFieldRead } from "../src/access";
import { Pages } from "../src/collections/Pages";
import { customCodeField } from "../src/fields/customCode";

/**
 * 014-custom-code-editing, FR-002/FR-017, research R1 — page scripts and
 * code-block contents are admin-only. Payload enforces field-level access on
 * every route (REST, GraphQL, local API without overrideAccess): an
 * unreadable field is omitted from the response, an unwritable one keeps its
 * stored value. These tests pin the rules and that they're wired on the
 * `customCode` group of `pages`.
 */
const call = (fn: (...a: never[]) => unknown, user: unknown) => fn({ req: { user } } as never);

const admin = { id: "u1", role: "admin", isActive: true };
const editor = { id: "u2", role: "editor", isActive: true };
const inactiveAdmin = { id: "u3", role: "admin", isActive: false };
const service = { id: "svc", isService: true };

type Named = Field & { name?: string; fields?: Field[]; access?: Record<string, unknown> };

function findNamed(fields: Field[], name: string): Named | undefined {
  for (const f of fields as Named[]) {
    if (f.name === name) return f;
    if (f.fields) {
      const hit = findNamed(f.fields, name);
      if (hit) return hit;
    }
  }
  return undefined;
}

describe("customCode access (014, R1)", () => {
  it("read: active admin and the renderer's service account only", () => {
    expect(call(adminOrServiceFieldRead, admin)).toBe(true);
    expect(call(adminOrServiceFieldRead, service)).toBe(true);
    expect(call(adminOrServiceFieldRead, editor)).toBe(false);
    expect(call(adminOrServiceFieldRead, inactiveAdmin)).toBe(false);
    expect(call(adminOrServiceFieldRead, null)).toBe(false);
  });

  it("write: active admin only — never the service account", () => {
    expect(call(adminFieldOnly, admin)).toBe(true);
    expect(call(adminFieldOnly, editor)).toBe(false);
    expect(call(adminFieldOnly, service)).toBe(false);
    expect(call(adminFieldOnly, null)).toBe(false);
  });

  it("is wired on the pages `customCode` group", () => {
    const group = findNamed(Pages.fields, "customCode");
    expect(group, "pages has a customCode field").toBeDefined();
    expect(group!.access).toEqual({ read: adminOrServiceFieldRead, create: adminFieldOnly, update: adminFieldOnly });
  });

  it("hides the « Scripts » section itself from non-admins", () => {
    const condition = (customCodeField as { admin?: { condition?: (...a: unknown[]) => boolean } }).admin!.condition!;
    expect(condition({}, {}, { user: admin })).toBe(true);
    expect(condition({}, {}, { user: editor })).toBe(false);
    expect(condition({}, {}, { user: null })).toBe(false);
  });

  it("limits each snippet to 50 000 characters in the member's language (FR-021)", () => {
    const head = findNamed([customCodeField], "head")!;
    const code = findNamed(head.fields!, "code") as unknown as { validate: (v: unknown, o?: unknown) => true | string };
    const fr = { req: { i18n: { language: "fr" } } };
    expect(code.validate("x".repeat(50_000), fr)).toBe(true);
    expect(code.validate("x".repeat(50_001), fr)).toBe("Le code dépasse la limite de 50\u00a0000 caractères.");
    expect(code.validate("x".repeat(50_001), { req: { i18n: { language: "en" } } })).toBe("The code is over the 50,000 character limit.");
    expect(code.validate(undefined, fr)).toBe(true);
  });

  it("rejects two code blocks sharing an id", () => {
    const blocks = findNamed([customCodeField], "blocks") as unknown as { validate: (v: unknown, o?: unknown) => true | string };
    expect(blocks.validate([{ codeId: "a" }, { codeId: "b" }])).toBe(true);
    expect(blocks.validate([{ codeId: "a" }, { codeId: "a" }], { req: { i18n: { language: "fr" } } })).toMatch(/même identifiant/);
    expect(blocks.validate([{ codeId: "a" }, { codeId: "a" }], { req: { i18n: { language: "en" } } })).toBe("Two custom code blocks have the same id.");
    expect(blocks.validate(undefined)).toBe(true);
  });
});
