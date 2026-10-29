import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { guardedContext, renderSource } from "../../src/lib/import/render";
import { FIXTURE_ORIGIN, stackBrowser } from "./connect";

/**
 * 012-url-page-import (T032, research R4) — the browser never reaches an
 * internal address while rendering: not through a redirect of the page, not
 * through a sub-resource. The fixture site is the only private host the test
 * stack exempts (IMPORT_ALLOW_PRIVATE_HOSTS=import-fixture).
 */
let browser: Browser;
beforeAll(async () => {
  browser = await stackBrowser();
});
afterAll(async () => {
  await browser?.close();
});

describe("render guard", () => {
  it("a page that redirects to http://cms:3000/ fails with private-address", async () => {
    await expect(renderSource(browser, `${FIXTURE_ORIGIN}/redirect-internal`)).rejects.toMatchObject({
      code: "private-address",
    });
  });

  it("a refusal from a bot-protection service is `blocked`, a plain 403 is `login-required`", async () => {
    await expect(renderSource(browser, `${FIXTURE_ORIGIN}/blocked-waf`)).rejects.toMatchObject({ code: "blocked" });
    await expect(renderSource(browser, `${FIXTURE_ORIGIN}/members`)).rejects.toMatchObject({ code: "login-required" });
  });

  it("the import's browser introduces itself as the Trefle importer", async () => {
    const rendered = await renderSource(browser, `${FIXTURE_ORIGIN}/ua`);
    const agent = rendered.extract.texts.find((t) => t.tag === "p")?.html ?? "";
    expect(agent).toContain("TrefleImport/1.0");
    expect(agent).toContain("HeadlessChrome/");
  });

  it("a page redirect is followed to its target, which becomes the page's address", async () => {
    const rendered = await renderSource(browser, `${FIXTURE_ORIGIN}/redirect-home`);
    expect(rendered.finalUrl).toBe(`${FIXTURE_ORIGIN}/index.html`);
    expect(rendered.extract.texts[0]?.html).toBe("Un potager généreux, sans y passer vos week-ends");
  });

  it("sub-resources on 169.254.169.254, on cms:3000 or redirected there are aborted and the page still renders", async () => {
    const failed: string[] = [];
    const context = await guardedContext(browser, { onBlockedNavigation: () => undefined });
    try {
      const page = await context.newPage();
      page.on("requestfailed", (r) => failed.push(`${r.url()} ${r.failure()?.errorText ?? ""}`));
      page.on("requestfinished", (r) => {
        if (r.url().includes("169.254.169.254") || r.url().includes("cms:3000")) failed.push(`LOADED ${r.url()}`);
      });
      await page.goto(`${FIXTURE_ORIGIN}/subresource-metadata.html`, { waitUntil: "load" });
      await page.waitForTimeout(300);
      expect(failed.some((f) => f.startsWith("http://169.254.169.254/") && /BLOCKED_BY_CLIENT/.test(f))).toBe(true);
      expect(failed.some((f) => f.startsWith("http://cms:3000/") && /BLOCKED_BY_CLIENT/.test(f))).toBe(true);
      // Redirected to cms:3000: the request is refused under its own address, nothing reaches cms.
      expect(failed.some((f) => f.startsWith(`${FIXTURE_ORIGIN}/img/redirect-internal.png`) && /BLOCKED_BY_CLIENT/.test(f))).toBe(true);
      // Redirected within the site: followed by the CMS and delivered.
      const width = await page.evaluate(
        () => (document.querySelector('img[src="/img/redirect-ok.jpg"]') as HTMLImageElement).naturalWidth,
      );
      expect(width).toBeGreaterThan(0);
      expect(failed.some((f) => f.startsWith("LOADED"))).toBe(false);
    } finally {
      await context.close();
    }

    const rendered = await renderSource(browser, `${FIXTURE_ORIGIN}/subresource-metadata.html`);
    expect(rendered.extract.texts.map((t) => t.html)).toContain("Le reste de la page s'affiche.");
  });

  it("renders the fixture page at three widths with per-device differences", async () => {
    const rendered = await renderSource(browser, `${FIXTURE_ORIGIN}/index.html`);
    const heading = rendered.extract.texts.find((t) => t.id === "t1")!;
    expect(heading.html).toBe("Un potager généreux, sans y passer vos week-ends");
    expect(heading.devices?.mobile?.style?.fontSize).toBe("32px");
    expect(rendered.extract.images.find((i) => i.id === "i1")?.devices?.mobile?.hidden).toBe(true);
    // The canned IR (tests/fixtures/import-ir.fixture.json) places these ids.
    expect(rendered.extract.images.map((i) => [i.id, i.kind, i.candidates[0]])).toEqual([
      ["i1", "img", `${FIXTURE_ORIGIN}/img/feuilles.svg`],
      ["i2", "img", `${FIXTURE_ORIGIN}/img/tomates.svg`],
      ["i3", "background", `${FIXTURE_ORIGIN}/img/fond.jpg`],
    ]);
    expect(rendered.tiles.every((t) => t.width > 0 && t.top >= 0)).toBe(true);
    expect(new Set(rendered.tiles.map((t) => t.device))).toEqual(new Set(["desktop", "tablet", "mobile"]));
    expect(rendered.extract.forms).toHaveLength(1);
    // Fields as the form mapping needs them: placeholder choice left out, submit text kept.
    expect(rendered.extract.forms[0]).toMatchObject({
      id: "f1",
      submitLabel: "Je m'inscris",
      fields: [
        { name: "email", label: "Votre email", type: "email", required: true },
        { name: "prenom", label: "Votre prénom", type: "text", required: false },
        { name: "jardin", label: "Taille de votre jardin", type: "select", options: ["Petit", "Grand"] },
        { name: "rgpd", label: "J'accepte la politique de confidentialité", type: "checkbox", required: true },
      ],
    });
    expect(rendered.extract.unsupported.map((u) => u.kind)).toContain("video");
  });
});
