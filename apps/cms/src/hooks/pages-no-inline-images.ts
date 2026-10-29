import type { CollectionBeforeValidateHook } from "payload";
import { APIError } from "payload";

/**
 * Reject inline (base64) images in the block-editor output. A `data:` image is
 * stored three times over — `builder.projectData` + `builder.html` +
 * `builder.css` — and a single photo pushes the document past the request-body
 * limits (the original page-save 500 / 400). Images belong in the Media
 * library, which the editor's asset manager uploads to; a data: URI reaching
 * here means something bypassed it (a document authored before that wiring, a
 * pasted `<img>`, an HTML import).
 *
 * Runs in `beforeValidate` so it lands before the `builder.html` maxLength
 * check and can explain *why* the save was refused.
 */
const DATA_IMAGE_RE = /data:image\/[a-z0-9.+-]+;base64,/i;

export const rejectInlineImages: CollectionBeforeValidateHook = ({ data }) => {
  if (!data) return data;
  const builder = (data.builder ?? {}) as Record<string, unknown>;
  const haystacks = [
    typeof builder.html === "string" ? builder.html : "",
    typeof builder.css === "string" ? builder.css : "",
    builder.projectData ? JSON.stringify(builder.projectData) : "",
  ];
  if (haystacks.some((h) => DATA_IMAGE_RE.test(h))) {
    throw new APIError(
      "The block editor contains an inline (base64) image. Add images through the Media library so the page stays within size limits.",
      400,
      undefined,
      true,
    );
  }
  return data;
};
