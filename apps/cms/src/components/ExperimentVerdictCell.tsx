import type { Analysis } from "../lib/ab-verdict";
import { adminLanguageOf } from "../i18n";
import { listLine } from "../lib/ab-verdict-copy";

/**
 * 018-ab-significance (FR-015) — the « Verdict » column of the tests list: one
 * line per test from the stored analysis (split warning first). The cell of
 * the `analysis` field, whose raw value is never shown.
 */
export default function ExperimentVerdictCell({ cellData, i18n }: { cellData?: unknown; i18n?: { language?: string } }) {
  return <span>{listLine((cellData ?? null) as Analysis | null, adminLanguageOf(i18n?.language))}</span>;
}
