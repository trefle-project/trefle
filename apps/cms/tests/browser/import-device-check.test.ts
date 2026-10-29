import { serializeImport } from "@trefle/grapesjs-page-import/serialize";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GJS_BLOCKS } from "../../src/fields/grapesjs/blocks";
import { convertPage } from "../../src/lib/import/convert";
import { deviceCheck } from "../../src/lib/import/device-check";
import { renderSource } from "../../src/lib/import/render";
import { FIXTURE_ORIGIN, stackBrowser } from "./connect";

/**
 * 012-url-page-import (T031, research R16, FR-011c) — the automatic check of
 * an imported page at 1440 / 770 / 568 / 320 px, in the real browser.
 */
let browser: Browser;
beforeAll(async () => {
  browser = await stackBrowser();
});
afterAll(async () => {
  await browser?.close();
});

const CRAFTED_HTML = `
<section data-block="hero"><h1>Titre</h1>
  <p style="font-size:12px">Mentions en petit</p>
</section>
<div data-block="rich-text" style="width:500px"><p>Bloc de largeur fixe</p></div>
<div data-block="call-to-action"><a href="#form" style="display:inline-block;padding:4px 16px;line-height:22px">Petit bouton</a></div>
<figure data-block="image"><img src="https://img.example/x.png" alt="x" style="width:900px;max-width:none"></figure>
<div data-block="rich-text"><h3><a href="https://exemple.fr/article">Un titre de carte cliquable, sur deux lignes à 320 px</a></h3>
  <p>Une phrase avec <a href="https://exemple.fr/x">un lien dedans</a>, exempté.</p></div>`;

describe("Columns layout (FR-024)", () => {
  // 4 columns in a Section: one row wherever the block is ≥ 600px wide, all
  // stacked below — never 3 + 1 (the old 260px basis wrapped at 1440px).
  const html = `<section data-block="section" style="padding:48px 24px"><div data-block-inner style="max-width:1120px;margin:0 auto">
    <div data-block="columns" data-cols="4" style="display:flex;flex-wrap:wrap;gap:24px">${[1, 2, 3, 4]
      .map((n) => `<div data-block="column" style="flex:1 1 calc((600px - 100%) * 999);min-width:0"><p>Colonne ${n}</p></div>`)
      .join("")}</div></div></section>`;
  it.each([
    [1440, 1],
    [770, 1],
    [390, 4],
  ])("at %ipx, 4 columns take %i row(s)", async (width, rows) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await page.setContent(html);
      const tops = await page.$$eval('[data-block="column"]', (els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size).toBe(rows);
    } finally {
      await page.close();
    }
  });
});

describe("deviceCheck", () => {
  it("finds exactly the crafted problems, per device", async () => {
    const found = await deviceCheck(browser, CRAFTED_HTML, "");
    const at = (device: string) =>
      found
        .filter((f) => f.device === device)
        .map((f) => `${f.kind}:${f.where.split(" ")[0]}`)
        .sort();

    // Everywhere: the 12px text and the 30px-high button.
    for (const device of ["desktop", "tablet", "mobileLandscape", "mobilePortrait"]) {
      expect(at(device)).toEqual(expect.arrayContaining(["small-text:hero", "small-target:call-to-action"]));
    }
    // 1440 px: the 900px image and the 500px block both fit.
    expect(at("desktop")).toEqual(["small-target:call-to-action", "small-text:hero"]);
    // 770 / 568 px: the 900px image passes the edge and scrolls the page.
    for (const device of ["tablet", "mobileLandscape"]) {
      expect(at(device)).toEqual(
        ["horizontal-scroll:page", "overflow:image", "small-target:call-to-action", "small-text:hero"].sort(),
      );
    }
    // 320 px: the 500px block overflows too.
    expect(at("mobilePortrait")).toEqual(
      ["horizontal-scroll:page", "overflow:image", "overflow:rich-text", "small-target:call-to-action", "small-text:hero"].sort(),
    );
  });

  it("finds nothing on the serializer's output for the e2e fixture page", async () => {
    const rendered = await renderSource(browser, `${FIXTURE_ORIGIN}/index.html`);
    const { ir } = await convertPage({ extract: rendered.extract, tiles: rendered.tiles });
    const out = serializeImport(ir, rendered.extract, { pageType: "subscription", blocks: GJS_BLOCKS });
    expect(await deviceCheck(browser, out.html, out.css)).toEqual([]);
  });
});
