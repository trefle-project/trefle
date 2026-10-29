# Quickstart: validate content language tagging

Assumes the local stack is already running and seeded (see the repo
[README](../../README.md)). Validation guide only — implementation belongs
in `tasks.md`.

## 1. Migration seeds languages and backfills existing pages/leads

```bash
npm --workspace @trefle/cms run payload:migrate
```

- `GET /api/languages` returns exactly `fr`, `en`, `es`, `de`, all
  `isActive: true` (FR-002).
- Pick any page that existed before this feature (`GET /api/pages/<id>`) —
  confirm `language` resolves to `fr` and every other field is unchanged
  (SC-005).
- Pick any lead that existed before this feature (`GET /api/leads/<id>`) —
  confirm `language: "fr"` and every other field unchanged.

## 2. Manage the language list (User Story 1)

- In the admin, add a language (e.g. `it` / "Italiano") — it now appears in
  the page editor's `language` picker.
- Try adding `it` again — rejected as a duplicate.
- Deactivate `it` — it disappears from the picker for a *new* page, but any
  page already tagged `it` still saves and publishes normally.
- Deactivate `de`, `es`, `en` one by one, then try deactivating the last
  one (`fr`) — rejected: at least one active language must remain.

## 3. Tag a page (User Story 2)

- Create a page under a domain with **no** default language set. Try to
  save without picking a language — blocked.
- Pick a language, save — succeeds.
- Set a `defaultLanguage` on a domain. Start the creation wizard, pick that
  domain — the wizard's `language` select is pre-filled (still changeable
  before continuing).
- Edit an existing page's language, then check a lead already captured from
  it (from step 1 or step 4) — its `language` is untouched.

## 4. Capture a lead (User Story 3)

- Publish a page tagged `en`. Submit its lead form (as a visitor would, no
  language input anywhere in the form).
- `GET /api/leads?where[page][equals]=<pageId]` — the new lead has
  `language: "en"`, and the submission flow itself showed nothing extra.
- Change that page's language to `fr` — re-check the same lead: still
  `language: "en"`.
- Try deleting that page while the lead still exists — blocked, naming how
  many leads still reference it (pre-existing bug fixed alongside this
  feature — see spec.md Edge Cases).

## 5. Filter and export (User Story 5)

- In the Leads list, filter by `language` — only matching leads shown.
- Click "Export CSV" — open the file, confirm a `language` column is
  present with the expected codes per row.

## 6. Confirm `apps/web` is untouched (FR-012)

- `apps/web`'s `PublishedPage` type and everything
  `page-shell.tsx`/`[[...slug]]/page.tsx` reads still don't reference
  `language` anywhere — no rendering, copy, or routing change on any
  published page.
