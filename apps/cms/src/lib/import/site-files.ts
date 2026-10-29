import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Where an uploaded `.penpot` waits between its analysis and the end of its
 * import (015-penpot-site-import, research P12, FR-022). Never a Media item,
 * never kept after the import: the job, the cancel path and the sweep remove it.
 */
// SITE_IMPORT_FILES_DIR: tests only, so parallel test files don't sweep each other's files.
export const SITE_FILES_DIR = process.env.SITE_IMPORT_FILES_DIR || join(tmpdir(), "trefle-site-imports");
export const siteFilePath = (id: number | string) => join(SITE_FILES_DIR, String(id));

export async function writeSiteFile(id: number | string, bytes: Uint8Array): Promise<void> {
  await mkdir(SITE_FILES_DIR, { recursive: true, mode: 0o700 });
  await writeFile(siteFilePath(id), bytes, { mode: 0o600 });
}

export const readSiteFile = (id: number | string) => readFile(siteFilePath(id)).catch(() => null);

export const removeSiteFile = (id: number | string) => rm(siteFilePath(id), { force: true }).catch(() => undefined);

/** Ids of the files currently waiting (for the orphan sweep). */
export async function listSiteFiles(): Promise<number[]> {
  const names = await readdir(SITE_FILES_DIR).catch(() => [] as string[]);
  return names.map(Number).filter((n) => Number.isInteger(n) && n > 0);
}
