import { expect, test } from "@playwright/test";

import { pageUrl, testClientIp, unsubUrl } from "./fixtures";

/**
 * 020-edge-html-cache, US2 (T029) — what the edge Worker must not change for a
 * visitor. Runs in both modes: `npm run test:e2e:docker` (renderer direct) and
 * `npm run test:e2e:docker:edge` (through the local Worker); the edge-only
 * assertions are skipped in the first. Behaviour already covered by the rest
 * of the suite run through the Worker (consent-gated custom code, GTM
 * dataLayer, A/B, unsubscribe flow) is not repeated here.
 *
 * Local `wrangler dev` does not cache: what depends on the edge cache itself
 * (HIT, an RSC request never stored) is checked on the test host (quickstart
 * V2, V6).
 */
const EDGE = process.env.E2E_EDGE === "1";
const PAGE_URL = pageUrl();
const FILL_TIME = 3000;

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-real-ip": testClientIp() });
});

const nonceOf = (html: string) => [...new Set([...html.matchAll(/nonce="([^"]+)"/g)].map((m) => m[1]))];
const tokenOf = (html: string) => /name="formToken" value="([^"]+)"/.exec(html)?.[1];
/**
 * What a visitor sees — the page body up to the end of the lead form — with
 * this visit's values blanked, to compare two visits. Not the whole document:
 * React streams its Suspense boundaries inline or later (`$RC(…)` scripts)
 * depending on timing, so two renders of the same page differ there anyway.
 */
const normalised = (html: string) => {
  let out = /<div class="trefle-page-shell"[^>]*>[\s\S]*?<\/form>/.exec(html)?.[0] ?? "";
  for (const value of [...nonceOf(html), tokenOf(html)]) if (value) out = out.replaceAll(value, "VISIT");
  return out;
};

test("two visits get their own nonce and form token, and otherwise the same page", async ({ request }) => {
  const a = await request.get(PAGE_URL);
  const b = await request.get(PAGE_URL);
  expect(a.status()).toBe(200);
  const [htmlA, htmlB] = [await a.text(), await b.text()];

  expect(htmlA).not.toContain("TFEDGE");
  expect(htmlB).not.toContain("TFEDGE");
  // One nonce per page, also the one in the CSP header.
  expect(nonceOf(htmlA)).toHaveLength(1);
  expect(a.headers()["content-security-policy"]).toContain(`'nonce-${nonceOf(htmlA)[0]}'`);
  expect(nonceOf(htmlA)[0]).not.toBe(nonceOf(htmlB)[0]);
  expect(tokenOf(htmlA)).toBeTruthy();
  expect(tokenOf(htmlA)).not.toBe(tokenOf(htmlB));
  expect(normalised(htmlA)).not.toBe("");
  expect(normalised(htmlA)).toBe(normalised(htmlB));

  if (EDGE) {
    expect(a.headers()["x-trefle-edge-served"]).toBe("1");
    expect(a.headers()["cache-control"]).toBe("private, no-store");
    expect(a.headers()["set-cookie"]).toBeUndefined();
    for (const name of ["x-trefle-ab", "cache-tag", "x-middleware-rewrite"]) expect(a.headers()[name], name).toBeUndefined();
  }
});

test("without JavaScript, a submit after 3 s is accepted and one under 2 s is refused", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, extraHTTPHeaders: { "x-real-ip": testClientIp() } });
  const page = await context.newPage();

  await page.goto(PAGE_URL);
  await page.getByLabel(/email/i).fill("edge-fast@example.com");
  await page.getByLabel(/pr[ée]nom/i).fill("Eve");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /envoyer/i }).click();
  await expect(page.getByText(/réessayer dans quelques secondes/i)).toBeVisible();

  await page.goto(PAGE_URL);
  await page.getByLabel(/email/i).fill("edge-nojs@example.com");
  await page.getByLabel(/pr[ée]nom/i).fill("Eve");
  await page.getByRole("checkbox").check();
  await page.waitForTimeout(FILL_TIME);
  await page.getByRole("button", { name: /envoyer/i }).click();
  await expect(page.getByText(/merci/i)).toBeVisible();
  await context.close();
});

test("per-visitor pages are never served from the edge", async ({ request }) => {
  const base = new URL(PAGE_URL).origin;
  const paths = ["/preview/1?t=x", "/form-retry", "/confirm?token=x", "/unsubscribe?token=x"];
  const unsub = unsubUrl();
  if (unsub) paths.push(new URL(unsub).pathname + new URL(unsub).search);
  for (const path of paths) {
    const res = await request.get(`${base}${path}`, { maxRedirects: 0 });
    expect(res.headers()["x-trefle-edge-served"], path).toBeUndefined();
  }
});

test("a client-navigation (RSC) request is passed through, and the next visit still gets the page", async ({ request }) => {
  const rsc = await request.get(PAGE_URL, { headers: { RSC: "1" } });
  expect(rsc.headers()["x-trefle-edge-served"]).toBeUndefined();
  const next = await request.get(PAGE_URL);
  expect(next.headers()["content-type"]).toContain("text/html");
  expect(await next.text()).toContain('name="formToken"');
});
