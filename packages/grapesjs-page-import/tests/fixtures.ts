import { GJS_BLOCKS } from "../../../apps/cms/src/fields/grapesjs/blocks";
import type { ImportIR } from "../src/ir";
import type { ExtractText, PageExtract, SerializeOptions } from "../src/serialize";

/**
 * A small page extract + IR shared by the serializer and round-trip tests.
 * Block shapes come from the editor's real library (apps/cms GJS_BLOCKS), so
 * the tests break if the library and the serializer drift apart.
 */
export const BLOCKS = GJS_BLOCKS.map((b) => ({ id: b.id, content: b.content as SerializeOptions["blocks"][number]["content"] }));

const box = { x: 0, y: 0, width: 400, height: 40 };
const text = (id: string, tag: string, html: string, extra: Partial<ExtractText> = {}): ExtractText => ({
  id,
  tag,
  html,
  box,
  style: {},
  ...extra,
});

export const EXTRACT: PageExtract = {
  url: "https://exemple.fr/offre",
  viewport: { width: 1440, height: 900 },
  texts: [
    text("t1", "h1", "Cultivez votre <b>potager</b> &amp; plus"),
    text("t2", "p", "Des conseils chaque semaine.<br/>Sans engagement."),
    text("t3", "a", "Je m'inscris", { href: "https://exemple.fr/inscription?a=1&b=2" }),
    text("t4", "h2", "Pourquoi nous"),
    text("t5", "p", "Des graines bio."),
    text("t6", "p", "Un suivi <a href=\"https://exemple.fr/suivi\">personnalisé</a>."),
    text("t7", "li", "Livraison offerte"),
    text("t8", "li", "Retour gratuit"),
    text("t9", "p", "« Mes tomates n'ont jamais été aussi belles. »"),
    text("t10", "p", "Claire, Nantes"),
    text("t11", "p", "Légende de l'image"),
    text("t12", "p", "<script>alert(1)</script>"),
    text("t13", "a", "Lien douteux", { href: "javascript:alert(1)" }),
  ],
  images: [
    { id: "i1", kind: "img", candidates: ["https://exemple.fr/a.jpg"], alt: "Un potager", box },
    { id: "i2", kind: "img", candidates: ["https://exemple.fr/b.jpg"], alt: null, box },
    { id: "i3", kind: "background", candidates: ["https://exemple.fr/fond.jpg"], alt: null, box },
  ],
  forms: [
    {
      id: "f1",
      box,
      fields: [
        { label: "Email", type: "email", required: true },
        { label: "Prénom", type: "text", required: false },
      ],
    },
  ],
  unsupported: [{ kind: "video", box }],
  fonts: ["Montserrat", "sans-serif", "\"Open Sans\""],
};

export const IR: ImportIR = {
  sourceHadMobileLayout: true,
  simplified: [{ what: "Carrousel d'avis", how: "premier avis conservé" }],
  omitted: [{ what: "Vidéo de présentation", reason: "video" }],
  sections: [
    {
      source: "Héros",
      style: { backgroundColor: "#f0fdf4", paddingTop: 80, paddingBottom: 80, backgroundImage: "i3" },
      devices: { mobile: { box: { paddingTop: 32, paddingBottom: 32 } } },
      rows: [
        {
          kind: "columns",
          columns: [
            {
              blocks: [
                {
                  kind: "hero",
                  heading: "t1",
                  headingLevel: 1,
                  text: ["t2"],
                  cta: { label: "t3", href: "t3" },
                  headingStyle: { fontSize: 56, color: "#14532d" },
                  devices: { tablet: { text: { fontSize: 40 } }, mobile: { text: { fontSize: 32 } } },
                },
              ],
            },
            {
              blocks: [{ kind: "image", image: "i1", caption: "t11", devices: { mobile: { hidden: true } } }],
            },
          ],
        },
      ],
    },
    {
      source: "Avantages",
      rows: [
        {
          kind: "blocks",
          blocks: [
            {
              kind: "rich-text",
              parts: [
                { ref: "t4", as: "h2" },
                { ref: "t5", as: "p" },
                { ref: "t6", as: "p" },
                { ref: "t7", as: "li-ul" },
                { ref: "t8", as: "li-ul" },
              ],
            },
          ],
        },
        {
          kind: "columns",
          columns: [
            { blocks: [{ kind: "testimonial", quote: "t9", author: "t10" }] },
            { blocks: [{ kind: "image", image: "i2" }] },
            { blocks: [{ kind: "call-to-action", label: "t3", href: "t3", buttonColor: "#1d4ed8" }] },
            { blocks: [{ kind: "lead-form", form: "f1" }] },
          ],
        },
      ],
    },
  ],
};
