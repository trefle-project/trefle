import { expect, test, type Browser } from "@playwright/test";

import { adminToken as sharedAdminToken } from "./fixtures";

/**
 * 022-ux-improvement (User Story 2, quickstart V4) — the admin's menu
 * (groups, order, names), the resizable menu remembered per member, the
 * Settings → Default tabs, and list search on several fields.
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
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.route(`${CMS_URL}/**`, (route) => {
    const req = route.request();
    if (!["document", "fetch", "xhr"].includes(req.resourceType())) return route.continue();
    return route.continue({ headers: { ...req.headers(), authorization: `JWT ${token}` } });
  });
  return context.newPage();
}

const MENU: [string, string[]][] = [
  ["Reports", ["Pages Stats", "A/B experiments"]],
  ["Contents", ["Domains", "Pages", "Media", "Conf. emails", "Legal Pages", "Fonts"]],
  ["Imports", ["Pages Import", "Penpot Import"]],
  ["Leads", ["Leads", "Consent records", "Data-subject requests"]],
  ["Settings", ["Users", "Activity log", "Languages", "Default"]],
];

test("menu groups, order and names; old addresses still open", async ({ browser }) => {
  const token = (await sharedAdminToken()) ?? "";
  test.skip(!token, "no admin token (global-setup)");
  const page = await adminPage(browser, token);
  await page.goto(ADMIN_URL);
  const groups = page.locator(".nav-group");
  await expect(groups.first()).toBeVisible();
  expect(await groups.locator(".nav-group__toggle").allInnerTexts()).toEqual(MENU.map(([g]) => g));
  for (const [i, [, entries]] of MENU.entries()) {
    expect((await groups.nth(i).locator(".nav__link").allInnerTexts()).map((t) => t.trim())).toEqual(entries);
  }
  // Renamed entries keep their address; the page title follows the new name.
  await page.goto(`${ADMIN_URL}/collections/opt-in-emails`);
  await expect(page.getByRole("heading", { name: "Conf. emails" })).toBeVisible();
  await page.goto(`${ADMIN_URL}/collections/legal-versions`);
  await expect(page.getByRole("heading", { name: "Legal Pages" })).toBeVisible();
  // Group headings are larger than the entries under them.
  const size = async (sel: string) => Number.parseFloat(await page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontSize));
  expect(await size(".nav-group__toggle")).toBeGreaterThan(await size(".nav__link"));
});

test("the menu width is remembered for the member, double-click resets it", async ({ browser }) => {
  const token = (await sharedAdminToken()) ?? "";
  test.skip(!token, "no admin token (global-setup)");
  const openMenu = async (p: Awaited<ReturnType<typeof adminPage>>) => {
    await p.goto(`${ADMIN_URL}/collections/pages`);
    await expect(p.locator(".nav--nav-hydrated")).toHaveCount(1);
    // The menu may be closed (Payload remembers it per member): open it.
    if ((await p.locator(".template-default--nav-open").count()) === 0) await p.locator(".nav-toggler").first().click();
    await expect(p.locator(".template-default--nav-open")).toHaveCount(1);
    // Wait for the opening slide to end (the drag reads the menu's position).
    await expect.poll(() => p.locator(".nav").first().evaluate((el) => Math.round(el.getBoundingClientRect().left))).toBe(0);
  };
  const widthOf = (p: Awaited<ReturnType<typeof adminPage>>) => () => p.locator(".nav").first().evaluate((el) => Math.round(el.getBoundingClientRect().width));

  const page = await adminPage(browser, token);
  await openMenu(page);
  const handle = page.locator(".trefle-nav-resize");
  await expect(handle).toBeVisible();
  try {
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(380, box.y + 200, { steps: 5 });
    await page.mouse.up();
    await expect.poll(widthOf(page)).toBeGreaterThan(360);

    // Another browser (no local copy): the member's preference still applies.
    const other = await adminPage(browser, token);
    await openMenu(other);
    await expect.poll(widthOf(other)).toBeGreaterThan(360);
  } finally {
    await handle.dblclick();
  }
  await expect.poll(widthOf(page)).toBe(275);
});

test("Settings → Default: four tabs, saving from one tab keeps the others", async ({ browser }) => {
  const token = (await sharedAdminToken()) ?? "";
  test.skip(!token, "no admin token (global-setup)");
  const before = (await (await api("/globals/settings", token)).json()) as { retentionMonths: number };
  const page = await adminPage(browser, token);
  try {
    await page.goto(`${ADMIN_URL}/globals/settings`);
    for (const tab of ["Général", "Entités légales", "Textes légaux", "Consents default"]) await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    // Payload reopens the tab a member last used: start from « Général ».
    await page.getByRole("button", { name: "Général", exact: true }).click();
    const retention = page.getByLabel("Conservation des leads (mois)");
    await retention.click();
    await retention.fill("");
    await retention.pressSequentially(String(before.retentionMonths + 1));
    await expect(page.getByRole("button", { name: "Sauvegarder" })).toBeEnabled();
    await page.getByRole("button", { name: "Textes légaux", exact: true }).click();
    await page.getByRole("button", { name: "Sauvegarder" }).click();
    await expect.poll(async () => ((await (await api("/globals/settings", token)).json()) as { retentionMonths: number }).retentionMonths).toBe(before.retentionMonths + 1);
  } finally {
    await api("/globals/settings", token, { method: "POST", body: JSON.stringify({ retentionMonths: before.retentionMonths }) });
  }
});

test("a list's search looks in several fields (Users: name too)", async ({ browser }) => {
  const token = (await sharedAdminToken()) ?? "";
  test.skip(!token, "no admin token (global-setup)");
  const me = (await (await api("/users/me", token)).json()) as { user: { id: number; name?: string | null; email: string } };
  await api(`/users/${me.user.id}`, token, { method: "PATCH", body: JSON.stringify({ name: "Zéphyrin Orgabis" }) });
  try {
    const page = await adminPage(browser, token);
    await page.goto(`${ADMIN_URL}/collections/users`);
    const search = page.locator(".search-filter input, input[type='search']").first();
    await expect(search).toHaveAttribute("placeholder", /e-?mail/i);
    await expect(search).toHaveAttribute("placeholder", /name/i);
    await search.fill("orgabis");
    await expect(page.locator("tbody tr").filter({ hasText: me.user.email })).toHaveCount(1);
    // The first column (avatar) opens the member's record.
    await expect(page.locator("tbody tr").filter({ hasText: me.user.email }).getByRole("link", { name: /^Ouvrir / })).toHaveAttribute("href", new RegExp(`/collections/users/${me.user.id}$`));
  } finally {
    await api(`/users/${me.user.id}`, token, { method: "PATCH", body: JSON.stringify({ name: me.user.name ?? null }) });
  }
});
