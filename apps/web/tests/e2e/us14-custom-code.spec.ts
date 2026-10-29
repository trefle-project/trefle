import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { adminToken, testClientIp } from "./fixtures";

/**
 * 014-custom-code-editing — end-to-end checks in the real admin + renderer.
 *
 * User Story 2 (« Code » view): an editor edits the page's HTML/CSS as text,
 * applies it, can undo it, is warned about what publication will drop, and
 * the result publishes (quickstart.md §3).
 *
 * Auth follows the shared conventions (fixtures.ts): global-setup's single
 * admin token, injected as an `Authorization: JWT` header on CMS requests —
 * cookies don't stick on host.docker.internal.
 */
const CMS_URL = process.env.CMS_URL ?? "http://localhost:3000";
const ADMIN_URL = process.env.CMS_ADMIN_URL ?? `${CMS_URL}/admin`;
const CMS_API = process.env.CMS_API_URL ?? `${CMS_URL}/api`;
const BASE = process.env.E2E_BASE_URL ?? "http://site-a.localhost:3001";
const SITE_HOST = process.env.E2E_SITE_HOST ?? "site-a.localhost";

const RUN = Date.now().toString(36);

let token: string | undefined;

const api = (path: string, init: RequestInit = {}) =>
  fetch(`${CMS_API}${path}`, {
    ...init,
    headers: { authorization: `JWT ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });

async function findOrCreate(collection: string, where: string, data: object) {
  const found = (await api(`/${collection}?${where}&limit=1`).then((r) => r.json())) as { docs: { id: string | number }[] };
  if (found.docs[0]) return found.docs[0].id;
  const created = (await api(`/${collection}`, { method: "POST", body: JSON.stringify(data) }).then((r) => r.json())) as {
    doc: { id: string | number };
  };
  return created.doc.id;
}

/** A published page with a hero and the lead form, stored as the editor stores it.
 * `titleColor` styles the h1 through an `#id` rule, as the editor does for inline styles. */
async function createPage(label: string, titleColor?: string): Promise<{ id: string | number; path: string }> {
  const domain = await findOrCreate("domains", `where[hostname][equals]=${SITE_HOST}`, {
    hostname: SITE_HOST,
    isActive: true,
    label: SITE_HOST,
  });
  const language = await findOrCreate("languages", "where[code][equals]=fr", { code: "fr", label: "Français", isActive: true });
  const path = `/e2e-code-${label}-${RUN}`;
  const res = await api("/pages", {
    method: "POST",
    body: JSON.stringify({
      title: `E2E code view ${label} ${RUN}`,
      domain,
      language,
      path,
      status: "published",
      builder: {
        projectData: {
          pages: [
            {
              frames: [
                {
                  component: {
                    type: "wrapper",
                    components: [
                      {
                        tagName: "section",
                        attributes: { "data-block": "hero" },
                        components: [
                          {
                            tagName: "h1",
                            ...(titleColor ? { attributes: { id: "i7xq" } } : {}),
                            components: [{ type: "textnode", content: `Code ${label} ${RUN}` }],
                          },
                        ],
                      },
                      {
                        tagName: "div",
                        attributes: { "data-block": "lead-form", id: "form" },
                        droppable: false,
                        editable: false,
                      },
                    ],
                  },
                },
              ],
            },
          ],
          styles: titleColor ? [{ selectors: ["#i7xq"], style: { color: titleColor } }] : [],
        },
        html: `<section data-block="hero"><h1${titleColor ? ' id="i7xq"' : ""}>Code ${label} ${RUN}</h1></section><div data-block="lead-form" id="form"></div>`,
        css: titleColor ? `#i7xq{color:${titleColor};}` : "",
      },
      form: {
        fields: [{ name: "email", label: "Email", type: "email", required: true }],
        submitLabel: "Envoyer",
        successMessage: "Merci",
        consentPurposeText: "J'accepte d'être recontacté(e).",
        privacyNoticeUrl: "/privacy",
        privacyNoticeVersion: "2026-01",
      },
    }),
  });
  if (!res.ok) throw new Error(`could not create code-view fixture page: ${res.status} ${await res.text()}`);
  const { doc } = (await res.json()) as { doc: { id: string | number } };
  return { id: doc.id, path };
}

async function signIn(context: BrowserContext) {
  await context.route(`${CMS_URL}/**`, (route) => {
    const request = route.request();
    if (!["document", "fetch", "xhr"].includes(request.resourceType())) return route.continue();
    return route.continue({ headers: { ...request.headers(), authorization: `JWT ${token}` } });
  });
}

async function openEditor(page: Page, id: string | number, heading: string) {
  await page.goto(`${ADMIN_URL}/collections/pages/${id}`);
  await expect(page.frameLocator(".gjs-frame").locator("h1", { hasText: heading })).toBeVisible({ timeout: 20_000 });
}

const codeButton = (page: Page) => page.locator('[title="Modifier le code HTML et CSS"]');
const modal = (page: Page) => page.locator(".gjs-mdl-dialog");

/** The « Code » view's editors are GrapesJS's CodeMirror 5 viewers; CodeMirror
 * exposes its instance on the `.CodeMirror` wrapper element. */
type CodeMirrorHost = HTMLElement & { CodeMirror: { getValue(): string; setValue(v: string): void } };
const getCode = (page: Page, box: "html" | "css") =>
  page.locator(`#trefle-code-${box} .CodeMirror`).evaluate((node) => (node as CodeMirrorHost).CodeMirror.getValue());
const setCode = (page: Page, box: "html" | "css", value: string) =>
  page.locator(`#trefle-code-${box} .CodeMirror`).evaluate((node, v) => (node as CodeMirrorHost).CodeMirror.setValue(v), value);

async function appendHtml(page: Page, extra: string) {
  await codeButton(page).click();
  await expect(modal(page).getByText("Code de la page")).toBeVisible();
  await expect(modal(page).locator("#trefle-code-html .CodeMirror")).toBeVisible();
  // Syntax-coloured, auto-formatted code: the lead form is on a line of its own.
  await expect(modal(page).locator("#trefle-code-html .cm-tag").first()).toBeVisible();
  const html = await getCode(page, "html");
  expect(html).toMatch(/\n\s*<div[^>]*data-block="lead-form"/);
  await setCode(page, "html", `${html}\n${extra}`);
}

async function save(page: Page, id: string | number) {
  const saved = page.waitForResponse(
    (r) => r.url().includes(`/api/pages/${id}`) && r.request().method() === "PATCH",
    { timeout: 20_000 },
  );
  await page.locator("#action-save").click();
  const res = await saved;
  expect(res.status(), await res.text()).toBe(200);
}

test.beforeAll(async () => {
  token = await adminToken();
});

test.describe("US2 — « Code » view", () => {
  test("edited HTML applies, can be undone, and publishes", async ({ browser }) => {
    test.skip(!token, "no admin token — stack not up / not seeded");
    const { id, path } = await createPage("apply");
    const context = await browser.newContext();
    await signIn(context);
    const page = await context.newPage();
    await openEditor(page, id, `Code apply ${RUN}`);
    const canvas = page.frameLocator(".gjs-frame");

    await appendHtml(
      page,
      `<table><tr><th>Offre ${RUN}</th><td>49 €</td></tr></table>` +
        `<button type="button">Info ${RUN}</button>` +
        '<iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ" title="Vidéo" allowfullscreen></iframe>',
    );
    await setCode(page, "css", `h1{color:rgb(4, 120, 87)}`);
    await modal(page).getByRole("button", { name: "Vérifier et appliquer" }).click();
    await expect(modal(page)).toBeHidden();
    await expect(canvas.locator("th", { hasText: `Offre ${RUN}` })).toBeVisible();

    // The form placeholder is still the non-editable lead-form type after re-parse.
    await expect(canvas.locator('[data-block="lead-form"]')).toHaveCount(1);

    // One undo restores the page as it was; redo brings the edit back. No
    // click in the canvas first: GrapesJS records selections in the undo
    // stack too, so a click would make the first undo only unselect.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(canvas.locator("th", { hasText: `Offre ${RUN}` })).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(canvas.locator("th", { hasText: `Offre ${RUN}` })).toBeVisible();

    await save(page, id);
    await context.close();

    const pub = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": testClientIp() } });
    const site = await pub.newPage();
    const cspErrors: string[] = [];
    site.on("console", (m) => {
      if (m.type() === "error" && /Content Security Policy/i.test(m.text())) cspErrors.push(m.text());
    });
    await site.goto(`${BASE}${path}`);
    await expect(site.locator("th", { hasText: `Offre ${RUN}` })).toBeVisible();
    await expect(site.getByRole("button", { name: `Info ${RUN}` })).toBeVisible();
    await expect(site.locator('iframe[src^="https://www.youtube-nocookie.com/embed/"]')).toHaveCount(1);
    await expect(site.getByRole("heading", { name: `Code apply ${RUN}` })).toHaveCSS("color", "rgb(4, 120, 87)");
    await expect(site.getByLabel(/email/i)).toBeVisible();
    // frame-src https: (014 US1) lets the embed load: no CSP violation at all.
    expect(cspErrors).toEqual([]);
    await pub.close();
  });

  test("editing only the HTML text keeps the page's styling", async ({ browser }) => {
    test.skip(!token, "no admin token — stack not up / not seeded");
    // GrapesJS deletes a removed component's `#id` rules: re-parsing the HTML
    // used to drop every such rule when the CSS area was left untouched.
    const green = "rgb(4, 120, 87)";
    const { id, path } = await createPage("style", green);
    const context = await browser.newContext();
    await signIn(context);
    const page = await context.newPage();
    await openEditor(page, id, `Code style ${RUN}`);
    const canvas = page.frameLocator(".gjs-frame");
    await expect(canvas.locator("h1")).toHaveCSS("color", green);

    await codeButton(page).click();
    await expect(modal(page).locator("#trefle-code-html .CodeMirror")).toBeVisible();
    const html = await getCode(page, "html");
    await setCode(page, "html", html.replace(`Code style ${RUN}`, `Code restyled ${RUN}`));
    await modal(page).getByRole("button", { name: "Vérifier et appliquer" }).click();
    await expect(modal(page)).toBeHidden();
    const title = canvas.locator("h1", { hasText: `Code restyled ${RUN}` });
    await expect(title).toBeVisible();
    await expect(title).toHaveCSS("color", green);

    await save(page, id);
    await context.close();

    const pub = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": testClientIp() } });
    const site = await pub.newPage();
    await site.goto(`${BASE}${path}`);
    await expect(site.getByRole("heading", { name: `Code restyled ${RUN}` })).toHaveCSS("color", green);
    await pub.close();
  });

  test("dropped markup is listed before applying and never published", async ({ browser }) => {
    test.skip(!token, "no admin token — stack not up / not seeded");
    const { id, path } = await createPage("warn");
    const context = await browser.newContext();
    await signIn(context);
    const page = await context.newPage();
    await openEditor(page, id, `Code warn ${RUN}`);
    page.on("dialog", (d) => {
      throw new Error(`unexpected dialog in the admin: ${d.message()}`);
    });

    await appendHtml(page, `<a href="#top" onclick="alert(1)">Lien ${RUN}</a><script>alert(2)</script>`);
    await modal(page).getByRole("button", { name: "Vérifier et appliquer" }).click();
    const alert = modal(page).getByRole("alert");
    await expect(alert).toContainText("Ces éléments ne seront pas publiés");
    await expect(alert).toContainText("« onclick »");
    await expect(alert).toContainText("Les scripts ne sont pas publiés");

    // « Revenir au code » keeps the modal open without applying.
    await modal(page).getByRole("button", { name: "Revenir au code" }).click();
    await expect(alert).toBeEmpty();
    await modal(page).getByRole("button", { name: "Vérifier et appliquer" }).click();
    await modal(page).getByRole("button", { name: "Appliquer quand même" }).click();
    await expect(modal(page)).toBeHidden();
    await expect(page.frameLocator(".gjs-frame").locator("a", { hasText: `Lien ${RUN}` })).toBeVisible();

    await save(page, id);
    await context.close();

    const pub = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": testClientIp() } });
    const site = await pub.newPage();
    const dialogs: string[] = [];
    site.on("dialog", async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });
    await site.goto(`${BASE}${path}`);
    const link = site.getByRole("link", { name: `Lien ${RUN}` });
    await expect(link).toBeVisible();
    await expect(link).not.toHaveAttribute("onclick");
    expect(await site.content()).not.toContain("alert(2)");
    await link.click();
    expect(dialogs).toEqual([]);
    await pub.close();
  });
  test("the code editor is safe to use: a backdrop click keeps it open, auto-format keeps text intact", async ({ browser }) => {
    test.skip(!token, "no admin token — stack not up / not seeded");
    const { id } = await createPage("format");
    const context = await browser.newContext();
    await signIn(context);
    const page = await context.newPage();
    await openEditor(page, id, `Code format ${RUN}`);
    const canvas = page.frameLocator(".gjs-frame");
    const TEXT = "Bonjour et bienvenue sur la page.";

    await appendHtml(page, "<p>Bonjour <b>et</b> <i>bienvenue</i> sur la page.</p>");
    // A click on the backdrop (outside the dialog) must not discard the edit.
    await page.locator(".gjs-mdl-container").click({ position: { x: 5, y: 5 } });
    await expect(modal(page)).toBeVisible();
    // « Mettre en forme » re-indents the pasted one-liner onto its own lines.
    await modal(page).getByRole("button", { name: "Mettre en forme" }).click();
    expect(await getCode(page, "html")).toMatch(/\n\s*<p>/);
    await modal(page).getByRole("button", { name: "Vérifier et appliquer" }).click();
    await expect(modal(page)).toBeHidden();
    await expect(canvas.locator("p")).toHaveText(TEXT);

    // Reopen: the paragraph comes back auto-formatted; applying an unrelated
    // HTML edit must not change its text (no whitespace added between inline elements).
    await appendHtml(page, "<hr>");
    await modal(page).getByRole("button", { name: "Vérifier et appliquer" }).click();
    await expect(modal(page)).toBeHidden();
    await expect(canvas.locator("hr")).toHaveCount(1);
    await expect(canvas.locator("p")).toHaveText(TEXT);
    await context.close();
  });
});

/**
 * User Story 1 (page scripts) — quickstart.md §2. Probe snippets leave
 * visible evidence on <html> instead of calling real vendors. The shared
 * fixture domain's banner is toggled by gtm-consent.spec.ts in a parallel
 * worker, so consent is driven through the 007 cookie (an earlier
 * « Accepter ») and the `tf:consent` event the banner dispatches, and the
 * real button only when the banner is on screen.
 */
test.describe("US1 — page scripts", () => {
  const HEAD = '<meta name="tf-probe" content="head"><script>document.documentElement.dataset.head="1"</script>';
  const END = '<script>document.documentElement.dataset.end="1"</script>';

  async function pageWithScripts(label: string) {
    const created = await createPage(label);
    const res = await api(`/pages/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        customCode: { head: { code: HEAD, consent: "essential" }, bodyEnd: { code: END, consent: "consent" } },
      }),
    });
    expect(res.status, await res.text()).toBe(200);
    return created;
  }

  async function visit(browser: import("@playwright/test").Browser, path: string, accepted?: boolean) {
    const context = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": testClientIp() } });
    if (accepted !== undefined) {
      const host = new URL(BASE).hostname;
      const value = encodeURIComponent(`${accepted ? "accepted" : "rejected"}|${new Date().toISOString()}`);
      await context.addCookies([{ name: "tf_consent", value, domain: host, path: "/" }]);
    }
    const site = await context.newPage();
    const csp: string[] = [];
    site.on("console", (m) => {
      if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
    });
    await site.goto(`${BASE}${path}`);
    return { context, site, csp };
  }

  const flag = (site: Page, name: string) => site.evaluate((n) => document.documentElement.dataset[n] ?? null, name);

  test("essential head snippet runs at load; the meta goes into <head>", async ({ browser }) => {
    test.skip(!token, "no admin token — stack not up / not seeded");
    const { path } = await pageWithScripts("head");
    const { context, site, csp } = await visit(browser, path);
    await expect.poll(() => flag(site, "head")).toBe("1");
    await expect(site.locator('head meta[name="tf-probe"]')).toHaveCount(1);
    expect(csp).toEqual([]);
    await context.close();
  });

  test("a consent snippet waits: nothing before a choice, never after « Refuser »", async ({ browser }) => {
    test.skip(!token, "no admin token — stack not up / not seeded");
    const { path } = await pageWithScripts("wait");
    const fresh = await visit(browser, path);
    await expect.poll(() => flag(fresh.site, "head")).toBe("1");
    expect(await flag(fresh.site, "end")).toBeNull();
    await fresh.context.close();

    const refused = await visit(browser, path, false);
    await expect.poll(() => flag(refused.site, "head")).toBe("1");
    await refused.site.waitForTimeout(500);
    expect(await flag(refused.site, "end")).toBeNull();
    await refused.context.close();
  });

  test("a consent snippet runs at load after an earlier « Accepter », and on accepting — without reload", async ({ browser }) => {
    test.skip(!token, "no admin token — stack not up / not seeded");
    const { path } = await pageWithScripts("accept");
    const earlier = await visit(browser, path, true);
    await expect.poll(() => flag(earlier.site, "end")).toBe("1");
    expect(earlier.csp).toEqual([]);
    await earlier.context.close();

    const now = await visit(browser, path);
    await expect.poll(() => flag(now.site, "head")).toBe("1");
    const navigations: string[] = [];
    now.site.on("framenavigated", (f) => f === now.site.mainFrame() && navigations.push(f.url()));
    const accept = now.site.getByRole("button", { name: /accepter/i });
    if (await accept.isVisible()) {
      await accept.click();
    } else {
      // Banner switched off by a parallel spec: do what its « Accepter » does.
      await now.site.evaluate(() => {
        document.cookie = `tf_consent=${encodeURIComponent(`accepted|${new Date().toISOString()}`)}; Path=/`;
        window.dispatchEvent(new CustomEvent("tf:consent", { detail: "accepted" }));
      });
    }
    await expect.poll(() => flag(now.site, "end")).toBe("1");
    expect(navigations).toEqual([]);
    expect(now.csp).toEqual([]);
    await now.context.close();
  });

  test("editors can't see or change page scripts; they never run in the admin", async ({ browser }) => {
    test.skip(!token, "no admin token — stack not up / not seeded");
    const { id } = await pageWithScripts("roles");

    // An editor: no customCode in API reads, and a write to it is ignored.
    const email = `e2e-014-editor-${RUN}@trefle.localhost`;
    const password = "e2e-editor-123";
    const created = await api("/users", { method: "POST", body: JSON.stringify({ email, password, role: "editor" }) }).then((r) => r.json());
    const editorId = created?.doc?.id;
    expect(editorId, JSON.stringify(created)).toBeTruthy();
    try {
      const editorToken = await fetch(`${CMS_API}/users/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
        .then((r) => r.json())
        .then((j) => j.token as string);
      const asEditor = (path: string, init: RequestInit = {}) =>
        fetch(`${CMS_API}${path}`, { ...init, headers: { authorization: `JWT ${editorToken}`, "content-type": "application/json" } });

      const read = await asEditor(`/pages/${id}?depth=0`).then((r) => r.json());
      expect(read.title).toBeTruthy();
      expect(read).not.toHaveProperty("customCode");

      await asEditor(`/pages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: `${read.title} (edited)`, customCode: { head: { code: "<script>hijack()</script>", consent: "essential" } } }),
      });
      const stored = await api(`/pages/${id}?depth=0`).then((r) => r.json());
      expect(stored.title).toMatch(/\(edited\)$/);
      expect(stored.customCode.head.code).toBe(HEAD);

      // The editor's edit view has no « Scripts » section (needs Editors to
      // reach the admin panel at all — fix #9).
      const editorContext = await browser.newContext();
      await editorContext.route(`${CMS_URL}/**`, (route) => {
        const request = route.request();
        if (!["document", "fetch", "xhr"].includes(request.resourceType())) return route.continue();
        return route.continue({ headers: { ...request.headers(), authorization: `JWT ${editorToken}` } });
      });
      const editorPage = await editorContext.newPage();
      await openEditor(editorPage, id, `Code roles ${RUN}`);
      await expect(editorPage.locator(".collapsible__toggle-wrap", { hasText: "Scripts" })).toHaveCount(0);
      await expect(editorPage.getByText("Dans l'en-tête de la page")).toHaveCount(0);
      await editorContext.close();
    } finally {
      await api(`/users/${editorId}`, { method: "DELETE" });
    }

    // The admin sees the section; the page's scripts never run in the admin.
    const context = await browser.newContext();
    await signIn(context);
    const admin = await context.newPage();
    await openEditor(admin, id, `Code roles ${RUN}`);
    await admin.locator(".collapsible__toggle-wrap", { hasText: "Scripts" }).click();
    await expect(admin.getByText("Dans l'en-tête de la page")).toBeVisible();
    expect(await flag(admin, "head")).toBeNull();
    const canvasFlag = await admin.frameLocator(".gjs-frame").locator("html").evaluate((el) => (el as HTMLElement).dataset.head ?? null);
    expect(canvasFlag).toBeNull();
    await context.close();
  });
});

/**
 * User Story 3 (« Code personnalisé » block) — quickstart.md §4. The editor
 * checks need Editors to reach the admin panel at all (fix #9).
 */
test.describe("US3 — « Code personnalisé » block", () => {
  const WIDGET = (id: string) =>
    `<div id="${id}">en attente</div><script>document.getElementById("${id}").textContent="widget OK"</script>`;
  const placeholder = (id: string) => `<div data-block="custom-code" data-code-id="${id}"></div>`;

  /** A published page whose HTML already holds code blocks (as the editor saves them). */
  async function pageWithBlocks(label: string, blocks: { codeId: string; code: string; consent: "consent" | "essential" }[]) {
    const created = await createPage(label);
    const html =
      `<section data-block="hero"><h1>Code ${label} ${RUN}</h1></section>` +
      blocks.map((b) => placeholder(b.codeId)).join("") +
      '<div data-block="lead-form" id="form"></div>';
    const res = await api(`/pages/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        builder: {
          html,
          css: "",
          projectData: {
            pages: [
              {
                frames: [
                  {
                    component: {
                      type: "wrapper",
                      components: [
                        { tagName: "section", attributes: { "data-block": "hero" }, components: [{ tagName: "h1", components: [{ type: "textnode", content: `Code ${label} ${RUN}` }] }] },
                        ...blocks.map((b) => ({ type: "custom-code", attributes: { "data-block": "custom-code", "data-code-id": b.codeId } })),
                        { tagName: "div", attributes: { "data-block": "lead-form", id: "form" }, droppable: false, editable: false },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        },
        customCode: { blocks },
      }),
    });
    expect(res.status, await res.text()).toBe(200);
    return created;
  }

  // Playwright can't emulate GrapesJS's HTML5 drag into the canvas iframe, so
  // this uses the block's click-to-add (after the selected block); both paths
  // share the same initialisation (new id, form row, editor opened).
  test("an admin adds the block, enters its code, and it renders in place on the public page only", async ({ browser }) => {
    test.skip(!token, "no admin token — stack not up / not seeded");
    const { id, path } = await createPage("drop");
    const context = await browser.newContext();
    await signIn(context);
    const page = await context.newPage();
    await openEditor(page, id, `Code drop ${RUN}`);
    const canvas = page.frameLocator(".gjs-frame");

    await canvas.locator('section[data-block="hero"]').click({ position: { x: 5, y: 5 } });
    await page.locator('.gjs-pn-btn.fa-th-large').click();
    await page.locator(".gjs-block", { hasText: "Code personnalisé" }).click();

    // The block's editor opens right away; meanwhile the canvas shows it as empty.
    await expect(modal(page).getByText("Code personnalisé", { exact: true })).toBeVisible();
    await expect(canvas.locator('[data-block="custom-code"][data-tf-empty]')).toHaveCount(1);
    await page
      .locator("#trefle-custom-code .CodeMirror")
      .evaluate((node, v) => (node as CodeMirrorHost).CodeMirror.setValue(v), WIDGET("tf-widget"));
    await modal(page).locator("#trefle-custom-code-consent").selectOption("essential");
    await modal(page).getByRole("button", { name: "Enregistrer" }).click();
    await expect(modal(page)).toBeHidden();

    await expect(canvas.locator('[data-block="custom-code"][data-tf-empty]')).toHaveCount(0);
    // Canvas: a placeholder right after the hero, never the live widget.
    await expect(canvas.locator('section[data-block="hero"] + [data-block="custom-code"]')).toHaveCount(1);
    await expect(canvas.getByText("widget OK")).toHaveCount(0);
    await expect(canvas.locator("#tf-widget")).toHaveCount(0);

    await save(page, id);
    await context.close();

    const stored = await api(`/pages/${id}?depth=0`).then((r) => r.json());
    expect(stored.customCode.blocks).toHaveLength(1);
    const codeId = stored.customCode.blocks[0].codeId as string;
    expect(stored.builder.html).toContain(`data-code-id="${codeId}"`);
    expect(stored.customCode.blocks[0]).toMatchObject({ code: WIDGET("tf-widget"), consent: "essential" });

    const pub = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": testClientIp() } });
    const site = await pub.newPage();
    const csp: string[] = [];
    site.on("console", (m) => {
      if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
    });
    await site.goto(`${BASE}${path}`);
    await expect(site.locator("#tf-widget")).toHaveText("widget OK");
    await expect(site.locator(`[data-tf-code="block"] #tf-widget`)).toHaveCount(1);
    expect(csp).toEqual([]);
    await pub.close();
  });

  test("a consent block stays empty until the visitor accepts", async ({ browser }) => {
    test.skip(!token, "no admin token — stack not up / not seeded");
    const { path } = await pageWithBlocks("consentblock", [{ codeId: `c-${RUN}`, code: WIDGET("tf-consent-widget"), consent: "consent" }]);
    const context = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": testClientIp() } });
    const site = await context.newPage();
    await site.goto(`${BASE}${path}`);
    await expect(site.getByRole("heading", { name: `Code consentblock ${RUN}` })).toBeVisible();
    await expect(site.locator("#tf-consent-widget")).toHaveCount(0);
    await site.evaluate(() => {
      document.cookie = `tf_consent=${encodeURIComponent(`accepted|${new Date().toISOString()}`)}; Path=/`;
      window.dispatchEvent(new CustomEvent("tf:consent", { detail: "accepted" }));
    });
    await expect(site.locator("#tf-consent-widget")).toHaveText("widget OK");
    await context.close();
  });

  test("editors can move or delete a block but never add one or open its code", async ({ browser }) => {
    test.skip(!token, "no admin token — stack not up / not seeded");
    const codeId = `e-${RUN}`;
    const { id } = await pageWithBlocks("editorblock", [{ codeId, code: WIDGET("tf-e"), consent: "essential" }]);

    const email = `e2e-014-block-editor-${RUN}@trefle.localhost`;
    const password = "e2e-editor-123";
    const created = await api("/users", { method: "POST", body: JSON.stringify({ email, password, role: "editor" }) }).then((r) => r.json());
    const editorId = created?.doc?.id;
    try {
      const editorToken = await fetch(`${CMS_API}/users/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
        .then((r) => r.json())
        .then((j) => j.token as string);
      const asEditor = (p: string, init: RequestInit = {}) =>
        fetch(`${CMS_API}${p}`, { ...init, headers: { authorization: `JWT ${editorToken}`, "content-type": "application/json" } });
      const html = (await api(`/pages/${id}?depth=0`).then((r) => r.json())).builder.html as string;

      // Forging a new block is refused, with the French explanation.
      const forged = await asEditor(`/pages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ builder: { html: html + placeholder("forged") } }),
      });
      expect(forged.status).toBe(403);
      expect(await forged.text()).toContain("Seul un administrateur peut ajouter ou modifier un bloc de code personnalisé.");

      // In the editor: no block in the library, double-click opens nothing.
      const context = await browser.newContext();
      await context.route(`${CMS_URL}/**`, (route) => {
        const request = route.request();
        if (!["document", "fetch", "xhr"].includes(request.resourceType())) return route.continue();
        return route.continue({ headers: { ...request.headers(), authorization: `JWT ${editorToken}` } });
      });
      const page = await context.newPage();
      await openEditor(page, id, `Code editorblock ${RUN}`);
      const tile = page.locator(".gjs-block", { hasText: "Code personnalisé" });
      await page.locator('.gjs-pn-btn.fa-th-large').click();
      await expect(page.locator(".gjs-block").first()).toBeVisible();
      await expect(tile).toHaveCount(0);
      await page.frameLocator(".gjs-frame").locator('[data-block="custom-code"]').dblclick();
      await expect(modal(page)).toBeHidden();
      await context.close();

      // Deleting the block is allowed.
      const removed = await asEditor(`/pages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ builder: { html: html.replace(placeholder(codeId), "") } }),
      });
      expect(removed.status, await removed.text()).toBe(200);
    } finally {
      await api(`/users/${editorId}`, { method: "DELETE" });
    }
  });
});
