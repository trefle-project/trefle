import type { Payload } from "payload";

/**
 * 022-ux-improvement (US4, research R9) — the installation operator's
 * identity in the admin. Read from Settings on the server (the login page
 * shows it before sign-in, so nothing else of Settings becomes public).
 *
 * The tab-title suffix, the favicon and the 2FA issuer are configuration
 * values Payload and payload-totp read on every request: `applyBranding`
 * updates them in place at start (`onInit`) and after each Settings save.
 */
export type BrandImage = { url: string; width: number | null; height: number | null; mimeType: string | null };
export type Branding = {
  name: string | null;
  logo: BrandImage | null;
  icon: BrandImage | null;
  favicon: BrandImage | null;
  pattern: BrandImage | null;
  variant: BrandImage | null;
  variantMode: "perScreen" | "oneIn";
  variantCount: number;
  variantOneIn: number;
  veilOpacity: number;
};

export const DEFAULT_NAME = "Trefle";

const image = (v: unknown): BrandImage | null => {
  if (!v || typeof v !== "object") return null;
  const d = v as { url?: string | null; width?: number | null; height?: number | null; mimeType?: string | null };
  return d.url ? { url: d.url, width: d.width ?? null, height: d.height ?? null, mimeType: d.mimeType ?? null } : null;
};

/**
 * Trefle's own look, used for every image slot left empty in Settings: the
 * files ship with the CMS (apps/cms/public/branding) so a fresh install, prod
 * included, looks the same without any upload.
 */
const bundled = (file: string, size: number, mimeType: string): BrandImage => ({ url: `/branding/${file}`, width: size, height: size, mimeType });
export const DEFAULT_IMAGES = {
  logo: bundled("trefle-logo.svg", 512, "image/svg+xml"),
  icon: bundled("trefle-icon-50.png", 50, "image/png"),
  favicon: bundled("trefle-logo.svg", 512, "image/svg+xml"),
  pattern: bundled("trefle-pattern-15.png", 15, "image/png"),
  variant: bundled("trefle-variant-15.png", 15, "image/png"),
};
export const DEFAULT_VARIANT_ONE_IN = 100;
export const DEFAULT_VEIL_OPACITY = 60;

/** 0–100, the default when unset. */
const veil = (v: unknown): number => {
  const n = Number(v ?? DEFAULT_VEIL_OPACITY);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : DEFAULT_VEIL_OPACITY;
};

export async function readBranding(payload: Payload): Promise<Branding> {
  const s = (await payload.findGlobal({ slug: "settings", depth: 1, overrideAccess: true }).catch(() => ({}))) as Record<string, unknown>;
  const name = ((s.operator as { name?: string | null } | undefined)?.name ?? "").trim() || null;
  const pattern = image(s.adminPattern);
  return {
    name,
    logo: image(s.adminLogo) ?? DEFAULT_IMAGES.logo,
    icon: image(s.adminIcon) ?? DEFAULT_IMAGES.icon,
    favicon: image(s.adminFavicon) ?? DEFAULT_IMAGES.favicon,
    pattern: pattern ?? DEFAULT_IMAGES.pattern,
    // The bundled variant only goes with the bundled pattern (same size).
    variant: image(s.adminVariant) ?? (pattern ? null : DEFAULT_IMAGES.variant),
    variantMode: s.variantMode === "perScreen" ? "perScreen" : "oneIn",
    variantCount: Number(s.variantCount ?? 1) || 1,
    variantOneIn: Number(s.variantOneIn ?? DEFAULT_VARIANT_ONE_IN) || DEFAULT_VARIANT_ONE_IN,
    veilOpacity: veil(s.veilOpacity),
  };
}

/**
 * The tab title and favicon are computed per request in the admin page's
 * `generateMetadata` (app/(payload)/admin/[[...segments]]/page.tsx): Next runs
 * the API routes and the admin pages in separate module instances, so a value
 * changed in place by one would not reach the other.
 */
export const BASE_SUFFIX = " · Trefle";
type TitleLike = string | { absolute?: string; default?: string; template?: string } | null | undefined;
type MetaLike = { title?: TitleLike; icons?: unknown; [key: string]: unknown };

const rename = (title: string, name: string) => (title.endsWith(BASE_SUFFIX) ? `${title.slice(0, -BASE_SUFFIX.length)} · ${name}` : title);

export function withBranding<T extends MetaLike>(meta: T, b: Pick<Branding, "name" | "favicon">): T {
  const name = b.name ?? DEFAULT_NAME;
  const t = meta.title;
  const title = typeof t === "string" ? rename(t, name) : t && typeof t === "object" ? { ...t, ...(t.absolute ? { absolute: rename(t.absolute, name) } : {}), ...(t.default ? { default: rename(t.default, name) } : {}) } : t;
  return {
    ...meta,
    title,
    ...(b.favicon ? { icons: [{ rel: "icon", url: b.favicon.url, ...(b.favicon.mimeType ? { type: b.favicon.mimeType } : {}) }] } : {}),
  };
}

/**
 * The 2FA issuer: payload-totp reads `totp.issuer` on every call, in
 * whichever module instance serves it — so a getter returns the operator's
 * name from a per-instance cache refreshed at most every minute (and right
 * away in the instance that saved Settings).
 */
let issuerName = DEFAULT_NAME;
let fetchedAt = 0;
let refreshing = false;
let payloadRef: Payload | null = null;
const REFRESH_MS = 60_000;

function refreshIssuer(): void {
  if (!payloadRef || refreshing || Date.now() - fetchedAt < REFRESH_MS) return;
  refreshing = true;
  void readBranding(payloadRef)
    .then((b) => {
      issuerName = b.name ?? DEFAULT_NAME;
      fetchedAt = Date.now();
    })
    .catch(() => undefined)
    .finally(() => {
      refreshing = false;
    });
}

export const totpOptions = {
  totp: {
    get issuer(): string {
      refreshIssuer();
      return issuerName;
    },
  },
};

/** At start (`onInit`) and after each Settings save, in that instance. */
export function applyBranding(payload: Payload, b: Branding): void {
  payloadRef = payload;
  issuerName = b.name ?? DEFAULT_NAME;
  fetchedAt = Date.now();
}
