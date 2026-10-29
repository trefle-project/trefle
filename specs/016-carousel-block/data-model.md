# Data model: Carousel block (016)

No new collection, field or migration. A carousel lives inside the page's
existing builder data, like every other block.

## Carousel (block)

Stored in `pages.builder.projectData` (GrapesJS component of type
`trefle-carousel`) and `pages.builder.html` (markup per
[contracts/markup.md](./contracts/markup.md)).

| Attribute | Values | Default | Source of truth |
|-----------|--------|---------|-----------------|
| `aria-label` | non-empty text | « Carrousel » | trait « Nom du carrousel » |
| `data-per-view` | 1, 2, 3 | 1 | trait « Diapositives visibles » |
| `data-autoplay` | 3–10 (seconds) or absent | absent (off) | traits « Défilement automatique » + « Intervalle » |
| `data-arrows` | `"false"` or absent | absent (shown) | trait « Afficher les flèches » |
| `data-dots` | `"false"` or absent | absent (shown) | trait « Afficher les points » |
| `id` / `class` / `style` | editor styling | — | Style manager |

Children: 1–12 **Slides**, ordered.

Validation: clamped on read by `parseCarouselSettings` (renderer), limits
enforced in the editor (R10). Out-of-range values never fail a save.

## Slide

GrapesJS type `trefle-carousel-slide`, markup `<div data-block="carousel-slide">`.
No settings of its own. Children: any blocks, except a lead form or another
carousel (editor drop rules; lead form also refused at publish).

## `pages.builder.blockCount` (existing `json` field)

Recomputed on every save by `recomputeBlockCount` (`countBlocks`):

| Key | Change |
|-----|--------|
| `byType.carousel`, `byType["carousel-slide"]` | new keys, counted like other blocks |
| `leadFormInCarousel` | **new**: number of lead-form blocks found inside a carousel slide |

Read by `pages-publish-guard`: `leadFormInCarousel > 0` blocks publication.
Pages saved before this feature have no such key → treated as 0 (they cannot
contain a carousel).

## State (published page, client only, never stored)

| State | Meaning |
|-------|---------|
| `ready` | mounted: controls shown, `inert` applied |
| `position` | first visible slide index, from scroll geometry |
| `playing` | autoplay running (false under reduced motion, after user interaction, or when paused) |
| `hoverOrFocus` | temporarily suspends `playing` |
