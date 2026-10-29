import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PenpotFileError, readPenpotFile } from "../../src/penpot/read";
import {
  board,
  manyEntries,
  notZip,
  penpotV1,
  penpotZip,
  scriptSvg,
  twoFiles,
  zipBombEntry,
} from "./builders";

/** 015-penpot-site-import T005 — research P1, contracts/penpot-conversion.md `readPenpotFile`. */

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, "../fixtures", name)));
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof PenpotFileError ? e.code : `other: ${String(e)}`;
  }
  return "no error";
};

describe("reference fixtures", () => {
  it("blog-mini: page « Site », boards Accueil then Article in reading order", () => {
    const f = readPenpotFile(fixture("blog-mini.penpot"));
    expect(f.name).toContain("Blog mini");
    const site = f.pages.find((p) => p.name === "Site")!;
    expect(site.boards.map((b) => b.name)).toEqual(["Accueil", "Article"]);
    expect(site.boards.map((b) => b.proposedPath)).toEqual(["/", "/article"]);
    expect(site.boards[0]).toMatchObject({ width: 1920 });
    const shapes = f.shapes(site.id);
    expect(shapes.size).toBeGreaterThan(200);
    expect(shapes.get(site.boards[0]!.id)?.type).toBe("frame");
  });

  it("agence-mini: media are readable, unknown media are undefined", () => {
    const f = readPenpotFile(fixture("agence-mini.penpot"));
    const site = f.pages.find((p) => p.name === "Site")!;
    const ids = new Set<string>();
    for (const s of f.shapes(site.id).values())
      for (const fill of s.fills ?? []) if (fill.fillImage?.id) ids.add(fill.fillImage.id);
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) {
      const m = f.media(id)!;
      expect(m.bytes.length).toBeGreaterThan(100);
      expect(m.mtype).toMatch(/^image\//);
    }
    expect(f.media("nope")).toBeUndefined();
    expect(f.thumbnail(site.id, site.boards[0]!.id)).toBeUndefined();
  });
});

describe("structure", () => {
  it("boards sorted top→bottom then left→right; hidden frames and non-frames left out", () => {
    const f = readPenpotFile(
      penpotZip({
        pages: [
          {
            id: "p-1",
            name: "Site",
            shapes: [
              board("b-c", "C", { x: 0, y: 2000 }),
              board("b-b", "B", { x: 1600, y: 0 }),
              board("b-a", "A", { x: 0, y: 0 }),
              board("b-h", "Hidden", { x: 0, y: 4000, hidden: true }),
              { id: "r-1", name: "Loose rect", type: "rect", x: 0, y: 5000, width: 10, height: 10 },
            ],
          },
          { id: "p-2", name: "Empty", shapes: [] },
        ],
      }),
    );
    expect(f.pages.map((p) => p.name)).toEqual(["Site", "Empty"]);
    expect(f.pages[0]!.boards.map((b) => b.name)).toEqual(["A", "B", "C"]);
    expect(f.pages[1]!.boards).toEqual([]);
  });

  it("entry names are only keys: a page whose id is a path trick is ignored, nothing throws", () => {
    const f = readPenpotFile(
      penpotZip({
        pages: [
          { id: "../../etc", name: "Trick", shapes: [board("b-x", "X")] },
          { id: "p-ok", name: "Site", shapes: [board("b-1", "Accueil")] },
        ],
      }),
    );
    expect(f.pages.map((p) => p.name)).toEqual(["Site"]);
    expect(f.shapes("../../etc").size).toBe(0);
    expect(f.thumbnail("../x", "b-1")).toBeUndefined();
  });
});

describe("limits and refusals (checked before inflating)", () => {
  it("file over 100 MB → file-too-large", () => {
    expect(codeOf(() => readPenpotFile(new Uint8Array(11), { maxBytes: 10 }))).toBe(
      "file-too-large",
    );
  });
  it("an entry over 25 MB uncompressed → file-too-complex", () => {
    expect(codeOf(() => readPenpotFile(zipBombEntry()))).toBe("file-too-complex");
  });
  it("total uncompressed over the limit → file-too-complex", () => {
    expect(
      codeOf(() => readPenpotFile(zipBombEntry(2), { maxUncompressedBytes: 1024 * 1024 })),
    ).toBe("file-too-complex");
  });
  it("over 30 000 entries → file-too-complex", () => {
    expect(codeOf(() => readPenpotFile(manyEntries()))).toBe("file-too-complex");
  });
  it("over 20 000 shapes on a page → file-too-complex", () => {
    expect(codeOf(() => readPenpotFile(scriptSvg(), { maxShapesPerPage: 1 }))).toBe(
      "file-too-complex",
    );
  });
  it("not a zip → not-penpot; Penpot 1 → penpot-v1", () => {
    expect(codeOf(() => readPenpotFile(notZip()))).toBe("not-penpot");
    expect(codeOf(() => readPenpotFile(penpotV1()))).toBe("penpot-v1");
  });
  it("a zip without a Penpot manifest → not-penpot", () => {
    expect(codeOf(() => readPenpotFile(manyEntries(3)))).toBe("not-penpot");
  });
  it("two files in the manifest → penpot-libraries", () => {
    expect(codeOf(() => readPenpotFile(twoFiles()))).toBe("penpot-libraries");
  });
});
