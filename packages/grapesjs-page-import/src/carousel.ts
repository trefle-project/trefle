import { CAROUSEL_MARKER, CAROUSEL_SLIDE_MARKER } from "@trefle/shared";

import type { ComponentJson } from "./layout";

/**
 * 016-carousel-block — the Carrousel block's markup as plain GrapesJS JSON
 * (no runtime `grapesjs` import, like layout.ts), per
 * specs/016-carousel-block/contracts/markup.md. The plugin builds the library
 * block from it; a later import change (FR-017) can build imported carousels
 * from it too.
 */
export const CAROUSEL_TYPES = {
  carousel: "trefle-carousel",
  slide: "trefle-carousel-slide",
} as const;

// Same inline placeholder as the library's Image block (apps/cms blocks.ts).
const IMAGE_PLACEHOLDER =
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='960'%20height='480'%3E%3Crect%20width='100%25'%20height='100%25'%20fill='%23e5e7eb'/%3E%3Ctext%20x='50%25'%20y='50%25'%20fill='%239ca3af'%20font-family='sans-serif'%20font-size='24'%20text-anchor='middle'%20dominant-baseline='middle'%3EImage%3C/text%3E%3C/svg%3E";

export function slideJson(children: ComponentJson[] = []): ComponentJson {
  return {
    type: CAROUSEL_TYPES.slide,
    tagName: "div",
    attributes: { "data-block": CAROUSEL_SLIDE_MARKER },
    components: children,
  };
}

/** Example slide content: an Image and a Texte block, as the library drops them. */
function exampleSlide(n: number): ComponentJson {
  return slideJson([
    {
      tagName: "figure",
      attributes: { "data-block": "image" },
      style: { margin: "0", padding: "24px", "text-align": "center" },
      components: [{ type: "image", tagName: "img", attributes: { src: IMAGE_PLACEHOLDER, alt: "" }, style: { "max-width": "100%" } }],
    },
    {
      tagName: "div",
      attributes: { "data-block": "rich-text" },
      style: { padding: "0 24px 24px", "text-align": "center" },
      components: [{ type: "text", tagName: "p", components: [{ type: "textnode", content: `Diapositive ${n}` }] }],
    },
  ]);
}

/** A carousel with the given slides' contents, or 3 example slides. */
export function carouselJson(slides?: ComponentJson[][]): ComponentJson {
  return {
    type: CAROUSEL_TYPES.carousel,
    tagName: "section",
    attributes: { "data-block": CAROUSEL_MARKER },
    components: slides ? slides.map((children) => slideJson(children)) : [1, 2, 3].map(exampleSlide),
  };
}
