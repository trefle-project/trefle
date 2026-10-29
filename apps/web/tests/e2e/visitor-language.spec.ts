import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { adminToken, testClientIp } from "./fixtures";

/**
 * 023-admin-i18n (US6, T064) — Trefle's own visitor texts follow the page's
 * language: an English page's whole lead journey (validation, thank you,
 * e-mail confirmation and unsubscribe links) is English; a French page is
 * unchanged; a Spanish page gets English, marked `lang="en"`.
 */
const CMS_API = process.env.CMS_API_URL ?? "http://localhost:3000/api";
const BASE = process.env.E2E_BASE_URL ?? "http://site-a.localhost:3001";
const SITE_HOST = process.env.E2E_SITE_HOST ?? "site-a.localhost";
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";
const RUN = Date.now().toString(36);

let auth: Record<string, string>;

async function findOrCreate(collection: string, where: string, data: Record<string, unknown>): Promise<string | number> {
  const found = (await fetch(`${CMS_API}/${collection}?${where}&limit=1`, { headers: auth }).then((r) => r.json())) as {
    docs: { id: string | number }[];
  };
  if (found.docs[0]) return found.docs[0].id;
  const res = await fetch(`${CMS_API}/${collection}`, { method: "POST", headers: auth, body: JSON.stringify(data) });
  if (!res.ok) throw new Error(`could not create ${collection}: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { doc: { id: string | number } }).doc.id;
}

async function createPage(code: string, label: string, optIn: boolean): Promise<string> {
  const domain = await findOrCreate("domains", `where[hostname][equals]=${SITE_HOST}`, { hostname: SITE_HOST, isActive: true, label: SITE_HOST });
  const language = await findOrCreate("languages", `where[code][equals]=${code}`, { code, label, isActive: true });
  const optInEmail = optIn
    ? await findOrCreate("opt-in-emails", `where[subject][equals]=E2E visitor language ${code}`, {
        subject: `E2E visitor language ${code}`,
        body: `<p>Confirm: <a href="{{confirmUrl}}">{{confirmUrl}}</a></p>`,
        language,
      })
    : undefined;
  const path = `/e2e-visitor-${code}-${RUN}`;
  const html = `<div data-block="rich-text"><p>Visitor language ${code}</p></div><div data-block="lead-form"></div>`;
  const res = await fetch(`${CMS_API}/pages`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      title: `E2E visitor language ${code} ${RUN}`,
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
                      { tagName: "div", attributes: { "data-block": "rich-text" }, components: [] },
                      { tagName: "div", attributes: { "data-block": "lead-form" }, components: [] },
                    ],
                  },
                },
              ],
            },
          ],
        },
        html,
        css: "",
      },
      // No submit label of the page's own: Trefle's word shows. The success
      // message is the editor's (required to publish) and is never translated.
      form: {
        successMessage: `Editor's thanks (${code})`,
        fields: [
          { name: "email", label: "Email", type: "email", required: true },
          { name: "phone", label: "Phone", type: "tel", required: false },
        ],
        consentPurposeText: "I agree to be contacted.",
        privacyNoticeUrl: "/privacy",
        privacyNoticeVersion: "2026-01",
      },
      ...(optInEmail ? { optInEmail } : {}),
    }),
  });
  if (!res.ok) throw new Error(`could not create the ${code} page: ${res.status} ${await res.text()}`);
  return path;
}

/** A link from the site, on the address the browser reaches the site at. */
const onSite = (url: string) => {
  const u = new URL(url);
  return `${BASE}${u.pathname}${u.search}`;
};

async function open(page: Page, path: string) {
  await page.setExtraHTTPHeaders({ "x-real-ip": testClientIp() });
  await page.goto(`${BASE}${path}`);
  // The form token refuses a submission faster than a person could type.
  await page.waitForTimeout(2500);
}

test.describe("visitor texts in the page's language", () => {
  test.beforeAll(async () => {
    const token = await adminToken();
    test.skip(!token, "no admin token (stack down)");
    auth = { "content-type": "application/json", Authorization: `JWT ${token}` };
  });

  test("an English page's lead journey is English from the form to the e-mail links", async ({ page }) => {
    const path = await createPage("en", "English", true);
    const email = `e2e-visitor-en-${RUN}@example.com`;

    await open(page, path);
    await expect(page.locator(".trefle-page-shell")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("link", { name: "Privacy policy (new window)" })).toBeVisible();
    const blocking = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking.map((v) => v.id)).toEqual([]);

    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Phone/).fill("not a number");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("The field “Phone” must be a valid phone number.")).toBeVisible();
    await expect(page.getByText("You must agree to send the form.")).toBeVisible();

    await page.waitForTimeout(2500);
    await page.getByLabel(/^Phone/).fill("+44 20 7946 0000");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle("Thank you");
    await expect(page.getByText("Editor's thanks (en)")).toBeVisible();
    const unsubscribe = await page.getByRole("link", { name: "withdraw your consent" }).getAttribute("href");

    // The confirmation e-mail's link (the e-mail's own text is the editor's).
    let confirmLink: string | undefined;
    await expect
      .poll(
        async () => {
          const search = (await fetch(`${MAILPIT_URL}/api/v1/search?query=to:${encodeURIComponent(email)}`).then((r) => r.json())) as {
            messages?: { ID: string }[];
          };
          const id = search.messages?.[0]?.ID;
          if (!id) return undefined;
          const message = (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`).then((r) => r.json())) as { HTML?: string };
          confirmLink = /href="([^"]*\/confirm\?token=[^"]+)"/.exec(message.HTML ?? "")?.[1]?.replaceAll("&amp;", "&");
          return confirmLink;
        },
        { timeout: 15_000 },
      )
      .toBeTruthy();

    await page.goto(onSite(confirmLink!));
    await expect(page.getByRole("heading", { name: "Confirm your address" })).toBeVisible();
    await expect(page.locator("main")).toHaveAttribute("lang", "en");
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByRole("heading", { name: "Address confirmed" })).toBeVisible();

    await page.goto(onSite(unsubscribe!));
    await expect(page.getByRole("heading", { name: "Withdraw your consent" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm withdrawal" }).click();
    await expect(page.getByRole("heading", { name: "Consent withdrawn" })).toBeVisible();
    await expect(page.locator("main")).toHaveAttribute("lang", "en");
  });

  test("a French page keeps its French texts", async ({ page }) => {
    const path = await createPage("fr", "Français", false);
    await open(page, path);
    await expect(page.getByRole("link", { name: "Politique de confidentialité (nouvelle fenêtre)" })).toBeVisible();
    await page.getByLabel(/^Email/).fill("pas-un-email");
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.getByText("Adresse email invalide.")).toBeVisible();
    await expect(page.getByText("Vous devez accepter pour envoyer le formulaire.")).toBeVisible();
  });

  test("a Spanish page gets English texts, marked English", async ({ page }) => {
    const path = await createPage("es", "Español", false);
    await open(page, path);
    await expect(page.locator(".trefle-page-shell")).toHaveAttribute("lang", "es");
    const privacy = page.getByRole("link", { name: "Privacy policy (new window)" });
    await expect(privacy).toHaveAttribute("lang", "en");
    await expect(page.getByRole("button", { name: "Send" })).toHaveAttribute("lang", "en");
  });
});
