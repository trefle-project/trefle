import { adminText } from "../i18n";

/**
 * 003-post-launch-improvements, FR-009 — removes the ambiguity behind the
 * original bug report ("no republish function"): saving an already-published
 * page IS republishing it, with no separate step. Rendered via
 * `admin.components.edit.beforeDocumentControls` on Pages.ts, just above the
 * Save/Publish controls.
 *
 * `revalidateTags()` (apps/cms/src/hooks/revalidate.ts) is deliberately
 * fire-and-forget from this hook's perspective — a save must never block on
 * it — so the client has no reliable, real-time signal of whether that
 * specific background call ultimately succeeded. Rather than fake a status
 * this component can't actually observe, it states the real, always-true
 * guarantee (save = live, no separate action) and where to look if a change
 * doesn't show up on time (a transient failure after 3 retries logs at
 * `error` level — see revalidate.ts).
 */
const RevalidationStatus = ({ lang }: { lang?: string }) => (
  <p
    style={{
      fontSize: 13,
      opacity: 0.8,
      margin: "0 0 12px",
      padding: "8px 12px",
      border: "1px solid var(--theme-elevation-150)",
      borderRadius: 4,
    }}
  >
    {adminText(lang)("pages.republishNote")}
  </p>
);

export default RevalidationStatus;
