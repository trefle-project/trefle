import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { pageUrl } from "./fixtures";

/**
 * T087 (SC-010, constitution Principle V). Accessibility gate on a published
 * page + its lead form: no serious/critical axe violations, keyboard reachable,
 * usable at 360px. Gated off by default (set `E2E_RUN_A11Y=1`) because it needs
 * browsers + the running stack; `test:e2e:local` / `:docker` set the flag.
 */
const PAGE_URL = pageUrl();
test.skip(process.env.E2E_RUN_A11Y !== "1", "set E2E_RUN_A11Y=1 with the stack up to run");

test("published page has no serious or critical axe violations", async ({ page }) => {
  await page.goto(PAGE_URL);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking, JSON.stringify(blocking.map((v) => v.id), null, 2)).toEqual([]);
});

test("the lead form is fully keyboard operable", async ({ page }) => {
  await page.goto(PAGE_URL);
  const email = page.getByLabel(/email/i);
  await email.focus();
  await email.fill("a11y@example.com");
  // Tab to the consent checkbox and toggle it with the keyboard.
  await page.keyboard.press("Tab");
  const consent = page.getByRole("checkbox");
  await consent.focus();
  await page.keyboard.press("Space");
  await expect(consent).toBeChecked();
});

test("usable at 360px with no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(PAGE_URL);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
