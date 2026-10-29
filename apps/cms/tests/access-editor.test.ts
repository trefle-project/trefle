import { describe, expect, it } from "vitest";

import { DataSubjectRequests } from "../src/collections/DataSubjectRequests";
import { Domains } from "../src/collections/Domains";
import { Leads } from "../src/collections/Leads";
import { Pages } from "../src/collections/Pages";
import { Users } from "../src/collections/Users";
import { Settings } from "../src/globals/Settings";

/**
 * T078 (US5, contracts/payload-collections.md §D) — the Editor boundary.
 * Editors author pages, assign domains, and read/export leads + handle DSR
 * intake; they are denied member management, workspace settings, erasure
 * execution, and lead rectification.
 */
const editor = { id: 2, role: "editor" as const, isActive: true };
const admin = { id: 1, role: "admin" as const, isActive: true };

const can = (fn: unknown, user: unknown) =>
  typeof fn === "function" ? (fn as (a: unknown) => unknown)({ req: { user } }) : fn;

describe("Editor is denied membership + settings management", () => {
  it("cannot create / update / delete users", () => {
    expect(can(Users.access?.create, editor)).toBe(false);
    expect(can(Users.access?.update, editor)).toBe(false);
    expect(can(Users.access?.delete, editor)).toBe(false);
  });

  it("does not get the users collection in the admin UI", () => {
    const hidden = Users.admin?.hidden;
    expect(typeof hidden === "function" ? hidden({ user: editor } as never) : hidden).toBe(true);
    expect(typeof hidden === "function" ? hidden({ user: admin } as never) : hidden).toBe(false);
  });

  // Regression: `Users.access.admin` gates the whole admin panel (it's the
  // admin's auth collection), not just the Users screen. It was admin-only,
  // which refused every Editor the admin panel — they couldn't edit pages.
  it("may open the admin panel itself, like any active member", () => {
    expect(can(Users.access?.admin, editor)).toBe(true);
    expect(can(Users.access?.admin, admin)).toBe(true);
    expect(can(Users.access?.admin, { ...editor, isActive: false })).toBe(false);
    expect(can(Users.access?.admin, { id: "svc", isService: true })).toBe(false);
    expect(can(Users.access?.admin, null)).toBe(false);
  });

  it("cannot update settings, and the settings nav is hidden for them", () => {
    expect(can(Settings.access?.update, editor)).toBe(false);
    expect(can(Settings.access?.read, editor)).toBe(true); // §D: editor may read
    const hidden = Settings.admin?.hidden;
    expect(typeof hidden === "function" ? hidden({ user: editor } as never) : hidden).toBe(true);
    expect(typeof hidden === "function" ? hidden({ user: admin } as never) : hidden).toBe(false);
  });
});

describe("Editor is denied irreversible GDPR actions", () => {
  it("cannot update (rectify) or delete leads, but can read them", () => {
    expect(can(Leads.access?.update, editor)).toBe(false);
    expect(can(Leads.access?.delete, editor)).toBe(false);
    expect(can(Leads.access?.read, editor)).toBe(true);
  });

  it("can record and progress data-subject requests but not delete them", () => {
    expect(can(DataSubjectRequests.access?.create, editor)).toBe(true);
    expect(can(DataSubjectRequests.access?.read, editor)).toBe(true);
    expect(can(DataSubjectRequests.access?.update, editor)).toBe(true);
    expect(can(DataSubjectRequests.access?.delete, editor)).toBe(false);
  });
});

describe("Editor can do authoring work", () => {
  it("has full CRUD on pages", () => {
    expect(can(Pages.access?.read, editor)).toBe(true);
    expect(can(Pages.access?.create, editor)).toBe(true);
    expect(can(Pages.access?.update, editor)).toBe(true);
    expect(can(Pages.access?.delete, editor)).toBe(true);
  });

  it("reads domains (to assign a page) but cannot register or edit them", () => {
    expect(can(Domains.access?.read, editor)).toBe(true);
    expect(can(Domains.access?.create, editor)).toBe(false);
    expect(can(Domains.access?.update, editor)).toBe(false);
    expect(can(Domains.access?.delete, editor)).toBe(false);
  });
});

/**
 * 012-url-page-import (T018, FR-027f) — a user's monthly import budget is
 * set by an Administrator only: an editor can't raise their own or anyone
 * else's.
 */
describe("import budget on users", () => {
  const budgetField = Users.fields.find((f) => "name" in f && f.name === "importMonthlyBudgetEur") as {
    access?: { update?: (a: unknown) => unknown; create?: (a: unknown) => unknown };
    min?: number;
  };
  const fieldCan = (fn: ((a: unknown) => unknown) | undefined, u: unknown) => fn?.({ req: { user: u } });

  it("an editor can't set their own or another user's budget", () => {
    expect(fieldCan(budgetField.access?.update, editor)).toBe(false);
    expect(fieldCan(budgetField.access?.create, editor)).toBe(false);
  });

  it("an admin can, and the budget can't be negative", () => {
    expect(fieldCan(budgetField.access?.update, admin)).toBe(true);
    expect(budgetField.min).toBe(0);
  });
});
