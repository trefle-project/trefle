# Tasks: Custom code and direct HTML editing

**Input**: Design documents from `/specs/014-custom-code-editing/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: included — the constitution (Principle IV) requires automated tests for access rules, hooks, endpoints, data transformations and the renderer logic this feature touches; the contracts list the test obligations.

**Format**: `- [ ] T### [P?] [Story?] Description with file path`

## Phase 1: Setup

- [x] T001 Add `dompurify` `3.4.8` (exact, same version already in the lockfile via `isomorphic-dompurify`) as a dependency of `apps/cms/package.json`; run `npm install` at repo root and confirm only `package-lock.json` + `apps/cms/package.json` change
- [x] T002 [P] Add the pointer « Amended by 014-custom-code-editing (widened allow-list, single SANITIZE_CONFIG) » under FR-003 in `specs/003-post-launch-improvements/spec.md`

---

## Phase 2: Foundational (blocks US1 and US3)

**Purpose**: the shared constants/helpers and the admin-only `customCode` storage both code stories rely on. US2 does NOT depend on this phase and may start right after Phase 1.

- [x] T003 Create `packages/shared/src/custom-code.ts` exporting `CUSTOM_CODE_MARKER = "custom-code"`, `CODE_ID_ATTR = "data-code-id"`, `CONSENT_VALUES = ["consent", "essential"] as const` (+ `Consent` type), `CUSTOM_CODE_MAX_LENGTH = 50_000`, `withNonce(snippet, nonce)` (adds `nonce="<nonce>"` to every `<script` opening tag, case-insensitive, followed by whitespace or `>`; removes any existing `nonce` attribute on that tag first; nothing else in the string changes) and `codeIdsIn(html)` (every `data-code-id` attribute value, in order); re-export from `packages/shared/src/index.ts`
- [x] T004 [P] Unit tests for `withNonce` (adds; replaces a pasted nonce; `<SCRIPT>` upper case; several scripts; `<scripts>`/`<noscript>` untouched; non-script markup byte-identical) and `codeIdsIn` (none, several, single/double quotes) in `packages/shared/tests/custom-code.test.ts`
- [x] T006 [P] Add `"page-code-changed"` to `ACTIVITY_TYPES` in `packages/shared/src/domain.ts` and to the `type` select options in `apps/cms/src/collections/ActivityLog.ts`
- [x] T007 Add `adminOrServiceFieldRead: FieldAccess` (active admin OR `isService`) to `apps/cms/src/access/index.ts`, next to `adminFieldOnly`
- [x] T008 Create `apps/cms/src/fields/customCode.ts`: group `customCode`, admin label « Scripts », collapsible closed by default; field access on the group `read: adminOrServiceFieldRead`, `create`/`update: adminFieldOnly`; children per data-model.md — `head` and `bodyEnd` groups (labels « Dans l'en-tête de la page », « En fin de page »), each `code` textarea `maxLength: CUSTOM_CODE_MAX_LENGTH` (50 000, optional, monospace via `admin.style`) and `consent` select `"consent" | "essential"`, `defaultValue: "consent"`, labels « Nécessite le consentement cookies » / « Essentiel »; `blocks` array `admin.hidden: true` with `codeId` text required, `code` textarea `maxLength` 50 000, `consent` select default `"consent"`; array `validate` rejecting duplicate `codeId` within the page; size error message « Le code dépasse la limite de 50 000 caractères. »
- [x] T009 Register `customCode` in `apps/cms/src/collections/Pages.ts` after the `seo` field
- [x] T010 Generate the migration with `npm run cms -- payload migrate:create custom_code` into `apps/cms/src/migrations/`; review it is expand-only (new nullable columns for `custom_code_head_*`/`custom_code_body_end_*`, new table `pages_custom_code_blocks`, new enum value `page-code-changed`); make the down path drop table/columns and leave the enum value with a comment explaining why (data-model.md § Migration); register in `apps/cms/src/migrations/index.ts`
- [x] T011 Field-access tests in `apps/cms/tests/access-custom-code.test.ts`: admin reads/writes `customCode`; editor read omits `customCode`; editor update (local API `overrideAccess: false`) with a new `customCode.head.code` leaves the stored value unchanged; service account reads it on a published page
- [x] T012 Add the new fields to the page type used by the renderer (`PublishedPage` / page shape) in `apps/web/src/lib/payload-client/` (`customCode?: { head?: {code?: string; consent?: Consent}; bodyEnd?: …; blocks?: {codeId: string; code?: string; consent?: Consent}[] }`)

**Checkpoint**: admins can store code on a page; editors can't see or change it; nothing is rendered yet.

---

## Phase 3: User Story 1 — Page scripts (Priority: P1) 🎯 MVP

**Goal**: an admin pastes vendor snippets in « Scripts »; they run on the public page (with consent rules); editors can't touch them.

**Independent Test**: quickstart.md §2.

### Tests for US1

- [x] T013 [P] [US1] Render tests for the emission table of `contracts/rendering.md` (one per row: essential live; consent + banner → `<template data-tf-consent>`; consent without banner → nothing; preview → template + runner `always`; empty code → nothing) and the head split (`<meta>`/`<link>`/`<title>` rendered as React elements, the rest raw at body start) in `apps/web/tests/custom-code-render.test.tsx`
- [x] T014 [P] [US1] Runner tests (jsdom) in `apps/web/tests/consent-code-runner.test.tsx`: no activation without consent; activation when `tf_consent` cookie is `accepted`; activation on `tf:consent` event `accepted`; none on `rejected`; external-then-inline order preserved (inline waits for `load`); a throwing script doesn't stop the next; `always` activates immediately; each template activated once
- [x] T015 [P] [US1] CSP header test asserting the exact directive list of `contracts/rendering.md` § CSP (with and without https) in `apps/web/tests/middleware-csp.test.ts`
- [x] T016 [P] [US1] Test that `createTestVariant` copies `customCode` (row ids stripped) in `apps/cms/tests/create-test-variant.test.ts`
- [x] T017 [P] [US1] Test `pageActivity` writes one `page-code-changed` entry with `meta.parts` when `customCode` changes and none otherwise in `apps/cms/tests/pages-activity-code.test.ts`

### Implementation for US1

- [x] T018 [US1] Widen the CSP in `apps/web/src/middleware.ts` per research R3 (`style-src 'self' 'unsafe-inline' https:`, `connect-src 'self' https:`, `frame-src 'self' https:`, `media-src 'self' https: blob:`; `script-src` unchanged) and update the header comment to reference 014; add the pointer « Amended by 014-custom-code-editing (renderer CSP: connect/frame/media/style-src open to https:, admin snippets carry the nonce) » under FR-004 in `specs/002-security-hardening/spec.md`
- [x] T019 [US1] Create `apps/web/src/lib/custom-code.tsx`: `<CustomCodeSnippet code consent nonce bannerEnabled preview wrapperProps?>` implementing the emission table (`withNonce`, `display:contents` wrapper with `data-tf-code`, or `<template data-tf-consent>`), and `<HeadSnippetMeta code>` rendering only the snippet's top-level `<meta>`/`<link>`/`<title>` via `html-react-parser` (React hoists them) plus `stripHeadOnly(code)` returning the rest
- [x] T020 [US1] Create client component `apps/web/src/components/consent-code-runner.tsx` per `contracts/rendering.md` § ConsentCodeRunner (props `nonce`, `always?`; uses `parseConsentCookie` from `lib/consent-cookie.ts`)
- [x] T021 [US1] In `apps/web/src/components/cookie-consent-banner.tsx` `decide()`, dispatch `window.dispatchEvent(new CustomEvent("tf:consent", { detail: choice }))` after writing the cookie
- [x] T022 [US1] Extend `PageShell` in `apps/web/src/components/page-shell.tsx` with props `nonce`, `bannerEnabled`: head snippet (meta hoisted + rest as first body child), `bodyEnd` snippet as last child, and `<ConsentCodeRunner>` only when at least one consent template was emitted; escape `</style` in `builder.css` (`/<\/style/gi` → `<\\/style`, research R7b)
- [x] T023 [US1] Pass `nonce` (from `(await headers()).get("x-nonce")`) and `bannerEnabled` (`domain.consentBannerEnabled`) to `PageShell` in `apps/web/src/app/[[...slug]]/page.tsx` and `apps/web/src/app/ab-variant/[pageId]/page.tsx`; in `apps/web/src/app/(preview)/preview/[pageId]/page.tsx` pass `preview` so consent snippets run immediately (FR-007)
- [x] T024 [US1] Copy `customCode` in `apps/cms/src/endpoints/createTestVariant.ts` (strip array row ids with the existing `stripArrayRowIds`)
- [x] T025 [US1] In `apps/cms/src/hooks/pages-activity.ts`, write `page-code-changed` (actor, `meta: { path, domainId, parts }`) when `customCode.head`, `customCode.bodyEnd` or `customCode.blocks` differ between `previousDoc` and `doc` (deep compare), independently of the existing publish entries
- [x] T026 [US1] Create UI field `apps/cms/src/components/ScriptsConsentWarning.tsx` (reads `domain` + consent values with `useFormFields`, fetches `/api/domains/:id?depth=0`; shows the exact FR-008b message from `contracts/editor.md` when `consentBannerEnabled` is false and any snippet/block is « Nécessite le consentement cookies »; silent on loading/error) and register it first inside the `customCode` group in `apps/cms/src/fields/customCode.ts`; regenerate `apps/cms/src/app/(payload)/admin/importMap.js`; extend `MSG_SCRIPT` in `apps/cms/src/fields/grapesjs/codeViewMessages.ts` (and its test) with the pointer « Un administrateur peut les ajouter dans la section « Scripts » de la page. » now that the section exists
- [x] T027 [US1] e2e `apps/web/tests/e2e/us14-custom-code.spec.ts` — page scripts: essential head runs; consent end-of-page runs only after « Accepter » without reload and never after « Refuser »; no CSP violation logged; editor sees no « Scripts » section; the admin document and canvas never get the probe flag (SC-004). Follow the shared-login / X-Real-IP / `Authorization: JWT` conventions of the existing specs

**Checkpoint**: US1 fully usable; quickstart §2 passes.

---

## Phase 4: User Story 2 — « Code » view and widened allow-list (Priority: P1)

**Goal**: every editor can edit the page's HTML/CSS; more elements survive publication; nothing is dropped silently.

**Independent Test**: quickstart.md §3. Independent of Phase 2 — can ship as the first PR.

### Tests for US2

- [x] T028 [P] [US2] Sanitizer tests in `apps/web/tests/render.test.ts`: every tag/attribute added by FR-011 is kept (table family, button, video/audio/source/track, iframe with `allow`/`allowfullscreen`, inline svg + drawing elements, details/summary, `aria-*`, `role`); still removed: `script`, `style`, `on*`, `javascript:` href, `form`/`input`/`select`/`textarea`, `object`/`embed`, `iframe[srcdoc]`; custom-code placeholder `div[data-block][data-code-id]` kept; existing cases unchanged
- [x] T029 [P] [US2] Test that `</style>` inside `builder.css` cannot close the style element in `apps/web/tests/page-shell.test.tsx`
- [x] T030 [P] [US2] Unit tests for the dropped-markup message builder (script, on-attribute, javascript: URI, disallowed element, form/input → the exact French messages of `contracts/editor.md`; clean HTML → no messages) in `apps/cms/tests/code-view-messages.test.ts`

### Implementation for US2

- [x] T031 [US2] In `packages/shared/src/html-allowlist.ts`, widen `ALLOWED_TAGS`/`ALLOWED_ATTR` per FR-011 and research R7 (svg elements and presentation attributes listed there) and export `SANITIZE_CONFIG = { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: true, ALLOWED_URI_REGEXP: SAFE_URI_REGEXP }`; update the header comment (014, FR-015)
- [x] T032 [US2] Use `SANITIZE_CONFIG` in `sanitizeHtml` in `apps/web/src/lib/render.ts`
- [x] T033 [P] [US2] Point the import serializer's allow-list tests at `SANITIZE_CONFIG` in `packages/grapesjs-page-import/tests/` (the property test must still pass unchanged in behaviour)
- [x] T034 [US2] Create `apps/cms/src/fields/grapesjs/codeViewMessages.ts`: pure `droppedMarkupMessages(removed: DOMPurify.removed entries): string[]` producing the French messages of `contracts/editor.md` (deduplicated, one line per kind/tag)
- [x] T035 [US2] Create `apps/cms/src/fields/grapesjs/codeView.ts`: `registerCodeView(editor)` adding command `trefle:code-view` + options-panel button « </> Code » (title « Modifier le code HTML et CSS »); modal « Code de la page » with « HTML »/« CSS » monospace resizable textareas pre-filled from `exportHtml(editor.getHtml())` and `editor.getCss()`; « Vérifier et appliquer » runs `DOMPurify.sanitize(html, SANITIZE_CONFIG)` and `droppedMarkupMessages(DOMPurify.removed)`; no messages → apply; else list + « Revenir au code » / « Appliquer quand même »; apply = `editor.setComponents(html)` + `editor.setStyle(css)`; « Annuler » closes without change
- [x] T036 [US2] Register a `lead-form` component type in `apps/cms/src/fields/grapesjs/Editor.client.tsx` (before `projectData` loads — via a small inline plugin in the `plugins` array): `isComponent` on `data-block="lead-form"`, `droppable: false`, `editable: false`, no children; call `registerCodeView(editor)` after init
- [x] T037 [US2] e2e in `apps/web/tests/e2e/us14-custom-code.spec.ts` — « Code » view: editor adds a table + button + iframe and applies; undo restores; `onclick` + `<script>` are listed before apply and absent from the published page; lead-form still a placeholder after apply and the page publishes

**Checkpoint**: US2 fully usable; quickstart §3 passes.

---

## Phase 5: User Story 3 — « Code personnalisé » block (Priority: P2)

**Goal**: an admin positions a code widget in the page; it renders there live; editors can move/delete but not create or read it.

**Independent Test**: quickstart.md §4. Depends on Phase 2 and on T019/T020 (US1 rendering helpers).

### Tests for US3

- [x] T038 [P] [US3] Guard-hook tests in `apps/cms/tests/pages-custom-code-guard.test.ts`: editor introducing an unknown `data-code-id` → `ValidationError` with « Seul un administrateur peut ajouter ou modifier un bloc de code personnalisé. »; editor removing a block → allowed; editor create with refs → refused; admin → allowed and orphan `customCode.blocks` rows dropped
- [x] T039 [P] [US3] Renderer tests in `apps/web/tests/render-custom-code.test.tsx`: placeholder replaced by its snippet at its position (top level and inside section › columns › column), wrapper keeps the placeholder `id`/`class`/`style`; unknown id → nothing; consent block → template in place; several blocks in page order; lead-form replacement unaffected

### Implementation for US3

- [x] T005 [P] [US3] Add `"custom-code"` to `BLOCK_TYPES` in `packages/shared/src/blocks.ts` (comment: 014 code block, counted like other blocks, no role in the lead-form rule) and a count case in `packages/shared/tests/blocks.test.ts` (moved from Phase 2: only the code block needs it)
- [x] T040 [US3] Create `apps/cms/src/hooks/pages-custom-code-guard.ts` per research R6 (`codeIdsIn` on incoming `builder.html`; stored ids via `req.payload.findByID({ overrideAccess: true, select: { customCode: true } })`; non-admin + unknown id → throw; admin → drop orphan rows) and add it to `beforeValidate` in `apps/cms/src/collections/Pages.ts`
- [x] T041 [US3] Extend `renderPageBody` in `apps/web/src/lib/render.ts` with a second replacement callback for `data-block="custom-code"` elements (`renderCode({ codeId, id, className, style })`), and wire it in `apps/web/src/components/page-shell.tsx` to `<CustomCodeSnippet>` using `page.customCode.blocks` (runner rendered if any consent template emitted)
- [x] T042 [US3] Create `apps/cms/src/fields/grapesjs/customCodeBlock.ts`: `registerCustomCode(editor, { isAdmin, onCreate, onEdit, getRow })` — component type `custom-code` (`isComponent` on `data-block="custom-code"`, `droppable/editable/copyable: false`, keeps `data-code-id`); canvas-only CSS (dashed outline, min-height 60px, `::before` « </> Code personnalisé — exécuté uniquement sur la page publiée », « (vide) » variant) injected in the canvas document; for admins only: block « Code personnalisé » in the library (drop → new `crypto.randomUUID()` id + `onCreate`) and double-click modal « Code personnalisé » (textarea with 50 000 counter, select « Consentement », « Enregistrer »/« Annuler » → `onEdit`)
- [x] T043 [US3] In `apps/cms/src/fields/grapesjs/Editor.client.tsx`: read the user with `useAuth()`; call `registerCustomCode` with `isAdmin`, `onCreate` → `addFieldRow({ path: "customCode.blocks", schemaPath: "pages.customCode.blocks", … })` seeding `{ codeId, code: "", consent: "consent" }`, `onEdit` → `dispatchFields` on `customCode.blocks.<index>.code|consent`, `getRow` → `getDataByPath("customCode.blocks")`
- [x] T044 [US3] e2e in `apps/web/tests/e2e/us14-custom-code.spec.ts` — code block: admin drops into a column, enters an essential widget, public page shows it in the column, canvas never runs it; consent block appears only after « Accepter »; editor has no block in the library and can't open it; editor forging a `data-code-id` in « Code » gets the refusal message

**Checkpoint**: all stories usable; quickstart §4 passes.

---

## Phase 6: Polish & cross-cutting

- [x] T045 [P] Update `apps/cms/src/fields/grapesjs/blocks.ts` header comment and `Editor.client.tsx` header comment to describe the 014 additions (code view, lead-form/custom-code types, roles)
- [x] T046 [P] Document the feature for operators (Scripts section, consent setting, code block, « Code » view, CSP limits: no inline `on…` handlers or `document.write` in vendor code) in `docs/code-personnalise.fr.md`
- [x] T047 Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:e2e:docker`; fix failures
- [x] T048 Manual quickstart §2–§5 on the local stack, including the vendor check (SC-002); record results in the PR body
- [x] T049 Axe check on a published page using a table, a video iframe and a code block (no new serious/critical violation, Principle V)

---

## Dependencies & execution order

- **Phase 1** → everything.
- **Phase 2** (T003–T012) blocks **US1** and **US3**. **US2** depends only on Phase 1.
- **US1** before **US3** (US3 reuses `CustomCodeSnippet` T019 and the runner T020).
- **Polish** after the stories it documents/verifies.

Suggested PR order (plan.md § Delivery): PR1 = Phase 1 + US2; PR2 = Phase 2 + US1; PR3 = US3 + Polish.

Within a story: tests (marked [P]) can be written in parallel, then implementation in listed order.

## Parallel examples

- Phase 2: T004, T006 together after T003.
- US1: T013, T014, T015, T016, T017 together; then T018 ∥ T021 ∥ T024 ∥ T025 (different files); T019 → T020 → T022 → T023.
- US2: T028, T029, T030, T033 together; T031 → T032; T034 → T035 → T036.
- US3: T038 ∥ T039; T040 ∥ T041 ∥ T042; then T043.

## Implementation strategy

- **MVP**: Phase 1 + Phase 2 + US1 — admins can install pixels and widgets with consent rules; the most requested unlock.
- Then US2 (benefits all editors, no DB change — can even be delivered first if preferred), then US3.
- Each phase ends at a checkpoint that leaves `main` working (Principle III); stop and validate with the matching quickstart section before continuing.
