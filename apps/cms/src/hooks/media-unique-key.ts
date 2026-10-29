import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { CollectionBeforeOperationHook } from "payload";

/**
 * 017-edge-protection (US4, FR-013) — every uploaded file gets a key that is
 * never reused: `<base>-<hash8>.<ext>`, `hash8` = first 8 hex chars of the
 * file's SHA-256. Images and fonts can then be cached at the edge for a year
 * (`immutable`) — replacing a file produces a new key instead of rewriting
 * the old object in place. Imports already name their images
 * `<base>-<hash8>.webp` (hash of the source bytes): that suffix is replaced,
 * never doubled.
 */
const HASH_SUFFIX = /-[0-9a-f]{8}$/;

export function uniqueKeyName(name: string, data: Buffer): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(HASH_SUFFIX, "");
  const ext = dot > 0 ? name.slice(dot) : "";
  const hash8 = createHash("sha256").update(data).digest("hex").slice(0, 8);
  return `${base}-${hash8}${ext}`;
}

type IncomingFile = { name: string; data?: Buffer; tempFilePath?: string; size?: number };

export const mediaUniqueKey: CollectionBeforeOperationHook = async ({ args, operation }) => {
  if (operation !== "create" && operation !== "update") return args;
  const file = (args as { req?: { file?: IncomingFile } }).req?.file;
  if (!file?.name) return args;
  const bytes = file.data && file.data.length > 0 ? file.data : file.tempFilePath ? await readFile(file.tempFilePath) : null;
  if (!bytes) return args;
  file.name = uniqueKeyName(file.name, bytes);
  return args;
};
