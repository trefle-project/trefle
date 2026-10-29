import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { adminToken, testClientIp } from "./fixtures";

/**
 * 012-url-page-import, User Story 3 — Section and Columns blocks, and the
 * lead form placed inside a Column (FR-022 – FR-025). Builds its own page via
 * the CMS REST API (same pattern as confirmation-page.spec.ts), using the
 * exact markup the GrapesJS plugin produces
 * (packages/grapesjs-page-import/src/layout.ts): Section › Columns(3) with an
 * image + text, a call-to-action, and the lead form in the last column.
 * The CTA uses the library block's AA-contrast default (#047857, 5.5:1).
 */
const CMS_API = process.env.CMS_API_URL ?? "http://localhost:3000/api";
const BASE = process.env.E2E_BASE_URL ?? "http://site-a.localhost:3001";
const SITE_HOST = process.env.E2E_SITE_HOST ?? "site-a.localhost";

const RUN = Date.now().toString(36);
const PATH = `/e2e-layout-${RUN}`;

const COLUMN = 'data-block="column" style="flex:1 1 calc((600px - 100%) * 999);min-width:0"';
const HTML =
  '<section data-block="section" style="padding:48px 24px">' +
  '<div data-block-inner="" style="max-width:1120px;margin:0 auto">' +
  '<div data-block="columns" data-cols="3" style="display:flex;flex-wrap:wrap;gap:24px">' +
  `<div ${COLUMN}><div data-block="rich-text"><h1>Colonnes ${RUN}</h1><p>Première colonne.</p></div></div>` +
  `<div ${COLUMN}><div data-block="call-to-action" style="padding:24px;text-align:center">` +
  '<a href="#form" style="display:inline-block;padding:12px 24px;background:#047857;color:#fff;border-radius:6px;text-decoration:none">Je m\'inscris</a></div></div>' +
  `<div ${COLUMN}><div data-block="lead-form" id="form" style="padding:24px;max-width:480px;margin:0 auto"></div></div>` +
  "</div></div></section>";

const FORM = {
  fields: [{ name: "email", label: "Email", type: "email", required: true }],
  submitLabel: "Envoyer",
  successMessage: `Merci colonnes ${RUN}`,
  consentPurposeText: "J'accepte d'être recontacté(e).",
  privacyNoticeUrl: "/privacy",
  privacyNoticeVersion: "2026-01",
};

async function adminAuth(): Promise<HeadersInit | undefined> {
  const token = await adminToken();
  return token ? { authorization: `JWT ${token}`, "content-type": "application/json" } : undefined;
}

async function findOrCreate(auth: HeadersInit, collection: string, where: string, data: object) {
  const found = (await fetch(`${CMS_API}/${collection}?${where}&limit=1`, { headers: auth }).then((r) => r.json())) as {
    docs: { id: string | number }[];
  };
  if (found.docs[0]) return found.docs[0].id;
  const created = (await fetch(`${CMS_API}/${collection}`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify(data),
  }).then((r) => r.json())) as { doc: { id: string | number } };
  return created.doc.id;
}

let ready = false;

test.beforeAll(async () => {
  const auth = await adminAuth();
  if (!auth) return;
  const domain = await findOrCreate(auth, "domains", `where[hostname][equals]=${SITE_HOST}`, {
    hostname: SITE_HOST,
    isActive: true,
    label: SITE_HOST,
  });
  const language = await findOrCreate(auth, "languages", "where[code][equals]=fr", {
    code: "fr",
    label: "Français",
    isActive: true,
  });
  const res = await fetch(`${CMS_API}/pages`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      title: `E2E layout blocks ${RUN}`,
      domain,
      language,
      path: PATH,
      status: "published",
      builder: {
        // The publish guard counts blocks from projectData (a lead form nested
        // in a column must still count as exactly one). Explicit layout types,
        // as the plugin's blocks store them, so the page also reopens as
        // Section / Columns in the editor.
        projectData: {
          pages: [
            {
              frames: [
                {
                  component: {
                    type: "wrapper",
                    components: [
                      {
                        type: "trefle-section",
                        tagName: "section",
                        attributes: { "data-block": "section" },
                        components: [
                          {
                            type: "trefle-section-inner",
                            tagName: "div",
                            attributes: { "data-block-inner": "" },
                            components: [
                              {
                                type: "trefle-columns",
                                tagName: "div",
                                attributes: { "data-block": "columns", "data-cols": "3" },
                                components: [
                                  { type: "trefle-column", tagName: "div", attributes: { "data-block": "column" }, components: [{ tagName: "div", attributes: { "data-block": "rich-text" } }] },
                                  { type: "trefle-column", tagName: "div", attributes: { "data-block": "column" }, components: [{ tagName: "div", attributes: { "data-block": "call-to-action" } }] },
                                  { type: "trefle-column", tagName: "div", attributes: { "data-block": "column" }, components: [{ tagName: "div", attributes: { "data-block": "lead-form", id: "form" } }] },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
        html: HTML,
        css: "",
      },
      form: FORM,
    }),
  });
  if (!res.ok) throw new Error(`could not create layout fixture page: ${res.status} ${await res.text()}`);
  ready = true;
});

async function columnBoxes(page: Page) {
  return page.locator('[data-block="column"]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y) };
    }),
  );
}

test("Section › Columns renders side by side on desktop", async ({ page }) => {
  test.skip(!ready, "no admin token — stack not up / not seeded");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}${PATH}`);
  await expect(page.getByRole("heading", { name: `Colonnes ${RUN}` })).toBeVisible();
  const boxes = await columnBoxes(page);
  expect(boxes).toHaveLength(3);
  expect(new Set(boxes.map((b) => b.y)).size).toBe(1);
  expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
  expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);
});

test("columns stack in order at 360px with no horizontal scroll", async ({ page }) => {
  test.skip(!ready, "no admin token — stack not up / not seeded");
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`${BASE}${PATH}`);
  const boxes = await columnBoxes(page);
  expect(new Set(boxes.map((b) => b.x)).size).toBe(1);
  expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
  expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("the lead form inside a column submits without JavaScript", async ({ browser }) => {
  test.skip(!ready, "no admin token — stack not up / not seeded");
  const context = await browser.newContext({ javaScriptEnabled: false, extraHTTPHeaders: { "x-real-ip": testClientIp() } });
  const page = await context.newPage();
  await page.goto(`${BASE}${PATH}`);
  const column = page.locator('[data-block="column"]').nth(2);
  await column.getByLabel(/email/i).fill(`e2e-layout-${RUN}@example.com`);
  await column.getByRole("checkbox").check();
  await page.waitForTimeout(2500); // clear the minimum fill-time window
  await column.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByText(`Merci colonnes ${RUN}`)).toBeVisible();
  await context.close();
});

test("layout page has no serious or critical axe violations", async ({ page }) => {
  test.skip(!ready, "no admin token — stack not up / not seeded");
  test.skip(process.env.E2E_RUN_A11Y !== "1", "set E2E_RUN_A11Y=1 with the stack up to run");
  await page.goto(`${BASE}${PATH}`);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking, JSON.stringify(blocking.map((v) => v.id), null, 2)).toEqual([]);
});
