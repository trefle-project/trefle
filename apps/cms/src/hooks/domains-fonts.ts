import type { CollectionBeforeChangeHook } from "payload";
import { ValidationError } from "payload";

import {
  ensureFontFiles,
  FontError,
  fontErrorMessage,
  mergeFontRows,
  type DomainFontRow,
} from "../lib/fonts";

const idOf = (f: number | { id: number }) => (typeof f === "object" ? f.id : f);
const sameRequest = (a: DomainFontRow, b: DomainFontRow | undefined) =>
  Boolean(b) &&
  (a.weights ?? []).map(String).sort().join() === (b!.weights ?? []).map(String).sort().join() &&
  Boolean(a.italic) === Boolean(b!.italic);

/**
 * « Polices du domaine » (015-penpot-site-import, FR-024/FR-025): rows of
 * one family are merged; each row whose family, weights or italic changed
 * gets its files resolved and stored (`lib/fonts.ts`), unchanged rows keep
 * theirs. An unknown family or weight blocks saving, naming it.
 */
export const domainFontsBeforeChange: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (!data || !Array.isArray(data.fonts)) return data;
  const before = new Map(
    ((originalDoc?.fonts ?? []) as DomainFontRow[])
      .filter((r) => r.family)
      .map((r) => [String(r.family).trim().toLowerCase(), r]),
  );
  const rows = mergeFontRows(data.fonts as DomainFontRow[]);
  const errors: { path: string; message: string }[] = [];
  for (const [i, row] of rows.entries()) {
    const prev = before.get(row.family!.toLowerCase());
    if (prev && sameRequest(row, prev) && (prev.files ?? []).length) {
      row.files = (prev.files ?? []).map(idOf);
      continue;
    }
    try {
      row.files = await ensureFontFiles(
        req.payload,
        {
          family: row.family!,
          weights: (row.weights ?? []).map(Number),
          italic: Boolean(row.italic),
        },
        { req },
      );
    } catch (e) {
      if (!(e instanceof FontError)) throw e;
      errors.push({
        path: `fonts.${i}.${e.kind === "weight" ? "weights" : "family"}`,
        message: fontErrorMessage(e, req.i18n?.language),
      });
    }
  }
  if (errors.length) throw new ValidationError({ errors });
  return { ...data, fonts: rows };
};
