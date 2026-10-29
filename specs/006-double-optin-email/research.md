# Phase 0 Research: Double opt-in confirmation email

## 1. Content lives in its own collection, `opt-in-emails` — never "confirmation" alone

**Decision**: A new collection, slug `opt-in-emails`: `subject` (text),
`body` (textarea, not richText/GrapesJS — see §2), `language`
(relationship to `languages`, required). `pages.optInEmail` is an
optional `relationship` to it.

**Rationale**: Mirrors `pages.confirmationPage`'s existing shape (an
optional relationship to a piece of content, picked per page) — the
proven pattern for "attach a related piece of content to a page" already
in this codebase. Deliberately not folded into `pages` itself (as a
GrapesJS-block type or a field group) — this content has nothing to do
with the block editor or public rendering; it only ever gets read
server-side to build an email. The collection/field names spell out
"opt-in"/"email" everywhere, never bare "confirmation" (spec.md Context
— this codebase's `pageType: "confirmation"` already owns that word).

**Alternatives considered**: a `group` field on `pages` holding
subject/body inline — rejected: it couldn't be reused across pages (every
subscription page in the same language would need its own copy pasted
in), and languages/pages already established the "shared content lives in
its own collection, referenced by relationship" pattern.

---

## 2. Email body is a plain textarea, not richText or GrapesJS

**Decision**: `body` is a `textarea` field holding hand-authored HTML (or
plain text — the author's choice), sent as-is as the email's HTML body.

**Rationale**: Principle I (Simplicity First) — the smallest primitive
that does the job. GrapesJS's block-tree output is built for a full
webpage (external stylesheet classes, layout assumptions) and isn't
email-client-safe HTML without a dedicated export step this codebase has
never built; Payload's `lexicalEditor` (already configured globally) is
lighter but its HTML export is still unproven here for email-client
portability, and introducing it for exactly one field is premature next
to a plain textarea that already works everywhere. Revisit only if plain
HTML textareas prove genuinely limiting once this ships.

**Alternatives considered**: `richText` (lexical) — rejected for now, per
above; reusing `builderField` (GrapesJS) — rejected outright, wrong tool
for an email body.

---

## 3. The confirmation-link placeholder is enforced at save time, field-level

**Decision**: `body`'s field-level `validate` rejects a value that
doesn't contain the literal string `{{confirmUrl}}` (FR-002).

**Rationale**: Exact same mechanism `languages.code`'s format check and
`domains.hostname`'s format check already use (a field-level `validate`
function) — no new hook file needed for a single-field, single-collection
rule. Chosen over `pages-publish-guard.ts`'s pattern (which enforces
`{{unsubscribeUrl}}` on confirmation *pages*, but only at publish time)
because `opt-in-emails` documents have no draft/publish lifecycle at all
(they're never publicly rendered — nothing to "publish") — save-time is
the only meaningful checkpoint.

---

## 4. A page's opt-in email must match the page's own language — enforced on `pages`, async field validate

**Decision**: `pages.optInEmail`'s field-level `validate` (async) loads
the target `opt-in-emails` document (`req.payload.findByID`) and rejects
if its `language` doesn't equal the page's own `language` (FR-004). The
field's `filterOptions` also scopes the admin picker to the page's
current language, so this is normally unreachable through the UI — the
validate function is the real, API-level enforcement.

**Rationale**: Same "belt (UI filter) + suspenders (server validate)"
shape 005 already established for `languages.isActive` filtering on
`pages.language`/`domains.defaultLanguage`. An async field-level
`validate` (Payload supports this) keeps the check colocated on the field
it protects, rather than a new whole-collection hook file for one
cross-reference rule.

**Alternatives considered**: a `beforeChange` hook on `pages` (like
`publishGuard`) — rejected as heavier than needed for a single field
comparison; field-level `validate` is the established precedent for
single-field rules in this codebase (`languages.code`,
`domains.hostname`).

---

## 5. Sending is synchronous, inline in `leadIntakeEndpoint` — not the Jobs queue

**Decision**: Immediately after creating the lead (and consent record),
if `page.optInEmail` is set, build the confirmation link and call
`req.payload.sendEmail(...)` directly, wrapped in try/catch that only
logs on failure (FR-008) — never queued as a Payload Job.

**Rationale**: This codebase already has exactly one precedent for
"send an email as a side effect of creating a record" —
`users-invite.ts`'s `usersSendInvite` — and it does this synchronously,
wrapped in try/catch, specifically so a mail failure "must not block the
invite." That's the same shape FR-008 needs here, so it's reused, not
reinvented. The Jobs queue (`jobs/retentionSweep.ts`) exists in this repo
but is configured for a **daily** cron sweep
(`jobs.autoRun: [{ cron: "0 3 * * *" }]`) — queuing a confirmation email
there would mean it might not send for up to 24 hours, wrong for a
transactional email a visitor expects within moments of submitting.
Building a second, fast-cadence job queue just for this is real added
infrastructure for a problem synchronous sending with try/catch already
solves.

**Alternatives considered**: a new, fast-polling Jobs Queue autoRun
config — rejected: changes shared job-queue infrastructure (affecting the
existing retention sweep's own queue) for a problem that doesn't need it;
a dedicated outbound-email microservice/queue — rejected outright,
disproportionate to a single transactional email.

---

## 6. Confirmation link: a dedicated secret, same shape as the unsubscribe token

**Decision**: New `CONFIRM_TOKEN_SECRET`, and
`signConfirmToken`/`verifyConfirmToken` added to `apps/web/src/lib/tokens.ts`
— deterministic HMAC of the lead id, no expiry, byte-for-byte the same
shape as the existing `signUnsubscribeToken`/`verifyUnsubscribeToken`
pair in the same file.

**Rationale**: A dedicated secret per purpose is this file's own existing
convention (`FORM_TOKEN_SECRET`, `UNSUBSCRIBE_SECRET`, `REVALIDATE_SECRET`
are all independent, `signPreviewToken` is the one exception that reuses
`FORM_TOKEN_SECRET` deliberately for a same-purpose token) — a
confirmation token controls something about a specific lead's opt-in
state, close enough to the unsubscribe token's own job that its *shape*
should be identical, but a *different* secret keeps the two token spaces
from being interchangeable. No expiry, matching spec.md's Assumption
(mirrors the unsubscribe link, not the 24h preview link).

Deployment: like `UNSUBSCRIBE_SECRET` today, `CONFIRM_TOKEN_SECRET` must
be set to the same value in both `apps/cms` (which signs the link) and
`apps/web` (which verifies it) — `infra/.env`/`.env.example` gain one new
line, same as every existing shared secret.

---

## 7. New public route: `/confirm`, mirrors `/unsubscribe` exactly

**Decision**: `apps/web/src/app/confirm/page.tsx` — same shape as the
existing `apps/web/src/app/unsubscribe/page.tsx`: no login, the token is
the bearer, a Server Action posts to a new CMS endpoint, neutral
non-enumerating responses throughout, works with JavaScript unavailable.

**Rationale**: This is precisely the same problem
(`/unsubscribe`/`verifyUnsubscribeToken`/`consent-withdraw`) already
solved once in this codebase — reusing the shape is Principle I, not
just convenience. Differs only in copy ("votre email est confirmé" vs.
"consentement retiré") and in calling a new endpoint.

**New CMS endpoint**: `POST /api/leads-confirm`, `{ leadId }` — same
shape as `consentWithdraw.ts`'s `consent-withdraw` endpoint: service-or-staff
auth, idempotent (sets `leads.optInConfirmedAt` only if not already set),
always responds `{ ok: true }` even for an unknown/already-erased lead
(non-enumerating, FR-011).

---

## 8. A domain's sender identity: two plain fields, `payload.sendEmail`'s `from` handles the rest

**Decision**: `domains.senderName` (text, optional) and
`domains.senderEmail` (email, optional). At send time:
`from: senderEmail ? (senderName ? `${senderName} <${senderEmail}>` : senderEmail) : undefined`
— when `from` is `undefined`, `payload.sendEmail` already falls back to
the adapter's own `defaultFromAddress` (`SMTP_FROM`), which is exactly
FR-006's required fallback, for free.

**Rationale**: `SendEmailOptions.from` is a plain per-call override on
Payload's own `sendEmail` — no new SMTP transport, no per-domain
credentials, nothing beyond two text fields. This is exactly how Brevo
(and any relay) supports multi-domain sending in practice: one API
key/relay, several DKIM/SPF-authenticated sending domains, and the `From`
header simply picks which one — see spec.md's Assumptions for the
DNS-authentication prerequisite this relies on (external, not automated
here).

---

## 9. Deleting an opt-in email still attached to a page is blocked, not silently nulled

**Decision**: A `beforeDelete` guard on `opt-in-emails`, same `find` +
`APIError` shape as `pages-confirmation-guard.ts`'s
`confirmationGuardOnDelete` (and 005's `languages-lifecycle.ts` delete
guard) — rejects, naming the referencing page(s), if any page still has
this email attached.

**Rationale**: `pages.optInEmail` is optional/nullable, so nothing at the
database level would actually break if this were skipped (unlike 005's
`pages.language` bug) — but silently nulling out a page's selected opt-in
email out from under an editor is the exact problem
`confirmationGuardOnDelete` already exists to prevent for
`confirmationPage`. Not explicitly asked for in spec.md, but a natural,
low-cost consistency fix given the precedent already sits right next to
where this collection's own delete hook will live — same reasoning 005
applied to its own `languages` delete guard.

---

## 10. Migration: one straightforward, hand-off-the-shelf migration — no backfill needed

**Decision**: `payload generate:types` + `payload migrate:create`, used
as generated, no hand-editing this time.

**Rationale**: Every new column here is optional/nullable
(`pages.opt_in_email_id`, `domains.sender_name`, `domains.sender_email`,
`leads.opt_in_confirmed_at`) and the new `opt-in-emails` table needs no
seed data (unlike 005's `languages`) — there's no `NOT NULL` step that
needs a backfill first, so the generated migration is already correct
as-is.
