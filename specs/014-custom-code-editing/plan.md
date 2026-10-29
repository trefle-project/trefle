# Implementation Plan: Custom code and direct HTML editing

**Branch**: `014-custom-code-editing` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-custom-code-editing/spec.md`

## Summary

Three ways out of the locked editor, all built on existing primitives:

1. **Page scripts** (P1): a new admin-only `customCode.scripts` group on
   `pages` (two snippets + a consent setting each), protected by Payload
   field-level access (read: admin or the renderer's service account; write:
   admin). The renderer adds the per-request CSP nonce to every `<script>` in
   a snippet and emits it raw: « Essentiel » snippets are live in the HTML
   and run as the browser parses it; consent-dependent snippets are emitted
   inert inside `<template>` and a tiny client runner activates them when the
   visitor accepts (or at load if they already did).
2. **« Code » view** (P1): a GrapesJS command + modal showing
   the page HTML/CSS in GrapesJS's own CodeMirror editors; « Appliquer » calls
   `setComponents`/`setStyle`. Before applying, the modal runs the same
   DOMPurify config as publication and lists what it removed
   (`DOMPurify.removed`). The allow-list in `@trefle/shared` is widened and
   becomes a single exported sanitize config. A `lead-form` component type is
   registered so the form placeholder survives a re-parse.
3. **« Code personnalisé » block** (P2): the GrapesJS component holds only a
   **reference** (`data-block="custom-code" data-code-id="…"`); the code lives
   in an admin-only `customCode.blocks` array on the page, so it never
   reaches the page HTML, the sanitizer, the canvas, or an editor's browser.
   The renderer swaps each placeholder for its snippet (same nonce/consent
   rules as page scripts), exactly like it swaps the lead-form placeholder
   today. A `beforeValidate` hook refuses a non-admin save that introduces an
   unknown code reference.

The CSP keeps its strict `script-src` (nonce + `'strict-dynamic'`) and opens
`connect-src`, `frame-src`, `media-src` and `style-src` to `https:` so vendor
tags work (research R3).

## Technical Context

**Language/Version**: TypeScript 5, Node ≥ 24, React 19.2, Next.js 16.3.4
(renderer; `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`
read — nonces require dynamic rendering, which public pages already are),
Payload 3.88.0, GrapesJS 0.22.16.

**Primary Dependencies**: existing — `isomorphic-dompurify` 4.2.0 (web),
`html-react-parser` 6.1.8 (web), `@payloadcms/ui` (`useAuth`, `useForm`).
**New**: `dompurify` 3.4.8 as a direct dependency of `apps/cms` (the exact
version `isomorphic-dompurify` already pulls in; client-side only, for the
« Code » view warning — see Principle II below). No new container.

**Storage**: PostgreSQL via one Payload migration — `customCode` group
columns on `pages` + `pages_custom_code_blocks` array table + new
`activity_log.type` enum value ([data-model.md](data-model.md)).

**Testing**: Vitest (`@trefle/shared`, cms, web) for the sanitize config,
nonce/consent rendering, access rules, the placeholder guard hook and the
variant copy; Playwright e2e (docker) for admin-only visibility, consent
activation without reload, scripts not running in the admin, the « Code »
view round-trip ([quickstart.md](quickstart.md)).

**Target Platform**: Docker Compose — local dev (base + override) and the
production VPS via `docker-compose.prod.yml`. No infra change except the
renderer's CSP (in code).

**Project Type**: Web monorepo (npm workspaces): `apps/cms`, `apps/web`,
`packages/shared`, `packages/grapesjs-page-import`.

**Performance Goals**: No measurable change for pages without custom code
(SC-006). The consent runner is a few hundred bytes and only rendered when a
page has consent-dependent code. Consent-dependent snippets run < 1 s after
« Accepter » (SC-008).

**Constraints**: Page markup still never runs code (FR-012); no page code in
the admin tool (FR-005); snippets ≤ 50 000 characters (FR-021); the lead form
still works without JavaScript and when a custom script throws (FR-022,
Principle V); third-party script weight is outside the platform's 150 KB
budget (spec Assumptions).

**Scale/Scope**: A handful of admins/editors, tens of pages. ~4 CMS modules
(field, hook, editor command, block type), 3 renderer changes (CSP, shell,
runner), 1 shared module, 1 migration.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| **I. Simplicity First** | No code editor library (GrapesJS's bundled CodeMirror viewers); no generic "snippet" collection — two groups on `pages`; code blocks reuse the lead-form "placeholder swapped by the renderer" pattern; permission enforcement is Payload field access, not a custom layer. The only new hook is the placeholder guard (FR-018). | ✅ |
| **II. Stack-Native, Minimal Additions** | Payload field-level access + hooks + migration; GrapesJS commands, modal and component types; Next nonce mechanism already in place. **New dependency** `dompurify` in `apps/cms`: needed so the « Code » view warns with the *exact* sanitizer publication uses (FR-014/FR-015); same version already in the lockfile via `isomorphic-dompurify`, ~20 KB gz, admin bundle only, actively maintained. | ✅ with justification |
| **III. Small, Reversible Changes** | Expand-only migration (new nullable columns/table/enum value), documented down path. Deliverable as 3 PRs in story order (allow-list + « Code » view → page scripts + CSP → code block), each leaving `main` up. Undo: revert; or clear the admin fields to remove any page code instantly. | ✅ |
| **IV. Working Software Over Ceremony** | Automated tests planned for all logic the constitution names: field access rules, the guard hook, the variant copy, the sanitize config, nonce injection, consent rendering/runner, CSP header. e2e smoke on a page with scripts + code block + edited HTML. | ✅ |
| **V. Quality the User Feels** | Plain-French warnings (dropped markup, no-banner consent, size limit, editor refusal); the « Code » view handles empty/error states (unparsable markup shows what GrapesJS understood; cancel is lossless). Lead form unaffected by script failures (snippets are isolated `<script>` elements). No new platform JS on pages without consent-dependent code. axe still runs on published pages. | ✅ |
| Architecture / secrets | No new container or secret. Renderer still reads via the service account. | ✅ |
| **Amended decisions** | 002 FR-004 (renderer CSP) and 003 FR-003 (allow-list) are amended, not violated; both specs get a pointer to 014 in the same PR. | ✅ recorded |

*Post-design re-check (after Phase 1)*: unchanged — the design adds no
abstraction beyond the two field groups, one hook, one runner, one command.

## Project Structure

### Documentation (this feature)

```text
specs/014-custom-code-editing/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R10
├── data-model.md        # Phase 1 — fields, access, migration
├── quickstart.md        # Phase 1 — validation scenarios
├── contracts/
│   ├── rendering.md     # how the renderer emits snippets, nonce, consent, CSP
│   └── editor.md        # GrapesJS « Code » view, custom-code block, roles
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
packages/shared/src/
├── html-allowlist.ts          # widened lists + SANITIZE_CONFIG (single source, FR-015)
├── custom-code.ts             # NEW: marker names, consent values, size limit, nonce injection helper
└── blocks.ts                  # + "custom-code" block type (not counted as a content block for the guard)

apps/cms/src/
├── fields/customCode.ts       # NEW: `customCode` group (scripts.head/bodyEnd, blocks[]) + field access
├── fields/grapesjs/
│   ├── Editor.client.tsx      # role-aware: code view command, custom-code block/type for admins, lead-form type
│   ├── codeView.ts            # NEW: GrapesJS command + modal (HTML/CSS code editors, dropped-markup list)
│   ├── customCodeBlock.ts     # NEW: component type (placeholder in canvas, admin modal editing the form row)
│   └── blocks.ts              # (unchanged list; custom-code block added only for admins in Editor)
├── components/ScriptsConsentWarning.tsx  # NEW: FR-008b warning (domain without banner)
├── hooks/pages-custom-code-guard.ts      # NEW: FR-018 (non-admin can't introduce unknown code refs)
├── hooks/pages-activity.ts    # + `page-code-changed` entry (FR-023)
├── endpoints/createTestVariant.ts        # copy `customCode` (FR-006)
├── collections/Pages.ts       # register field (Scripts tab) + hook
└── migrations/2026MMDD_custom_code.ts    # NEW

apps/web/src/
├── middleware.ts              # CSP: connect/frame/media/style-src https: (R3)
├── lib/render.ts              # sanitizeHtml uses SANITIZE_CONFIG; renderPageBody swaps custom-code placeholders
├── lib/custom-code.tsx        # NEW: <CustomCode snippet consent nonce> (live vs <template>)
├── components/consent-code-runner.tsx    # NEW: client runner (activate templates on consent)
├── components/cookie-consent-banner.tsx  # dispatch `tf:consent` event on decide
├── components/page-shell.tsx  # head/bodyEnd snippets, code-block slots, nonce prop
└── app/{[[...slug]],ab-variant/[pageId],(preview)/preview/[pageId]}/page.tsx  # pass nonce + banner flag
```

**Structure Decision**: existing monorepo layout; no new package. Shared
constants and the sanitize config live in `@trefle/shared` because both apps
and the import tests use them (FR-015).

## Delivery (PRs, in order)

1. **Allow-list + « Code » view (US2)** — shared config, sanitizer, lead-form
   type, code view, `dompurify` dep. Amends 003 FR-003.
2. **Page scripts + CSP + consent runner (US1)** — field, migration, access,
   activity, variant copy, renderer, runner, banner event. Amends 002 FR-004.
3. **Code block (US3)** — block/type, `customCode.blocks` rendering, guard hook.

## Complexity Tracking

No violations to justify.
