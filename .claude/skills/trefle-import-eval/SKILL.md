---
name: trefle-import-eval
description: >-
  How to evaluate Trefle's page import (012-url-page-import T070) against
  real pages: free render-only dry runs, paid evaluation runs through the
  local stack with a real Claude API key, side-by-side source/import
  screens, and where to record results. Scripts live in
  apps/cms/scripts/import-eval/.
when_to_use: >-
  Use when re-measuring import quality or cost (after a change to the
  conversion prompt, IMPORT_AI_MODEL, IMPORT_AI_EFFORT, the wire format,
  the serializer or the layout blocks), when checking whether a URL can be
  imported at all, or when the user asks for an evaluation run / reference
  set / T070.
---

# Evaluating the page import

Everything runs against the **local** stack. Never against production.

## Rules

- **A run costs money** (≈ €0.2–0.6 per page with `claude-opus-5`, effort
  `medium`). Ask the user before every paid run, with the page count and an
  estimate. Dry runs are free.
- **The key never goes in the repo.** It lives in
  `../import-eval.env` (outside the repo, mode 600):
  `ANTHROPIC_API_KEY=…` and `IMPORT_AI_MODE=off`. `IMPORT_AI_MODE=off` is
  required: the dev overlay defaults it to `fixture` when empty.
  `infra/.env` is never edited for this.
- **Start the cms with both env files and both compose files** — a single
  `--env-file` replaces `infra/.env`; a single `-f` drops the dev overlay:

  ```bash
  docker compose --env-file infra/.env --env-file ../import-eval.env \
    -f infra/docker-compose.yml -f infra/docker-compose.override.yml up -d --build --wait cms
  ```

  Check: `… exec -T cms sh -c 'echo $IMPORT_AI_MODE'` prints `off`.
  Going back to fixture mode: the same command without the second
  `--env-file`.
- **Never run the e2e suite or `test:browser` while the cms is in real
  mode**: their imports would call Claude (money) and fail their fixture
  assertions. Switch back to fixture mode first (the start command without
  the second `--env-file`), and back to real mode only for a run.
- The local admin's monthly budget defaults to €10: raise it
  (`PATCH /api/users/1 {"importMonthlyBudgetEur": 50}`) before a run.
- Sites behind anti-bot services (Cloudflare, Akamai, DataDome…) come back
  `blocked`: the import never tries to get past them. They are evaluated
  through feature 013 (saved-file import), not by changing the importer.

## 1. Dry run (free)

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml \
  exec -T -w /app/apps/cms cms ../../node_modules/.bin/tsx scripts/import-eval/render.ts <url> …
```

One JSON line per URL: `ok` or the error code, tiles per device, extract
size, a rough input-token estimate. Use it to vet candidate pages and to
estimate a run's cost before asking.

## 2. Evaluation run (paid, ask first)

```bash
npx tsx apps/cms/scripts/import-eval/run.ts --out ../eval-t070/runN \
  elevalift=https://elevalift.fr/ goldentree=https://sp.goldentree.fr/p/mpr/mpr-p4/ …
```

A site that refuses the importer (`blocked`) is evaluated from a copy the
user saved in their browser (feature 013): `label=file:<path to .mhtml or
.html>` — the run uploads it like the wizard does, and compare.ts shows the
saved file as the source. Ask the user for the saved files; never try to get
past the site's protection.

Appends each import (status, duration, steps, cost, model, full report) to
`<out>/results.json` and prints the run total. Use a new `--out` per run so
runs stay comparable. The current reference set is in
`specs/012-url-page-import/quickstart.md` (appendix).

## 3. Screens for the reviewer

```bash
npx tsx apps/cms/scripts/import-eval/compare.ts --out ../eval-t070/runN
```

Publishes each draft on the local site-a (free page if it has no lead form —
comparison only), screenshots source and import at 1440 and 390 px, writes
`<out>/index.html`. Trefle's own cookie banner appears on the import screens;
it is not part of the import.

The verdicts ("clearly the same page" at desktop and 390 px, touch-up
minutes) are the user's. Look at the screens yourself too and point out
concrete differences, but don't record verdicts on the user's behalf.

## 4. Record

Add a run to "Evaluation log (§4)" in
`specs/012-url-page-import/quickstart.md`: settings (model, effort, what
changed since the previous run), per page duration / cost / device-check
findings / notes, totals, and SC-001 / SC-002 / SC-006 / SC-009 status.

## Diagnosing a failed import

- `ai-unavailable` right after `convert` starts: the API refused the request.
  Replay it with a tiny `max_tokens` from inside the cms container to read
  the message (a refused request is not billed). A 400 "compiled grammar is
  too large" means the output schema grew — see the wire format
  (`packages/grapesjs-page-import/src/ir-wire.ts`) and its optional-property
  guard test.
- `internal`: the cms log line `page_import_failed` carries `errorMessage`
  and Payload's field errors.
