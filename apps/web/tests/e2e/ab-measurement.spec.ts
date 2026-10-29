import AxeBuilder from "@axe-core/playwright";
import { expect, request, test } from "@playwright/test";

import { adminToken, pageUrl, siteHost } from "./fixtures";

/**
 * 018-ab-significance (US3, T063, contracts/measurement-page.md and
 * edge-worker.md, research R15) — cookieless tests: the information page,
 * and, through the local Worker with exposures on (`E2E_EDGE=1
 * E2E_EXPOSURES=1`), a page under test that sets no cookie and carries a view
 * number in its form token. That exposures and attributions reach the
 * database is covered by the CMS tests (tests/db) and quickstart V2–V4.
 */
const ORIGIN = new URL(pageUrl()).origin;
const MEASUREMENT = `${ORIGIN}/audience-measurement`;
const CMS_API = process.env.CMS_API_URL ?? "http://localhost:3000/api";
const EDGE_EXPOSURES = process.env.E2E_EDGE === "1" && process.env.E2E_EXPOSURES === "1";

test("the measurement page explains the tests, without JavaScript, with no form and no cookie", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const res = await page.goto(`${MEASUREMENT}?lang=fr`);
  expect(res?.headers()["set-cookie"]).toBeUndefined();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tests de pages et mesure d’audience");
  await expect(page.getByText("Rien n’est déposé ni lu sur votre appareil")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator("form")).toHaveCount(0);
  // 023 (US6): in English by `?lang=`, like the legal pages.
  await page.goto(`${MEASUREMENT}?lang=en`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page tests and audience measurement");
  await expect(page.locator("main")).toHaveAttribute("lang", "en");
  await context.close();
});

test("the measurement page has no serious or critical axe violation", async ({ page }) => {
  await page.goto(MEASUREMENT);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking, JSON.stringify(blocking.map((v) => v.id), null, 2)).toEqual([]);
});

test.describe("at the edge, with exposures on", () => {
  test.skip(!EDGE_EXPOSURES, "edge run with EXPOSURES=on only (E2E_EDGE=1 E2E_EXPOSURES=1)");

  let authHeaders: Record<string, string>;
  let controlId: number | string;
  let variantId: number | string;
  let experimentId: number | string;
  let testUrl: string;

  test.beforeAll(async () => {
    authHeaders = { authorization: `JWT ${await adminToken()}`, "content-type": "application/json" };
    const path = new URL(pageUrl()).pathname;
    const shared = (await fetch(
      `${CMS_API}/pages?where[domain.hostname][equals]=${siteHost()}&where[path][equals]=${encodeURIComponent(path)}&limit=1`,
      { headers: authHeaders },
    ).then((r) => r.json())) as { docs: { id: number }[] };
    const dup = async () =>
      ((await fetch(`${CMS_API}/pages/${shared.docs[0]!.id}/duplicate`, { method: "POST", headers: authHeaders, body: "{}" }).then((r) => r.json())) as {
        doc: { id: number; path: string };
      }).doc;
    const control = await dup();
    controlId = control.id;
    testUrl = `${ORIGIN}${control.path}`;
    await fetch(`${CMS_API}/pages/${controlId}`, { method: "PATCH", headers: authHeaders, body: JSON.stringify({ status: "published" }) });
    variantId = (await dup()).id;
    await fetch(`${CMS_API}/pages/${variantId}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ experimentOf: controlId, domain: null, path: null, status: "published" }),
    });
    const exp = (await fetch(`${CMS_API}/experiments`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "e2e ab-measurement", controlPage: controlId, growthbookExperimentKey: `e2e-ab-measure-${Date.now()}`, status: "running" }),
    }).then((r) => r.json())) as { doc: { id: number } };
    experimentId = exp.doc.id;
  });

  test.afterAll(async () => {
    for (const path of [`experiments/${experimentId}`, `pages/${variantId}`, `pages/${controlId}`]) {
      if (!path.endsWith("undefined")) await fetch(`${CMS_API}/${path}`, { method: "DELETE", headers: authHeaders });
    }
  });

  /** The view number inside a page's form token (`pageId.issuedAt.<view number>`). */
  const viewNumberOf = (html: string) => {
    const token = /name="formToken" value="([^".]+)\./.exec(html)?.[1];
    return token ? Buffer.from(token, "base64url").toString("utf8").split(".")[2] : undefined;
  };

  test("a page under test sets no cookie and its form carries a fresh view number at each view", async () => {
    const numbers = new Set<string | undefined>();
    for (let i = 0; i < 3; i++) {
      const ctx = await request.newContext();
      const res = await ctx.get(testUrl);
      expect(res.headers()["set-cookie"]).toBeUndefined();
      numbers.add(viewNumberOf(await res.text()));
      await ctx.dispose();
    }
    expect([...numbers].every((n) => /^[A-Za-z0-9_-]{11}$/.test(n ?? ""))).toBe(true);
    expect(numbers.size).toBe(3);
  });
});
