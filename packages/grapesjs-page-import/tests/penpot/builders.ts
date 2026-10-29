import { strToU8, zipSync, type Zippable } from "fflate";

import { ROOT_ID, type Shape } from "../../src/penpot/model";

/**
 * In-memory `.penpot` builders for tests (015-penpot-site-import, T003):
 * a minimal valid export from hand-written shapes, and the hostile files of
 * spec SC-007. Exported as `@trefle/grapesjs-page-import/penpot/testing` so the
 * CMS tests reuse them instead of committing binary fixtures.
 */

export const FILE_ID = "aaaaaaaa-0000-4000-8000-000000000001";

export type PageSpec = { id: string; name: string; shapes: Partial<Shape>[] };
export type MediaSpec = {
  id: string;
  storageId: string;
  mtype: string;
  width: number;
  height: number;
  bytes: Uint8Array;
  name?: string;
};

const json = (v: unknown) => strToU8(JSON.stringify(v));

/** A board (top-level frame) with sensible defaults. */
export function board(id: string, name: string, over: Partial<Shape> = {}): Partial<Shape> {
  return {
    id,
    name,
    type: "frame",
    parentId: ROOT_ID,
    frameId: ROOT_ID,
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
    ...over,
  };
}

/** Fills in selrect from x/y/width/height so the reader's `box()` sees it. */
function withSelrect(s: Partial<Shape>): Partial<Shape> {
  if (s.selrect || s.x == null) return s;
  const [x, y, width, height] = [
    Number(s.x),
    Number(s.y),
    Number(s.width ?? 0),
    Number(s.height ?? 0),
  ];
  return { ...s, selrect: { x, y, width, height, x1: x, y1: y, x2: x + width, y2: y + height } };
}

/** A valid Penpot 2 export. Each page's root shape lists the top-level shapes (parentId = ROOT_ID) in array order. */
export function penpotZip({
  name = "Test file",
  pages,
  media = [],
  typographies = [],
  extraManifestFiles = 0,
}: {
  name?: string;
  pages: PageSpec[];
  media?: MediaSpec[];
  typographies?: { id: string; name: string }[];
  extraManifestFiles?: number;
}): Uint8Array {
  const files: Zippable = {};
  const manifestFiles = [{ id: FILE_ID, name, features: ["components/v2", "layout/grid"] }];
  for (let i = 0; i < extraManifestFiles; i++)
    manifestFiles.push({
      id: `bbbbbbbb-0000-4000-8000-00000000000${i}`,
      name: `lib ${i}`,
      features: [],
    });
  files["manifest.json"] = json({
    type: "penpot/export-files",
    version: 1,
    generatedBy: "test",
    files: manifestFiles,
    relations: [],
  });
  files[`files/${FILE_ID}.json`] = json({
    id: FILE_ID,
    name,
    features: manifestFiles[0]!.features,
  });
  pages.forEach((p, index) => {
    files[`files/${FILE_ID}/pages/${p.id}.json`] = json({
      id: p.id,
      name: p.name,
      index,
      options: {},
    });
    const top = p.shapes.filter((s) => (s.parentId ?? ROOT_ID) === ROOT_ID).map((s) => s.id);
    files[`files/${FILE_ID}/pages/${p.id}/${ROOT_ID}.json`] = json({
      id: ROOT_ID,
      name: "Root Frame",
      type: "frame",
      parentId: ROOT_ID,
      frameId: ROOT_ID,
      pageId: p.id,
      shapes: top,
    });
    for (const s of p.shapes)
      files[`files/${FILE_ID}/pages/${p.id}/${s.id}.json`] = json({
        pageId: p.id,
        ...withSelrect(s),
      });
  });
  for (const m of media) {
    files[`files/${FILE_ID}/media/${m.id}.json`] = json({
      id: m.id,
      name: m.name ?? m.id,
      mtype: m.mtype,
      width: m.width,
      height: m.height,
      mediaId: m.storageId,
    });
    const ext = m.mtype.split("/")[1] === "jpeg" ? "jpg" : m.mtype.split("/")[1];
    files[`objects/${m.storageId}.${ext}`] = m.bytes;
    files[`objects/${m.storageId}.json`] = json({
      id: m.storageId,
      contentType: m.mtype,
      size: m.bytes.length,
    });
  }
  for (const t of typographies) files[`files/${FILE_ID}/typographies/${t.id}.json`] = json(t);
  return zipSync(files);
}

/** One page, one empty board. */
export const minimalPenpot = () =>
  penpotZip({ pages: [{ id: "p-1", name: "Site", shapes: [board("b-1", "Accueil")] }] });

// ---------------------------------------------------------------- hostile files (SC-007)

/** One entry of `mb` MiB of zeros (deflates to a few KB): over the 25 MB per-entry limit by default. */
export function zipBombEntry(mb = 26): Uint8Array {
  return zipSync({
    "manifest.json": json({ type: "penpot/export-files", files: [] }),
    "big.bin": new Uint8Array(mb * 1024 * 1024),
  });
}

/** `n` empty entries (over the 30 000-entry limit by default). */
export function manyEntries(n = 30_001): Uint8Array {
  const files: Zippable = { "manifest.json": json({ type: "penpot/export-files", files: [] }) };
  for (let i = 0; i < n; i++) files[`e/${i}`] = new Uint8Array(0);
  return zipSync(files, { level: 0 });
}

/** A manifest listing a library next to the file (« export with libraries »). */
export const twoFiles = () =>
  penpotZip({
    pages: [{ id: "p-1", name: "Site", shapes: [board("b-1", "Accueil")] }],
    extraManifestFiles: 1,
  });

/** The first bytes of a Penpot 1 export. */
export const penpotV1 = () =>
  new Uint8Array([0x01, 0x0b, 0x1a, 0x86, 0x50, 0x63, 0xa1, 0x5f, 0xc5, 0, 0, 0]);

/** A PNG signature: not a zip at all. */
export const notZip = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/** A valid page whose `svg-raw` shape carries an event handler, a script and an external image (FR-003, research P9). */
export function scriptSvg(): Uint8Array {
  return penpotZip({
    pages: [
      {
        id: "p-1",
        name: "Site",
        shapes: [
          board("b-1", "Accueil", { shapes: ["svg-1"] }),
          {
            id: "svg-1",
            name: "Logo",
            type: "svg-raw",
            parentId: "b-1",
            frameId: "b-1",
            x: 10,
            y: 10,
            width: 100,
            height: 50,
            content: {
              tag: "svg",
              attrs: { viewBox: "0 0 100 50", onload: "alert(1)" },
              content: [
                { tag: "script", attrs: {}, content: ["alert(2)"] },
                {
                  tag: "image",
                  attrs: { href: "http://cms:3000/x.png", "xlink:href": "http://169.254.169.254/" },
                },
                { tag: "use", attrs: { href: "#shape" } },
                {
                  tag: "rect",
                  attrs: {
                    x: "0",
                    y: "0",
                    width: "100",
                    height: "50",
                    fill: "#ff0000",
                    onclick: "x()",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}
