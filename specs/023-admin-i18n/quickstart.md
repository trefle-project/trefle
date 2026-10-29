# Quickstart: validate 023-admin-i18n

Prerequisites: the dev stack up with both compose files (see the deploy
README), a seeded admin with 2FA, two extra members `fr@example.test` and
`en@example.test`.

## 1. Automated checks

```bash
cd /path/to/trefle
npm run lint && npm run typecheck && npm test
```

Expected: the type-check fails if any English catalogue key is missing
(admin and visitor); `admin-labels-config.test.ts` fails on any untranslated
label; edge `fetch.test.ts` covers the six public paths.

## 2. Installation language (US1)

- Settings → Default → admin language = Français. Sign out. The login page
  is French and its `<html lang>` is `fr`, whatever the browser language.
- Set English; within 30 s the login page is English.
- On the CMS container, confirm the proxy reaches the loopback endpoint:

```bash
cd /path/to/trefle/infra
docker compose -f docker-compose.yml -f docker-compose.override.yml exec cms node -e "fetch(process.argv[1]).then(r=>r.text()).then(console.log)" http://127.0.0.1:3000/api/globals/settings/admin-language
```

Expected: `{"language":"en"}` (or `fr`).

## 3. Member choice (US2)

- Installation French. `en@example.test` sets « English » on their account
  and saves: the next screen is English without signing out; sign out and
  in again: still English. `fr@example.test` stays French.
- Change the installation to English: `en@` unchanged, `fr@` (no choice)
  follows.

## 4. Coverage walk (US3–US5, SC-001/SC-002)

As `en@`: sign in with 2FA, create and publish a page in the editor, run an
import, read Pages Stats and an A/B verdict, export leads. Note every French
interface string met (expected: none, except AI-written report lines of an
import launched by a French member — R7). Repeat as `fr@` for English.

## 5. Visitor texts (US6, SC-007)

On an English page with a form: submit an invalid phone number, then a valid
lead; open the confirmation and unsubscribe links from the e-mail. All texts
are English. Same on a French page: wording unchanged. A Spanish page: the
built-in texts are English and carry `lang="en"`. Run axe on both pages.

## 6. Public paths (US7, SC-008)

```bash
curl -sI "http://site-a.localhost:3001/confidentialite?lang=en"
curl -sI "http://site-a.localhost:3001/mentions-legales"
curl -sI "http://site-a.localhost:3001/mesure-audience"
```

Expected: one `308` each, `location` = `/privacy?lang=en`, `/legal-notice`,
`/audience-measurement` (or the owner's own address for a domain that has
one). Footer and form links on a published page point to the new paths.
Creating an editor page at `/privacy` is refused.

## 7. Upgrade on a production-data copy (SC-005)

Restore a production dump (taken by the user, T067) locally, run the migrations, then check: Settings
admin language `fr`, every member « Installation default », every other
setting identical (diff of the Settings row and the users table before /
after, `admin_language` columns excepted), untouched default legal texts now
link to the new paths, edited ones unchanged.
