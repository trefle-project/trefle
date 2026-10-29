import { expect, test } from "@playwright/test";

import { pageUrl, testClientIp } from "./fixtures";

/**
 * US1 smoke (T026). Needs the full stack up + a published page with a lead-form
 * block; `global-setup.ts` guarantees one at `<site>/e2e`.
 * Run: `npm --workspace @trefle/web run test:e2e:local` (or `:docker`).
 */
const PAGE_URL = pageUrl();

// The form token enforces a ≥2s fill time (anti-spam, FR-035); a real person
// takes longer, so wait it out before every submit.
const FILL_TIME = 2200;

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-real-ip": testClientIp() });
});

test("visitor submits the lead form with consent and sees a confirmation", async ({ page }) => {
  await page.goto(PAGE_URL);
  await page.getByLabel(/email/i).fill("e2e@example.com");
  await page.getByLabel(/pr[ée]nom/i).fill("Eve");
  await page.getByRole("checkbox").check(); // the consent control
  await page.waitForTimeout(FILL_TIME);
  await page.getByRole("button", { name: /envoyer/i }).click();
  await expect(page.getByText(/merci/i)).toBeVisible();
});

test("submitting without consent is rejected", async ({ page }) => {
  await page.goto(PAGE_URL);
  await page.getByLabel(/email/i).fill("e2e2@example.com");
  await page.getByLabel(/pr[ée]nom/i).fill("Eve");
  await page.waitForTimeout(FILL_TIME);
  await page.getByRole("button", { name: /envoyer/i }).click();
  await expect(page.getByText(/vous devez accepter/i)).toBeVisible();
});

test("the form still submits with JavaScript disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, extraHTTPHeaders: { "x-real-ip": testClientIp() } });
  const page = await context.newPage();
  await page.goto(PAGE_URL);
  await page.getByLabel(/email/i).fill("nojs@example.com");
  await page.getByLabel(/pr[ée]nom/i).fill("Eve");
  await page.getByRole("checkbox").check();
  await page.waitForTimeout(FILL_TIME);
  await page.getByRole("button", { name: /envoyer/i }).click();
  await expect(page.getByText(/merci/i)).toBeVisible();
  await context.close();
});
