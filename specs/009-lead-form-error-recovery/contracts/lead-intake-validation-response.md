# Contract delta: `POST /api/leads` validation-failure response

Base contract: `specs/001-landing-page-lead-capture/contracts/lead-intake.md`
(`POST /api/leads`, owned by `apps/web`). Only step 6/7 and the `422` row
change; everything else (host allow-list, honeypot, timing check, rate
limits, unpublished-page check, the `POST /api/lead-intake` call, retry/503
behaviour, and every response other than a per-field validation failure) is
unchanged.

## Steps 6–7 (per-field validation, consent) — behaviour delta

Today: on a required-field, email-format, or missing-consent failure, the
response is a standalone generic HTML page (title + bullet list of error
strings + a back link), status `422`. The visitor's submitted values are
discarded.

New behaviour:

1. The submitted values (minus `formToken`, `hp_check`) and a per-field
   error map (keyed by field `name`, plus `"consent"` for the consent
   control) are written to a short-lived, single-use, server-side record
   (`apps/web/src/lib/form-error-store.ts`; see research.md §2).
2. The response becomes a `303` redirect to
   `/form-retry?err=<opaque-token>&page=<pageId>` instead of a `422` body.
   `err` is a random lookup key, not a signed encoding of the values —
   nothing personal is present in the redirect's `Location`.
3. `GET /form-retry` (new route, `force-dynamic`) looks up and consumes
   that record, re-renders the visitor's own landing page
   (`PageShell`/`LeadForm`) with every field's value preserved and the
   failed field(s) marked inline, and issues a fresh anti-bot form token
   (research.md §1/§4/§5).

Unchanged: honeypot (still `200` "Merci" per current code, no dataLayer
event), anti-bot timing failure (still `422` inline per current code,
unaffected by this feature — see spec.md's edge cases), unknown host
(`403`), unpublished page (`409`), rate limiting (`429`), upstream
unavailable (`503`). None of those are per-field validation failures, so
none of them redirect to `/form-retry`.

## `GET /form-retry` (new, renderer-only, no `apps/cms` counterpart)

| Param | Req | Notes |
|---|---|---|
| `err` | no | opaque flash-store lookup key; absent, expired, or already-consumed ⇒ fall back (below) |
| `page` | yes | the CMS page id the submission was for — used both to resolve the record above (defense: a record's own `pageId` must match) and as the fallback target |

**Behaviour**:

1. `err` resolves to a live record whose `pageId` matches `page` → render
   that page with the record's `values`/`fieldErrors`, then delete the
   record (single-use).
2. `err` missing/expired/consumed, but `page` resolves to a live published
   page → redirect to that page's own normal path (fresh, blank form).
3. Neither resolves → minimal fallback message, mirroring
   `(confirmation)/confirmation/page.tsx`'s existing `fallbackPage()`.

This route is never linked to directly by any page content — it is only
ever reached via `/api/leads`'s redirect in case 2 above — so it carries no
new attack surface beyond what a `pageId`-keyed lookup already exposes
elsewhere in this codebase (e.g. `/preview/[pageId]`, `/ab-variant/[pageId]`).
