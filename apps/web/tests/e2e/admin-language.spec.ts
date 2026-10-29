import { expect, test, type Browser } from "@playwright/test";

import { adminToken as sharedAdminToken } from "./fixtures";

/**
 * 023-admin-i18n (US1, US2, T019) — the admin's language is the member's own
 * choice, else the installation's, never the browser's (here English, unlike
 * the French installation). The member is driven with an injected
 * `Authorization: JWT` header, as every admin spec; the language cookie a
 * save returns is put in the browser by hand, since cookies set by the CMS
 * do not reach the dockerised runner's admin host.
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

async function adminPage(browser: Browser, token: string | null, languageCookie?: string) {
  const context = await browser.newContext({ locale: "en-US", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } });
  if (languageCookie) await context.addCookies([{ name: "payload-lng", value: languageCookie, url: CMS_URL }]);
  if (token) {
    await context.route(`${CMS_URL}/**`, (route) => {
      const req = route.request();
      if (!["document", "fetch", "xhr"].includes(req.resourceType())) return route.continue();
      return route.continue({ headers: { ...req.headers(), authorization: `JWT ${token}` } });
    });
  }
  return context.newPage();
}

const htmlLang = (page: { locator: (s: string) => { getAttribute: (n: string) => Promise<string | null> } }) => page.locator("html").getAttribute("lang");

test("the admin speaks the member's language, else the installation's, never the browser's", async ({ browser }) => {
  test.setTimeout(120_000);
  const token = (await sharedAdminToken()) ?? "";
  test.skip(!token, "no admin token (global-setup)");

  const me = (await (await api("/users/me", token)).json()) as { user: { id: number; adminLanguage?: string | null } };
  const settingsBefore = (await (await api("/globals/settings", token)).json()) as { adminLanguage?: string };
  const setMine = (lang: string | null) => api(`/users/${me.user.id}`, token, { method: "PATCH", body: JSON.stringify({ adminLanguage: lang }) });
  const setInstallation = (lang: string) => api("/globals/settings", token, { method: "POST", body: JSON.stringify({ adminLanguage: lang }) });

  try {
    expect((await setInstallation("fr")).status).toBe(200);
    const cleared = await setMine(null);
    expect(cleared.status).toBe(200);

    // Signed out: the installation's language, whatever the browser asks for.
    const login = await adminPage(browser, null);
    await expect.poll(async () => (await login.goto(`${ADMIN_URL}/login`), htmlLang(login)), { timeout: 40_000 }).toBe("fr");

    // A member without a choice: the installation's.
    const noChoice = await adminPage(browser, token);
    await noChoice.goto(`${ADMIN_URL}/collections/pages`);
    expect(await htmlLang(noChoice)).toBe("fr");

    // Saving their own choice returns the cookie; with it the next screen is English.
    const started = Date.now();
    const saved = await setMine("en");
    expect(saved.status).toBe(200);
    // SC-004: one save, under 5 s, sets the language — no sign-out. (Timing the
    // next page load too measured the runner's load, not the switch.)
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(saved.headers.getSetCookie().find((c) => c.startsWith("payload-lng="))).toMatch(/^payload-lng=en;/);
    const chosen = await adminPage(browser, token, "en");
    await chosen.goto(`${ADMIN_URL}/collections/pages`);
    expect(await htmlLang(chosen)).toBe("en");

    // The installation switching to English reaches members without a choice within 30 s.
    expect((await setInstallation("en")).status).toBe(200);
    await expect.poll(async () => (await noChoice.goto(`${ADMIN_URL}/collections/pages`), htmlLang(noChoice)), { timeout: 40_000, intervals: [2_000] }).toBe("en");

    // A member who chose keeps their language when the installation changes.
    expect((await setInstallation("fr")).status).toBe(200);
    const frCookie = (await setMine("fr")).headers.getSetCookie().find((c) => c.startsWith("payload-lng="));
    expect(frCookie).toMatch(/^payload-lng=fr;/);
    expect((await setInstallation("en")).status).toBe(200);
    const keeps = await adminPage(browser, token, "fr");
    await keeps.goto(`${ADMIN_URL}/collections/pages`);
    expect(await htmlLang(keeps)).toBe("fr");

    // Going back to « Installation default » expires the cookie.
    expect((await setMine(null)).headers.getSetCookie().find((c) => c.startsWith("payload-lng="))).toMatch(/^payload-lng=; .*Max-Age=0/);
  } finally {
    await setMine(me.user.adminLanguage ?? null);
    const original = settingsBefore.adminLanguage ?? "fr";
    await setInstallation(original);
    // The CMS keeps the installation's language up to 30 s: wait until it is
    // back, so the next shared-state spec meets the admin it expects.
    const signedOut = await adminPage(browser, null);
    await expect.poll(async () => (await signedOut.goto(`${ADMIN_URL}/login`), htmlLang(signedOut)), { timeout: 40_000, intervals: [2_000] }).toBe(original);
  }
});

// 023-admin-i18n (US4, T049) — the page editor too: GrapesJS's own panels and
// Trefle's block names; the page's content is the same in both.
test("the page editor speaks the member's language, the page's content does not change", async ({ browser }) => {
  test.setTimeout(90_000);
  const token = (await sharedAdminToken()) ?? "";
  test.skip(!token, "no admin token (global-setup)");
  const found = (await (await api("/pages?limit=1&depth=0&sort=-updatedAt", token)).json()) as { docs: { id: number }[] };
  test.skip(!found.docs[0], "no page to open");
  const id = found.docs[0]!.id;

  const canvasText: string[] = [];
  for (const [lang, openBlocks, testimonial] of [
    ["en", "Open Blocks", "Testimonial"],
    ["fr", "Ouvrir le gestionnaire de blocs", "Témoignage"],
  ] as const) {
    const page = await adminPage(browser, token, lang);
    await page.goto(`${ADMIN_URL}/collections/pages/${id}`);
    const open = page.locator(".gjs-pn-btn.fa-th-large");
    await expect(open).toHaveAttribute("title", openBlocks, { timeout: 30_000 });
    // Open the library first (never after selecting: that races the style panel).
    const tile = page.locator(".gjs-block", { hasText: testimonial });
    await expect(async () => {
      if (!(await tile.isVisible())) await open.click();
      await expect(tile).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    canvasText.push(await page.frameLocator(".gjs-frame").locator("body").innerText());
    await page.context().close();
  }
  expect(canvasText[0]).toBe(canvasText[1]);
});
