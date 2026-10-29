import { join } from "node:path";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { adminToken, testClientIp } from "./fixtures";

/**
 * 012-url-page-import, User Story 1 (T050) — import a page from a URL into
 * the block editor, end to end, with the fixture conversion
 * (IMPORT_AI_MODE=fixture on the test stack) and the static source site
 * `import-fixture` (infra/docker-compose.override.yml), which only the
 * stack's browser container can reach.
 *
 * Admin auth: the shared global-setup JWT is sent as `Authorization: JWT …`
 * on the admin's page loads and API calls. A cookie isn't enough here: with
 * CSRF origins configured, Payload only takes a cookie from an Origin-less
 * request when `Sec-Fetch-Site` vouches for it (payload/dist/auth/extractJWT.js),
 * and Chromium sends Sec-Fetch-* only to trustworthy origins (localhost,
 * https) — not to the dockerised runner's `http://host.docker.internal`.
 * Production is https and unaffected.
 */
const CMS_URL = process.env.CMS_URL ?? "http://localhost:3000";
const ADMIN_URL = process.env.CMS_ADMIN_URL ?? `${CMS_URL}/admin`;
const CMS_API = process.env.CMS_API_URL ?? `${CMS_URL}/api`;
const BASE = process.env.E2E_BASE_URL ?? "http://site-a.localhost:3001";
const SITE_HOST = process.env.E2E_SITE_HOST ?? "site-a.localhost";
const SOURCE_URL = process.env.E2E_IMPORT_SOURCE_URL ?? "http://import-fixture/index.html";

const RUN = Date.now().toString(36);
const HERO = "Un potager généreux, sans y passer vos week-ends";

let token: string | undefined;

test.beforeAll(async () => {
  token = await adminToken();
});

async function signIn(context: BrowserContext) {
  await context.route(`${CMS_URL}/**`, (route) => {
    const request = route.request();
    if (!["document", "fetch", "xhr"].includes(request.resourceType())) return route.continue();
    return route.continue({ headers: { ...request.headers(), authorization: `JWT ${token}` } });
  });
}

const api = (path: string, init: RequestInit = {}) =>
  fetch(`${CMS_API}${path}`, {
    ...init,
    headers: { authorization: `JWT ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });

async function openWizard(page: Page, title: string, path?: string) {
  await page.goto(`${ADMIN_URL}/collections/pages/wizard`);
  const importChoice = page.getByLabel(/Importer depuis une page web/);
  await expect(importChoice, "the import option is offered (fixture mode, cap > 0)").toBeEnabled({ timeout: 20_000 });
  await page.locator("#wizard-title").fill(title);
  await expect(page.locator("#wizard-language option", { hasText: "Français" })).toHaveCount(1);
  await page.locator("#wizard-language").selectOption({ label: "Français" });
  if (path) {
    await expect(page.locator("#wizard-domain option", { hasText: SITE_HOST })).toHaveCount(1);
    await page.locator("#wizard-domain").selectOption({ label: SITE_HOST });
    await page.locator("#wizard-path").fill(path);
  }
  await importChoice.check();
}

test.describe("import a page from a URL (fixture conversion)", () => {
  test.beforeEach(() => {
    test.skip(!token, "no admin token — stack not up / not seeded");
  });

  test("wizard → progress → editable draft with its report, device views and publish", async ({ context, page }) => {
    test.setTimeout(120_000);
    await signIn(context);
    const path = `/e2e-import-${RUN}`;
    await openWizard(page, `Import e2e ${RUN}`, path);
    await page.locator("#wizard-url").fill(SOURCE_URL);
    await page.getByRole("button", { name: "Importer", exact: true }).click();

    // Progress, then the new draft's edit view.
    await page.waitForURL(/\/admin\/collections\/pages\/\d+$/, { timeout: 60_000 });
    const pageId = Number(/\/pages\/(\d+)$/.exec(page.url())![1]);

    // The report: omissions, actions, screen formats.
    const report = page.getByTestId("import-report");
    await expect(report).toContainText("Rapport d’import");
    await expect(report).toContainText("Vidéo de présentation");
    // Lead form (User Story 4): placed by the import, only the success message is left to write.
    await expect(report).toContainText("Rédiger le message affiché après l'envoi du formulaire");
    await expect(report).not.toContainText("Ajouter un bloc Formulaire");
    await expect(report).toContainText("remplacée par la case de consentement de la page");
    await expect(report).toContainText("Formats d'écran");
    await expect(report).toContainText("Aucun problème détecté sur ordinateur, tablette et mobile.");

    // Images (User Story 2): both pictures and the testimonial background are
    // Media items of this import, none described by the source → "À décrire".
    await expect(report).toContainText("Décrire les 3 images marquées « À décrire » dans la médiathèque");
    const imported = (await (await api(`/pages/${pageId}?depth=0`)).json()) as {
      importedFrom: number;
      builder: { html: string; css: string };
    };
    const media = (await (await api(`/media?depth=0&where[importedBy][equals]=${imported.importedFrom}`)).json()) as {
      docs: { url: string; mimeType: string; alt: string | null; altPending: boolean }[];
    };
    expect(media.docs).toHaveLength(3);
    for (const m of media.docs) {
      expect(m).toMatchObject({ mimeType: "image/webp", altPending: true });
      expect(`${imported.builder.html}${imported.builder.css}`).toContain(m.url);
    }
    // SC-004: no image comes from the source site (links keep their source targets).
    expect(`${imported.builder.html}${imported.builder.css}`).not.toMatch(/(src="|url\()https?:\/\/import-fixture/);
    expect(imported.builder.css).toContain("background-image:url(");

    // Every text is an editable library text in the canvas.
    const canvas = page.frameLocator(".gjs-frame");
    const heading = canvas.locator("h1", { hasText: HERO });
    await expect(heading).toBeVisible({ timeout: 20_000 });
    await heading.dblclick();
    await expect(heading).toHaveAttribute("contenteditable", "true");
    await expect(canvas.locator('[data-block="columns"]').first().locator(':scope > [data-block="column"]')).toHaveCount(3);
    await expect(canvas.locator('[data-block="column"] > [data-block="lead-form"]')).toHaveCount(1);

    // Device views: the source's phone adjustments show on Mobile portrait only.
    const fontSize = () => heading.evaluate((el) => getComputedStyle(el).fontSize);
    const decoDisplay = () =>
      canvas.locator('[data-block="image"]').first().evaluate((el) => getComputedStyle(el).display);
    expect(await fontSize()).toBe("56px");
    expect(await decoDisplay()).not.toBe("none");
    await page.locator("select.gjs-devices").selectOption("mobilePortrait");
    await expect.poll(fontSize).toBe("32px");
    await expect.poll(decoDisplay).toBe("none");
    await page.locator("select.gjs-devices").selectOption("desktop");
    await expect.poll(fontSize).toBe("56px");

    // « Masquer » folds the report (still reachable, remembered on reload);
    // « Afficher » reopens it.
    await report.getByRole("button", { name: "Masquer le rapport" }).click();
    await expect(report.locator("#import-report-body")).toBeHidden();
    await expect(report).toContainText(/Rapport d’import — \d+ actions? avant de publier/);
    await page.reload();
    await expect(page.frameLocator(".gjs-frame").locator("h1", { hasText: HERO })).toBeVisible({ timeout: 20_000 });
    const folded = page.getByTestId("import-report");
    await expect(folded.locator("#import-report-body")).toBeHidden();
    await folded.getByRole("button", { name: "Afficher le rapport" }).click();
    await expect(folded.locator("#import-report-body")).toBeVisible();
    await expect(folded).toContainText("Vidéo de présentation");

    // « Supprimer » (confirmed) removes it for good.
    page.once("dialog", (d) => void d.accept());
    await folded.getByRole("button", { name: "Supprimer le rapport" }).click();
    await expect(folded).toHaveCount(0);
    await page.reload();
    await expect(page.frameLocator(".gjs-frame").locator("h1", { hasText: HERO })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("import-report")).toHaveCount(0);

    // The page's form settings come pre-filled from the source form.
    const draft = (await (await api(`/pages/${pageId}?depth=0`)).json()) as {
      builder: { html: string };
      form: {
        fields: { name: string; label: string; type: string; required: boolean; options?: { label: string }[] }[];
        submitLabel: string;
        consentPurposeText?: string | null;
        privacyNoticeUrl?: string | null;
        privacyNoticeVersion?: string | null;
      };
    };
    expect(draft.builder.html.match(/data-block="lead-form"/g)).toHaveLength(1);
    expect(draft.form.fields.map((f) => [f.name, f.type, f.required])).toEqual([
      ["email", "email", true],
      ["prenom", "text", false],
      ["jardin", "select", false],
    ]);
    expect(draft.form.fields[2]!.options!.map((o) => o.label)).toEqual(["Petit", "Grand"]);
    expect(draft.form.submitLabel).toBe("Je m'inscris");

    // Publish once the editor has written the success message (nothing else to add).
    const published = await api(`/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "published",
        form: {
          ...draft.form,
          successMessage: `Merci import ${RUN}`,
          consentPurposeText: draft.form.consentPurposeText || "J'accepte d'être recontacté(e).",
          privacyNoticeUrl: draft.form.privacyNoticeUrl || "/privacy",
          privacyNoticeVersion: draft.form.privacyNoticeVersion || "2026-01",
        },
      }),
    });
    expect(published.status, await published.clone().text()).toBe(200);

    // The published page shows every imported section.
    await expect(async () => {
      await page.goto(`${BASE}${path}`);
      await expect(page.getByRole("heading", { level: 1, name: HERO })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 45_000 });
    for (const text of ["Des gestes simples", "Au bon moment", "Sans produits chimiques", "Recevez les conseils de la semaine"]) {
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("« Mes tomates n'ont jamais été aussi belles. »")).toBeVisible();
    await expect(page.getByRole("link", { name: "Je reçois les conseils" }).first()).toBeVisible();
    // A visitor can sign up through the imported form.
    await context.setExtraHTTPHeaders({ "x-real-ip": testClientIp() });
    await page.goto(`${BASE}${path}`);
    await page.getByLabel("Votre email").fill(`import-${RUN}@example.com`);
    await page.getByLabel("Votre prénom").fill("Claire");
    await page.getByRole("checkbox").check(); // the page's own consent control
    await page.waitForTimeout(2200); // the form token's minimum fill time (FR-035)
    await page.getByRole("button", { name: "Je m'inscris" }).click();
    await expect(page.getByText(`Merci import ${RUN}`)).toBeVisible();
    await page.goto(`${BASE}${path}`);
    // The imported pictures are served from the Media library. Fetched from the
    // test process: the image proxy's `*.localhost` host is the runner's own
    // loopback inside the e2e container, so it is reached through the same
    // host alias as the sites (the proxy's signature doesn't cover the host).
    const pictures = page.locator('[data-block="image"] img');
    await expect(pictures).toHaveCount(2);
    const hostAlias = new URL(BASE).hostname;
    for (const img of await pictures.all()) {
      const src = new URL((await img.getAttribute("src"))!, BASE);
      expect(src.hostname).not.toBe("import-fixture");
      if (src.hostname.endsWith(".localhost") && hostAlias !== "localhost" && !hostAlias.endsWith(".localhost")) src.hostname = hostAlias;
      const res = await fetch(src);
      expect(res.status, src.href).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/^image\//);
    }
  });

  test("an internal address is refused before anything is fetched", async ({ context, page }) => {
    await signIn(context);
    await openWizard(page, `Import interne ${RUN}`);
    await page.locator("#wizard-url").fill("http://cms/");
    await page.getByRole("button", { name: "Importer", exact: true }).click();
    await expect(page.locator('form p[role="alert"]')).toHaveText(
      "Cette adresse pointe vers un réseau interne : seules les pages publiques peuvent être importées.",
    );
    await expect(page).toHaveURL(/\/pages\/wizard$/);
  });

  test("leaving the wizard mid-import doesn't cancel it: the imports list links to the draft", async ({ context, page }) => {
    test.setTimeout(90_000);
    await signIn(context);
    const title = `Import quitté ${RUN}`;
    await openWizard(page, title);
    await page.locator("#wizard-url").fill(SOURCE_URL);
    await page.getByRole("button", { name: "Importer", exact: true }).click();
    await expect(page.getByText("Vous pouvez quitter cette page", { exact: false })).toBeVisible({ timeout: 15_000 });

    // Leave straight away.
    await page.goto(`${ADMIN_URL}/collections/page-imports`);
    await expect(async () => {
      await page.reload();
      const row = page.locator("tr", { hasText: title }).filter({ hasText: "Terminé" });
      await expect(row.getByRole("link", { name: "Ouvrir le brouillon" })).toHaveCount(1, { timeout: 2_000 });
    }).toPass({ timeout: 60_000 });

    await page.locator("tr", { hasText: title }).getByRole("link", { name: "Ouvrir le brouillon" }).click();
    await page.waitForURL(/\/admin\/collections\/pages\/\d+$/);
    await expect(page.frameLocator(".gjs-frame").locator("h1", { hasText: HERO })).toBeVisible({ timeout: 20_000 });
  });
});

/**
 * 013-saved-page-import — a page the importer can't load is imported from a
 * copy saved in the editor's browser (fixture copies in
 * fixtures/import-source/saved/). Fixture conversion, like the tests above.
 */
test.describe("import a page from a saved file (013)", () => {
  const SAVED = join(__dirname, "fixtures", "import-source", "saved");

  test.beforeEach(() => {
    test.skip(!token, "no admin token — stack not up / not seeded");
  });

  const importedMediaCount = async (pageId: number) => {
    const draft = (await (await api(`/pages/${pageId}?depth=0`)).json()) as { importedFrom: number };
    const media = (await (await api(`/media?depth=0&where[importedBy][equals]=${draft.importedFrom}`)).json()) as { totalDocs: number };
    return media.totalDocs;
  };

  test("blocked by the site → save help → the saved MHTML imports with the wizard's fields kept", async ({ context, page }) => {
    test.setTimeout(120_000);
    await signIn(context);
    const title = `Import fichier ${RUN}`;
    await openWizard(page, title, `/e2e-import-fichier-${RUN}`);
    await page.locator("#wizard-url").fill("http://import-fixture/blocked-waf");
    await page.getByRole("button", { name: "Importer", exact: true }).click();

    await expect(page.locator('p[role="alert"]')).toContainText("Le site a bloqué la visite automatique", { timeout: 60_000 });
    await expect(page.getByText(/Enregistrer sous… › Page web, un seul fichier/)).toBeVisible();
    await page.getByRole("button", { name: "Importer la page enregistrée" }).click();

    // The other fields are still filled.
    await expect(page.locator("#wizard-title")).toHaveValue(title);
    await expect(page.locator("#wizard-path")).toHaveValue(`/e2e-import-fichier-${RUN}`);
    await page.locator("#wizard-file").setInputFiles(join(SAVED, "fixture.mhtml"));
    await page.getByRole("button", { name: "Importer", exact: true }).click();

    await page.waitForURL(/\/admin\/collections\/pages\/\d+$/, { timeout: 60_000 });
    const pageId = Number(/\/pages\/(\d+)$/.exec(page.url())![1]);
    const report = page.getByTestId("import-report");
    await expect(report).toContainText("Page importée depuis http://import-fixture/index.html");
    await expect(page.frameLocator(".gjs-frame").locator("h1", { hasText: HERO })).toBeVisible({ timeout: 20_000 });
    await expect(page.frameLocator(".gjs-frame").locator('[data-block="column"] > [data-block="lead-form"]')).toHaveCount(1);
    expect(await importedMediaCount(pageId)).toBe(3);
  });

  test("a file that isn't a saved page is refused at once", async ({ context, page }) => {
    await signIn(context);
    await openWizard(page, `Import fichier refusé ${RUN}`);
    await page.getByRole("button", { name: "Vous avez déjà la page enregistrée ?" }).click();
    await page.locator("#wizard-file").setInputFiles({ name: "offre.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") });
    await page.getByRole("button", { name: "Importer", exact: true }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Ce fichier n'est pas une page web enregistrée.");
  });

  test("a page that needs a login offers the file too; the discreet link takes a SingleFile save", async ({ context, page }) => {
    test.setTimeout(120_000);
    await signIn(context);
    await openWizard(page, `Import réservé ${RUN}`);
    await page.locator("#wizard-url").fill("http://import-fixture/members");
    await page.getByRole("button", { name: "Importer", exact: true }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("demande une connexion", { timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Importer la page enregistrée" })).toBeVisible();
    await page.getByRole("button", { name: "Réessayer" }).click();

    // Discreet link: straight to the file input, then back to the address.
    await page.getByRole("button", { name: "Vous avez déjà la page enregistrée ?" }).click();
    await expect(page.locator("#wizard-url")).toHaveCount(0);
    await page.locator("#wizard-file").setInputFiles(join(SAVED, "fixture.singlefile.html"));
    await page.getByRole("button", { name: "Importer", exact: true }).click();
    await page.waitForURL(/\/admin\/collections\/pages\/\d+$/, { timeout: 60_000 });
    const pageId = Number(/\/pages\/(\d+)$/.exec(page.url())![1]);
    await expect(page.getByTestId("import-report")).toContainText("Page importée depuis http://import-fixture/index.html");
    // Images inlined in the file became Media items.
    expect(await importedMediaCount(pageId)).toBe(3);
  });
});
