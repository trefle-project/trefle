# Contract: carousel in the GrapesJS editor (016)

What the editor offers and guarantees. Code:
`packages/grapesjs-page-import/src/carousel.ts` (JSON builder) and the
types/block registered by `trefleLayoutPlugin` (`src/plugin.ts`). Markup
produced: [markup.md](./markup.md).

## Library block

| Id | Label | Who | Content |
|----|-------|-----|---------|
| `trefle-carousel` | « Carrousel » | every editor | `carouselJson()`: 3 slides, each an Image block placeholder + a Texte block (« Diapositive N ») |

Drag-and-drop like the other library blocks. Click-to-add as the
« Code personnalisé » block does: after the block holding the selection, at
the end of a selected column, else at the end of the page; a selection inside
a carousel places the new one after that carousel, never in a slide.

## Component types

| Type | Recognised by | Droppable | Draggable | Other |
|------|---------------|-----------|-----------|-------|
| `trefle-carousel` | `data-block="carousel"` | only `trefle-carousel-slide` | anywhere **except** inside a slide | traits below; toolbar adds ◀ ▶ + |
| `trefle-carousel-slide` | `data-block="carousel-slide"` | any block except `lead-form`, `trefle-carousel` | only into a `trefle-carousel` | `removable=false` when last; `copyable=false` at 12; toolbar adds « Déplacer avant » / « Déplacer après » |
| `lead-form` (existing, Editor.client.tsx) | unchanged | unchanged | **adds**: not inside a slide | — |

## Traits (carousel)

| Label | Kind | Attribute written | Default (= attribute absent) |
|-------|------|-------------------|------------------------------|
| Nom du carrousel | text | `aria-label` | « Carrousel » |
| Diapositives visibles | select 1 / 2 / 3 | `data-per-view` | 1 |
| Défilement automatique | checkbox | `data-autoplay` (absent when off) | off |
| Intervalle (secondes) | number 3–10 | `data-autoplay` value | 5 |
| Afficher les flèches | checkbox | `data-arrows="false"` when off | on |
| Afficher les points | checkbox | `data-dots="false"` when off | on |

## Canvas behaviour

- Exactly one slide of each carousel is visible in the canvas (the active
  one); a label « Diapositive N / M » shows above it. Active index is view
  state: on load it is 1.
- Toolbar ◀ / ▶: previous / next slide (wraps). « + »: inserts an empty slide
  after the active one and makes it active; at 12 slides it adds nothing and
  shows the alert « 12 diapositives maximum » (GrapesJS toolbar buttons
  can't be disabled).
- Slide toolbar: native duplicate (inserted after, becomes active; hidden at
  12 via `copyable`), delete (not offered for the last slide), select parent;
  plus « Déplacer avant » / « Déplacer après », which swap the slide with its
  neighbour and keep it shown (no-op at either end). Reordering by drag is
  not offered in the canvas — only one slide is visible — but still works in
  the layer manager.
- Selecting any component inside a hidden slide (layer manager, « Code »
  view, undo) makes that slide active.
- Empty slide: dashed outline + « Déposez des blocs ici » (canvas CSS only).
- None of the above leaks into `getHtml()` / `getCss()` / `projectData`
  attributes.

## Test obligations (headless, jsdom)

- block registered once (plugin idempotent);
- HTML with the markup re-parses to the two types; settings traits read the
  attributes back;
- projectData save → load keeps slides, order, attributes;
- deleting down to one slide leaves it non-removable; 12 slides → not
  copyable and « + » command no-op;
- `lead-form` and carousel components refused as children of a slide
  (directly and inside a Section in a slide);
- move-prev / move-next reorder and are no-ops at the ends;
- click-to-add with a selection inside a slide adds after the carousel;
- `getHtml()` after switching slides contains no `data-tf-`.
