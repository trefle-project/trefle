import { strFromU8, unzipSync, type UnzipFileInfo } from "fflate";

import { ROOT_ID, type MediaEntry, type Shape, type Typography } from "./model";
import { proposePaths } from "./paths";

/**
 * Reads a Penpot 2 export (« binfile v3 »: a zip of JSON files plus binary
 * objects) in memory (015-penpot-site-import, research P1, P12).
 *
 * The file is untrusted. Entry names are only used as map keys, nothing is
 * written to disk. Sizes and counts are checked on the zip's central
 * directory before anything is inflated. Entries are inflated on demand,
 * one Penpot page at a time.
 */

export type PenpotLimits = {
  maxBytes: number;
  maxUncompressedBytes: number;
  maxEntries: number;
  maxEntryBytes: number;
  maxShapesPerPage: number;
};

export const PENPOT_LIMITS: PenpotLimits = {
  maxBytes: 100 * 1024 * 1024,
  maxUncompressedBytes: 400 * 1024 * 1024,
  maxEntries: 30_000,
  maxEntryBytes: 25 * 1024 * 1024,
  maxShapesPerPage: 20_000,
};

export type PenpotErrorCode =
  "file-too-large" | "not-penpot" | "penpot-v1" | "penpot-libraries" | "file-too-complex";

export class PenpotFileError extends Error {
  constructor(
    readonly code: PenpotErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "PenpotFileError";
  }
}

export type BoardSummary = {
  id: string;
  name: string;
  width: number;
  height: number;
  proposedPath: string;
};
export type PenpotPageSummary = { id: string; name: string; boards: BoardSummary[] };

export type PenpotFile = {
  /** The Penpot file's own name (manifest). */
  name: string;
  /** In Penpot's page order. */
  pages: PenpotPageSummary[];
  /** Every shape of a page, by id (inflated on first use, then cached). */
  shapes(pageId: string): Map<string, Shape>;
  typographies(): Map<string, Typography>;
  media(id: string): (MediaEntry & { bytes: Uint8Array }) | undefined;
  thumbnail(pageId: string, boardId: string): Uint8Array | undefined;
};

const ZIP_MAGIC = [0x50, 0x4b];
/** Penpot 1 exports (« binfile v1 ») start with these bytes. */
const V1_MAGIC = [0x01, 0x0b, 0x1a, 0x86];

/** Penpot ids are UUIDs; anything else is ignored (never used in a pattern). */
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((b, i) => bytes[i] === b);

export function readPenpotFile(bytes: Uint8Array, limits: Partial<PenpotLimits> = {}): PenpotFile {
  const L = { ...PENPOT_LIMITS, ...limits };
  if (bytes.length > L.maxBytes) throw new PenpotFileError("file-too-large");
  if (startsWith(bytes, V1_MAGIC)) throw new PenpotFileError("penpot-v1");
  if (!startsWith(bytes, ZIP_MAGIC)) throw new PenpotFileError("not-penpot");

  // Central directory only: the filter sees every entry's declared size and
  // returns false, so nothing is inflated. fflate inflates into a buffer of
  // the declared size, so a lying entry is truncated, never expanded.
  const directory = new Map<string, number>();
  try {
    unzipSync(bytes, {
      filter: (f: UnzipFileInfo) => {
        if (!f.name.endsWith("/")) directory.set(f.name, f.originalSize);
        return false;
      },
    });
  } catch {
    throw new PenpotFileError("not-penpot", "unreadable zip");
  }
  if (directory.size > L.maxEntries)
    throw new PenpotFileError("file-too-complex", `${directory.size} entries`);
  let total = 0;
  for (const [name, size] of directory) {
    if (size > L.maxEntryBytes)
      throw new PenpotFileError("file-too-complex", `entry ${name} is ${size} bytes`);
    total += size;
  }
  if (total > L.maxUncompressedBytes)
    throw new PenpotFileError("file-too-complex", `${total} bytes uncompressed`);

  const inflate = (wanted: (name: string) => boolean): Record<string, Uint8Array> => {
    try {
      return unzipSync(bytes, { filter: (f) => directory.has(f.name) && wanted(f.name) });
    } catch {
      throw new PenpotFileError("not-penpot", "unreadable entry");
    }
  };
  const parse = <T>(name: string, data: Uint8Array | undefined): T => {
    if (!data) throw new PenpotFileError("not-penpot", `missing ${name}`);
    try {
      return JSON.parse(strFromU8(data)) as T;
    } catch {
      throw new PenpotFileError("not-penpot", `invalid JSON in ${name}`);
    }
  };

  if (!directory.has("manifest.json")) throw new PenpotFileError("not-penpot", "no manifest");
  const manifest = parse<{ type?: string; files?: { id: string; name: string }[] }>(
    "manifest.json",
    inflate((n) => n === "manifest.json")["manifest.json"],
  );
  if (
    manifest.type !== "penpot/export-files" ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length
  ) {
    throw new PenpotFileError("not-penpot", "unexpected manifest");
  }
  if (manifest.files.length !== 1) throw new PenpotFileError("penpot-libraries");
  const fileId = String(manifest.files[0]!.id);
  // Ids end up in entry-name patterns: only plain ids are accepted.
  if (!SAFE_ID.test(fileId)) throw new PenpotFileError("not-penpot", "unexpected file id");
  const prefix = `files/${fileId}/`;

  // files/<id>/pages/<pageId>.json and files/<id>/pages/<pageId>/<shapeId>.json
  const pageMetaRe = new RegExp(`^files/${fileId}/pages/([^/]+)\\.json$`);
  const shapeRe = new RegExp(`^files/${fileId}/pages/([^/]+)/([^/]+)\\.json$`);
  const shapeCount = new Map<string, number>();
  for (const name of directory.keys()) {
    const m = shapeRe.exec(name);
    if (m) shapeCount.set(m[1]!, (shapeCount.get(m[1]!) ?? 0) + 1);
  }
  for (const [pageId, n] of shapeCount) {
    if (n > L.maxShapesPerPage)
      throw new PenpotFileError("file-too-complex", `${n} shapes on page ${pageId}`);
  }

  const metas = inflate((n) => pageMetaRe.test(n));
  const pageMetas = Object.entries(metas)
    .map(([name, data]) => parse<{ id: string; name: string; index?: number }>(name, data))
    .filter((m) => typeof m?.id === "string" && SAFE_ID.test(m.id))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  const shapeCache = new Map<string, Map<string, Shape>>();
  const shapes = (pageId: string): Map<string, Shape> => {
    const cached = shapeCache.get(pageId);
    if (cached) return cached;
    if (!SAFE_ID.test(pageId)) return new Map();
    const dir = `${prefix}pages/${pageId}/`;
    const out = new Map<string, Shape>();
    for (const [name, data] of Object.entries(
      inflate((n) => n.startsWith(dir) && shapeRe.test(n)),
    )) {
      const s = parse<Shape>(name, data);
      if (s && typeof s.id === "string" && typeof s.type === "string") out.set(s.id, s);
    }
    shapeCache.set(pageId, out);
    return out;
  };

  // Board summaries need only the root and its direct children.
  const pages: PenpotPageSummary[] = pageMetas.map((meta) => {
    const rootName = `${prefix}pages/${meta.id}/${ROOT_ID}.json`;
    const rootData = inflate((n) => n === rootName)[rootName];
    const root = rootData ? parse<Shape>(rootName, rootData) : undefined;
    const childNames = new Set(
      (root?.shapes ?? []).map((id) => `${prefix}pages/${meta.id}/${id}.json`),
    );
    const children = Object.entries(inflate((n) => childNames.has(n))).map(([name, data]) =>
      parse<Shape>(name, data),
    );
    const boards = children
      .filter((s) => s.type === "frame" && !s.hidden)
      .map((s) => ({ s, box: box(s) }))
      .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
    const paths = proposePaths(boards.map((b) => b.s.name));
    return {
      id: meta.id,
      name: meta.name,
      boards: boards.map((b, i) => ({
        id: b.s.id,
        name: b.s.name,
        width: Math.round(b.box.width),
        height: Math.round(b.box.height),
        proposedPath: paths[i]!,
      })),
    };
  });

  let typoCache: Map<string, Typography> | undefined;
  const typographies = () => {
    if (!typoCache) {
      typoCache = new Map();
      const re = new RegExp(`^files/${fileId}/typographies/[^/]+\\.json$`);
      for (const [name, data] of Object.entries(inflate((n) => re.test(n)))) {
        const t = parse<Typography>(name, data);
        if (t?.id) typoCache.set(t.id, t);
      }
    }
    return typoCache;
  };

  const object = (storageId: string): Uint8Array | undefined => {
    const name = [...directory.keys()].find(
      (n) => n.startsWith(`objects/${storageId}.`) && !n.endsWith(".json"),
    );
    return name ? inflate((n) => n === name)[name] : undefined;
  };

  const media = (id: string) => {
    const name = `${prefix}media/${id}.json`;
    if (!directory.has(name)) return undefined;
    const m = parse<MediaEntry>(name, inflate((n) => n === name)[name]);
    const data = m?.mediaId ? object(String(m.mediaId)) : undefined;
    return data ? { ...m, bytes: data } : undefined;
  };

  const thumbnail = (pageId: string, boardId: string) => {
    if (!SAFE_ID.test(pageId) || !SAFE_ID.test(boardId)) return undefined;
    const name = `${prefix}thumbnails/frame/${pageId}/${boardId}.json`;
    if (!directory.has(name)) return undefined;
    const t = parse<{ mediaId?: string; storageId?: string }>(
      name,
      inflate((n) => n === name)[name],
    );
    const sid = t?.mediaId ?? t?.storageId;
    return sid ? object(String(sid)) : undefined;
  };

  return {
    name: String(manifest.files[0]!.name ?? ""),
    pages,
    shapes,
    typographies,
    media,
    thumbnail,
  };
}

/** A shape's box: `selrect` when present (paths have null x/y), else x/y/width/height. */
export function box(s: Shape): { x: number; y: number; width: number; height: number } {
  const r = s.selrect;
  if (r && Number.isFinite(r.x) && Number.isFinite(r.y)) {
    return { x: r.x, y: r.y, width: Number(r.width) || 0, height: Number(r.height) || 0 };
  }
  return {
    x: Number(s.x) || 0,
    y: Number(s.y) || 0,
    width: Number(s.width) || 0,
    height: Number(s.height) || 0,
  };
}
