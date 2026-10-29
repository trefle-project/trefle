import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { adminToken, pageUrl, siteHost } from "./fixtures";

/**
 * 021-legal-pages (T023, quickstart V3–V6) — each domain serves its privacy
 * policy and legal notice from the editable texts and the two identities,
 * every page ends with the legal footer line, the lead form links to the
 * domain's policy, and a text edit shows within the publish delay (FR-014),
 * through the edge Worker too. Runs in both modes.
 */
const CMS_API = process.env.CMS_API_URL ?? "http://localhost:3000/api";
const PAGE_URL = pageUrl();
const ORIGIN = new URL(PAGE_URL).origin;
const STAMP = Date.now();
const OPERATOR = `Opérateur E2E ${STAMP}`;

let auth: Record<string, string>;
let domainId: number;

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${CMS_API}${path}`, { ...init, headers: { ...auth, "content-type": "application/json", ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

test.beforeAll(async () => {
  auth = { authorization: `JWT ${await adminToken()}` };
  await api("/globals/settings", {
    method: "POST",
    body: JSON.stringify({
      operator: { name: OPERATOR, address: "1 rue de Test, Lille", email: "operateur@example.com", phone: "+33 3 00 00 00 00" },
      suppliers: [
        { name: "Hébergeur E2E", role: "hébergement du serveur", location: "UE", isHost: true, address: "2 rue Serveur, Paris", phone: "+33 1 00 00 00 00" },
        { name: "Diffuseur E2E", role: "diffusion et sécurité", location: "États-Unis", safeguards: "Data Privacy Framework" },
      ],
    }),
  });
  const domains = (await api(`/domains?where[hostname][equals]=${siteHost()}&limit=1`)) as { docs: { id: number }[] };
  domainId = domains.docs[0]!.id;
  await api(`/domains/${domainId}`, {
    method: "PATCH",
    body: JSON.stringify({ owner: { name: "Traiteur E2E SARL", address: "3 place Test, Lille", email: "rgpd@traiteur.example", director: "Jeanne Test" } }),
  });
});

test("the privacy policy names the owner, the operator and its suppliers, with a version", async ({ page }) => {
  await expect
    .poll(async () => {
      await page.goto(`${ORIGIN}/privacy`);
      return page.locator("main").innerText();
    }, { timeout: 30_000 })
    .toContain(OPERATOR);
  const text = await page.locator("main").innerText();
  expect(text).toContain("Traiteur E2E SARL");
  expect(text).toContain("Hébergeur E2E : hébergement du serveur (UE).");
  expect(text).toContain("Diffuseur E2E : diffusion et sécurité (États-Unis — Data Privacy Framework).");
  expect(text).toMatch(/Version [0-9a-f]{12} du /);
  expect(text).not.toContain("{{");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Politique de confidentialité");
  await expect(page.locator('a[href="/audience-measurement"]')).toHaveCount(1);
});

test("the legal notice names the publisher, the director and the host", async ({ page }) => {
  await page.goto(`${ORIGIN}/legal-notice`);
  const text = await page.locator("main").innerText();
  expect(text).toContain("Traiteur E2E SARL");
  expect(text).toContain("Directeur de la publication : Jeanne Test.");
  expect(text).toContain("Le site est hébergé par Hébergeur E2E.");
  expect(text).not.toContain("{{");
});

test("every page ends with the legal footer line, and the lead form links to the domain policy", async ({ page }) => {
  await page.goto(PAGE_URL);
  const footer = page.locator("footer.trefle-legal-footer");
  await expect(footer).toBeVisible();
  const lang = (await footer.getAttribute("lang")) ?? "fr";
  await expect(footer.getByRole("link", { name: "Mentions légales" })).toHaveAttribute("href", `/legal-notice?lang=${lang}`);
  await expect(footer.getByRole("link", { name: "Confidentialité" })).toHaveAttribute("href", `/privacy?lang=${lang}`);
  const formLink = page.locator(".trefle-lead-form a", { hasText: "Politique de confidentialité" });
  if (await formLink.count()) await expect(formLink).toHaveAttribute("href", /\/privacy|^https?:/);
  // While the cookie banner is open it covers the footer: the banner itself
  // links the policy, so it can be read before answering.
  const banner = page.getByRole("region", { name: "Votre vie privée" });
  if (await banner.isVisible()) {
    await banner.getByRole("link", { name: "Confidentialité" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Politique de confidentialité");
    await page.goto(PAGE_URL);
    await banner.getByRole("button").first().click();
  }
  await footer.getByRole("link", { name: "Confidentialité" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Politique de confidentialité");
});

test("a text edit shows on the next views (FR-014), through the Worker too", async ({ page }) => {
  const renamed = `${OPERATOR} (modifié)`;
  await api("/globals/settings", { method: "POST", body: JSON.stringify({ operator: { name: renamed, address: "1 rue de Test, Lille", email: "operateur@example.com" } }) });
  await expect
    .poll(async () => {
      await page.goto(`${ORIGIN}/privacy`);
      return page.locator("main").innerText();
    }, { timeout: 30_000 })
    .toContain(renamed);
});

test("no serious or critical axe violation on the legal pages and on a page with the footer; 360 px without horizontal scroll", async ({ page }) => {
  for (const url of [`${ORIGIN}/privacy`, `${ORIGIN}/legal-notice`, PAGE_URL]) {
    await page.goto(url);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking, `${url}: ${JSON.stringify(blocking.map((v) => v.id))}`).toEqual([]);
  }
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(PAGE_URL);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

// 023-admin-i18n (US7, contracts/public-paths.md) — the French paths of before
// 023 answer with one permanent redirect, query kept; through the Worker too.
test("each old French path redirects once, permanently, to its English path", async ({ request }) => {
  for (const [oldPath, newPath] of [
    ["/confidentialite", "/privacy"],
    ["/mentions-legales", "/legal-notice"],
    ["/mesure-audience", "/audience-measurement"],
  ]) {
    const res = await request.get(`${ORIGIN}${oldPath}?lang=en`, { maxRedirects: 0 });
    expect(res.status(), oldPath).toBe(308);
    expect(new URL(res.headers().location!, ORIGIN).toString(), oldPath).toBe(`${ORIGIN}${newPath}?lang=en`);
    expect((await request.get(`${ORIGIN}${newPath}?lang=en`, { maxRedirects: 0 })).status(), newPath).toBe(200);
  }
});

test("with the owner's own legal notice, the old path goes straight there", async ({ request }) => {
  const own = "https://owner.example/legal";
  await api(`/domains/${domainId}`, { method: "PATCH", body: JSON.stringify({ ownLegalNoticeUrl: own }) });
  try {
    await expect
      .poll(async () => (await request.get(`${ORIGIN}/mentions-legales`, { maxRedirects: 0 })).headers().location, { timeout: 30_000 })
      .toBe(own);
  } finally {
    await api(`/domains/${domainId}`, { method: "PATCH", body: JSON.stringify({ ownLegalNoticeUrl: null }) });
  }
});
