import type { BlockType } from "@trefle/shared";

import type { AdminKey } from "../../i18n";

/**
 * The fixed GrapesJS block library (FR-002). Each block drops a wrapper element
 * carrying `data-block="<type>"` so the server can tally it (see @trefle/shared
 * countBlocks) and enforce "exactly one lead-form block".
 *
 * Not listed here: Section / Colonnes (012 plugin, @trefle/grapesjs-page-import),
 * Carrousel (016, same plugin, carousel-plugin.ts) and the admin-only « Code
 * personnalisé » block (014, customCodeBlock.ts), all registered by their own
 * modules.
 */
export interface GjsBlockDef {
  id: BlockType;
  /** Catalogue key of the block's name (023-admin-i18n): the editor shows it in the member's language. */
  label: AdminKey;
  // HTML string, or a GrapesJS component definition (used for the lead-form
  // placeholder, which must not accept nested blocks).
  content: string | Record<string, unknown>;
}

export const GJS_BLOCKS: GjsBlockDef[] = [
  {
    id: "hero",
    label: "editor.blockHero",
    content: `<section data-block="hero" style="padding:64px 24px;text-align:center">
      <h1>Votre titre accrocheur</h1>
      <p>Une phrase de soutien qui donne envie d'agir.</p>
    </section>`,
  },
  {
    id: "rich-text",
    label: "editor.blockText",
    content: `<div data-block="rich-text" style="padding:24px;max-width:720px;margin:0 auto">
      <p>Rédigez votre contenu ici.</p>
    </div>`,
  },
  {
    id: "image",
    label: "editor.blockImage",
    // Inline SVG placeholder (no network dependency) — the editor user swaps it
    // for a real asset from the Media library, which is served by URL.
    content: `<figure data-block="image" style="margin:0;padding:24px;text-align:center">
      <img src="data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='960'%20height='480'%3E%3Crect%20width='100%25'%20height='100%25'%20fill='%23e5e7eb'/%3E%3Ctext%20x='50%25'%20y='50%25'%20fill='%239ca3af'%20font-family='sans-serif'%20font-size='24'%20text-anchor='middle'%20dominant-baseline='middle'%3EImage%3C/text%3E%3C/svg%3E" alt="" style="max-width:100%"/>
    </figure>`,
  },
  {
    id: "call-to-action",
    label: "editor.blockCta",
    // #047857 on white text is 5.5:1 (WCAG AA). The original #0b7 was 2.5:1
    // and failed axe's color-contrast rule on every page using the block
    // as dropped (found by the 012 layout-blocks e2e). Padding 14px (was
    // 12px) makes the button 46px tall, over the 44px touch-target minimum
    // the import's device check measures (012, research R16). Pages already
    // saved keep their stored style; this only changes what new drops get.
    content: `<div data-block="call-to-action" style="padding:24px;text-align:center">
      <a href="#form" style="display:inline-block;padding:14px 28px;background:#047857;color:#fff;border-radius:6px;text-decoration:none">Je m'inscris</a>
    </div>`,
  },
  {
    id: "lead-form",
    label: "editor.blockLeadForm",
    // Leaf placeholder — the renderer swaps this whole element (matched by
    // data-block="lead-form") for the real, server-driven form. `droppable`
    // is false so blocks can't be nested inside it (which would produce
    // several data-block="lead-form" nodes and trip the "exactly one" guard;
    // and the renderer (apps/web/src/lib/render.ts, renderPageBody) replaces
    // the whole placeholder element, so anything nested inside it would be
    // discarded — the reason its own visible-in-canvas label is CSS-only
    // (see Editor.client.tsx), not a real child component here). The
    // placeholder itself may sit anywhere, including inside a Section or a
    // Column (012-url-page-import, FR-025).
    //
    // `style` below is the one part of this placeholder that DOES carry
    // through to the published page: the renderer discards this element's
    // own content but reapplies its `id`/`class`/`style` to a real wrapper
    // around the real `<LeadForm/>` (page-shell.tsx), so centring/width set
    // here is real, working centring — which is exactly why it must stay
    // limited to genuinely-wanted layout, nothing that's only meant to make
    // the empty placeholder visible in the editor (a border/background here
    // would publish straight onto the live form). That purely-editorial
    // affordance is injected as canvas-only CSS instead (Editor.client.tsx),
    // never part of this component's own style/content, so it can never
    // leak into `editor.getHtml()`/`getCss()`.
    content: {
      tagName: "div",
      attributes: { "data-block": "lead-form", id: "form" },
      style: { padding: "24px", "max-width": "480px", margin: "0 auto" },
      droppable: false,
      editable: false,
      components: [],
    },
  },
  {
    id: "testimonial",
    label: "editor.blockTestimonial",
    content: `<blockquote data-block="testimonial" style="padding:24px;max-width:640px;margin:0 auto;font-style:italic">
      « Un retour client convaincant. » — Prénom N.
    </blockquote>`,
  },
];
