import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { renderSavedFile } from "../../src/lib/import/render";
import { readSavedFile } from "../../src/lib/import/saved-file";
import { FIXTURE_ORIGIN, stackBrowser } from "./connect";

/**
 * 013-saved-page-import (T016, research S2/S4, SC-004) — a page saved from
 * the editor's browser is displayed from its file: never fetched from its
 * site, its scripts never run, nothing it references reaches an internal
 * address. The saved copies are served by the fixture site (the cms image
 * doesn't carry apps/web's test files).
 */
let browser: Browser;
beforeAll(async () => {
  browser = await stackBrowser();
});
afterAll(async () => {
  await browser?.close();
});

const savedCopy = async (name: string) => {
  const res = await fetch(`${FIXTURE_ORIGIN}/saved/${name}`);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  const file = await readSavedFile(Buffer.from(await res.arrayBuffer()), name);
  if (file === "unsupported") throw new Error(`${name}: unsupported`);
  return file;
};

describe("rendering a saved page", () => {
  it("MHTML: the page and its images come from the file, under the page's original address", async () => {
    const file = await savedCopy("fixture.mhtml");
    // Any request that still went to the site would find this host unresolvable.
    const offline = {
      ...file,
      html: file.html.replaceAll("http://import-fixture/", "http://saved-only.invalid/"),
      originalUrl: "http://saved-only.invalid/index.html",
      resources: new Map([...file.resources].map(([k, v]) => [k.replace("http://import-fixture/", "http://saved-only.invalid/"), v])),
    };
    const r = await renderSavedFile(browser, offline);
    expect(r.finalUrl).toBe("http://saved-only.invalid/index.html");
    expect(r.extract.texts[0]?.html).toBe("Un potager généreux, sans y passer vos week-ends");
    // Styles applied (they come from a cid: part): the hero heading is 56px, not the browser default.
    const heading = r.extract.texts.find((t) => t.tag === "h1")!;
    expect(heading.style.fontSize).toBe("56px");
    expect(r.extract.images.map((i) => i.candidates[0])).toEqual([
      "http://saved-only.invalid/img/feuilles.svg",
      "http://saved-only.invalid/img/tomates.svg",
      "http://saved-only.invalid/img/fond.jpg",
    ]);
    expect(r.tiles.length).toBeGreaterThan(0);
  });

  it("SingleFile: inlined images become embedded:<n> tokens, and no base64 is left in the extract", async () => {
    const r = await renderSavedFile(browser, await savedCopy("fixture.singlefile.html"));
    expect(r.finalUrl).toBe("http://import-fixture/index.html");
    const candidates = r.extract.images.map((i) => i.candidates[0]);
    expect(candidates).toEqual(["embedded:0", "embedded:1", "embedded:2"]);
    expect(r.embedded.get("embedded:2")).toMatch(/^data:image\/jpeg;base64,/);
    expect(JSON.stringify(r.extract)).not.toContain("base64");
  });

  it("a hostile page: no script runs, no internal address is reached or used, the content is still read", async () => {
    const file = await savedCopy("hostile.html");
    expect(file.originalUrl).toBeNull(); // http://cms:3000/admin is internal
    const r = await renderSavedFile(browser, file);
    expect(r.finalUrl).toBe("");
    const texts = r.extract.texts.map((t) => t.html);
    expect(texts).toContain("Une page enregistrée piégée");
    expect(texts).toContain("Ce paragraphe doit être repris tel quel.");
    expect(texts.join(" ")).not.toContain("SCRIPT RAN");
    // The internal image is not an image candidate the import could fetch.
    expect(r.extract.images.map((i) => i.candidates[0])).not.toContain("http://cms:3000/logo.png");
  });
});
