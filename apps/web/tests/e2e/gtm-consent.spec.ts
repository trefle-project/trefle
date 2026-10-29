import { expect, test } from "@playwright/test";

import { adminToken, pageUrl, siteHost, testClientIp, unsubUrl } from "./fixtures";

/**
 * 007-gtm-tagging, User Stories 1, 2 & 3 (T019, T026, T027). Needs the full
 * stack up + the same published fixture page `us1-capture.spec.ts` relies
 * on (`global-setup.ts` guarantees one). Directly flips the fixture
 * domain's `gtmContainerId`/`consentBannerEnabled` via the CMS REST API
 * around each test, restoring the domain to "banner on, no container"
 * afterwards so other specs (a11y.spec.ts, us1-capture.spec.ts) see the
 * same default state they already pass against.
 *
 * All three stories share this one file (rather than three) deliberately:
 * all mutate or depend on the same shared fixture domain's tagging fields,
 * and Playwright runs separate spec *files* across parallel workers by
 * default — two files racing to PATCH the same domain caused real
 * cross-file interference during development. Tests within one file run
 * sequentially, which avoids it without inventing a second dedicated
 * fixture domain.
 * Run: `npm --workspace @trefle/web run test:e2e:local` (or `:docker`).
 */
const PAGE_URL = pageUrl();
const SITE_HOST = siteHost();
const CMS_API = process.env.CMS_API_URL ?? "http://localhost:3000/api";

let domainId: string | number;
let authHeaders: Record<string, string>;

const BANNER_PRESENT = (html: string) => html.includes("Préférences cookies");
const BANNER_ABSENT = (html: string) => !BANNER_PRESENT(html);

/**
 * Patches the fixture domain, then polls the public page over plain HTTP
 * until `settled` sees the change — ISR + tag revalidation here is
 * eventually consistent (the CMS's domain-changed revalidation is
 * fire-and-forget, and the first request after a `revalidateTag` can still
 * serve the previous stale render under stale-while-revalidate before a
 * follow-up request gets the fresh one). Polling avoids a flaky fixed
 * sleep and avoids baking a many-second wait into every call.
 *
 * `settled` can only observe what a plain, JS-free HTTP fetch sees — the
 * consent-banner text (a real SSR'd element) works; the GTM `<script>`
 * itself does not, because `next/script`'s `afterInteractive` strategy
 * injects it client-side after hydration, never into the raw server HTML
 * (see the browser-based checks near the end of this file for that).
 */
async function patchDomain(data: Record<string, unknown>, settled: (html: string) => boolean) {
  await fetch(`${CMS_API}/domains/${domainId}`, { method: "PATCH", headers: authHeaders, body: JSON.stringify(data) });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const html = await fetch(PAGE_URL).then((r) => r.text());
    if (settled(html)) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("patchDomain: renderer never reflected the change within 15s");
}

test.beforeAll(async ({ browser }) => {
  const token = await adminToken();
  authHeaders = { authorization: `JWT ${token}`, "content-type": "application/json" };

  const dq = await fetch(`${CMS_API}/domains?where[hostname][equals]=${SITE_HOST}&limit=1`, {
    headers: authHeaders,
  }).then((r) => r.json() as Promise<{ docs: { id: string | number }[] }>);
  domainId = dq.docs[0]!.id;

  // A real container id isn't needed to prove the banner/Consent Mode
  // mechanics — only that a container is *configured* (spec.md US1 AC1-5).
  await patchDomain({ gtmContainerId: "GTM-E2ETEST", consentBannerEnabled: true }, BANNER_PRESENT);

  // Pay this local stack's cold-ISR-regeneration cost exactly once, here,
  // with a generous timeout — rather than in every individual test that
  // needs `gtmContainerId` to be live, which is what caused real flakiness
  // during development (the *value* of this field isn't observable via a
  // plain HTTP fetch at all — see `patchDomain`'s doc comment — so only a
  // real browser check can confirm it's actually warm).
  const warmupPage = await browser.newPage();
  await warmupPage.goto(PAGE_URL, { timeout: 60_000 });
  await warmupPage.waitForFunction(() => document.getElementById("tf-gtm") !== null, undefined, { timeout: 180_000 });
  await warmupPage.close();
});

test.afterAll(async () => {
  // Leave the fixture domain exactly as other specs (a11y.spec.ts,
  // us1-capture.spec.ts) expect it: banner on (the schema default), no
  // container configured.
  await patchDomain({ gtmContainerId: null, consentBannerEnabled: true }, BANNER_PRESENT);
});

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
  await context.setExtraHTTPHeaders({ "x-real-ip": testClientIp() });
});

test("banner appears on first visit, before any consent-gated cookie is set", async ({ page, context }) => {
  await page.goto(PAGE_URL);
  await expect(page.getByRole("region")).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "tf_consent")).toBeUndefined();
});

test("reject sets no consent-gated cookie and the lead form still submits", async ({ page, context }) => {
  await page.goto(PAGE_URL);
  await page.getByRole("button", { name: /refuser/i }).click();
  const cookies = await context.cookies();
  const consent = cookies.find((c) => c.name === "tf_consent");
  expect(consent?.value).toMatch(/rejected/);

  await page.getByLabel(/email/i).fill("gtm-reject@example.com");
  await page.getByLabel(/pr[ée]nom/i).fill("Eve");
  await page.getByRole("checkbox").check();
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: /envoyer/i }).click();
  await expect(page.getByText(/merci/i)).toBeVisible();
});

test("accept sets the consent cookie and updates Consent Mode without a reload", async ({ page, context }) => {
  await page.goto(PAGE_URL);
  await page.getByRole("button", { name: /^accepter$/i }).click();
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "tf_consent")?.value).toMatch(/accepted/);

  // The `gtag` shim pushes an `arguments` object (array-like, not a real
  // Array) — index into it rather than assuming Array.isArray.
  const dataLayer = await page.evaluate(() => window.dataLayer as unknown as Record<string, unknown>[]);
  const consentUpdate = (dataLayer ?? []).find((entry) => entry?.[0] === "consent" && entry?.[1] === "update");
  const payload = consentUpdate?.[2] as { analytics_storage?: string } | undefined;
  expect(payload?.analytics_storage).toBe("granted");
});

test("a prior choice persists across reloads — the banner does not reappear", async ({ page }) => {
  await page.goto(PAGE_URL);
  await page.getByRole("button", { name: /^accepter$/i }).click();
  await expect(page.getByRole("region")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region")).toHaveCount(0);
});

test("the revisit control reopens the banner and a new choice overrides the old one", async ({ page, context }) => {
  await page.goto(PAGE_URL);
  await page.getByRole("button", { name: /^accepter$/i }).click();
  await page.getByRole("button", { name: /pr[ée]f[ée]rences/i }).click();
  await expect(page.getByRole("region")).toBeVisible();
  await page.getByRole("button", { name: /refuser/i }).click();
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "tf_consent")?.value).toMatch(/rejected/);
});

test("disabling the banner toggle hides it even with a container configured", async ({ page }) => {
  await patchDomain({ consentBannerEnabled: false }, BANNER_ABSENT);
  try {
    await page.goto(PAGE_URL);
    await expect(page.getByRole("region")).toHaveCount(0);
  } finally {
    await patchDomain({ consentBannerEnabled: true }, BANNER_PRESENT);
  }
});

/**
 * `gtmContainerId` isn't observable via a plain HTTP fetch at all (research.md
 * §7's `afterInteractive` correction) — this check needs a real browser.
 * `beforeAll`'s warmup already paid the cold-ISR-regeneration cost for
 * `GTM-E2ETEST` (the id it set), so this just confirms the already-warm
 * page's content. Deliberately no automated "removal" test here: on this
 * local dev stack, the *removal* direction (container id → null) was
 * observed taking anywhere from ~15s to several minutes to re-warm — a
 * characteristic of this sandbox's synchronous cold-regeneration behavior
 * under heavy test churn, not a product defect (confirmed correct via
 * direct DB + curl inspection during development). That direction stays a
 * manual quickstart.md §4 check (spec.md US2 AC2/AC3) rather than a flaky
 * automated one.
 */
test("a configured container renders the GTM head script and noscript fallback", async ({ page }) => {
  await page.goto(PAGE_URL);
  await expect(page.locator("#tf-gtm")).toHaveCount(1);

  const gtmScript = await page.locator("#tf-gtm").innerHTML();
  expect(gtmScript).toContain("GTM-E2ETEST");
  expect(gtmScript).toContain("googletagmanager.com/gtm.js");

  // <noscript> content is an unparsed text node while JS is enabled (per the
  // HTML spec) — read it as text rather than querying a child element.
  const noscriptHtml = await page.locator("noscript").first().textContent();
  expect(noscriptHtml).toContain("https://www.googletagmanager.com/ns.html?id=GTM-E2ETEST");
});

/**
 * User Story 3 (T027, contracts/datalayer-events.md). Reuses the domain
 * state the previous test already established (`gtmContainerId` set,
 * `consentBannerEnabled` true) — dataLayer pushes only fire when a
 * container is configured (Tagging.tsx), and no further domain patch (and
 * therefore no further ISR wait) is needed for these.
 */
type DataLayerEntry = Record<string, unknown>;
const dataLayerOf = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.dataLayer as unknown as DataLayerEntry[]);

/**
 * `next/script`'s `afterInteractive` scripts execute asynchronously after
 * hydration — reading `window.dataLayer` immediately after `page.goto()`
 * resolves can race ahead of them. Wait for the specific event to actually
 * land instead of checking once.
 */
async function waitForDataLayerEvent(page: import("@playwright/test").Page, event: string): Promise<DataLayerEntry> {
  await page.waitForFunction(
    (evt) => (window.dataLayer as unknown as DataLayerEntry[] | undefined)?.some((e) => e.event === evt),
    event,
    { timeout: 10_000 },
  );
  const dataLayer = (await dataLayerOf(page)) ?? [];
  return dataLayer.find((e) => e.event === event)!;
}

test("page_view and lead_form_view fire on a normal page load", async ({ page }) => {
  await page.goto(PAGE_URL);
  const pageView = await waitForDataLayerEvent(page, "page_view");
  expect(pageView.domain).toBe(SITE_HOST);
  await waitForDataLayerEvent(page, "lead_form_view");
});

test("a rejected submission pushes lead_form_submit_error with a non-personal reason", async ({ page }) => {
  await page.goto(PAGE_URL);
  await page.getByRole("button", { name: /refuser/i }).click(); // dismiss the banner so it doesn't cover the submit button
  await page.getByLabel(/email/i).fill("not-an-email");
  await page.getByRole("checkbox").check(); // consent ticked, so only the email validation fails
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: /envoyer/i }).click();
  const error = await waitForDataLayerEvent(page, "lead_form_submit_error");
  expect(error.reason).toBe("validation_failed");
  expect(JSON.stringify(await dataLayerOf(page))).not.toContain("not-an-email");
});

test("a successful submission pushes lead_form_submit_success", async ({ page }) => {
  await page.goto(PAGE_URL);
  await page.getByRole("button", { name: /refuser/i }).click();
  await page.getByLabel(/email/i).fill("gtm-datalayer@example.com");
  await page.getByLabel(/pr[ée]nom/i).fill("Eve");
  await page.getByRole("checkbox").check();
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: /envoyer/i }).click();
  await expect(page.getByText(/merci/i)).toBeVisible();
  await waitForDataLayerEvent(page, "lead_form_submit_success");
});

test("completing the unsubscribe flow pushes unsubscribe_complete", async ({ page }) => {
  const url = unsubUrl();
  test.skip(!url, "no E2E_UNSUB_URL/fixture available");
  await page.goto(url!);
  await page.getByRole("button", { name: /confirmer le retrait/i }).click();
  await waitForDataLayerEvent(page, "unsubscribe_complete");
});

// Last on purpose: unlike every other patchDomain call in this file, this
// one clears `gtmContainerId` and is never restored — nothing after it
// needs the container warm, and `afterAll` resets to this same state
// anyway (spec.md US1 AC7).
test("enabling the banner with no container configured still shows it", async ({ page }) => {
  await patchDomain({ gtmContainerId: null, consentBannerEnabled: true }, BANNER_PRESENT);
  await page.goto(PAGE_URL);
  await expect(page.getByRole("region")).toBeVisible();
});
