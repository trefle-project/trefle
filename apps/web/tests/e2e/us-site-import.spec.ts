import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { adminToken } from "./fixtures";

/**
 * 015-penpot-site-import (T031, T034, T047) — import a website from a
 * `.penpot` file: the wizard, the drafts, links between pages, the report,
 * publishing, and a re-import next to published pages. Runs on the trimmed
 * reference file `blog-mini.penpot` (boards « Accueil » and « Article »)
 * with PENPOT_IMPORT=on (dev/CI overlay).
 *
 * Admin auth as in us-import.spec.ts: the shared JWT injected as an
 * `Authorization` header (cookies don't work on host.docker.internal).
 *
 * The e2e domain is shared: every address is unique to the run, and the
 * domain's fonts (the import may add Google families to it) are put back
 * afterwards, as us-domain-fonts.spec.ts does.
 */
const CMS_URL = process.env.CMS_URL ?? "http://localhost:3000";
const ADMIN_URL = process.env.CMS_ADMIN_URL ?? `${CMS_URL}/admin`;
const CMS_API = process.env.CMS_API_URL ?? `${CMS_URL}/api`;
const BASE = process.env.E2E_BASE_URL ?? "http://site-a.localhost:3001";
const SITE_HOST = process.env.E2E_SITE_HOST ?? "site-a.localhost";
const FIXTURE = join(__dirname, "..", "..", "..", "..", "packages", "grapesjs-page-import", "tests", "fixtures", "blog-mini.penpot");

const RUN = Date.now().toString(36);
const HOME = `/e2e-site-${RUN}`;
const POST = `/e2e-site-${RUN}/article`;

let token: string | undefined;
let domainId: number | undefined;
let fontRows: unknown[] = [];

const api = (path: string, init: RequestInit = {}) =>
  fetch(`${CMS_API}${path}`, {
    ...init,
    headers: { authorization: `JWT ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });

test.beforeAll(async () => {
  token = await adminToken();
  if (!token) return;
  const found = (await (await api(`/domains?where[hostname][equals]=${encodeURIComponent(SITE_HOST)}&depth=0&limit=1`)).json()) as {
    docs: { id: number; fonts?: { family: string; weights: string[]; italic?: boolean }[] }[];
  };
  domainId = found.docs[0]?.id;
  fontRows = (found.docs[0]?.fonts ?? []).map(({ family, weights, italic }) => ({ family, weights, italic }));
});

test.afterAll(async () => {
  if (!token || domainId == null) return;
  await api(`/domains/${domainId}`, { method: "PATCH", body: JSON.stringify({ fonts: fontRows }) });
});

async function signIn(context: BrowserContext) {
  await context.route(`${CMS_URL}/**`, (route) => {
    const request = route.request();
    if (!["document", "fetch", "xhr"].includes(request.resourceType())) return route.continue();
    return route.continue({ headers: { ...request.headers(), authorization: `JWT ${token}` } });
  });
}

type Draft = { id: number; title: string; path: string; seo?: { metaTitle?: string }; builder: { html: string } };
const draftsOf = async (siteImportId: number) =>
  ((await (await api(`/pages?where[siteImport][equals]=${siteImportId}&depth=0&sort=id`)).json()) as { docs: Draft[] }).docs;

/** Steps 1–2: the domain, then the file. Leaves the wizard on step 3. */
async function chooseDomainAndFile(page: Page) {
  await expect(page.getByText("Déposez ici le fichier .penpot")).toHaveCount(0);
  await expect(page.locator("#site-import-domain option", { hasText: SITE_HOST })).toHaveCount(1, { timeout: 20_000 });
  await page.locator("#site-import-domain").selectOption({ label: SITE_HOST });
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText(`Site pour ${SITE_HOST}`)).toBeVisible();
  await page.locator("#site-import-file").setInputFiles(FIXTURE);
  await expect(page.getByRole("checkbox", { name: "Importer « Accueil »" })).toBeVisible({ timeout: 30_000 });
}

const pathInput = (page: Page, board: string) => page.getByLabel(`Adresse de « ${board} »`);

/** Step 4: waits for the end and returns the import id. */
async function runImport(page: Page, count: number): Promise<number> {
  await page.locator("#site-import-language").selectOption({ label: "Français" });
  const started = page.waitForResponse((r) => /\/api\/site-imports\/\d+\/start$/.test(r.url()));
  await page.getByRole("button", { name: `Importer ${count} page${count > 1 ? "s" : ""}` }).click();
  const id = Number(/site-imports\/(\d+)\/start/.exec((await started).url())![1]);
  await expect(page.getByText(`Import terminé : ${count} brouillon`)).toBeVisible({ timeout: 120_000 });
  return id;
}

test.describe("import a website from a Penpot file", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(() => {
    test.skip(!token || domainId == null, "no admin token or e2e domain — stack not up / not seeded");
  });

  test("Pages list → wizard → linked drafts → published, responsive and accessible", async ({ context, page }) => {
    test.setTimeout(240_000);
    await signIn(context);
    await page.goto(`${ADMIN_URL}/collections/pages`);
    await page.getByRole("link", { name: "Importer un site Penpot" }).click();
    await page.waitForURL(/\/collections\/pages\/import-penpot$/);
    await chooseDomainAndFile(page);

    // Boards in reading order with their proposed addresses.
    const names = await page.locator("tbody tr td:nth-child(3)").allTextContents();
    expect(names).toEqual(["Accueil", "Article"]);
    await expect(pathInput(page, "Accueil")).toHaveValue("/");
    await expect(pathInput(page, "Article")).toHaveValue("/article");
    // Live validation, then this run's own addresses.
    await pathInput(page, "Article").fill("/");
    await expect(page.getByText("Une autre page de cet import a déjà cette adresse.").first()).toBeVisible();
    await pathInput(page, "Accueil").fill(HOME);
    await pathInput(page, "Article").fill(POST);
    const siteImportId = await runImport(page, 2);

    // Two drafts: dated names, the board names as public titles.
    const drafts = await draftsOf(siteImportId);
    expect(drafts.map((d) => [d.path, d.seo?.metaTitle])).toEqual([
      [HOME, "Accueil"],
      [POST, "Article"],
    ]);
    expect(drafts[0]!.title).toMatch(/^Accueil_\d{4}-\d\d-\d\d_\d\dh\d\d$/);
    // The link from the home page to the article uses the address chosen in the wizard (T034).
    expect(drafts[0]!.builder.html).toContain(`href="${POST}"`);

    // The draft opens in the editor with its report.
    await page.getByRole("link", { name: "Accueil" }).click();
    await page.waitForURL(/\/admin\/collections\/pages\/\d+$/);
    await expect(page.frameLocator(".gjs-frame").locator("h1").first()).toBeVisible({ timeout: 20_000 });
    const report = page.getByTestId("import-report");
    await expect(report).toContainText("Page importée depuis le board « Accueil » du fichier Penpot");
    await expect(report).not.toContainText("La page source n'avait pas de version mobile");

    // Publish both, then the public home page: its texts, no horizontal scroll at 360 px, axe clean.
    for (const d of drafts) {
      const res = await api(`/pages/${d.id}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) });
      expect(res.status, await res.clone().text()).toBe(200);
    }
    const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(drafts[0]!.builder.html)?.[1]?.replace(/<[^>]+>/g, "").trim();
    expect(heading, "the home board has a main heading").toBeTruthy();
    await page.setViewportSize({ width: 360, height: 780 });
    await expect(async () => {
      await page.goto(`${BASE}${HOME}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading!.slice(0, 20), { timeout: 2_000 });
    }).toPass({ timeout: 45_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, "no horizontal scroll at 360 px").toBe(false);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    // The design's own colours are kept (the blog file has pale buttons and meta
    // headings): contrast is the report's job, so it must be listed there; nothing else may fail.
    const blocking = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.filter((v) => v.id !== "color-contrast").map((v) => v.id)).toEqual([]);
    if (blocking.some((v) => v.id === "color-contrast")) {
      const row = ((await (await api(`/site-imports/${siteImportId}?depth=0`)).json()) as {
        boards: { name: string; report: { accessibility: { kind: string }[] } }[];
      }).boards.find((b) => b.name === "Accueil")!;
      expect(row.report.accessibility.some((a) => a.kind === "low-contrast"), "contrast problems are in the report").toBe(true);
    }

    // Following the link opens the article page.
    await page.locator(`a[href="${POST}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${POST.replace(/\//g, "\\/")}$`));
  });

  test("re-import: published addresses are marked, unticked links are reported, nothing existing changes", async ({ context, page }) => {
    test.setTimeout(180_000);
    await signIn(context);
    const before = await draftsOf(
      ((await (await api(`/site-imports?sort=-id&limit=1&depth=0`)).json()) as { docs: { id: number }[] }).docs[0]!.id,
    );
    await page.goto(`${ADMIN_URL}/collections/pages/import-penpot`);
    await chooseDomainAndFile(page);

    // The address of the published home page is marked as such.
    await pathInput(page, "Accueil").fill(HOME);
    await expect(page.getByText("Déjà publiée sur ce domaine", { exact: false })).toBeVisible();
    // Only « Accueil »: its link to the article is listed in its report.
    await page.getByRole("checkbox", { name: "Importer « Article »" }).uncheck();
    const siteImportId = await runImport(page, 1);
    const [draft] = await draftsOf(siteImportId);
    expect(draft!.id).not.toBe(before[0]!.id);
    expect(draft!.builder.html).not.toContain(`href="${POST}"`);
    await page.goto(`${ADMIN_URL}/collections/pages/${draft!.id}`);
    await expect(page.getByTestId("import-report")).toContainText("vers un board non importé", { timeout: 20_000 });

    // Publishing it at the published address is refused by the existing guard.
    const res = await api(`/pages/${draft!.id}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) });
    expect(res.status).toBeGreaterThanOrEqual(400);
    // The pages of the first import are untouched.
    const after = await Promise.all(before.map(async (d) => (await (await api(`/pages/${d.id}?depth=0`)).json()) as Draft & { status: string }));
    expect(after.map((d) => [d.id, d.title, d.path, d.status])).toEqual(before.map((d) => [d.id, d.title, d.path, "published"]));
  });

  test("from a domain's page the wizard opens on the file step", async ({ context, page }) => {
    await signIn(context);
    await page.goto(`${ADMIN_URL}/collections/domains/${domainId}`);
    await page.getByRole("link", { name: "Importer un site Penpot" }).click();
    await page.waitForURL(/\/import-penpot\?domain=\d+$/);
    await expect(page.getByText(`Site pour ${SITE_HOST}`)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Déposez ici le fichier .penpot")).toBeVisible();
  });
});
