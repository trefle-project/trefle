# Contract: early domain+path conflict check

**Owner**: `apps/cms` · **Path**: `GET /api/pages/conflict-check` · **Auth**:
same as the rest of the admin API (authenticated staff/service caller only)
· **Caller**: the creation wizard (`PageCreateWizard`), client-side.

Not a public endpoint — never called by `apps/web` or exposed to a visitor.

## Request

Query params:

| Param | Req | Notes |
|---|---|---|
| `domain` | yes | a `domains` document id |
| `path` | yes | a page path, same normalisation as `pages.path` (leading slash) |

## Behaviour

1. Look up any `pages` document — **regardless of `status`** (draft or
   published; this is the deliberate difference from
   `pages-publish-guard.ts`'s own clash check, which only considers
   published pages — see research.md §10) — matching `(domain, path)`.
2. `200 { conflict: false }` if none found.
3. `200 { conflict: true, pageId, pageTitle }` if one is found — enough for
   the wizard to show "already used by *<pageTitle>*" without a second
   round trip.

## Relationship to `pages-publish-guard.ts`'s own uniqueness rule

This endpoint is advisory and point-in-time (FR-018) — it answers "as of
right now, would this collide with something?" for the wizard's benefit. It
is **not** the mechanism that actually prevents two published pages from
colliding; `pages-publish-guard.ts`'s existing, narrower (published-only)
check remains that mechanism, unchanged from 001. A `{ conflict: false }`
response here is not a guarantee the eventual publish will succeed if
another page is created or published at that same path in the meantime.
