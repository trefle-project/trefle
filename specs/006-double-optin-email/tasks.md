---

description: "Task list for double opt-in confirmation email"
---

# Tasks: Double opt-in confirmation email

**Input**: Design documents from `/specs/006-double-optin-email/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included — the constitution requires an automated test for
custom Payload hooks/endpoints and business/domain logic (Principle IV),
matching 004/005's precedent.

**Organization**: Tasks are grouped by user story (spec.md) to enable
independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)

## Phase 1: Setup

- [X] T001 Confirm work continues directly on `main` (repo root), matching 003/004/005's established precedent (no long-lived feature branch) per the constitution's short-lived-branch allowance

## Phase 2: Foundational — `opt-in-emails` collection + field additions + migration

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — every story depends on the schema it lands.

- [X] T002 Create `apps/cms/src/collections/OptInEmails.ts` per data-model.md: `subject` (text, required), `body` (textarea, required; field-level `validate` rejects a value not containing the literal `{{confirmUrl}}`, per research.md §3), `language` (relationship to `languages`, required, `filterOptions: { isActive: { equals: true } }`); `admin: { group: "Content", useAsTitle: "subject", defaultColumns: ["subject", "language"] }`; `access` block identical in shape to `apps/cms/src/collections/Pages.ts` (`read: isStaffOrService`, `create`/`update`/`delete: isAdminOrEditor`) — no hooks in this task (US1 adds the delete guard)
- [X] T003 Register `OptInEmails` in `apps/cms/src/payload.config.ts`'s `collections` array
- [X] T004 [P] In `apps/cms/src/collections/Pages.ts`, add the `optInEmail` field to the `fields` array (sidebar-positioned, alongside `confirmationPage`): `{ name: "optInEmail", type: "relationship", relationTo: "opt-in-emails", filterOptions: ({ siblingData }) => ({ language: { equals: siblingData?.language } }), validate: async (value, { req, siblingData }) => {...} }` — the async validate loads the target `opt-in-emails` doc via `req.payload.findByID` and rejects (returns an error string) if its `language` doesn't equal `siblingData?.language` (research.md §4, FR-004); optional, no `required`
- [X] T005 [P] In `apps/cms/src/collections/Domains.ts`, add `senderName` (text, optional, e.g. "Trefle") and `senderEmail` (email, optional) fields, admin descriptions noting they're used for outgoing opt-in-confirmation email and fall back to the platform default when unset (FR-006/FR-007)
- [X] T006 [P] In `apps/cms/src/collections/Leads.ts`, add `optInConfirmedAt`: `{ name: "optInConfirmedAt", type: "date", admin: { readOnly: true, position: "sidebar", description: "When this lead confirmed via the double opt-in link; set once, never by staff." } }` — same shape as the existing `erasedAt` field; independent of `consentStatus` (FR-012)
- [X] T007 Run `payload generate:types` in `apps/cms` to regenerate `apps/cms/src/payload-types.ts` with the new collection/fields
- [X] T008 Run `payload migrate:create` in `apps/cms`; apply the generated migration as-is (research.md §10 — every new column is optional/nullable, no hand-editing needed this time, unlike 005)
- [X] T009 Apply the migration against the local dev database (`payload migrate`); via the REST API confirm: `GET /api/opt-in-emails` returns `[]`; spot-check at least 2 pre-existing pages, 1 domain, 1 lead — every new field is present and empty/unset, every other field is byte-for-byte unchanged
- [X] T010 `apps/cms` typecheck passes with the new collection/fields/regenerated types

**Checkpoint**: Foundation ready — every user story below can now build on a real `opt-in-emails` collection, a language-matched optional `pages.optInEmail`, optional `domains.senderName`/`senderEmail`, and `leads.optInConfirmedAt`.

---

## Phase 3: User Story 1 - Author a confirmation email (Priority: P1) 🎯 MVP

**Goal**: Staff can create, edit, and save a confirmation email — a subject, a body that must carry the `{{confirmUrl}}` placeholder, and a language — with nothing else in this feature required to exist yet.

**Independent Test**: Create a confirmation email in the admin, confirm saving without the placeholder is rejected and saving with it succeeds, independent of any page or lead.

### Tests for User Story 1

- [X] T011 [P] [US1] Create `apps/cms/tests/optin-emails-lifecycle.test.ts`: deleting an `opt-in-emails` document referenced by a page's `optInEmail` is rejected, naming that page; deleting one nothing references succeeds

### Implementation for User Story 1

- [X] T012 [US1] Create `apps/cms/src/hooks/optin-emails-lifecycle.ts`, exporting `preventDeleteIfReferenced` (`CollectionBeforeDeleteHook`): `find` on `pages` where `optInEmail` equals the deleted id (`limit: 5, depth: 0, overrideAccess: true`); if any match, `throw new APIError` naming the referencing page(s) — same pattern as `apps/cms/src/hooks/pages-confirmation-guard.ts`'s `confirmationGuardOnDelete` and 005's `languages-lifecycle.ts` (research.md §9)
- [X] T013 [US1] Wire the hook into `apps/cms/src/collections/OptInEmails.ts`'s `hooks: { beforeDelete: [preventDeleteIfReferenced] }`
- [X] T014 [US1] Manual verification per quickstart.md §2 on the local stack: saving a confirmation email without `{{confirmUrl}}` in the body is rejected (T002's field-level validate); saving one with it succeeds

**Checkpoint**: Confirmation-email content can be authored and safely managed, fully independent of everything downstream.

---

## Phase 4: User Story 2 - Attach a confirmation email to a page (Priority: P1)

**Goal**: An editor can select a confirmation email for a subscription page, restricted to the page's own language; a page with none attached keeps behaving exactly as today.

**Independent Test**: Attach a confirmation email to a page and confirm the selection saves; confirm attaching one in a different language is rejected; confirm a page with none attached is completely unaffected.

### Tests for User Story 2

- [X] T015 [P] [US2] Create `apps/cms/tests/pages-optin-email.test.ts`: call `Pages.ts`'s `optInEmail` field's `validate` function directly (mocked `req.payload.findByID`) — rejects when the target opt-in email's `language` differs from `siblingData.language`; accepts when they match; accepts `undefined`/unset (field is optional)

### Implementation for User Story 2

*(The `optInEmail` field itself, its `filterOptions`, and its async `validate` were delivered in Phase 2 — T004. This story's remaining work is proving its acceptance scenarios end to end.)*

- [X] T016 [US2] Manual verification per quickstart.md §3 on the local stack: attaching a mismatched-language opt-in email to a page is rejected via the REST API (not just filtered out of the admin picker); attaching a matching one succeeds; a page left with `optInEmail` unset produces no email on submission (proven fully in User Story 3, referenced here)

**Checkpoint**: Every subscription page can be explicitly, correctly linked to its own confirmation email — or left alone with zero behavior change.

---

## Phase 5: User Story 3 - A submission triggers the confirmation email (Priority: P1)

**Goal**: Submitting the lead form on a page with a confirmation email attached sends it via Brevo/SMTP, from the page's domain's sender identity (or the platform default), with a working confirmation link — and the visitor's own experience is unchanged.

**Independent Test**: Submit the lead form on a page with a confirmation email attached and confirm an email arrives (Mailpit in dev), addressed and signed correctly, independent of what happens after the link is clicked.

### Tests for User Story 3

- [X] T017 [P] [US3] Extend `apps/cms/tests/lead-intake.test.ts`: when the submitted page's `optInEmail` resolves to a document, `payload.sendEmail` is called with `to` = the submitted email, `subject`/`html` from the opt-in email (placeholder substituted with a `/confirm?token=...` URL), and `from` built from the page's domain's `senderName`/`senderEmail`; when the domain has no sender identity, `from` is `undefined` (falls back to the adapter default); when `optInEmail` is unset, `payload.sendEmail` is never called; when `sendEmail` rejects, the endpoint's response is unaffected (still 200, lead still created)

### Implementation for User Story 3

- [X] T018 [US3] In `apps/cms/src/endpoints/leadIntake.ts`, add a local `confirmUrl(leadId, domainHostname)` helper mirroring the existing `unsubscribeUrl()` exactly (own inline HMAC, `CONFIRM_TOKEN_SECRET`, same `.localhost` → http / else https scheme rule) — per contracts/optin-email-send.md and research.md §6
- [X] T019 [US3] In the same file, after the lead + consent record are created: if `page.optInEmail` resolves to an object, build `from` from `page.domain`'s `senderName`/`senderEmail` (undefined if neither set), call `await payload.sendEmail({ to: body.email, from, subject: page.optInEmail.subject, html: page.optInEmail.body.replaceAll("{{confirmUrl}}", confirmUrl(...)) })` inside a try/catch that only logs on failure (contracts/optin-email-send.md, FR-008) — depends on T018
- [X] T020 [US3] Manual verification per quickstart.md §4 on the local stack: submit a page with an opt-in email attached and a domain sender identity set — confirm the email in Mailpit, `From` matches; clear the domain's sender identity, submit again — email still arrives from the platform default; make SMTP unreachable, submit again — lead still created successfully

**Checkpoint**: The confirmation email reliably goes out, and a delivery problem can never take the visitor-facing submission down with it.

---

## Phase 6: User Story 4 - Clicking the link records the confirmation (Priority: P1)

**Goal**: Visiting a valid confirmation link records, on the lead, that and when it was confirmed; a repeat visit is harmless; an invalid link fails neutrally.

**Independent Test**: Generate a confirmation link for a known lead (via the signing helper), visit it, and check the lead's record — independent of an email having actually been delivered.

### Tests for User Story 4

- [X] T021 [P] [US4] Extend `apps/web/tests/tokens.test.ts`: add `CONFIRM_TOKEN_SECRET` to the `beforeAll` env setup; `signConfirmToken`/`verifyConfirmToken` round-trip a fresh token; a tampered signature is rejected — mirrors this file's existing `signUnsubscribeToken`/`verifyUnsubscribeToken` cases
- [X] T022 [P] [US4] Create `apps/cms/tests/leads-confirm.test.ts`: a known `leadId` with `optInConfirmedAt` unset gets it set and returns `{ ok: true }`; a `leadId` that already has `optInConfirmedAt` set returns `{ ok: true }` without a second write (assert `payload.update` not called again); an unknown `leadId` returns `{ ok: true }` (non-enumerating, no error); a non-service/staff caller gets `403`; a missing `leadId` gets `400` — mirrors `apps/cms/tests/`'s existing `consent-withdraw`-style test shape

### Implementation for User Story 4

- [X] T023 [US4] In `apps/web/src/lib/tokens.ts`, add `signConfirmToken(leadId: string)` and `verifyConfirmToken(token: string)`, byte-for-byte the same shape as the existing `signUnsubscribeToken`/`verifyUnsubscribeToken` pair (deterministic HMAC of `leadId`, `CONFIRM_TOKEN_SECRET`, no expiry) — research.md §6
- [X] T024 [US4] Create `apps/cms/src/endpoints/leadsConfirm.ts`: `POST /api/leads-confirm`, `{ leadId }`, service-or-staff auth (reuse `consentWithdraw.ts`'s `isServiceOrStaff` shape), idempotent — sets `leads.optInConfirmedAt` to now only if currently unset, always responds `{ ok: true }` (contracts/confirm-route.md) — depends on T006
- [X] T025 [US4] Register `leadsConfirmEndpoint` in `apps/cms/src/payload.config.ts`'s top-level `endpoints` array, alongside `consentWithdrawEndpoint` — depends on T024
- [X] T026 [US4] Create `apps/web/src/app/confirm/page.tsx`, mirroring `apps/web/src/app/unsubscribe/page.tsx`'s exact structure: `verifyConfirmToken` gates a neutral invalid-link message vs. a "Confirmer" button/Server Action; the Server Action calls `POST /api/leads-confirm` with the verified `leadId` (via `CMS_API_URL`/`CMS_SERVICE_API_KEY`, same fetch shape `unsubscribe/page.tsx` already uses) and redirects to a `?done=1` success message — depends on T023, T025
- [X] T027 [US4] Manual verification per quickstart.md §5 on the local stack, in a real browser (matching 005's Playwright precedent): visit a freshly generated `/confirm?token=...` link — confirms, `optInConfirmedAt` now set via REST; visit the same link again — succeeds identically, timestamp unchanged; visit `/confirm?token=garbage` — neutral failure page

**Checkpoint**: The double opt-in loop is closed — a lead's click is durably recorded, exactly once, without ever revealing anything to an invalid request.

---

## Phase 7: User Story 5 - Staff can see who confirmed (Priority: P2)

**Goal**: Staff can see each lead's confirmation status/time in the admin list and CSV export.

**Independent Test**: Confirm a lead (User Story 4), then check it's visible in the leads list/export — independent of every other story except needing something to display.

### Tests for User Story 5

- [X] T028 [P] [US5] Extend `apps/cms/tests/leads-export.test.ts`: the exported CSV's header row includes `optInConfirmedAt`; a confirmed lead's row includes its timestamp in the matching column; an unconfirmed lead's cell is empty

### Implementation for User Story 5

- [X] T029 [US5] In `apps/cms/src/collections/Leads.ts`, add `"optInConfirmedAt"` to `admin.defaultColumns`
- [X] T030 [US5] In `apps/cms/src/endpoints/leadsExport.ts`, add `"optInConfirmedAt"` to `HEADERS` and `d.optInConfirmedAt` to the per-row `csvRow([...])` call, in matching position
- [X] T031 [US5] Manual verification per quickstart.md §6 on the local stack: confirmation-time column visible in the Leads admin list; present and correct in the CSV export

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T032 Run `npm run lint` and `npm run typecheck` for `apps/cms` **and** `apps/web`; fix any fallout from T002–T031
- [X] T033 Run `apps/cms`'s and `apps/web`'s test suites and confirm every new/extended test from T011, T015, T017, T021, T022, T028 passes alongside the full existing suite (nothing from 001–005 regressed) — specifically re-confirm `leads-export.test.ts`'s `consentedOnly` assertions, `retention.test.ts`, and `dsr.test.ts` are unmodified and still green (FR-012's real proof)
- [X] T034 ~~note it in infra/deploy/README.md's secrets checklist~~ — **adjusted**: that README has no per-secret enumeration to add a line to; it generically says "replace every value in infra/.env" and points to `infra/.env.example` (already updated) as the source of truth. Done: `CONFIRM_TOKEN_SECRET` added to `infra/.env.example` (empty), `infra/.env` (real dev value), `apps/cms/.env.local`/`apps/web/.env.local` (same dev value, matching `UNSUBSCRIBE_SECRET`'s pattern), and passthrough added to both services in `infra/docker-compose.yml`
- [X] T035 Walk `quickstart.md` end to end (§1-§7) on the local stack and record the outcome of each section in the final commit/PR body, per the constitution's "manual verification steps MUST be written in the commit or PR body"; confirm every pre-existing page/domain/lead still renders/edits/exports exactly as before, aside from the new (empty) fields

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS every user story
- **User Stories (Phase 3-7)**: All depend on Foundational. Among themselves:
  - US1 (Phase 3) has no dependency on the others
  - US2 (Phase 4) has no dependency on US1, US3, US4, or US5
  - US3 (Phase 5) depends on US1 (Phase 3) having produced at least one confirmation email to attach, and US2 (Phase 4) having attached it — implement in that order, though T017-T020's *code* only strictly needs Phase 2's schema
  - US4 (Phase 6) depends on US3 (Phase 5) having actually sent a link to click, for its manual verification (T027) to have something real to test against — the code itself (T023-T026) has no hard dependency beyond Phase 2
  - US5 (Phase 7) is most meaningfully verified once US4 (Phase 6) has produced at least one confirmed lead — same relationship 005 had between its own US3 and US5
- **Polish (Phase 8)**: Depends on all five stories being complete

### Within Each User Story

- Tests are written alongside their implementation task, per the constitution's "test-first is NOT required"
- A story's Implementation tasks before its own manual-verification task

### Parallel Opportunities

- T004, T005, T006 (the three field additions, Phase 2) — different files, all [P]
- T011 (US1) and T015 (US2) can run in parallel once Phase 2 lands — different files
- T021 and T022 (US4 tests, different apps entirely) — [P]
- Once Phase 2 completes: US1 (Phase 3) and US2 (Phase 4) can proceed in parallel; US3 (Phase 5) is best sequenced after both (it exercises both together end to end), though its own code has no hard file dependency on either

---

## Parallel Example: after Phase 2

```bash
# Once Foundational (Phase 2) is done, these can run together:
Task: "Create apps/cms/src/hooks/optin-emails-lifecycle.ts (US1, T012-T013)"
Task: "Create apps/cms/tests/pages-optin-email.test.ts (US2, T015)"
```

---

## Implementation Strategy

### MVP First (User Stories 1-4, all P1)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks everything)
3. Complete Phase 3: User Story 1 (content authorable)
4. Complete Phase 4: User Story 2 (attachable to a page, language-matched)
5. Complete Phase 5: User Story 3 (email actually sends)
6. Complete Phase 6: User Story 4 (click gets recorded) — **the original ask,
   "un lien de confirmation pour valider un double optin qui sera saisi
   dans la table des leads," is fully delivered here**
7. **STOP and VALIDATE**: quickstart.md §1-§5 end to end
8. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → schema ready
2. US1 → confirmation emails authorable on their own
3. US2 → pages provably attachable/language-matched
4. US3 → the email actually goes out (**the visible feature, to an
   outside observer**)
5. US4 → the click loop closes (**MVP complete** — matches the original
   request's own wording)
6. US5 → staff can actually use the recorded data day to day
7. Polish → full-suite confidence + PR verification record

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- This feature builds directly on 005-content-language-tagging: `languages`
  (opt-in email language), `pages.language` (the match check), nothing
  here introduces a second language mechanism
- Commit after each task or logical group; each of the 8 phases above is a
  natural commit boundary, matching 004/005's one-phase-per-commit
  precedent
