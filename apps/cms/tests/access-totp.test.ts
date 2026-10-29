import { describe, expect, it } from "vitest";

import {
  adminFieldOnly,
  canOpenAdmin,
  isAdmin,
  isAdminOrEditor,
  isService,
  isServiceOrAdmin,
  isStaffOrService,
  publishedOnly,
  readSelf,
} from "../src/access";

/**
 * 019-admin-access (research R4) — with payload-totp enabled, a human counts
 * only once their session passed the second factor (`_strategy: "totp"`);
 * API-key callers are not subject to it; with the plugin disabled or absent,
 * the password is enough, as before.
 */
const totpConfig = (disabled: boolean) => ({ config: { custom: { totp: { pluginOptions: { disabled } } } } });
const call = (fn: (...a: never[]) => unknown, user: unknown, payload: unknown = totpConfig(false)) =>
  fn({ req: { user, payload } } as never);

const admin = { id: 1, role: "admin", isActive: true };
const editor = { id: 2, role: "editor", isActive: true };
const service = { id: 3, isService: true, _strategy: "api-key" };
const verified = (u: object) => ({ ...u, _strategy: "totp" });
const passwordOnly = (u: object) => ({ ...u, _strategy: "local-jwt" });

describe("access helpers with the second factor on", () => {
  it("a verified session keeps its rights", () => {
    expect(call(isAdmin, verified(admin))).toBe(true);
    expect(call(isAdminOrEditor, verified(editor))).toBe(true);
    expect(call(isStaffOrService, verified(editor))).toBe(true);
    expect(call(isServiceOrAdmin, verified(admin))).toBe(true);
    expect(call(publishedOnly, verified(editor))).toBe(true);
    expect(call(adminFieldOnly, verified(admin))).toBe(true);
  });

  it("a password-only session counts as anonymous", () => {
    for (const u of [passwordOnly(admin), passwordOnly(editor)]) {
      expect(call(isAdmin, u)).toBe(false);
      expect(call(isAdminOrEditor, u)).toBe(false);
      expect(call(isStaffOrService, u)).toBe(false);
      expect(call(isServiceOrAdmin, u)).toBe(false);
      expect(call(publishedOnly, u)).toBe(false);
      expect(call(adminFieldOnly, u)).toBe(false);
    }
  });

  it("the renderer's API key is not subject to it", () => {
    expect(call(isService, service)).toBe(true);
    expect(call(isStaffOrService, service)).toBe(true);
    expect(call(isServiceOrAdmin, service)).toBe(true);
    expect(call(publishedOnly, service)).toEqual({ status: { equals: "published" } });
  });

  it("the admin panel still opens on the password alone, for the code-entry view", () => {
    expect(call(canOpenAdmin, passwordOnly(editor))).toBe(true);
    expect(call(canOpenAdmin, { ...passwordOnly(editor), isActive: false })).toBe(false);
    expect(call(canOpenAdmin, service)).toBe(false);
    expect(call(canOpenAdmin, null)).toBe(false);
  });

  it("readSelf: own document only until the code is entered (the plugin's wrapper decides the rest)", () => {
    expect(call(readSelf, passwordOnly(admin))).toEqual({ id: { equals: 1 } });
    expect(call(readSelf, verified(admin))).toBe(true);
    expect(call(readSelf, verified(editor))).toEqual({ id: { equals: 2 } });
  });
});

describe("access helpers with the second factor off or absent", () => {
  it("TOTP_DISABLED: the password is enough", () => {
    expect(call(isAdmin, passwordOnly(admin), totpConfig(true))).toBe(true);
    expect(call(isAdminOrEditor, passwordOnly(editor), totpConfig(true))).toBe(true);
  });

  it("no plugin in the config (unit-test stubs): unchanged", () => {
    expect(call(isAdmin, admin, null)).toBe(true);
    expect(call(isAdminOrEditor, editor, {})).toBe(true);
  });
});
