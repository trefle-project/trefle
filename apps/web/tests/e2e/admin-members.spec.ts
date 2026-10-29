import { expect, test, type Browser } from "@playwright/test";

import { adminToken as sharedAdminToken } from "./fixtures";

/**
 * 019-admin-access (User Story 3, quickstart V5/V6 locally) — the two admin
 * pieces that keep the team in step with Cloudflare Access:
 *   - the banner every Administrator sees while the Access allow-list (as
 *     apply.sh last reported it) differs from the active members;
 *   - « Réinitialiser la double authentification » on another member's page.
 *
 * Runs with the second factor off (the suite's default): the Administrator
 * is driven with an injected `Authorization: JWT` header, as every admin spec.
 * Gated like us5-roles (members are created and removed).
 */
const CMS_URL = process.env.CMS_URL ?? "http://localhost:3000";
const ADMIN_URL = process.env.CMS_ADMIN_URL ?? `${CMS_URL}/admin`;
const CMS_API = process.env.CMS_API_URL ?? `${CMS_URL}/api`;
const SYNC_SECRET = process.env.E2E_EDGE_SYNC_SECRET ?? "dev-edge-sync-secret-not-for-production-0000";

test.skip(process.env.E2E_RUN_US5 !== "1", "set E2E_RUN_US5=1 with the full stack up");

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

/** What apply.sh --sync-members does on the CMS side: report the current members as applied. */
async function syncEdgeAccess() {
  const list = await api("/edge-access", { headers: { "x-edge-sync-secret": SYNC_SECRET } });
  expect(list.status, "EDGE_SYNC_SECRET of the stack under test").toBe(200);
  const { emails } = (await list.json()) as { emails: string[] };
  const synced = await api("/edge-access/synced", {
    method: "POST",
    headers: { "x-edge-sync-secret": SYNC_SECRET },
    body: JSON.stringify({ emails }),
  });
  expect(synced.status).toBe(204);
}

async function adminPage(browser: Browser, token: string) {
  const context = await browser.newContext();
  await context.route(`${CMS_URL}/**`, (route) => {
    const req = route.request();
    if (!["document", "fetch", "xhr"].includes(req.resourceType())) return route.continue();
    return route.continue({ headers: { ...req.headers(), authorization: `JWT ${token}` } });
  });
  return context.newPage();
}

test("the Access banner names a new member; an Administrator resets another member's second factor", async ({ browser }) => {
  test.setTimeout(90_000);
  const token = (await sharedAdminToken()) ?? "";
  expect(token).toBeTruthy();

  await syncEdgeAccess();
  const email = `e2e-member-${Date.now()}@trefle.localhost`;
  const created = await api("/users", {
    method: "POST",
    token,
    body: JSON.stringify({ email, password: "e2e-member-123", role: "editor", name: "Membre E2E" }),
  }).then((r) => r.json());
  const memberId = created?.doc?.id;
  expect(memberId, JSON.stringify(created)).toBeTruthy();

  try {
    const page = await adminPage(browser, token);

    // --- out of step: the banner names the address to add (specs running in
    // parallel may add their own members to the same list)
    await page.goto(ADMIN_URL, { waitUntil: "domcontentloaded" });
    const banner = page.getByRole("status").filter({ hasText: "L’accès Cloudflare n’est pas à jour" });
    await expect(banner).toContainText("à ajouter ", { timeout: 30_000 });
    await expect(banner).toContainText(email);
    await expect(banner).toContainText("apply.sh --sync-members");

    // --- the member's page: reset, confirmed, logged
    await page.goto(`${ADMIN_URL}/collections/users/${memberId}`, { waitUntil: "domcontentloaded" });
    const reset = page.getByRole("button", { name: "Réinitialiser la double authentification" });
    await expect(reset).toBeVisible({ timeout: 30_000 });
    // Under a full parallel run the button can render before React hydrates
    // it: a click then does nothing. Wait for the page to settle first.
    await page.waitForLoadState("networkidle");
    page.once("dialog", (d) => {
      expect(d.message()).toContain("devra reconfigurer son application d'authentification");
      void d.accept();
    });
    await reset.click();
    await expect(page.getByText("Double authentification réinitialisée.")).toBeVisible();
    const log = await api(
      `/activity-log?where[type][equals]=totp-reset&where[targetId][equals]=${memberId}&limit=1`,
      { token },
    ).then((r) => r.json());
    expect(log.totalDocs).toBe(1);

    // --- never on one's own account
    const me = await api("/users/me", { token }).then((r) => r.json());
    await page.goto(`${ADMIN_URL}/collections/users/${me.user.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#field-email")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Réinitialiser la double authentification" })).toHaveCount(0);

    // --- back in step: our member is no longer named (the banner itself is
    // gone unless a parallel spec added a member in the meantime)
    await syncEdgeAccess();
    await page.goto(ADMIN_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: /^pages$/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("status").filter({ hasText: email })).toHaveCount(0);
    await page.context().close();
  } finally {
    await api(`/users/${memberId}`, { method: "DELETE", token });
    await syncEdgeAccess();
  }
});
