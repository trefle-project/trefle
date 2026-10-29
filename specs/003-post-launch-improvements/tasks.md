---

description: "Task list for feature implementation"
---

# Tasks: Post-launch debugging & improvements (phase 1)

**Input**: Design documents from `specs/003-post-launch-improvements/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included per the project constitution (`.specify/memory/constitution.md`
Principle IV), which mandates an automated test for business/domain logic,
access-control rules, custom Payload hooks/endpoints, the lead-capture API,
cache-invalidation logic, and any code path that has had a bug (regression
test ships with the fix) — every item in this feature falls in one of those
buckets. Test-first is not required (constitution Principle IV); tests below
are listed with their implementation, not gated ahead of it.

**Organization**: Tasks are grouped by user story from spec.md, in the order
plan.md's phasing already established (each still its own independently
revertible commit, per plan.md's "Phasing").

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US6 map to spec.md's six user stories, in priority order
- Exact file paths are included in every task

---

## Phase 1: Setup

**Purpose**: Branch and edge-config groundwork shared by later phases; no
product code yet.

- [X] T001 Create branch `003-post-launch-improvements` off `main` (repo root), per the constitution's short-lived-branch convention
- [X] T002 [P] Add `ADMIN_ALLOWED_IPS` (space-separated CIDR list, no default — must fail closed when unset) to `infra/.env.example`, with a one-line comment pointing at the rationale
- [X] T003 [P] Add an "IP allow-list for the admin" note to `infra/deploy/README.md`'s existing secrets/checklist section, referencing `ADMIN_ALLOWED_IPS` and the fail-closed behaviour

**Checkpoint**: branch exists; env var documented. No behaviour change yet.

---

## Phase 2: Foundational — deliberate body-size limit (blocks nothing, but touches shared save path all later phases exercise)

**Purpose**: FR-007/SC-007 — land the 500 KB limit early since Phases for
US3, US5, and the republish-reliability tests in US2 all save pages through
this same path.

- [X] T004 In `apps/cms/src/payload.config.ts`, change `bodyParser: { limits: { fieldSize: 10 * 1024 * 1024 } }` to `bodyParser: { limits: { fieldSize: 500 * 1024 } }` and rewrite the adjacent comment to state the 500 KB rationale from research.md §6 (JSON-only field; images excluded; `builderField`'s own 200 000-char html/css caps already bound the realistic size)
- [X] T005 In `apps/cms/next.config.mjs`, change `serverActions: { bodySizeLimit: "10mb" }` to `serverActions: { bodySizeLimit: "500kb" }` and update its comment to match T004's rationale and cross-reference `payload.config.ts`
- [X] T006 [P] Add a regression test in `apps/cms/tests/env.test.ts` (or a new `apps/cms/tests/body-size-limit.test.ts` if that file is a poor fit) asserting a page save whose serialized `builder` payload exceeds 500 KB is rejected with a clear error rather than a raw 500

**Checkpoint**: admin saves now enforce 500 KB; existing seeded pages still save fine (verify manually per quickstart.md §6 before continuing).

---

## Phase 3: User Story 1 - Close the deferred security findings (Priority: P1) 🎯 MVP

**Goal**: Close all six findings 002 explicitly deferred: X-Forwarded-For
rate-limit bypass, reflected XSS, stored XSS via editor HTML, no admin
network control, an unbounded shared rate-limit store, and preview links that
never expire.

**Independent Test**: per spec.md's User Story 1 — for each finding, a
targeted repro (spoofed header, crafted reflected input, an editor-submitted
`<script>` block, an expired preview link, a login attempt from outside the
allow-list, a burst against the rate-limit store) fails the way it should;
the existing e2e suite still passes.

### X-Forwarded-For trust boundary (research.md §1)

- [X] T007 [US1] In `infra/deploy/Caddyfile`, add `header_up X-Real-IP {http.request.remote.host}` to the `{$WEB_HOSTNAMES}` block's `reverse_proxy web:3001` directive (Caddy owns/overwrites this header — it cannot be client-spoofed)
- [X] T008 [US1] In `apps/web/src/app/api/leads/route.ts`, replace the `ip` derivation (`req.headers.get("x-forwarded-for")` first hop) with: read `X-Real-IP` first; if absent, fall back to `X-Forwarded-For`'s **last** hop (never the first, client-controlled one)
- [X] T009 [P] [US1] Add a regression test to `apps/web/tests/api-leads.test.ts` asserting that a request carrying a forged `X-Forwarded-For` alongside a trusted `X-Real-IP` is rate-limited on the `X-Real-IP` value, and that varying the forged header alone does not reset the limit

### Reflected content escaping (research.md §2)

- [X] T010 [US1] Add an `escapeHtml()` helper (escaping `&`, `<`, `>`, `"`, `'`) near the top of `apps/web/src/app/api/leads/route.ts`
- [X] T011 [US1] Apply `escapeHtml()` to every request-influenced value interpolated by the `page()` helper: the validation-error list built from `errors` (field labels), and `backLink`'s `ref` (the `referer`-derived URL) — depends on T010
- [X] T012 [P] [US1] Add a regression test to `apps/web/tests/api-leads.test.ts` asserting a crafted field value/label containing `<script>`/`onerror=` is rendered as literal text in the validation-error response, not executable markup

### Stored XSS via editor-authored HTML (research.md §3)

- [X] T013 [US1] Add `isomorphic-dompurify` as a dependency of `apps/web` (`npm --workspace @trefle/web install isomorphic-dompurify`), justified per Principle II in the commit body (small, actively maintained, Node-safe build, closes a known-hard-to-hand-roll bug class)
- [X] T014 [US1] In `apps/web/src/components/page-shell.tsx`, sanitise `page.builder.html` with DOMPurify (allow-list covering GrapesJS's real output: divs/sections/headings/form-and-input elements for the `data-block="lead-form"` block, `class`/`id`/`style`/`data-*` attributes; strip `<script>`, `on*` handlers, `javascript:`/`data:` URLs in `href`/`src`) before it reaches `dangerouslySetInnerHTML` — depends on T013
- [X] T015 [P] [US1] Add a regression test (new `apps/web/tests/page-shell.test.ts` or extend an existing render test if one covers `page-shell.tsx`) asserting a `builder.html` fixture containing a `<script>` tag and an `onclick` handler renders with both removed while the `data-block="lead-form"` markup and ordinary block content survive intact
- [X] T016 [US1] Run `npm run test:e2e:docker` once T013–T015 land and confirm `apps/web/tests/e2e/us1-capture.spec.ts` (001's lead-form flow) still passes — the sanitiser allow-list must not strip anything the real lead-form block needs

### Preview link expiry (research.md §4)

- [X] T017 [US1] In `apps/web/src/lib/tokens.ts`, change `signPreviewToken`/`verifyPreviewToken` to embed an `issuedAt` in the signed body (mirroring `signFormToken`/`verifyFormToken`'s `${pageId}.${issuedAt}` pattern) and reject a token whose `issuedAt` is more than 24 hours in the past
- [X] T018 [P] [US1] Extend `apps/web/tests/tokens.test.ts` with cases: a freshly signed preview token verifies; the same token constructed with an `issuedAt` 24h + 1s in the past fails verification

### Admin login IP allow-list (research.md §12)

- [X] T019 [US1] In `infra/deploy/Caddyfile`, add to the `{$CMS_HOSTNAME}` block: `@notAllowed not remote_ip {$ADMIN_ALLOWED_IPS}` and `respond @notAllowed 403` before `reverse_proxy cms:3000`, so a blocked address never reaches Payload — depends on T002 (env var exists)
- [X] T020 [P] [US1] Verify with `docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml config` that the rendered Caddyfile contains the matcher and `403` response in the correct order (before `reverse_proxy`); record the command's output in the commit body as the "manual verification" the constitution requires

### Bound the shared rate-limit store (research.md §5)

- [X] T021 [US1] In `apps/web/src/lib/rate-limit.ts`, add a `MAX_KEYS` cap (e.g. 50 000) to the module-level `store`; on `hit()`, when the cap would be exceeded, evict expired entries first, then the oldest-by-insertion entry, before inserting
- [X] T022 [US1] In the same file, make `hit()` opportunistically sweep a bounded number of expired entries from `store` on each call (no new timer) so the store doesn't grow unbounded between cap-triggered evictions
- [X] T023 [P] [US1] Add a new `apps/web/tests/rate-limit.test.ts` asserting: (a) hammering `checkIpLimit`/`checkEmailPageLimit` with thousands of distinct synthetic keys keeps `store`'s size at or below `MAX_KEYS`; (b) rate limiting still functions correctly for keys near the cap boundary; use the existing `__resetRateLimits()` test helper to isolate cases

**Checkpoint**: all six 002-deferred findings closed; full e2e suite green; User Story 1 independently demonstrable via quickstart.md §1–5.

---

## Phase 4: User Story 2 - Editing a published page reliably republishes it (Priority: P1)

**Goal**: Saving an edit to an already-published page updates the public
site without any extra action, and a transient failure to do so is retried
and, if it still fails, loudly logged instead of silently dropped.

**Independent Test**: publish a page, edit and save it, confirm the public
URL serves the new content within 10 seconds without any other action,
repeated across restarts of the renderer to rule out a propagation gap
(spec.md SC-002: 20 consecutive cycles, zero misses).

- [X] T024 [US2] In `apps/cms/src/hooks/revalidate.ts`, wrap the existing single `fetch` call in a bounded retry loop — up to 3 total attempts with a short backoff between them, mirroring the deadline-loop pattern already used by `apps/web/src/app/api/leads/route.ts`'s `postLeadIntake` retry — total wall-clock budget MUST stay well under the 10-second bound in SC-002
- [X] T025 [US2] In the same file, change the final-failure log from `log.warn("revalidate non-2xx"...)` / `log.warn("revalidate request failed"...)` to `log.error(...)`, including `reason`, `tags`, and the response status/error, once all attempts are exhausted — depends on T024
- [X] T026 [US2] Confirm `pageRevalidate` in `apps/cms/src/hooks/pages-revalidate.ts` still calls `revalidateTags` as `void revalidateTags(...)` (fire-and-forget from the save's perspective) — no change needed here beyond verifying the invariant holds after T024/T025
- [X] T027 [US2] Add an admin-visible confirmation after saving a published page: create `apps/cms/src/components/RevalidationStatus.tsx` and wire it via `admin.components.edit.beforeDocumentControls: ["@/components/RevalidationStatus#default"]` on `apps/cms/src/collections/Pages.ts` (Payload's documented inject-slot before the Save/Publish controls), showing a warning when the best-effort revalidation call could not be confirmed instead of a bare "saved" with no further signal
- [X] T028 [P] [US2] Add a regression test to a new `apps/cms/tests/hooks/revalidate.test.ts`: mock `fetch` to fail on the first N attempts and succeed on a later one, asserting the retry recovers; mock `fetch` to fail on every attempt, asserting `log.error` is called with the page id/tags once attempts are exhausted
- [X] T029 [US2] Manual verification per quickstart.md §7: publish a page, edit and save it 20 times in a row, confirming the live URL updates every time within 10 seconds with no other action; once, briefly stop the `web` container mid-save to force a transient failure and confirm the retry (or the `error` log) catches it — record the result in the commit body

**Checkpoint**: republish reliability fixed and observable; independently demonstrable via quickstart.md §7.

---

## Phase 5: User Story 3 - An editable confirmation page with the unsubscribe link (Priority: P2)

**Goal**: A landing page can designate another page as its post-submission
confirmation experience, shown with the visitor's working unsubscribe link;
a landing page with none selected keeps today's generic message (FR-013).

**Independent Test**: select a confirmation page for a landing page, publish
both, submit the lead form, confirm the visitor sees the selected page's
content with a working personalised unsubscribe link; change the
confirmation page and resubmit to confirm the new content is used.

- [X] T030 [US3] In `apps/cms/src/collections/Pages.ts`, add a `confirmationPage` field: `{ name: "confirmationPage", type: "relationship", relationTo: "pages", admin: { position: "sidebar", description: "Optional; shown after a successful submission on this page. When unset, the generic message is used." } }` — per data-model.md, this field is **optional** and **not** enforced by `pages-publish-guard.ts` (Question 2 decision, FR-013)
- [X] T031 [US3] Run `payload migrate:create` in `apps/cms` to generate the Postgres migration for the new `confirmationPage` relationship field added in T030 (per constitution Principle III — every prior content-shape change in `apps/cms/src/migrations/` shipped its own migration); review the generated SQL and commit it alongside T030 — depends on T030
- [X] T032 [US3] In `apps/cms/src/endpoints/leadIntake.ts`, resolve `page.confirmationPage` (already available at `depth: 1`) and add it to the success response as `confirmationPage: { id, path, domain: { hostname } }` when set, per `contracts/lead-intake-confirmation.md` — omit the key entirely when unset — depends on T031
- [X] T033 [US3] In `apps/web/src/lib/payload-client/index.ts`, extend the `postLeadIntake` return type with the optional `confirmationPage` shape from T032
- [X] T034 [US3] In `apps/web/src/app/api/leads/route.ts`, when the intake response includes `confirmationPage`: call `getPublishedPage(domain.id, confirmationPage.path)`, render it through `PageShell` (same as `apps/web/src/app/[[...slug]]/page.tsx` does), and replace every literal `{{unsubscribeUrl}}` occurrence in the rendered HTML with the real `unsubscribeUrl`; if that lookup returns null (deleted/unpublished since selection), fall back to today's generic message unchanged — depends on T033
- [X] T035 [P] [US3] Extend `apps/cms/tests/pages-publish-guard.test.ts` (or add `apps/cms/tests/pages-confirmation.test.ts`) asserting a page with no `confirmationPage` set still publishes successfully — the field is confirmed non-blocking
- [X] T036 [P] [US3] Extend `apps/cms/tests/lead-intake.test.ts` asserting the response includes `confirmationPage` when the submitted page has one set, and omits it when unset
- [X] T037 [P] [US3] Add an e2e spec `apps/web/tests/e2e/confirmation-page.spec.ts` (pattern per `apps/web/tests/e2e/us3-unsubscribe.spec.ts`): submit landing page A (`confirmationPage` → page X) and assert the response shows page X's content with a resolved unsubscribe link; submit landing page B (`confirmationPage` → page Y, Y ≠ X) and assert it shows page Y's content, not X's or the generic message; submit a third landing page with no `confirmationPage` set and assert the generic message still appears (FR-012, SC-003 — confirmation-page selection is independent per landing page)
- [X] T038 [US3] Handle the edge case from spec.md ("deleting/unpublishing a page currently set as another page's confirmation page must not silently break that page's publish state — the editor must be told"): add an `admin.description`/validation note or a lightweight `beforeDelete`/`afterChange` warning on `Pages.ts` surfacing which pages reference a page as `confirmationPage` before it is deleted or unpublished

**Checkpoint**: confirmation-page flow works end to end with and without a selection; independently demonstrable via quickstart.md §8.

---

## Phase 6: User Story 4 - A domain or subdomain never dead-ends in a 404 (Priority: P2)

**Goal**: A registered, active domain (or its `www` pair) with no page at the
requested path falls back to its `notFoundPagePath` page instead of a bare
404; a real page always wins; an unregistered host still 404s.

**Independent Test**: register a domain with no page at `/`, confirm the
root path renders the configured fallback instead of 404; register both an
apex and `www` domain with the same `notFoundPagePath`, confirm both resolve.

- [X] T039 [US4] In `apps/web/src/app/[[...slug]]/page.tsx`'s `load()` function, after `getPublishedPage(domain.id, path)` returns `null`, add a fallback: if `domain.notFoundPagePath` is set and `domain.notFoundPagePath !== path`, call `getPublishedPage(domain.id, domain.notFoundPagePath)` and return that page instead of calling `notFound()`; only call `notFound()` if this second lookup also returns `null`, per `contracts/domain-fallback.md`
- [X] T040 [US4] Confirm `apps/web/src/lib/payload-client/index.ts`'s `Domain` interface already exposes `notFoundPagePath` (it does — `payload-client/index.ts:58`) and that `getActiveDomainByHost` returns it unfiltered; no change expected here, verify only
- [X] T041 [P] [US4] Add a regression test to `apps/web/tests/domains.test.ts` or a new `apps/web/tests/page-fallback.test.ts` covering: (a) no page at path + `notFoundPagePath` set → fallback page returned; (b) a real page at the requested path → real page wins, fallback never consulted; (c) `notFoundPagePath` unset → unchanged 404 behaviour; (d) an unregistered/inactive host → still 404 regardless of any domain's `notFoundPagePath`
- [X] T042 [US4] Add "§ Default landing page for a new domain" to `infra/deploy/README.md`: registering a domain (and its `www` pair, each its own `Domain` record) and pointing `notFoundPagePath` at an existing page's `path` is a content/config change, not a deploy
- [X] T043 [US4] Manual verification per quickstart.md §9: register two local test domains with no page at `/`, set both `notFoundPagePath` to the same existing page's path, confirm both resolve; confirm a real page at `/` still wins; confirm an unregistered host still 404s

**Checkpoint**: domain/`www` fallback works; independently demonstrable via quickstart.md §9.

---

## Phase 7: User Story 5 - New pages start from a template (Priority: P3)

**Goal**: A newly created page's block editor opens pre-populated with a
starter layout (including one lead-form block) instead of a blank canvas,
fully editable, and still passes every existing publish requirement if
published unedited.

**Independent Test**: create a new page, confirm the block editor opens with
the starter structure already in place and fully editable; publish it
unedited and confirm it passes the publish guard.

- [X] T044 [US5] In `apps/cms/src/fields/grapesjs/field.ts`, add a `defaultValue` function to the `projectData` field that returns a starter GrapesJS project built from the existing block definitions in `apps/cms/src/fields/grapesjs/blocks.ts` (a heading/text block plus the `lead-form` block, `id: "lead-form"`, `attributes: { "data-block": "lead-form", id: "form" }`) — not a hand-authored JSON literal, so `recomputeBlockCount`/the publish guard see a normal, editor-producible document
- [X] T045 [US5] In the same file, add matching `defaultValue`s for the `html` and `css` fields so a never-opened new page's exported markup is consistent with `projectData`'s starter content — depends on T044
- [X] T046 [P] [US5] Add a regression test (new `apps/cms/tests/grapesjs-starter-template.test.ts`) asserting `countBlocks()` (from `@trefle/shared`) on the default `projectData` reports exactly one `leadForm` block, matching the publish guard's "exactly one lead-form block" requirement in `apps/cms/src/hooks/pages-publish-guard.ts` — depends on T044
- [X] T047 [US5] Manual verification per quickstart.md §10: create a page in the admin, confirm the editor opens pre-populated, publish it unedited, confirm it passes the publish guard unchanged; then, in the same session, delete a block and add a new one, confirming the starter content behaves exactly like a from-scratch page with nothing locked or special-cased (FR-019 / Acceptance Scenario 2)

**Checkpoint**: new pages start from a template; independently demonstrable via quickstart.md §10 (first half).

---

## Phase 8: User Story 6 - Admin login reflects Trefle, not the underlying platform (Priority: P3)

**Goal**: The CMS admin login page no longer shows the platform's stock logo.

**Independent Test**: load the admin login page and confirm no stock
platform logo appears.

- [X] T048 [US6] Create `apps/cms/src/components/Logo.tsx` — a minimal Trefle wordmark/logo component, following the existing `@/components/X#default` pattern used by `PageStatsPanel`
- [X] T049 [US6] In `apps/cms/src/payload.config.ts`, add `admin.components.graphics.Logo: "@/components/Logo#default"` to the existing `admin` block — depends on T048
- [X] T050 [P] [US6] Add a new e2e spec `apps/web/tests/e2e/admin-branding.spec.ts` (**not** `us5-roles.spec.ts`, which carries an unconditional `test.fixme(true, ...)` — see `us5-roles.spec.ts:29` — that skips its entire file regardless of `E2E_RUN_US5`, so anything added there would never actually run) that navigates to `/admin/login` and asserts no element referencing Payload's default logo asset is present
- [X] T051 [US6] Manual verification per quickstart.md §10 (second half): load `/admin/login`, confirm Trefle's own mark appears and Payload's stock logo does not

**Checkpoint**: admin branding fixed; independently demonstrable via quickstart.md §10.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Full regression across all six user stories together, matching
001/002's exit bar.

- [X] T052 Run `npm run lint` and `npm run typecheck` across all workspaces; fix any fallout from T004–T051
- [X] T053 Run `npm test` (unit suites across `apps/cms`, `apps/web`, `packages/shared`) and confirm every new/extended test from T006, T009, T012, T015, T018, T023, T028, T035, T036, T041, T046 passes
- [X] T054 Cold-cycle the stack per plan.md's Phase 11: `docker compose ... down -v` → `up -d --wait` → migrate (confirming T031's `confirmationPage` migration applies cleanly on a fresh database) → seed → `npm run test:e2e:docker`, confirming the full Playwright suite (001's specs + T016, T037, T050) is green
- [X] T055 Walk `quickstart.md` end to end (§1–§10) on the cold-cycled stack and record the outcome of each section in the final commit/PR body, per the constitution's "manual verification steps MUST be written in the commit or PR body"
- [X] T056 Update this file's checkboxes to reflect completion; note any residual/deferred item (e.g. MFA — explicitly out of scope per spec.md's Clarifications) in a final "Notes" section here

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: no hard dependency on Phase 1, but do it right after — later saves (US3, US5, US2's manual verification) exercise the new 500 KB limit
- **User Stories (Phase 3–8)**: each depends only on Phase 1–2 being done, **not** on each other — they touch disjoint files (security fixes in `rate-limit.ts`/`tokens.ts`/`page-shell.tsx`/`leads/route.ts`/Caddyfile; republish in `revalidate.ts`; confirmation page in `Pages.ts`/`leadIntake.ts`; domain fallback in `[[...slug]]/page.tsx`; starter template in `grapesjs/field.ts`; branding in `payload.config.ts`+new `Logo.tsx`) and can be done in any order or in parallel
- **Polish (Phase 9)**: depends on every user story phase you intend to ship being complete

### Within Each User Story

- Security sub-fixes in US1 (T007–T023) are themselves independent of each other (different files/findings) and may be done in any order
- US2: T024 → T025 (same file, sequential); T026 is a verification-only step; T027 independent; T028 depends on T024/T025 existing to test against
- US3: T030 → T031 (migration) → T032 → T033 → T034 (each depends on the previous field/migration/response shape existing); T035–T037 depend on T030–T034; T038 independent
- US4: T039 depends on nothing new (uses existing `notFoundPagePath`); T040 is verification-only; T041 depends on T039
- US5: T044 → T045 (same file); T046 depends on T044
- US6: T048 → T049 (Logo component before wiring it in); T050 depends on T049

### Parallel Opportunities

- T002 and T003 (Setup) in parallel
- Within US1: the five sub-fixes (XFF, escaping, sanitisation, preview expiry, admin allow-list, rate-limit bounding) touch entirely different files and can be parallelised across contributors; all `[P]`-marked test tasks (T009, T012, T015, T018, T020, T023) can run in parallel with each other once their corresponding implementation task lands
- Once Phase 2 is done, US1 through US6 (Phases 3–8) can be worked in parallel by different contributors — they are file-disjoint except all sharing `Pages.ts` reads (US3 writes to it; nothing else does)

---

## Parallel Example: User Story 1

```bash
# Five independent security sub-fixes, each its own file set:
Task: "X-Forwarded-For trust boundary — infra/deploy/Caddyfile + apps/web/src/app/api/leads/route.ts"
Task: "Reflected-content escaping — apps/web/src/app/api/leads/route.ts"
Task: "Editor-HTML sanitisation — apps/web/src/components/page-shell.tsx"
Task: "Preview-token expiry — apps/web/src/lib/tokens.ts"
Task: "Admin IP allow-list — infra/deploy/Caddyfile"
Task: "Bound the rate-limit store — apps/web/src/lib/rate-limit.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (500 KB limit)
3. Complete Phase 3: User Story 1 — all six deferred security findings closed
4. **STOP and VALIDATE**: quickstart.md §1–§5, full e2e suite green
5. This alone is a legitimate, shippable increment — it closes every finding 002 explicitly deferred, the single highest-priority item now that the site is live

### Incremental Delivery

1. Setup + Foundational → ready
2. US1 (P1, security) → validate → ship
3. US2 (P1, republish reliability) → validate → ship
4. US3 (P2, confirmation page) and US4 (P2, domain fallback) → validate each independently → ship
5. US5 (P3, starter template) and US6 (P3, admin branding) → validate each independently → ship
6. Phase 9 Polish as the final full-suite gate before calling the feature done

### Parallel Team Strategy

With more than one contributor: complete Setup + Foundational together, then
split Phases 3–8 by contributor — they are file-disjoint (see Parallel
Opportunities above) and each has its own independent-test criterion in
spec.md, so no story blocks another.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Every hook/endpoint/access-control/cache-invalidation task above carries a
  regression test per the constitution — none were treated as optional
- Commit after each task or logical group, one commit per plan.md phase
  where the phase maps 1:1 to a task cluster above (e.g. T007–T009 is one
  commit, "X-Forwarded-For trust boundary"; T030–T031 land together, field +
  its migration, never split across commits)
- Stop at any user-story checkpoint to validate independently before moving on
- MFA for the admin login is explicitly out of scope for this phase (spec.md
  Clarifications) — do not fold it into T019/T020
- SC-002's 10-second bound (T024, T029, quickstart.md §7) is the single
  source of truth for "reliably republishes" — don't reintroduce a vaguer
  "normal revalidation latency" phrasing elsewhere

## Completion (2026-09-11)

All 56 tasks complete. `npm run lint` / `npm run typecheck` / `npm test`
green across `apps/cms`, `apps/web`, `packages/shared`. Full
`npm run test:e2e:docker` against freshly rebuilt production images (`docker
compose ... up -d --build`): 12 passed, 1 pre-existing quarantined skip
(`us5-roles.spec.ts`, unrelated to this feature), 0 failed.

**Residual / deferred, by design (not gaps):**

- **MFA for the admin login** — explicitly out of scope this phase (spec.md
  Clarifications); only the IP allow-list landed (FR-004).
- **`signPreviewToken` has no caller anywhere in `apps/cms`** (discovered
  while implementing T017) — the admin has no UI that actually mints a
  preview link yet. Pre-existing gap from 001, outside FR-006's scope (which
  only covers expiring whatever token exists); flagged, not fixed here.
- **Confirmation pages must satisfy `pages-publish-guard.ts`'s "exactly one
  lead-form block" rule to publish**, same as any other page (discovered
  while writing T037's e2e fixtures) — a confirmation page that's genuinely
  just a "thank you" message still needs a lead-form block to publish. Not
  relaxed here; would need its own reviewed scope (e.g. a page-type flag).
- **`ADMIN_ALLOWED_IPS` is not checked by `infra/deploy/preflight.sh`**
  (discovered during polish) — unset already fails closed (blocks everyone),
  so this is a nice-to-have reminder, not a security gap; not added since it
  wasn't part of the reviewed task list.

**Two pre-existing repo issues found and fixed as part of this feature**
(both directly entangled with FR-007's body-size-limit work and left
undocumented/broken otherwise):

- `apps/cms` actually runs **Next 16**, not Next 15 as `plan.md`'s Technical
  Context and `README.md`'s stack table both claimed — corrected in both
  docs.
- `next.config.mjs`'s `serverActions.bodySizeLimit` was a **silent no-op**
  since that Next 16 bump: the option moved back under `experimental` in
  Next 16 (reversing its Next 15 promotion to top-level), so the previous
  10 MB value was never actually enforced by Next — only
  `payload.config.ts`'s `bodyParser.limits.fieldSize` ever was. Fixed by
  nesting it correctly.

**One real bug caught only by the dockerised e2e run** (host-mode dev and
unit tests all happened to have a request's own URL origin match its Host
header, masking it): `POST /api/leads`'s redirect to `/confirmation` was
built from `req.url`, which in the dockerised/production topology reflects
the server's own internal address, not the client's actual Host — produced
an unreachable `Location`. Fixed to build the redirect from the `Host`
header instead; regression test added.

**Operational note for future work on this repo**: Payload's
collection/field config (including `defaultValue` and hook wiring) is
captured once at `next dev` / `next start` startup and does **not**
hot-reload on a config-file edit — a full server restart is required before
such changes take effect. Confirmed repeatedly while building T038 and
T044–T045.
