# Phase 1 Data Model: Post-launch debugging & improvements (phase 1)

This feature makes **one** schema change. Everything else it touches
(`domains.notFoundPagePath`) already exists in the model documented in
`specs/001-landing-page-lead-capture/data-model.md` — this phase wires up a
dormant field rather than adding one. See `research.md` §9.

---

## Collection: `pages` — new field `confirmationPage`

| Field | Type | Notes |
|---|---|---|
| `confirmationPage` | rel→pages | optional; the page shown to a visitor after a successful submission on **this** page. When unset, the renderer falls back to today's generic "Merci..." message (FR-013). |

**Placement**: sidebar group, alongside `domain`/`path`/`status` (same pattern
as the existing `domain` relationship on `Pages.ts`).

**Access**: inherits the collection's existing `read`/`update` access
(`isAdminOrEditor` for write, `publishedOnly` for public read) — no new
access rule; a confirmation page is just another `pages` document.

**Validation**: none beyond Payload's own relationship integrity. Explicitly
**not** required to publish (Question 2 decision, FR-013) — the
`pages-publish-guard.ts` rule set is unchanged by this feature.

**Not modelled** (explicitly out of scope, see spec.md Edge Cases): a
referential-integrity guard preventing a page from being deleted/unpublished
while another page still points to it as `confirmationPage`. That case is
handled procedurally (the editor is told, per the edge case), not by a
database constraint, in this phase.

**Hooks**: none needed on `pages` for this field itself — it is read, not
acted on, by `leadIntake.ts` at submission time (see
`contracts/lead-intake-confirmation.md`).

---

## Collection: `domains` — `notFoundPagePath` goes from declared to consumed

No field change. `notFoundPagePath` (`text`, optional — "path to serve for
unmatched paths on this host") already exists on `domains` and is already
returned by `getActiveDomainByHost()` to the renderer
(`apps/web/src/lib/payload-client/index.ts`'s `Domain` interface already
includes it). This feature changes only the **consumer**:
`apps/web/src/app/[[...slug]]/page.tsx`'s `load()` starts reading it as a
fallback lookup (see `contracts/domain-fallback.md`).

**Operational note**: to give a domain (and its `www` pair, each its own
`Domain` record) a default landing experience, an operator sets both
records' `notFoundPagePath` to an existing page's `path` on that domain —
a content/config change, not a deploy.

---

## Non-schema state touched by this feature

- **In-memory rate-limit store** (`apps/web/src/lib/rate-limit.ts`) — gains a
  size cap and opportunistic expired-entry sweep (research.md §5). Not
  persisted; process-local, as today.
- **Preview token** (`apps/web/src/lib/tokens.ts`) — the signed body gains an
  `issuedAt` component (research.md §4), same as the existing form token.
  Not a stored entity; a token is derived, not persisted.
- **GrapesJS `builder.projectData`/`html`/`css`** (`apps/cms/src/fields/grapesjs/field.ts`)
  — gains a non-empty `defaultValue` (research.md §10). No shape change to
  the existing `builder` group; only what a brand-new document starts with.
