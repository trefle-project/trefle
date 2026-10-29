import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionBeforeChangeHook } from "payload";

import { MEDIA_ALIASES_TAG } from "@trefle/shared";

import { revalidateTags } from "./revalidate";

/**
 * 017-edge-protection (US4, FR-014) — replacing a media file gives it a new
 * key and Payload deletes the old object. Pages still reference the old key
 * in their HTML/CSS, so the old key is kept on the document and the renderer
 * maps it to the current one (contracts/media-aliases.md).
 */
type MediaKeys = { filename?: string | null; previousFilenames?: { filename?: string | null }[] | null };

export const recordPreviousFilename: CollectionBeforeChangeHook = ({ data, originalDoc, operation }) => {
  if (operation !== "update") return data;
  const before = (originalDoc as MediaKeys | undefined)?.filename;
  const after = (data as MediaKeys).filename;
  if (!before || !after || before === after) return data;
  const previous = ((originalDoc as MediaKeys).previousFilenames ?? []).filter((p) => p.filename);
  if (previous.some((p) => p.filename === before)) return data;
  return { ...data, previousFilenames: [...previous.map((p) => ({ filename: p.filename })), { filename: before }] };
};

export const revalidateAliasesOnChange: CollectionAfterChangeHook = ({ doc, previousDoc, operation }) => {
  if (operation === "update" && previousDoc?.filename && previousDoc.filename !== doc?.filename) {
    void revalidateTags({ reason: "media", tags: [MEDIA_ALIASES_TAG] });
  }
  return doc;
};

export const revalidateAliasesOnDelete: CollectionAfterDeleteHook = ({ doc }) => {
  void revalidateTags({ reason: "media", tags: [MEDIA_ALIASES_TAG] });
  return doc;
};

/** Every old key mapped to its document's current key; current keys are never aliased. */
export function buildAliasMap(docs: MediaKeys[]): Record<string, string> {
  const current = new Set(docs.map((d) => d.filename).filter((f): f is string => Boolean(f)));
  const aliases: Record<string, string> = {};
  for (const d of docs) {
    if (!d.filename) continue;
    for (const p of d.previousFilenames ?? []) {
      if (p.filename && !current.has(p.filename)) aliases[p.filename] = d.filename;
    }
  }
  return aliases;
}
