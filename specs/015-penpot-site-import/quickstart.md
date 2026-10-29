# Quickstart / validation guide: Import a website from a Penpot file (015)

Prerequisites:
- The dev stack, with both compose files:
  `docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml up --build`
- The migration applied: `npm run cms -- payload:migrate`.
- `PENPOT_IMPORT=on` in `infra/.env` for the `cms` service.
- Outbound HTTPS from `cms` to `fonts.googleapis.com` / `fonts.gstatic.com`
  (font download, research P8) — or `GOOGLE_FONTS_CSS_URL=http://import-fixture/css2`
  for the offline stand-in (what CI uses; it knows EB Garamond 400 only).
- Local Penpot (optional, to look at the source designs): `../penpot/`,
  `docker compose -p penpot up -d`, http://localhost:9001.

Contracts: [site-import-api.md](contracts/site-import-api.md),
[penpot-conversion.md](contracts/penpot-conversion.md). Data:
[data-model.md](data-model.md).

## 1. Automated checks

```bash
npm run typecheck && npm run lint && npm run test
npm run test:e2e:docker
```

Must include:
- package: every guarantee of penpot-conversion.md on hand-written shapes,
  plus the committed fixtures
  `packages/grapesjs-page-import/tests/fixtures/blog-mini.penpot` (boards
  « Accueil » and « Article ») and `agence-mini.penpot` — origin and licence
  in that folder's README.
- cms: zip limits (zip bomb, 30 001 entries, not a zip, Penpot 1 bytes,
  two files in the manifest), analyse/start/cancel validation and access,
  flag off → 404 everywhere, job cleanup (failure in `save` after the first
  page deletes that page and the Media, and removes the file), 1 h sweep of
  `analysed` imports, font dedupe (second import downloads nothing),
  `domains` font hook (unknown family/weight refused, files deduplicated
  across domains, rows merged), font-usage counts.
- web: the page shell emits exactly the domain's `@font-face` rules, none
  for a domain without fonts.
- e2e: the drop zone is absent until a domain is chosen; choose it, upload
  the fixture, untick one board, change a path, confirm, open a
  created draft in the editor, publish it, follow a link on the public page.

## 2. Manual walkthrough

### 2a. Domain fonts (User Story 4)

1. Domains → the local dev domain → tab « Polices » → add `EB Garamond`,
   weights 400 + 700, italic → save. The row shows the font, and `fonts`
   lists 8 files (2 weights × 2 styles × 2 subsets).
2. Add `Garamont Pro` → saving is refused with « Police introuvable sur
   Google Fonts : Garamont Pro ».
3. Open a page of that domain in the editor → EB Garamond is at the top of
   the font list and renders in the canvas. Set a heading to it, publish.
4. Public page: the heading is in EB Garamond. In the browser's network tab,
   the font comes from the assets address, with an
   `Access-Control-Allow-Origin` header, and nothing goes to
   `fonts.googleapis.com` or `fonts.gstatic.com`.
5. Back on the domain: the EB Garamond row says « utilisée par 1 page ».

### 2b. Site import

1. Pages list → « Importer un site Penpot »: only the domain select is
   shown. Choose the local dev domain; the drop zone appears with
   « Site pour <domaine> ». Drop
   `../penpot/references/trefle-ref-4-the-journal.penpot`.
2. Penpot page « Site » is offered alongside the library pages; choose it →
   6 boards in reading order, `Accueil` proposed as `/`, `À propos` as
   `/a-propos`.
3. Language is pre-filled with the domain's default. If the domain already
   has a published page at `/`, `Accueil` carries « déjà publiée sur ce
   domaine ». Untick `Guides`. Confirm → progress through parse, fonts,
   images, build, check, save.
4. 5 drafts named `Accueil_<date>_<time>` … in the Pages list, each with the board name alone as its SEO title,; each opens in the editor and is
   editable block by block; report panel shown. The domain's « Polices » tab
   now lists Inter Tight (and the weights used); the report names it under
   the fonts added to the domain.
5. Report of `Accueil`: the « GUIDES » links are listed as links that could
   not be made (their board was unticked). `Contact` is a `mailto:` link.
6. Publish `Accueil` and `Article`; on the public site, click a post title on
   `Accueil` → `Article` opens.
7. Import the same file again on the same domain → the published addresses
   (`/`, `/article`) are marked « déjà publiée sur ce domaine »; 6 new drafts
   named with the new time; the published pages are unchanged; publishing the new
   `Accueil` is refused while the old one is published at `/`.
8. From Domains → open the local dev domain → « Importer un site Penpot » →
   the wizard opens on the file step with that domain already chosen; an
   inactive domain shows no button.
9. « Changer de domaine » after the analysis → back to step 1; the abandoned
   analysis is left `analysed` and its file is removed by the 1 h sweep.
10. Edge files: `trefle-ref-2-blog.penpot` → the two « Article » boards are
   proposed as `/article` and `/article-2`; `trefle-ref-1-agence.penpot` →
   the `javascript:` link and the link to the « Cover » page are listed in
   the report, and hover interactions are listed as ignored;
   `trefle-ref-3-wireframe.penpot` → the boards are imported, reported as
   freely positioned, with an action before publishing; a Penpot 1 file
   (`Basic layouts template.penpot` from penpot-files) is refused with the
   re-export message.

## 3. Fidelity evaluation (SC-002, SC-003, SC-006)

For each board of the four reference files:
1. Penpot rendering: `../penpot/references/generator/render.sh <file-id>
   <board> <out.png>` (Penpot's own exporter).
2. Trefle rendering: the device-check screenshots of the import (desktop,
   tablet, mobile, 360 px).
3. Judge desktop side by side: « clearly the same design » yes/no, texts
   identical (SC-002). Check that there is no horizontal overflow at 360,
   768 and 1280 px (SC-003, from the device-check report). Note the import
   duration (SC-006, < 2 min for 5 boards).

Record results in `specs/015-penpot-site-import/evaluation.md` (one row per
board: fidelity, overflow, duration, notable losses), as 012 did for T070.
