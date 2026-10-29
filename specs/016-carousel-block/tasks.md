# Tasks: Carousel block

**Input**: Design documents from `/specs/016-carousel-block/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: included — the constitution (Principle IV) requires automated tests for data transformations (settings parser, `countBlocks`), Payload hooks (publish guard) and renderer logic, and a smoke check per published template; the contracts list the test obligations ([markup.md](contracts/markup.md#test-obligations), [editor.md](contracts/editor.md#test-obligations)).

**Format**: `- [ ] T### [P?] [Story?] Description with file path`

## Phase 1: Setup

No new dependency, package or migration (plan.md, Technical Context). Nothing to set up.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the markup contract shared by editor, CMS guard and renderer.

- [X] T001 Create `packages/shared/src/carousel.ts` per contracts/markup.md: `CAROUSEL_MARKER = "carousel"`, `CAROUSEL_SLIDE_MARKER = "carousel-slide"`, `CAROUSEL_MAX_SLIDES = 12`, `CAROUSEL_AUTOPLAY_RANGE = { min: 3, max: 10, default: 5 }`, `CAROUSEL_DEFAULT_LABEL = "Carrousel"`, type `CarouselSettings` and `parseCarouselSettings(attribs)`: `label` = trimmed `aria-label` or « Carrousel »; `perView` = `data-per-view` rounded and clamped to 1–3 (non-numeric → 1); `autoplay` = `data-autoplay` clamped to 3–10, absent/empty/non-numeric/≤0 → `null`; `arrows`/`dots` = `false` only when the attribute is exactly `"false"`; re-export from `packages/shared/src/index.ts`
- [X] T002 [P] Table tests for `parseCarouselSettings` (no attributes → defaults; `data-per-view` "0", "2", "7", "abc"; `data-autoplay` absent, "2", "4", "60", "x"; `data-arrows` "false", "true", ""; blank `aria-label`) in `packages/shared/tests/carousel.test.ts`
- [X] T003 Add `"carousel"` and `"carousel-slide"` to `BLOCK_TYPES` and `leadFormInCarousel: number` to `BlockCounts` in `packages/shared/src/blocks.ts`; in `countBlocks`, push `[node, insideSlide]` pairs on the stack so a lead-form under any `carousel-slide` ancestor (directly or nested in a Section/Columns inside the slide) increments `leadFormInCarousel`; update the header comment (016)
- [X] T004 [P] Extend `packages/shared/tests/blocks.test.ts`: carousel + 3 slides counted in `byType`; lead form at top level → `leadFormInCarousel` 0; directly in a slide → 1; in a Section inside a slide → 1; `leadForm` total still counts all of them
- [X] T005 In `apps/cms/src/hooks/pages-publish-guard.ts`, read `builder.blockCount.leadFormInCarousel` (missing → 0) and, when > 0, push "the lead-form block cannot be placed inside a carousel" (in English, like the guard's other messages); extend the `builder` type annotation
- [X] T006 [P] Add cases to `apps/cms/tests/pages-publish-guard.test.ts`: subscription page with `leadForm: 1, leadFormInCarousel: 1` → refused with that message; `leadFormInCarousel: 0` → unchanged behaviour; absent key → unchanged behaviour
- [X] T007 [P] Create `packages/grapesjs-page-import/src/carousel.ts` (no `grapesjs` import, like `layout.ts`): `CAROUSEL_TYPES = { carousel: "trefle-carousel", slide: "trefle-carousel-slide" }`, `slideJson(children = [])` → `{ type, tagName: "div", attributes: { "data-block": "carousel-slide" }, components }`, `carouselJson(slides?)` → `{ type, tagName: "section", attributes: { "data-block": "carousel" }, components }` defaulting to 3 slides each holding the library Image placeholder and a rich-text `<p>Diapositive N</p>` (contracts/editor.md, Library block); add `"./carousel": "./src/carousel.ts"` to `exports` in `packages/grapesjs-page-import/package.json`

**Checkpoint**: shared contract, block counting and publish guard in place; nothing visible yet.

---

## Phase 3: User Story 1 — An editor builds a carousel and visitors browse it (Priority: P1) 🎯 MVP

**Goal**: « Carrousel » block in the editor with one-slide-at-a-time editing; published carousel with arrows (wrap-around), dots and swipe.

**Independent Test**: quickstart.md §2 steps 1–7 and 9, and §3 rows « Arrows / wrap », « Dots », « Swipe ».

### Published page (delivery slice 1)

- [X] T008 [US1] Create `apps/web/src/components/carousel.module.css`: `.carousel` (position relative), `.track` (`display: flex`, `overflow-x: auto`, `scroll-snap-type: x mandatory`, `scroll-behavior: smooth`, `overscroll-behavior-x: contain`, `align-items: stretch`; `:focus-visible` outline, since the track is focusable — T009), `.slide` (`flex: 0 0 calc(100% / var(--per-view, 1))`, `scroll-snap-align: start`, `min-width: 0`), hide the scrollbar only under `.carousel[data-ready]`; `.arrow` (`.prev`/`.next`, overlaid on the sides), `.bar` (dots row), `.dot`, `.dot[aria-current="true"]`, `.srOnly` with neutral colours readable on light and dark backgrounds (semi-opaque dark disc, white glyph), buttons at least 44×44 px
- [X] T009 [US1] Create `apps/web/src/components/carousel.tsx` (`"use client"`): props `settings: CarouselSettings`, `id?`, `className?`, `style?`, `slides: { id?, className?, style?, children: ReactNode }[]`; renders `<section>` (outer id/class/style + `--per-view` custom property) › `.track` › one `.slide` per slide; the track is rendered on the server with `tabIndex={0}` so the scroll area is reachable by keyboard with or without JS (axe `scrollable-region-focusable`, serious, fires on a carousel whose slides hold nothing focusable); after mount (`ready` state, set in `useEffect`) renders `.controls` with « Diapositive précédente » / « Diapositive suivante » buttons and one dot per position (« Aller à la diapositive N », `aria-current` on the current one); `position` derived from `track.scrollLeft / slideWidth` on `scrollend` (fallback: `scroll` debounced 100 ms); positions = `slides − round(track.clientWidth / slide.offsetWidth) + 1`; arrows wrap (next on last → 0, previous on 0 → last) via `track.scrollTo({ left: slide.offsetLeft - track.offsetLeft })`; no controls when positions ≤ 1 (research R4–R6)
- [X] T010 [US1] In `apps/web/src/lib/render.ts` `renderPageBody`: when `node.attribs["data-block"] === CAROUSEL_MARKER`, collect direct element children with `data-block="carousel-slide"` (others dropped, first `CAROUSEL_MAX_SLIDES` kept), convert each slide's children with `domToReact(children, options)` using an options object identical to the page's **except** that a nested `data-block="carousel"` is not turned into a `<Carousel>` (it renders as its plain markup, slides stacked — contracts/markup.md), so lead-form / custom-code replacements still apply inside, and return `<Carousel settings={parseCarouselSettings(node.attribs)} id class→className style={parseInlineStyle(...)} slides=[…]/>`; hoist the `parse` options into a named const so it can reference itself; update the function's doc comment (016)
- [X] T011 [P] [US1] Create `apps/web/tests/render-carousel.test.tsx` (`renderToStaticMarkup`): a 3-slide carousel renders `.track` with 3 slides in order and their content; outer `id`/`class`/`style` kept; a non-slide direct child is dropped; 14 slides → 12; a `custom-code` placeholder inside a slide goes through `renderCode`; a carousel nested in a slide renders as plain `section`/`div` markup (one `.track` in the output, not two); the track has `tabindex="0"`; a page without carousel renders byte-identical to before
- [X] T012 [P] [US1] Add a smoke case to `apps/web/tests/page-shell.test.tsx`: a page whose `builder.html` holds a carousel next to the lead form renders without error and contains each slide's text
- [X] T013 [US1] Create `apps/web/tests/e2e/us-carousel.spec.ts` following `us-layout-blocks.spec.ts` (page created via the CMS REST API with the contracts/markup.md markup, 4 slides with distinct headings + lead form outside the carousel): « Diapositive suivante » ×4 returns to slide 1; « Diapositive précédente » on slide 1 shows slide 4; dot 3 shows slide 3 with `aria-current="true"`; in a mobile viewport (`hasTouch`) a horizontal swipe moves to slide 2 and a vertical one scrolls the page — gestures sent with CDP `Input.dispatchTouchEvent` (`touchStart` → several `touchMove` → `touchEnd`, Chromium project only), since Playwright has no swipe API and a wheel event is not a touch gesture; the lead form still submits

### Editor (delivery slice 2)

- [X] T014 [US1] In `packages/grapesjs-page-import/src/carousel-plugin.ts` (`registerCarousel(editor)`, called at the end of `trefleLayoutPlugin` in `src/plugin.ts`; a separate module because `carousel.ts` must stay free of `grapesjs` for server use), register type `trefle-carousel` (`isComponent`: `data-block="carousel"`; defaults: `name: "Carrousel"`, `tagName: "section"`, `droppable` only `trefle-carousel-slide`, `draggable` a function refusing any target that is or sits inside a `[data-block="carousel-slide"]`) and type `trefle-carousel-slide` (`isComponent`: `data-block="carousel-slide"`; `name: "Diapositive"`, `draggable: '[data-block="carousel"]'`, `droppable` a function refusing `lead-form` and `trefle-carousel` sources); in the carousel model `init`, on `components` add/remove recompute each slide's `removable` (`false` when it is the only slide) and `copyable` (`false` at 12 slides); keep the `!Components.getType` idempotency guard
- [X] T015 [US1] `carousel-plugin.ts`: carousel **view** holds `active` (view state, starts at 0, clamped when slides change); `onRender` and an overridden `updateAttributes` (pattern of `apps/cms/src/fields/grapesjs/customCodeBlock.ts`) set canvas-only `data-tf-active` on the active slide's element and `data-tf-label="Diapositive N / M"` on the carousel's element; add canvas CSS (in `CANVAS_CSS`): non-active slides `display: none`, label via `::before`, empty slide dashed outline + « Déposez des blocs ici »
- [X] T016 [US1] `carousel-plugin.ts`: carousel `toolbar` = GrapesJS default items plus commands `trefle-carousel:prev`, `trefle-carousel:next` (wrap) and `trefle-carousel:add` (appends `slideJson()` after the active slide and makes it active; no-op with `window.alert` « 12 diapositives maximum » at `CAROUSEL_MAX_SLIDES`); slide `toolbar` = GrapesJS default items plus `trefle-carousel:move-prev` / `trefle-carousel:move-next` (« Déplacer avant » / « Déplacer après »: swaps the slide with its neighbour, no-op at either end, the moved slide stays active and selected) — reordering by drag is impossible in a canvas showing one slide; a duplicated slide (`component:clone`) becomes active; on `component:selected`, if the selection has a `[data-block="carousel-slide"]` ancestor (or is one), make it the active slide of its carousel (FR-005)
- [X] T017 [US1] `carousel-plugin.ts`: `Blocks.add("trefle-carousel", { label: "Carrousel", media: <inline SVG icon>, content: carouselJson(), onClick })` inside the existing `!Blocks.get` guard, with an `onClick` placing the carousel like the « Code personnalisé » block does (`apps/cms/src/fields/grapesjs/customCodeBlock.ts`, `Blocks.add` `onClick`: after the block holding the selection, at the end of a selected column, else at the end of the page — but never inside a slide: a selection inside a carousel places it after that carousel) and selecting it; copy the placement logic (second use, constitution I — no shared helper yet); update the plugin's header comment (016)
- [X] T018 [US1] In `apps/cms/src/fields/grapesjs/Editor.client.tsx` `leadFormType`, add `draggable` refusing targets inside `[data-block="carousel-slide"]` (FR-007); update `apps/cms/src/fields/grapesjs/blocks.ts` header comment to mention the Carrousel block lives in the plugin
- [X] T019 [P] [US1] Create `packages/grapesjs-page-import/tests/carousel.test.ts` (headless, like `plugin.test.ts`): block registered once when the plugin runs twice; contracts/markup.md HTML re-parses to the two types; `getProjectData` → new editor `loadProjectData` keeps slides, order and attributes; removing down to one slide → `removable` false; 12 slides → `copyable` false and `trefle-carousel:add` adds nothing; slide `droppable` refuses a carousel and a `{ attributes: { "data-block": "lead-form" } }` component; carousel `draggable` refuses a Section inside a slide; `move-next` on slide 1 of 3 gives order 2-1-3 and `move-prev` on slide 1 is a no-op; clicking the block (calling its `onClick`) with a text selected inside a slide adds the carousel after the outer carousel, not inside the slide; after running prev/next commands `editor.getHtml()` contains no `data-tf-`

**Checkpoint**: editors build carousels; visitors browse them. Publishable only together with Phase 4 (US2) — see Implementation Strategy.

---

## Phase 4: User Story 2 — Every visitor can use it (Priority: P2)

**Goal**: keyboard, screen reader, reduced motion, no-JS, lazy images, no layout shift (FR-011 – FR-015).

**Independent Test**: quickstart.md §3 rows « Keyboard », « Screen reader », « Reduced motion », « No JS », « Layout shift », « Lazy images ».

- [X] T020 [US2] In `apps/web/src/components/carousel.tsx`: outer `role="region"`, `aria-roledescription="carrousel"`, `aria-label={settings.label}`; each slide `role="group"`, `aria-roledescription="diapositive"`, `aria-label="N sur M"`; after mount, `inert` on slides outside the visible range and a visually hidden `aria-live="polite"` region announcing « Diapositive N sur M » on control use (research R7); `data-ready` on the outer element once mounted
- [X] T021 [US2] Same component: read `matchMedia("(prefers-reduced-motion: reduce)")` (and its `change`) → `scrollTo` with `behavior: "auto"`; in `carousel.module.css` add `@media (prefers-reduced-motion: reduce) { .track { scroll-behavior: auto } }` and a `:focus-visible` two-tone outline (dark ring + white halo) on `.arrow`/`.dot`
- [X] T022 [US2] In `apps/web/src/lib/render.ts` carousel branch, before `domToReact`, set `attribs.loading = "lazy"` on every `img` descendant of slides 2…M that has no `loading` attribute (FR-015, research R9)
- [X] T023 [P] [US2] Extend `apps/web/tests/render-carousel.test.tsx`: server markup has `role="region"`, `aria-roledescription`, slide labels « 1 sur 3 »…; no `<button>` in the server markup (controls are mount-only); images in slide 1 have no `loading`, images in slides 2–3 have `loading="lazy"`, an explicit `loading="eager"` is kept
- [X] T024 [US2] Extend `apps/web/tests/e2e/us-carousel.spec.ts`: keyboard — Tab order reaches « précédent », « suivant », dots, focus never lands in a hidden slide's link; `emulateMedia({ reducedMotion: "reduce" })` — slide change completes without intermediate scroll positions; a `javaScriptEnabled: false` context — no carousel button, every slide heading becomes visible by scrolling the track; slides of different heights — the lead form's `boundingBox().y` is identical before and after changing slide; the track receives keyboard focus and `ArrowRight` scrolls it; axe (`E2E_RUN_A11Y`) has no serious/critical violation on the page **and** on a third page whose carousel holds text and images only (nothing focusable in the slides — the `scrollable-region-focusable` case)

**Checkpoint**: carousel meets the published-page quality bar (constitution V).

---

## Phase 5: User Story 3 — The editor tunes how the carousel behaves (Priority: P3)

**Goal**: slides visible at once, autoplay with pause, arrows/dots on/off, accessible name.

**Independent Test**: quickstart.md §2 step 8 and §3 rows « Autoplay », « Phone, 3 per view ».

- [X] T025 [US3] In `packages/grapesjs-page-import/src/plugin.ts`, add the carousel traits of contracts/editor.md: « Nom du carrousel » (text → `aria-label`), « Diapositives visibles » (select 1/2/3 → `data-per-view`), « Défilement automatique » (checkbox) + « Intervalle (secondes) » (number, min 3, max 10, default 5) both written to the one `data-autoplay` attribute via `changeProp` traits and a model listener, « Afficher les flèches » / « Afficher les points » (checkboxes → `data-arrows="false"` / `data-dots="false"`); every default is written as attribute **absence** (data-model.md); traits read their value back from the attributes in `init`
- [X] T026 [P] [US3] Extend `packages/grapesjs-page-import/tests/carousel.test.ts`: each trait sets/removes its attribute; turning autoplay off removes `data-autoplay`; interval 4 with autoplay on → `data-autoplay="4"`; a carousel re-parsed from HTML with `data-per-view="3" data-autoplay="7" data-dots="false"` shows those values in its traits; defaults produce `<section data-block="carousel">` with no setting attributes
- [X] T027 [US3] In `apps/web/src/components/carousel.module.css`: `--per-view` from the outer element's style capped at 2 under `@media (max-width: 992px)` and at 1 under `@media (max-width: 768px)` (`DEVICE_BREAKPOINTS`, research R6); in `carousel.tsx` set `--per-view: settings.perView` and hide arrows / dots when `settings.arrows` / `settings.dots` is false
- [X] T028 [US3] In `apps/web/src/components/carousel.tsx`: autoplay when `settings.autoplay` and positions > 1 — `setInterval` advancing with wrap every `autoplay` seconds; « Mettre en pause » / « Reprendre le défilement » button first after the track (tab order); suspended while `pointerenter`…`pointerleave` or focus within; stopped (until « Reprendre ») after any arrow/dot click or user scroll; never started under reduced motion or while `document.hidden`; autoplay never writes to the live region; clear interval and listeners on unmount (research R8)
- [X] T029 [US3] Extend `apps/web/tests/e2e/us-carousel.spec.ts` with a second page (`data-per-view="3" data-autoplay="3" data-dots="false"`): desktop viewport shows 3 slides side by side and no dots; after ~3.5 s the first visible slide changed; hovering stops it; « Mettre en pause » stops it; at 360 px width exactly one slide is visible; reduced motion → no automatic change after 4 s

**Checkpoint**: all three stories done.

---

## Phase 6: Polish & Cross-Cutting

- [X] T030 [P] Add a « Le bloc Carrousel » editor guide in French in `docs/carrousel.fr.md`, same tone and layout as `docs/code-personnalise.fr.md` (plus `apps/cms/src/fields/grapesjs/editor.css`: settings-panel labels above their field — GrapesJS's 30% label column cut « Diapositives visibles » to « Diap… ») (adding, editing slides, settings, what visitors see, limits: 12 slides, no form in a slide)
- [X] T031 [P] Update `docs/import-penpot.fr.md` « Carrousels » line: Trefle now has a Carrousel block; imports still reproduce the drawn slide, the editor can rebuild it with the block; add a pointer to 016 in `specs/015-penpot-site-import/RESUME.md` « Décision (2026-10-07) »
- [X] T032 Check the client JS added to a published page with a carousel (Next build output / DevTools coverage) stays ≈ 3 KB gzipped, and SC-004: Lighthouse (mobile, 3 runs, median) on two pages identical but for a 6-image carousel vs only its first slide's image — LCP / First Contentful Paint of the carousel page within +10 %; note both figures in the PR body (constitution, performance budget)
- [X] T033 Run quickstart.md §1 (`npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:e2e:docker`) and the manual §2–§4 on the dev stack (both compose files); record the manual checks in the PR body

---

## Dependencies & Execution Order

- **Phase 2** blocks everything. Within it: T001 → T002, T003 → T004, T003 → T005 → T006; T007 is independent.
- **US1**: published-page part (T008 → T009 → T010 → T011/T012/T013) and editor part (T014 → T015 → T016 → T017, T018, T019) are independent of each other and can run in parallel once Phase 2 is done.
- **US2** depends on US1's published part (T009, T010); not on the editor part. **Release gate (constitution V)**: no carousel may reach a published page before US2 is done — US2 ships in the same PR as the published part (see Implementation Strategy).
- **US3**: T025–T026 depend on T014; T027–T029 depend on T009 (and T021 for reduced motion in T028).
- **Polish** after the stories it documents.

## Parallel Opportunities

- Phase 2: T002, T004, T006, T007 in parallel once their source task is done.
- US1: the published slice (T008–T013) and the editor slice (T014–T019) by two people/agents; T011, T012 in parallel.
- US3: editor traits (T025–T026) in parallel with the published behaviour (T027–T029).
- Polish: T030, T031 in parallel.

## Implementation Strategy

Constitution V is a MUST for every published page (keyboard, accessible names, no serious axe violation). As soon as the renderer knows the carousel, any editor can publish one through the « Code » view, so the published side and its accessibility (US2) ship **together**:

1. **PR « Rendu »** = Phase 2 + US1 published part + US2 (T001–T013, T020–T024). A carousel written in the « Code » view works and meets the quality bar.
2. **PR « Édition »** = US1 editor part (T014–T019). **MVP reached**: the block is in the library.
3. **PR « Réglages »** = US3 (T025–T029) + Polish (T030–T033).
