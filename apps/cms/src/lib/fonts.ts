import { createHash } from "node:crypto";

import { isValidFontFamily } from "@trefle/shared";
import type { Payload, PayloadRequest } from "payload";

import { adminText } from "../i18n";

/**
 * Domain fonts (015-penpot-site-import, User Story 4, research P8): Google
 * Fonts families are resolved through the CSS2 API and their woff2 files
 * stored once in the `fonts` collection. Published pages and the editor then
 * load them from Trefle's own storage, never from Google.
 *
 * Only the `latin` and `latin-ext` subsets are kept (FR-025).
 */

export const GOOGLE_CSS_URL = () =>
  process.env.GOOGLE_FONTS_CSS_URL || "https://fonts.googleapis.com/css2";
/** Google serves woff2 only to browsers it recognises. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const SUBSETS = new Set(["latin", "latin-ext"]);
const MAX_FONT_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
export const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

export type FontRequest = { family: string; weights: number[]; italic: boolean };
export type GoogleFace = {
  family: string;
  style: "normal" | "italic";
  weight: number;
  subset: string;
  unicodeRange: string;
  url: string;
};

export class FontError extends Error {
  constructor(
    readonly kind: "family" | "weight" | "network",
    readonly family: string,
    readonly weights: number[] = [],
  ) {
    super(
      kind === "family"
        ? `unknown family ${family}`
        : kind === "weight"
          ? `unknown weights ${weights.join(",")} for ${family}`
          : `network error for ${family}`,
    );
    this.name = "FontError";
  }
}

/** Message for the domain settings (FR-025), in the admin language. */
export function fontErrorMessage(e: FontError, lang: string = "fr"): string {
  const t = adminText(lang);
  if (e.kind === "family") return t("fonts.errFamily", { family: e.family });
  if (e.kind === "weight") return t("fonts.errWeight", { family: e.family, weights: e.weights.join(", ") });
  return t("fonts.errNetwork");
}

type Fetch = typeof fetch;

/** `@font-face` blocks of a CSS2 response, each with the subset named in the comment before it. */
export function parseCss2(css: string): GoogleFace[] {
  const out: GoogleFace[] = [];
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/gi;
  for (const m of css.matchAll(re)) {
    const body = m[2]!;
    const prop = (name: string) =>
      new RegExp(`${name}\\s*:\\s*([^;]+);`, "i").exec(body)?.[1]?.trim();
    const family = prop("font-family")?.replace(/^['"]|['"]$/g, "");
    const url = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i.exec(prop("src") ?? "")?.[1];
    const weight = Number(prop("font-weight"));
    if (!family || !url || !Number.isInteger(weight)) continue;
    out.push({
      family,
      style: prop("font-style") === "italic" ? "italic" : "normal",
      weight,
      subset: m[1]!.toLowerCase(),
      unicodeRange: prop("unicode-range") ?? "",
      url,
    });
  }
  return out;
}

const css2Url = (family: string, weights: number[], italic: boolean) => {
  const name = encodeURIComponent(family).replace(/%20/g, "+");
  if (!weights.length) return `${GOOGLE_CSS_URL()}?family=${name}&display=swap`;
  const tuples = [...weights.map((w) => `0,${w}`), ...(italic ? weights.map((w) => `1,${w}`) : [])];
  return `${GOOGLE_CSS_URL()}?family=${name}:ital,wght@${tuples.join(";")}&display=swap`;
};

async function get(url: string, fetchImpl: Fetch): Promise<Response> {
  try {
    return await fetchImpl(url, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
  } catch {
    throw new FontError("network", url);
  }
}

/** The latin + latin-ext faces of a family's weights/styles. Unknown family or weights → FontError naming them. */
export async function resolveGoogleFamily(
  req: FontRequest,
  fetchImpl: Fetch = fetch,
): Promise<GoogleFace[]> {
  const family = req.family.trim();
  if (!isValidFontFamily(family)) throw new FontError("family", family);
  const weights = [...new Set(req.weights)]
    .filter((w) => (FONT_WEIGHTS as readonly number[]).includes(w))
    .sort((a, b) => a - b);
  if (!weights.length) throw new FontError("weight", family, req.weights);

  const res = await get(css2Url(family, weights, req.italic), fetchImpl);
  if (res.status >= 500) throw new FontError("network", family);
  if (!res.ok) {
    // Google answers 400 for an unknown family and for an unknown weight alike: tell them apart.
    const familyOnly = await get(css2Url(family, [], false), fetchImpl);
    if (!familyOnly.ok)
      throw new FontError(familyOnly.status >= 500 ? "network" : "family", family);
    const missing: number[] = [];
    for (const w of weights)
      if (!(await get(css2Url(family, [w], false), fetchImpl)).ok) missing.push(w);
    throw new FontError("weight", family, missing.length ? missing : weights);
  }
  return parseCss2(await res.text()).filter((f) => SUBSETS.has(f.subset));
}

/** Font files may only come from Google's font host, or the host of a configured stand-in (tests, e2e). */
function allowedFontUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const cssHost = new URL(GOOGLE_CSS_URL()).host;
    return (u.protocol === "https:" && u.host === "fonts.gstatic.com") || u.host === cssHost;
  } catch {
    return false;
  }
}

const fileSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Ids of the `fonts` documents for a request, downloading only the files
 * not stored yet. Shared by every domain that lists the family.
 */
export async function ensureFontFiles(
  payload: Payload,
  request: FontRequest,
  opts: { fetchImpl?: Fetch; req?: Partial<PayloadRequest> } = {},
): Promise<number[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const faces = await resolveGoogleFamily(request, fetchImpl);
  const ids: number[] = [];
  for (const face of faces) {
    const existing = await payload.find({
      collection: "fonts",
      where: {
        and: [
          { family: { equals: face.family } },
          { weight: { equals: face.weight } },
          { style: { equals: face.style } },
          { subset: { equals: face.subset } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if (existing.docs[0]) {
      ids.push(Number(existing.docs[0].id));
      continue;
    }
    if (!allowedFontUrl(face.url)) throw new FontError("network", face.family);
    const res = await get(face.url, fetchImpl);
    if (!res.ok) throw new FontError("network", face.family);
    const data = Buffer.from(await res.arrayBuffer());
    if (!data.length || data.length > MAX_FONT_BYTES) throw new FontError("network", face.family);
    const doc = await payload.create({
      collection: "fonts",
      overrideAccess: true,
      depth: 0,
      ...(opts.req ? { req: opts.req } : {}),
      data: {
        family: face.family,
        weight: face.weight,
        style: face.style,
        subset: face.subset as "latin" | "latin-ext",
        unicodeRange: face.unicodeRange,
        source: "google",
        sha256: createHash("sha256").update(data).digest("hex"),
      },
      file: {
        data,
        name: `${fileSlug(face.family)}-${face.weight}${face.style === "italic" ? "i" : ""}-${face.subset}.woff2`,
        mimetype: "font/woff2",
        size: data.length,
      },
    });
    ids.push(Number(doc.id));
  }
  return ids;
}

export type DomainFontRow = {
  id?: string;
  family?: string;
  weights?: (string | number)[];
  italic?: boolean;
  files?: (number | { id: number })[];
};

/** Rows with the same family (case-insensitive) merged: weights united, italic if any row asks for it. */
export function mergeFontRows(rows: DomainFontRow[]): DomainFontRow[] {
  const byFamily = new Map<string, DomainFontRow>();
  for (const r of rows) {
    const family = (r.family ?? "").trim();
    if (!family) continue;
    const key = family.toLowerCase();
    const prev = byFamily.get(key);
    const weights = (r.weights ?? []).map(String);
    if (!prev) byFamily.set(key, { ...r, family, weights: [...new Set(weights)] });
    else {
      prev.weights = [...new Set([...(prev.weights ?? []).map(String), ...weights])];
      prev.italic = Boolean(prev.italic || r.italic);
    }
  }
  return [...byFamily.values()].map((r) => ({
    ...r,
    weights: (r.weights ?? []).map(String).sort((a, b) => Number(a) - Number(b)),
  }));
}
