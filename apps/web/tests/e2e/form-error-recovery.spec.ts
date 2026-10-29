import { expect, test } from "@playwright/test";

import { pageUrl, testClientIp } from "./fixtures";

/**
 * 009-lead-form-error-recovery — quickstart.md §1, §2, §4. Needs the full
 * stack up + the published page with a lead-form block (`email`,
 * `firstName`, consent) `global-setup.ts` seeds at `<site>/e2e-<run>`.
 *
 * No GTM/tagging assertions here on purpose: `gtm-consent.spec.ts`'s own
 * header comment documents that mutating the shared fixture domain's
 * `gtmContainerId`/`consentBannerEnabled` from more than one spec file
 * already caused real flakiness — quickstart.md §3's tagging check stays
 * manual instead of adding a second file racing the same domain fields.
 */
const PAGE_URL = pageUrl();

// The form token enforces a ≥2s fill time (anti-spam, FR-035); a real person
// takes longer, so wait it out before every submit.
const FILL_TIME = 2200;

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-real-ip": testClientIp() });
});

test("a missing required field redirects back with every other field preserved and only that field flagged", async ({ page }) => {
  await page.goto(PAGE_URL);
  const heroText = await page.getByRole("heading", { level: 1 }).textContent();

  await page.getByLabel(/email/i).fill("e2e-retry@example.com");
  // firstName left blank on purpose
  await page.getByRole("checkbox").check();
  await page.waitForTimeout(FILL_TIME);
  await page.getByRole("button", { name: /envoyer/i }).click();

  // Same page, not a separate generic error page (spec.md US2 AC1).
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(heroText ?? "");
  await expect(page.getByLabel(/email/i)).toHaveValue("e2e-retry@example.com");
  await expect(page.getByText(/le champ.*pr[ée]nom.*est requis/i)).toBeVisible();

  // Correct the missing field and resubmit — succeeds like a first attempt.
  // The consent checkbox is never pre-ticked, including here (lead-form.tsx's
  // own FR-015/020 — a re-render after an error is not an exception), so it
  // has to be re-checked even though every other field survived.
  await page.getByLabel(/pr[ée]nom/i).fill("Eve");
  await page.getByRole("checkbox").check();
  await page.waitForTimeout(FILL_TIME);
  await page.getByRole("button", { name: /envoyer/i }).click();
  await expect(page.getByText(/merci/i)).toBeVisible();
});

test("an invalid email is flagged inline while the invalid value itself and the other field survive", async ({ page }) => {
  await page.goto(PAGE_URL);
  await page.getByLabel(/email/i).fill("not-an-email");
  await page.getByLabel(/pr[ée]nom/i).fill("Eve");
  await page.getByRole("checkbox").check();
  await page.waitForTimeout(FILL_TIME);
  await page.getByRole("button", { name: /envoyer/i }).click();

  await expect(page.getByLabel(/email/i)).toHaveValue("not-an-email");
  await expect(page.getByLabel(/pr[ée]nom/i)).toHaveValue("Eve");
  await expect(page.getByText(/adresse email invalide/i)).toBeVisible();
});

test("missing consent is flagged next to the consent control while every typed field survives", async ({ page }) => {
  await page.goto(PAGE_URL);
  await page.getByLabel(/email/i).fill("e2e-consent@example.com");
  await page.getByLabel(/pr[ée]nom/i).fill("Eve");
  // consent left unchecked on purpose
  await page.waitForTimeout(FILL_TIME);
  await page.getByRole("button", { name: /envoyer/i }).click();

  await expect(page.getByLabel(/email/i)).toHaveValue("e2e-consent@example.com");
  await expect(page.getByLabel(/pr[ée]nom/i)).toHaveValue("Eve");
  await expect(page.getByText(/vous devez accepter/i)).toBeVisible();
});
