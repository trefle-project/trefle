// @vitest-environment jsdom
import createDOMPurify from "dompurify";
import { describe, expect, it } from "vitest";

import { WARNING_SANITIZE_CONFIG, droppedMarkupMessages, type RemovedEntry } from "../src/fields/grapesjs/codeViewMessages";

/**
 * 014-custom-code-editing, FR-014/FR-015 — the « Code » view lists what
 * publication will drop. Runs the real DOMPurify with the real publication
 * config, so the test also pins the shape of `DOMPurify.removed` the module
 * relies on.
 */
const purify = createDOMPurify(window);
const messagesFor = (html: string) => {
  purify.sanitize(html, WARNING_SANITIZE_CONFIG);
  return droppedMarkupMessages(purify.removed as RemovedEntry[]);
};

describe("droppedMarkupMessages", () => {
  it("returns nothing for markup that publication keeps as is", () => {
    expect(
      messagesFor(
        '<section data-block="hero"><h1>Titre</h1><table><tr><td>1</td></tr></table>' +
          '<button type="button">Info</button><iframe src="https://www.youtube-nocookie.com/embed/x" allowfullscreen></iframe>' +
          '<div data-block="lead-form" id="form"></div><!-- note --></section>',
      ),
    ).toEqual([]);
  });

  it("flags a script once, however many there are", () => {
    expect(messagesFor("<p>a</p><script>alert(1)</script><script src='https://x.example/a.js'></script>")).toEqual([
      "Les scripts ne sont pas publiés depuis le HTML de la page : ils seront retirés. Un administrateur peut les ajouter dans la section « Scripts » de la page ou avec le bloc « Code personnalisé ».",
    ]);
  });

  it("flags a script or style at the very start of the HTML (parsed into <head> otherwise, dropped silently)", () => {
    expect(messagesFor("<script>alert(1)</script><p>a</p>")).toEqual([
      "Les scripts ne sont pas publiés depuis le HTML de la page : ils seront retirés. Un administrateur peut les ajouter dans la section « Scripts » de la page ou avec le bloc « Code personnalisé ».",
    ]);
  });

  it("names each event attribute", () => {
    expect(messagesFor('<a href="#" onclick="alert(1)">x</a><img src="https://x.example/a.png" alt="" onerror="x()">')).toEqual([
      "L'attribut « onclick » sera retiré : les attributs d'événement ne sont pas autorisés.",
      "L'attribut « onerror » sera retiré : les attributs d'événement ne sont pas autorisés.",
    ]);
  });

  it("explains an unsafe address", () => {
    expect(messagesFor('<a href="javascript:alert(1)">x</a>')).toEqual([
      "L'adresse « javascript:alert(1) » (attribut href de <a>) n'est pas autorisée et sera retirée.",
    ]);
  });

  it("points forms and inputs to the lead-form block", () => {
    expect(messagesFor('<form><input name="email"><textarea></textarea></form>')).toEqual([
      "Les formulaires et champs de saisie ne sont pas autorisés : utilisez le bloc « Formulaire (lead) ».",
    ]);
  });

  it("points a <style> element to the CSS area", () => {
    expect(messagesFor("<style>p{color:red}</style><p>x</p>")).toEqual([
      "Les balises <style> ne sont pas publiées : placez ce CSS dans la zone « CSS ».",
    ]);
  });

  it("names any other disallowed element or attribute", () => {
    expect(messagesFor('<marquee>x</marquee><p name="n">y</p>')).toEqual([
      "La balise <marquee> n'est pas autorisée et sera retirée.",
      "L'attribut « name » de <p> n'est pas autorisé et sera retiré.",
    ]);
  });
});
