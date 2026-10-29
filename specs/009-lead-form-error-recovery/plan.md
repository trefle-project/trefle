# Implementation Plan: Lead form error recovery

**Branch**: `009-lead-form-error-recovery` | **Date**: 2026-09-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-lead-form-error-recovery/spec.md`

## Summary

When a lead-form submission fails per-field validation, `POST /api/leads`
stops returning a standalone generic error page and instead stashes the
submitted values + per-field errors in a short-lived, single-use,
in-memory flash record and `303`-redirects to a new dedicated route,
`/form-retry`, which re-renders the visitor's own landing page through the
existing `PageShell`/`LeadForm` pipeline with those values pre-filled and
the failed field(s) marked inline (`LeadForm` already accepts `values`/
`errors` props today — they were simply never wired up). Two constraints
already solved elsewhere in this codebase shaped the design: Route
Handlers can't render `PageShell` directly (react-dom/server import
restriction, already worked around by `/confirmation`), and the shared
`[[...slug]]/page.tsx` route is ISR-cached and must never read per-visitor
state (already established in `008-ab-testing`'s research). Only
`apps/web` changes; no `apps/cms` schema, no new npm dependency.

## Technical Context

**Language/Version**: TypeScript, Node 24. Next 16 App Router (`apps/web`
only).

**Primary Dependencies**: None new. Reuses `apps/web/src/lib/tokens.ts`
(`signFormToken`, unchanged), `apps/web/src/components/page-shell.tsx` and
`lead-form.tsx` (unchanged rendering logic, new pass-through props), the
existing `Tagging` component.

**Storage**: None new. One new in-memory, bounded, TTL'd `Map` (mirrors
`apps/web/src/lib/rate-limit.ts`'s existing pattern) for the flash record —
not a database table (research.md §2). No PostgreSQL migration.

**Testing**: Vitest (`apps/web`) for the flash store's TTL/single-use/
eviction behaviour (mirrors `rate-limit.test.ts`'s style) and for the
restructured validation-failure branch in `apps/web/tests/api-leads.test.ts`
(now asserts a `303` to `/form-retry` instead of the old inline `422` body —
existing assertions there need updating, not just extending). Playwright
e2e for the full redirect round-trip (quickstart.md §1–§2) added to the
existing lead-capture suite alongside `us1-capture.spec.ts`.

**Target Platform**: Same Debian VPS / Docker Compose stack; no `infra/`
change.

**Project Type**: Existing multi-app monorepo; this feature is
`apps/web`-only.

**Performance Goals**: No regression to the shared `[[...slug]]/page.tsx`
route's ISR caching for pages that never see a validation failure — the
entire point of routing this through a separate `force-dynamic` route
instead of that shared one (research.md §1).

**Constraints**: No personal submitted value may appear in a URL, redirect
`Location` header, or log line (existing FR-038/001, enforced by the
in-memory-store design in research.md §2, verified in quickstart.md §5).
Non-per-field-validation failure responses (honeypot, timing, host,
unpublished, rate limit, upstream) must be byte-for-byte unchanged
(spec.md FR-008).

**Scale/Scope**: Same single shared workspace. No change to expected
traffic; the flash store's cap only needs to cover concurrent in-flight
"visitor is mid-retry" states, several orders of magnitude below
`rate-limit.ts`'s existing 50,000-key cap.

## Constitution Check

| Principle | Check |
|---|---|
| I. Simplicity First | Reuses three existing mechanisms end to end — `LeadForm`'s already-built `values`/`errors` props, `PageShell`'s already-built render pipeline, and `rate-limit.ts`'s already-accepted bounded-in-memory-`Map` pattern — rather than adding a new rendering path, a new persistence layer, or a new escaping scheme. `getPageForSubmission`'s type is widened, not duplicated (research.md §5). |
| II. Stack-Native | The new `/form-retry` route is an ordinary Next.js App Router page, following the exact shape `/confirmation` already established for "a Route Handler needs to show a real rendered page after a POST." No new package. |
| III. Small, Reversible | Three phases below, each one commit, independently revertible; reverting Phase 3 alone (the route-handler wiring) restores today's generic-error-page behaviour with zero effect on Phases 1–2's new files just sitting unused. |
| IV. Working Software Over Ceremony | The flash store (new logic with real edge cases — TTL, single-use, cap) gets unit tests mirroring `rate-limit.test.ts`; the redirect round-trip (a user-facing flow with real compliance stakes per FR-038) gets a Playwright e2e test, not manual-only verification. |
| V. Quality the User Feels | This feature exists entirely to fix a quality gap a real visitor feels (losing their input on one typo) — SC-001/SC-002 are the acceptance bar. No new UI surface beyond what `LeadForm` already renders (no new component to accessibility-certify); `/form-retry` reuses `PageShell` so the page keeps its existing accessible structure. |

Gate: **PASS**. No complexity-tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/009-lead-form-error-recovery/
├── plan.md                                  # this file
├── research.md                              # Phase 0 output
├── quickstart.md                            # Phase 1 output
└── contracts/
    └── lead-intake-validation-response.md   # Phase 1 output
```

No `data-model.md` — no schema/entity change (spec.md's Key Entities
section already notes this; matches the `002-security-hardening`
precedent of omitting the file entirely rather than leaving it empty).

### Source Code (repository root)

```text
apps/web/src/lib/form-error-store.ts          # new — bounded/swept in-memory flash store (research.md §2)
apps/web/src/lib/payload-client/index.ts      # getPageForSubmission return type widened to full PublishedPage (research.md §5)
apps/web/src/app/api/leads/route.ts           # validation-failure branch (today's lines ~139-156): build fieldErrors map, write flash record, 303 redirect to /form-retry — every other branch unchanged
apps/web/src/components/page-shell.tsx        # + optional formValues/formErrors props, threaded into <LeadForm values errors />
apps/web/src/app/(form-retry)/form-retry/page.tsx   # new — force-dynamic; consumes the flash record, re-renders PageShell, fresh form token, <Tagging extraEvent="lead_form_submit_error" />; graceful fallback per research.md §4
apps/web/src/components/lead-form.tsx         # unchanged — values/errors props already exist
apps/web/tests/form-error-store.test.ts       # new — TTL, single-use, cap behaviour
apps/web/tests/api-leads.test.ts              # existing assertions on the old inline 422 body updated to assert the 303 redirect + flash-store write
apps/web/tests/e2e/form-error-recovery.spec.ts  # new — quickstart.md §1-§2, §4 as an e2e flow
```

**Structure Decision**: No new app or package; every change lands in
`apps/web`, following its established file layout (`lib/` for the new
store and the widened client function, a new route-group page mirroring
`(confirmation)/confirmation`, `components/page-shell.tsx` for the prop
threading). `apps/cms` is untouched — this feature is entirely about how
an existing, already-computed validation result is presented, not about
what's validated or how leads are stored.

## Phasing

Each phase = one commit, independently revertible.

### Phase 1 — Flash store + widened page fetch (no behaviour change yet)

- `apps/web/src/lib/form-error-store.ts`: `put(record) → token`,
  `take(token) → record | null` (single-use — deletes on read), TTL sweep
  + hard cap mirroring `rate-limit.ts`.
- `apps/web/src/lib/payload-client/index.ts`: `getPageForSubmission`'s
  return type widened to full `PublishedPage` (research.md §5) — no
  runtime/query change, existing callers unaffected.
- `apps/web/tests/form-error-store.test.ts`: put/take round-trip, expiry,
  single-use (a second `take` on the same token returns `null`), cap
  eviction.

Verify: `npm run test` (`apps/web`) green; no behaviour change to
`/api/leads` yet since nothing calls the new store.

### Phase 2 — `/form-retry` route + `PageShell` prop threading

- `apps/web/src/components/page-shell.tsx`: optional `formValues?:
  Record<string,string>` / `formErrors?: Record<string,string>` props,
  passed straight through to `<LeadForm values={formValues}
  errors={formErrors} />`.
- `apps/web/src/app/(form-retry)/form-retry/page.tsx`: `force-dynamic`;
  reads `err`/`page` search params, resolves the flash record (or falls
  back per research.md §4), renders `<Tagging .../>` +
  `<PageShell ... formValues formErrors />` with a freshly signed form
  token.
- Not yet reachable from `/api/leads` — buildable/testable in isolation by
  hitting `/form-retry` directly with a manually seeded flash record.

Verify: manual hit against a seeded record shows the repopulated form;
against a missing one shows the graceful fallback (quickstart.md §7).

### Phase 3 — Wire `/api/leads`'s validation-failure branch to redirect

- `apps/web/src/app/api/leads/route.ts`: replace the per-field-validation
  branch's `page(...)` call with: build `fieldErrors` (field name → French
  message, plus `"consent"`), write `{ pageId, values, fieldErrors }` to
  the flash store, `NextResponse.redirect('/form-retry?err=...&page=...',
  303)`. Every other branch (honeypot, timing, host, unpublished, rate
  limit, upstream, success) is untouched — confirmed by contracts/
  lead-intake-validation-response.md's explicit "unchanged" list.
- `apps/web/tests/api-leads.test.ts`: update the existing per-field-
  validation assertions to the new `303`/flash-store-write shape; add a
  values-preserved-across-fields case.
- `apps/web/tests/e2e/form-error-recovery.spec.ts`: quickstart.md §1, §2,
  §4 as a real browser flow (including the resubmission-after-error case).

Verify: full quickstart.md pass on the local stack.

## Risks

| Risk | Mitigation |
|---|---|
| The in-memory flash store doesn't survive a process restart or a future multi-instance deployment | Already an accepted, documented trade-off for the same reason `rate-limit.ts` accepts it (single-instance VPS deployment, per `apps/web/src/lib/rate-limit.ts`'s own header comment) — and this feature explicitly degrades gracefully (research.md §4) rather than erroring when the record is gone, so the failure mode is "visitor sees a blank form," not breakage. |
| A visitor double-submits or opens `/form-retry`'s link twice (e.g. via back/forward) | Single-use `take()` means the second hit always falls back to the graceful "blank form" path (research.md §4) — never stale or duplicated error state. |
| Widening `getPageForSubmission`'s return type surfaces a field `/api/leads` wasn't previously guarding against (e.g. treating `builder` as always present) | The function's actual runtime response was already the full document (§5) — only the TypeScript view changes, so this is a compile-time-safe widening, not a new runtime code path; `apps/web`'s typecheck catches any caller that assumed a narrower shape. |
| `/form-retry` becomes a second place `PageShell`/`Tagging` usage can drift out of sync with `[[...slug]]/page.tsx` | Both call sites use the same shared components with the same props shape (only the source of `formValues`/`formErrors`/token freshness differs) — no duplicated rendering logic to drift, matching `confirmation/page.tsx`'s existing precedent for the same kind of secondary route. |
| Losing the `reason` field on the error `dataLayer` event (research.md §6) breaks an existing GTM configuration that branches on it | Documented as a deliberate, scoped-out trade-off, not silently dropped; easy, isolated follow-up (widen `Tagging`'s `extraEvent` prop) if it proves to matter in practice — flagged here so it's a conscious choice the person running this plan can veto or fast-follow. |
