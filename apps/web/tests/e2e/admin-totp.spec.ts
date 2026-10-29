import { expect, test, type Browser, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";

import { adminToken as sharedAdminToken } from "./fixtures";

/**
 * 019-admin-access (T021, User Story 2) — the admin's second factor, with
 * payload-totp enabled: a new member enrols at first login, a wrong code is
 * refused, the right one reaches the dashboard, and a password-only session
 * gets 403 from a custom endpoint.
 *
 * The rest of the suite runs with the second factor off (TOTP_DISABLED=1),
 * and global-setup's admin token is a password-only session. So this spec
 * drives a SECOND cms, started with the second factor on and sharing the same
 * database (`E2E_TOTP_CMS_URL`), and uses the usual one only to create and
 * remove its member:
 *
 *   TOTP_DISABLED=0 CMS_ALLOWED_ORIGINS=http://localhost:3010 \
 *     npm run --workspace @trefle/cms dev -- --port 3010
 *   E2E_TOTP=1 E2E_TOTP_CMS_URL=http://localhost:3010 npm run test:e2e:local -- admin-totp
 *
 * (CMS_ALLOWED_ORIGINS: without it Payload drops the cookie session of the
 * plugin's own fetches from that origin, and enrolment answers "unauthorized".)
 *
 * Unlike the other admin specs this one signs in with cookies, not an injected
 * `Authorization` header: the second factor lives in a cookie of its own. Run
 * it from the host (`test:e2e:local`), not the dockerised runner.
 */
const CMS_API = process.env.CMS_API_URL ?? "http://localhost:3000/api";
const TOTP_CMS = (process.env.E2E_TOTP_CMS_URL ?? "http://localhost:3010").replace(/\/+$/, "");

test.skip(process.env.E2E_TOTP !== "1", "set E2E_TOTP=1 with a second cms running with TOTP_DISABLED=0 (E2E_TOTP_CMS_URL)");

const code = (secret: string, offsetSteps = 0) =>
  new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30, algorithm: "SHA1" }).generate({
    timestamp: Date.now() + offsetSteps * 30_000,
  });

async function api(base: string, path: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = init;
  return fetch(`${base}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `JWT ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
  });
}

async function signIn(browser: Browser, email: string, password: string): Promise<Page> {
  const context = await browser.newContext({ locale: "fr-FR" });
  const page = await context.newPage();
  await page.goto(`${TOTP_CMS}/admin/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#field-email").fill(email);
  await page.locator("#field-password").fill(password);
  await page.locator("button[type=submit]").click();
  return page;
}

// The plugin's code field: one box per digit, plus an unnamed-in-the-UI
// `token` input that collects them (not type=hidden, so excluded by name).
async function typeCode(page: Page, value: string) {
  await page.locator("form input[type=text]:not([name])").first().click();
  await page.keyboard.type(value);
}

test("a member enrols at first login, then signs in with a code; a password alone opens nothing", async ({ browser }) => {
  // The admin compiles routes on first hit under `next dev`.
  test.setTimeout(120_000);

  const adminToken = (await sharedAdminToken()) ?? "";
  expect(adminToken).toBeTruthy();

  const email = `e2e-totp-${Date.now()}@trefle.localhost`;
  const password = "e2e-totp-member-123";
  const created = await api(CMS_API, "/users", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({ email, password, role: "editor" }),
  }).then((r) => r.json());
  const memberId = created?.doc?.id;
  expect(memberId, JSON.stringify(created)).toBeTruthy();

  try {
    // --- first login: sent to the setup page, which carries the setup-key hint ---
    const first = await signIn(browser, email, password);
    await expect(first).toHaveURL(/\/admin\/setup-totp/, { timeout: 30_000 });
    await expect(first.getByText(/gestionnaire de mots de passe de l'équipe/)).toBeVisible();
    const secret = await first.locator("input[name=secret]").inputValue();
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    await typeCode(first, code(secret));
    await expect(first).not.toHaveURL(/setup-totp/, { timeout: 30_000 });
    await first.context().close();

    // --- the enrolment is in the activity log, by user id only ---
    await expect
      .poll(async () => {
        const j = await api(
          CMS_API,
          `/activity-log?where[type][equals]=totp-enrolled&where[targetId][equals]=${memberId}&limit=1`,
          { token: adminToken },
        ).then((r) => r.json());
        return j.totalDocs ?? 0;
      })
      .toBe(1);

    // --- next login: the code is asked; a wrong one is refused ---
    const second = await signIn(browser, email, password);
    await expect(second).toHaveURL(/\/admin\/verify-totp/, { timeout: 30_000 });
    // A code from three periods ago: outside the ±1 window the plugin accepts.
    await typeCode(second, code(secret, -3));
    await expect(second.getByText(/incorrect/i)).toBeVisible();
    await expect(second).toHaveURL(/verify-totp/);

    // --- the right one reaches the dashboard ---
    await second.reload({ waitUntil: "domcontentloaded" });
    await typeCode(second, code(secret));
    await expect(second).not.toHaveURL(/verify-totp/, { timeout: 30_000 });
    await expect(second.getByRole("link", { name: /^pages$/i })).toBeVisible({ timeout: 30_000 });
    await second.context().close();

    // --- a session that only passed the password gets nothing, even from our own endpoints ---
    const passwordOnly = await api(`${TOTP_CMS}/api`, "/users/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }).then((r) => r.json());
    expect(passwordOnly.token).toBeTruthy();
    const pages = await api(`${TOTP_CMS}/api`, "/pages?limit=1", { token: passwordOnly.token });
    expect(pages.status).toBe(403);
    const dsrExport = await api(`${TOTP_CMS}/api`, "/dsr-export", {
      method: "POST",
      token: passwordOnly.token,
      body: JSON.stringify({ email: "nobody@example.com" }),
    });
    expect(dsrExport.status).toBe(403);
  } finally {
    await api(CMS_API, `/users/${memberId}`, { method: "DELETE", token: adminToken });
  }
});
