import { expect, test } from "@playwright/test";

import { adminToken } from "./fixtures";

/**
 * 003-post-launch-improvements smoke (FR-010/FR-011/FR-012/FR-013). Builds
 * its own fixtures via the CMS REST API (same pattern as global-setup.ts)
 * rather than sharing the suite's single fixture page, since it needs two
 * distinct landing pages each pointing at its own confirmation page.
 *
 * Note (discovered while writing this fixture): a confirmation page is an
 * ordinary `pages` document, so pages-publish-guard.ts's "exactly one
 * lead-form block" rule applies to it too — a confirmation page cannot be
 * published without one, even though it's not meant to be submitted itself.
 * Out of scope to relax here (not part of this feature's approved plan);
 * flagged as a follow-up.
 */
const CMS_API = process.env.CMS_API_URL ?? "http://localhost:3000/api";
const BASE = process.env.E2E_BASE_URL ?? "http://site-a.localhost:3001";
const SITE_HOST = process.env.E2E_SITE_HOST ?? "site-a.localhost";

const RUN = Date.now().toString(36);

const FORM = {
  fields: [{ name: "email", label: "Email", type: "email", required: true }],
  submitLabel: "Envoyer",
  successMessage: "Merci (générique)",
  consentPurposeText: "J'accepte.",
  privacyNoticeUrl: "/privacy",
  privacyNoticeVersion: "2026-01",
};

function minBuilder(marker: string) {
  return {
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
    html: `<div data-block="rich-text"><p>${marker} — lien : {{unsubscribeUrl}}</p></div><div data-block="lead-form"></div>`,
    css: "",
  };
}

async function domainId(auth: HeadersInit): Promise<string | number | undefined> {
  const dq = (await fetch(`${CMS_API}/domains?where[hostname][equals]=${SITE_HOST}&limit=1`, { headers: auth }).then((r) =>
    r.json(),
  )) as { docs: { id: string | number }[] };
  if (dq.docs[0]) return dq.docs[0].id;
  const created = (await fetch(`${CMS_API}/domains`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ hostname: SITE_HOST, isActive: true, label: SITE_HOST }),
  }).then((r) => r.json())) as { doc: { id: string | number } };
  return created.doc.id;
}

// 005-content-language-tagging — pages.language is required. Same
// find-or-create shape as domainId() above.
async function languageId(auth: HeadersInit): Promise<string | number | undefined> {
  const lq = (await fetch(`${CMS_API}/languages?where[code][equals]=fr&limit=1`, { headers: auth }).then((r) =>
    r.json(),
  )) as { docs: { id: string | number }[] };
  if (lq.docs[0]) return lq.docs[0].id;
  const created = (await fetch(`${CMS_API}/languages`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ code: "fr", label: "Français", isActive: true }),
  }).then((r) => r.json())) as { doc: { id: string | number } };
  return created.doc.id;
}

async function createPage(
  auth: HeadersInit,
  domain: string | number,
  path: string,
  marker: string,
  confirmationPage?: string | number,
): Promise<{ id: string | number; path: string }> {
  const res = await fetch(`${CMS_API}/pages`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      title: `E2E confirmation fixture ${marker}`,
      domain,
      language: await languageId(auth),
      path,
      status: "published",
      builder: minBuilder(marker),
      form: FORM,
      ...(confirmationPage ? { confirmationPage } : {}),
    }),
  });
  if (!res.ok) throw new Error(`could not create fixture page ${path}: ${res.status} ${await res.text()}`);
  const { doc } = (await res.json()) as { doc: { id: string | number; path: string } };
  return doc;
}

let nextTestIp = 1;
/**
 * Every spec in the e2e suite shares one connecting-client identity in this
 * environment (no Caddy in front, plain container-to-container fetch — see
 * apps/web/src/app/api/leads/route.ts's X-Real-IP-first, then
 * X-Forwarded-For's-last-hop fallback), so this file's own submissions would
 * otherwise compete for the same 10/min rate-limit bucket as every other
 * spec and as each other. Give each submission its own X-Real-IP — a
 * realistic simulation of distinct visitors, and exactly the header this
 * feature (FR-001) trusts.
 */
async function submit(landingPath: string): Promise<string> {
  const clientIp = `203.0.113.${nextTestIp++}`;
  const html = await fetch(`${BASE}${landingPath}`, { headers: { host: SITE_HOST }, cache: "no-store" }).then((r) => r.text());
  const formToken = /name="formToken" value="([^"]+)"/.exec(html)?.[1];
  const pageId = /name="pageId" value="([^"]+)"/.exec(html)?.[1];
  if (!formToken || !pageId) throw new Error(`no form found on ${landingPath}`);
  await new Promise((r) => setTimeout(r, 2500)); // clear the min fill-time window
  const body = new URLSearchParams({
    pageId,
    formToken,
    email: `e2e-confirm-${Date.now()}@example.com`,
    consent: "on",
    hp_check: "",
  });
  const res = await fetch(`${BASE}/api/leads`, {
    method: "POST",
    headers: { host: SITE_HOST, "x-real-ip": clientIp, "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  return res.text();
}

test("a landing page with a confirmation page shows it, with the unsubscribe link resolved", async () => {
  const token = await adminToken();
  test.skip(!token, "no admin token — stack not up / not seeded");
  const auth = { authorization: `JWT ${token}`, "content-type": "application/json" };
  const domain = await domainId(auth);

  const confirmation = await createPage(auth, domain!, `/e2e-confirm-${RUN}`, `CONF-${RUN}`);
  const landing = await createPage(auth, domain!, `/e2e-landing-${RUN}`, `LANDING-${RUN}`, confirmation.id);

  const body = await submit(landing.path);
  expect(body).toContain(`CONF-${RUN}`);
  expect(body).not.toContain("{{unsubscribeUrl}}");
  expect(body).toMatch(/\/unsubscribe\?token=/);
  // Note: not asserting the generic message's literal absence here — Next
  // embeds the page's raw searchParams (including `fallback=...`) in the
  // RSC hydration payload regardless of which branch actually rendered, so
  // that text can appear in an invisible <script> blob without ever being
  // shown to a visitor. The visible-content assertions above are what matter.
});

test("two landing pages with two different confirmation pages each show their own", async () => {
  const token = await adminToken();
  test.skip(!token, "no admin token — stack not up / not seeded");
  const auth = { authorization: `JWT ${token}`, "content-type": "application/json" };
  const domain = await domainId(auth);

  const confA = await createPage(auth, domain!, `/e2e-confirm-a-${RUN}`, `CONF-A-${RUN}`);
  const confB = await createPage(auth, domain!, `/e2e-confirm-b-${RUN}`, `CONF-B-${RUN}`);
  const landingA = await createPage(auth, domain!, `/e2e-landing-a-${RUN}`, `LANDING-A-${RUN}`, confA.id);
  const landingB = await createPage(auth, domain!, `/e2e-landing-b-${RUN}`, `LANDING-B-${RUN}`, confB.id);

  const bodyA = await submit(landingA.path);
  expect(bodyA).toContain(`CONF-A-${RUN}`);
  expect(bodyA).not.toContain(`CONF-B-${RUN}`);

  const bodyB = await submit(landingB.path);
  expect(bodyB).toContain(`CONF-B-${RUN}`);
  expect(bodyB).not.toContain(`CONF-A-${RUN}`);
});

test("a landing page with no confirmation page selected still shows the generic message", async () => {
  const token = await adminToken();
  test.skip(!token, "no admin token — stack not up / not seeded");
  const auth = { authorization: `JWT ${token}`, "content-type": "application/json" };
  const domain = await domainId(auth);

  const landing = await createPage(auth, domain!, `/e2e-landing-none-${RUN}`, `LANDING-NONE-${RUN}`);
  const body = await submit(landing.path);
  expect(body).toContain("Merci (générique)");
});
