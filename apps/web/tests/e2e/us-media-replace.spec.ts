import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { adminToken } from "./fixtures";

/**
 * 017-edge-protection, User Story 4 (T048, contracts/media-usage.md) — an
 * editor sees where an image is used, is asked before a new file replaces it
 * on every page, and cannot delete it while it is used. After a replacement
 * the page shows the new file through the alias map — exercised only on the
 * full stack (ASSET_ORIGIN set); under bare `npm run dev` media URLs are
 * Payload-served and the page check is skipped.
 */
const CMS_API = process.env.CMS_API_URL ?? "http://localhost:3000/api";
const CMS_URL = process.env.CMS_URL ?? "http://localhost:3000";
const ADMIN_URL = process.env.CMS_ADMIN_URL ?? `${CMS_URL}/admin`;
const BASE = process.env.E2E_BASE_URL ?? "http://site-a.localhost:3001";
const SITE_HOST = process.env.E2E_SITE_HOST ?? "site-a.localhost";
const RUN = Date.now().toString(36);
const PATH = `/e2e-media-${RUN}`;
const PAGE_TITLE = `E2E image utilisée ${RUN}`;

// Three distinct 2×2 PNGs (red, green, blue).
const PNG = [
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWM4ISd3Qk6OAUIBAB8mBBGFRCvEAAAAAElFTkSuQmCC",
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOQW2Ajt8CGAUIBABruA+mkkT2fAAAAAElFTkSuQmCC",
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOQszkhZ3OCAUIBAB0eBInn0NUfAAAAAElFTkSuQmCC",
].map((b64) => Buffer.from(b64, "base64"));

type MediaDoc = { id: number; filename: string; url: string; previousFilenames?: { filename: string }[] };

let token: string | undefined;
let json: Record<string, string>;
let used: MediaDoc;
let unused: MediaDoc;
let pageId: number | undefined;

async function upload(name: string, bytes: Buffer): Promise<MediaDoc> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/png" }), name);
  form.append("_payload", JSON.stringify({ alt: `E2E ${name}` }));
  const res = await fetch(`${CMS_API}/media`, { method: "POST", headers: { authorization: `JWT ${token}` }, body: form });
  if (!res.ok) throw new Error(`upload ${name}: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { doc: MediaDoc }).doc;
}

const getMedia = async (id: number) =>
  (await fetch(`${CMS_API}/media/${id}?depth=0`, { headers: json }).then((r) => r.json())) as MediaDoc;

async function findOrCreate(collection: string, where: string, data: object) {
  const found = (await fetch(`${CMS_API}/${collection}?${where}&limit=1`, { headers: json }).then((r) => r.json())) as {
    docs: { id: number }[];
  };
  if (found.docs[0]) return found.docs[0].id;
  const res = await fetch(`${CMS_API}/${collection}`, { method: "POST", headers: json, body: JSON.stringify(data) });
  return ((await res.json()) as { doc: { id: number } }).doc.id;
}

test.beforeAll(async () => {
  token = await adminToken();
  if (!token) return;
  json = { authorization: `JWT ${token}`, "content-type": "application/json" };
  used = await upload(`e2e-used-${RUN}.png`, PNG[0]!);
  unused = await upload(`e2e-unused-${RUN}.png`, PNG[1]!);
  const domain = await findOrCreate("domains", `where[hostname][equals]=${SITE_HOST}`, {
    hostname: SITE_HOST,
    isActive: true,
    label: SITE_HOST,
  });
  const language = await findOrCreate("languages", "where[code][equals]=fr", { code: "fr", label: "Français", isActive: true });
  const res = await fetch(`${CMS_API}/pages`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({
      title: PAGE_TITLE,
      domain,
      language,
      path: PATH,
      status: "published",
      builder: {
        // The publish guard wants exactly one lead-form block.
        projectData: {
          pages: [
            {
              frames: [
                {
                  component: {
                    type: "wrapper",
                    components: [
                      // Also in projectData: the editor loads the page from it (editor check below).
                      { type: "image", src: used.url, attributes: { alt: "E2E", width: "200", "data-e2e": "media" } },
                      { tagName: "div", attributes: { "data-block": "lead-form", id: "form" } },
                    ],
                  },
                },
              ],
            },
          ],
        },
        html: `<section data-block="hero"><img src="${used.url}" alt="E2E" width="200" data-e2e="media"></section><div data-block="lead-form" id="form"></div>`,
        css: "",
      },
      form: {
        fields: [{ name: "email", label: "Email", type: "email", required: true }],
        submitLabel: "Envoyer",
        successMessage: `Merci ${RUN}`,
        consentPurposeText: "J'accepte d'être recontacté(e).",
        privacyNoticeUrl: "/privacy",
        privacyNoticeVersion: "2026-01",
      },
    }),
  });
  if (!res.ok) throw new Error(`could not create the page using the image: ${res.status} ${await res.text()}`);
  pageId = ((await res.json()) as { doc: { id: number } }).doc.id;
});

test.afterAll(async () => {
  if (!token) return;
  if (pageId) await fetch(`${CMS_API}/pages/${pageId}`, { method: "DELETE", headers: json });
  for (const m of [used, unused]) if (m) await fetch(`${CMS_API}/media/${m.id}`, { method: "DELETE", headers: json });
});

/** Admin requests carry the suite's JWT (fixtures.ts; cookies fail on host.docker.internal). */
async function signIn(context: BrowserContext) {
  await context.route(`${CMS_URL}/**`, (route) => {
    const request = route.request();
    if (!["document", "fetch", "xhr"].includes(request.resourceType())) return route.continue();
    return route.continue({ headers: { ...request.headers(), authorization: `JWT ${token}` } });
  });
}

async function openMedia(context: BrowserContext, id: number): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${ADMIN_URL}/collections/media/${id}`);
  await expect(page.getByTestId("media-usage")).not.toContainText("Recherche", { timeout: 40_000 });
  return page;
}

async function chooseNewFile(page: Page, bytes: Buffer) {
  await page.locator(".file-details__remove").click();
  await page.locator('input[type="file"]').setInputFiles({ name: `e2e-new-${RUN}.png`, mimeType: "image/png", buffer: bytes });
}

test.describe("media replace and delete (017)", () => {
  test.skip(() => !token, "no admin token — stack not up / not seeded");
  test.describe.configure({ mode: "serial" });

  test("the panel lists the page using the image, and says an unused one is unused", async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await signIn(context);
    const page = await openMedia(context, used.id);
    await expect(page.getByTestId("media-usage")).toContainText("Utilisée dans 1 page(s)");
    await expect(page.getByTestId("media-usage").getByRole("link", { name: PAGE_TITLE })).toBeVisible();
    await expect(page.getByTestId("media-usage")).toContainText("La suppression est bloquée");
    const other = await openMedia(context, unused.id);
    await expect(other.getByTestId("media-usage")).toContainText("Cette image n'est utilisée dans aucune page.");
    await context.close();
  });

  test("a description-only save never asks", async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await signIn(context);
    const page = await openMedia(context, used.id);
    await page.locator("#field-alt").fill(`E2E décrite ${RUN}`);
    await page.locator("#action-save").click();
    await expect(page.getByText(/enregistr|updated successfully|mis à jour/i).first()).toBeVisible();
    await expect(page.getByTestId("media-replace-confirm")).toBeHidden();
    expect((await getMedia(used.id)).filename).toBe(used.filename);
    await context.close();
  });

  test("a new file over a used image asks first; « Annuler » keeps it, « Remplacer partout » replaces it", async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await signIn(context);
    const page = await openMedia(context, used.id);
    await chooseNewFile(page, PNG[2]!);
    await page.locator("#action-save").click();
    const dialog = page.getByTestId("media-replace-confirm");
    await expect(dialog).toContainText("Attention, l'image que vous voulez remplacer est utilisée dans ces pages");
    await expect(dialog).toContainText(PAGE_TITLE);
    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toBeHidden();
    expect((await getMedia(used.id)).filename).toBe(used.filename);

    await page.locator("#action-save").click();
    await page.getByRole("button", { name: "Remplacer partout" }).click();
    await expect.poll(async () => (await getMedia(used.id)).filename, { timeout: 20_000 }).not.toBe(used.filename);
    const after = await getMedia(used.id);
    expect(after.previousFilenames?.map((p) => p.filename)).toContain(used.filename);
    await context.close();

    // The page still names the old key; it must point at the new file (alias
    // map). Checked on the rendered imgproxy URL, whose last segment is the
    // base64url-encoded source: the browser running the suite may not reach
    // imgproxy (dockerised CI runner), so the image itself is not loaded.
    test.skip(!/^https?:\/\//.test(used.url) || used.url.includes("/api/media/file/"), "ASSET_ORIGIN unset — no alias path");
    // The CMS's invalidation lands about a second after the save; the map is
    // never older than 60 s whatever happens (SC-005: within a minute).
    const site = await browser.newPage();
    const renderedSource = async () => {
      await site.goto(`${BASE}${PATH}`);
      const src = await site.locator('img[data-e2e="media"]').getAttribute("src");
      return Buffer.from((src ?? "").split("/").pop()!.split(".")[0]!, "base64url").toString();
    };
    await expect.poll(renderedSource, { timeout: 10_000 }).toMatch(new RegExp(`/${after.filename.replace(/[.]/g, "\\.")}$`));
    await site.close();

    // 2026-10-12 — the page editor shows the new file too (it applies the
    // alias map when the page opens), not the old key the page still stores.
    // Read from the editor's own HTML (« Code » view): the dockerised browser
    // cannot load the asset host, so the canvas shows GrapesJS's fallback image.
    const editorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await signIn(editorContext);
    const editor = await editorContext.newPage();
    await editor.goto(`${ADMIN_URL}/collections/pages/${pageId}`);
    await expect(editor.frameLocator(".gjs-frame").locator('img[data-e2e="media"]')).toBeAttached({ timeout: 30_000 });
    await editor.locator('[title="Modifier le code HTML et CSS"]').click();
    const code = editor.locator("#trefle-code-html .CodeMirror");
    await expect(code).toBeVisible();
    const html = await code.evaluate((node) => (node as HTMLElement & { CodeMirror: { getValue(): string } }).CodeMirror.getValue());
    expect(html).toContain(`/${after.filename}`);
    expect(html).not.toContain(`/${used.filename}`);
    await editorContext.close();
  });

  test("a new file over an unused image saves without asking", async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await signIn(context);
    const page = await openMedia(context, unused.id);
    await chooseNewFile(page, PNG[0]!);
    await page.locator("#action-save").click();
    await expect.poll(async () => (await getMedia(unused.id)).filename, { timeout: 20_000 }).not.toBe(unused.filename);
    await expect(page.getByTestId("media-replace-confirm")).toBeHidden();
    await context.close();
  });

  test("deleting the used image is refused with the page title", async () => {
    const res = await fetch(`${CMS_API}/media/${used.id}`, { method: "DELETE", headers: json });
    expect(res.status).toBe(409);
    expect(await res.text()).toContain(PAGE_TITLE);
    expect((await fetch(`${CMS_API}/media/${used.id}`, { headers: json })).status).toBe(200);
  });
});
