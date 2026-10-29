import { adminText } from "../../i18n";
import { fr } from "../../i18n/fr";

/**
 * Website import (015-penpot-site-import) — error codes and their messages
 * (contracts/site-import-api.md), in the catalogue since 023
 * (`imports.siteErrors`). The document stores the code and the French text;
 * the wizard shows the member's language from the code.
 */
export const SITE_IMPORT_ERROR_MESSAGES = fr.imports.siteErrors;

export type SiteImportErrorCode = keyof typeof SITE_IMPORT_ERROR_MESSAGES;
export const SITE_IMPORT_ERROR_CODES = Object.keys(SITE_IMPORT_ERROR_MESSAGES) as SiteImportErrorCode[];

export const siteImportErrorMessage = (code: SiteImportErrorCode, lang: unknown): string => adminText(lang)(`imports.siteErrors.${code}`);

/** « La page « Accueil » est trop détaillée… » — the job names the board. */
export const pageTooLargeMessage = (board: string) => adminText("fr")("imports.pageTooLarge", { board });

export class SiteImportError extends Error {
  constructor(
    readonly code: SiteImportErrorCode,
    readonly userMessage: string = SITE_IMPORT_ERROR_MESSAGES[code],
  ) {
    super(code);
    this.name = "SiteImportError";
  }
}

/** Boards one import may create (clarification 2026-10-06). */
export const MAX_BOARDS_PER_IMPORT = 10;
export const TOO_MANY_BOARDS = fr.imports.tooManyBoards;

/** An address is a URL path: the start endpoint and the wizard refuse these characters. */
export const PATH_CHARS = fr.imports.pathChars;
