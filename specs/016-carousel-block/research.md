# Research: Carousel block

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-10-07

No `NEEDS CLARIFICATION` was left in the Technical Context. Each entry below
records a design decision, why, and what was rejected.

## R1 — Where the editor code lives

**Decision**: The GrapesJS types and the library block go in
`packages/grapesjs-page-import` (`src/carousel.ts` for the plain-JSON markup
builder, registered by the existing `trefleLayoutPlugin`), next to Section and
Colonnes. Markers, limits and the settings parser go in `@trefle/shared`
(`src/carousel.ts`), because the renderer and `countBlocks` need them and must
not depend on GrapesJS.

**Rationale**: That package already holds the layout blocks, has jsdom +
headless GrapesJS tests (`plugin.test.ts`, `roundtrip.test.ts`), and is where
the follow-up (FR-017, imports producing carousels) will need `carouselJson`.
`apps/cms` runs vitest in `node`, with no DOM, so editor model tests can't
live there without new config.

**Alternatives**: `apps/cms/src/fields/grapesjs/carouselBlock.ts` like the
custom-code block — rejected: no headless tests there, and the import would
later have to import from the app. A new package — rejected (Principle I).

## R2 — Published markup: plain blocks plus data attributes

**Decision**: The carousel is stored and exported as ordinary markup:

```html
<section data-block="carousel" aria-label="Carrousel" data-per-view="1"
         data-autoplay="5" data-arrows="false" data-dots="false" id="…">
  <div data-block="carousel-slide">…blocks…</div>
  …
</section>
```

Settings are attributes on the carousel element (GrapesJS traits map to
attributes natively); absent attribute = default. Exact grammar in
[contracts/markup.md](./contracts/markup.md).

**Rationale**: Every piece already passes the HTML allow-list (`section`,
`div`, `data-*`, `aria-*`) — FR-016, no allow-list change. HTML re-parsed by
the « Code » view keeps everything (FR-009), since types are recognised by
their markers like the lead form and the layout blocks.

**Alternatives**: settings as GrapesJS model props only — lost when the HTML
is re-parsed, invisible to the renderer. A `<script type="application/json">`
config — not allowed by the sanitizer.

## R3 — Behaviour on the published page: a client component swapped in by the renderer

**Decision**: `renderPageBody` (apps/web/src/lib/render.ts) replaces each
`data-block="carousel"` element by `<Carousel>` (apps/web/src/components/
carousel.tsx, `"use client"`), passing the parsed settings, the element's
`id`/`class`/`style`, and its slides converted with `domToReact` **using the
same replace options minus the carousel branch** — so a « Code personnalisé »
placeholder inside a slide is still swapped for its code, while a carousel
nested in a slide (only possible through the « Code » view or the API) stays
plain markup instead of becoming a second interactive carousel.

**Rationale**: This is exactly how the lead form and the custom-code block
are already handled (one parse, replaced in place). Page HTML can't carry
scripts (`<script>`/`on…` stripped, CSP nonce), so behaviour must come from
the platform's own bundle; a client component is Next's native way to ship
it. No third-party slider (FR-016, Principle II).

**Alternatives**: a GrapesJS `script` on the component — stripped by the
sanitizer on publish, and runs in the editor canvas. A small vanilla script
that scans the DOM — a second, non-React mechanism for no gain. A slider
library (Swiper, Embla) — 10–40 KB for what scroll-snap gives natively.

## R4 — Movement: native horizontal scroll with scroll-snap

**Decision**: Slides sit in a horizontal scroll container (`overflow-x:
auto`, `scroll-snap-type: x mandatory`, each slide `scroll-snap-align:
start`, `flex: 0 0 calc(100% / var(--per-view))`). Arrows and dots call
`track.scrollTo({ left, behavior })`. Swipe is the browser's own scroll. The
current position is derived from `scrollLeft / slideWidth` on `scrollend`
(with a `scroll` + debounce fallback where `scrollend` is missing).

The track carries `tabindex="0"` from the server render: a scroll container
with nothing focusable inside is unreachable by keyboard (axe
`scrollable-region-focusable`, serious), the common case for image/text
slides; focused, it scrolls with the arrow keys natively.

**Rationale**: Gives swipe with momentum, vertical-scroll passthrough
(US1-6), trackpad and keyboard scrolling for free, and is the no-JS fallback
itself (FR-011): the server-rendered markup is already a working scrollable
strip. Equal-height slides fall out of flexbox `align-items: stretch`
(FR-014). No pointer-event code to maintain.

**Alternatives**: transform-based sliding with pointer handlers — more code,
worse without JS (everything but slide 1 unreachable). CSS-only `:target`
carousels — break history/back button and focus.

## R5 — No-JS and hydration

**Decision**: The component renders the track and slides on the server; the
controls (arrows, dots, pause), `inert` on off-screen slides, the live region
and autoplay are only rendered/started after mount (`useEffect` sets
`ready`). Without JS the visitor gets the scrollable strip with a visible
horizontal scrollbar hint (CSS `scrollbar-width: thin` only when not
`[data-ready]`).

**Rationale**: Controls that do nothing before hydration would be a trap;
rendering them only once they work satisfies FR-011 and avoids a hydration
mismatch.

## R6 — Several slides visible, responsive

**Decision**: `--per-view` is set from `data-per-view` (1–3) on large screens
and capped by CSS: `max-width: 992px` → at most 2, `max-width: 768px` → 1 —
the editor's own device breakpoints (`DEVICE_BREAKPOINTS`, 012 R15). The
component never reads the setting for geometry: it counts visible slides as
`round(track.clientWidth / slide.offsetWidth)` and positions as
`slides − visible + 1`; dots are per position.

**Rationale**: One source of truth (CSS) for what is visible; JS only measures.
With one slide per view (default) positions = slides, so « one dot per slide »
holds as the spec describes.

## R7 — Accessibility pattern

**Decision**: Follow the WAI-ARIA APG « Carousel » pattern (tabbed-free
variant with buttons):

- Outer element: `role="region"` + `aria-roledescription="carrousel"` +
  `aria-label` from the setting (default « Carrousel »).
- Each slide: `role="group"`, `aria-roledescription="diapositive"`,
  `aria-label="N sur M"`.
- Off-screen slides get `inert` (React 19 boolean prop) → their links and
  buttons leave the focus order and the accessibility tree (US2-1).
- Controls are `<button>`s with French labels: « Diapositive précédente »,
  « Diapositive suivante », « Aller à la diapositive N » (current dot
  `aria-current="true"`), « Mettre en pause » / « Reprendre le défilement ».
  They sit in one bar under the slides (never over a slide's content —
  overlaid arrows covered text slides on phones), in visual = DOM = tab
  order: pause (when autoplay), ‹, dots, ›.
- A visually hidden `aria-live="polite"` region says « Diapositive N sur M »
  when the visitor changes slide with a control; autoplay never writes to it
  (a live region on the track would announce nothing: scrolling changes no
  DOM).
- Reduced motion: `behavior: "auto"` for `scrollTo`, `scroll-behavior:
  auto` in CSS, autoplay never starts (FR-012, FR-013).
- Visible focus: `:focus-visible` outline with 3:1 contrast on both light and
  dark backgrounds (two-tone outline: dark ring + white halo).

**Rationale**: APG is what axe and screen readers expect; `inert` replaces
hand-managed `tabindex` juggling.

## R8 — Autoplay

**Decision**: `setInterval(next, seconds*1000)` while `playing`. Paused while
pointer is over the carousel or focus is inside it; stopped for good (until
« Reprendre ») once the visitor uses an arrow, a dot, or swipes. Never starts
under `prefers-reduced-motion: reduce` or when the page is hidden
(`visibilitychange`). Interval clamped 3–10 s (shared parser).

Hover is tracked with `pointerover` (bubbles, fires on any move inside) plus a
`:hover` check at mount: a pointer already resting on the carousel when the
page loads never fires `pointerenter`, and rotation ran under it (found by the
e2e suite — Playwright's pointer starts at (0, 0), over a top-of-page
carousel). Focus on the pause button itself does not hold rotation (APG).

**Rationale**: WCAG 2.2.2 (pause, stop, hide) and spec US3-2.

## R9 — Images in later slides

**Decision**: While replacing a carousel, the renderer sets `loading="lazy"`
on every `<img>` in slides after the first that has no `loading` attribute
(the existing ImgProxy rewrite runs before, on the HTML string). Native lazy
loading works inside horizontal scroll containers and loads near-viewport
images ahead of time (US2-5, FR-015).

**Alternatives**: JS-driven `data-src` swapping — breaks without JS.

## R10 — Editor: one slide at a time, native toolbar

**Decision**:

- Types `trefle-carousel` and `trefle-carousel-slide`, recognised by their
  markers (`isComponent`).
- The carousel's **view** holds the active index (view state, never
  persisted). It sets a canvas-only `data-tf-active` attribute on the active
  slide's element and a `data-tf-label="Diapositive N / M"` on the carousel's;
  canvas-only CSS hides the other slides and prints the label. As in
  `customCodeBlock.ts`, these attributes are re-applied after GrapesJS
  rewrites attributes, so they never reach the model or `getHtml()`.
- Carousel `toolbar`: the default buttons plus « ◀ » « ▶ » (show
  previous/next) and « + » (add an empty slide after the active one, shown
  at once).
- Slide: native toolbar gives duplicate (`tlb-clone`), delete, select
  parent, plus « Déplacer avant / après » commands — drag-to-reorder has no
  visible target in a one-slide canvas (the layer manager still allows it).
  `draggable: '[data-block="carousel"]'` keeps slides in a carousel (moving
  among them = reorder). `removable` is set to `false` while it is the only
  slide; at 12 slides `copyable` is `false` and « + » adds nothing and shows
  the alert « 12 diapositives maximum » (toolbar buttons can't be disabled)
  (FR-006) — flags recomputed on the carousel's `components` change.
- `component:selected`: if the selection sits in a slide of a carousel, that
  slide becomes active (FR-005).
- Drop rules (FR-007): `lead-form` and `trefle-carousel` get a `draggable`
  function refusing any target inside a `[data-block="carousel-slide"]`
  (`target.closest`). The lead-form type is defined in `Editor.client.tsx`
  (`leadFormType`); its rule is added there.
- The Trait panel: « Diapositives visibles » (select 1/2/3), « Défilement
  automatique » (checkbox), « Intervalle (secondes) » (number 3–10),
  « Afficher les flèches », « Afficher les points » (checkboxes, default on),
  « Nom du carrousel » (text → `aria-label`). Attribute traits, so values are
  the markup itself (R2); defaults are written as absence.

**Rationale**: Uses GrapesJS's own toolbar, traits and drop rules rather
than a custom panel (Principle II). Hiding non-active slides in the canvas
keeps the canvas height honest and makes « edit this slide » obvious.

**Alternatives**: all slides stacked vertically in the canvas — easy to edit
but nothing like the result. A custom React slide manager outside the
canvas — a second UI to maintain.

## R11 — Server-side guard for a lead form in a carousel

**Decision**: `countBlocks` also counts `leadFormInCarousel` (a lead-form
found under a carousel-slide during the walk; the stack carries an
« inside carousel » flag). `pages-publish-guard` refuses publication when it
is > 0 ("the lead-form block cannot be placed inside a carousel", in English
like the guard's other messages). The renderer needs no special case.

**Rationale**: Editor drop rules are UX only; the « Code » view (014) and the
REST API can produce any markup. `blockCount` is a `json` field — no
migration.

## R12 — Testing

- `@trefle/shared`: `parseCarouselSettings` (defaults, clamping, junk),
  `countBlocks` carousel/slide counts and `leadFormInCarousel`.
- `packages/grapesjs-page-import` (jsdom, headless): block present; markup
  re-parsed from HTML gives the two types with settings; projectData round
  trip; slide count limits (`removable`/`copyable` flags); drop rules
  (`lead-form` / carousel refused inside a slide); trait → attribute
  defaults-as-absence; `getHtml()` never contains `data-tf-*`.
- `apps/cms`: publish guard refuses lead-form-in-carousel.
- `apps/web` (vitest): `renderPageBody` replaces a carousel (slides,
  settings, id/class/style kept), custom-code placeholder inside a slide is
  still replaced, `loading="lazy"` added to later slides only; `PageShell`
  smoke with a carousel.
- `apps/web` e2e (Playwright, `us-carousel.spec.ts`): arrows/dots/wrap,
  keyboard + focus order (`inert`), touch swipe (mobile viewport), no-JS
  context (`javaScriptEnabled: false`, every slide reachable by scroll),
  reduced motion (`emulateMedia`), autoplay + pause, no layout shift below,
  axe clean. Constitution IV: the editor's visual behaviour (toolbar,
  one-slide canvas) is checked manually per quickstart.
