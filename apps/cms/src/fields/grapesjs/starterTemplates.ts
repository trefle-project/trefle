import { GJS_BLOCKS } from "./blocks";

export interface StarterTemplate {
  id: string;
  label: { fr: string; en: string };
  projectData: object;
  html: string;
  css: string;
}

const heroBlock = GJS_BLOCKS.find((b) => b.id === "hero")!;
const leadFormBlock = GJS_BLOCKS.find((b) => b.id === "lead-form")!;

/**
 * `leadFormBlock.content` is a GrapesJS component definition object (not an
 * HTML string, unlike every other block) — this renders it to the same
 * markup `SUBSCRIPTION_HTML` needs, so that string can't drift from
 * `SUBSCRIPTION_PROJECT_DATA` (which references `leadFormBlock.content`
 * directly) the way it once did: a hand-typed duplicate of this markup here
 * had `id="form"` but not the block's own centring `style`, so a page's
 * *raw* html/css (the `builder.html`/`.css` default value, used until the
 * editor's first real save) rendered the lead-form placeholder — and once
 * split at publish, the real form — stuck to the left instead of centred.
 */
function renderLeadFormPlaceholder(): string {
  const { attributes, style } = leadFormBlock.content as {
    attributes: Record<string, string>;
    style: Record<string, string>;
  };
  const attrs = Object.entries(attributes)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  const styleAttr = Object.entries(style)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return `<div ${attrs} style="${styleAttr}"></div>`;
}

/**
 * 004-page-types, FR-008/FR-009/FR-010/FR-011 — one starter template per
 * `pageType`, applied by `pages-starter-template.ts` on create. Each is built
 * from `GJS_BLOCKS` itself (not a hand-invented tree), so it's a project state
 * the editor could have produced by dragging blocks — nothing about it is
 * special-cased, and recomputeBlockCount/publishGuard see a perfectly normal
 * document. Editable afterward in GrapesJS exactly like any other page
 * (nothing locked).
 */

// subscription — moved verbatim from field.ts (003-post-launch-improvements,
// FR-018/FR-019/FR-020): hero + lead-form block, exactly one lead-form block.
const SUBSCRIPTION_PROJECT_DATA = {
  pages: [
    {
      frames: [
        {
          component: {
            type: "wrapper",
            components: [
              {
                tagName: "section",
                attributes: { "data-block": "hero", style: "padding:64px 24px;text-align:center" },
                components: [
                  { type: "text", tagName: "h1", components: [{ type: "textnode", content: "Votre titre accrocheur" }] },
                  { type: "text", tagName: "p", components: [{ type: "textnode", content: "Une phrase de soutien qui donne envie d'agir." }] },
                ],
              },
              leadFormBlock.content,
            ],
          },
        },
      ],
    },
  ],
};
const SUBSCRIPTION_HTML = `${heroBlock.content}${renderLeadFormPlaceholder()}`;
const SUBSCRIPTION_CSS = "";

// free — hero/text block only, no lead-form block (FR-008/FR-009): a general
// content page has no lead-generation purpose, so its starter has nothing to
// configure and publishes successfully unedited.
const FREE_PROJECT_DATA = {
  pages: [
    {
      frames: [
        {
          component: {
            type: "wrapper",
            components: [
              {
                tagName: "section",
                attributes: { "data-block": "hero", style: "padding:64px 24px;text-align:center" },
                components: [
                  { type: "text", tagName: "h1", components: [{ type: "textnode", content: "Votre titre" }] },
                  { type: "text", tagName: "p", components: [{ type: "textnode", content: "Votre contenu." }] },
                ],
              },
            ],
          },
        },
      ],
    },
  ],
};
const FREE_HTML = `${heroBlock.content}`;
const FREE_CSS = "";

// confirmation — a short "merci" message that already includes the
// {{unsubscribeUrl}} placeholder (FR-010/FR-011), so a newly created
// confirmation page satisfies the publish-guard placeholder rule out of the
// box and can publish unedited too. No lead-form block.
const CONFIRMATION_PROJECT_DATA = {
  pages: [
    {
      frames: [
        {
          component: {
            type: "wrapper",
            components: [
              {
                tagName: "section",
                attributes: { "data-block": "rich-text", style: "padding:24px;max-width:720px;margin:0 auto" },
                components: [
                  { type: "text", tagName: "h1", components: [{ type: "textnode", content: "Merci pour votre inscription !" }] },
                  { type: "text", tagName: "p", components: [{ type: "textnode", content: "Vous recevrez bientôt nos prochaines actualités." }] },
                  {
                    type: "text",
                    tagName: "p",
                    components: [
                      { type: "textnode", content: "Vous pouvez vous désinscrire à tout moment : " },
                      { tagName: "a", attributes: { href: "{{unsubscribeUrl}}" }, components: [{ type: "textnode", content: "se désinscrire" }] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  ],
};
const CONFIRMATION_HTML = `<div data-block="rich-text" style="padding:24px;max-width:720px;margin:0 auto">
  <h1>Merci pour votre inscription !</h1>
  <p>Vous recevrez bientôt nos prochaines actualités.</p>
  <p>Vous pouvez vous désinscrire à tout moment : <a href="{{unsubscribeUrl}}">se désinscrire</a></p>
</div>`;
const CONFIRMATION_CSS = "";

// Tuple (not a plain array) so `STARTER_TEMPLATES[type][0]` is always defined
// at the type level — each type has exactly one entry today.
export const STARTER_TEMPLATES: Record<"subscription" | "free" | "confirmation", [StarterTemplate]> = {
  subscription: [
    {
      id: "subscription-default",
      label: { fr: "Page d'inscription (par défaut)", en: "Subscription page (default)" },
      projectData: SUBSCRIPTION_PROJECT_DATA,
      html: SUBSCRIPTION_HTML,
      css: SUBSCRIPTION_CSS,
    },
  ],
  free: [
    {
      id: "free-default",
      label: { fr: "Page libre (par défaut)", en: "Free page (default)" },
      projectData: FREE_PROJECT_DATA,
      html: FREE_HTML,
      css: FREE_CSS,
    },
  ],
  confirmation: [
    {
      id: "confirmation-default",
      label: { fr: "Page de confirmation (par défaut)", en: "Confirmation page (default)" },
      projectData: CONFIRMATION_PROJECT_DATA,
      html: CONFIRMATION_HTML,
      css: CONFIRMATION_CSS,
    },
  ],
};
