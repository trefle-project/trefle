import { describe, expect, it } from "vitest";

import { selfOrAdminField } from "../src/access";
import { Users } from "../src/collections/Users";
import { AVATAR_COLORS, avatarUrl, colorOf, initialsOf } from "../src/lib/avatar";

/** 022-ux-improvement (US5, T048) — avatars and their fallback. */
describe("initials and colour", () => {
  it("two letters from the name, else from the e-mail", () => {
    expect(initialsOf({ name: "Zoé Dupré" })).toBe("ZD");
    expect(initialsOf({ name: "Anne Marie de Vries" })).toBe("AV");
    expect(initialsOf({ name: "Zoé" })).toBe("ZO");
    expect(initialsOf({ email: "j.doe@example.com" })).toBe("JD");
    expect(initialsOf(null)).toBe("?");
  });

  it("a stable colour per member, from a fixed palette", () => {
    expect(colorOf(42)).toBe(colorOf("42"));
    expect(AVATAR_COLORS).toContain(colorOf(7));
  });

  it("uses the avatar's small size when there is one", () => {
    expect(avatarUrl({ url: "/a.png", sizes: { avatar: { url: "/a-96.png" } } })).toBe("/a-96.png");
    expect(avatarUrl({ url: "/a.svg", sizes: { avatar: { url: null } } })).toBe("/a.svg");
    expect(avatarUrl(null)).toBeNull();
  });
});

describe("who may set an avatar (FR-024)", () => {
  const field = (Users.fields as { name?: string; access?: { update?: unknown }; relationTo?: string }[]).find((f) => f.name === "avatar")!;
  it("is an admin image (never a media item), set by the member or an Administrator", () => {
    expect(field.relationTo).toBe("admin-images");
    expect(field.access?.update).toBe(selfOrAdminField);
    expect(selfOrAdminField({ req: { user: { id: 2, role: "editor", isActive: true } }, id: 3 } as never)).toBe(false);
    expect(selfOrAdminField({ req: { user: { id: 1, role: "admin", isActive: true } }, id: 3 } as never)).toBe(true);
  });
});
