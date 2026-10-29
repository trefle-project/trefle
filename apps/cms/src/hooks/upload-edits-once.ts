import type { CollectionBeforeOperationHook } from "payload";

/**
 * 022-ux-improvement — an upload with Payload's crop or focal-point tool
 * (`?uploadEdits[...]`) failed with « There was a problem while uploading
 * the file. fetch failed » (media, admin images alike). After storing the
 * file, @payloadcms/plugin-cloud-storage saves the document again within the
 * same request (`skipCloudStorage`, `req.file` cleared) while
 * `req.query.uploadEdits` is still there: Payload then believes the image
 * must be re-cut, tries to download it from its own URL and fails. The edits
 * were already applied to the stored file — drop them for that inner save.
 */
export const uploadEditsOnce: CollectionBeforeOperationHook = ({ args, operation }) => {
  const req = args.req as { context?: Record<string, unknown>; query?: Record<string, unknown> } | undefined;
  if (operation === "update" && req?.context?.skipCloudStorage && req.query?.uploadEdits) {
    delete req.query.uploadEdits;
  }
  return args;
};
