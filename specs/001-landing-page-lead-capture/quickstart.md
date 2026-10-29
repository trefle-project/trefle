# Quickstart: run & validate the landing-page + lead-capture stack

This guide proves the feature end to end on a laptop. It assumes the Phase 1 structure in
[plan.md](./plan.md) and the contracts in [contracts/](./contracts/). It is a validation
guide only — implementation belongs in `tasks.md`.

## Prerequisites

- Docker + Docker Compose v2
- Node.js 24 + npm (for running tests and workspace scripts outside containers)
- `git-crypt` and the project's git-crypt key (to decrypt `infra/*.env`)
- Local hostnames: add to `/etc/hosts` (or rely on `*.localhost` resolving to 127.0.0.1)
  ```
  127.0.0.1  admin.trefle.localhost  site-a.localhost  site-b.localhost  imgproxy.localhost
  ```

## One-time setup

```bash
git clone <repo> trefle && cd trefle
git-crypt unlock /path/to/trefle.key          # decrypts infra/*.env
cp infra/.env.example infra/.env              # only if starting without the encrypted files
npm install                                   # installs all workspaces
```

## Run the stack

`docker compose up` runs the same production images as the VPS (`Dockerfile`
`runtime` target) plus the local stand-ins (Mailpit, MinIO).

```bash
DC="docker compose --env-file infra/.env -f infra/docker-compose.yml -f infra/docker-compose.override.yml"
$DC up -d --build --wait
$DC exec cms npm --workspace @trefle/cms run payload:migrate   # create schema
$DC exec cms npm --workspace @trefle/cms run seed:dev          # admin, settings, sample domains
```

`seed:dev` creates: one `admin` (`admin@trefle.localhost` / `trefle-dev-123`), the
`service` API-key user (its key = `CMS_SERVICE_API_KEY` from `infra/.env`, verbatim),
`settings` with `retentionMonths=24`, and two domains `site-a.localhost`,
`site-b.localhost` (active).

For hot reload, run `cms` / `web` on the host instead (`npm --workspace … run dev`)
and bring up only `db minio minio-setup mailpit imgproxy` via compose.

| Service | URL | Purpose |
|---|---|---|
| `cms` | http://admin.trefle.localhost:3000/admin | Payload admin + GrapesJS editor |
| `web` | http://site-a.localhost:3001 | public renderer (host-routed) |
| `imgproxy` | http://imgproxy.localhost:8080 | image optimisation (signed URLs only) |
| Mailpit | http://localhost:8025 | catches onboarding / notification email |
| `db` | localhost:5432 | Postgres (Payload only) |

Health: `docker compose ps` all healthy; `curl -I http://site-a.localhost:3001` → 200 or 404
(not 5xx).

## Validation scenarios

Each maps to spec acceptance criteria; run them in order.

### V1 — Author & publish a page with a lead form (US1-1/2, FR-002/002a/003)
1. Log into the admin, create a page: title, add blocks (hero, text, **one** lead-form,
   CTA), reorder, set `domain = site-a.localhost`, `path = /`.
2. Add form fields (email + `firstName` text + a checkbox), set success message and (defaults
   fill) consent purpose + privacy URL/version.
3. Save as draft → visit `http://site-a.localhost:3001/` → **404** (not published yet).
4. Publish → within ~10s, reload → the page renders with blocks in order and the form.
   ✅ `GET /api/pages?...status=published` returns it; `activity-log` has `page-published`
   with your user as `actor`.

### V2 — Publish guard: exactly one form block (US1-3, FR-002a)
1. Duplicate the page, add a second lead-form block, try to publish → **rejected** with a
   "exactly one form block" message. Remove one, publish → succeeds.

### V3 — Capture a consented lead (US1-4, FR-010/011/015/017, SC-003/004)
1. On the published page, fill the form, tick consent, submit (with JS).
2. Confirmation message shown < 2s; an unsubscribe link is present.
   ✅ In admin: one `lead` (email, `firstName`, `metadata.utm/referrer/userAgent`,
   `submittedAt`), linked **immutable** `consent-record` (exact consent + purpose text,
   privacy version, timestamp, IP, user-agent). `page-stats.submissions` = 1.
3. Repeat with `?utm_source=news&utm_campaign=x` in the URL → new lead has those UTM values.

### V4 — Consent is mandatory (US1-5, FR-015/020)
1. Submit without ticking consent → **422**, field message, no `lead` created.
2. Inspect the form markup: consent checkbox is present and **not** pre-checked.

### V5 — Works without JavaScript (SC-010, FR-005)
1. Disable JS in the browser, submit a valid consented form → server-rendered success page
   with the success message and unsubscribe link. ✅ lead stored.

### V6 — Anti-spam (FR-035, SC-011)
1. Fill the hidden `hp_email` field via devtools and submit → **204**, nothing stored.
2. Submit the same form in < 2s of load (script) → **422** `timing`.
3. Submit 4× for the same email+page in a day → 4th returns **429**; the 2nd–3rd stored
   leads carry `isDuplicate = true`.

### V7 — Multi-domain routing (FR-006a)
1. Create a second page on `domain = site-b.localhost`, `path = /promo`, publish.
2. `http://site-b.localhost:3001/promo` → renders it; `http://site-a.localhost:3001/promo`
   → 404; unknown host → 404.

### V8 — Cache invalidation on publish (contracts/revalidation.md)
1. Edit the live page's hero text, save as draft → public page **unchanged** (no
   revalidation for drafts).
2. Publish → within ~10s the public page shows the new text.
   ✅ `web` received `POST /api/revalidate` with a valid signature and tags
   `page:<id>`, `domain:<id>`.

### V9 — Leads review & export (US2, FR-021/022/023/024, SC-008)
1. Admin → leads list: filter by page and date range; empty filter shows an explicit empty
   state.
2. Export "consented only" → CSV with all fields + consent status; withdrawn leads excluded.
   ✅ `activity-log` `leads-exported` entry with count and actor.

### V10 — Consent withdrawal (US3-3, FR-019/024)
1. Open the unsubscribe link from V3 → confirm page (no email shown) → confirm.
2. Lead now `consentStatus = withdrawn`, `consent-records.withdrawnAt` set; re-visiting the
   link is idempotent. Re-run V9 export → this lead is excluded.

### V11 — Data-subject rights (US3-1/2/4, FR-025/026/027)
1. Submit the same email on both `site-a` and `site-b`.
2. Admin → run **access export** for that email → JSON contains both leads + both consent
   records.
3. Create + confirm an **erasure** request → both leads' `email/fieldValues/metadata` and
   both consent records' `email/ip/userAgent` are nulled; `erasedAt` set; leads no longer
   appear in list/export. The `data-subject-requests` row is `completed` with dates and no
   `email`.

### V12 — Retention auto-delete (US4-2, FR-030/031/032, SC-007)
1. Set `settings.retentionMonths` to a tiny test value (or use the job's `--now-minus`
   dev flag), create a lead, run the `retention-sweep` job.
2. Lead personal fields nulled, `erasedAt` set, `activity-log` `retention-deletion` (no
   `actor`). The linked consent record's `email` / `ip` / `userAgent` are also nulled while
   its wording / version / timestamp fields remain (FR-031a). Non-expired leads untouched.
   Re-run the job → no double processing.

### V13 — Roles (US5-2/3/4, FR-034a/b)
1. As admin, invite `editor@trefle.localhost` as **Editor** → Mailpit shows the set-password
   email; complete it.
2. As that editor: can create/publish pages, view/export leads, record DSRs and run
   access/portability exports; **cannot** open Users or Settings (hidden + API returns 403).
3. As that editor, attempt to execute an erasure or rectify a lead → **refused**
   (Administrator required) (US5-3a).
4. Try to delete the only admin → refused ("at least one Administrator must remain").
5. Every membership change and export appears in `activity-log` with the acting member.

### V14 — Images via ImgProxy (Principle V)
1. Add an image block; the rendered page references an `imgproxy.localhost` **signed** URL
   sized for the block. An unsigned ImgProxy URL returns 403.

## Automated checks (CI target, Phase 4)

```bash
npm run lint            # all workspaces
npm run typecheck       # all workspaces
npm --workspace apps/cms run test        # Vitest: access, hooks, jobs, endpoints
npm --workspace apps/web run test        # Vitest: rate-limit, tokens, domain routing, revalidate
npm --workspace apps/web run test:e2e    # Playwright: V1, V3, V5, V8, V10, V13 headless
docker compose -f infra/docker-compose.yml up -d --wait   # stack health
```

All green + stack healthy = the feature is done per constitution Principle IV and the
Development Workflow "definition of done".
