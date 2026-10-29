import { describe, expect, it } from "vitest";
import type { CollectionConfig, Field } from "payload";

import { selfOrAdminField } from "../src/access";
import { DATE_CELL, DATE_FIELD, DOCUMENT_DATES, withAdminDates, withAdminDatesGlobal, zoneDateFields } from "../src/lib/admin-dates";
import { Users } from "../src/collections/Users";
import { Settings } from "../src/globals/Settings";
import { ActivityLog } from "../src/collections/ActivityLog";
import { Leads } from "../src/collections/Leads";

/** 022-ux-improvement (US6, T054) — every admin date is zone-aware; who may set a zone. */
type F = { type: string; name?: string; fields?: F[]; tabs?: { fields: F[] }[]; admin?: { components?: Record<string, unknown>; hidden?: boolean } };

function dateFields(fields: F[]): F[] {
  return fields.flatMap((f) => [
    ...(f.type === "date" ? [f] : []),
    ...(f.fields ? dateFields(f.fields) : []),
    ...(f.tabs ? f.tabs.flatMap((t) => dateFields(t.fields)) : []),
  ]);
}

describe("withAdminDates", () => {
  it("puts the zone-aware cell and field on every date, nested ones included", () => {
    const fields = zoneDateFields([
      { name: "at", type: "date" },
      { name: "g", type: "group", fields: [{ name: "inner", type: "date" }] },
      { type: "tabs", tabs: [{ label: "T", fields: [{ name: "tabbed", type: "date" }] }] },
      { name: "keep", type: "date", admin: { components: { Cell: "@/x#Custom" } } },
    ] as Field[]) as unknown as F[];
    const dates = dateFields(fields);
    expect(dates).toHaveLength(4);
    for (const d of dates.slice(0, 3)) expect(d.admin?.components).toMatchObject({ Cell: DATE_CELL, Field: DATE_FIELD });
    expect(dates[3]!.admin?.components?.Cell).toBe("@/x#Custom"); // an existing component wins
  });

  it("declares createdAt/updatedAt like Payload does, with the cell", () => {
    const out = withAdminDates({ slug: "x", fields: [] } as CollectionConfig).fields as unknown as F[];
    for (const name of ["createdAt", "updatedAt"]) {
      const f = out.find((x) => x.name === name)!;
      expect(f).toMatchObject({ type: "date", admin: { hidden: true } });
      expect(f.admin?.components?.Cell).toBe(DATE_CELL);
    }
    expect((withAdminDates({ slug: "x", fields: [], timestamps: false } as CollectionConfig).fields as F[]).length).toBe(0);
  });

  it("shows the document's own dates in the zone (Payload's header pair is hidden in custom.css)", () => {
    const out = withAdminDates({ slug: "x", fields: [], admin: { components: { edit: { beforeDocumentControls: ["@/y#Z"] } } } } as CollectionConfig);
    expect(out.admin?.components?.edit?.beforeDocumentControls).toEqual(["@/y#Z", DOCUMENT_DATES]);
    expect(withAdminDates({ slug: "x", fields: [], timestamps: false } as CollectionConfig).admin).toBeUndefined();
  });

  it("covers the real collections and globals", () => {
    for (const c of [Users, ActivityLog, Leads]) {
      for (const d of dateFields(withAdminDates(c).fields as unknown as F[])) expect(d.admin?.components?.Cell, `${c.slug}.${d.name}`).toBe(DATE_CELL);
    }
    expect(dateFields(withAdminDatesGlobal(Settings).fields as unknown as F[]).every((d) => d.admin?.components?.Field === DATE_FIELD)).toBe(true);
  });
});

describe("who may set a display time zone (FR-027, FR-028)", () => {
  const admin = { id: 1, role: "admin", isActive: true };
  const editor = { id: 2, role: "editor", isActive: true };
  it("a member on their own account, an Administrator on anyone's", () => {
    expect(selfOrAdminField({ req: { user: editor }, id: 2 } as never)).toBe(true);
    expect(selfOrAdminField({ req: { user: editor }, id: 3 } as never)).toBe(false);
    expect(selfOrAdminField({ req: { user: admin }, id: 3 } as never)).toBe(true);
    expect(selfOrAdminField({ req: { user: null }, id: 2 } as never)).toBe(false);
  });

  it("the installation default is in Settings, which only Administrators update", () => {
    const settingsFields = (Settings.fields as F[]).flatMap((f) => (f.tabs ? f.tabs.flatMap((t) => t.fields) : [f]));
    expect(settingsFields.some((f) => f.name === "adminTimezone")).toBe(true);
    expect((Users.fields as F[]).some((f) => f.name === "displayTimezone")).toBe(true);
  });
});
