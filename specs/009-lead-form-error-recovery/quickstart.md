# Quickstart: validate lead-form error recovery

Assumes the local Docker stack is running and seeded with at least one
published page carrying a multi-field lead form (`text`/`email`/`textarea`/
`select`/`checkbox`). Validation guide only — implementation belongs in
`tasks.md`.

## 1. One field wrong, everything else survives (User Story 1)

- Open the page, fill in every field correctly except leave one required
  text field blank, submit.
- Confirm the response lands back on the same page (same URL content, not
  a separate generic error page), with every field you typed still showing
  your input, and an inline error only next to the field you left blank.
- Correct that field and resubmit: confirm it succeeds exactly as a normal
  first-attempt submission would (confirmation page or success message).

## 2. Each failure mode marks the right field (SC-002)

Repeat submission with, one at a time:

- an invalid email format → error next to the email field, value still
  shown (even though it's invalid);
- the consent checkbox left unchecked, everything else valid → error next
  to the consent control (`errors.consent`), not a generic message;
- a `select` field left on its placeholder while required → error next to
  it.

Confirm no case falls back to the old bullet-list error page.

## 3. Surrounding page content is untouched (User Story 2)

- On a page with content blocks before and after the lead-form block,
  trigger a validation failure and confirm that content renders exactly as
  it does on a normal page view — same images, same styling.
- With GTM configured for the domain, view source on the error response
  and confirm the tagging snippet is present, including a
  `lead_form_submit_error` dataLayer push with `path`, `formPageId`, and
  `reason` (`validation_failed` or `consent_not_given`) — full parity with
  the pre-existing `contracts/datalayer-events.md` contract (research.md
  §6).

## 4. Anti-bot token still works after a real correction (SC-004, Edge Cases)

- Trigger a validation failure, wait a couple of seconds (as a real visitor
  reading the error would), correct the field, and resubmit: confirm it
  succeeds — no spurious "un instant, réessayez" timing rejection caused by
  the retry itself.

## 5. Values never leak into logs or the URL (research.md §2)

- Submit with a validation failure using a distinctive, greppable email
  address.
- Confirm the redirect `Location` header (`/form-retry?err=...&page=...`)
  contains neither that email nor any other submitted field value — only
  an opaque token and the page id.
- Grep the reverse proxy's access log (`infra/deploy/`, Caddy) for that
  email address: confirm no match.

## 6. Non-field failures are unchanged (FR-008)

- Trigger the honeypot (fill the hidden `hp_check` field): confirm the
  response is still the silent "Merci" page, unchanged.
- Submit fast enough to trip the anti-bot timing check: confirm the
  response is still the existing generic "un instant" page, not a
  redirect to `/form-retry`.
- Submit to an unpublished page / an unknown host / while rate-limited:
  confirm each still returns its existing response (`409`/`403`/`429`)
  unchanged.

## 7. Flash record expiry / restart degrades gracefully (research.md §4)

- Trigger a validation failure, then manually restart the `web` container
  before following the redirect (simulating the in-memory record being
  gone).
- Confirm `/form-retry` falls back to the page's normal URL with a fresh,
  blank form — not an error page.
- Repeat, but with `page` pointing at a since-deleted/unpublished page id:
  confirm the minimal fallback message renders instead of a crash.
