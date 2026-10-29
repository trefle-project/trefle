import grapesjs, { type Component, type Editor } from "grapesjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LAYOUT_TYPES, columnsJson, sectionJson } from "../src/layout";
import { setColumnCount, trefleLayoutPlugin } from "../src/plugin";

let editor: Editor;

beforeEach(() => {
  editor = grapesjs.init({ headless: true, storageManager: false, plugins: [trefleLayoutPlugin] });
});
afterEach(() => editor.destroy());

const add = (def: object): Component => editor.getWrapper()!.append(def)[0]!;
const heroHtml = '<section data-block="hero"><h1>Titre</h1></section>';

describe("trefleLayoutPlugin — library", () => {
  it("adds the Section and Colonnes blocks", () => {
    expect(editor.Blocks.get(LAYOUT_TYPES.section)?.get("label")).toBe("Section");
    expect(editor.Blocks.get(LAYOUT_TYPES.columns)?.get("label")).toBe("Colonnes");
  });

  it("is idempotent when run twice on the same editor", () => {
    trefleLayoutPlugin(editor, {});
    expect(editor.Blocks.getAll().filter((b: { getId(): string }) => b.getId() === LAYOUT_TYPES.columns)).toHaveLength(1);
  });

  it("recognises the layout markup when it comes back as HTML", () => {
    const [section] = editor.getWrapper()!.append(
      '<section data-block="section"><div data-block-inner><div data-block="columns" data-cols="2">' +
        '<div data-block="column"></div><div data-block="column"></div></div></div></section>',
    );
    expect(section!.get("type")).toBe(LAYOUT_TYPES.section);
    const inner = section!.components().at(0);
    expect(inner.get("type")).toBe(LAYOUT_TYPES.sectionInner);
    const columns = inner.components().at(0);
    expect(columns.get("type")).toBe(LAYOUT_TYPES.columns);
    expect(columns.components().map((c: Component) => c.get("type"))).toEqual([LAYOUT_TYPES.column, LAYOUT_TYPES.column]);
  });
});

describe("Columns — number of columns (FR-023)", () => {
  it("2 → 3 appends an empty column and updates data-cols", () => {
    const columns = add(columnsJson([[heroHtml as never], []]));
    columns.set("cols", "3");
    expect(columns.components()).toHaveLength(3);
    expect(columns.components().at(2).components()).toHaveLength(0);
    expect(columns.getAttributes()["data-cols"]).toBe("3");
  });

  it("3 → 2 moves the removed column's blocks into the last remaining column", () => {
    const columns = add(columnsJson([[], [], []]));
    columns.components().at(2).append(heroHtml);
    columns.components().at(1).append('<div data-block="rich-text"><p>Texte</p></div>');
    setColumnCount(columns, 2);
    expect(columns.components()).toHaveLength(2);
    const last = columns.components().at(1);
    expect(last.components().map((c: Component) => c.getAttributes()["data-block"])).toEqual(["rich-text", "hero"]);
    expect(columns.get("cols")).toBe("2");
  });

  it("clamps outside 2–4", () => {
    const columns = add(columnsJson([[], []]));
    setColumnCount(columns, 9);
    expect(columns.components()).toHaveLength(4);
    setColumnCount(columns, 1);
    expect(columns.components()).toHaveLength(2);
  });

  it("the trait reflects the stored number of columns on load", () => {
    const columns = add(columnsJson([[], [], [], []]));
    expect(columns.get("cols")).toBe("4");
  });

  it("the trait's own value matches too, so choosing « 2 » in the panel after loading 3 columns applies", () => {
    // The settings panel only writes a value that differs from the trait's own;
    // a trait left at the type's default ("2") made 3 → 2 a silent no-op.
    const columns = add(columnsJson([[], [], []]));
    const trait = columns.getTrait("cols");
    expect(trait.get("value")).toBe("3");
    trait.set("value", "2"); // what the panel's select does on change
    trait.setValue(trait.get("value"));
    expect(columns.components()).toHaveLength(2);
    expect(columns.getAttributes()["data-cols"]).toBe("2");
  });
});

describe("drop rules", () => {
  it("refuses Columns inside a Column (one level of columns)", () => {
    const columns = add(columnsJson([[], []]));
    const column = columns.components().at(0);
    expect(editor.Components.canMove(column, columnsJson([[], []])).result).toBe(false);
  });

  it("accepts any library block inside a Column and inside a Section", () => {
    const columns = add(columnsJson([[], []]));
    expect(editor.Components.canMove(columns.components().at(0), heroHtml).result).toBe(true);
    const inner = add(sectionJson()).components().at(0);
    expect(editor.Components.canMove(inner, heroHtml).result).toBe(true);
    expect(editor.Components.canMove(inner, columnsJson([[], []])).result).toBe(true);
  });

  it("only lets a Column go inside Columns", () => {
    const columns = add(columnsJson([[], []]));
    const column = columns.components().at(0);
    expect(editor.Components.canMove(editor.getWrapper()!, column).result).toBe(false);
    expect(editor.Components.canMove(columns, heroHtml).result).toBe(false);
  });
});
