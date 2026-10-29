# Quickstart / validation guide: Custom code and direct HTML editing (014)

How to prove the feature works end to end. Contracts:
[rendering.md](contracts/rendering.md), [editor.md](contracts/editor.md).
Data: [data-model.md](data-model.md). Decisions: [research.md](research.md).

## 0. Prerequisites

- Stack up with both compose files (the dev overlay is required):
  `docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml up --build`
- Migration applied: `npm run cms -- payload:migrate`.
- Two users: one admin, one editor (active).
- One domain with the cookie banner **enabled** (`consentBannerEnabled`),
  one with it **disabled**.

## 1. Automated checks

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e:docker
```

Expected: all green. Must include the test obligations listed in
[rendering.md](contracts/rendering.md#test-obligations) and
[editor.md](contracts/editor.md#test-obligations), plus:

- `packages/grapesjs-page-import`: the existing allow-list property test
  now runs against `SANITIZE_CONFIG` and still passes (import emits no
  script, no code block).
- `apps/web`: every existing render test unchanged (SC-006).
- e2e `us14-custom-code.spec.ts` (new): the scenarios of §2–4 below that
  don't need a real third-party vendor.

## 2. Page scripts (US1)

Use test snippets that leave visible evidence:

- head, « Essentiel »:
  `<meta name="tf-probe" content="head"><script>document.documentElement.dataset.head="1"</script>`
- end of page, « Nécessite le consentement cookies »:
  `<script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script><script>window.confetti&&confetti();document.documentElement.dataset.end="1"</script>`

1. As **admin**, open a page on the banner-enabled domain → « Scripts »
   section → paste both, set consents as above, save.
   → Published page: `<meta name="tf-probe">` is in `<head>`;
   `html[data-head="1"]` set; `data-end` **absent**; banner visible.
2. Click « Accepter » → without reload, confetti fires and
   `html[data-end="1"]` is set. Reload → it runs at load. No CSP error in
   the console.
3. New private window, click « Refuser » → `data-end` never set.
4. Move the page to the banner-disabled domain (or open a page there) →
   the Scripts section shows the no-banner warning; the public page never
   runs the consent snippet; the essential one still runs.
5. As **editor**, open the same page → no « Scripts » section.
   `curl` the page API with the editor's token → no `customCode` key.
   Send a PATCH with a `customCode.head.code` value as the editor → 200 but
   the stored value is unchanged (re-read as admin).
6. Open the page in the GrapesJS editor as admin → `html[data-head]` is not
   set on the admin document nor on the canvas document (SC-004).
7. Create an A/B variant of the page → the variant's public URL runs the
   same scripts.
8. Admin → Activity log → one « page-code-changed » entry by the admin.
9. Preview of the (unpublished) page → both snippets run (preview runs
   consent snippets immediately).

## 3. « Code » view (US2)

1. As **editor**, open a page → « </> Code ». HTML and CSS are shown.
2. Add:
   `<table><tr><th>Offre</th><td>49 €</td></tr></table><button type="button">Info</button>`
   `<iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ" allowfullscreen></iframe>`
   and change a CSS rule. « Vérifier et appliquer » → applied directly, the
   canvas shows them. Undo (Cmd/Ctrl+Z) → previous page back; redo.
3. Add `<a href="#" onclick="alert(1)">x</a><script>alert(2)</script>` →
   the view lists the `onclick` attribute and the script (with the pointer
   to Scripts / Code personnalisé). « Appliquer quand même » → no alert
   anywhere; published page has the link without `onclick`, no script.
4. Leave the lead-form placeholder in place and apply → it is still a
   non-editable placeholder; publish succeeds. Delete it in the view and
   try to publish → the usual "exactly one form" refusal.
5. Put `</style><h1>x</h1>` in the CSS and publish → no `<h1>x</h1>` on
   the public page (R7b).
6. Publish → table, button and video embed render; no CSP error.

## 4. Code block (US3)

1. As **admin**, drag « Code personnalisé » into a column; double-click →
   paste
   `<div id="tf-widget">en attente</div><script>document.getElementById("tf-widget").textContent="widget OK"</script>`,
   « Essentiel », « Enregistrer », save the page.
   → Canvas shows the placeholder, never « widget OK ». Public page shows
   « widget OK » inside that column; at 360 px it stacks with the column.
2. Add a second block set to « Nécessite le consentement » → before
   consent its position is empty; after « Accepter » it appears.
3. As **editor**: the library has no « Code personnalisé »; double-click
   on the block does nothing; the block can be moved and deleted.
4. As editor, in « Code », duplicate the placeholder line with a new
   `data-code-id="forged"` and save → refused with « Seul un administrateur
   peut ajouter ou modifier un bloc de code personnalisé. », page unchanged.
5. As editor, delete a code block and save → accepted. As admin, save →
   the orphan row is gone (API read as admin).

## 5. Vendor check (manual, SC-002)

On a staging page, paste the unmodified official snippets of: Meta Pixel
(end of page, consent), GA4 gtag (head, consent), Crisp or HubSpot chat
(end, consent), Calendly inline widget (code block, essential), a YouTube
embed (HTML via « Code »). Accept cookies → each works; the browser
console shows no CSP violation. Record results in the PR body.
