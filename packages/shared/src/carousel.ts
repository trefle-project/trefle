/**
 * 016-carousel-block — the carousel's markup contract
 * (specs/016-carousel-block/contracts/markup.md), shared by the editor
 * (GrapesJS types), `countBlocks`, the publish guard and the renderer.
 *
 *   <section data-block="carousel" [aria-label] [data-per-view="1|2|3"]
 *            [data-autoplay="3…10"] [data-arrows="false"] [data-dots="false"]>
 *     <div data-block="carousel-slide">…blocks…</div> × 1–12
 *   </section>
 *
 * Defaults are written as attribute absence. Every value is clamped on read,
 * never rejected: a hand-written carousel always renders.
 */
export const CAROUSEL_MARKER = "carousel";
export const CAROUSEL_SLIDE_MARKER = "carousel-slide";
export const CAROUSEL_MAX_SLIDES = 12;
export const CAROUSEL_AUTOPLAY_RANGE = { min: 3, max: 10, default: 5 } as const;
export const CAROUSEL_DEFAULT_LABEL = "Carrousel";

export type CarouselSettings = {
  /** Accessible name of the carousel region. */
  label: string;
  /** Slides visible at once on large screens (capped by CSS on smaller ones). */
  perView: 1 | 2 | 3;
  /** Seconds between automatic slide changes; `null` = no autoplay. */
  autoplay: number | null;
  arrows: boolean;
  dots: boolean;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function parseCarouselSettings(attribs: Record<string, string | undefined>): CarouselSettings {
  const perView = Math.round(Number(attribs["data-per-view"]));
  const autoplay = Math.round(Number(attribs["data-autoplay"]));
  return {
    label: attribs["aria-label"]?.trim() || CAROUSEL_DEFAULT_LABEL,
    perView: (Number.isFinite(perView) && perView > 0 ? clamp(perView, 1, 3) : 1) as CarouselSettings["perView"],
    autoplay:
      Number.isFinite(autoplay) && autoplay > 0
        ? clamp(autoplay, CAROUSEL_AUTOPLAY_RANGE.min, CAROUSEL_AUTOPLAY_RANGE.max)
        : null,
    arrows: attribs["data-arrows"] !== "false",
    dots: attribs["data-dots"] !== "false",
  };
}
