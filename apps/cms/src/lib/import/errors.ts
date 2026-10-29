import { adminText } from "../../i18n";
import { fr } from "../../i18n/fr";

/**
 * Page import failure codes and their messages (012-url-page-import,
 * contracts/import-api.md), in the catalogue since 023 (`imports.errors`).
 * One list for the start endpoint, the job and the `page-imports.errorCode`
 * select. The job stores the French text; screens show the member's
 * language from the code (`importErrorMessage`).
 */
export const IMPORT_ERROR_MESSAGES = fr.imports.errors;

export type ImportErrorCode = keyof typeof IMPORT_ERROR_MESSAGES;

export const IMPORT_ERROR_CODES = Object.keys(IMPORT_ERROR_MESSAGES) as ImportErrorCode[];

export const importErrorMessage = (code: ImportErrorCode, lang: unknown): string => adminText(lang)(`imports.errors.${code}`);

/** What a failed AI step cost anyway, so the job still records it. */
export type AiSpend = { costUsd: number; aiModel: string };

/** A failure with a known code; anything else thrown in an import is `internal`. */
export class ImportError extends Error {
  readonly code: ImportErrorCode;
  readonly spent?: AiSpend;
  constructor(code: ImportErrorCode, detail?: string, spent?: AiSpend) {
    super(detail ?? code);
    this.name = "ImportError";
    this.code = code;
    this.spent = spent;
  }
}

export const importErrorCode = (e: unknown): ImportErrorCode => (e instanceof ImportError ? e.code : "internal");
