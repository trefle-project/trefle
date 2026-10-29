import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { FIXTURE_FILE, testClientIp } from "./fixtures";

/**
 * Playwright global setup (B). Guarantees the inputs the specs need against a
 * running stack, then writes `tests/e2e/.artifacts/fixtures.json`:
 *
 *   - a freshly published page with one lead-form block at `<site>/e2e-<run>`
 *   - a freshly captured lead → its unsubscribe URL
 *
 * Everything goes through the public HTTP surface (renderer + CMS REST), so it
 * works the same locally and in the dockerised runner. It never throws the run
 * on a soft failure — specs that still lack an input skip themselves.
 *
 * The page path is unique per run (and stale `/e2e-*` fixtures are removed
 * first) so the renderer never serves a cached 404 for it.
 */
const BASE = process.env.E2E_BASE_URL ?? "http://site-a.localhost:3001";
const CMS_API = process.env.CMS_API_URL ?? "http://localhost:3000/api";
const SITE_HOST = process.env.E2E_SITE_HOST ?? "site-a.localhost";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@trefle.localhost";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "trefle-dev-123";

const PAGE_PREFIX = "/e2e-";
const PAGE_PATH = `${PAGE_PREFIX}${Date.now().toString(36)}`;

const MIN_PROJECT_DATA = {
  pages: [
    {
      frames: [
        {
          component: {
            type: "wrapper",
            components: [
              { tagName: "div", attributes: { "data-block": "hero" }, components: [] },
              { tagName: "div", attributes: { "data-block": "lead-form" }, components: [] },
            ],
          },
        },
      ],
    },
  ],
};
const MIN_HTML = `<div data-block="hero"><h1>Promo</h1></div><div data-block="lead-form"></div>`;
const FORM = {
  fields: [
    { name: "email", label: "Email", type: "email", required: true },
    { name: "firstName", label: "Prénom", type: "text", required: true },
  ],
  submitLabel: "Envoyer",
  successMessage: "Merci !",
  consentPurposeText: "J’accepte d’être recontacté(e) au sujet de cette offre.",
  privacyNoticeUrl: "/privacy",
  privacyNoticeVersion: "2026-01",
};

async function waitForHttp(url: string, headers: Record<string, string>, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { headers });
      if (res.status < 500) return;
      lastErr = `status ${res.status}`;
    } catch (e) {
      lastErr = String(e);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`timed out waiting for ${url} (${lastErr})`);
}

async function adminToken(): Promise<string | null> {
  try {
    const res = await fetch(`${CMS_API}/users/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { token?: string }).token ?? null;
  } catch {
    return null;
  }
}

async function ensurePublishedPage(token: string): Promise<void> {
  const auth = { authorization: `JWT ${token}`, "content-type": "application/json" };

  // domain
  const dq = await fetch(
    `${CMS_API}/domains?where[hostname][equals]=${SITE_HOST}&limit=1`,
    { headers: auth },
  ).then((r) => r.json() as Promise<{ docs: { id: string | number }[] }>);
  let domainId = dq.docs[0]?.id;
  if (!domainId) {
    const created = await fetch(`${CMS_API}/domains`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ hostname: SITE_HOST, isActive: true, label: SITE_HOST }),
    }).then((r) => r.json() as Promise<{ doc: { id: string | number } }>);
    domainId = created.doc.id;
  }

  // 005-content-language-tagging — pages.language is required. Reuse the
  // seeded "fr" language (migration-backfilled on every environment); create
  // it if this DB somehow predates that seed (e.g. a fresh e2e DB without
  // the migration's seed rows, unlikely but cheap to guard).
  const lq = await fetch(`${CMS_API}/languages?where[code][equals]=fr&limit=1`, { headers: auth }).then(
    (r) => r.json() as Promise<{ docs: { id: string | number }[] }>,
  );
  let languageId = lq.docs[0]?.id;
  if (!languageId) {
    const created = await fetch(`${CMS_API}/languages`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ code: "fr", label: "Français", isActive: true }),
    }).then((r) => r.json() as Promise<{ doc: { id: string | number } }>);
    languageId = created.doc.id;
  }

  // drop stale fixture pages from earlier runs (keeps the dev DB tidy and the
  // renderer's route cache clean)
  const stale = await fetch(
    `${CMS_API}/pages?where[path][like]=${encodeURIComponent(PAGE_PREFIX)}&limit=50`,
    { headers: auth },
  ).then((r) => r.json() as Promise<{ docs: { id: string | number }[] }>);
  for (const d of stale.docs ?? []) {
    await fetch(`${CMS_API}/pages/${d.id}`, { method: "DELETE", headers: auth });
  }

  const body = {
    title: "E2E fixture",
    domain: domainId,
    language: languageId,
    path: PAGE_PATH,
    status: "published",
    builder: { projectData: MIN_PROJECT_DATA, html: MIN_HTML, css: "" },
    form: FORM,
  };
  const res = await fetch(`${CMS_API}/pages`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`could not create the e2e page (${res.status}): ${detail.slice(0, 300)}`);
  }
}

/** Poll the rendered page until the form is actually being served (after the
 *  publish revalidation has propagated to the renderer). Returns the HTML. */
async function waitForRenderedForm(timeoutMs = 45_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let html = "";
  while (Date.now() < deadline) {
    html = await fetch(`${BASE}${PAGE_PATH}`, {
      headers: { host: SITE_HOST },
      cache: "no-store",
    }).then((r) => r.text());
    if (/name="formToken"/.test(html)) return html;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return html;
}

async function captureLead(): Promise<string | undefined> {
  const html = await waitForRenderedForm();
  const formToken = /name="formToken" value="([^"]+)"/.exec(html)?.[1];
  const pageId = /name="pageId" value="([^"]+)"/.exec(html)?.[1];
  if (!formToken || !pageId) return undefined;

  await new Promise((r) => setTimeout(r, 2500)); // clear the min fill-time window

  const form = new URLSearchParams({
    pageId,
    formToken,
    email: `e2e-setup-${Date.now()}@example.com`,
    firstName: "Setup",
    consent: "on",
    hp_check: "",
  });
  const res = await fetch(`${BASE}/api/leads`, {
    method: "POST",
    headers: { host: SITE_HOST, "x-real-ip": testClientIp(), "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const out = await res.text();
  const match = /\/unsubscribe\?token=[^"'\s]+/.exec(out)?.[0];
  // The CMS builds the link from the domain hostname with no port; re-anchor it
  // to wherever the renderer actually answers for this run.
  return match ? `${BASE}${match}` : undefined;
}

export default async function globalSetup(): Promise<void> {
  const fixtures: { pageUrl: string; siteHost: string; unsubUrl?: string; adminToken?: string } = {
    pageUrl: `${BASE}${PAGE_PATH}`,
    siteHost: SITE_HOST,
  };

  try {
    // Liveness only — do NOT hit PAGE_PATH yet (a 404 there would get cached by
    // the renderer before the page exists).
    await waitForHttp(BASE, { host: SITE_HOST });
    await waitForHttp(`${CMS_API}/access`, {});

    // The suite's only admin login — spec files reuse this token
    // (fixtures.ts adminToken(): concurrent logins race on Payload's session
    // record and invalidate each other).
    const token = await adminToken();
    if (token) fixtures.adminToken = token;
    if (token) await ensurePublishedPage(token);
    else console.warn(`[e2e setup] no admin token (${ADMIN_EMAIL}) — cannot seed the fixture page`);

    fixtures.unsubUrl = await captureLead();
    if (!fixtures.unsubUrl) console.warn("[e2e setup] could not capture a lead — us3 specs will skip");
  } catch (e) {
    console.warn(`[e2e setup] soft failure: ${String(e)} — specs will skip what they can't run`);
  }

  mkdirSync(dirname(FIXTURE_FILE), { recursive: true });
  writeFileSync(FIXTURE_FILE, JSON.stringify(fixtures, null, 2));
  console.log(`[e2e setup] wrote ${FIXTURE_FILE}`);
}
