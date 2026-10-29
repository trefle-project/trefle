import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { adminToken, testClientIp } from "./fixtures";

/**
 * 016-carousel-block — the published « Carrousel » block (User Stories 1 and
 * 2). Pages are created via the CMS REST API with the exact markup of
 * specs/016-carousel-block/contracts/markup.md (same pattern as
 * us-layout-blocks.spec.ts): 4 slides of different heights, a link in slide
 * 2, and the lead form below the carousel. A second page holds a carousel of
 * text and images only (nothing focusable in the slides) for axe's
 * scrollable-region-focusable rule. A third, draft page is opened in the
 * admin editor to add a carousel with the block library (click-to-add:
 * Playwright can't drive GrapesJS's HTML5 drag into the canvas iframe).
 */
const CMS_API = process.env.CMS_API_URL ?? "http://localhost:3000/api";
const BASE = process.env.E2E_BASE_URL ?? "http://site-a.localhost:3001";
const SITE_HOST = process.env.E2E_SITE_HOST ?? "site-a.localhost";
const CMS_URL = process.env.CMS_URL ?? "http://localhost:3000";
const ADMIN_URL = process.env.CMS_ADMIN_URL ?? `${CMS_URL}/admin`;

const RUN = Date.now().toString(36);
const PATH = `/e2e-carousel-${RUN}`;
const PLAIN_PATH = `/e2e-carousel-plain-${RUN}`;
const EDIT_PATH = `/e2e-carousel-edit-${RUN}`;
const AUTO_PATH = `/e2e-carousel-auto-${RUN}`;
const EDIT_HEADING = `Édition carrousel ${RUN}`;

const heading = (n: number) => `Diapo ${n} ${RUN}`;
const slide = (inner: string) => `<div data-block="carousel-slide" style="padding:24px">${inner}</div>`;
const SLIDES = [
  slide(`<h2>${heading(1)}</h2><p>Court.</p>`),
  slide(`<h2>${heading(2)}</h2><p>Plus long.</p><p>Encore.</p><p><a href="#form">Lien de la diapositive 2</a></p>`),
  slide(`<h2>${heading(3)}</h2><p>Moyen.</p><p>Moyen.</p>`),
  slide(`<h2>${heading(4)}</h2><p>Fin.</p>`),
];
const HTML =
  `<section data-block="carousel" aria-label="Avis clients">${SLIDES.join("")}</section>` +
  '<div data-block="lead-form" id="form" style="padding:24px;max-width:480px;margin:0 auto"></div>';
const PLAIN_HTML =
  '<section data-block="carousel">' +
  slide(`<h2>Texte ${RUN}</h2><p>Seulement du texte.</p>`) +
  slide('<img src="data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=\'http://www.w3.org/2000/svg\'%20width=\'4\'%20height=\'2\'/%3E" alt="Illustration" width="400" height="200">') +
  "</section>" +
  '<div data-block="lead-form" id="form"></div>';

// User Story 3: 3 visible on large screens, autoplay every 3 s, no dots.
const AUTO_HTML =
  '<section data-block="carousel" data-per-view="3" data-autoplay="3" data-dots="false">' +
  [1, 2, 3, 4, 5].map((n) => slide(`<h2>Auto ${n} ${RUN}</h2>`)).join("") +
  "</section>" +
  '<div data-block="lead-form" id="form"></div>';

const FORM = {
  fields: [{ name: "email", label: "Email", type: "email", required: true }],
  submitLabel: "Envoyer",
  successMessage: `Merci carrousel ${RUN}`,
  consentPurposeText: "J'accepte d'être recontacté(e).",
  privacyNoticeUrl: "/privacy",
  privacyNoticeVersion: "2026-01",
};

/** projectData as the editor stores it — the publish guard counts blocks from it. */
const projectData = (slides: number) => ({
  pages: [
    {
      frames: [
        {
          component: {
            type: "wrapper",
            components: [
              {
                type: "trefle-carousel",
                tagName: "section",
                attributes: { "data-block": "carousel" },
                components: Array.from({ length: slides }, () => ({
                  type: "trefle-carousel-slide",
                  tagName: "div",
                  attributes: { "data-block": "carousel-slide" },
                })),
              },
              { tagName: "div", attributes: { "data-block": "lead-form", id: "form" } },
            ],
          },
        },
      ],
    },
  ],
});

async function findOrCreate(auth: HeadersInit, collection: string, where: string, data: object) {
  const found = (await fetch(`${CMS_API}/${collection}?${where}&limit=1`, { headers: auth }).then((r) => r.json())) as {
    docs: { id: string | number }[];
  };
  if (found.docs[0]) return found.docs[0].id;
  const created = (await fetch(`${CMS_API}/${collection}`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify(data),
  }).then((r) => r.json())) as { doc: { id: string | number } };
  return created.doc.id;
}

let ready = false;
let token: string | undefined;
let editPageId: string | number | undefined;

test.beforeAll(async () => {
  token = await adminToken();
  if (!token) return;
  const auth = { authorization: `JWT ${token}`, "content-type": "application/json" };
  const domain = await findOrCreate(auth, "domains", `where[hostname][equals]=${SITE_HOST}`, {
    hostname: SITE_HOST,
    isActive: true,
    label: SITE_HOST,
  });
  const language = await findOrCreate(auth, "languages", "where[code][equals]=fr", { code: "fr", label: "Français", isActive: true });
  for (const [path, html, slides] of [
    [PATH, HTML, 4],
    [PLAIN_PATH, PLAIN_HTML, 2],
    [AUTO_PATH, AUTO_HTML, 5],
  ] as const) {
    const res = await fetch(`${CMS_API}/pages`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        title: `E2E carrousel ${path}`,
        domain,
        language,
        path,
        status: "published",
        builder: { projectData: projectData(slides), html, css: "" },
        form: FORM,
      }),
    });
    if (!res.ok) throw new Error(`could not create carousel fixture page: ${res.status} ${await res.text()}`);
  }
  const hero = {
    tagName: "section",
    attributes: { "data-block": "hero" },
    style: { padding: "64px 24px" },
    components: [{ tagName: "h1", components: [{ type: "textnode", content: EDIT_HEADING }] }],
  };
  const res = await fetch(`${CMS_API}/pages`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      title: `E2E carrousel édition ${RUN}`,
      domain,
      language,
      path: EDIT_PATH,
      status: "draft",
      builder: {
        projectData: { pages: [{ frames: [{ component: { type: "wrapper", components: [hero] } }] }] },
        html: `<section data-block="hero" style="padding:64px 24px"><h1>${EDIT_HEADING}</h1></section>`,
        css: "",
      },
      form: FORM,
    }),
  });
  if (!res.ok) throw new Error(`could not create carousel editor page: ${res.status} ${await res.text()}`);
  editPageId = ((await res.json()) as { doc: { id: string | number } }).doc.id;
  ready = true;
});

const slideHeading = (page: Page, n: number) => page.locator("h2", { hasText: heading(n) });
const track = (page: Page) => page.locator('[aria-roledescription="carrousel"] [tabindex="0"]');
/** The slide fills the carousel's width: it is the one shown. */
const expectShown = (page: Page, n: number) => expect(slideHeading(page, n)).toBeInViewport({ ratio: 0.9 });

async function openCarousel(page: Page) {
  test.skip(!ready, "no admin token — stack not up / not seeded");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}${PATH}`);
  // Controls appear once the component is mounted.
  await expect(page.getByRole("button", { name: "Diapositive suivante" })).toBeVisible();
}

// --- User Story 1 -------------------------------------------------------

test("arrows move between slides and wrap around", async ({ page }) => {
  await openCarousel(page);
  await expectShown(page, 1);
  const next = page.getByRole("button", { name: "Diapositive suivante" });
  for (const n of [2, 3, 4, 1]) {
    await next.click();
    await expectShown(page, n);
  }
  await page.getByRole("button", { name: "Diapositive précédente" }).click();
  await expectShown(page, 4);
});

test("a dot shows its slide and is marked current", async ({ page }) => {
  await openCarousel(page);
  const dot3 = page.getByRole("button", { name: "Aller à la diapositive 3" });
  await dot3.click();
  await expectShown(page, 3);
  await expect(dot3).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "Aller à la diapositive 1" })).not.toHaveAttribute("aria-current", "true");
});

/** A one-finger swipe through the Chrome DevTools protocol (Playwright has no swipe API). */
async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  const point = (p: { x: number; y: number }) => [{ x: Math.round(p.x), y: Math.round(p.y) }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from) });
  for (let i = 1; i <= 10; i++) {
    const p = { x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(p) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function mobilePage(browser: Browser) {
  // Short screen: the page must be taller than it for the vertical-swipe check.
  const context = await browser.newContext({ viewport: { width: 390, height: 400 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(`${BASE}${PATH}`);
  await expect(page.getByRole("button", { name: "Diapositive suivante" })).toBeVisible();
  return page;
}

test("a horizontal swipe changes slide on a phone", async ({ browser }) => {
  test.skip(!ready, "no admin token — stack not up / not seeded");
  const page = await mobilePage(browser);
  const box = (await track(page).boundingBox())!; // the track is rendered: openCarousel waited for it
  const y = box.y + box.height / 2;
  await swipe(page, { x: box.x + box.width * 0.8, y }, { x: box.x + box.width * 0.1, y });
  await expectShown(page, 2);
  await page.context().close();
});

test("a vertical swipe on the carousel still scrolls the page", async ({ browser }) => {
  test.skip(!ready, "no admin token — stack not up / not seeded");
  const page = await mobilePage(browser);
  const box = (await track(page).boundingBox())!; // see above
  const x = box.x + box.width / 2;
  expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
  await swipe(page, { x, y: box.y + box.height * 0.8 }, { x, y: box.y + box.height * 0.1 });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  // …and does not change slide.
  expect(await track(page).evaluate((el) => el.scrollLeft)).toBe(0);
  await page.context().close();
});

test("the lead form below the carousel still submits", async ({ page }) => {
  await openCarousel(page);
  await page.setExtraHTTPHeaders({ "x-real-ip": testClientIp() });
  const form = page.locator("#form");
  await form.getByLabel(/email/i).fill(`e2e-carousel-${RUN}@example.com`);
  await form.getByRole("checkbox").check();
  await page.waitForTimeout(2500); // clear the minimum fill-time window
  await form.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByText(`Merci carrousel ${RUN}`)).toBeVisible();
});

// --- User Story 2 -------------------------------------------------------

const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el ? (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim() : "";
  });

test("keyboard: the track, then ‹ dots ›; never a hidden slide's link", async ({ page }) => {
  await openCarousel(page);
  await track(page).focus();
  const order: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    order.push(await focused(page));
  }
  // The controls' visual order: ‹ • • • • ›.
  expect(order.slice(0, 6)).toEqual([
    "Diapositive précédente",
    "Aller à la diapositive 1",
    "Aller à la diapositive 2",
    "Aller à la diapositive 3",
    "Aller à la diapositive 4",
    "Diapositive suivante",
  ]);
  expect(order).not.toContain("Lien de la diapositive 2");

  // On slide 2, its link is reachable.
  await page.getByRole("button", { name: "Aller à la diapositive 2" }).click();
  await expectShown(page, 2);
  await track(page).focus();
  await page.keyboard.press("Tab");
  expect(await focused(page)).toBe("Lien de la diapositive 2");
});

test("the focused track scrolls with the arrow keys", async ({ page }) => {
  await openCarousel(page);
  await track(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => track(page).evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
});

test("reduced motion: the slide changes at once, without animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCarousel(page);
  const width = await track(page).evaluate((el) => el.clientWidth);
  await page.getByRole("button", { name: "Diapositive suivante" }).click();
  // No smooth scroll: the very next frame is already at the target.
  const left = await track(page).evaluate(
    (el) => new Promise<number>((resolve) => requestAnimationFrame(() => resolve(el.scrollLeft))),
  );
  expect(left).toBe(width);
});

test("without JavaScript every slide is reachable by scrolling, and no button is shown", async ({ browser }) => {
  test.skip(!ready, "no admin token — stack not up / not seeded");
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}${PATH}`);
  await expect(page.locator('[aria-roledescription="carrousel"] button')).toHaveCount(0);
  for (const n of [1, 2, 3, 4]) {
    await slideHeading(page, n).scrollIntoViewIfNeeded();
    await expectShown(page, n);
  }
  await context.close();
});

test("changing slide never moves the content below", async ({ page }) => {
  await openCarousel(page);
  const form: Locator = page.locator("#form");
  const before = (await form.boundingBox())!.y; // rendered below the carousel
  for (const n of [2, 3]) {
    await page.getByRole("button", { name: `Aller à la diapositive ${n}` }).click();
    await expectShown(page, n);
    expect((await form.boundingBox())!.y).toBe(before);
  }
});

for (const [name, path] of [
  ["carousel page", PATH],
  ["text-and-image-only carousel", PLAIN_PATH],
] as const) {
  test(`${name} has no serious or critical axe violations`, async ({ page }) => {
    test.skip(!ready, "no admin token — stack not up / not seeded");
    test.skip(process.env.E2E_RUN_A11Y !== "1", "set E2E_RUN_A11Y=1 with the stack up to run");
    await page.goto(`${BASE}${path}`);
    await expect(page.locator('[aria-roledescription="carrousel"][data-ready]')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking, JSON.stringify(blocking.map((v) => v.id), null, 2)).toEqual([]);
  });
}

// --- Editor (User Story 1, contracts/editor.md) ------------------------------

/** Admin requests carry the suite's JWT (fixtures.ts; cookies fail on host.docker.internal). */
async function signIn(context: BrowserContext) {
  await context.route(`${CMS_URL}/**`, (route) => {
    const request = route.request();
    if (!["document", "fetch", "xhr"].includes(request.resourceType())) return route.continue();
    return route.continue({ headers: { ...request.headers(), authorization: `JWT ${token}` } });
  });
}

test("editor: the block adds a carousel shown one slide at a time, browsed and extended from its toolbar", async ({ browser }) => {
  test.skip(!ready || !editPageId, "no admin token — stack not up / not seeded");
  // The Payload admin is the slowest page of the stack to load when the
  // suite runs in parallel (~2 s alone, over 30 s under load).
  test.setTimeout(60_000);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await signIn(context);
  const page = await context.newPage();
  await page.goto(`${ADMIN_URL}/collections/pages/${editPageId}`);
  const canvas = page.frameLocator(".gjs-frame");
  await expect(canvas.locator("h1", { hasText: EDIT_HEADING })).toBeVisible({ timeout: 40_000 });

  await canvas.locator('section[data-block="hero"]').click({ position: { x: 5, y: 5 } });
  // Selecting opens the style panel asynchronously; under load that can land
  // after our click on « Open Blocks » and hide the library again.
  const tile = page.locator(".gjs-block", { hasText: "Carrousel" });
  await expect(async () => {
    if (!(await tile.isVisible())) await page.locator('.gjs-pn-btn.fa-th-large').click();
    await expect(tile).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await tile.click();

  // Right after the hero, selected, one slide of three on screen.
  const carousel = canvas.locator('section[data-block="hero"] + section[data-block="carousel"]');
  await expect(carousel).toHaveAttribute("data-tf-label", "Diapositive 1 / 3");
  await expect(carousel.locator('[data-block="carousel-slide"]:visible')).toHaveCount(1);
  await expect(carousel.getByText("Diapositive 1", { exact: true })).toBeVisible();

  const tool = (title: string) => page.locator(`.gjs-toolbar [title="${title}"]`);
  await tool("Diapositive suivante").click();
  await expect(carousel).toHaveAttribute("data-tf-label", "Diapositive 2 / 3");
  await expect(carousel.getByText("Diapositive 2", { exact: true })).toBeVisible();
  await expect(carousel.getByText("Diapositive 1", { exact: true })).toBeHidden();

  await tool("Ajouter une diapositive").click();
  await expect(carousel).toHaveAttribute("data-tf-label", "Diapositive 3 / 4");
  await expect(carousel.locator('[data-block="carousel-slide"]:visible')).toHaveCount(1);
  await tool("Diapositive précédente").click();
  await expect(carousel).toHaveAttribute("data-tf-label", "Diapositive 2 / 4");

  const saved = page.waitForResponse((r) => r.url().includes(`/api/pages/${editPageId}`) && r.request().method() === "PATCH", {
    timeout: 20_000,
  });
  await page.locator("#action-save").click();
  expect((await saved).status()).toBe(200);
  await context.close();

  const stored = (await fetch(`${CMS_API}/pages/${editPageId}?depth=0`, { headers: { authorization: `JWT ${token}` } }).then((r) =>
    r.json(),
  )) as { builder: { html: string; blockCount: { byType: Record<string, number> } } };
  expect(stored.builder.html).not.toContain("data-tf-");
  expect(stored.builder.html.match(/data-block="carousel-slide"/g)).toHaveLength(4);
  expect(stored.builder.blockCount.byType).toMatchObject({ carousel: 1, "carousel-slide": 4 });
});

// --- User Story 3 -------------------------------------------------------

const autoHeading = (page: Page, n: number) => page.locator("h2", { hasText: `Auto ${n} ${RUN}` });
const scrollLeft = (page: Page) => track(page).evaluate((el) => el.scrollLeft);
/** Under load a tick may land just before the action under test, and its
 * smooth scroll can outlast any fixed delay: wait until the position holds
 * still, then check nothing moves for 4 s. */
async function expectStill(page: Page) {
  let start = await scrollLeft(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(300);
    const now = await scrollLeft(page);
    if (now === start) break;
    start = now;
  }
  await page.waitForTimeout(4_000);
  expect(await scrollLeft(page)).toBe(start);
}

async function openAuto(page: Page, width = 1280) {
  test.skip(!ready, "no admin token — stack not up / not seeded");
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}${AUTO_PATH}`);
  await expect(page.locator('[aria-roledescription="carrousel"][data-ready]')).toBeVisible();
}

test("3 slides side by side on a computer, no dots, and it rotates on its own", async ({ page }) => {
  await openAuto(page);
  for (const n of [1, 2, 3]) await expect(autoHeading(page, n)).toBeInViewport({ ratio: 0.9 });
  await expect(autoHeading(page, 4)).not.toBeInViewport();
  await expect(page.getByRole("button", { name: /Aller à la diapositive/ })).toHaveCount(0);
  await page.mouse.move(0, 890); // keep the pointer off the carousel
  await expect.poll(() => scrollLeft(page), { timeout: 6_000 }).toBeGreaterThan(0);
});

test("hovering the carousel holds the rotation", async ({ page }) => {
  await openAuto(page);
  await track(page).hover();
  await expectStill(page);
});

test("« Mettre en pause » stops the rotation until « Reprendre le défilement »", async ({ page }) => {
  await openAuto(page);
  await page.getByRole("button", { name: "Mettre en pause" }).click();
  await page.mouse.move(0, 890);
  await expectStill(page);
  const paused = await scrollLeft(page);
  await page.getByRole("button", { name: "Reprendre le défilement" }).click();
  await page.mouse.move(0, 890);
  await expect.poll(() => scrollLeft(page), { timeout: 6_000 }).not.toBe(paused);
});

test("one slide at a time on a 360px phone, with no horizontal page scroll", async ({ page }) => {
  await openAuto(page, 360);
  await expect(autoHeading(page, 1)).toBeInViewport({ ratio: 0.9 });
  await expect(autoHeading(page, 2)).not.toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test("reduced motion: no rotation and no pause button", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openAuto(page);
  await expect(page.getByRole("button", { name: "Mettre en pause" })).toHaveCount(0);
  await page.mouse.move(0, 890);
  await page.waitForTimeout(4_000);
  expect(await scrollLeft(page)).toBe(0);
});
