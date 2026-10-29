# Quickstart: validate page types

Assumes the local stack is already running and seeded (see the repo
[README](../../README.md)). Validation guide only — implementation belongs
in `tasks.md`.

## 1. Migration backfills existing pages to `subscription`

```bash
npm --workspace @trefle/cms run payload:migrate
```

Pick any page that existed before this feature via the REST API
(`GET /api/pages/<id>`) — confirm `pageType: "subscription"` and every
other field unchanged.

## 2. `free` page: no lead-form allowed, none required

- Create a page, `pageType: "free"`, content with no lead-form block.
  Publish — succeeds.
- Add a lead-form block to it. Try to publish — rejected, message names the
  lead-form/type conflict.

## 3. `confirmation` page: no lead-form, unsubscribe placeholder required

- Create a page, `pageType: "confirmation"`, content includes
  `{{unsubscribeUrl}}`, no lead-form block. Publish — succeeds.
- Remove the placeholder. Try to publish — rejected, message names the
  missing link.
- Add a lead-form block back (placeholder still present). Try to publish —
  rejected, message names the lead-form/type conflict.

## 4. `subscription` unchanged

- Create a page, `pageType: "subscription"` (the default — don't touch it),
  one lead-form block, full form config. Publish — succeeds exactly as
  before this feature.
- Remove the lead-form block. Try to publish — rejected the same way it
  always was.

## 5. Starter templates per type

- Create a page of each type via the admin (`/admin/collections/pages/create`).
  Since US4 landed, this route always redirects to the wizard first (§7)
  unless reached via REST — the scenarios below describe the two paths
  separately.
- **Via the wizard** (the normal UI path): the block editor already shows
  the chosen type's own starter on first paint — no save needed (§7,
  SC-008). This supersedes the older "canvas shows the subscription preview
  until first Save" caveat below for anyone going through the wizard.
- **Via REST, or by changing `pageType` directly in the raw create form**
  (bypassing the wizard, still possible outside the normal UI flow):
  `subscription` shows the hero+lead-form starter immediately (unchanged
  from 003, since it's the field-level default); `free`/`confirmation`
  show the subscription preview until the first Save (the server-side
  `applyStarterTemplate` hook only runs then) — after saving once, reopen
  the page and confirm the canvas now shows that type's own starter (no
  lead-form for `free`; the merci message + placeholder for
  `confirmation`).
- Publish `free`/`confirmation`'s starter unedited — succeeds, unchanged
  content and all (this is the new behaviour 004 enables). `subscription`'s
  starter content (block-level) is correct out of the box too, but — as in
  003, FR-020, unchanged by 004 — publishing still requires the separate
  form-configuration panel (an email field, a success message) to be filled
  in first; that requirement was never part of the "starter" content itself.
- Edit a starter (delete/add a block) — behaves exactly like a page built
  from scratch, nothing locked.

## 6. `pageType` never reaches a visitor

```bash
curl -s <a published page's public URL> | grep -i pageType
```

Expected: no output (grep finds nothing) — confirm for at least one page of
each type.

## 7. Guided creation flow

- In the admin, click "Create New" on Pages — confirm landing on the guided
  step, not the raw create form.
- Navigate directly to `/admin/collections/pages/create` — confirm an
  automatic redirect back to the guided step.
- Fill domain + path matching an **existing** page (draft or published) —
  confirm the step blocks with a message naming that page, before any
  document is created.
- Change to a non-conflicting domain + path (or leave both blank), fill
  title, pick each of the three types in turn, complete the step each
  time — confirm the block editor opens already showing that type's starter
  content on the very first paint, with no save needed to see it (SC-008).
- Publish each unedited — succeeds for all three, per §2–§4 above.

## Full regression

```bash
npm --workspace @trefle/cms run lint
npm --workspace @trefle/cms run typecheck
npm --workspace @trefle/cms test
```

All green, plus the existing e2e suite unaffected (`apps/web` needs no
change for this feature).
