import { APIError, type Access, type CollectionBeforeChangeHook, type CollectionBeforeOperationHook, type CollectionConfig, type FieldAccess } from "payload";

import { isAdminOrEditor } from "../access";
import { uploadEditsOnce } from "../hooks/upload-edits-once";
import { sameInBoth } from "../i18n";

/**
 * 022-ux-improvement (Phase 2, data-model.md) — images of the admin itself:
 * the operator's branding (Settings → Default, US4) and members' avatars
 * (US5). Kept apart from `media` so they are never offered when picking an
 * image for a page. Files are public (the login page shows the logo before
 * sign-in); who uploaded what is not.
 */
export const ADMIN_IMAGE_MAX_BYTES = 1024 * 1024;
const MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"];

type Member = { id?: number | string; role?: string; isActive?: boolean; isService?: boolean } | null;

/** An Administrator, or the member who uploaded the image. */
const adminOrUploader: Access = (args) => {
  if (!isAdminOrEditor(args)) return false;
  const u = args.req.user as Member;
  return u?.role === "admin" ? true : { uploadedBy: { equals: u?.id } };
};

const staffFieldRead: FieldAccess = ({ req }) => Boolean(isAdminOrEditor({ req } as never));

/** French refusals before Payload stores anything (size, type). */
export const checkAdminImageFile: CollectionBeforeOperationHook = ({ args, operation }) => {
  if (operation !== "create" && operation !== "update") return args;
  const file = (args.req as { file?: { size?: number; mimetype?: string } }).file;
  if (!file) return args;
  if (file.mimetype && !MIME_TYPES.includes(file.mimetype)) throw new APIError("Choisissez une image (PNG, JPEG, WebP, GIF, SVG).", 400, null, true);
  if ((file.size ?? 0) > ADMIN_IMAGE_MAX_BYTES) throw new APIError("L'image dépasse 1 Mo.", 400, null, true);
  return args;
};

/** The uploader is the signed-in member, whatever the client sent. */
export const setUploadedBy: CollectionBeforeChangeHook = ({ data, operation, originalDoc, req }) => {
  const uploadedBy = operation === "create" ? ((req.user as Member)?.id ?? null) : (originalDoc?.uploadedBy ?? null);
  return { ...data, uploadedBy };
};

export const AdminImages: CollectionConfig = {
  slug: "admin-images",
  labels: { singular: { fr: "Image de l'admin", en: "Admin image" }, plural: { fr: "Images de l'admin", en: "Admin images" } },
  admin: { hidden: true },
  access: {
    read: () => true,
    create: isAdminOrEditor,
    update: adminOrUploader,
    delete: adminOrUploader,
  },
  upload: {
    mimeTypes: MIME_TYPES,
    // No resized copies and no crop / focal-point tools: Payload runs without
    // sharp here (passing it changed how the config is bundled and broke
    // validation error details), so those tools would be silently ignored.
    // Avatars are cropped square at display (object-fit: cover, centred).
    crop: false,
    focalPoint: false,
  },
  hooks: {
    beforeOperation: [checkAdminImageFile, uploadEditsOnce],
    beforeChange: [setUploadedBy],
  },
  fields: [
    { name: "alt", label: sameInBoth("Description"), type: "text" },
    {
      name: "uploadedBy",
      label: { fr: "Envoyée par", en: "Uploaded by" },
      type: "relationship",
      relationTo: "users",
      access: { read: staffFieldRead, update: () => false, create: () => false },
      admin: { readOnly: true },
    },
  ],
};
