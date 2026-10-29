# Implementation Plan: Carousel block

**Branch**: `016-carousel-block` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-carousel-block/spec.md`

## Summary

Add a « Carrousel » block to the GrapesJS library, for every editor. A
carousel is plain markup — `<section data-block="carousel">` holding 1–12
`<div data-block="carousel-slide">`, settings as data/aria attributes
([contracts/markup.md](./contracts/markup.md)) — so it survives saving, the
« Code » view and the sanitizer unchanged. In the editor, two GrapesJS types
show one slide at a time and use the native toolbar, traits and drop rules
([contracts/editor.md](./contracts/editor.md)). On the published page, the
renderer swaps the element for a small `"use client"` `<Carousel>` built on
native horizontal scroll + scroll-snap: swipe and the no-JS fallback come
from the browser; arrows, dots, autoplay, `inert` and announcements are added
after mount. A lead form inside a carousel is refused at publish via
`countBlocks`. Imports (012/015) are untouched.

## Technical Context

**Language/Version**: TypeScript (strict), React 19.2, Next.js 16.3 (renderer + Payload admin)

**Primary Dependencies**: GrapesJS 0.22.16, Payload, html-react-parser, isomorphic-dompurify — all existing; **no new dependency**

**Storage**: existing `pages.builder.projectData` / `html` / `css` / `blockCount` (json) — no migration

**Testing**: vitest (shared: node; grapesjs-page-import: jsdom + headless GrapesJS; web: vitest + `renderToStaticMarkup`, as page-shell.test.tsx — client behaviour is covered by e2e); Playwright + axe e2e (`apps/web/tests/e2e`)

**Target Platform**: published pages in evergreen browsers, 360 px → desktop; Payload admin (desktop)

**Project Type**: web — monorepo (`apps/cms`, `apps/web`, `packages/shared`, `packages/grapesjs-page-import`)

**Performance Goals**: carousel client code ≤ ~3 KB gzipped; no layout shift on slide change; later-slide images lazy (SC-004, SC-005)

**Constraints**: unchanged CSP (nonce + `strict-dynamic`) and HTML allow-list; works without JS; WCAG 2.2 AA (APG carousel pattern); constitution page JS budget ~150 KB

**Scale/Scope**: ≤ 12 slides per carousel, any number of carousels per page

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|-----------|-------|--------|
| I. Simplicity First | Two component types + one client component; reuses the lead-form/custom-code replace path in `renderPageBody`; browser scroll-snap instead of pointer/transform logic; settings as attributes, no new store | ✅ |
| II. Stack-Native, Minimal Additions | GrapesJS types, traits, toolbar, drop rules; Next client component; no slider library; no new runtime dependency; GrapesJS stays pinned | ✅ |
| III. Small, Reversible Changes | No migration; additive `BLOCK_TYPES` and `blockCount` key; revert = remove block (existing carousels would render as stacked sections — acceptable, documented). Shippable in slices: shared+renderer, then editor, then settings | ✅ |
| IV. Working Software Over Ceremony | Tests for the settings parser, `countBlocks`, publish guard, renderer replacement (logic); headless editor round trip; e2e smoke + a11y for the published template | ✅ |
| V. Quality the User Feels | Keyboard, screen reader, reduced motion, no-JS, 360 px, no layout shift, lazy images, axe clean; French labels | ✅ |

**Post-design re-check (after Phase 1)**: still ✅. No violation → no
Complexity Tracking entry. One point to watch: images inside the carousel
still go through `rewriteImageTags` (ImgProxy) since the replacement happens
after it on the parsed HTML.

## Project Structure

### Documentation (this feature)

```text
specs/016-carousel-block/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R12
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 — validation guide
├── contracts/
│   ├── markup.md        # carousel HTML grammar, shared API, rendered output
│   └── editor.md        # GrapesJS block, types, traits, canvas behaviour
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── carousel.ts                 # NEW markers, limits, parseCarouselSettings
├── blocks.ts                   # + "carousel", "carousel-slide"; leadFormInCarousel
└── index.ts                    # re-export
packages/shared/tests/
├── carousel.test.ts            # NEW
└── blocks.test.ts              # + carousel cases

packages/grapesjs-page-import/src/
├── carousel.ts                 # NEW carouselJson / slideJson (no grapesjs import)
├── carousel-plugin.ts          # NEW types, block, commands, canvas CSS, selection sync
└── plugin.ts                   # calls registerCarousel
packages/grapesjs-page-import/tests/
└── carousel.test.ts            # NEW headless editor tests

apps/cms/src/
├── fields/grapesjs/Editor.client.tsx   # leadFormType: not inside a slide
└── hooks/pages-publish-guard.ts        # leadFormInCarousel > 0 → problem
apps/cms/tests/
└── pages-publish-guard.test.ts         # + case

apps/web/src/
├── lib/render.ts               # renderPageBody: carousel → <Carousel>, lazy imgs
├── components/carousel.tsx     # NEW "use client" component
└── components/carousel.module.css  # NEW track/slide/controls styles, breakpoints
apps/web/tests/
├── render-carousel.test.tsx    # NEW
├── page-shell.test.tsx         # + smoke with a carousel
└── e2e/us-carousel.spec.ts     # NEW

docs/
└── (editor guide) « Le bloc Carrousel » section — French, like docs/import-penpot.fr.md
```

**Structure Decision**: existing monorepo layout. Editor code joins the
layout blocks in `packages/grapesjs-page-import` (R1: headless tests exist
there, and the later import follow-up needs `carouselJson`); markup
constants in `@trefle/shared` (read by CMS and renderer); behaviour in the
renderer app. `docs/import-penpot.fr.md` gets its « Carrousels » line updated
to point to the new block (imports still produce the drawn slide).

## Delivery slices

1. **Render** — shared constants/parser + `countBlocks` + publish guard +
   renderer + `<Carousel>` **with its accessibility (US2)** + e2e (pages
   created via REST with the markup). Once the renderer knows the carousel,
   any editor can publish one from the « Code » view, so constitution V
   (keyboard, accessible names, axe) must hold from this PR on.
2. **Edit** — GrapesJS types, block (drag and click-to-add), toolbar
   (show/add/move slides), one-slide canvas, drop rules, headless tests.
   MVP reached.
3. **Settings** — traits (per-view, autoplay, arrows, dots, name) + their
   e2e cases; docs.

## Complexity Tracking

No constitution violations.
