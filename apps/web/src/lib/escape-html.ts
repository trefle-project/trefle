/**
 * Shared with `apps/web/src/app/api/leads/route.ts` (003-post-launch-improvements,
 * FR-002) and `apps/web/src/components/tagging.tsx`'s raw-HTML rendering path
 * (007-gtm-tagging, research.md §7) — extracted so both call sites use the
 * exact same escaping logic rather than two copies that could drift.
 */
export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
