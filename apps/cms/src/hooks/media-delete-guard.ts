import { APIError, type CollectionBeforeDeleteHook } from "payload";

import { adminText } from "../i18n";
import { findMediaUsage, type MediaUsage } from "../lib/media-usage";

/**
 * 017-edge-protection (FR-022, research R22) — a used image cannot be deleted:
 * its pages would show a broken image, and an edge-cached copy would outlive
 * the object. Applies per item to the document view, bulk list deletes and the
 * API. Import cleanups pass `context.allowUsedMediaDelete` (their media are
 * referenced only by the pages they delete alongside).
 */
export function deleteRefusal(usage: MediaUsage, lang?: string): string {
  const t = adminText(lang);
  const titles = [
    ...usage.pages.map((p) => p.title),
    ...usage.domains.map((d) =>
      t(d.via === "favicon" ? "errors.mediaInUseFavicon" : "errors.mediaInUseShareImage", { host: d.hostname }),
    ),
  ];
  const shown = titles.slice(0, 5).join(", ");
  const more = titles.length > 5 ? t("errors.mediaInUseMore", { n: titles.length - 5 }) : "";
  return t("errors.mediaInUse", { n: usage.total, shown, more });
}

export const mediaDeleteGuard: CollectionBeforeDeleteHook = async ({ id, req }) => {
  if (req.context?.allowUsedMediaDelete === true) return;
  const media = await req.payload.findByID({ collection: "media", id, depth: 0, overrideAccess: true, disableErrors: true, req });
  if (!media) return;
  const usage = await findMediaUsage(req.payload, media);
  if (usage.total > 0) throw new APIError(deleteRefusal(usage, req.i18n?.language), 409, undefined, true);
};
