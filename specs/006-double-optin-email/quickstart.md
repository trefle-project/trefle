# Quickstart: validate the double opt-in confirmation email

Assumes the local stack is running and seeded, with
005-content-language-tagging already applied (so `languages` has at
least `fr`/`en`). Validation guide only — implementation belongs in
`tasks.md`. Mailpit (`http://localhost:8025`) catches outgoing mail in
dev — no real Brevo send needed to validate this locally.

## 1. Migration adds the new fields/collection

```bash
npm --workspace @trefle/cms run payload:migrate
```

`GET /api/opt-in-emails` returns an empty list (no seed data needed —
research.md §10). Every existing page/domain/lead is unaffected — spot
check one of each.

## 2. Author a confirmation email (User Story 1)

- Create an opt-in email with a subject, a body **missing**
  `{{confirmUrl}}`, save — rejected.
- Add the placeholder, save — succeeds.

## 3. Attach it to a page (User Story 2)

- On a `subscription` page tagged `fr`, try attaching an `en`-language
  opt-in email — rejected.
- Attach an `fr` one instead — succeeds.
- Leave a different page's `optInEmail` unset — publish and submit it;
  confirm no email appears in Mailpit for that submission (User Story 2,
  Scenario 2 — zero regression).

## 4. Submit and receive the email (User Story 3)

- Set a `senderName`/`senderEmail` on the page's domain.
- Publish the page from §3, submit its lead form as a visitor would.
- Check Mailpit: an email arrived, `From` matches the domain's sender
  identity, subject/body match the attached opt-in email, and the link
  behind `{{confirmUrl}}` is a real `/confirm?token=...` URL.
- Remove the domain's sender identity, submit again — email still
  arrives, `From` is the platform default (`SMTP_FROM`).
- Stop Mailpit (or point `SMTP_HOST` somewhere unreachable), submit again
  — the lead is still created successfully (check via the admin/REST);
  the failure only shows up in the `cms` container's logs.

## 5. Click the link (User Story 4)

- Open the `/confirm?token=...` link from §4's email — confirms, lead's
  `optInConfirmedAt` is now set (check via REST/admin).
- Visit the exact same link again — succeeds the same way, timestamp
  unchanged.
- Visit `/confirm?token=garbage` — neutral failure page, no hint either
  way.

## 6. Staff visibility (User Story 5)

- In the Leads list, confirm `optInConfirmedAt` (or a friendlier label)
  is a visible column for the lead confirmed in §5.
- Export CSV — confirm the column is present with the right value; an
  unconfirmed lead's cell is empty.

## 7. Confirm nothing existing regressed

- `apps/cms` full suite + typecheck + lint.
- Re-check: the pre-existing leads-export/retention/DSR test suites still
  pass unmodified — `optInConfirmedAt` changes nothing about
  `consentStatus`-driven behavior (Clarifications, FR-012).
