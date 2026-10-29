import { describe, expect, it } from "vitest";

import { AdminImages, checkAdminImageFile, setUploadedBy } from "../src/collections/AdminImages";

/** 022-ux-improvement (Phase 2, T003) — the admin's own images. */
const admin = { id: 1, role: "admin", isActive: true };
const editor = { id: 2, role: "editor", isActive: true };
const access = AdminImages.access!;

describe("admin-images access", () => {
  it("files are public; any member uploads; only the uploader or an Administrator changes or deletes", () => {
    expect(access.read!({ req: { user: null } } as never)).toBe(true);
    expect(access.create!({ req: { user: editor } } as never)).toBe(true);
    expect(access.create!({ req: { user: null } } as never)).toBe(false);
    expect(access.update!({ req: { user: admin } } as never)).toBe(true);
    expect(access.update!({ req: { user: editor } } as never)).toEqual({ uploadedBy: { equals: 2 } });
    expect(access.delete!({ req: { user: { isService: true } } } as never)).toBe(false);
  });
});

describe("admin-images hooks", () => {
  const op = (file: object) => checkAdminImageFile({ args: { req: { file } }, operation: "create" } as never);
  it("refuses a non-image and a file over 1 MB, in French", () => {
    expect(() => op({ mimetype: "application/pdf", size: 10 })).toThrow("Choisissez une image (PNG, JPEG, WebP, GIF, SVG).");
    expect(() => op({ mimetype: "image/png", size: 1024 * 1024 + 1 })).toThrow("L'image dépasse 1 Mo.");
    expect(op({ mimetype: "image/png", size: 1024 })).toBeTruthy();
  });

  it("sets the uploader from the session, never from the client", () => {
    expect(setUploadedBy({ data: { uploadedBy: 99 }, operation: "create", req: { user: editor } } as never)).toMatchObject({ uploadedBy: 2 });
    expect(setUploadedBy({ data: { uploadedBy: 99 }, operation: "update", originalDoc: { uploadedBy: 2 }, req: { user: admin } } as never)).toMatchObject({ uploadedBy: 2 });
  });
});
