import { describe, expect, it } from "vitest";

import {
  adminFieldOnly,
  isAdmin,
  isAdminOrEditor,
  isService,
  isStaffOrService,
  publishedOnly,
  readSelf,
} from "../src/access";

// The real Access/FieldAccess signatures want a full PayloadRequest; these are
// pure functions that only read `req.user`, so a minimal stub is enough.
const call = (fn: (...a: never[]) => unknown, user: unknown) =>
  fn({ req: { user } } as never);

const admin = { id: "u1", role: "admin", isActive: true };
const editor = { id: "u2", role: "editor", isActive: true };
const inactiveAdmin = { id: "u3", role: "admin", isActive: false };
const service = { id: "svc", isService: true };
const anon = null;

describe("access matrix (contracts/payload-collections.md §D)", () => {
  it("isAdmin", () => {
    expect(call(isAdmin, admin)).toBe(true);
    expect(call(isAdmin, editor)).toBe(false);
    expect(call(isAdmin, inactiveAdmin)).toBe(false);
    expect(call(isAdmin, service)).toBe(false);
    expect(call(isAdmin, anon)).toBe(false);
  });

  it("isAdminOrEditor", () => {
    expect(call(isAdminOrEditor, admin)).toBe(true);
    expect(call(isAdminOrEditor, editor)).toBe(true);
    expect(call(isAdminOrEditor, inactiveAdmin)).toBe(false);
    expect(call(isAdminOrEditor, service)).toBe(false);
    expect(call(isAdminOrEditor, anon)).toBe(false);
  });

  it("isService", () => {
    expect(call(isService, service)).toBe(true);
    expect(call(isService, admin)).toBe(false);
    expect(call(isService, anon)).toBe(false);
  });

  it("isStaffOrService", () => {
    expect(call(isStaffOrService, admin)).toBe(true);
    expect(call(isStaffOrService, editor)).toBe(true);
    expect(call(isStaffOrService, service)).toBe(true);
    expect(call(isStaffOrService, anon)).toBe(false);
  });

  it("publishedOnly: staff see all, service is filtered to published, anon nothing", () => {
    expect(call(publishedOnly, admin)).toBe(true);
    expect(call(publishedOnly, editor)).toBe(true);
    expect(call(publishedOnly, service)).toEqual({ status: { equals: "published" } });
    expect(call(publishedOnly, anon)).toBe(false);
  });

  it("readSelf: admin sees all, others scoped to own id, anon nothing", () => {
    expect(call(readSelf, admin)).toBe(true);
    expect(call(readSelf, editor)).toEqual({ id: { equals: "u2" } });
    expect(call(readSelf, anon)).toBe(false);
  });

  it("adminFieldOnly: only an active admin may write the field", () => {
    expect(adminFieldOnly({ req: { user: admin } } as never)).toBe(true);
    expect(adminFieldOnly({ req: { user: editor } } as never)).toBe(false);
    expect(adminFieldOnly({ req: { user: null } } as never)).toBe(false);
  });
});
