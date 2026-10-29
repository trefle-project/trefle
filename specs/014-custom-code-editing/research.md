# Research: Custom code and direct HTML editing

Decisions taken while planning 014. Each: **Decision / Rationale /
Alternatives considered**.

## R1 — Where page code lives, and how "admins only" is enforced

**Decision**: A `customCode` group on `pages` (see
[data-model.md](data-model.md)) holding the two page snippets and the array
of code-block snippets. Payload **field-level access** on the group:
`read` = active admin **or** the renderer's service account; `create`/
`update` = active admin. For an editor Payload then (a) omits the group from
every read, so the edit view never shows it and the editor's browser never
receives the code; (b) ignores any incoming value for it on save, keeping
the stored one. This satisfies FR-002/FR-017: the change is not applied and
the stored scripts are unchanged, whatever the route (admin UI, REST,
GraphQL, local API with `overrideAccess: false`).

**Rationale**: Stack-native (Principle II), one declaration, covers every
route; the same mechanism already protects `users.role`
(`adminFieldOnly`).

**Alternatives considered**: a separate `page-scripts` collection keyed by
page (extra join, extra access rules, harder variant copy); a
`beforeChange` hook comparing values (reimplements field access, easy to
miss a route).

## R2 — How snippets reach the public page with the CSP nonce

**Decision**: Public pages are already dynamically rendered
(`resolveDomain()` reads `headers()`), so the page component can read the
per-request nonce from the `x-nonce` request header the middleware already
sets. A shared helper `withNonce(snippet, nonce)` rewrites every opening
`<script` tag of the snippet to carry `nonce="…"` (dropping any `nonce` the
admin pasted). The snippet is then emitted **verbatim** through
`dangerouslySetInnerHTML` on a `<div style="display:contents"
data-tf-code>` wrapper:

- « Essentiel » snippets are live markup in the server HTML: the browser
  runs their scripts while parsing, in document order, like any hand-written
  page. React hydration never touches `dangerouslySetInnerHTML` content, so
  there is no double execution and no nonce hydration mismatch.
- Placement: the « head » snippet's `<meta>`, `<link>` and `<title>`
  elements are rendered through `html-react-parser` so React 19 hoists them
  into `<head>` (for example site-verification tags); the rest of the head
  snippet (scripts, noscript) is emitted as the **first** child of the page
  body, before any content. The « end of page » snippet is the last child.
  Code blocks are emitted in place of their placeholder (R5).

A regex on `<script` is acceptable here because the input is admin-only by
construction (R1) — it is not a sanitizer and never runs on editor input.

**Rationale**: Byte-exact vendor snippets (no re-serialisation), native
parse-time execution and ordering, zero client JS for essential code.
Next's guide (`content-security-policy.md`) confirms nonces need dynamic
rendering, which these routes already are.

**Alternatives considered**: `next/script` per snippet (would need parsing
each snippet into src/inline parts and loses arbitrary HTML around the
script); rendering scripts as React `<script>` elements (hydration
mismatch on the browser-hidden `nonce` attribute, and React does not run
client-inserted scripts); true `<head>` injection from the root layout
(the layout doesn't know the page; would need a pathname header and a
second page lookup — the spec's "in the head" is met for the elements that
must be there, and scripts at the very top of body execute before any
content). Spec FR-001 wording updated accordingly.

## R3 — CSP changes

**Decision**: keep `script-src 'self' 'nonce-…' 'strict-dynamic'` exactly
(no `'unsafe-inline'`, no host list). Add/widen:

| Directive | Before | After |
|---|---|---|
| `connect-src` | `'self'` | `'self' https:` |
| `frame-src` | (default `'self'`) | `'self' https:` |
| `media-src` | (default `'self'`) | `'self' https: blob:` |
| `style-src` | `'self' 'unsafe-inline'` | `'self' 'unsafe-inline' https:` |
| `img-src`, `font-src` | already permissive | unchanged |

`'strict-dynamic'` lets a nonce-bearing script load further scripts from any
host (vendor loaders), which covers pixels, analytics and chat widgets.
Known, documented limits: inline event-handler attributes and
`document.write`-inserted scripts in vendor code stay blocked by any strict
CSP; the common vendors (Meta/TikTok/LinkedIn pixels, GA4 gtag, Hotjar,
Calendly, HubSpot/Crisp chat, YouTube/Vimeo embeds) do not rely on them.
`http:` is not added (mixed content; `upgrade-insecure-requests` stays).

**Rationale**: FR-003/FR-004 while keeping the one control that matters
(page markup can't run code, and nothing can run without the nonce).

**Alternatives considered**: per-page CSP additions configured by the admin
(more UI, more support; the risk it would limit is already accepted by
trusting admins); dropping `'strict-dynamic'` for a host allow-list (breaks
vendor loaders that chain from many hosts).

## R4 — Consent-dependent snippets (FR-008)

**Decision**: A consent-dependent snippet is emitted inert as
`<template data-tf-consent>…snippet with nonces…</template>` (for the head
snippet: at the top of body; for code blocks: in place, so the position is
empty until activation — FR-008c). A small client component
`<ConsentCodeRunner nonce>` (rendered only when the page has at least one
such template) activates them:

- at mount, if the `tf_consent` cookie says `accepted`;
- otherwise on a `tf:consent` window event with `detail === "accepted"`,
  dispatched by the existing banner's `decide()` (one added line);
- never on `rejected` or no choice. A later switch to « Refuser » takes
  effect from the next page load (FR-008a) — scripts already run cannot be
  un-run, and the cookie is re-read on every load.

Activation: for each template in document order, clone its content, replace
every `<script>` in the clone with a freshly created one (attributes and
text copied, `nonce` set from the prop), insert, and **wait for each
external script's `load`/`error` before inserting the next** so
"library then init" snippets keep their order. Scripts created by the
runner (itself a nonce-trusted bundle script) with the nonce are allowed by
the CSP.

- **Domain without banner** (FR-008b): nothing special on the server — the
  snippet is emitted inert and the cookie that would activate it can't be
  set there, so it never runs; the admin sees the warning in the Scripts
  section (R11). Decided during implementation, replacing "emit nothing":
  one rule for every route, including the confirmation page, which has no
  banner of its own but must run a conversion pixel for visitors who
  accepted on the landing page.
- **Preview** (FR-007): no banner is rendered in preview (007 FR-010), so
  the runner is given `always` and activates immediately, letting the admin
  check the snippet.

**Rationale**: Works with no reload (SC-008), no platform JS on pages
without such snippets, reuses the 007 cookie as the only source of truth.

**Alternatives considered**: `<script type="text/plain">` rewriting (can't
hold the non-script HTML of a widget, so the block position would render
half a widget); reloading the page on accept (visible flash, loses scroll,
fails SC-008's "without reload"); routing everything through GTM (not all
admins use GTM; out of scope).

## R5 — Code-block storage: reference in the page, code beside it

**Decision**: The GrapesJS component outputs only
`<div data-block="custom-code" data-code-id="<uuid>"></div>`. The code and
its consent setting live in `customCode.blocks[]` rows keyed by `codeId`
(R1 access). The renderer, which already replaces the lead-form placeholder
while parsing the page (`renderPageBody`), also replaces each custom-code
placeholder with its row's snippet (R2/R4); an unknown or orphan id renders
nothing. The placeholder's `id`/`class`/`style` are kept on the wrapper,
like the lead-form slot, so layout set in the editor applies.

**Rationale**: The code never enters `builder.html` (sanitized, readable by
editors), `projectData` (loaded in the editor canvas and in editors'
browsers) or the canvas — FR-005, FR-017 and FR-019 hold by construction.
Reuses an existing, tested renderer pattern.

**Alternatives considered**: code inside a component attribute/property
(visible to editors, stripped by the sanitizer, would need a sanitizer
exception); one Payload `blocks` field per widget outside GrapesJS (loses
free positioning inside sections/columns).

## R6 — Refusing an editor-introduced code reference (FR-018)

**Decision**: `beforeValidate` hook `pagesCustomCodeGuard`: when the user is
not an active admin, collect `data-code-id` values from the incoming
`builder.html` and the ids already stored on the page (read with
`overrideAccess: true`, `select: { customCode: true }`); any id not already
stored → throw a Payload `ValidationError` on `builder` with « Seul un
administrateur peut ajouter ou modifier un bloc de code personnalisé. ».
Removing references is allowed (editors may delete blocks). For admins the
hook drops rows whose id no longer appears in the HTML (orphan cleanup).

Consequence, documented: an editor duplicating a page that has code blocks
is refused (the copy would reference code they can't read); an admin can
duplicate it. A/B variant creation copies `customCode` server-side (R10) so
it works for both roles.

**Rationale**: Field access alone would silently render nothing for a
forged reference; the spec asks for an explicit refusal.

## R7 — One sanitize config, widened (FR-011/012/013/015)

**Decision**: `@trefle/shared/html-allowlist.ts` exports `SANITIZE_CONFIG`
(DOMPurify options object: `ALLOWED_TAGS`, `ALLOWED_ATTR`,
`ALLOW_DATA_ATTR: true`, `ALLOWED_URI_REGEXP`), used by
`apps/web` `sanitizeHtml`, the CMS « Code » view warning and the import
serializer tests. Additions per FR-011, including inline SVG (`svg`, `g`,
`path`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `rect`, `text`,
`tspan`, `defs`, `linearGradient`, `radialGradient`, `stop`, `clipPath`,
`mask`, `symbol`, `use`, `title`, `desc` and their presentation
attributes). ARIA attributes use DOMPurify's default `ALLOW_ARIA_ATTR`.
Still excluded: `script`, `style`, `form`, `input`, `select`, `textarea`,
`object`, `embed`, `base`, `meta`, `link`, `iframe[srcdoc]`, every `on*`
attribute and non-safe URI schemes (DOMPurify's defaults + our URI regexp).

**R7b — CSS break-out hardening**: `builder.css` is emitted inside a
`<style>` element and becomes free text in the « Code » view. The renderer
escapes `</style` sequences in it (`<\/style`) so CSS can never close the
element and inject markup. (A break-out script would still lack the nonce,
but markup such as a fake form must not get through either.)

**Rationale**: FR-015 (one list, three users). DOMPurify's `removed` list
gives the exact dropped items for the warning.

## R8 — The « Code » view in GrapesJS

**Decision**: A GrapesJS command `trefle:code-view` with a button in the
options panel (replacing GrapesJS's read-only « View code »). It opens
`editor.Modal` with two code editors — GrapesJS's own CodeMirror 5 viewers
(`CodeManager.createViewer({ codeName: "htmlmixed" | "css", readOnly:
false, theme: "hopscotch", autoFormat: true })`): syntax colouring, line
numbers, auto-indent and formatting, with no new dependency. They are
pre-filled with the wrapper's children HTML and every CSS rule (see
contracts/editor.md), plus « Mettre en forme » (re-runs the viewer's
formatter), « Vérifier et appliquer » / « Annuler ». Backdrop-closing is
disabled while it is open (a stray click would lose the edit); the modal's
content is removed on close (GrapesJS otherwise parks it in a hidden
collector, stacking editors on every reopening). Only the edited part
(HTML and/or CSS) is applied back. On apply:

1. run `DOMPurify.sanitize(html, SANITIZE_CONFIG)` in the browser, read
   `DOMPurify.removed`, group into plain-French lines (scripts → pointer to
   the Scripts section / code block, "admins only"; `on…` attributes;
   `javascript:` links; each disallowed element by name);
2. if anything is listed, show it and require a second click « Appliquer
   quand même » (or « Revenir au code »);
3. `editor.setComponents(html)` + `editor.setStyle(css)`; GrapesJS's
   UndoManager records the component/style changes, so « Annuler »
   (Ctrl/Cmd+Z) restores the previous page.

Component recognition on re-parse: section/columns types already match
`data-block` (012 plugin); this feature adds `lead-form` (droppable/editable
false, no children) and `custom-code` types with `isComponent` on their
`data-block`, so FR-010 holds and the publish guard/block count are
unchanged. GrapesJS keeps `allowScripts: false` (default): `<script>`
pasted in the view never reaches the canvas.

**Alternatives considered**: `grapesjs-preset-webpage`'s import command
(pulls a whole preset, no warning hook); plain textareas (first version,
rejected by the operator as uncomfortable); CodeMirror 6 or Monaco as a new
dependency (auto-closing tags, autocompletion — not needed; GrapesJS already
ships CodeMirror 5 with the HTML/CSS modes).

## R9 — Role awareness in the editor

**Decision**: `Editor.client.tsx` reads the user with `useAuth()` from
`@payloadcms/ui` at mount. Admins get the « Code personnalisé » block and a
double-click modal on custom-code components (textarea + consent select)
that writes the matching `customCode.blocks` row through `useForm`
(`addFieldRow` to create, `dispatchFields` to update — the same API the
lead-form block already uses to seed `form.fields`). Editors get neither;
the component is `copyable: false` for everyone (a copy would share the
id). This is UX only; enforcement is R1 + R6.

## R10 — Copying and history

**Decision**: `createTestVariant` copies `customCode` (with array row ids
stripped, as it already does for `form`) using the server's full read
(FR-006). `pageActivity` gains an entry `page-code-changed` when
`customCode` differs between `previousDoc` and `doc` (deep compare of the
three parts), with `meta.parts` naming which changed (FR-023). New
`ActivityType` value in `@trefle/shared` + the `activity_log.type` select
option (enum migration).

## R11 — Admin UI placement of page scripts

**Decision**: A collapsible section « Scripts » at the end of the page's
edit form (inside the `customCode` group), rather than a new document tab.
Unreadable fields are hidden by Payload, so editors never see it. It
contains the two snippet textareas (monospace, `maxLength` 50 000), each
with a « Consentement » select, and a UI field
`ScriptsConsentWarning` that reads the page's `domain` and shows the
FR-008b warning when that domain's banner is disabled.

**Rationale**: A document tab would need a custom view with its own form
and save; a collapsible is native Payload and one field. Spec US1 wording
updated from "tab" to "section".
