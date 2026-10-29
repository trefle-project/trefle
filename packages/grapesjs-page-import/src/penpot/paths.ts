/**
 * Proposed page addresses for a Penpot page's boards (015-penpot-site-import,
 * research P13). The editor reviews and edits them before confirming; the
 * CMS validates them again (`validatePagePath`, reserved paths).
 */

const MAX_SLUG = 60;

/** « À propos » → `a-propos`; empty → `page`. */
export function slug(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");
  return s || "page";
}

/** First board → `/`, the others → `/<slug>`, duplicates → `-2`, `-3`… (boards in reading order). */
export function proposePaths(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name, i) => {
    if (i === 0) {
      used.add("/");
      return "/";
    }
    const base = `/${slug(name)}`;
    let path = base;
    for (let n = 2; used.has(path); n++) path = `${base}-${n}`;
    used.add(path);
    return path;
  });
}
