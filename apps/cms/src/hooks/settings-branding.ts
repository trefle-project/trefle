import { APIError, type GlobalAfterChangeHook, type GlobalBeforeChangeHook } from "payload";

import { adminText } from "../i18n";
import { applyBranding, readBranding } from "../lib/branding";

/**
 * 022-ux-improvement (US4, FR-021) — the wallpaper's variant tile must have
 * the pattern's exact size, or the grid would break.
 */
type Img = { width?: number | null; height?: number | null };
const idOf = (v: unknown): number | string | null => (v && typeof v === "object" ? ((v as { id?: number | string }).id ?? null) : (v as number | string | null) ?? null);

export const variantSameSizeAsPattern: GlobalBeforeChangeHook = async ({ data, req }) => {
  const pattern = idOf(data?.adminPattern);
  const variant = idOf(data?.adminVariant);
  if (pattern == null || variant == null) return data;
  const find = (id: number | string) => req.payload.findByID({ collection: "admin-images", id, depth: 0, overrideAccess: true, req }) as Promise<Img>;
  const [p, v] = await Promise.all([find(pattern), find(variant)]);
  if (p.width !== v.width || p.height !== v.height) {
    const t = adminText(req.i18n?.language);
    throw new APIError(t("settings.variantSize", { width: p.width ?? "?", height: p.height ?? "?" }), 400, null, true);
  }
  return data;
};

/** The operator's name, favicon and 2FA issuer follow every save (R9). */
export const reapplyBranding: GlobalAfterChangeHook = async ({ req }) => {
  applyBranding(req.payload, await readBranding(req.payload));
};
