import grapesjs, { type Component, type Editor } from "grapesjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CAROUSEL_TYPES, carouselJson, slideJson } from "../src/carousel";
import { CAROUSEL_COMMANDS, CAROUSEL_LIMIT_MESSAGE } from "../src/carousel-plugin";
import { sectionJson } from "../src/layout";
import { trefleLayoutPlugin } from "../src/plugin";

/**
 * 016-carousel-block — the « Carrousel » block in a headless editor
 * (specs/016-carousel-block/contracts/editor.md, test obligations). The
 * one-slide canvas itself needs a real frame: checked manually (quickstart §2).
 */
let editor: Editor;

beforeEach(() => {
  editor = grapesjs.init({ headless: true, storageManager: false, plugins: [trefleLayoutPlugin] });
});
afterEach(() => editor.destroy());

const add = (def: object): Component => editor.getWrapper()!.append(def)[0]!;
const slides = (carousel: Component) => carousel.components().models as Component[];
const texts = (carousel: Component) => slides(carousel).map((s) => s.toHTML().replace(/<[^>]+>/g, ""));
const leadForm = { tagName: "div", attributes: { "data-block": "lead-form" } };
const textSlides = (...names: string[]) => names.map((n) => [{ tagName: "p", components: [{ type: "textnode", content: n }] }]);

const HTML =
  '<section data-block="carousel" aria-label="Avis" data-per-view="2">' +
  '<div data-block="carousel-slide"><p>Un</p></div>' +
  '<div data-block="carousel-slide"><p>Deux</p></div>' +
  "</section>";

describe("carousel — library and types", () => {
  it("adds the Carrousel block once, even when the plugin runs twice", () => {
    trefleLayoutPlugin(editor, {});
    const blocks = editor.Blocks.getAll().filter((b: { getId(): string }) => b.getId() === CAROUSEL_TYPES.carousel);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.get("label")).toBe("Carrousel");
  });

  it("drops a carousel with 3 example slides", () => {
    const carousel = add(carouselJson());
    expect(carousel.get("type")).toBe(CAROUSEL_TYPES.carousel);
    expect(slides(carousel).map((s) => s.get("type"))).toEqual(Array(3).fill(CAROUSEL_TYPES.slide));
    expect(texts(carousel)).toEqual(["Diapositive 1", "Diapositive 2", "Diapositive 3"]);
  });

  it("recognises the markup when it comes back as HTML, settings included", () => {
    const [carousel] = editor.getWrapper()!.append(HTML);
    expect(carousel!.get("type")).toBe(CAROUSEL_TYPES.carousel);
    expect(slides(carousel!).map((s) => s.get("type"))).toEqual([CAROUSEL_TYPES.slide, CAROUSEL_TYPES.slide]);
    expect(carousel!.getAttributes()).toMatchObject({ "aria-label": "Avis", "data-per-view": "2" });
  });

  it("keeps slides, order and attributes through a projectData round trip", () => {
    editor.getWrapper()!.append(HTML);
    const saved = editor.getProjectData();
    const reloaded = grapesjs.init({ headless: true, storageManager: false, plugins: [trefleLayoutPlugin] });
    reloaded.loadProjectData(saved);
    const carousel = reloaded.getWrapper()!.components().at(0);
    expect(carousel.get("type")).toBe(CAROUSEL_TYPES.carousel);
    expect(texts(carousel)).toEqual(["Un", "Deux"]);
    expect(reloaded.getHtml()).toContain('aria-label="Avis" data-per-view="2"');
    reloaded.destroy();
  });

  it("exports no editor-only attribute after switching slides", () => {
    const carousel = add(carouselJson());
    editor.select(carousel);
    editor.runCommand(CAROUSEL_COMMANDS.next);
    editor.runCommand(CAROUSEL_COMMANDS.prev);
    expect(editor.getHtml()).not.toContain("data-tf-");
    expect(JSON.stringify(editor.getProjectData())).not.toContain("data-tf-");
  });
});

describe("carousel — slide limits", () => {
  it("never lets the last slide be deleted", () => {
    const carousel = add(carouselJson(textSlides("A", "B")));
    expect(slides(carousel).every((s) => s.get("removable"))).toBe(true);
    slides(carousel)[1]!.remove();
    expect(slides(carousel)[0]!.get("removable")).toBe(false);
    const toolbar = slides(carousel)[0]!.get("toolbar") as { command: unknown }[];
    expect(toolbar.map((t) => t.command)).not.toContain("tlb-delete");
  });

  it("stops at 12 slides: no duplicate, and « + » adds nothing but says why", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const carousel = add(carouselJson(Array.from({ length: 12 }, () => [])));
    expect(slides(carousel).every((s) => s.get("copyable") === false)).toBe(true);
    editor.select(carousel);
    editor.runCommand(CAROUSEL_COMMANDS.add);
    expect(slides(carousel)).toHaveLength(12);
    expect(alert).toHaveBeenCalledWith(CAROUSEL_LIMIT_MESSAGE);
    alert.mockRestore();
  });

  it("« + » inserts an empty slide after the one shown", () => {
    const carousel = add(carouselJson(textSlides("A", "B", "C")));
    editor.select(carousel);
    editor.runCommand(CAROUSEL_COMMANDS.next); // shows B
    editor.runCommand(CAROUSEL_COMMANDS.add);
    expect(texts(carousel)).toEqual(["A", "B", "", "C"]);
  });
});

describe("carousel — moving slides", () => {
  it("moves a slide one place later or earlier, and does nothing at the ends", () => {
    const carousel = add(carouselJson(textSlides("A", "B", "C")));
    editor.select(slides(carousel)[0]!);
    editor.runCommand(CAROUSEL_COMMANDS.movePrev);
    expect(texts(carousel)).toEqual(["A", "B", "C"]);
    editor.runCommand(CAROUSEL_COMMANDS.moveNext);
    expect(texts(carousel)).toEqual(["B", "A", "C"]);
    editor.runCommand(CAROUSEL_COMMANDS.moveNext);
    expect(texts(carousel)).toEqual(["B", "C", "A"]);
    editor.runCommand(CAROUSEL_COMMANDS.moveNext);
    expect(texts(carousel)).toEqual(["B", "C", "A"]);
    editor.runCommand(CAROUSEL_COMMANDS.movePrev);
    expect(texts(carousel)).toEqual(["B", "A", "C"]);
  });
});

describe("carousel — drop rules (FR-007)", () => {
  it("a slide refuses a lead form and a carousel, accepts other blocks", () => {
    const carousel = add(carouselJson());
    const slide = slides(carousel)[0]!;
    expect(editor.Components.canMove(slide, leadForm).result).toBe(false);
    expect(editor.Components.canMove(slide, carouselJson()).result).toBe(false);
    expect(editor.Components.canMove(slide, { tagName: "div", attributes: { "data-block": "rich-text" } }).result).toBe(true);
  });

  it("a carousel only takes slides, and a slide only goes into a carousel", () => {
    const carousel = add(carouselJson());
    expect(editor.Components.canMove(carousel, slideJson()).result).toBe(true);
    expect(editor.Components.canMove(carousel, { tagName: "p" }).result).toBe(false);
    expect(editor.Components.canMove(editor.getWrapper()!, slideJson()).result).toBe(false);
  });

  it("a carousel can't go into a Section that sits in a slide", () => {
    const carousel = add(carouselJson([[sectionJson()]]));
    const inner = slides(carousel)[0]!.components().at(0).components().at(0);
    expect(editor.Components.canMove(inner, carouselJson()).result).toBe(false);
    expect(editor.Components.canMove(editor.getWrapper()!, carouselJson()).result).toBe(true);
  });
});

describe("carousel — click to add", () => {
  const click = () => {
    const block = editor.Blocks.get(CAROUSEL_TYPES.carousel)!;
    (block.get("onClick") as (b: unknown, ed: Editor) => void)(block, editor);
  };

  it("adds after the selected block", () => {
    const hero = add({ tagName: "section", attributes: { "data-block": "hero" } });
    add({ tagName: "section", attributes: { "data-block": "rich-text" } });
    editor.select(hero);
    click();
    const top = editor.getWrapper()!.components().models as Component[];
    expect(top.map((c) => c.getAttributes()["data-block"])).toEqual(["hero", "carousel", "rich-text"]);
    expect(editor.getSelected()).toBe(top[1]);
  });

  it("with a selection inside a slide, adds after that carousel, not in the slide", () => {
    const carousel = add(carouselJson());
    const text = slides(carousel)[1]!.components().at(1).components().at(0);
    editor.select(text);
    click();
    const top = editor.getWrapper()!.components().models as Component[];
    expect(top.map((c) => c.getAttributes()["data-block"])).toEqual(["carousel", "carousel"]);
    expect(slides(carousel)).toHaveLength(3);
  });
});

describe("carousel — settings (US3, contracts/editor.md Traits)", () => {
  const settingAttributes = (c: Component) => {
    const { "data-block": _marker, id: _id, ...rest } = c.getAttributes();
    return rest;
  };

  it("offers the six settings in the panel", () => {
    const carousel = add(carouselJson());
    expect((carousel.getTraits() as { getName(): string }[]).map((t) => t.getName())).toEqual([
      "carouselLabel",
      "perView",
      "autoplay",
      "interval",
      "arrows",
      "dots",
    ]);
  });

  it("writes nothing for the defaults", () => {
    const carousel = add(carouselJson());
    expect(settingAttributes(carousel)).toEqual({});
    expect(editor.getHtml()).toMatch(/<section data-block="carousel"( id="[^"]+")?>/);
  });

  it("writes each setting to its attribute, and removes it when back to the default", () => {
    const carousel = add(carouselJson());
    carousel.set({ carouselLabel: " Avis clients ", perView: "3", arrows: false, dots: false });
    expect(settingAttributes(carousel)).toEqual({
      "aria-label": "Avis clients",
      "data-per-view": "3",
      "data-arrows": "false",
      "data-dots": "false",
    });
    carousel.set({ carouselLabel: "", perView: "1", arrows: true, dots: true });
    expect(settingAttributes(carousel)).toEqual({});
  });

  it("writes autoplay and its interval to the one data-autoplay attribute", () => {
    const carousel = add(carouselJson());
    carousel.set("interval", 4);
    expect(settingAttributes(carousel)).toEqual({});
    carousel.set("autoplay", true);
    expect(carousel.getAttributes()["data-autoplay"]).toBe("4");
    carousel.set("interval", 60);
    expect(carousel.getAttributes()["data-autoplay"]).toBe("10");
    carousel.set("autoplay", false);
    expect(carousel.getAttributes()["data-autoplay"]).toBeUndefined();
  });

  it("reads the settings back from HTML, into the panel too", () => {
    const [carousel] = editor
      .getWrapper()!
      .append('<section data-block="carousel" data-per-view="3" data-autoplay="7" data-dots="false"><div data-block="carousel-slide"></div></section>');
    const values = Object.fromEntries(
      (carousel!.getTraits() as { getName(): string; get(k: string): unknown }[]).map((t) => [t.getName(), t.get("value")]),
    );
    expect(values).toEqual({ carouselLabel: "", perView: "3", autoplay: true, interval: 7, arrows: true, dots: false });
    expect(carousel!.get("perView")).toBe("3");
  });
});
