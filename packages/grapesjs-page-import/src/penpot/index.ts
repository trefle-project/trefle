/**
 * Penpot → GrapesJS conversion (015-penpot-site-import,
 * contracts/penpot-conversion.md). Pure: bytes in, page content out.
 */
export { readPenpotFile, PenpotFileError, PENPOT_LIMITS, box } from "./read";
export type {
  PenpotFile,
  PenpotLimits,
  PenpotErrorCode,
  BoardSummary,
  PenpotPageSummary,
} from "./read";
export { proposePaths, slug } from "./paths";
export { ROOT_ID } from "./model";
export type { Shape } from "./model";
export { boardNeeds, convertBoard, MAX_PAGE_BYTES, IMAGE_PLACEHOLDER } from "./convert";
export type { BoardNeeds, ConvertContext, ConvertResult, StoredImage } from "./convert";
export { genericFamily } from "./text";
export { meaningfulName } from "./svg";
