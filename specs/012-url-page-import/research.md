# Research: Import a page from a URL (012)

Phase 0 of `/speckit-plan`. Each entry resolves one unknown from the plan's
Technical Context. Format: Decision / Rationale / Alternatives considered.

---

## R1. Where the import runs

**Decision**: Server-side, inside the CMS, as a Payload Jobs task
(`page-import`, queue `imports`). The wizard calls a CMS endpoint that creates
a `page-imports` document, queues the job and immediately starts it with
`payload.jobs.runByID()` (not awaited). `jobs.autoRun` also polls the
`imports` queue every minute as a safety net for a job whose immediate run was
lost (process restart). The wizard polls the import document over the
standard REST read until it reaches a terminal status.

**Rationale**: A browser-side GrapesJS plugin cannot fetch another site
(CORS), cannot safely enforce the internal-address ban (FR-002), cannot hold
the AI key, and cannot upload dozens of images reliably. An import lasts up
to ~2 minutes (SC-001): longer than a comfortable HTTP request and than
Caddy's defaults. Payload Jobs is already in the stack (retention sweep,
`JOBS_AUTORUN=true` in prod): Principle II.

**Alternatives considered**:
- *Synchronous endpoint* (hold the request ~2 min): fragile behind the proxy,
  no progress, no cancel.
- *Separate import micro-service*: a new app to build, deploy and secure for
  one feature (Principle I).
- *Fire-and-forget promise without Jobs*: loses the import on restart with no
  trace; Jobs gives persistence and a retry-free, inspectable record for free.

## R2. Rendering the source page like a browser

**Decision**: A dedicated `browser` container running the official
Playwright image (`mcr.microsoft.com/playwright:v1.63.0-noble`, same tag the
e2e setup already pins) with `playwright run-server`. The CMS connects with
`playwright-core` (pinned to the exact same version, no bundled browser) via
`chromium.connect(BROWSER_WS_URL)`. One browser context per import,
JavaScript on, service workers and downloads blocked, 30 s navigation
timeout, auto-scroll to the bottom to trigger lazy content, overlays removed
(fixed/sticky elements covering the viewport, known cookie-banner/chat
selectors) before extraction.

**Three renderings, one navigation (FR-011)**: the page is loaded once at
desktop width (1440×900), extracted and screenshotted; then the *same page*
is resized to tablet (820×1180) and mobile (390×844), re-scrolled, and
re-measured. Because it is the same DOM, every text/image keeps the id it got
at desktop, and the extract simply adds, per id and per device, its box,
visibility and the computed styles that *differ* from desktop. Media queries
of the source apply on resize exactly as on a real device. Pages that serve
different HTML to phones by user agent are out of scope (rare for landing
pages; the resize approach still shows their responsive CSS).

**Rationale**: FR-006 and the edge cases need the page *as a visitor sees it
after load*, including script-built content: only a real browser gives
computed styles, layout boxes and a faithful screenshot. Keeping Chromium out
of the CMS image keeps the CMS image small, lets the browser be memory-capped
(`mem_limit: 1g`) and restarted independently, and isolates the process that
loads untrusted third-party pages. The VPS (KVM 2, 8 GB RAM) has headroom for
a 1 GB-capped container.

**Alternatives considered**:
- *Chromium inside the CMS image*: +400 MB image, untrusted pages rendered in
  the process that holds DB and S3 credentials.
- *Plain HTTP fetch + HTML parsing, no browser*: misses JS-built pages and
  computed styles; no screenshot for the AI; fails SC-002.
- *Hosted rendering API (e.g. a screenshot SaaS)*: another paid third party
  and a second place page content goes; unnecessary given R3.

## R3. Converting the page into blocks

**Decision**: One call to the Claude API (`@anthropic-ai/sdk`, model
`claude-opus-5`, adaptive thinking, effort `medium` by default, both
configurable by env) using **structured outputs**
(`client.beta.messages.create` + `betaZodOutputFormat`, parsed after the
`stop_reason` check so a failed answer's `usage` is still billed) against a fixed, non-recursive
**Import IR** schema (contracts/import-ir.md). Input: full-page screenshots
of the three renderings cut into tiles (≤ 2576 px long edge each; desktop
1440 px wide, at most 6 tiles ≈ first 12 000 px; tablet 820 px wide, at most
4 tiles; mobile 390 px wide, at most 6 tiles), each labelled with its device,
plus a compact **DOM extract**: every visible text unit and image with a
short id (`t12`, `i4`), its tag, desktop box and whitelisted computed styles,
and per-device differences (box, hidden, changed styles). The IR carries
optional `tablet` / `mobile` style overrides and a `hidden` flag per element
(research R15). The IR references texts and
images **only by id**; the serializer inserts the source text/URL itself.
Server-side refusal fallbacks are enabled (`fallbacks: "default"`, beta
`server-side-fallback-2026-07-01`) per the SDK's current guidance for Opus 5.

**Rationale**:
- Grouping a page into sections, columns and the right block types is a
  visual-judgement task; rule-based heuristics reproduce texts and images but
  guess layouts poorly (clarification Q1 of `/speckit-clarify`, answer A).
- Referencing texts by id makes FR "texts imported verbatim" *structural*:
  the model cannot rewrite, translate or summarise because it never emits
  text. Same for image URLs (no hallucinated sources).
- The IR is deliberately depth-bounded (page → section → row of columns →
  column → leaf block) because structured outputs reject recursive schemas;
  this depth is exactly what FR-023 allows anyway (one level of columns).
- Effort `medium` is a latency/cost trade-off for the 2-minute target; the
  reference-set evaluation (quickstart §4) decides whether `high` is needed.

**Cost estimate** (Opus 5 at $5 / $25 per million input / output tokens):
image tokens ≈ 6 × 4 784 (desktop) + 4 × ~2 800 (tablet) + 6 × ~1 350
(mobile) ≈ 48 k; DOM extract with per-device differences ≈ 30–50 k; total
≈ 80–100 k input tokens (~$0.45); ~12–24 k output tokens including thinking
and device overrides (~$0.30–0.60). **≈ $0.75–1.00 (≈ €0.70–0.90) per
import.** Default monthly cap €20 ≈ 22–28 imports.

**Alternatives considered**:
- *Heuristics only*: rejected in clarification.
- *Send the URL to Claude and let it fetch the page itself (web fetch
  server tool)*: returns mostly converted text — no screenshot, no computed
  styles, no layout boxes, so no basis for visual fidelity; JavaScript-built
  pages not reliably rendered; some sites block the fetcher and latency is
  outside our control; no text/image ids, so Claude would have to copy texts
  itself and "texts verbatim" would become a post-hoc check instead of a
  structural guarantee; images would still have to be downloaded by the CMS
  for the Media library, so nothing is saved. Also moves the SSRF-sensitive
  fetch outside the guard of R4.
- *Send the raw HTML produced by Chromium*: a modern landing page's rendered
  HTML is often 200 k to over 1 M tokens (inline scripts, CSS, SVG, framework
  attributes) — 5–20× the cost of the extract, slower, noisier; and it still
  lacks what the page *looks like* (applied CSS, real column layout, colours),
  which only the browser computes and the extract carries directly.
- *Model returns HTML*: unbounded output, could invent tags/text, would need
  a second sanitising pass and still wouldn't be "native blocks".
- *Two passes (draft + visual self-check against a render of the draft)*:
  better fidelity, ~2× cost and latency. Kept as a later improvement if the
  reference set misses SC-002.
- *Tool-use loop letting the model crop/zoom the screenshot*: more capable
  but unbounded cost per import, conflicts with FR-027.

## R4. Guarding against internal addresses (SSRF)

**Decision**: A single guard module in the CMS, used in two places:
1. **Before anything is fetched** (FR-002): URL must be `http:`/`https:`, no
   credentials in the URL, port 80/443 (or unspecified); the host is resolved
   with `dns.lookup(all: true)` and *every* address must be public (reject
   loopback, RFC 1918, CGNAT 100.64/10, link-local 169.254/16 incl. cloud
   metadata, multicast, reserved, `0.0.0.0/8`, IPv6 `::1`, `fc00::/7`,
   `fe80::/10`, IPv4-mapped IPv6 of any of these). Docker service names
   (`cms`, `db`, `garage`…) resolve to private addresses and are therefore
   rejected by the same rule.
2. **Every request the browser makes** (`context.route("**/*")`): the CMS
   performs it itself (`guardedRequest`: same host check, then the connection
   through the guarded undici `Agent` below) and fulfills the browser's
   request with the response, so the address checked is the address
   connected to (no DNS-rebinding window). Chromium does not route the target
   of a redirect handed back to it, so no 3xx reaches the browser:
   sub-resource redirects are followed by the CMS hop by hop through the same
   guard; a redirect of the page itself makes `renderSource` navigate to the
   target (a new routed request), so the page keeps its real address.
   Non-http(s) schemes, WebSockets, audio/video and downloads are aborted.
   *(Security review T071: the first version checked the host in the CMS but
   let the browser container fetch — and resolve — it again.)*
3. **Image downloads** go through the CMS (not the browser) with Node `fetch`
   and an undici `Agent` whose `connect.lookup` applies the same check at
   connect time (closes the DNS-rebinding window for downloads), plus a
   15 MB / 20 s limit per image and `image/*` content-type check.

The `browser` container sits on its own compose network shared only with
`cms` (not `db`, `garage`, `web`). A test-only escape hatch
`IMPORT_ALLOW_PRIVATE_HOSTS=true` exists for e2e fixtures and is refused at
boot when `DEPLOY_ENV=production`, a variable set only by
`infra/docker-compose.prod.yml`. `NODE_ENV` cannot be used: CI runs the e2e
suite against the production images, where `NODE_ENV=production` too.

**Rationale**: Covers the whole attack surface an attacker-supplied URL
opens (direct, redirect, sub-resources, images) with one tested function,
without a new dependency (the IP-range check is ~50 lines, unit-tested).

**Alternatives considered**:
- *Egress proxy container with an allow/deny list*: stronger isolation, but
  a new moving part to configure and maintain (Principle I). Revisit if the
  feature is ever opened beyond trusted editors.
- *`ipaddr.js`-style dependency*: fine, but unnecessary for a fixed range list.

## R5. Where the GrapesJS plugin lives and what it contains

**Decision**: New workspace package **`packages/grapesjs-page-import`**
(`@trefle/grapesjs-page-import`, private, TypeScript sources exported
directly like `@trefle/shared`, no build step). Three entry points:
- `./plugin` — the GrapesJS plugin: component types `trefle-section`,
  `trefle-columns`, `trefle-column` (+ a "Colonnes" trait for 2/3/4 that adds
  empty columns, or removes the last ones after appending their blocks to the
  last remaining column so nothing is lost, drop rules forbidding
  Columns inside a Column) and the two library blocks. Imports `grapesjs`
  types only (peer dependency, exact 0.22.16 per Principle II).
- `./ir` — the Import IR zod schema (shared by the AI call and validation).
- `./serialize` — pure `serializeImport(ir, sources) → { projectData, html,
  css, placedImages, textsUsed }`, no GrapesJS or Payload import, so it runs
  in the CMS job and in unit tests.
The CMS editor loads the plugin with `plugins: [trefleLayoutPlugin]`.

**Rationale**: The user chose a separate package (conversation, option
"paquet dans le monorepo"). It also earns its keep technically: the same
block definitions must be understood identically by the browser editor
(plugin) and the server serializer, and keeping them in one package with no
Payload dependency makes that single source of truth testable in isolation.

**Alternatives considered**:
- *Everything in `apps/cms/src/fields/grapesjs/`*: fewer files; would be the
  Principle I default. Rejected by user decision — recorded in Complexity
  Tracking.

## R6. Section and Columns markup, responsive behaviour

**Decision**:
- Section: `<section data-block="section" style="padding:…;background-…">`
  containing `<div data-block-inner style="max-width:…;margin:0 auto">`
  (the content-width element) that accepts any block.
- Columns: `<div data-block="columns" data-cols="3"
  style="display:flex;flex-wrap:wrap;gap:24px">` with children
  `<div data-block="column" style="flex:1 1 calc((600px - 100%) * 999);min-width:0">`.
- Stacking comes from `flex-wrap` + an all-or-nothing basis, **no media
  query**: while the Columns block is ≥ 600 px wide the basis is negative
  (→ 0) and every column shares one row; below, it is huge and each column
  takes its own row, in order (FR-024). *(First version: a fixed 260 px
  basis — four columns wrapped 3 + 1 even at 1440 px, found in the T070
  evaluation, 2026-09-28.)*
- `section`, `columns`, `column` are added to `@trefle/shared` `BLOCK_TYPES`
  so `countBlocks` recognises them (they are not lead forms, so publish rules
  are unaffected).

**Rationale**: Only tags/attributes already in the renderer's allow-list
(`section`, `div`, `style`, `data-*`), so publishing strips nothing (FR-025)
and no sanitiser change is needed. No media queries means nothing depends on
page CSS surviving scoping, and the same inline-style convention as the
existing six blocks.

**Alternatives considered**:
- *CSS grid with `@media` rules in page CSS*: needs breakpoints in
  `builder.css`, harder for editors to adjust.
- *Tables*: not in the allow-list, not responsive.

## R7. Lead form nested inside Section/Columns (FR-025)

*Confirmed by the user on 2026-09-27 (option A over keeping the form
top-level only).*

**Decision**: Replace the string split (`splitAroundForm` → `before` /
`after` fragments) in the renderer with a parse of the sanitised HTML into
React elements using **`html-react-parser`**, replacing the one
`[data-block="lead-form"]` node by the real `<LeadForm>` wrapper wherever it
sits. `hasForm` becomes a simple marker test. The top-level wrapper handling
(page background on `.trefle-page-shell`) is preserved as-is.

**Rationale**: Splitting a string around a nested placeholder produces
unbalanced fragments (`<section><div>` … / … `</div></section>`) that React
cannot render; the lead form must work inside a Column (a landing page's
hero commonly puts the form in the right-hand column). Parsing into a tree is
the correct model and *removes* the delicate string logic
(`wrapsWholeString`, non-greedy `FORM_RE`) that already caused a production
bug. `html-react-parser` runs in the server component only (zero client JS,
Principle V), is small (htmlparser2 + domhandler), MIT, actively maintained.
Principle II justification recorded in the plan.

**Alternatives considered**:
- *Forbid the lead form inside Columns*: contradicts FR-025 and Story 3's
  acceptance scenario 4; imported heroes would lose their form position.
- *Hand-written DOM walk over the sanitiser's DOM output*: same result with
  more code of our own to maintain.

## R8. Images: retrieval, size limit, description

**Decision**: For each image id placed by the IR (content `<img>` and section
background images), the job downloads the *largest candidate* from the DOM
extract (`currentSrc`, else best `srcset` entry, else `src`, else the CSS
`background-image` URL) through the guarded fetch (R4), deduplicates by
SHA-256 of the bytes (FR-015), and normalises with `sharp` (already a CMS
dependency): SVG and animated formats rasterised, EXIF stripped, resized to
≤ 2400 px wide, encoded WebP at decreasing quality (82 → 50) until ≤ 500 KB;
if still too big, halve the width and retry once; failing that, the standard
image placeholder is used and the report lists it (FR-014). Media is created
with `payload.create({ collection: "media", file })`, attributed to the
importing user, and linked to the import (for cleanup on failure/cancel).

The Media `alt` field changes from `required: true` to a validation rule
"required unless `altPending` is set": imported images with no source alt
text get `alt: ""`, `altPending: true`, are shown as "À décrire" in the Media
list, and the page `<img>` carries `alt=""`; the import report lists them
(FR-013, FR-030). Manual uploads keep requiring a description.

**Rationale**: Keeps the 500 KB limit (Assumption) while preserving quality
for large photos; `sharp` avoids any new dependency. The `altPending` flag is
the smallest schema change that satisfies FR-013 without weakening the rule
for hand uploads.

**Alternatives considered**:
- *Use the file name as alt*: forbidden by clarification Q4.
- *Store images in a separate "imported" collection*: they must be ordinary
  Media items (FR-012).
- *Screenshot crops instead of original files*: lower quality, loses
  transparency.

## R9. Background images and the image proxy

**Decision**: Extend the renderer's ImgProxy rewrite to `url(...)` values
that point at `ASSET_ORIGIN` inside inline `style` attributes and in
`builder.css` (width 1920, `fit`), in the same module as `rewriteImageTags`.

**Rationale**: Principle V requires images through the proxy at an
appropriate size; Section backgrounds would otherwise be served full-size
straight from the bucket.

**Alternatives considered**: *Ban background images*: loses fidelity on most
hero sections.

## R10. Cost tracking and the monthly cap

**Decision**: After the AI call, cost = `usage` tokens (input, cache
creation, cache read, output) × a per-model USD price table in code
(`claude-opus-5`: $5 / $25 per MTok; an unknown model id is priced at the
most expensive known rate, never zero). Converted to euros with an
admin-editable rate in Settings (`importUsdToEurRate`, default 0.92). Stored
on the import (`costUsd`, `costEur`), including for failed/cancelled imports
that reached the AI step. Month total = sum of `costEur` of imports whose
`startedAt` falls in the current calendar month in Europe/Paris. The start
endpoint refuses when `total ≥ cap` (FR-027e); running imports finish
(FR-027c). Settings gains `importMonthlyCapEur` (default 20, `0` = imports
disabled) and `importDefaultUserBudgetEur` (default 10). Each user may carry
their own `importMonthlyBudgetEur` (admin-only field on `users`; empty =
default). A user's month total = same sum filtered on `createdBy`; the start
endpoint checks the user's budget first, then the global cap (FR-027e).
*Per-user budgets added on 2026-09-27 at the user's request (global cap kept
as the ceiling on the bill).*

**Rationale**: No dependency on Anthropic's Admin/Cost API (would need an
admin key on the server); the SDK's `usage` is exact per request. The euro
rate is approximate by nature and admin-visible.

**Alternatives considered**: *Anthropic console spend limits only*: bounds
the whole org account, not this feature, and is invisible in Trefle.

## R11. Accessibility checks on the result (FR-030)

**Decision**: Pure functions over the serialized IR (not the rendered page):
missing alt (from source), contrast of each text colour against its nearest
background colour (WCAG 2.x formula, 4.5:1 normal / 3:1 for ≥ 24 px or
≥ 18.66 px bold), skipped heading levels in document order, links/buttons
whose text is empty. Background images make contrast "not verifiable" and are
reported as such. Results go into the import report only (FR-029, FR-031).

**Rationale**: Deterministic, cheap, unit-testable, no browser needed. axe on
the published page (existing e2e) remains the authority.

## R12. Creating the page

**Decision**: The job creates the draft page itself with
`payload.create({ collection: "pages", data, user: importer,
overrideAccess: false })` — title, type, domain, path, language from the
wizard; `builder.projectData/html/css` from the serializer; `form.fields`
pre-filled on subscription pages (Story 4); `importedFrom` → the import.
The wizard then navigates to that page's edit view. All existing `pages`
hooks run unchanged (starter-template hook leaves a non-default builder
alone; block count recomputed; no inline images).

**Rationale**: The 004 wizard hands off through `sessionStorage` and lets
the standard create form create the page. An import result (projectData of
a whole page + report + form) is too large and too important for that
hand-off, and FR-020 ("no page on failure") / FR-019 (report linked to the
page) are simpler when the page exists only after success. `overrideAccess:
false` + the real user keeps activity log and access identical to a manual
create.

**Alternatives considered**: *Stash result and reuse the 004 bootstrap*:
abandoned imports would leave orphan media and the report would have no page
to attach to.

## R13. How the editor loads imported content

**Decision**: The serializer emits GrapesJS `projectData` directly (same
approach as `starterTemplates.ts`: component JSON with explicit `type` —
`text`, `image`, `link`, the three layout types — `attributes`, `components`
and inline `style` strings), plus the parallel `html`/`css` export. A unit
test loads a serialized fixture into a headless GrapesJS instance (jsdom,
vitest) and checks `getHtml()` round-trips to the serializer's `html`
(modulo whitespace) and every node is selectable/editable.

**Rationale**: The editor opens `projectData` as-is; if it were empty the
canvas would be blank. Explicit types make texts editable in place like
dragged blocks (FR-009). The round-trip test is what guarantees "native".

## R14. Testing an import end to end without spending money

**Decision**: The AI client is injected; `IMPORT_AI_MODE=fixture` (refused
when `DEPLOY_ENV=production`, see R4) returns a canned IR for known fixture pages served by the e2e
stack. Unit tests cover URL guard, budget maths (month boundary in
Europe/Paris), image normalisation, IR validation, serializer, a11y checks,
renderer with nested form. One e2e test drives wizard → progress → editor on
a fixture page. Fidelity (SC-002) is measured manually on a 10-page reference
set with the real model (quickstart §4), costing ≈ €7.

**Alternatives considered**: *Recorded HTTP cassettes of real AI calls*:
brittle across prompt changes; the fixture IR tests the same code paths.

## R15. Per-device styles in the imported page (FR-011a)

**Decision**: Use the editor's existing device views, which are GrapesJS
0.22.16's defaults (Trefle's `grapesjs.init` does not override
`deviceManager`): Desktop (base styles), Tablet (`max-width: 992px`), Mobile
landscape (`max-width: 768px`), Mobile portrait (`max-width: 480px`). The IR's
`tablet` overrides become CSS rules under `(max-width: 992px)` and its
`mobile` overrides under `(max-width: 480px)`; `hidden` becomes
`display:none` under the same condition. Mobile landscape gets nothing of its
own, so it inherits Tablet — as it does for hand-made adjustments. The
serializer gives each styled component a stable id and writes device rules
into `projectData.styles` as `{ selectors: ["#<id>"], style, mediaText,
atRuleType: "media" }` — the same shape GrapesJS stores when an editor styles
a component with a device selected — and into the exported `css` as
`@media (max-width: …) { #<id> { … } }`. The breakpoint values are imported
from one constant in `layout.ts`, with a unit test asserting they equal the
installed GrapesJS default device config, so a future device change breaks
the test instead of silently desynchronising.

**Rationale**: Per-screen editing already exists end to end: the editor
shows the device selector, exports media rules to `builder.css`, and the
renderer injects that CSS unchanged. Writing the import's adjustments in the
exact storage shape of a manual device edit is what makes them "native" and
editable (FR-009). Only whitelisted properties are allowed, as for desktop.

**Alternatives considered**:
- *Rely on block defaults only (no device overrides)*: the earlier plan;
  loses the source's mobile typography/spacing and cannot hide
  desktop-only decorations.
- *Custom breakpoints matching common phone widths*: would diverge from the
  editor's device views, so imported adjustments wouldn't show where editors
  look for them.

## R16. Automatic per-device check of the result (FR-011c)

**Decision**: After building, the job loads the generated `html` + `css` into
a fresh page of the browser container with `page.setContent` (no network:
image requests are fulfilled with same-size placeholders using the Media
width/height, fonts are the system font anyway) and measures at the four
device preview widths (1440, 770, 568, 320 px — the editor's own preview
widths, 320 being the strictest phone): document wider than the viewport,
visible text with computed `font-size` < 14 px, buttons/CTA links (and links
styled as blocks) whose box is < 44 px in either dimension, standalone text
links (a paragraph's whole text, e.g. a card title) < 24 px (WCAG 2.2 2.5.8
— a first version applied 44 px to them too and flagged every two-line card
title, T070 2026-09-28), links inside a sentence exempt, images or blocks
whose right edge exceeds the viewport. Findings go into
`report.deviceChecks`; `report.sourceHadMobileLayout` records whether the
source's mobile rendering differed from a scaled desktop one (FR-011b).

**Rationale**: Deterministic, no AI cost, catches what the model may miss,
runs in the container already open for the import (~3–5 s). It measures the
real generated markup, so it also guards the serializer.

**Alternatives considered**: *Ask the model to self-check from screenshots
of its output*: a second AI call (cost, latency) for checks a browser does
exactly.
