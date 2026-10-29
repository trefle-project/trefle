import { deflateSync } from "node:zlib";

import { expect, test, type Browser } from "@playwright/test";

import { adminToken as sharedAdminToken } from "./fixtures";

/**
 * 003-post-launch-improvements smoke (FR-021, SC-006). Its own file — NOT
 * us5-roles.spec.ts, which carries an unconditional test.fixme(true, ...)
 * that skips its entire file regardless of E2E_RUN_US5 (see
 * us5-roles.spec.ts:29) — anything added there would never actually run.
 *
 * 022-ux-improvement (User Story 4, quickstart V6) — the installation
 * operator's identity: name or logo on the login page, menu icon, favicon,
 * tab title, tiled wallpaper with a variant, and the version footer.
 */
const CMS_URL = process.env.CMS_URL ?? "http://localhost:3000";
const CMS_API = process.env.CMS_API_URL ?? `${CMS_URL}/api`;

async function api(path: string, token: string, init: RequestInit = {}) {
  return fetch(`${CMS_API}${path}`, { ...init, headers: { authorization: `JWT ${token}`, ...(init.headers ?? {}) } });
}
const json = (path: string, token: string, method: string, body: unknown) =>
  api(path, token, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

/** A solid-colour PNG of w×h pixels. */
function png(w: number, h: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    t.copy(out, 4);
    out.writeUInt32BE(crc(t), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function upload(token: string, name: string, data: Buffer): Promise<number> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)], { type: "image/png" }), name);
  form.append("_payload", JSON.stringify({ alt: name }));
  const res = await api("/admin-images", token, { method: "POST", body: form });
  expect(res.status, await res.clone().text()).toBe(201);
  return ((await res.json()) as { doc: { id: number } }).doc.id;
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

test("admin login shows the installation's own mark, not Payload's stock logo", async ({ page }) => {
  await page.goto(`${CMS_URL}/admin/login`);
  // Payload's stock logo is an <svg class="graphic-logo"> wordmark
  // (node_modules/@payloadcms/ui/dist/graphics/Logo) — it must be gone.
  await expect(page.locator("svg.graphic-logo")).toHaveCount(0);
  // Logo.tsx: the operator's logo, else Trefle's bundled clover.
  await expect(page.locator(".login__brand, .template-minimal").first()).toBeVisible();
  await expect(page.getByText(/Powered by Trefle v \d+\.\d+\.\d+ - r \S+/)).toBeVisible();
});

test("the operator's logo, icon, favicon, wallpaper with a variant, tab title and footer", async ({ browser, page }) => {
  test.setTimeout(90_000);
  const token = (await sharedAdminToken()) ?? "";
  test.skip(!token, "no admin token (global-setup)");
  const before = (await (await api("/globals/settings?depth=0", token)).json()) as Record<string, unknown>;
  const operator = (before.operator ?? {}) as Record<string, unknown>;

  const logo = await upload(token, `logo-${Date.now()}.png`, png(120, 40, [20, 90, 160]));
  const icon = await upload(token, `icon-${Date.now()}.png`, png(32, 32, [200, 40, 40]));
  const pattern = await upload(token, `pattern-${Date.now()}.png`, png(15, 15, [230, 240, 230]));
  const variant = await upload(token, `variant-${Date.now()}.png`, png(15, 15, [40, 160, 40]));
  const wrong = await upload(token, `wrong-${Date.now()}.png`, png(30, 30, [0, 0, 0]));

  try {
    // A variant of another size is refused, in French.
    const refused = await json("/globals/settings", token, "POST", { adminPattern: pattern, adminVariant: wrong });
    expect(refused.status).toBe(400);
    expect(await refused.text()).toContain("La variante doit avoir la même taille que le motif (15×15 px).");

    const saved = await json("/globals/settings", token, "POST", {
      operator: { ...operator, name: "Opérateur Démo" },
      adminLogo: logo,
      adminIcon: icon,
      adminFavicon: icon,
      adminPattern: pattern,
      adminVariant: variant,
      variantMode: "perScreen",
      variantCount: 1,
    });
    expect(saved.status).toBe(200);

    // Login page (no sign-in): logo, wallpaper, footer.
    await page.goto(`${CMS_URL}/admin/login`);
    await expect(page.getByRole("img", { name: "Opérateur Démo" })).toBeVisible();
    await expect(page.locator("canvas.trefle-wallpaper")).toBeAttached();
    await expect(page.getByText(/Powered by Trefle v \d+\.\d+\.\d+ - r \S+/)).toBeVisible();

    // Signed in: tab title, favicon, menu icon, wallpaper.
    const admin = await adminPage(browser, token);
    await admin.goto(`${CMS_URL}/admin/collections/pages`);
    await expect(admin).toHaveTitle(/· Opérateur Démo$/);
    await expect(admin.locator('link[rel="icon"]').first()).toHaveAttribute("href", /icon-/);
    await expect(admin.locator('img[alt="Opérateur Démo"]').first()).toBeVisible();
    await expect(admin.locator("canvas.trefle-wallpaper")).toBeAttached();

    // The variant moves between pages: compare the canvas pixels of two draws.
    const snapshot = () => admin.locator("canvas.trefle-wallpaper").evaluate((c) => (c as HTMLCanvasElement).toDataURL());
    const first = await snapshot();
    await admin.goto(`${CMS_URL}/admin/collections/domains`);
    await expect(admin.locator("canvas.trefle-wallpaper")).toBeAttached();
    await expect.poll(snapshot).not.toBe(first);

    // Axe on the login page with the wallpaper.
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === "critical")).toEqual([]);
  } finally {
    // Put back what the installation had (the local admin's own branding).
    await json("/globals/settings", token, "POST", {
      operator,
      adminLogo: before.adminLogo ?? null,
      adminIcon: before.adminIcon ?? null,
      adminFavicon: before.adminFavicon ?? null,
      adminPattern: before.adminPattern ?? null,
      adminVariant: before.adminVariant ?? null,
      variantMode: before.variantMode,
      variantCount: before.variantCount,
    });
    for (const id of [logo, icon, pattern, variant, wrong]) await api(`/admin-images/${id}`, token, { method: "DELETE" });
  }

  // Without images: Trefle's bundled look (lib/branding.ts DEFAULT_IMAGES).
  if (!before.adminLogo && !before.adminPattern) {
    await page.goto(`${CMS_URL}/admin/login`);
    await expect(page.locator("canvas.trefle-wallpaper")).toBeAttached();
    await expect(page.locator('img[src="/branding/trefle-logo.svg"]')).toBeVisible();
  }
});

test("a member's avatar on the account button, in Users and in the Activity log; initials otherwise", async ({ browser }) => {
  test.setTimeout(60_000);
  const token = (await sharedAdminToken()) ?? "";
  test.skip(!token, "no admin token (global-setup)");
  const me = (await (await api("/users/me", token)).json()) as { user: { id: number; email: string; name?: string | null; avatar?: unknown } };
  // The local admin's own avatar, put back at the end.
  const ownAvatar = me.user.avatar && typeof me.user.avatar === "object" ? (me.user.avatar as { id: number }).id : (me.user.avatar ?? null);
  const admin = await adminPage(browser, token);
  const avatar = await upload(token, `avatar-${Date.now()}.png`, png(64, 64, [120, 60, 200]));
  try {
    // Initials first.
    await json(`/users/${me.user.id}`, token, "PATCH", { avatar: null, name: "Zoé Martin" });
    await admin.goto(`${CMS_URL}/admin/collections/users`);
    await expect(admin.getByRole("img", { name: "Zoé Martin" }).first()).toHaveText("ZM");

    // Regression: an upload sent with Payload's image edits (crop / focal point)
    // used to fail with a 500; it is stored (edits ignored, no image processing).
    const edited = new FormData();
    edited.append("file", new Blob([new Uint8Array(png(40, 40, [10, 10, 10]))], { type: "image/png" }), `edited-${Date.now()}.png`);
    edited.append("_payload", JSON.stringify({ alt: "edited" }));
    const editedRes = await api("/admin-images?uploadEdits[crop][unit]=%25&uploadEdits[crop][x]=10&uploadEdits[crop][y]=10&uploadEdits[crop][width]=80&uploadEdits[crop][height]=80&uploadEdits[focalPoint][x]=50&uploadEdits[focalPoint][y]=50", token, { method: "POST", body: edited });
    expect(editedRes.status, await editedRes.clone().text()).toBe(201);
    await api(`/admin-images/${((await editedRes.json()) as { doc: { id: number } }).doc.id}`, token, { method: "DELETE" });

    expect((await json(`/users/${me.user.id}`, token, "PATCH", { avatar })).status).toBe(200);
    await admin.goto(`${CMS_URL}/admin/collections/users`);
    await expect(admin.locator(`img[alt="Zoé Martin"]`).first()).toBeVisible();
    await admin.goto(`${CMS_URL}/admin/collections/activity-log`);
    await expect(admin.locator(`img[alt="Zoé Martin"]`).first()).toBeVisible();

    // Never offered when picking a page image (media library).
    const uploaded = ((await (await api(`/admin-images/${avatar}?depth=0`, token)).json()) as { filename: string }).filename;
    const media = (await (await api(`/media?where[filename][equals]=${encodeURIComponent(uploaded)}&limit=1`, token)).json()) as { totalDocs: number };
    expect(media.totalDocs).toBe(0);
  } finally {
    await json(`/users/${me.user.id}`, token, "PATCH", { avatar: ownAvatar, name: me.user.name ?? null });
    await api(`/admin-images/${avatar}`, token, { method: "DELETE" });
  }
});
