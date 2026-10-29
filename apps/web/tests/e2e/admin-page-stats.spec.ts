import { expect, test, type Browser } from "@playwright/test";

import { adminToken as sharedAdminToken } from "./fixtures";

/**
 * 022-ux-improvement (User Story 1, quickstart V1–V2) — Reports → Pages
 * Stats: one row per page with its totals over the period (not one row per
 * day), a day/hour chart under the clicked row, a CSV of the same totals.
 * Views are added through POST /api/page-view (admin token), which feeds the
 * daily and the hourly counters alike.
 */
const CMS_URL = process.env.CMS_URL ?? "http://localhost:3000";
const ADMIN_URL = process.env.CMS_ADMIN_URL ?? `${CMS_URL}/admin`;
const CMS_API = process.env.CMS_API_URL ?? `${CMS_URL}/api`;

async function api(path: string, token: string, init: RequestInit = {}) {
  return fetch(`${CMS_API}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `JWT ${token}`, ...(init.headers ?? {}) },
  });
}

async function adminPage(browser: Browser, token: string) {
  const context = await browser.newContext({ timezoneId: "Europe/Paris" });
  await context.route(`${CMS_URL}/**`, (route) => {
    const req = route.request();
    if (!["document", "fetch", "xhr"].includes(req.resourceType())) return route.continue();
    return route.continue({ headers: { ...req.headers(), authorization: `JWT ${token}` } });
  });
  return context.newPage();
}

test("Pages Stats: one row per page with its period totals, chart by day and hour, CSV", async ({ browser }) => {
  test.setTimeout(90_000);
  const token = (await sharedAdminToken()) ?? "";
  test.skip(!token, "no admin token (global-setup)");

  const pages = (await (await api("/pages?where[status][equals]=published&limit=1&depth=0&sort=id", token)).json()) as { docs: { id: number; title: string }[] };
  const target = pages.docs[0];
  test.skip(!target, "no published page");

  const exportBefore = await (await api("/page-stats/export", token)).text();
  const viewsOf = (csv: string) => Number(csv.split("\r\n").find((l) => l.startsWith(`${target!.id},`))?.split(",").at(-3) ?? 0);
  const before = viewsOf(exportBefore);
  for (let i = 0; i < 3; i++) expect((await api("/page-view", token, { method: "POST", body: JSON.stringify({ pageId: String(target!.id) }) })).status).toBe(204);

  const page = await adminPage(browser, token);
  await page.goto(`${ADMIN_URL}/collections/page-stats`);
  await expect(page.getByRole("heading", { name: "Pages Stats" })).toBeVisible();
  await expect(page.locator(".step-nav")).toContainText("Pages Stats");

  // One row for the page (a stored row per day would repeat it), with the total.
  const rowOf = (id: number) => page.locator("tbody tr").filter({ has: page.locator("td:nth-child(2)", { hasText: new RegExp(`^${id}$`) }) });
  const row = rowOf(target!.id);
  await expect(row).toHaveCount(1);
  // Other specs may visit pages meanwhile: at least our 3 views, and the list agrees with the CSV.
  const shown = Number((await row.locator("td").nth(4).innerText()).replace(/\D/g, ""));
  expect(shown).toBeGreaterThanOrEqual(before + 3);
  for (const header of ["ID page", "Page", "Domaine", "Vues", "Soumissions", "Conversion"]) await expect(page.getByRole("columnheader", { name: new RegExp(header) })).toBeVisible();

  // Search and filters (Payload's own went with its list view).
  await page.getByRole("searchbox", { name: /Rechercher une page/ }).fill(String(target!.id));
  await expect(page).toHaveURL(new RegExp(`q=${target!.id}`));
  await expect(rowOf(target!.id)).toHaveCount(1);
  await page.getByLabel("Avec des vues seulement").check();
  await expect(page).toHaveURL(/withViews=1/);
  await expect(rowOf(target!.id)).toHaveCount(1);
  await page.getByRole("button", { name: "Effacer les filtres" }).click();
  await expect(page).not.toHaveURL(/withViews=1|q=/);

  // Sort by views, ascending then descending (URL-driven).
  await page.getByRole("link", { name: /^Vues/ }).click();
  await expect(page).toHaveURL(/sort=views|sort=-views/);

  // Chart under the row: days, then hours on a 2-day period.
  await page.goto(`${ADMIN_URL}/collections/page-stats`);
  await row.click();
  await expect(page.getByRole("img", { name: "Graphique par jour" })).toBeVisible();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(Date.now() - 86_400_000));
  await page.goto(`${ADMIN_URL}/collections/page-stats?from=${yesterday}&to=${today}`);
  await rowOf(target!.id).getByRole("button", { name: /^Graphique de/ }).click();
  await page.getByRole("button", { name: "Heure" }).click();
  await expect(page.getByRole("img", { name: "Graphique par heure" })).toBeVisible();

  // CSV: same total.
  expect(viewsOf(await (await api("/page-stats/export", token)).text())).toBeGreaterThanOrEqual(shown);

  // Accessibility of the view (no serious/critical violation).
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const axe = await new AxeBuilder({ page }).include("table").analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
