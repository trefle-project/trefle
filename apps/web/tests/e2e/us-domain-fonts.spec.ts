import { expect, test } from "@playwright/test";

import { adminToken, testClientIp } from "./fixtures";

/**
 * 015-penpot-site-import, User Story 4 (T045) — « Polices du domaine »: a
 * Google family added to a domain is stored by Trefle and used by the
 * domain's published pages, which never contact a Google server (FR-013,
 * FR-025, FR-026, SC-008). Works against the real Google Fonts API (local
 * dev) or the import-fixture stand-in (CI, GOOGLE_FONTS_CSS_URL).
 */
const CMS_API = process.env.CMS_API_URL ?? "http://localhost:3000/api";
const BASE = process.env.E2E_BASE_URL ?? "http://site-a.localhost:3001";
const SITE_HOST = process.env.E2E_SITE_HOST ?? "site-a.localhost";
const RUN = Date.now().toString(36);
const PATH = `/e2e-fonts-${RUN}`;
const FAMILY = "EB Garamond";

type Row = { family: string; weights: string[]; italic?: boolean; files?: { url?: string }[] };

async function auth(): Promise<Record<string, string> | undefined> {
  const token = await adminToken();
  return token ? { authorization: `JWT ${token}`, "content-type": "application/json" } : undefined;
}

let headers: Record<string, string> | undefined;
let domainId: number | string;
let rows: Row[] = [];

test.beforeAll(async () => {
  headers = await auth();
  if (!headers) return;
  const found = (await fetch(
    `${CMS_API}/domains?where[hostname][equals]=${SITE_HOST}&limit=1&depth=0`,
    { headers },
  ).then((r) => r.json())) as {
    docs: { id: number; fonts?: Row[] }[];
  };
  domainId = found.docs[0]!.id;
  rows = (found.docs[0]!.fonts ?? []).map(({ family, weights, italic }) => ({
    family,
    weights,
    italic,
  }));
});

// The e2e domain is shared by every spec: put its fonts back as they were, so
// later specs (e.g. 014's « no CSP violation » checks) see the page they expect.
test.afterAll(async () => {
  if (!headers || domainId == null) return;
  await fetch(`${CMS_API}/domains/${domainId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fonts: rows }),
  });
});

test.describe("domain fonts", () => {
  test.skip(() => !headers, "no admin token (global setup)");

  test("adding a Google family stores its files; an unknown family is refused, named", async () => {
    const keep = rows.filter((r) => r.family !== FAMILY);
    const ok = await fetch(`${CMS_API}/domains/${domainId}?depth=1`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        fonts: [...keep, { family: FAMILY, weights: ["400"], italic: false }],
      }),
    });
    expect(ok.status, await ok.clone().text()).toBe(200);
    const saved = ((await ok.json()) as { doc: { fonts: Row[] } }).doc.fonts.find(
      (r) => r.family === FAMILY,
    )!;
    expect(saved.files?.length).toBeGreaterThanOrEqual(1);
    for (const f of saved.files ?? []) expect(f.url).not.toMatch(/googleapis|gstatic/);

    const bad = await fetch(`${CMS_API}/domains/${domainId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        fonts: [
          ...keep,
          { family: FAMILY, weights: ["400"] },
          { family: "Garamont Pro", weights: ["400"] },
        ],
      }),
    });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("Police introuvable sur Google Fonts : Garamont Pro");
  });

  test("a published page of the domain uses the font, served by Trefle, with no Google request", async ({
    browser,
  }) => {
    const language = (
      (await fetch(`${CMS_API}/languages?where[code][equals]=fr&limit=1`, { headers }).then((r) =>
        r.json(),
      )) as { docs: { id: number }[] }
    ).docs[0]!.id;
    const html =
      '<section data-block="rich-text"><h1 id="e2e-font-title">Bonjour en Garamond</h1></section>';
    const created = await fetch(`${CMS_API}/pages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: `E2E fonts ${RUN}`,
        pageType: "free",
        domain: domainId,
        language,
        path: PATH,
        status: "published",
        builder: {
          projectData: {
            pages: [{ frames: [{ component: { type: "wrapper", components: html } }] }],
          },
          html,
          css: `#e2e-font-title{font-family:"${FAMILY}", serif;}`,
        },
      }),
    });
    expect(created.status, await created.clone().text()).toBe(201);

    const context = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": testClientIp() } });
    const page = await context.newPage();
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    // Saving the domain revalidates its cache tags asynchronously: the first
    // render may still use the cached domain (without this family yet). Reload
    // until it doesn't — waiting for the family itself: the domain may already
    // carry other fonts (a site import adds its own), so the tag alone proves nothing.
    await expect(async () => {
      const res = await page.goto(`${BASE}${PATH}`);
      expect(res?.status()).toBe(200);
      const css = await page.locator('style[data-trefle="domain-fonts"]').textContent({ timeout: 1_000 });
      expect(css).toContain(`font-family:"${FAMILY}"`);
    }).toPass({ timeout: 20_000 });
    await expect(page.locator("#e2e-font-title")).toBeVisible();

    const fontCss = await page.locator('style[data-trefle="domain-fonts"]').textContent();
    expect(fontCss).toContain(`font-family:"${FAMILY}"`);
    expect(fontCss).toMatch(/src:url\("[^"]+\/fonts\/[^"]+\.woff2"\)/);
    expect(
      await page.locator("#e2e-font-title").evaluate((el) => getComputedStyle(el).fontFamily),
    ).toContain(FAMILY);
    // The browser asks Trefle's asset host for the font, never Google.
    await expect.poll(() => requests.some((u) => /\/fonts\/[^/]+\.woff2$/.test(u))).toBe(true);
    expect(requests.filter((u) => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(u))).toEqual(
      [],
    );
    await context.close();
  });
});
