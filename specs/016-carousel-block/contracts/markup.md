# Contract: carousel markup (016)

The single shape a carousel takes in a page's HTML (`builder.html`), whoever
produced it: the editor's block, the « Code » view, the REST API, or a future
import. The editor (GrapesJS types), `countBlocks`, the publish guard and the
renderer all read this shape and nothing else. Constants live in
`packages/shared/src/carousel.ts`.

## Grammar

```html
<section data-block="carousel"
         [aria-label="…"]          <!-- default « Carrousel » -->
         [data-per-view="1|2|3"]    <!-- default 1 -->
         [data-autoplay="3…10"]     <!-- seconds; absent = no autoplay -->
         [data-arrows="false"]      <!-- absent = arrows shown -->
         [data-dots="false"]        <!-- absent = dots shown -->
         [id] [class] [style]>      <!-- editor styling, kept on the outer element -->
  <div data-block="carousel-slide" [id] [class] [style]>…any allowed blocks…</div>
  … 1 to 12 slides …
</section>
```

Rules:

- Only direct children with `data-block="carousel-slide"` are slides; any
  other direct child is dropped by the renderer (and never produced by the
  editor).
- `data-autoplay` both turns autoplay on and gives its interval. The editor's
  two traits (checkbox + interval) write this one attribute.
- Defaults are expressed by **absence**: a carousel with no settings is
  `<section data-block="carousel">`.
- Values out of range or malformed are clamped/ignored by
  `parseCarouselSettings` (per-view → 1–3, autoplay → 3–10 or off, any value
  other than `"false"` → shown). More than 12 slides render the first 12.
- A slide MUST NOT contain `data-block="lead-form"` (refused at publish, see
  below) nor a nested `data-block="carousel"`. The editor prevents both; if a
  nested carousel arrives anyway (« Code » view, API), the renderer outputs
  the inner one as its plain sanitised markup — a `section` with its slide
  `div`s stacked — never as a second `<Carousel>`.
- Editor-only attributes `data-tf-active` / `data-tf-label` MUST never appear
  in exported HTML.

All tags and attributes above are already in `SANITIZE_CONFIG` (`section`,
`div`, `data-*`, `aria-*`): no allow-list change.

## `@trefle/shared` surface

```ts
export const CAROUSEL_MARKER = "carousel";
export const CAROUSEL_SLIDE_MARKER = "carousel-slide";
export const CAROUSEL_MAX_SLIDES = 12;
export const CAROUSEL_AUTOPLAY_RANGE = { min: 3, max: 10, default: 5 };

export type CarouselSettings = {
  label: string;      // "Carrousel" when absent/blank
  perView: 1 | 2 | 3;
  autoplay: number | null;  // seconds, null = off
  arrows: boolean;
  dots: boolean;
};
export function parseCarouselSettings(attribs: Record<string, string | undefined>): CarouselSettings;
```

`BLOCK_TYPES` gains `"carousel"` and `"carousel-slide"`. `BlockCounts` gains
`leadFormInCarousel: number`.

## Publish guard

`pages-publish-guard` adds one problem when
`builder.blockCount.leadFormInCarousel > 0`:
"the lead-form block cannot be placed inside a carousel" (in English, like
the guard's other messages).

## Rendered output (published page)

`renderPageBody` replaces the carousel element by `<Carousel>`; the server
HTML it produces (before hydration, and what a no-JS visitor gets) is below.
Class names are CSS Modules (`apps/web/src/components/carousel.module.css`,
hashed): tests and styling hooks rely on roles and ARIA attributes, never on
class names.

```html
<section id="[editor id]" class="[module] [editor class]" style="[editor style];--per-view:N"
         aria-roledescription="carrousel" aria-label="…">   <!-- a labelled <section> is a region -->
  <div class="[module track]" tabindex="0">   <!-- scroll-snap container; focusable so keyboard users can scroll it (axe scrollable-region-focusable) -->
    <div id="…" class="[module slide] [slide class]" style="…"
         role="group" aria-roledescription="diapositive" aria-label="1 sur M">…</div>
    …
  </div>
</section>
```

After mount, `data-ready` is set on the section, off-screen slides get
`inert`, and the controls are appended after the track, in one bar under the
slides so they never cover a slide's content (DOM order = visual order = tab
order: track, pause, ‹, dots, ›):

```html
  <div>   <!-- the bar; wraps on narrow screens -->
    [<button aria-label="Mettre en pause | Reprendre le défilement">]   <!-- autoplay only -->
    [<button aria-label="Diapositive précédente">]                        <!-- arrows -->
    [<button aria-label="Aller à la diapositive N" aria-current="true|absent">…]   <!-- dots -->
    [<button aria-label="Diapositive suivante">]
  </div>
  <div aria-live="polite" aria-atomic="true" class="[visually hidden]">Diapositive N sur M</div>
```

The live region is filled only when the visitor changes slide with a control
(never by autoplay): scrolling the track changes no DOM, so a live region on
the track itself would announce nothing.

With one position (one slide, or every slide visible) no controls render and
autoplay never starts. `<img>` in slides 2…M without a `loading` attribute
get `loading="lazy"`.

## Test obligations

- shared: `parseCarouselSettings` table test; `countBlocks` counts
  carousel/slides and `leadFormInCarousel` (direct and nested in a Section
  inside a slide).
- cms: publish guard rejects `leadFormInCarousel > 0`, accepts 0.
- web: `renderPageBody` — slides and settings passed, editor id/class/style
  kept, non-slide children dropped, >12 slides cut, custom-code placeholder
  in a slide still replaced, nested carousel rendered as plain markup, track
  has `tabindex="0"`, lazy loading on later slides only; `PageShell`
  renders a page with a carousel without error.
- grapesjs-page-import: HTML ⇄ types round trip; `getHtml()` contains no
  `data-tf-*`; defaults written as absence.
