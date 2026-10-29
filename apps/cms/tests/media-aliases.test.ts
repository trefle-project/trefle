import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidateSchema } from "@trefle/shared";

const revalidateTags = vi.fn();
vi.mock("../src/hooks/revalidate", () => ({ revalidateTags }));

const { buildAliasMap, recordPreviousFilename, revalidateAliasesOnChange, revalidateAliasesOnDelete } = await import(
  "../src/hooks/media-aliases"
);
const { mediaAliasesEndpoint } = await import("../src/endpoints/mediaAliases");

/**
 * 017-edge-protection (T034, contracts/media-aliases.md) — old keys survive a
 * file replacement and resolve to the media item's current key.
 */
const record = (originalDoc: Record<string, unknown>, data: Record<string, unknown>, operation = "update") =>
  recordPreviousFilename({ data, originalDoc, operation } as never) as Record<string, unknown>;

describe("recordPreviousFilename", () => {
  it("appends the old filename once when the file is replaced", () => {
    const out = record({ filename: "a.jpg", previousFilenames: [] }, { filename: "b.jpg" });
    expect(out.previousFilenames).toEqual([{ filename: "a.jpg" }]);
  });

  it("replacing it again appends the intermediate key too", () => {
    const out = record({ filename: "b.jpg", previousFilenames: [{ id: "x", filename: "a.jpg" }] }, { filename: "c.jpg" });
    expect(out.previousFilenames).toEqual([{ filename: "a.jpg" }, { filename: "b.jpg" }]);
  });

  it("changes nothing when the filename is unchanged, absent, or on create", () => {
    expect(record({ filename: "a.jpg" }, { alt: "x" })).toEqual({ alt: "x" });
    expect(record({ filename: "a.jpg" }, { filename: "a.jpg" })).toEqual({ filename: "a.jpg" });
    expect(record({}, { filename: "a.jpg" }, "create")).toEqual({ filename: "a.jpg" });
  });
});

describe("buildAliasMap", () => {
  it("resolves a chain a → b → c to the current key", () => {
    expect(buildAliasMap([{ filename: "c.jpg", previousFilenames: [{ filename: "a.jpg" }, { filename: "b.jpg" }] }])).toEqual({
      "a.jpg": "c.jpg",
      "b.jpg": "c.jpg",
    });
  });

  it("never aliases a key that is some document's current filename", () => {
    const map = buildAliasMap([
      { filename: "c.jpg", previousFilenames: [{ filename: "a.jpg" }] },
      { filename: "a.jpg", previousFilenames: [] },
    ]);
    expect(map).toEqual({});
  });
});

describe("GET /api/media/aliases", () => {
  const call = (user: unknown, docs: unknown[] = [], clashes: unknown[] = []) => {
    const find = vi.fn().mockResolvedValueOnce({ docs }).mockResolvedValueOnce({ docs: clashes });
    return mediaAliasesEndpoint.handler({ user, payload: { find } } as never) as Promise<Response>;
  };

  it("403 for an anonymous caller or an inactive member", async () => {
    expect((await call(null)).status).toBe(403);
    expect((await call({ role: "editor", isActive: false })).status).toBe(403);
  });

  it("open to an active editor (the page editor applies the map when a page opens)", async () => {
    expect((await call({ role: "editor", isActive: true })).status).toBe(200);
  });

  it("returns the map for the service account, minus current keys of other documents", async () => {
    const res = await call(
      { isService: true },
      [{ filename: "c.jpg", previousFilenames: [{ filename: "a.jpg" }, { filename: "b.jpg" }] }],
      [{ filename: "b.jpg" }],
    );
    expect(res.status).toBe(200);
    expect((await res.json()).aliases).toEqual({ "a.jpg": "c.jpg" });
  });

  it("deleted media contribute nothing (empty map)", async () => {
    const res = await call({ role: "admin" }, []);
    expect(await res.json()).toMatchObject({ aliases: {} });
  });
});

describe("alias map invalidation", () => {
  beforeEach(() => revalidateTags.mockClear());

  it("revalidates media-aliases when the filename changes and on delete, with a body /api/revalidate accepts", () => {
    revalidateAliasesOnChange({ doc: { filename: "b.jpg" }, previousDoc: { filename: "a.jpg" }, operation: "update" } as never);
    revalidateAliasesOnDelete({ doc: { filename: "b.jpg" } } as never);
    expect(revalidateTags).toHaveBeenCalledTimes(2);
    for (const [args] of revalidateTags.mock.calls) {
      expect(args).toEqual({ reason: "media", tags: ["media-aliases"] });
      expect(revalidateSchema.safeParse({ ...args, at: new Date().toISOString() }).success).toBe(true);
    }
  });

  it("does not revalidate an alt-only save", () => {
    revalidateAliasesOnChange({ doc: { filename: "a.jpg" }, previousDoc: { filename: "a.jpg" }, operation: "update" } as never);
    expect(revalidateTags).not.toHaveBeenCalled();
  });
});
