# Contract: admin editor (Payload + GrapesJS)

## Roles

| Capability | Admin | Editor |
|---|---|---|
| See / edit « Scripts » section | ✅ | ❌ (not rendered, not in API reads) |
| « Code » view (HTML/CSS) | ✅ | ✅ |
| « Code personnalisé » in block library | ✅ | ❌ |
| Open / edit a code block's code | ✅ (double-click) | ❌ |
| Move / delete a code block | ✅ | ✅ |
| Copy a code block | ❌ | ❌ |
| Introduce a new `data-code-id` (any route) | ✅ | ❌ save refused |

Role read in the editor with `useAuth()` at mount; server enforcement is
field access (R1) + `pagesCustomCodeGuard` (R6).

## « Code » view (command `trefle:code-view`)

- Button « </> Code » in the GrapesJS options panel, tooltip « Modifier le
  code HTML et CSS ».
- Modal title « Code de la page ». Two labelled code editors « HTML » and
  « CSS » (GrapesJS's CodeMirror viewers: colouring, line numbers,
  auto-indent, formatted on open; heights 360 / 200 px), button « Mettre en
  forme » to re-indent on demand; a backdrop click does not close the modal;
  only the edited part is applied back. HTML = the wrapper's children
  (`getComponents()` → `toHTML()`), not `getHtml()`: once the page
  background is styled the latter wraps everything in the wrapper's own
  `<body id>`, and applying that back would nest a second element with the
  wrapper's id. CSS = `getCss({ avoidProtected: true, keepUnusedStyles:
  true })` (every rule, without GrapesJS's reset, so a round-trip neither
  hides nor duplicates rules). Replaces GrapesJS's read-only « View code »
  button (`export-template`).
- Buttons: « Vérifier et appliquer », « Annuler » (closes, no change).
- On « Vérifier et appliquer »:
  - sanitize with `SANITIZE_CONFIG` + `FORCE_BODY` (a leading
    `<style>`/`<script>` would otherwise be parsed into `<head>` and dropped
    without appearing in `removed`); build messages from `DOMPurify.removed`
    (attributes of an element that is itself dropped are not listed):
    - `script` → « Les scripts ne sont pas publiés depuis le HTML de la
      page : ils seront retirés. » — extended with « Un administrateur peut
      les ajouter dans la section « Scripts » de la page. » when US1 ships,
      and « … ou avec le bloc « Code personnalisé ». » when US3 ships.
    - `style` element → « Les balises <style> ne sont pas publiées : placez
      ce CSS dans la zone « CSS ». »
    - `on…` attribute → « L'attribut « onclick » sera retiré : les
      attributs d'événement ne sont pas autorisés. » (one line per name)
    - unsafe URI → « L'adresse « javascript:… » (attribut href de <a>)
      n'est pas autorisée et sera retirée. »
    - other element → « La balise <x> n'est pas autorisée et sera retirée. »
    - other attribute → « L'attribut « x » de <tag> n'est pas autorisé et
      sera retiré. »
    - `form`/inputs → « Les formulaires et champs ne sont pas autorisés :
      utilisez le bloc « Formulaire (lead) ». »
  - no messages → apply directly;
  - messages → list them; buttons « Revenir au code » / « Appliquer quand même ».
- Apply = `setComponents(html)` + `setStyle(css)`; undoable with the
  editor's undo.

## Component types (registered before `projectData` loads)

| type | `isComponent` | Defaults |
|---|---|---|
| `lead-form` | `data-block="lead-form"` | `droppable: false`, `editable: false`, no children |
| `custom-code` | `data-block="custom-code"` | `droppable: false`, `editable: false`, `copyable: false`, attrs kept: `data-code-id`, no children |

Canvas-only CSS (injected in the canvas document, never exported):
`[data-block="custom-code"]` dashed outline, min-height 60px, `::before`
« </> Code personnalisé — exécuté uniquement sur la page publiée » (+ « (vide) »
when the admin has not entered code yet, via a `data-empty` attribute set
only in the canvas view).

## « Code personnalisé » block (admins only)

- Drop **or click** the block → component with a new `data-code-id`
  (`crypto.randomUUID()`) and a new `customCode.blocks` row
  `{ codeId, code: "", consent: "consent" }` added through
  `useForm().addFieldRow`; its modal opens right away. Click-to-add places
  it right after the block holding the selection (a text selected inside a
  hero → after the hero), at the end of a selected column, else at the end
  of the page — usable without dragging.
- Double-click (admin) → modal « Code personnalisé »: textarea (≤ 50 000,
  counter), select « Consentement », buttons « Enregistrer » / « Annuler ».
  « Enregistrer » updates the row via `dispatchFields`; the page is saved
  with the normal Payload save.
- Deleting the component leaves the row; it is dropped on the next admin
  save (orphan cleanup).

## Scripts section

- Collapsible « Scripts » (closed by default) after SEO.
- `ScriptsConsentWarning` (UI field): when the page's selected domain has
  `consentBannerEnabled = false` and a snippet (or code block) is set to
  « Nécessite le consentement cookies », shows: « Le bandeau cookies est
  désactivé sur ce domaine : les scripts qui nécessitent le consentement ne
  seront jamais exécutés. Activez le bandeau du domaine ou choisissez
  « Essentiel ». » Loading / fetch error → no warning, no crash.

## Server errors (French, shown by Payload's form)

- Guard (R6): « Seul un administrateur peut ajouter ou modifier un bloc de
  code personnalisé. » (403) — and, for anyone, « Un bloc de code
  personnalisé figure deux fois dans la page : supprimez le doublon. » (400).
- Size: « Le code dépasse la limite de 50 000 caractères. »

## Test obligations

- Field access: admin reads/writes; editor read omits `customCode`; editor
  write leaves stored value unchanged (REST and local API with
  `overrideAccess: false`); service account reads.
- Guard hook: editor adding an unknown id → refused; editor removing a
  block → allowed; admin → allowed + orphan rows dropped; editor create with
  refs → refused.
- Variant endpoint copies `customCode`.
- Activity entry on code change, none otherwise.
- e2e: editor sees no Scripts section and no code block in the library;
  admin page with scripts + block: no page script runs inside the admin
  (probe sets a flag on `window.top` / canvas window, asserted absent);
  « Code » view round-trip keeps the lead form recognised and publishable.
