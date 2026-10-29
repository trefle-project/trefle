# Research: Import a website from a Penpot file

Decisions taken while planning 015. Facts marked **(verified)** were checked
on 2026-10-06 against Penpot 2.18.2 running locally (`../penpot/`) and the
reference files in `../penpot/references/`. They were not taken from
documentation.

## P1 — Input format and parsing

**Decision**: Accept only the Penpot 2 export format (« binfile v3 »): a zip
holding `manifest.json`, `files/<fileId>.json`, `files/<fileId>/pages/<pageId>.json`,
**one JSON file per shape** (`files/<fileId>/pages/<pageId>/<shapeId>.json`),
`components/`, `colors/`, `typographies/`, `tokens.json`, `media/<id>.json`
and the binaries in `objects/<storageId>.<ext>` + `.json` (verified, from
Penpot's `backend/src/app/binfile/v3.clj` and real exports). Shape JSON is
camelCase. Unzip in memory with **`fflate`** and never write entries to disk:
names are only used as map keys, so path tricks in entry names are harmless.

File, page and board ids must be plain ids (`[A-Za-z0-9-]{1,64}`, UUIDs in
practice) because they are used to build entry names; other ids are ignored.
Limits, checked from the zip's central directory **before** inflating
anything: 100 MB compressed (FR-002), 400 MB total uncompressed, 30 000
entries, 25 MB per entry, 20 000 shapes on the chosen Penpot page. Each
refusal gets a French message naming the limit.

Penpot 1 exports (`binfile v1`) are a custom binary format, not a zip
(verified: the samples in `penpot/penpot-files` start with `01 0b 1a 86`).
They are recognised by not being a zip and refused with « Ouvrez ce fichier
dans Penpot 2 puis exportez-le de nouveau ».

**Rationale**: The zip is self-describing and Penpot validates it on its own
import, so nothing in it needs Penpot code to read.

**Alternatives**: Connecting to a Penpot server API was ruled out in the spec,
since Penpot runs on the editor's computer. Asking for Penpot's SVG/HTML
export was also rejected: it loses layouts, links and boards.

## P2 — Where the converter lives

**Decision**: Put it in the existing package `@trefle/grapesjs-page-import` as
`src/penpot/` (read → model → GrapesJS), exported as `./penpot`. It is pure,
Payload-free and tested with Vitest + jsdom, like the 012 serializer.

**Rationale**: It produces the same thing as the 012 serializer
(`projectData` + `html` + `css` + `ImportReport`) for the same editor and
renderer, and reuses `a11y.ts`, the allow-list tests and the GrapesJS
round-trip test helpers. A new package would duplicate all of that
(Principle I).

**Alternatives**: Mapping Penpot to the 012 `ImportIR` and reusing
`serializeImport` was rejected. The IR is deliberately narrow because it is
written by a model: at most 4 columns, no nesting, 6 block kinds, no borders,
shadows, gradients or fonts. Penpot carries exact layouts, and FR-009/FR-010
require reproducing them, so the IR would throw away most of what the file
gives.

## P3 — Output shape: plain GrapesJS components

**Decision**: Emit plain GrapesJS component JSON: `default` (div / section),
`text`, `image`, `link`, and an `svg` component for vectors. Each component
gets a short stable id (`p` + 6 base36 characters derived from the Penpot
shape id). Its styles are written as **id rules** in `projectData.styles`,
which is what the Style Manager writes when an editor styles a component, and
are mirrored in `css`. Responsive overrides use the editor's own device
styles (`(max-width: 992px)` tablet, `(max-width: 480px)` mobile), with the
same constants as 012.

**Rationale**: FR-008 says every element must be editable in the editor. Id
rules are what the editor itself produces, so the Style Manager shows and
edits them. The markup stays inside `ALLOWED_TAGS` / `ALLOWED_ATTR`: div,
section, p, h1–h6, span, a, img, and inline SVG, which is allowed since 014.

**Size constraint**: the admin saves `builder` (projectData + html + css) in
one request capped at **500 KB** (`next.config.mjs` /
`bodyParser.limits.fieldSize`). A page created by the job (local API) would
save once, then fail on the editor's first save if it is larger. The
converter therefore measures its output and fails that board with
`page-too-large` (« Cette page est trop détaillée pour l'éditeur ;
simplifiez-la dans Penpot ») above **450 KB**. Two choices keep the output
small: generic wrappers are flattened (P4), and each style is written once,
in `css` plus the matching `projectData.styles` entry. **Measured in slice 1
(T017)** on the 19 boards of the four reference files: 46–168 KB (median
≈ 90 KB); the heaviest is the agency « À propos » (168 KB). The 450 KB guard
has a wide margin; wrapper flattening was not needed and is not implemented.

## P4 — Layout mapping (the core rules)

| Penpot | CSS / GrapesJS |
|---|---|
| frame `layout: "flex"` | `display:flex; flex-direction` = `layoutFlexDir`; `flex-wrap` from `layoutWrapType`; `gap` from `layoutGap.rowGap/columnGap`; `padding` from `layoutPadding.p1..p4` (top, right, bottom, left); `justify-content` / `align-items` / `align-content` from the `layout*` fields |
| **child order** | **DOM order = `shapes` reversed**, for every direction (verified on 1 251 flex containers: `row`/`column` children are stored last-shown-first; `row-reverse`/`column-reverse` are stored first-shown-first, which is the same rule once the CSS direction is applied). The bug that made the first reference files render upside down came from exactly this |
| frame `layout: "grid"` | children in **cell order (row, then column)**, not reversed, so a grid collapsed to one column on mobile reads in order; `display:grid`; `grid-template-columns/rows` from `layoutGridColumns/Rows` (`flex` → `fr`, `fixed` → px, `percent` → %, `auto` → `auto`); each cell of `layoutGridCells` gives its shapes `grid-row`/`grid-column` start + span (`position: manual`) or nothing (`auto`); `justify-items`/`align-items` |
| child sizing `layoutItemHSizing` | `fix` → `width:min(Npx, 100%)` (not `width` + `max-width`: a declared px width is the element's min-content contribution, so every ancestor refused to shrink below it; found on the reference set, slice 1); `fill` → `flex:1 1 0; min-width:0` along the main axis, `align-self:stretch` across it (width:100% in a column); `auto` → `width:auto` |
| child sizing `layoutItemVSizing` | `fix` → `height:Npx` on leaves (rect, image, vector), **`min-height:Npx` on containers**, so that text wrapping on mobile never overflows; `fill` / `auto` as above |
| `layoutItemMargin`, `layoutItemMin/Max*` | `margin`, `min-/max-width/height` |
| `layoutItemAbsolute` | `position:absolute`; `left` and `width` in **% of the parent's width** (px offsets pushed dividers off screen once a row stacked), `top`/`height` in px; parent gets `position:relative` unless it is itself absolute. Leaf decorations placed this way (dividers, background shapes) are hidden on mobile, where the content they framed has reflowed |
| padding / border | `box-sizing:border-box` (Penpot sizes include padding and borders) |
| frame without layout (free) | see P6 |
| group | `div` with the group's box; its children are positioned freely inside (P6). Exception: a group, frame or bool made only of vectors becomes **one inline `<svg>`** (icons, logos) |
| `showContent: false` (clip) | `overflow:hidden` |
| board (top level) | the page root: `width:100%`, its own fill as page background; its direct children span the page |

Fills: solid → `background-color` (rgba when opacity < 1); linear/radial
gradient → `linear-gradient` / `radial-gradient` with stops; image fill → P9.
Strokes: `inner` → `border` (box-sizing: border-box); `center` / `outer` →
`outline` with an offset (so the box does not grow); only the first stroke is
kept, others go to the report. Radii `r1..r4` → `border-radius`. Shadows →
`box-shadow` (drop + inset); layer blur → `filter:blur()`; opacity → `opacity`;
rotation → `transform:rotate()`, reported. Blend modes and masks are not
reproduced; they are reported (`simplified`).

## P5 — Making designs adapt below their board width (FR-010)

A board drawn at 1440 px wide must stay usable at 360 px (constitution V).
Rules applied on top of P4, all written as tablet/mobile device styles, so
the editor can see and change them per device:

1. Fixed widths always come with `max-width:100%` (P4).
2. **Rows wrap**: a `flex-direction:row` container whose children don't fit
   gets `flex-wrap:wrap` on tablet, and on mobile `flex-direction:column`
   (`align-items:stretch`, children `flex:0 0 auto`). Exceptions: rows whose
   children all fit in 360 px (a row of icons, a button with its arrow), and
   a two-item row where one item is ≤ 48 px wide (an icon next to its label:
   the label shrinks and wraps). Grid items get `min-width:0`.
3. **Grids**: N tracks → `min(N, 2)` tracks on tablet, 1 on mobile. Manual
   cell placement is reset to `auto` on mobile.
4. **Spacing**: horizontal padding > 24 px → tablet `min(64, 75 %)`, mobile
   `min(24, max(16, 50 %))`; gaps > 24 px → tablet `min(48, 75 %)`, mobile
   `min(32, max(16, 50 %))`. The caps came from the reference set: a design
   « centred » with 320 px side padding kept 160 px per side on a phone with
   a plain 50 % rule.
5. **Type**: font sizes > 28 px are scaled down on mobile:
   `max(24, round(size × 0.7))`. Line heights are kept as ratios.
6. Fixed heights are already `min-height` on containers (P4).

**Validation**: the existing `deviceCheck` (012 R16) renders the page at the 4
device widths and reports horizontal overflow and texts that are cut off.
SC-003 is checked on the reference set (quickstart §3).

**Alternatives**: Inferring a new layout from geometry (what Figma-to-code
tools do) is out of scope; the spec chose designs built with layouts.

## P6 — Freely positioned content (FR-011)

**Decision**: A frame or group without layout becomes a **size container**
(`container-type:inline-size; width:Wpx; max-width:100%; aspect-ratio:W/H;
position:relative`). Its children are absolutely positioned, with every length
expressed in **`cqw`** (`left`, `top`, `width`, `height`, `font-size`,
`border-radius`, `padding`, as a percentage of W). At W and above it is
pixel-exact; below W everything shrinks in proportion, and nothing overflows.

The report names each such board or section (`simplified`: « Section
positionnée librement : réduite proportionnellement sur mobile, sans
réorganisation »). When a whole **board** has no layout, it also adds an
`actionsBeforePublish` entry, because at 360 px its text becomes too small to
read (see the Constitution Check in plan.md).

**Alternatives**: `transform: scale()` was rejected because it doesn't change
the layout height. `zoom` / `calc(100cqw / Wpx)` was rejected because it
needs typed division, which isn't supported everywhere. Refusing such boards
was rejected because the spec asks to import them.

## P7 — Texts and headings (FR-009, FR-014)

The `content` tree (`root` → `paragraph-set` → `paragraph` → text leaves) maps
to one block element per paragraph containing `span`s for the leaves whose
style differs from the paragraph's. The text is copied verbatim and
HTML-escaped. Each leaf's font-family, size, weight, style, line height,
letter spacing, transform, decoration and fill colour is mapped;
`textAlign` goes on the paragraph and `verticalAlign` on the text box (flex
column). `growType` `auto-width` → `width:auto` (wrapping still allowed);
`auto-height` → fixed width, `height:auto`; `fixed` → width + min-height.

Heading levels per page: (1) a text whose typography (`typographyRefId` →
`typographies/*.json`) is named like `H1`, `H2 Heading`, `Titre 1`, `Heading 3`
gets that level. (2) Otherwise the largest font size on the board gets `h1`
(only the first text in reading order of that size), and the next two
distinct sizes ≥ 24 px get `h2` / `h3`. Everything else is `p`. (3) If no
text gets `h1`, the first `h2` is promoted. Reading order = DOM order (P4).
The `a11y.ts` checks of 012 (heading order, contrast, alt, empty links) run
on the result.

**Colours are never changed** (user decision, 2026-10-06): a text whose
contrast is too low keeps the designer's colours and is listed under
« Accessibilité » in the report (translucent colours are blended over the
background behind them first). It is the editor's choice to fix it in
Penpot or in the editor; the import doesn't block publishing for it.

## P8 — Fonts: domain fonts (FR-013, FR-024–FR-028)

**Verified**: in the reference files, every text uses either a Google font
(`fontId: "gfont-<slug>"`, e.g. Inter Tight, Montserrat, Roboto) or Penpot's
built-in default `sourcesanspro`. The v3 export **does not contain** team
custom fonts: `v3.clj` writes no font entries.

**Decision**: fonts belong to the **domain**, not to the page (user
decision, 2026-10-06).
- `domains.fonts` lists families with weights and an italic flag
  ([data-model.md](data-model.md)). On save, a `beforeChange` hook resolves
  each row against the **Google Fonts CSS2 API**. It downloads the missing
  woff2 files (subsets `latin` and `latin-ext` only) into the `fonts` upload
  collection (asset bucket, deduplicated by family + weight + style +
  subset), and links them to the row. An unknown family or weight gives a
  field validation error naming it (FR-025). The download happens inside the
  save request: a few files, a few seconds. That's acceptable for an admin
  setting, and it means a saved domain always has its files.
- **Published pages**: the page shell (`apps/web`) already resolves the
  domain. It now also fetches the domain's font files and writes **one
  `<style>` with the `@font-face` rules** (`font-display:swap`,
  `unicode-range` as given by Google) before the page CSS. Pages never carry
  `@font-face` themselves: changing a domain's fonts needs no page edit, and
  page CSS stays small (P3). Only the domain's own fonts are emitted (FR-026).
- **Editor** (FR-027): `Editor.client.tsx` reads the page's `domain` field
  (`useFormField`), fetches that domain's fonts, adds their families at the
  top of the Style Manager's `font-family` options, and injects the same
  `@font-face` `<style>` into the canvas document. When the domain changes,
  it re-runs. Without a domain, it keeps the standard list.
- **Penpot import** (FR-013): the job's `fonts` step computes the
  (family, weight, style) triples the ticked boards use. Penpot's
  `sourcesanspro` maps to Google's « Source Sans 3 ». It merges the missing
  ones into the domain's rows with `payload.update` (`overrideAccess`, which
  runs the same hook, so the same download and validation), and passes the
  set of available families to the converter. Families Google doesn't know
  are not added: the converter falls back to a generic stack (serif /
  sans-serif / monospace, guessed from the name). Both lists go in the
  report (`fontSubstitutions` plus a « Polices ajoutées au domaine »
  simplified entry).
- **Removal warning** (FR-028): `GET /api/domains/:id/font-usage` counts the
  domain's pages whose `builder.css` names each family. A small client
  component on the `fonts` array shows « utilisée par N pages » on each row,
  so the editor sees the count before removing it.
- **Cross-origin**: font files are served from `ASSET_ORIGIN` (`assets.`
  host) to the client domains and to the admin canvas, so browsers need
  `Access-Control-Allow-Origin`. The bucket gets a CORS rule allowing
  `GET`/`HEAD` from any origin, set by the CMS at boot with `PutBucketCors`
  through the S3 client it already has (`@aws-sdk/client-s3`, via
  `@payloadcms/storage-s3`). This is idempotent and works the same with the
  self-hosted Garage (v2.3 implements bucket CORS) or an external S3.
  **Verified in slice 2 (2026-10-06)**: after `PutBucketCors`, a cross-origin
  GET on Garage's *website* endpoint (3902, what Caddy proxies `assets.` to)
  answers `access-control-allow-origin: *`; the editor canvas then loads the
  font from the asset host (`document.fonts` reports it loaded). No Caddy
  change is needed.
- Licence: Google Fonts are OFL/Apache, so self-hosting is allowed.
- **Tests never call Google**: `GOOGLE_FONTS_CSS_URL` (empty = the real API)
  points the CMS at a stand-in; CI sets it to `http://import-fixture/css2`,
  where nginx serves a canned CSS2 answer for EB Garamond 400 and answers
  400 for anything else, like Google. Font files may only come from
  `fonts.gstatic.com` or the stand-in's own host.
- Google answers HTTP 400 both for an unknown family and for an unknown
  weight (verified): the resolver then asks for the family alone, then each
  weight, to name the actual cause in the French message.

**Alternatives**: per-page `@font-face` in the page CSS (the first version of
this plan) was rejected. It duplicates rules on every page, eats into the
500 KB cap, and a font change would mean editing every page. `data:` URIs
were rejected: ≈ 50 KB per weight. Google's CDN was rejected by FR-013 and
GDPR. A per-domain « load from Google » switch was proposed to the user and
not retained. Putting fonts in `media` was rejected: it is images/PDF with
alt-text rules.

## P9 — Images and vectors (FR-012)

- **Image fills** (`fills[].fillImage.id` → `media/<id>.json` → `objects/<storageId>`):
  on a rect/circle leaf, the shape becomes an `<img>` (`object-fit:cover`, or
  `contain` when `keepAspectRatio` is false). On a frame, it becomes
  `background-image` (`cover`, centred). The renderer already sends
  background `url()`s through ImgProxy (012 R9).
- Image bytes are normalised with the existing `normalise()` of
  `lib/import/images.ts` (sharp → WebP ≤ 500 KB at the displayed width × 2,
  capped at 1920) and stored as Media through the same `createMedia` call as
  012 (`importedBy` stays empty; the site import keeps its own list of the
  Media it created, used for cleanup). The `alt` is the layer name when it
  looks like words (not `Rectangle 12`, `IMG_2034`, `image`). Otherwise
  `altPending: true` and the image is listed in the report (012 rule).
- Identical image bytes (same storage hash) are stored once per import.
- **Vectors** (`path`, `bool`, `circle` without image, groups of vectors): one
  inline `<svg>` per vector cluster, with a `viewBox` equal to the cluster's
  box, paths translated by its origin, fills/strokes as SVG attributes and
  `role="img"` + `aria-label` from the layer name (or `aria-hidden="true"`
  when decorative: no meaningful name and not a link). Path data is the
  stored SVG string (`M/L/C/Z`, absolute) or, in older files (the wireframe
  reference), a list of `move-to` / `line-to` / `curve-to` / `close-path`
  segments, converted to the same string. `href` /
  `xlink:href` attributes are dropped unless they are internal anchors
  (`#…`), so a published page never loads a resource named by the file. Path data is the
  stored SVG path string (`M/L/C/Z`, absolute; verified). `svg-raw` shapes
  are rendered with their `svgAttrs` filtered by the allow-list. A plain
  `rect` or `circle` with a solid fill stays a `div` (border-radius 50 % for
  circles).
- **Hidden** shapes (`hidden: true`) are skipped with their subtree.

## P10 — Links (FR-016–FR-018)

`interactions` with `eventType: "click"`:
- `actionType: "navigate"` + `destination` = a board **ticked in this import**
  → the element becomes a link to that board's page path. For a text, the
  paragraph content is wrapped in `<a>`. For a frame, group or image, the
  element itself becomes an `a` component (`display` kept). Links get
  `color:inherit; text-decoration:none` unless the text is underlined in
  Penpot (012 rule for whole-element links). Any other destination → no link,
  reported.
- `actionType: "open-url"` with `https?:`, `mailto:` or `tel:` → link
  (`target`/`rel` not added: same tab, like the source prototype). Other
  schemes → dropped and reported. Checked with the same `SAFE_HREF_RE` as
  the 012 serializer, which already allows exactly these.
- Other events and actions (hover, overlays, `prev-screen`, delays) → listed
  in the report (`omitted`, reason `interaction`).
- A link with no text inside (an icon) gets `aria-label` from the layer name;
  without a usable name it is reported by the a11y check (« lien sans nom »).
- Links nested in a link: the inner one is dropped (HTML forbids nesting) and
  reported.

## P11 — Components and variants (FR-015)

**Verified**: in the Penpot 2 model ("components v2"), copies are **stored
fully materialised**: every copy shape carries all of its own attributes,
with `shapeRef`/`componentId` only as references. Across the wireframe and
« The Journal » files (4 851 copy shapes), no copy lacks a geometry, fill,
stroke, layout or children attribute its main has, and 177 text copies hold
their own overridden content. The converter therefore
reads copies like any other shape and never resolves components. A component
used on five boards ends up as five independent copies of markup (FR-015).
The validated reference files (agency, blog) confirm that this holds for
nested copies too.

## P12 — Two-step flow and file lifetime

0. **Domain first** (FR-001): the wizard asks for the domain before showing
   the drop zone, and the analyse request carries it. The domain is
   therefore known when the boards are listed. The analysis marks proposed
   paths already used by a published page of that domain, and pre-fills the
   language. Changing the domain means a new analysis, so the start request
   cannot change it.
1. **Analyse** (`POST /api/site-imports/analyse?domain=<id>`, multipart:
   `file`): checks the domain, then checks and parses the file, creates a
   `site-imports` document (`status: analysed`, `domain` set),
   stores the file at `SITE_FILES_DIR/<id>` (mode 600, like 013), and returns
   the Penpot pages with their boards: name, size, proposed path, thumbnail
   when the file has one.
2. **Start** (`POST /api/site-imports/:id/start`): the chosen Penpot page,
   language and ticked boards with their paths; validated (the domain must
   still be active), then the job is queued.

The file is deleted when the job ends, whatever the outcome (FR-022). An
`analysed` import that is never started is swept after **1 hour**: its file
is deleted and its status becomes `abandoned`. The existing stale-import
sweep (012) is extended to cover site imports.

**Thumbnails** (FR-004): the export contains frame thumbnails only sometimes
(`files/<id>/thumbnails/frame/<pageId>/<frameId>.json` → a storage object;
observed: 47 in « The Journal », none for the 41 boards of the wireframe
file). When one is present, it is returned as a `data:` URL, at most
200 KB, otherwise none. The list then shows the name and the board size. The
spec's FR-004 is adjusted to say « when the file contains one ».

## P13 — Proposed addresses (FR-005)

`slug(name)`: NFD-normalise, remove diacritics, lower-case, replace every
run of non-`[a-z0-9]` characters with `-`, trim the dashes, truncate to 60.
An empty slug becomes `page`. Duplicates get `-2`, `-3`… (« Article »,
« Article » → `/article`, `/article-2`). The first board in **reading order on
the canvas** (top to bottom, then left to right) is proposed as `/`. Every
address must pass `validatePagePath` plus the reserved-path guard
(`/confirmation` …), and ticked boards must have pairwise distinct addresses.
These are checked in the wizard (immediate feedback) **and** again by the
start endpoint.

## P14 — Feature switch and access

Same roles as page import (admin, editor: `isAdminOrEditor`). Neither Claude
nor the import budget is involved (FR-023), so the 012 `budgetStatus.enabled`
switch does not apply. Until slice 4 is evaluated, the entry point is hidden
behind **`PENPOT_IMPORT=on`** (env, default off). The button is not rendered
and the endpoints answer 404 while it is off. One env var, no migration:
turning it off is a restart (Principle III).

## P15 — Job

A new Payload task `site-import` on the existing `imports` queue (autoRun
already configured), modelled on `runPageImport`: checkpoints for cancel and
deadline (**6 minutes**: at most 10 boards per import, device checks ≈
1.5 min, plus images and fonts), a `step`/`progress` field, cleanup on failure. Steps: `parse` →
`fonts` → `images` → `build` (all boards, in memory) → `check` (deviceCheck
per page, sequential, one browser session) → `save` (creates the pages one
by one, then records them). If saving fails partway, the pages already
created by this import are deleted, so FR-019 holds: no page is left
behind.

Pages are created as the importing user (`overrideAccess: false`), like 012,
so access rules, hooks and the activity log apply. Page names (`title`, what the admin lists) are `<board name>_<YYYY-MM-DD>_<HH>h<MM>`, at the moment the import is confirmed, Europe/Paris. The public title (`seo.metaTitle`) is the board name alone.

## P16 — Testing

- **Package (Vitest)**: unit tests per mapping rule on small hand-written
  shape fixtures (flex order, grid cells, sizing, free layout in cqw,
  headings, links, SVG clusters, fonts, size budget), a GrapesJS round-trip
  test (load the projectData into a headless editor and compare the
  exported html/css), an allow-list property test (sanitising is a no-op),
  and verbatim texts.
- **Fixture file**: a trimmed `.penpot` (≈ 200 KB) committed under
  `packages/grapesjs-page-import/tests/fixtures/`. It is built from the « The
  Journal » reference (2 boards, links, a grid, an image, a vector) by
  `scripts/penpot-fixture.mjs`, which only copies existing entries.
- **Domain fonts (Vitest, cms + web)**: hook with a mocked Google CSS2
  response (unknown family, unknown weight, dedupe across domains, row
  merge), usage counter, page-shell `@font-face` output, and the editor
  font list built from a domain.
- **CMS (Vitest)**: zip limits (zip bomb, too many entries, not a zip,
  Penpot 1), endpoints (validation, access, flag off → 404), job cleanup
  (failure/cancel deletes pages, Media, file), sweep of `analysed` imports,
  font dedupe.
- **e2e (Playwright)**: upload the fixture, untick a board, confirm, open a
  created page, follow a link on the published page.
- **Fidelity (manual, quickstart §3)**: the four reference files.
  `penpot/references/generator/render.sh` renders each board with Penpot's own
  exporter, to compare side by side with the device-check screenshots.
