import { expect, test } from "@playwright/test";

import { unsubUrl } from "./fixtures";

/**
 * US3 smoke (T059). Uses the unsubscribe link for the lead captured by
 * `global-setup.ts` (or `E2E_UNSUB_URL` if you pass one). The gate is checked
 * inside each test — at runtime, after global-setup has written the fixture.
 */
test("a captured lead can withdraw consent without logging in, and the page never shows an email", async ({
  page,
}) => {
  const url = unsubUrl();
  test.skip(!url, "no captured-lead unsubscribe link (global-setup failed / stack down)");

  await page.goto(url!);
  await expect(page.getByRole("heading", { name: /retirer votre consentement/i })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("@"); // no email leaked
  await page.getByRole("button", { name: /confirmer le retrait/i }).click();
  await expect(page.getByRole("heading", { name: /consentement retiré/i })).toBeVisible();
});

test("an invalid token shows a neutral message", async ({ page }) => {
  const url = unsubUrl();
  test.skip(!url, "no captured-lead unsubscribe link (global-setup failed / stack down)");

  const bad = new URL(url!);
  bad.searchParams.set("token", "not.a.token");
  await page.goto(bad.toString());
  // 023 (US6): no lead to take a language from — the domain's default
  // language, else English (the e2e domain may have none).
  await expect(page.getByRole("heading", { name: /lien invalide|invalid link/i })).toBeVisible();
});
