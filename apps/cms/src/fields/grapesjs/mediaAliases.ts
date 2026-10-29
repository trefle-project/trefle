/**
 * Show replaced images with their current file in the editor.
 *
 * « Remplacer partout » (017) gives a media a new object key and deletes the
 * old object; pages keep the old key and the renderer maps it to the current
 * one (the alias map, `GET /api/media/aliases`). The editor loaded the stored
 * key as is, so it kept showing the old image — Cloudflare still has it
 * cached for a year — even after a reload (found 2026-10-12).
 *
 * Applied to the projectData entering the editor, next to
 * `promoteEditableTexts`: every string (image `src`, inline `style`, CSS rules
 * and their `url(...)`) that names an old key as a URL path segment gets the
 * current key. The next save stores it, so the page stops depending on the
 * alias. Keys are unique hashed file names (`photo-3fa1c09b.jpg`), so only a
 * whole path segment matches. Returns a new object; the input is not mutated.
 */
export type MediaAliases = Record<string, string>;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function applyMediaAliases<T>(projectData: T, aliases: MediaAliases): T {
  const olds = Object.keys(aliases).filter((k) => k && aliases[k] && aliases[k] !== k);
  if (olds.length === 0) return projectData;
  // `/old-key` followed by the end of the URL: a quote, `)`, `?`, `#`, `&`, whitespace or the end.
  const re = new RegExp(`/(${olds.map(escapeRe).join("|")})(?=["')?#&\\s]|$)`, "g");
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.includes("/") ? v.replace(re, (_m, old: string) => `/${aliases[old]}`) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, walk(val)]));
    return v;
  };
  return walk(projectData) as T;
}

/** The current alias map; an empty one if it cannot be read (the editor opens as before). */
export async function fetchMediaAliases(): Promise<MediaAliases> {
  try {
    const res = await fetch("/api/media/aliases", { credentials: "same-origin" });
    if (!res.ok) return {};
    return ((await res.json()) as { aliases?: MediaAliases }).aliases ?? {};
  } catch {
    return {};
  }
}
