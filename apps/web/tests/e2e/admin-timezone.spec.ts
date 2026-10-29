import { expect, test, type Browser } from "@playwright/test";

import { adminToken as sharedAdminToken } from "./fixtures";

/**
 * 022-ux-improvement (User Story 6, quickstart V7b) — admin dates follow the
 * member's display time zone, else the installation default, whatever the
 * browser's own zone (here Asia/Tokyo, unlike both settings).
 * The Administrator is driven with an injected `Authorization: JWT` header,
 * as every admin spec.
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
  const context = await browser.newContext({ timezoneId: "Asia/Tokyo" });
  await context.route(`${CMS_URL}/**`, (route) => {
    const req = route.request();
    if (!["document", "fetch", "xhr"].includes(req.resourceType())) return route.continue();
    return route.continue({ headers: { ...req.headers(), authorization: `JWT ${token}` } });
  });
  return context.newPage();
}

/** dd/MM/yyyy HH:mm in a zone, the admin's format. */
function inZone(iso: string, tz: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

test("admin dates follow the member's zone, else the installation default; the leads export too", async ({ browser }) => {
  test.setTimeout(90_000);
  const token = (await sharedAdminToken()) ?? "";
  test.skip(!token, "no admin token (global-setup)");

  const me = (await (await api("/users/me", token)).json()) as { user: { id: number; displayTimezone?: string | null } };
  const settingsBefore = (await (await api("/globals/settings", token)).json()) as { adminTimezone?: string };
  const entry = ((await (await api("/activity-log?sort=-at&limit=1&depth=0", token)).json()) as { docs: { id: number; at: string }[] }).docs[0];
  test.skip(!entry, "no activity entry to read");

  const setMine = (tz: string | null) => api(`/users/${me.user.id}`, token, { method: "PATCH", body: JSON.stringify({ displayTimezone: tz }) });
  const setDefault = (tz: string) => api("/globals/settings", token, { method: "POST", body: JSON.stringify({ adminTimezone: tz }) });

  try {
    expect((await setDefault("Europe/Paris")).status).toBe(200);
    expect((await setMine(null)).status).toBe(200);

    const page = await adminPage(browser, token);
    const list = `${ADMIN_URL}/collections/activity-log`;

    // No choice → the installation default, not the browser's Tokyo.
    await page.goto(list);
    await expect(page.getByText(inZone(entry!.at, "Europe/Paris")).first()).toBeVisible();
    await expect(page.getByText(inZone(entry!.at, "Asia/Tokyo"))).toHaveCount(0);

    // The member's own choice wins.
    expect((await setMine("America/New_York")).status).toBe(200);
    await page.goto(list);
    await expect(page.getByText(inZone(entry!.at, "America/New_York")).first()).toBeVisible();

    // Changing the default does not move a member who chose.
    expect((await setDefault("Asia/Kolkata")).status).toBe(200);
    await page.goto(list);
    await expect(page.getByText(inZone(entry!.at, "America/New_York")).first()).toBeVisible();

    // A document's « Modifié / Créé » header too (Payload's own pair is hidden).
    const lead = ((await (await api("/leads?limit=1&depth=0", token)).json()) as { docs: { id: number; updatedAt: string }[] }).docs[0];
    if (lead) {
      await page.goto(`${ADMIN_URL}/collections/leads/${lead.id}`);
      await expect(page.locator(".trefle-doc-dates")).toContainText(inZone(lead.updatedAt, "America/New_York"));
      await expect(page.locator(".doc-controls__value-wrap").first()).toBeHidden();
    }

    // The account form offers the choice.
    await page.goto(`${ADMIN_URL}/collections/users/${me.user.id}`);
    await expect(page.getByText("Fuseau horaire d'affichage")).toBeVisible();

    // Export: the exporting member's zone, with its offset.
    const csv = await (await api("/leads-export?consentedOnly=0", token)).text();
    const firstRow = csv.trim().split("\r\n")[1] ?? "";
    if (firstRow) expect(firstRow).toMatch(/,\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-0[45]:00,/);
  } finally {
    await setMine(me.user.displayTimezone ?? null);
    await setDefault(settingsBefore.adminTimezone ?? "Europe/Paris");
  }
});
