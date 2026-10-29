import { CAROUSEL_LABELS_FR } from "@trefle/grapesjs-page-import/plugin";
import { describe, expect, it } from "vitest";

import { GJS_BLOCKS } from "../src/fields/grapesjs/blocks";
import { droppedMarkupMessages } from "../src/fields/grapesjs/codeViewMessages";
import { adminText, type AdminKey } from "../src/i18n";

/**
 * 023-admin-i18n (US4, T049) — the editor's words follow the member's
 * language; the blocks themselves (ids, content) never do.
 */
const built = (lang: string) => {
  const t = adminText(lang);
  return GJS_BLOCKS.map((b) => ({ id: b.id, label: t(b.label), content: b.content }));
};

describe("editor blocks in French and English", () => {
  it("have the same ids and content, only the names differ", () => {
    const fr = built("fr");
    const en = built("en");
    expect(en.map((b) => b.id)).toEqual(fr.map((b) => b.id));
    expect(en.map((b) => b.content)).toEqual(fr.map((b) => b.content));
    expect(fr.map((b) => b.label)).toEqual(["Hero", "Texte", "Image", "Bouton d'action", "Formulaire (lead)", "Témoignage"]);
    expect(en.map((b) => b.label)).toEqual(["Hero", "Text", "Image", "Call-to-action button", "Form (lead)", "Testimonial"]);
  });

  it("the carousel's French words are the package's defaults, and each has an English one", () => {
    const fr = adminText("fr");
    const en = adminText("en");
    for (const [key, value] of Object.entries(CAROUSEL_LABELS_FR)) {
      expect(fr(`editor.carousel.${key}` as AdminKey)).toBe(value);
      expect(en(`editor.carousel.${key}` as AdminKey)).not.toBe("");
    }
    expect(en("editor.carousel.slidePosition")).toBe("Slide {{n}} / {{count}}");
  });

  it("the « Code » view tells what will be dropped in the member's language", () => {
    const removed = [{ element: { nodeType: 1, nodeName: "MARQUEE" } }, { attribute: { name: "onclick", value: "x()" }, from: { nodeName: "DIV" } }];
    expect(droppedMarkupMessages(removed)).toEqual([
      "La balise <marquee> n'est pas autorisée et sera retirée.",
      "L'attribut « onclick » sera retiré : les attributs d'événement ne sont pas autorisés.",
    ]);
    expect(droppedMarkupMessages(removed, adminText("en"))).toEqual([
      "The <marquee> tag is not allowed and will be removed.",
      "The “onclick” attribute will be removed: event attributes are not allowed.",
    ]);
  });
});
