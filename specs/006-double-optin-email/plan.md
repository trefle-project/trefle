# Implementation Plan: Double opt-in confirmation email

**Branch**: `006-double-optin-email` | **Date**: 2026-09-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-double-optin-email/spec.md`

## Summary

A new `opt-in-emails` content collection (subject/body/language,
mirroring `pages.confirmationPage`'s "optional attached content" shape),
selectable per subscription page and language-matched to it. Submitting a
page with one attached sends it — synchronously, inline in
`leadIntakeEndpoint`, exactly like `users-invite.ts` already sends admin
invite emails — from the page's domain's sender identity (two new
optional `domains` fields) or the platform default. A new `/confirm`
route (mirrors `/unsubscribe` exactly) records the click on the lead via
a new, idempotent, non-enumerating CMS endpoint. Nothing about
`consentStatus` or anything that reads it changes (Clarifications). No
migration backfill needed — every new column is optional.

## Technical Context

**Language/Version**: TypeScript, Node 24. Payload 3.88 + Next 16. Spans
both `apps/cms` (collection, hooks, endpoint, sending) and `apps/web`
(the `/confirm` route, token verification) — the same two-app split
`/unsubscribe` already has.

**Primary Dependencies**: Payload CMS's own `sendEmail` (already
configured via `nodemailerAdapter`, currently only used for admin invite
emails). No new npm dependency.

**Storage**: PostgreSQL 16. One new table (`opt-in-emails`) + four new
nullable columns (`pages.opt_in_email_id`, `domains.sender_name`,
`domains.sender_email`, `leads.opt_in_confirmed_at`). Generated migration
used as-is — no hand-editing, no backfill (research.md §10).

**Testing**: Vitest — mocked-`req.payload` unit tests for the new hooks/
endpoints/token functions, matching every existing test in this repo
(005 confirmed this codebase has no DB-backed integration harness; the
DB-dependent parts — the migration, the field-level async `validate`
against a real relationship, and the actual sent-email content — are
verified live against the local stack, same split 005 used).

**Target Platform**: Same Debian VPS / Docker Compose stack; one new
shared secret (`CONFIRM_TOKEN_SECRET`) added to `infra/.env`/`.env.example`
and both apps' `.env.local`, same deployment shape as `UNSUBSCRIBE_SECRET`
today.

**Project Type**: Existing multi-app monorepo. Unlike 004/005 (CMS-only),
this feature touches `apps/web` too — necessarily, since that's where
every existing public, unauthenticated, token-bearer route
(`/unsubscribe`, `/confirmation`) already lives.

**Constraints**: FR-008/SC-004 — a send failure must never fail the
triggering `POST /api/lead-intake` call. FR-012 — `consentStatus` and
everything that reads it (`leadsExport.ts`'s `consentedOnly` filter,
`retentionSweep`, the DSR endpoints) must be provably unaffected: none of
their existing tests should need to change.

**Scale/Scope**: Same single shared workspace as prior features. No new
external service — reuses the SMTP relay (Brevo in prod, Mailpit in
dev/CI) already configured.

## Constitution Check

| Principle | Check |
|---|---|
| I. Simplicity First | Reuses four existing patterns wholesale rather than inventing new ones: `pages.confirmationPage`'s attached-content shape (§1), `users-invite.ts`'s synchronous try/catch send (§5), `/unsubscribe`'s token-route shape (§7), and `pages-confirmation-guard.ts`'s delete-guard shape (§9) — see research.md for each. `body` is a plain textarea, not a new richText/GrapesJS surface (§2). |
| II. Stack-Native | Payload `relationship`/`text`/`textarea`/`email`/`date` fields, field-level `validate`, `beforeDelete` hook, `payload.sendEmail` (the adapter's own primitive), a Payload migration, Next.js Server Actions (already `/unsubscribe`'s mechanism) — nothing beyond the stack's own primitives. |
| III. Small, Reversible | 6 phases below, one commit each. Every new column is nullable/optional — no expand→backfill→contract needed, the migration is pure addition with a trivial `down()`. Each phase is independently revertible: Phase 2 (sending) doesn't require Phase 3 (the confirm route) to exist for Phase 1's content authoring to work, etc. |
| IV. Working Software Over Ceremony | New hooks (`opt-in-emails`'s delete guard, the field-level validates), the new `leads-confirm` endpoint, and `leadIntakeEndpoint`'s extended send path each get a regression test, matching this repo's mocked-`req.payload` convention (005 precedent for what isn't unit-testable — native Payload constraints, verified live instead and documented as a deviation, not skipped). |
| V. Quality the User Feels | The one new visitor-facing surface, `/confirm`, handles its loading/empty/error states explicitly (valid/invalid/already-used token) and works with JavaScript unavailable, matching `/unsubscribe`'s existing bar exactly — no new published-page surface, so 003's broader accessibility/performance work is unaffected. |

Gate: **PASS**. No complexity-tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/006-double-optin-email/
├── plan.md              # this file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── contracts/
    ├── optin-email-send.md   # Phase 1 output
    └── confirm-route.md      # Phase 1 output
```

### Source Code (repository root)

```text
apps/cms/src/collections/OptInEmails.ts          # new — subject/body/language, delete guard
apps/cms/src/collections/Pages.ts                # + optInEmail field (language-matched, async validate)
apps/cms/src/collections/Domains.ts              # + senderName/senderEmail fields
apps/cms/src/collections/Leads.ts                # + optInConfirmedAt field
apps/cms/src/hooks/optin-emails-lifecycle.ts     # new — beforeDelete guard (mirrors languages-lifecycle.ts's shape)
apps/cms/src/endpoints/leadIntake.ts             # + send the opt-in email when page.optInEmail is set
apps/cms/src/endpoints/leadsConfirm.ts           # new — POST /api/leads-confirm (mirrors consentWithdraw.ts)
apps/cms/src/endpoints/leadsExport.ts            # + optInConfirmedAt column
apps/cms/src/payload.config.ts                   # register OptInEmails + leadsConfirmEndpoint
apps/cms/src/migrations/<ts>_optin_email.ts      # new — generated, used as-is
apps/cms/src/payload-types.ts                    # regenerated
apps/cms/tests/optin-emails-lifecycle.test.ts    # new
apps/cms/tests/leads-confirm.test.ts             # new
apps/cms/tests/lead-intake.test.ts               # extended
apps/cms/tests/leads-export.test.ts              # extended
apps/web/src/lib/tokens.ts                       # + signConfirmToken/verifyConfirmToken
apps/web/src/app/confirm/page.tsx                # new — mirrors unsubscribe/page.tsx
apps/web/tests/tokens.test.ts                    # extended (if it exists — else new, mirroring cms's test style)
infra/.env.example                               # + CONFIRM_TOKEN_SECRET
apps/cms/.env.local, apps/web/.env.local          # + CONFIRM_TOKEN_SECRET (same value, dev)
```

**Structure Decision**: No new app or package. One new collection, three
extended ones, one new endpoint, one new public route — following the
exact file layout `/unsubscribe` + `consent-withdraw` already established
for "a token-bearer link that records something on a lead."

## Phasing

Each phase = one commit, independently revertible.

### Phase 1 — Schema: `opt-in-emails` + the four field additions

- `OptInEmails.ts` (subject/body/language, field-level `validate` on
  `body` for the placeholder), register in `payload.config.ts`.
- `Pages.ts`: `optInEmail` field, `filterOptions` + async `validate`
  (research.md §4).
- `Domains.ts`: `senderName`/`senderEmail`.
- `Leads.ts`: `optInConfirmedAt`.
- `payload generate:types` + `payload migrate:create`, applied as
  generated (research.md §10).

Verify: migration applies clean; `GET /api/opt-in-emails` returns `[]`;
spot-check existing pages/domains/leads unaffected.

### Phase 2 — Opt-in email lifecycle guard

- `optin-emails-lifecycle.ts`: `beforeDelete` guard (research.md §9),
  wired into `OptInEmails.ts`.
- Tests: delete blocked while attached to a page, naming it; delete
  succeeds once detached.

Verify: quickstart.md §2 (placeholder rejection — already covered by
Phase 1's field validate, confirmed here) plus the delete guard live.

### Phase 3 — Sending, at lead-intake time

- `leadIntake.ts`: a new local `confirmUrl()` helper, built the exact
  same way that file's existing `unsubscribeUrl()` already is — its own
  inline HMAC, signing with `CONFIRM_TOKEN_SECRET`, no cross-app import
  (`apps/cms` and `apps/web` are separate workspaces; `unsubscribeUrl()`
  already duplicates its HMAC locally rather than importing
  `apps/web/src/lib/tokens.ts`, and this follows the same precedent).
  Resolve `page.optInEmail`/`page.domain`'s sender fields, call
  `payload.sendEmail` wrapped in try/catch (contracts/optin-email-send.md).
- Tests: extend `lead-intake.test.ts` — email sent with the right
  `to`/`from`/subject/substituted body when `optInEmail` is set; nothing
  sent when it's unset; a `sendEmail` rejection doesn't fail the request.

Verify: quickstart.md §4 on the local stack (Mailpit).

### Phase 4 — The `/confirm` route

- `apps/web/src/lib/tokens.ts`: `signConfirmToken`/`verifyConfirmToken`
  (research.md §6).
- `apps/cms/src/endpoints/leadsConfirm.ts`: `POST /api/leads-confirm`
  (contracts/confirm-route.md), registered in `payload.config.ts`.
- `apps/web/src/app/confirm/page.tsx`: mirrors `unsubscribe/page.tsx`.
- Tests: `leads-confirm.test.ts` (idempotent, non-enumerating, 403 for a
  non-service/staff caller) + token round-trip tests alongside whatever
  already covers `signUnsubscribeToken`/`verifyUnsubscribeToken` (or a
  new file, matching that precedent).

Verify: quickstart.md §5 on the local stack, real browser click-through
(matching 005's Playwright verification for its own UI-facing piece).

### Phase 5 — Staff visibility

- `Leads.ts`: `optInConfirmedAt` in `defaultColumns`.
- `leadsExport.ts`: `optInConfirmedAt` in `HEADERS` + the row.
- Tests: extend `leads-export.test.ts`.

Verify: quickstart.md §6.

### Phase 6 — Verification pass

- `apps/cms` + `apps/web` full suite, typecheck, lint.
- Confirm zero change to `leadsExport.ts`'s `consentedOnly` logic,
  `retentionSweep`, DSR endpoints — their existing tests pass unmodified
  (FR-012).
- Live: quickstart.md §1-§7 end to end; confirm `CONFIRM_TOKEN_SECRET`
  documented in `infra/deploy/README.md`'s secrets list alongside
  `UNSUBSCRIBE_SECRET`.

## Risks

| Risk | Mitigation |
|---|---|
| A confirmation email send hangs and slows down the visitor's submission | `payload.sendEmail` is `await`ed inline (research.md §5) — a genuinely slow/hanging SMTP relay would add latency to `POST /api/lead-intake`. Out of scope to add a timeout in this feature (no existing precedent for one in `users-invite.ts` either); flag as a follow-up if it proves real in practice, same as this repo's other documented "tracked follow-ups." |
| An editor attaches a mismatched-language email via a raw API call, bypassing the admin UI's `filterOptions` | The async field-level `validate` is the real enforcement, not the UI filter — covered by Phase 1's own test, not just live verification. |
| `CONFIRM_TOKEN_SECRET` missing in one app but not the other (deploy drift) | Same class of risk `UNSUBSCRIBE_SECRET` already carries today, no new mitigation invented — `requireSecret()` throws clearly if unset, and `infra/deploy/README.md`'s existing secrets checklist gets this one line added (Phase 6). |
| The opt-in email's `{{confirmUrl}}` placeholder is present but the wrong link scheme is built for a `.localhost` vs. real domain | Reuses `unsubscribeUrl()`'s exact existing scheme rule (`.localhost` → `http`, else `https`) — not reinvented. |
