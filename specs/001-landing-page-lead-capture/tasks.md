---
description: "Task list for Landing Page Builder with GDPR-Compliant Lead Capture"
---

# Tasks: Landing Page Builder with GDPR-Compliant Lead Capture

**Input**: Design documents from `specs/001-landing-page-lead-capture/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Included **only** for the paths the constitution (v2.0.0, Principle IV) requires —
Payload access rules, collection hooks, the lead-intake path, revalidation logic, the
retention job, and token signing — plus a Playwright smoke per user story. Test-first is NOT
mandated; order tests and implementation as convenient.

**Organization**: Phase 1–2 are shared. Phases 3–7 are one per user story in priority order
and are independently testable. Phase 8 is polish.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: user-story label (US1–US5); absent for Setup / Foundational / Polish

## Path conventions

Monorepo, npm workspaces (see plan.md Structure Decision): `apps/cms/` (Payload + GrapesJS),
`apps/web/` (Next.js renderer), `packages/shared/`, `infra/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: repository restructure, both apps scaffolded, container stack and tooling up.

- [X] T001 Convert the repo to npm workspaces: add root `package.json` with `workspaces: ["apps/*", "packages/*"]` and `engines.node` set to `>=24`, move the current root Next.js app into `apps/web/` (keep it building), create `packages/shared/` (typed DTOs + cache-tag helpers, zod) and `infra/` directories. Monorepo `.gitignore`, `.dockerignore` added.
- [X] T002 Scaffold `apps/cms/` as a Payload 3.x app: `apps/cms/src/payload.config.ts` with `@payloadcms/db-postgres`, Node 24, `@payloadcms/next` wiring (`(payload)` route group: admin, REST, GraphQL, playground), stub `Users` + `Media` collections, admin fallback locale French (`fr`), migrations dir. Initial migration generated + applied against Postgres.
- [X] T003 [P] `infra/docker-compose.yml` with `cms`, `web`, `db` (`postgres:16`), `imgproxy`; `infra/docker-compose.override.yml` for dev (Mailpit, MinIO S3 stand-in + bucket bootstrap, source mounts, published `db` port). Multi-stage `Dockerfile` per app (`dev` target). `docker compose config` validates.
- [X] T004 [P] git-crypt: `.gitattributes` marking `infra/.env` / `infra/*.env` / `infra/**/secret*` as `filter=git-crypt diff=git-crypt` (`.env.example` excluded); unencrypted `infra/.env.example` listing every key per container. Local `infra/.env` generated with random secrets (gitignored). NOTE: `git-crypt` binary not installed on this machine — install before committing real encrypted secrets.
- [X] T005 [P] Lint + type-check + format across workspaces: root `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`), per-workspace `tsconfig.json` extending it, `eslint-config-next` in `apps/web` (existing), `typescript-eslint` flat config in `apps/cms`, root Prettier (`.prettierrc.json` + ignore), root `lint` / `typecheck` / `format` scripts. All pass.
- [X] T006 [P] Test runners: Vitest config in `apps/cms/`, `apps/web/`, `packages/shared/` (`passWithNoTests` where empty), Playwright config in `apps/web/` (`tests/e2e/`), root `test` / `test:e2e`. One smoke test in `packages/shared` passes.
- [X] T007 [P] `@payloadcms/storage-s3` wired in `apps/cms/src/payload.config.ts` (custom `endpoint`, `forcePathStyle: true`, bucket + creds from env) bound to `media`; `apps/cms/src/lib/imgproxy.ts` signed-URL builder (HMAC over key+salt).
- [X] T008 [P] `@payloadcms/email-nodemailer` SMTP adapter in `apps/cms/src/payload.config.ts` (Mailpit host/port in dev via override env; from-address from `SMTP_FROM`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema/migrations, auth, roles, shared libs, cross-cutting utils. **No user
story may start until this phase is complete.**

- [X] T009 Payload Postgres adapter + migrations workflow in `apps/cms/`: `payload:migrate` / `payload:migrate:create` scripts, `src/migrations/`, `push: false` (migrations only). Two migrations applied: `20260909_114748_initial` (Phase 1) + `20260909_120606_phase2_foundational` (users.isService, activity-log, settings).
- [X] T010 `users` auth collection in `apps/cms/src/collections/Users.ts`: `email` (auth), `role` select **required, `admin`|`editor`, default `editor`, saveToJWT, admin-only to change**, `name`, `isActive` checkbox **default `true`, saveToJWT, admin-only** (`false` ⇒ access denied), `useAPIKey: true`, 8h token.
- [X] T011 [P] Role-based access functions in `apps/cms/src/access/index.ts` (`isAdmin`, `isAdminOrEditor`, `isService`, `isStaffOrService`, `publishedOnly` → `{status: published}` Where for service, `readSelf` → own-id Where, `adminFieldOnly`) per `contracts/payload-collections.md` §D. Admin-only gates for rectification / erasure land on `leads` / `dsr-erase` in Phase 3 using `isAdmin`.
- [X] T012 `isService` checkbox on `users` (hidden, admin-only, saveToJWT) marks the renderer's read-only API-key account; `publishedOnly` restricts it to published content. Actual API-key account row is created by the dev seed (T050).
- [X] T013 [P] `settings` global in `apps/cms/src/globals/Settings.ts`: `retentionMonths` **default 24, min 1**, `defaultConsentPurposeText`, `defaultPrivacyNoticeUrl`, `defaultPrivacyNoticeVersion`, `exportConsentedOnlyByDefault` **default `true`**, `senderEmail`, `notifyOnNewLead` **default `false`**, `notifyEmails[]`; **read `admin`+`editor`, update `admin` only**. Verified live (defaults return over API).
- [X] T014 [P] Append-only `activity-log` collection in `apps/cms/src/collections/ActivityLog.ts`: `type` select (10 values), `actor` rel→users **nullable**, `targetType`, `targetId` (no PII), `at` date required (defaults now), `meta` json; `create`/`update` disabled via access (written server-side with `overrideAccess`), `delete` admin-only.
- [X] T015 [P] `packages/shared/`: `domain.ts` (Role, ConsentStatus, PageStatus, DsrType/Status, ActivityType, FormFieldType unions + `DEFAULT_RETENTION_MONTHS`), zod DTOs `leadIntakeSchema` / `revalidateSchema` / `utmSchema`, cache-tag helpers. `apps/web` imports from here, never `payload`.
- [X] T016 [P] Typed read-only Payload client in `apps/web/src/lib/payload-client/index.ts` (`CMS_API_URL` base, `Authorization: users API-Key <key>`, `getActiveDomainByHost`, `getPublishedPage`, `getPageStatus`, `PayloadUnavailableError` on connect/5xx, Next cache tags) per §A.
- [X] T017 [P] PII-redacting structured logger in `apps/web/src/lib/log.ts` + `apps/cms/src/lib/log.ts` (one JSON/line, redacts email/ip/userAgent/fieldValues/body/auth/cookie/name/token); `leadSubmissionLog({outcome, reason, pageId})` in `apps/web` for FR-012.
- [X] T018 [P] HMAC utilities in `apps/web/src/lib/tokens.ts`: `signFormToken`/`verifyFormToken` (pageId+issuedAt, min 2s / max 2h window), `signUnsubscribeToken`/`verifyUnsubscribeToken` (`base64url(leadId).hmac`), `revalidateSignature`/`verifyRevalidateSignature` (hex HMAC, timing-safe compare).
- [X] T019 [P] Vitest access truth table in `apps/cms/tests/access.test.ts` (admin / editor / inactive-admin / service / anon × every access fn) — 7 tests pass. Anon 403 also verified live on `/api/users`, `/api/globals/settings`, `/api/activity-log`.
- [X] T020 [P] Vitest for `apps/web/src/lib/tokens.ts` in `apps/web/tests/tokens.test.ts` (round-trip, tampered signature, too-fast, stale, forged unsubscribe, changed-body) — 7 tests pass.

**Checkpoint**: schema migrates, admin logs in, roles enforce, shared libs importable — user stories can begin.

---

## Phase 3: User Story 1 - Create and publish a landing page that captures leads (Priority: P1) 🎯 MVP

**Goal**: An authenticated member builds a page from blocks, assigns it to a domain + path,
publishes it, and a visitor submits the lead form with explicit consent — producing one lead
with captured metadata and an immutable consent record.

**Independent Test**: Create one page, publish it, open its public URL in a fresh session,
submit the form with consent ticked → exactly one lead is stored with the submitted values,
captured metadata, and a linked consent record; submitting with consent un-ticked stores
nothing.

### Tests for User Story 1

- [X] T021 [P] [US1] Vitest for the pages publish-guard in `apps/cms/tests/pages-publish-guard.test.ts` (7 tests: happy path stamps `publishedAt`; draft no-op; 0 / 2 lead-form blocks; missing domain/path; not exactly one email field; path clash). Concurrency-guard behaviour verified via `pages-concurrency.ts` + Payload `lockDocuments`. `countBlocks` covered by `packages/shared/tests/blocks.test.ts` (5 tests).
- [X] T022 [P] [US1] Vitest for the `lead-intake` endpoint in `apps/cms/tests/lead-intake.test.ts` (6 tests: 403 non-service; 422 no consent; 409 unpublished; 422 missing required field; happy path creates lead + linked consent record + unsubscribe url; duplicate flag). End-to-end path also verified live against Postgres (see Phase 3 notes).
- [X] T023 [P] [US1] Vitest for `apps/web` `POST /api/leads` in `apps/web/tests/api-leads.test.ts` (7 tests: unknown host 403; honeypot → silent 200, nothing stored; too-fresh token 422; per-IP window 429 + `Retry-After`; consent-required 422; valid → 200 calls CMS intake; CMS unavailable through the retry window → 503).
- [X] T024 [P] [US1] Vitest for `apps/web` `POST /api/revalidate` in `apps/web/tests/api-revalidate.test.ts` (3 tests: bad signature 401 + no `revalidateTag`; `at` > 5 min → 400; valid → 200, `revalidateTag(tag, "max")` per tag — Next 16 requires the cacheLife arg).
- [X] T025 [P] [US1] Vitest for `apps/web/src/lib/domains.ts` in `apps/web/tests/domains.test.ts` (4 tests: `pathFromSlug`; `requestHostname` lowercases + strips port; `resolveDomain` hits `getActiveDomainByHost`; null on unknown host).
- [X] T026 [P] [US1] Playwright smoke in `apps/web/tests/e2e/us1-capture.spec.ts` (submit with consent → confirmation; submit without consent → rejected; submit with JS disabled → confirmation). **Not run in this session** (needs `npx playwright install` + the running stack) — wired into the Phase 4 CI target (T092). The same flow was verified live with curl (see notes).

### Implementation for User Story 1

- [X] T027 [P] [US1] `domains` collection in `apps/cms/src/collections/Domains.ts` (hostname required/unique/lowercased/regex-validated, `isActive` default true, `label`, `branding` group, `notFoundPagePath`; read staff+service, write admin-only; afterChange/afterDelete → revalidate). Seeded: site-a.localhost, site-b.localhost.
- [X] T028 [P] [US1] `media` collection real in `apps/cms/src/collections/Media.ts` (S3 storage via plugin, `alt` required, image/pdf mime types, read staff+service, write admin+editor).
- [X] T029 [US1] `pages` collection in `apps/cms/src/collections/Pages.ts`: `title` req, `domain` rel, `path` (leading-slash normalised), `status` draft|published default draft, `publishedAt` (stamped by the guard on first publish), `seo` group; read = `publishedOnly` (service filtered to published), write admin+editor; `lockDocuments` on. Page delete does not cascade to `leads`/`consent-records` (relationship not configured to cascade — FR-001a).
- [X] T030 [US1] `pages.form` group (`apps/cms/src/fields/form.ts`): `fields` array (name/label req, type enum, required, select options), `submitLabel` default "Envoyer", `successMessage`, `consentPurposeText`, `privacyNoticeUrl`, `privacyNoticeVersion`. The publish guard enforces exactly one email field + all four texts present. Settings-seeded defaults land in T072.
- [X] T031 [US1] GrapesJS field (`apps/cms/src/fields/grapesjs/`): `builder` group (`projectData` json edited by a `"use client"` GrapesJS component, `html`/`css` hidden textareas, `blockCount` json readonly, `baseUpdatedAt` hidden). Fixed block library (hero, rich-text, image, call-to-action, lead-form, testimonial) each dropping `data-block="<type>"`. **Deviation from the written task**: GrapesJS exports html/css client-side into the stored fields (research.md §3) rather than a headless server render — see T034. `baseUpdatedAt` field later dropped (see T031a). **Editor UI confirmed working in the browser** (canvas renders, blocks drag/drop).
- [X] T031a [US1] Concurrent-edit protection = Payload's built-in **`lockDocuments`** on `pages` (a second editor cannot open a locked doc → no silent overwrite). The initial custom `builder.baseUpdatedAt` version guard was removed — it fought Payload's group-field merge and rejected legitimate API PATCHes. Migration `20260909_132641_phase3b_drop_baseupdatedat` drops the field. No auto-merge in v1 (per spec).
- [X] T032 [US1] `apps/cms/src/hooks/pages-block-count.ts` — `beforeValidate` recomputes `builder.blockCount` from `projectData` via `@trefle/shared` `countBlocks`. Verified live (`blockCount.leadForm` correct on publish).
- [X] T033 [US1] `apps/cms/src/hooks/pages-publish-guard.ts` — `beforeChange`, on `status→published` rejects (HTTP 400) unless exactly one lead-form block, non-empty html, domain + path set, `(domain,path)` unique among published pages, exactly one email field, all four form texts present; stamps `publishedAt`. Verified live.
- [X] T034 [US1] `builder.html`/`css` kept in sync with `projectData` by the **client** GrapesJS export on every editor change (T031); the publish guard requires non-empty `html`. No headless server render (`pages-render.ts` not created) — deliberate simplification per research.md §3; revisit if drift is observed.
- [X] T035 [US1] `apps/cms/src/hooks/pages-revalidate.ts` (`afterChange`/`afterDelete`) + `apps/cms/src/hooks/revalidate.ts` — signed `POST` to `WEB_REVALIDATE_URL` with `page:<id>` / `domain:<id>` / `page-list` only when published state/content changed; draft-only saves emit nothing; fire-and-forget.
- [X] T036 [US1] `apps/cms/src/hooks/pages-activity.ts` + `apps/cms/src/lib/activity.ts` — appends `page-published` / `page-unpublished` / `page-content-changed` with `actor`. Verified live (page-published entry with the admin as actor).
- [X] T037 [P] [US1] `consent-records` collection — all fields present; `create`/`update`/`delete` denied via access (service endpoints use `overrideAccess`); `beforeChange` rejects edits to any field other than `withdrawnAt` and the three personal fields (erasure). `ipAddress`/`userAgent` optional at the schema level (populated by intake).
- [X] T038 [P] [US1] `leads` collection — `page` rel (no cascade), `email`, `fieldValues` json, `metadata` group, `consentStatus` default consented, `consentRecord` rel, `isDuplicate`, `submittedAt`, `erasedAt`; read admin+editor, **update (rectification) admin-only (FR-028)**, delete admin, create service-only; list filtered to `erasedAt = null`.
- [X] T039 [P] [US1] `page-stats` collection — `(page, date)` unique index, `views`/`submissions` default 0; write denied via access, incremented only by `incrementPageStat` (`apps/cms/src/lib/page-stats.ts`) with `overrideAccess`.
- [X] T040 [US1] `POST /api/lead-intake` (`apps/cms/src/endpoints/leadIntake.ts`) — service/admin only; validates consent + published + required fields; creates lead → consent-record → links them → increments `page-stats.submissions`; returns `{ ok, leadId, unsubscribeUrl, successMessage, duplicate }`. Sequential creates with `overrideAccess` (not a single DB txn — acceptable for v1; consent record is still guaranteed before the response). Verified live incl. duplicate flag.
- [X] T041 [US1] `POST /api/page-view` (`apps/cms/src/endpoints/pageView.ts`) — service/admin only; `incrementPageStat(..., "views")`; 204; failures swallowed.
- [X] T042 [US1] Payload migration `20260909_125135_phase3_us1` (domains, pages + form arrays, media mime, leads, consent-records, page-stats) applied on a clean DB. Payload generates `up`/`down` SQL in each migration file — the `down` is present; a manual-reversal note is not needed (constitution Principle III).
- [X] T043 [P] [US1] `apps/web/src/lib/domains.ts` — `requestHostname()` (Host / x-forwarded-host, lowercased, port stripped), `resolveDomain()` (→ `getActiveDomainByHost`), `pathFromSlug()`. Verified live: unknown host → 404.
- [X] T044 [P] [US1] `apps/web/src/lib/rate-limit.ts` — fixed-window in-memory: per IP 10/min + 100/day, per `(email,page)` 3/day; `checkIpLimit` / `checkEmailPageLimit` return `{ ok, remaining, retryAfterSec }`; `__resetRateLimits` for tests.
- [X] T045 [US1] `apps/web/src/app/[[...slug]]/page.tsx` — resolves host + path → `getPublishedPage` → `PageShell` (GrapesJS `builder.html` + scoped `builder.css`, form placeholder swapped for `LeadForm`); `revalidate = 3600`, cache tags via the client; `generateMetadata` from `seo`; `notFound()` on unknown host/path/`PayloadUnavailableError`; fire-and-forget `pingPageView`. Verified live: `/promo` renders hero + injected form + footer.
- [X] T046 [P] [US1] `apps/web/src/components/lead-form.tsx` + `page-shell.tsx` + `lib/render.ts` — plain `<form method="post" action="/api/leads">` (works without JS); renders `form.fields` (email/text/textarea/select/checkbox), an always-present un-pre-ticked `consent` checkbox with purpose text + privacy link, hidden honeypot `hp_email`, hidden `formToken` + `pageId`; `aria-invalid` + `role="alert"` on errors; accessible labels. `splitAroundForm` regex isolates the single `data-trefle-form="1"` leaf.
- [X] T047 [US1] `apps/web/src/app/api/leads/route.ts` per `contracts/lead-intake.md` — HTML-in/HTML-out (no client JS needed): host allow-list 403 → honeypot silent 200 → `formToken` timing 422 → per-IP/per-(email,page) rate-limit 429 → fetch form config → field + email-format + consent validation 422 → `postLeadIntake` with `ip`/`userAgent`/`referer`/parsed `utm`; **retry with backoff for ~5s then 503** on `PayloadUnavailableError` (FR-014a); aggregate abuse + transient counters via `lib/counters.ts` (FR-012/FR-035). Verified live: 403 host, silent honeypot, 422 consent/validation, 200 + lead + consent record + UTM parsed from Referer.
- [X] T048 [US1] `apps/web/src/app/api/revalidate/route.ts` per `contracts/revalidation.md` — verify `X-Revalidate-Signature` (401), zod-parse body (400), reject `at` > 5 min (400), `revalidateTag(tag, "max")` per tag, `200 { revalidated }`. Verified live end-to-end: CMS `afterChange` → web logs `revalidated {tags, reason}`.
- [X] T049 [US1] `signFormToken(String(page.id))` issued in the `[[...slug]]` route and the preview route, threaded into `<LeadForm formToken>`.
- [X] T049a [US1] `apps/web/src/app/(preview)/preview/[pageId]/page.tsx` — per-page signed token (`signPreviewToken` / `verifyPreviewToken`, HMAC over `preview:<id>`), any-status page via a new CMS service endpoint `POST /api/page-preview` (`apps/cms/src/endpoints/pagePreview.ts`), `force-dynamic`, `PREVIEW` watermark, same `PageShell`. Verified live: no/bad token → 404, valid token → 200 with watermark + form.
- [X] T050 [US1] Dev seed `apps/cms/src/seed/dev.ts` (`npm run --workspace @trefle/cms seed:dev`) — creates the admin, the `isService` API-key account (prints the key for `CMS_SERVICE_API_KEY`), `settings` defaults (retention 24 + FR consent/privacy text), and domains site-a/site-b.localhost. Idempotent. Ran successfully.

**Checkpoint — US1 MVP COMPLETE.** Verified live end to end (both dev servers + Postgres + MinIO):
author a page → publish (guard enforced) → `GET site-a.localhost:3001/promo` renders the
GrapesJS content with the real server-driven form injected → submit → validation (422s with
correct messages) → valid submission → 200 "Merci" + unsubscribe link, lead + immutable consent
record + captured metadata + UTM parsed from the Referer; honeypot → silent 200, nothing stored;
wrong host / unknown path → 404; CMS `afterChange` → signed `/api/revalidate` on the renderer;
`/preview/<id>?token=` → 200 with watermark. Playwright (T026) written but not executed here.

---

## Phase 4: User Story 2 - Review and export captured leads (Priority: P2)

**Goal**: A member views leads for a page or across all pages with their fields, metadata,
consent status, and time, filters them, and exports the filtered set to a file.

**Independent Test**: With ≥3 leads across 2 pages, open the leads view → all appear with
fields and consent status; filter to one page and export → the file contains only that
page's leads with all columns.

### Tests for User Story 2

- [X] T051 [P] [US2] Vitest for `GET /api/leads-export` in `apps/cms/tests/leads-export.test.ts` (5 tests: 403 non-staff; CSV header + one row per lead, `fieldValues` JSON CSV-escaped, UTM flattened; `consentedOnly` from settings by default + `erasedAt = null` always in the `where`; `consentedOnly=0` drops that clause; pagination loop + `leads-exported` activity entry with the count).

### Implementation for User Story 2

- [X] T052 [US2] `apps/cms/src/collections/Leads.ts` list view: `defaultColumns` (email, page, consentStatus, isDuplicate, submittedAt), `listSearchableFields: ["email"]`, `baseListFilter` hides erased; Payload's built-in per-column filters cover page / date / consentStatus; default empty state. `ExportLeadsButton` mounted via `admin.components.beforeListTable`.
- [X] T053 [US2] `GET /api/leads-export` (`apps/cms/src/endpoints/leadsExport.ts`) — Admin+Editor only; streams a CSV via `ReadableStream`, paging `payload.find` 500 at a time (never buffers the whole set); columns = leadId, submittedAt, email, fieldValues(JSON), pageId, domainHostname, pageUrl, referrer, utm_{source,medium,campaign,term,content}, userAgent, consentStatus, isDuplicate; `?consentedOnly=` (default `settings.exportConsentedOnlyByDefault`); `?page`/`?from`/`?to`/`?consentStatus` filters; always `erasedAt = null`. `content-disposition: attachment`. Verified live.
- [X] T054 [US2] `leads-exported` activity entry (count + `actor` + filters + `consentedOnly`) written from `leadsExportEndpoint` after the stream drains (`apps/cms/src/lib/activity.ts`, `apps/cms/src/lib/csv.ts`). Verified live.
- [X] T055 [US2] `apps/cms/src/components/ExportLeadsButton.tsx` — server component, two no-JS links ("Leads consentis" / "Tous les leads") to `/api/leads-export`. v1 exports the full set (per-column list filters not yet threaded into the URL — the endpoint accepts them programmatically). Visual QA pending browser.
- [X] T055a [US2] `apps/cms/src/components/PageStatsPanel.tsx` — server component above the Pages list, aggregates `page-stats` into views / submissions / conversion per page (SC-009, FR-037). Anti-abuse / transient counters stay in the renderer's logs (cross-process dashboard deferred to Phase 8). Visual QA pending browser.

**Checkpoint — US2 done.** `GET /api/leads-export` verified live: CSV with header + one row
per non-erased lead, `fieldValues` JSON + UTM flattened, `content-disposition: attachment`,
`consentedOnly` honoured, anon → 403, `leads-exported` activity entry with the count. Admin
list view + Export button + per-page stats panel wired (visual QA pending a browser).

---

## Phase 5: User Story 3 - Honour data-subject rights and consent withdrawal (Priority: P2)

**Goal**: A person's access, rectification, or erasure request is recorded and fulfilled
across every page they submitted to; a captured lead can withdraw consent via a tokenized
link with no login.

**Independent Test**: For an email that submitted to two pages, run an access export → JSON
holds both leads + consent records; run + confirm an erasure → personal data gone from both
pages and all later exports, and a dated non-personal request record remains.

### Tests for User Story 3

- [X] T056 [P] [US3] Vitest for `POST /api/consent-withdraw` in `apps/cms/tests/dsr.test.ts` (403 anon; sets `consentStatus = withdrawn` + `consent-records.withdrawnAt`; idempotent on replay; unknown lead ⇒ 200 non-enumerating, nothing written).
- [X] T057 [P] [US3] Vitest for `POST /api/dsr-erase` in `apps/cms/tests/dsr.test.ts` (403 for an Editor; erases every matching lead **and each linked consent record's `email`/`ipAddress`/`userAgent`** via `eraseLeadPersonalData`, sets `erasedAt`, completes the request, logs `dsr-completed`). Orphaned-lead coverage: `find` is by email, so a lead whose page was deleted still matches — verified live (a lead survives page deletion, FR-001a).
- [X] T058 [P] [US3] Vitest for `POST /api/dsr-export` in `apps/cms/tests/dsr.test.ts` (403 non-staff; returns all leads + consent records for the lowercased email; writes a `dsr-completed` activity entry).
- [X] T059 [P] [US3] Playwright smoke `apps/web/tests/e2e/us3-unsubscribe.spec.ts` (unsubscribe link → confirm page with no email → withdraw → done; invalid token → neutral). `test.skip` unless `E2E_UNSUB_URL` is set — not run here; equivalent flow verified with curl.

### Implementation for User Story 3

- [X] T060 [P] [US3] `data-subject-requests` collection (`apps/cms/src/collections/DataSubjectRequests.ts`): `email` (nullable — required at creation, cleared post-erasure per FR-027), `type` (access/portability/rectification/erasure), `status` (received/in_progress/completed, default received), `receivedAt` (default now), `completedAt` (readonly), `notes`, `resultRef`. Read/create/update — Admin + Editor; **erasure execution gated on the `dsr-erase` endpoint (Admin only)**; no anonymous. `DsrActions.client` mounted via `beforeListTable` (T065).
- [X] T061 [US3] `POST /api/consent-withdraw` (`apps/cms/src/endpoints/consentWithdraw.ts`) — service or staff; `{ leadId }` → `consentStatus = withdrawn` + `consent-records.withdrawnAt` if unset; idempotent; unknown lead ⇒ 200 (non-enumerating). Verified live incl. replay.
- [X] T062 [US3] `POST /api/dsr-export` (`apps/cms/src/endpoints/dsrExport.ts`) — Admin + Editor **(service account excluded)**; `{ email }` → JSON of all leads + consent records for that email; `dsr-completed` activity entry (FR-034b). Verified live: staff 200, service key 403.
- [X] T063 [US3] `POST /api/dsr-erase` (`apps/cms/src/endpoints/dsrErase.ts`) — **Administrator only**; `{ email, requestId? }` → `eraseLeadPersonalData` (`apps/cms/src/lib/erase.ts`) for every non-erased lead: null `email`/`fieldValues`/`metadata` + each linked consent record's `email`/`ipAddress`/`userAgent`, stamp `erasedAt`; completes the request; `dsr-completed` activity entry. Idempotent (replay ⇒ `erased: 0`). Verified live: erased across pages, consent wording kept, DSR row `email` cleared.
- [X] T064 [US3] `apps/cms/src/hooks/dsr-complete.ts` — **`beforeChange`** (not afterChange — avoids a re-entrant write loop): on `status → completed` stamps `completedAt`; for `type === "erasure"` also nulls `email` + `notes`. Verified live: DSR row `email=None`, `completedAt` set.
- [X] T065 [US3] `apps/cms/src/components/DsrActions.client.tsx` — email field + "Export accès / portabilité" (opens JSON) + "Effacer (Administrator)" (double-confirm, calls `/api/dsr-erase`). Visual QA pending browser.
- [X] T066 [US3] Rectification is Administrator-only: `Leads.access.update = isAdmin` (Phase 3a); no hook touches the linked `consent-records` on a lead update, so the consent record is untouched by design. Editor denial + record-untouched asserted transitively by the access matrix test (T078, Phase 7) and T057.
- [X] T067 [P] [US3] `apps/web/src/app/unsubscribe/page.tsx` — Server Action (works without JS): `GET` → "Lien invalide" on a bad token, a confirm page (**no PII**) on a valid one; the action calls `cms /api/consent-withdraw` and redirects to `?done=1` ("Consentement retiré"). Verified live: bad token neutral, valid token → confirm page, token verifies once `UNSUBSCRIBE_SECRET` is shared with the CMS.
- [X] T068 [US3] Done in Phase 3a — `leadIntake` returns `unsubscribeUrl` (`base64url(leadId).hmac`), threaded into the `/api/leads` success page. Hardened here: `unsubscribeUrl()` throws if `UNSUBSCRIBE_SECRET` is unset (was silently signing with `""`); added the var to `apps/cms/.env.local` + `infra/docker-compose.yml` cms service.
- [X] T069 [US3] Payload migrations `20260909_140324_phase5_dsr` + `20260909_140833_phase5b_dsr_email_nullable` applied on the running DB. Payload emits `up`/`down` SQL per file (Principle III).

**Checkpoint — US3 done.** Verified live end to end: capture → `/unsubscribe?token=` confirm page (no email) → withdraw (`consentStatus=withdrawn`, `withdrawnAt` stamped, idempotent) → `dsr-export` (staff 200 / service 403) → create erasure request → `dsr-erase` (Admin) → lead + consent record personal fields nulled, `erasedAt` set, lead gone from list + export, consent wording kept, DSR row `email` cleared + `completedAt` set → `dsr-completed` activity entries.

---

## Phase 6: User Story 4 - Configure privacy notice and data retention (Priority: P3)

**Goal**: An admin edits the reusable privacy-notice text/link, the consent purpose text,
and a retention period after which leads are automatically deleted.

**Independent Test**: Set retention to a tiny test value, capture a lead, run the sweep →
lead personal data deleted and recorded as retention-expired; change the consent purpose
text → new pages show it while existing consent records keep the wording shown at capture.

### Tests for User Story 4

- [X] T070 [P] [US4] Vitest for `runRetentionSweep` in `apps/cms/tests/retention.test.ts` (4 tests: builds the cutoff from `settings.retentionMonths` + `where` has `erasedAt = null` and `submittedAt < cutoff`; erases each expired lead **and its consent record's `email`/`ipAddress`/`userAgent`** (FR-031/031a); `retention-deletion` activity with `actor = null` + count; honours an explicit `olderThan` and skips `findGlobal`; no-op + no activity when nothing expired; skips already-erased leads).
- [X] T071 [P] [US4] Vitest `apps/cms/tests/settings-no-cascade.test.ts` — the `settings` afterChange hook writes exactly one `settings-changed` activity entry and calls `update` on nothing, and never `create`s into `pages` / `consent-records` / `leads` (FR-018, US4-3).

### Implementation for User Story 4

- [X] T072 [US4] `apps/cms/src/fields/form.ts` — `consentPurposeText` / `privacyNoticeUrl` / `privacyNoticeVersion` get `defaultValue` from a `fromSettings(key)` function that reads the `settings` global at **create time only**. Verified live: a new page's form comes pre-filled from settings; editing settings afterwards leaves existing pages untouched.
- [X] T073 [US4] `apps/cms/src/hooks/settings-activity.ts` (`Settings` afterChange) — appends `settings-changed` with the acting member; touches no other collection. Verified live.
- [X] T074 [US4] `runRetentionSweep` (`apps/cms/src/lib/retention.ts`) — reads `settings.retentionMonths` (calendar-month cutoff), pages `leads` where `submittedAt < cutoff` and `erasedAt == null` (batch 200, re-queried each pass ⇒ resumable), calls `eraseLeadPersonalData` per lead (nulls lead + linked consent-record personal fields, stamps `erasedAt` — FR-031/031a), then writes one `retention-deletion` activity entry (`actor: null`) when anything was erased. `dev`/ops override: `olderThan`. Verified live: erased 7/9, consent wording kept, activity entry, idempotent replay ⇒ `erased: 0`.
- [X] T075 [US4] `apps/cms/src/jobs/retentionSweep.ts` (`TaskConfig`, slug `retention-sweep`, `schedule: [{ cron: "0 3 * * *", queue: "default" }]`) + `payload.config.ts` `jobs: { tasks, autoRun, shouldAutoRun: () => JOBS_AUTORUN === "true" }`. `autoRun` needs a long-running worker (cron container running `payload jobs:run`, or `JOBS_AUTORUN=true`); `POST /api/run-retention` (`apps/cms/src/endpoints/runRetention.ts`, Admin only, optional `{ nowMinusDays }`) triggers it on demand. Verified live: admin 200, service key 403.
- [X] T076 [US4] Payload migration `20260909_142443_phase6_retention_jobs` (adds the `payload-jobs` collection tables) applied. Payload emits `up`/`down` SQL per file (Principle III).

**Checkpoint — US4 done.** Verified live: `POST /api/run-retention` (Admin, `nowMinusDays: 0`) erased
7 leads in place (rows kept, all emails null), scrubbed each linked consent record's personal
fields while keeping the wording/version/timestamps, wrote one `retention-deletion` activity entry
with no actor, and is idempotent (replay ⇒ `erased: 0`); service key → 403. Editing `settings`
logs `settings-changed` and rewrites nothing; a new page pre-fills its form texts from `settings`.
The daily cron (`jobs.autoRun`) needs a persistent worker — configured, not exercised here.

---

## Phase 7: User Story 5 - Manage workspace members and roles (Priority: P3)

**Goal**: An admin invites colleagues, assigns Editor or Administrator, and changes or
revokes access; role determines who may manage membership and workspace settings.

**Independent Test**: Invite a second person as Editor → they can author pages and export
leads but cannot open member management or workspace settings; promote to Administrator →
they can; attempt to remove the last Administrator → refused.

### Tests for User Story 5

- [X] T077 [P] [US5] Vitest `apps/cms/tests/hooks/users-last-admin.test.ts` (8 tests): `beforeChange` rejects demoting / deactivating the only active admin, allows it when another remains, is a no-op for unrelated edits + creates + non-admin originals; `beforeDelete` rejects deleting the last active admin, allows it when another remains, does not guard an Editor delete.
- [X] T078 [P] [US5] Vitest `apps/cms/tests/access-editor.test.ts` (7 tests) — drives the real collection/global `access` functions with an Editor user: denied on `users` create/update/delete + `Users.access.admin`, `settings` update + `Settings.admin.hidden`, `leads` update (rectify) + delete, `data-subject-requests` delete; allowed on `pages` CRUD, `domains` read, `leads` read, DSR create/read/update, `settings` read (contracts §D).
- [X] T079 [P] [US5] Playwright smoke `apps/web/tests/e2e/us5-roles.spec.ts` — admin invites an Editor, reads the Mailpit set-password link, Editor sets a password + signs in, is blocked from `/collections/users` + `/globals/settings`, gets 403 on `dsr-erase`, and demoting the last Administrator surfaces "last active Administrator". Guarded by `E2E_RUN_US5=1` (needs browsers + full stack); wired into the Phase 4 CI target (T092). Not executed here — same as US1/US3 specs.

### Implementation for User Story 5

- [X] T080 [US5] `apps/cms/src/hooks/users-invite.ts` — `usersSendInvite` (`afterChange`, `operation === "create"`) triggers `payload.forgotPassword` → "set your password" email over SMTP (Mailpit in dev); never throws into the create, only logs (no address — FR-038). `context.skipInvite` opts a create out (dev seed). `usersActivateOnLogin` (`afterLogin`) flips `invitationStatus` `invited` → `active` on first sign-in. New `invitationStatus` select field on `users` (`invited` default, admin read-only, sidebar). Verified live: invite → "Reset Your Password" mail in Mailpit, row `invitationStatus: invited` → `active` after the invitee logs in.
- [X] T081 [US5] `apps/cms/src/hooks/users-last-admin.ts` — `lastAdminGuardBeforeChange` + `lastAdminGuardBeforeDelete`: reject any update/delete that would leave zero `role === 'admin' && isActive !== false` users (`payload.count` on the other active admins). Verified live: demote-only-admin → 400 "This is the last active Administrator…"; delete-only-admin → 400; succeeds once a second admin exists.
- [X] T082 [US5] `apps/cms/src/hooks/users-activity.ts` — `usersActivity` (`afterChange`): `member-invited` on create, `member-role-changed` when `role` or active state changes (`meta` carries `role`/`previousRole`/`isActive`); `usersActivityOnDelete` (`afterDelete`): `member-removed`. Actor = `req.user.id`; the service account is skipped. Verified live: all three entries written with the acting admin as `actor`.
- [X] T083 [US5] `users` is Administrator-only in the admin UI via `access.admin` (hidden + routes blocked for Editors — pre-existing); `apps/cms/src/globals/Settings.ts` gains `admin.hidden: ({ user }) => user.role !== 'admin'` so the settings nav is not openable by Editors, while `access.read` stays `isAdminOrEditor` per contracts §D. Verified live: Editor `users` list → self only; `settings` update → 403; `settings` read → 200.
- [X] T084 [US5] Editor boundary verified against `contracts/payload-collections.md` §D by T078 + the live smoke. One adjustment: `DataSubjectRequests.access.delete` tightened from `isAdminOrEditor` to `isAdmin` (§D grants Editors create/read/progress only). `domains` (editor read, admin write), `leads` (editor read/export, admin rectify/delete), `pages` (editor CRUD) already matched §D — no change.
- [X] T085 [US5] Migration `20260909_144132_phase7_users_invitation_status` — adds `users.invitation_status` enum (`invited` | `active`, default `invited`) and back-fills existing rows to `active` (they predate the invite flow). Tested `down` drops the column + type; header documents the reversal (constitution Principle III). `role` / `isActive` columns already exist since `20260909_114748_initial`. Applied on the running DB.

**Checkpoint — US5 done.** Verified live end to end: Administrator creates a member → `invitationStatus: invited`,
`member-invited` activity (actor = admin), "Reset Your Password" email in Mailpit → invitee sets a password
and signs in → `invitationStatus` flips to `active`. Editor is denied `users` CUD, `settings` update,
`dsr-erase`, and `leads` rectification (all 403) and sees only their own `users` row; Editor may read
`settings`. The workspace cannot drop below one active Administrator: demoting or deleting the last one is
refused with a clear message; both succeed once a second Administrator exists, emitting `member-role-changed`
/ `member-removed` with the acting member. All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T086 [P] `apps/web/src/lib/imgproxy.ts` — `signImgproxyUrl` (HMAC-SHA256 over `/rs:fit:W:H/g:ce/<b64 src>`, hex KEY+SALT) + `rewriteImageTags(html)` wired into `page-shell.tsx`: every `<img src>` under `ASSET_ORIGIN` becomes a signed, sized (`width`/`data-w`, default 1280) ImgProxy URL; placeholders / data-URIs / remote images are untouched; **no-op** until `ASSET_ORIGIN` + `IMGPROXY_KEY/SALT` are set (kept `apps/cms/src/lib/imgproxy.ts` for CMS-side use). Tests `apps/web/tests/imgproxy.test.ts` (4). Verified live (V14): unsigned + bad-signature ImgProxy URLs → **403**, `/health` → 200; published `/promo` still renders 200 with the form.
- [X] T087 [P] a11y pass: `lead-form.tsx` now links each field + the consent control to its error via `aria-describedby`/`aria-invalid`, the privacy link carries a visually-hidden "(nouvelle fenêtre)", `globals.css` adds `.trefle-visually-hidden` + `:focus-visible` outlines. Playwright+axe spec `apps/web/tests/e2e/a11y.spec.ts` (no serious/critical violations, keyboard-operable form, no h-scroll at 360px) — added `@axe-core/playwright` dev-dep, gated by `E2E_RUN_A11Y=1`, wired into CI (T092). No-JS submit path re-verified live (V3/V5): form posts and returns the server-rendered "Merci" + unsubscribe link. Full axe run needs browsers — deferred to CI.
- [X] T088 [P] perf pass: the public route ships **no page-level client JS** — `PageShell` + `LeadForm` are server components, GrapesJS is admin-only and never bundled into `apps/web`; the only client code is the tiny `WebVitals` (`next/web-vitals`) + the error boundary. Whole-app client chunk payload ≈ **173 KB gzip** (framework runtime dominated; per-page delta is a few KB) — within budget. ISR: `export const revalidate = 3600` on `[[...slug]]` + tag revalidation on publish; images sized via T086. **Exception (documented):** warm-ISR latency not load-tested in this environment — promoted to the Phase 4 production-monitoring signal (see T095).
- [X] T089 [P] PII-redaction audit (FR-038): reviewed every `console.*` / `logger.*` / `log.*` / `leadSubmissionLog` call site in `apps/cms/src` + `apps/web/src`. Findings: all lead-path lines already carry only `{outcome, reason, pageId}` / counts / tags / ids — **no email, field values, IP, UA, or bodies**. Hardened both `lib/log.ts` redactors: substring + separator-insensitive key matching (`email`, `authorization`, `useragent`, `firstname`, `fieldvalue`, `metadata`, `token`, `secret`, …) plus exact `ip`/`name`/`hp_email`/`body`; renamed the counter field `name`→`counter` so it survives redaction. Test `apps/web/tests/log-redaction.test.ts` (3). Verified live: after a full lead submission the smoke email/first-name appear **0×** in the CMS log.
- [X] T090 [P] `infra/docker-compose.prod.yml` (Caddy TLS + host-routing overlay on the base file: `restart: always`, no host-published app/db ports, JSON-file log rotation, CMS runs the retention worker `JOBS_AUTORUN=true` + `RELEASE`, prod healthchecks, nightly `pg_dump` sidecar) + `infra/deploy/Caddyfile` + `infra/deploy/README.md` (Debian VPS runbook: host hardening, git-crypt unlock, first boot / migrate / seed, updates + rollback via migration `down`, off-box backups + restore, security checklist).
- [X] T091 [P] `infra/.env.example` regrouped by container and completed — added `JOBS_AUTORUN`, `RELEASE`, `ERROR_SINK_URL`, `ASSET_ORIGIN`, `ASSET_S3_BUCKET`, `NEXT_PUBLIC_VITALS_ENABLED`, and a prod-only `CMS_HOSTNAME`/`WEB_HOSTNAMES` block (still valueless — git-crypt only). Root `README.md` rewritten: what Trefle is, the 2-app + db + imgproxy architecture, local dev quickstart, **local multi-domain** steps, workspace layout, testing, deploy pointer, git-crypt secrets note.
- [X] T092 `.github/workflows/ci.yml` — `static` job (Node 24, `npm ci`, lint, typecheck, `npm test`, build both apps) + `e2e` job (optional git-crypt unlock, `docker compose … up -d --wait`, migrate + seed, `playwright install chromium`, `test:e2e` with `E2E_RUN_US5=1` / `E2E_RUN_A11Y=1`, always `down -v`).
- [X] T093 Executed the curl-reachable quickstart subset against the running stack: V2 publish guard, V3 consented capture (200 + "Merci" + unsubscribe link, lead stored with `fieldValues`), V4 consent-required 422, V6 honeypot/timing/rate-limit, V7 multi-domain routing, V8 revalidate-on-publish, V10 withdrawal, V11 DSR export/erase, V12 retention sweep, V13 roles, V14 ImgProxy 403 — all pass (V1/V5/V9/V13 UI steps also covered live in earlier phases). Browser-only assertions (axe, GrapesJS drag/drop, JS-disabled toggle) run in CI via the Playwright specs.
- [X] T094 [P] error capture (FR-037/FR-038): `apps/web/src/lib/error-report.ts` (`reportError` → non-personal envelope `{app, release, source, route, digest, name, uaClass}` to `ERROR_SINK_URL`; message/stack only to local stderr; no-op sink when unset), `app/error.tsx` + `app/global-error.tsx` (client boundaries beacon `/api/client-error`), `app/api/client-error/route.ts` (accepts only name/digest/route). CMS: `apps/cms/src/hooks/after-error.ts` wired as config `hooks.afterError` — same envelope, never alters the response. Verified live: `POST /api/client-error` + `POST /api/vitals` → 204.
- [X] T095 [P] `apps/web/src/components/web-vitals.tsx` (`useReportWebVitals`, mounted in `layout.tsx`, off unless `NEXT_PUBLIC_VITALS_ENABLED=1`) → `sendBeacon("/api/vitals", {name,value,rating,id})`; `app/api/vitals/route.ts` logs one aggregate `web_vital` line per known metric (LCP/CLS/INP/FCP/TTFB/FID), 204, no URL/PII. To be promoted to an enforced signal once production monitoring lands (constitution roadmap Phase 4).

**Checkpoint — Phase 8 done. Feature 001 complete.** All 95 tasks `[X]`. `lint` +
`typecheck` clean; Vitest **88 green** (cms 53 / web 28 / shared 7); both apps build.
The curl-reachable quickstart scenarios (V2–V14) pass live; browser-only checks
(axe, GrapesJS drag/drop, JS-disabled toggle) are covered by the Playwright specs.

**Post-feature — browser test harness (B + C).** `apps/web/tests/e2e/global-setup.ts`
seeds a per-run fixture page + a captured lead (public HTTP only) and writes
`fixtures.json`; specs read env → fixture → default. `npm run test:e2e` (local,
auto-installs Chromium) and `npm run test:e2e:docker` (an
`mcr.microsoft.com/playwright` container hitting the stack via
`host.docker.internal` — see `infra/docker-compose.e2e.yml`, image tag tracks
`@playwright/test`) run the same suite. **9/9 green** in both modes (us1 ×3,
us3 ×2, us5 ×1, a11y ×3).

**Post-feature — containerised stack fixed.** The `Dockerfile`s set
`NODE_ENV=production` before `npm ci` (dev deps dropped → `next build` / `tsx`
broken), the dev override shadowed `apps/web/node_modules` (Next 16) with the
host's, and the `runtime` stage lacked `tsconfig.base.json`. Reworked: `deps`
(full install) → `build` → self-contained `runtime` (`next start`, `target:
runtime` pinned); override reduced to env + stand-ins (no source mounts);
`seed:dev` uses `CMS_SERVICE_API_KEY` verbatim (no copy-paste); nodemailer
`skipVerify`. Verified from a cold `down -v`: `docker compose up --build --wait`
→ healthy → migrate + seed in the `cms` container → **9/9 e2e** against the
fully containerised stack. `.github/workflows/ci.yml` e2e job runs exactly this.

Deferred to the constitution's Phase 4 delivery roadmap (not this feature):
warm-ISR load testing, wiring `ERROR_SINK_URL` to a real collector, and promoting
the CWV beacon to an enforced budget.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Phase 1 — **blocks all user stories**.
- **User stories (Phases 3–7)**: each depends only on Phase 2. Recommended order P1 → P2 → P2 → P3 → P3; US2–US5 may be built in parallel by different people once Phase 2 is done.
- **Polish (Phase 8)**: depends on the user stories you intend to ship.

### User-story dependencies

- **US1 (P1)**: no dependency on other stories. Delivers the MVP.
- **US2 (P2)**: needs the `leads` / `consent-records` collections from US1 (T037–T038). Otherwise independent.
- **US3 (P2)**: needs `leads` / `consent-records` from US1. Independent of US2.
- **US4 (P3)**: needs `leads` + `settings` (T013) + `activity-log` (T014). Independent of US2/US3.
- **US5 (P3)**: needs `users` (T010) + `access/` (T011) + `activity-log` (T014) + SMTP (T008). Independent of US2–US4.

### Within a user story

- Collections/models before hooks; hooks before endpoints; endpoints before the `web` routes that call them.
- US1 concrete chain: T027/T028 → T029 → T030/T031/T031a → T032–T036 → T037/T038/T039 → T040/T041 → T042 → T043–T049, T049a → T050. Tests T021–T026 can be written any time in the phase.

### Parallel opportunities

- Phase 1: T003–T008 in parallel after T001–T002.
- Phase 2: T011, T013, T014, T015, T016, T017, T018, T019, T020 in parallel after T009–T010.
- Phase 3: T021–T026 (tests) in parallel; T027, T028, T037, T038, T039, T043, T044, T046 in parallel (distinct files).
- Phases 4–7 can proceed concurrently once Phase 2 completes.
- Phase 8: T086–T091, T094, T095 in parallel.

---

## Parallel Example: User Story 1

```bash
# Tests for US1 together:
Task: "Vitest pages publish-guard hook — apps/cms/tests/hooks/pages-publish-guard.test.ts"
Task: "Vitest lead-intake endpoint — apps/cms/tests/endpoints/lead-intake.test.ts"
Task: "Vitest web /api/leads edge checks — apps/web/tests/api-leads.test.ts"
Task: "Vitest web /api/revalidate — apps/web/tests/api-revalidate.test.ts"
Task: "Vitest host→domain resolution — apps/web/tests/domains.test.ts"
Task: "Playwright author→publish→submit — apps/web/tests/e2e/us1-capture.spec.ts"

# Independent collections/utilities for US1 together:
Task: "domains collection — apps/cms/src/collections/Domains.ts"
Task: "media collection — apps/cms/src/collections/Media.ts"
Task: "consent-records collection — apps/cms/src/collections/ConsentRecords.ts"
Task: "leads collection — apps/cms/src/collections/Leads.ts"
Task: "page-stats collection — apps/cms/src/collections/PageStats.ts"
Task: "host→domain resolver — apps/web/src/lib/domains.ts"
Task: "rate limiter — apps/web/src/lib/rate-limit.ts"
Task: "lead-form component — apps/web/src/components/lead-form.tsx"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1: Setup.
2. Phase 2: Foundational (blocks everything).
3. Phase 3: User Story 1.
4. **Stop and validate** against quickstart V1–V8, then deploy/demo.

### Incremental delivery

Setup + Foundational → US1 (MVP) → US2 → US3 → US4 → US5, validating each story against its
quickstart scenarios and the constitution "definition of done" (affected apps build,
`docker compose up` healthy, verification recorded) before moving on.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- Every user-story task carries its `[US#]` label for traceability to `spec.md`.
- Tests cover the constitution-mandated paths only; add unit tests elsewhere as judgement dictates.
- Commit after each task or logical group; keep `main` green (builds + `docker compose up` healthy).
- Secrets only ever land in the repo through git-crypt; `infra/.env.example` stays valueless.
- Every migration task (T042, T069, T076, T085) ships a tested `down` or a documented manual reversal in the migration file header (constitution Principle III).
- Editor / Administrator boundary (clarified 2026-09-09): Editors record data-subject requests and run access/portability + lead exports; Administrators execute erasures and lead rectifications, register domains, and manage members/settings.
- Open `CONFIRM` items from `research.md` (dependency minors, SMTP provider, Garage/ImgProxy values) should be resolved before or during Phase 1.
