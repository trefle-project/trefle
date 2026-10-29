/**
 * 022-ux-improvement (US5, FR-026) — a member without an avatar: their
 * initials on a disc whose colour is stable per member (picked from the id).
 * Every colour keeps white text at WCAG AA contrast.
 */
export const AVATAR_COLORS = ["#1d4ed8", "#047857", "#b91c1c", "#6d28d9", "#9a3412", "#0e7490", "#be185d", "#3f6212"];

export function initialsOf(member: { name?: string | null; email?: string | null } | null | undefined): string {
  const name = member?.name?.trim();
  if (name) {
    const words = name.split(/\s+/).filter(Boolean);
    return (words.length > 1 ? `${words[0]![0]}${words[words.length - 1]![0]}` : words[0]!.slice(0, 2)).toUpperCase();
  }
  const local = (member?.email ?? "").split("@")[0]?.replace(/[^\p{L}\p{N}]/gu, "") ?? "";
  return (local.slice(0, 2) || "?").toUpperCase();
}

export function colorOf(id: string | number | null | undefined): string {
  const text = String(id ?? "");
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

type Image = { url?: string | null; sizes?: { avatar?: { url?: string | null } } } | null | undefined;
/** The avatar's small size when there is one, else the original. */
export const avatarUrl = (img: Image): string | null => img?.sizes?.avatar?.url || img?.url || null;
