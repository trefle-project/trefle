import grapesjs, { type Component, type Editor } from "grapesjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEVICE_BREAKPOINTS, LAYOUT_TYPES } from "../src/layout";
import { trefleLayoutPlugin } from "../src/plugin";
import { serializeImport } from "../src/serialize";
import { BLOCKS, EXTRACT, IR } from "./fixtures";

/**
 * 012-url-page-import (T025, research R13/R15) — an imported page is native
 * editor content: the editor opens the serialized projectData, exports the
 * very same HTML, every text is an editable text component, and the device
 * adjustments sit exactly where a manual Tablet / Mobile portrait edit goes.
 */
const out = serializeImport(IR, EXTRACT, { pageType: "subscription", blocks: BLOCKS });

let editor: Editor;
beforeEach(() => {
  editor = grapesjs.init({
    headless: true,
    storageManager: false,
    plugins: [trefleLayoutPlugin],
    projectData: out.projectData,
  });
});
afterEach(() => editor.destroy());

const squash = (s: string) => s.replace(/>\s+</g, "><").trim();
const unwrapBody = (s: string) => s.replace(/^<body>([\s\S]*)<\/body>$/, "$1");
const all = (): Component[] => {
  const acc: Component[] = [];
  const walk = (c: Component) => {
    acc.push(c);
    c.components().forEach(walk);
  };
  walk(editor.getWrapper()!);
  return acc;
};
const byId = (id: string) => all().find((c) => c.getId() === id)!;

describe("projectData → editor → html", () => {
  it("getHtml() equals the serializer html (modulo whitespace)", () => {
    expect(squash(unwrapBody(editor.getHtml()))).toBe(squash(out.html));
  });

  it("getCss() carries every base rule and the device media rules", () => {
    const css = editor.getCss() ?? "";
    for (const rule of out.projectData.styles.filter((r) => !r.mediaText)) expect(css).toContain(`${rule.selectors[0] ?? rule.selectorsAdd}{`);
    expect(css).toContain(`@media ${DEVICE_BREAKPOINTS.tablet}`);
    expect(css).toContain(`@media ${DEVICE_BREAKPOINTS.mobilePortrait}`);
  });

  it("opens the layout as Section / Columns / Column components", () => {
    const types = new Set(all().map((c) => c.get("type")));
    for (const t of [LAYOUT_TYPES.section, LAYOUT_TYPES.sectionInner, LAYOUT_TYPES.columns, LAYOUT_TYPES.column]) {
      expect(types).toContain(t);
    }
  });

  it("every heading, paragraph, list item, caption and button is an editable text component", () => {
    const textual = all().filter((c) => ["h1", "h2", "p", "li", "figcaption"].includes(c.get("tagName") ?? ""));
    expect(textual.length).toBeGreaterThan(8);
    for (const c of textual) {
      expect(["text", "link"], `${c.get("tagName")} ${c.getId()}`).toContain(String(c.get("type")));
      expect(c.get("editable"), c.get("tagName")).toBe(true);
    }
    const buttons = all().filter((c) => c.get("tagName") === "a" && c.getAttributes().href?.startsWith("https://exemple.fr/inscription"));
    expect(buttons.length).toBe(2);
    for (const b of buttons) expect(b.get("type")).toBe("link");
  });

  it("images are image components (selectable, replaceable)", () => {
    const imgs = all().filter((c) => c.get("type") === "image");
    expect(imgs).toHaveLength(2);
    for (const img of imgs) expect(img.get("selectable")).toBe(true);
  });
});

describe("device views (FR-011a)", () => {
  const heroHeadingId = /<h1 id="(imp-\d+)"/.exec(out.html)![1]!;

  it("Desktop shows the base style only", () => {
    editor.Devices.select("desktop");
    expect(byId(heroHeadingId).getStyle()).toEqual({ color: "#14532d", "font-size": "56px" });
  });

  it("Tablet and Mobile portrait show the imported overrides, where a manual device edit is stored", () => {
    editor.Devices.select("tablet");
    expect(byId(heroHeadingId).getStyle()).toEqual({ "font-size": "40px" });
    editor.Devices.select("mobilePortrait");
    expect(byId(heroHeadingId).getStyle()).toEqual({ "font-size": "32px" });

    // An editor's own edit in that view lands in the same rule.
    byId(heroHeadingId).addStyle({ "font-size": "30px" });
    const rule = editor.Css.getIdRule(heroHeadingId, { mediaText: DEVICE_BREAKPOINTS.mobilePortrait });
    expect(rule?.getStyle()).toEqual({ "font-size": "30px" });
  });

  it("the hidden decorative image is display:none on Mobile portrait only", () => {
    const figureId = /<figure data-block="image" id="(imp-\d+)"/.exec(out.html)![1]!;
    editor.Devices.select("mobilePortrait");
    expect(byId(figureId).getStyle()).toEqual({ display: "none" });
    editor.Devices.select("desktop");
    expect(byId(figureId).getStyle().display).toBeUndefined();
  });
});

describe("whole-link texts (card titles)", () => {
  it("the editor keeps the rule that gives the link its text's colour, and exports it", () => {
    const extract = {
      ...EXTRACT,
      texts: [...EXTRACT.texts, { id: "t20", tag: "h3", html: '<a href="https://exemple.fr/article">Un article</a>', box: EXTRACT.texts[0]!.box, style: {} }],
    };
    const ir = { ...IR, sections: [{ source: "Cartes", rows: [{ kind: "blocks" as const, blocks: [{ kind: "rich-text" as const, parts: [{ ref: "t20", as: "h3" as const, style: { color: "#111111" } }] }] }] }] };
    const res = serializeImport(ir, extract, { pageType: "free", blocks: BLOCKS });
    const rule = res.projectData.styles.find((r) => r.selectorsAdd?.endsWith(" a"));
    expect(rule?.style).toEqual({ color: "inherit", "text-decoration": "none" });
    const ed = grapesjs.init({ headless: true, storageManager: false, plugins: [trefleLayoutPlugin], projectData: res.projectData });
    try {
      expect(ed.getCss()).toContain(`${rule!.selectorsAdd}{color:inherit;text-decoration:none;}`);
      expect(res.css).toContain(`${rule!.selectorsAdd}{color:inherit;text-decoration:none;}`);
    } finally {
      ed.destroy();
    }
  });
});
