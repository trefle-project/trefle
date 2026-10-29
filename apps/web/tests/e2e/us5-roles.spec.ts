import { expect, test } from "@playwright/test";

import { adminToken as sharedAdminToken } from "./fixtures";

/**
 * US5 smoke (T079). The membership rules (last-admin guard, role gates) are
 * covered exhaustively by the CMS vitest suite; this spec adds the one thing
 * only a browser can show — an Editor genuinely cannot open the Users or
 * Settings screens in the Payload admin — plus the invite mail round-trip.
 *
 * Needs the full stack + Mailpit. Gated by E2E_RUN_US5=1.
 */
const CMS_URL = process.env.CMS_URL ?? "http://localhost:3000";
const ADMIN_URL = process.env.CMS_ADMIN_URL ?? `${CMS_URL}/admin`;
const CMS_API = process.env.CMS_API_URL ?? `${CMS_URL}/api`;
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

test.skip(process.env.E2E_RUN_US5 !== "1", "set E2E_RUN_US5=1 with the full stack + Mailpit up");

// The Editor is authenticated with an injected `Authorization: JWT` header, as
// every admin-driving spec is: a cookie session doesn't survive navigation when
// the dockerised runner drives the admin cross-host (browser on
// `host.docker.internal`), which is why this spec was quarantined after the
// Payload 3.88 bump. The quarantine also hid a real bug: `Users.access.admin`
// was admin-only, and on the admin's auth collection that gates the whole
// admin panel — every Editor was refused it (fixed 2026-09-30).

async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = init;
  return fetch(`${CMS_API}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `JWT ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
  });
}

test("an invited Editor opens the admin but not Users or Settings; the last Administrator is protected", async ({
  browser,
  request,
}) => {
  // The Payload admin compiles routes on first hit under `next dev`; give it room.
  test.setTimeout(90_000);

  // Shared token from global-setup — see fixtures.ts adminToken().
  const adminToken = (await sharedAdminToken()) ?? "";
  expect(adminToken).toBeTruthy();

  // --- invite an Editor (with a known password so we can sign in as them) ---
  const editorEmail = `e2e-editor-${Date.now()}@trefle.localhost`;
  const editorPassword = "e2e-editor-123";
  const created = await api("/users", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({ email: editorEmail, password: editorPassword, role: "editor" }),
  }).then((r) => r.json());
  const editorId = created?.doc?.id;
  expect(editorId, JSON.stringify(created)).toBeTruthy();
  expect(created.doc.invitationStatus).toBe("invited");

  // --- the set-password email reached Mailpit ---
  await expect
    .poll(
      async () => {
        const r = await request.get(`${MAILPIT_URL}/api/v1/search?query=to:${editorEmail}`);
        return r.ok() ? ((await r.json()).messages_count ?? 0) : 0;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);

  try {
    // --- the Editor opens the admin panel: Pages yes, Users and Settings no ---
    // (Users.admin.hidden and Settings.admin.hidden for non-admins). This is
    // the browser-only assertion.
    const editorToken = await api("/users/login", {
      method: "POST",
      body: JSON.stringify({ email: editorEmail, password: editorPassword }),
    })
      .then((r) => r.json())
      .then((j) => j.token as string);
    expect(editorToken).toBeTruthy();
    const context = await browser.newContext();
    await context.route(`${CMS_URL}/**`, (route) => {
      const req = route.request();
      if (!["document", "fetch", "xhr"].includes(req.resourceType())) return route.continue();
      return route.continue({ headers: { ...req.headers(), authorization: `JWT ${editorToken}` } });
    });
    const page = await context.newPage();
    await page.goto(ADMIN_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/does not have access to the admin panel/i)).toHaveCount(0);
    // wait for the nav to hydrate — an Editor DOES get a Pages link
    await expect(page.getByRole("link", { name: /^pages$/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: /^users$|utilisateurs/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^settings$|^default$|param[èe]tres/i })).toHaveCount(0);
    // …and can open the Pages list (authoring pages is the core of the role).
    await page.goto(`${ADMIN_URL}/collections/pages`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^pages$/i })).toBeVisible({ timeout: 15_000 });
    await context.close();

    // --- and the API enforces it too ---
    // read on `users` is `readSelf` — an Editor can never enumerate members
    const list = await api("/users?limit=50", { token: editorToken }).then((r) => r.json());
    expect(list.totalDocs).toBeLessThanOrEqual(1);
    // and cannot change workspace settings (update is Administrator-only)
    const settingsWrite = await api("/globals/settings", {
      method: "POST",
      token: editorToken,
      body: JSON.stringify({ retentionMonths: 999 }),
    });
    expect(settingsWrite.status).toBe(403);
  } finally {
    // --- last-admin guard: the sole Administrator cannot be demoted ---
    const demote = await api(`/users/${await soleAdminId(adminToken)}`, {
      method: "PATCH",
      token: adminToken,
      body: JSON.stringify({ role: "editor" }),
    });
    expect(demote.status).toBe(400);
    expect(JSON.stringify(await demote.json())).toMatch(/last active Administrator/i);

    // cleanup
    await api(`/users/${editorId}`, { method: "DELETE", token: adminToken });
  }
});

async function soleAdminId(token: string): Promise<string> {
  const j = await api(
    "/users?where[role][equals]=admin&where[isActive][equals]=true&limit=1",
    { token },
  ).then((r) => r.json());
  return String(j.docs[0].id);
}
