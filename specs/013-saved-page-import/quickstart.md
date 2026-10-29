# Quickstart / validation guide: Import a page from a saved file (013)

Prerequisites: the 012 stack and fixture mode ([012 quickstart §0](../012-url-page-import/quickstart.md)).
Contract: [contracts/start-file.md](contracts/start-file.md). Data: [data-model.md](data-model.md).

## 1. Automated checks

```bash
npm run typecheck && npm run lint && npm run test
docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml exec -T cms npm --workspace @trefle/cms run test:browser
npm run test:e2e:docker
```

Must include:
- saved-file parsing: MHTML (base64, quoted-printable, binary parts), HTML
  with SingleFile / "saved from url" markers, original-address detection
  (public kept, internal / non-http dropped), corrupt input.
- start endpoint (multipart): 413 over 25 MB, `unsupported-file` for a PDF
  renamed `.html` and for a ZIP, `missing-file`, budgets as for addresses.
- job: temp file removed on completed / failed / cancelled / timeout and by
  the sweep; `sourceKind` / `sourceFileName` recorded.
- test:browser — a crafted saved page: its script does not run, its
  `<img src="http://cms:3000/…">` and `fetch('http://169.254.169.254')` are
  refused, the main document never reaches the network, embedded `data:`
  images become `embedded:<n>` in the extract and Media after import.
- e2e — blocked fallback keeps the wizard fields; discreet link; fixture page
  saved as MHTML imports to a draft identical in blocks to the address import.

## 2. Manual walkthrough (fixture mode)

1. Wizard → « Importer depuis une page web » → address
   `http://import-fixture/blocked-waf` → « Le site a bloqué la visite
   automatique » with the save instructions and « Importer la page
   enregistrée ».
2. Click it: title, type, domain, path, language are still filled; drop
   `apps/web/tests/e2e/fixtures/import-source/saved/fixture.mhtml` → the
   import runs and opens the draft. Report: « Page importée depuis
   http://import-fixture/index.html ».
3. Same with the SingleFile save (`fixture.singlefile.html`): images come
   from the file (Media items created, nothing fetched from import-fixture —
   check its access log).
4. Discreet link « Vous avez déjà la page enregistrée ? » under the address:
   drop a file directly.
5. Drop a PDF → refused at once with the accepted formats. Drop a 30 MB file
   → refused with the 25 MB limit.
6. Cancel a file import → no page, no Media, the temp file is gone
   (`ls /tmp/trefle-page-imports` in the cms container).

## 3. Real pages (with 012 T070)

Save https://www.mariages.net/ and https://parisjetaime.com/ from a desktop
browser as single files and run them in the 012 reference-set evaluation
(012 quickstart §4). SC-002 of this feature: both meet the same bar as the
address imports.

## Verification log

**2026-09-28 — §1 and §2 (fixture mode), branch `012-url-page-import`** (T023).

§1 — typecheck and lint clean on all workspaces; `npm run test`: cms 437,
web 117, grapesjs-page-import 68, shared 9 passing; `test:browser` 14/14
(incl. MHTML, SingleFile and the hostile file); e2e 40 passed, 1 skipped
(us5-roles, quarantined), incl. the three 013 scenarios.

§2:

| Step | Result |
|---|---|
| 1–2 | e2e: `blocked-waf` → « Le site a bloqué la visite automatique » with the save help → « Importer la page enregistrée » → title / path still filled → `fixture.mhtml` → draft with the lead form in its column; report « Page importée depuis http://import-fixture/index.html ». |
| 3 | Script (REST): `fixture.mhtml` and `fixture.singlefile.html` each import to a draft with 3 Media and **0** `GET /img/` in import-fixture's access log during the import (the same log shows 84 image requests from address imports over the same period, so the check is not vacuous). |
| 4 | e2e: the discreet link « Vous avez déjà la page enregistrée ? » → SingleFile save → draft. |
| 5 | Script: a PDF → 400 `unsupported-file`; a 30 MB file → 413 `file-too-large`; e2e: a PDF refused in the wizard at once. |
| 6 | Script: a cancelled file import → `cancelled`, no page, no Media, `/tmp/trefle-page-imports` empty. |

§3 (real pages) is T024, run by the user in production.
