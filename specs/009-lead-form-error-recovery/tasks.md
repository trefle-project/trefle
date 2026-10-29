---

description: "Task list for Lead form error recovery"
---

# Tasks: Lead form error recovery

**Input**: Design documents from `/specs/009-lead-form-error-recovery/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included — plan.md already commits to Vitest units (flash
store) + updated/new Vitest and Playwright coverage for the redirect
round-trip, matching the constitution's Principle IV requirement for
business logic and a user-facing, compliance-relevant flow.

**Organization**: Tasks are grouped by user story (spec.md) to enable
independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)

## Phase 1: Setup

- [X] T001 Confirm work continues directly on `main` (repo root), matching 003/004/005/006/007/008's established precedent (no long-lived feature branch) per the constitution's short-lived-branch allowance

---

## Phase 2: Foundational — flash store + widened page fetch

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — both stories render through the route this phase makes possible.

- [X] T002 [P] Create `apps/web/src/lib/form-error-store.ts`: `put(record: { pageId: string; values: Record<string,string>; fieldErrors: Record<string,string> }): string` (returns a random opaque token) and `take(token: string): typeof record | null` (single-use — deletes the entry on read), backed by a bounded/swept in-memory `Map` mirroring `apps/web/src/lib/rate-limit.ts`'s existing pattern (hard key cap, opportunistic sweep of expired entries on each call, no background timer); 5-minute TTL (research.md §2) — *(real bug found live in T007's e2e run against the built Docker image, invisible to unit tests since Vitest imports the module once: Next.js's App Router bundles `/api/leads` (Route Handler) and `/form-retry` (Page) as separate server chunks, each instantiating its own copy of an ordinary module — a plain `const store = new Map()` here silently became two disconnected stores, so `put()` from one route was invisible to `take()` from the other. Fixed by keying the `Map` off `globalThis` instead of module scope — the one thing guaranteed shared across every chunk in the same Node.js process. `rate-limit.ts` never hit this because it's only ever imported from the one route that uses it — this is the first module in this codebase shared across two different route entry points)*
- [X] T003 [P] In `apps/web/src/lib/payload-client/index.ts`, widen `getPageForSubmission`'s return type from `Pick<PublishedPage, "id" | "status" | "form" | "language">` to the full `PublishedPage` (research.md §5) — no change to the fetch call itself (no `select` param is set today, so the full document is already returned over the wire; only the TypeScript view changes)
- [X] T004 [P] Create `apps/web/tests/form-error-store.test.ts`: `put` then `take` returns the same record; a second `take` on the same token returns `null` (single-use); a token requested after the TTL window returns `null`; putting past the key cap evicts before growing unbounded (mirrors `rate-limit.test.ts`'s style)
- [X] T005 `apps/web` typecheck passes with the widened `getPageForSubmission` return type — confirm no existing caller assumed the narrower `Pick<>` shape

**Checkpoint**: Foundation ready — the flash store and full-page fetch both work in isolation; nothing calls them from a real route yet, so `/api/leads`'s current behaviour is still completely unchanged.

---

## Phase 3: User Story 1 - Visitor fixes one field without retyping the rest (Priority: P1) 🎯 MVP

**Goal**: A validation failure on one field redirects to the visitor's own landing page with every other field's value preserved and an inline error only next to the field(s) at fault.

**Independent Test**: On a published page with a multi-field form, submit with one required field left blank and the rest filled in; confirm the response shows the same landing page with all other fields still filled in and only the blank field marked as an error; correct it and resubmit to confirm a normal successful submission.

### Tests for User Story 1

- [X] T006 [P] [US1] Extend `apps/web/tests/api-leads.test.ts`: a submission with one required field missing now returns a `303` to `/form-retry?err=...&page=...` (not the old inline `422` body) and a flash record exists under that `err` token containing every other submitted field's original value plus a `fieldErrors` entry for exactly the missing field; repeat for an invalid email and for missing consent, asserting the error lands on `"email"`/`"consent"` respectively — *(also added a single-use/replay test and, since the old direct-body escaping test no longer applies (the route redirects, it no longer builds HTML), moved that guarantee to page-shell.test.tsx's new "escapes a value/label that looks like markup" case, which is where escaping actually happens now — research.md §3)*
- [X] T007 [P] [US1] Create `apps/web/tests/e2e/form-error-recovery.spec.ts` (Playwright): fill every field of a multi-field form correctly except one required text field, submit; confirm the response is the same page with every other field's typed value still present and an inline error only next to the blank field; correct that field and resubmit; confirm it succeeds exactly as a first-attempt submission would (confirmation page or success message) — quickstart.md §1 — *(ran live against the docker stack; found and fixed a real cross-route in-memory-store bug along the way — see the note at the top of Phase 2/T002 below)*

### Implementation for User Story 1

- [X] T008 [US1] In `apps/web/src/components/page-shell.tsx`, add optional `formValues?: Record<string,string>` and `formErrors?: Record<string,string>` props to `PageShell`, passed straight through to `<LeadForm values={formValues} errors={formErrors} />` (both already-supported props on `LeadForm` — no change needed there)
- [X] T009 [US1] Create `apps/web/src/app/(form-retry)/form-retry/page.tsx`: `export const dynamic = "force-dynamic"`; reads `err`/`page` from `searchParams`; calls `take(err)` (T002) — if the record exists and `record.pageId === page`, fetch the full page via `getPageForSubmission(page)` (T003) and render `<PageShell page={page} formToken={signFormToken(page)} formValues={record.values} formErrors={record.fieldErrors} />` — depends on T002, T003, T008
- [X] T010 [US1] In the same file, the graceful-degradation branch (research.md §4): when the record is missing, expired, or its `pageId` doesn't match `page`, resolve `page` alone via `getPageForSubmission` — if it resolves to a live published page, redirect (`307`) to that page's own normal path (`domain`+`path`, fresh blank form); if it doesn't resolve at all, render a minimal inline fallback message mirroring `(confirmation)/confirmation/page.tsx`'s existing `fallbackPage()` helper — depends on T009 — *(used Next's `redirect()`, which issues its own default 307)*
- [X] T011 [US1] In `apps/web/src/app/api/leads/route.ts`, replace the per-field-validation branch (today's `errors: string[]` block and its `page(...)` call): build `fieldErrors: Record<string,string>` keyed by field `name` (plus `"consent"` for the consent-control failure) instead of the flat list; on any entry, call `put({ pageId, values, fieldErrors })` (T002) with the submitted field values (excluding `formToken`, `hp_check`) and `NextResponse.redirect(`/form-retry?err=${token}&page=${pageId}`, 303)` in place of the old `page(...)` response — every other branch (honeypot, timing, unknown host, unpublished, rate limit, upstream-unavailable, success) is untouched, per contracts/lead-intake-validation-response.md's explicit "unchanged" list — depends on T002 — *(also extracted `requestOrigin(req)`, reused by the pre-existing `/confirmation` redirect, replacing its inline duplicate of the same host/scheme logic)*
- [X] T012 [US1] Run T006/T007 to green; run the full `apps/web` suite to confirm every unchanged branch (honeypot, timing, host, unpublished, rate limit, upstream, success) still behaves exactly as before — *(104/104 tests, 17/17 files, typecheck + lint clean; T007 e2e still pending)*

**Checkpoint**: At this point User Story 1 is fully functional and independently testable — a visitor no longer loses their input on one bad field. This is the shippable MVP.

---

## Phase 4: User Story 2 - The rest of the page still works around the repopulated form (Priority: P2)

**Goal**: The page shown on a validation failure is the visitor's real page — surrounding content and GTM tagging render exactly as they would on a normal load.

**Independent Test**: Trigger a validation error on a page with content before and after the form block, and confirm that content renders identically to a normal page view (images, styles, GTM tagging) with only the form section reflecting the error state.

*(Surrounding-content fidelity — spec.md US2 Acceptance Scenario 1 — is already delivered by Phase 3, since `/form-retry` renders the real page through `PageShell`, the same component and pipeline `[[...slug]]/page.tsx` uses. This phase's remaining work is GTM/tagging parity, matching `007-gtm-tagging`'s own Phase 4 precedent for a story whose mechanics another phase already exercises.)*

### Tests for User Story 2

- [X] T013 [P] [US2] Extend `apps/web/tests/e2e/form-error-recovery.spec.ts`: on a page with content blocks before and after the lead-form block, trigger a validation failure and assert that content outside the form matches a normal page load (quickstart.md §3) — *(covered by the `<h1>` heading-text assertion in the first test — the seeded fixture page's only surrounding content — rather than a separate test; a dedicated GTM-domain test was deliberately not added here, see T014)*
- [X] T014 [P] [US2] Same file: with GTM configured for the domain, view source of the `/form-retry` response and assert the Consent Mode default-deny script and GTM snippet are both present, consistent with a normal page load (quickstart.md §3) — *(not automated in this file: `gtm-consent.spec.ts`'s own header comment documents that multiple spec files mutating the shared fixture domain's `gtmContainerId`/`consentBannerEnabled` already caused real flakiness. Instead extended `gtm-consent.spec.ts`'s own existing "a rejected submission pushes lead_form_submit_error" test — it already owns that domain state — which caught a real bug: see T015's note)*

### Implementation for User Story 2

- [X] T015 [US2] In `apps/web/src/app/(form-retry)/form-retry/page.tsx`, resolve `domain` via `resolveDomain()` (same call `[[...slug]]/page.tsx` makes) and render `<Tagging domain={domain} language={resolveBannerLanguage(...)} path={page.path} formPageId={String(page.id)} extraEvent={{ event: "lead_form_submit_error", reason }} />` above `<PageShell>` — depends on T009 — *(deviation from the original plan: `extraEvent` was widened from a bare string to `string | { event, reason? }`, and the script now also emits `path`/`formPageId` on that push. A first pass kept `extraEvent` bare per research.md §6's original text — `gtm-consent.spec.ts`'s existing "non-personal reason" test caught live that `contracts/datalayer-events.md` (007) already requires `reason`/`path`/`formPageId` on `lead_form_submit_error`, so the bare version was a real contract regression, not an acceptable gap; research.md §6 was corrected accordingly)*
- [X] T016 [US2] Manual verification per quickstart.md §3 on the local stack — *(confirmed live: the fixture domain has `consentBannerEnabled: true` by default, so /form-retry's response already includes the Consent Mode default-deny script + CookieConsentBanner in its RSC payload, verified via direct curl; full GTM-container-present case covered by gtm-consent.spec.ts:227, per T014's note)*

**Checkpoint**: Both user stories now independently functional — values/errors preserved (US1) and the page they're shown on is indistinguishable from a normal load (US2).

---

## Final Phase: Polish & Cross-Cutting Concerns

- [X] T017 [P] Manual verification of quickstart.md §4 (anti-bot token still works after a real correction — resubmit a couple of seconds after seeing the error, confirm no spurious timing rejection) — *(confirmed by `form-error-recovery.spec.ts`'s first e2e test: corrects the field, waits FILL_TIME (2.2s), resubmits, succeeds)*
- [X] T018 [P] Manual verification of quickstart.md §6 (honeypot, anti-bot timing, unknown host, unpublished page, and rate-limited submissions all still return their existing, unchanged responses — none redirect to `/form-retry`) — *(covered by `api-leads.test.ts`'s unchanged honeypot/timing/host/unpublished/rate-limit assertions, all still passing — 104/104)*
- [X] T019 Manual verification of quickstart.md §5: submit with a distinctive, greppable email in a field that fails validation; confirm the redirect `Location` header contains neither that email nor any other submitted value, and grep the app's log for it to confirm no match — *(this dev stack has no Caddy in front, so checked the `web` container's own structured logs instead of a reverse-proxy access log — same guarantee: `docker compose logs web \| grep <test-email>` → zero matches; curl-verified the `Location` header directly too: only `err=<opaque-token>` and `page=<id>`)*
- [X] T020 Manual verification of quickstart.md §7: restart the `web` container between triggering a validation failure and following the redirect (simulating a lost flash record); confirm the graceful fallback (blank form, or the minimal message for a since-deleted page) rather than an error — *(simulated via a bogus/missing `err` token rather than an actual container restart — same code path — via curl: bogus token + valid `page` → 307 to the page's own path; invalid/missing `page` → the minimal fallback message; all 4 combinations verified)*
- [X] T021 Full `apps/web` typecheck + lint + test suite green; re-run the existing e2e suite (`us1-capture.spec.ts`, `a11y.spec.ts`, `gtm-consent.spec.ts`) to confirm no regression to the unrelated flows they cover — *(104/104 unit tests, typecheck clean, lint clean, full e2e suite 30/30 passed with 1 pre-existing unrelated skip, single-worker to rule out cross-file rate-limit collisions)*

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS both user stories (neither can render `/form-retry` without the flash store and the widened page fetch)
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational **and** on `/form-retry` existing (T009, from Phase 3) — it adds `<Tagging>` to the same file rather than creating a new one, so it cannot start before T009 lands, even though its spec-level acceptance criteria are otherwise independent of US1's
- **Polish (Final Phase)**: Depends on both user stories being complete

### Within Each User Story

- Tests (T006/T007, T013/T014) should be written before the implementation tasks they cover and confirmed to fail first, per the constitution's test-first expectation for user-facing flows
- `page-shell.tsx` (T008) before `/form-retry` (T009), since T009 uses the new props
- `/form-retry`'s happy path (T009) before its fallback branch (T010) and before `/api/leads`'s redirect wiring (T011), so there's something real to redirect to
- Story complete (checkpoint) before moving to the next priority

### Parallel Opportunities

- T002/T003/T004 (Phase 2) touch different files and can run in parallel
- T006/T007 (US1 tests) can run in parallel with each other, and with T008 (different files) — but must land before T009-T011 are considered done
- T013/T014 (US2 tests) can run in parallel with each other

---

## Parallel Example: Phase 2 (Foundational)

```bash
Task: "Create apps/web/src/lib/form-error-store.ts"
Task: "Widen getPageForSubmission's return type in apps/web/src/lib/payload-client/index.ts"
Task: "Create apps/web/tests/form-error-store.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational)
2. Complete Phase 3 (User Story 1) — values and inline errors preserved on the redirect
3. **STOP and VALIDATE**: run quickstart.md §1-§2 on the local stack
4. This alone is shippable: it already replaces the old generic error page

### Incremental Delivery

1. Setup + Foundational → foundation ready, no behaviour change yet
2. User Story 1 → MVP: no more lost input on a validation failure
3. User Story 2 → the error page becomes indistinguishable from a normal load (tagging parity)
4. Final Phase → the privacy/log-exposure and graceful-degradation guarantees this feature depends on are explicitly re-verified, not just assumed from the design

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Commit after each task or logical group, per the constitution's small-reversible-commits principle — this maps directly onto plan.md's three phases (T002-T005 ≈ Phase 1 of plan.md, T006-T012 ≈ Phase 2+3, T013-T016 ≈ the tagging half of Phase 3)
