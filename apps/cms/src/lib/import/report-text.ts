import type { ReportText } from "@trefle/grapesjs-page-import/serialize";

import { adminText, type AdminKey } from "../../i18n";
import { fr } from "../../i18n/fr";

/**
 * 023-admin-i18n (US5, data-model.md) — a report line in the reader's
 * language: a keyed line through the catalogue, a plain string (AI lines,
 * reports made before 023) as written. A key the catalogue does not know
 * shows as itself, never as an empty line.
 */
const known = (key: string): key is AdminKey =>
  typeof key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], fr) === "string";

export function reportLine(line: ReportText, lang: unknown): string {
  if (typeof line === "string") return line;
  return known(line.key) ? adminText(lang)(line.key, line.values) : line.key;
}
