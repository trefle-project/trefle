/**
 * Side-by-side screens of an evaluation run, for the reviewer's verdict
 * (012 quickstart §4). From the repo root, after run.ts:
 *
 *   npx tsx apps/cms/scripts/import-eval/compare.ts --out ../eval-t070/run2 [label…]
 *
 * For each completed import in `<out>/results.json` (or only the labels
 * given): publishes the draft on the LOCAL site-a at `/eval-<label>-<id>`
 * (as a free page when it has no lead form — comparison only), screenshots
 * the source and the import at 1440 and 390 px (full page, ≤ 12 000 px), and
 * writes `<out>/index.html`. Uses the machine's Playwright Chromium.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright-core";

import { api, arg, type EvalResult } from "./api";

const SITE = process.env.EVAL_SITE_ORIGIN ?? "http://site-a.localhost:3001";
const DEVICES = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

type PageDoc = { builder?: { html?: string }; form?: Record<string, unknown> };

async function publish(r: EvalResult, domainId: number): Promise<string | null> {
  const path = `/eval-${r.label}-${r.importId}`;
  const page = (await api<PageDoc>(`/pages/${r.page}?depth=0`)).body;
  const form = page.form ?? {};
  const hasForm = /data-block="lead-form"/.test(page.builder?.html ?? "");
  const res = await api(`/pages/${r.page}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "published",
      domain: domainId,
      path,
      ...(hasForm ? {} : { pageType: "free" }),
      form: {
        ...form,
        successMessage: form.successMessage || "Merci !",
        consentPurposeText: form.consentPurposeText || "J'accepte d'être recontacté(e).",
        privacyNoticeUrl: form.privacyNoticeUrl || "/privacy",
        privacyNoticeVersion: form.privacyNoticeVersion || "2026-01",
      },
    }),
  });
  if (res.status !== 200) {
    console.log(`${r.label}: publish refused ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    return null;
  }
  return `${SITE}${path}`;
}

async function main() {
  const out = resolve(process.cwd(), arg("out", "../import-eval"));
  const only = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
  const results = (JSON.parse(readFileSync(`${out}/results.json`, "utf8")) as EvalResult[]).filter(
    (r) => r.status === "completed" && r.page && (!only.length || only.includes(r.label)),
  );
  const domains = (await api<{ docs: { id: number }[] }>("/domains?depth=0&limit=50")).body.docs;
  const domain = domains.find((d) => /site-a/.test(JSON.stringify(d)));
  if (!domain) throw new Error("no site-a domain in the local cms");

  const browser = await chromium.launch();
  const done: string[] = [];
  for (const r of results) {
    const importUrl = await publish(r, domain.id);
    if (!importUrl) continue;
    await new Promise((res) => setTimeout(res, 3000)); // renderer revalidation
    for (const d of DEVICES) {
      // A saved page (013) is shown from its file, as the editor saw it.
      const source = r.url.startsWith("file:") ? pathToFileURL(r.url.slice("file:".length)).href : r.url;
      for (const [kind, url] of [["source", source], ["import", importUrl]] as const) {
        const ctx = await browser.newContext({
          viewport: { width: d.width, height: d.height },
          isMobile: d.name === "mobile",
          hasTouch: d.name === "mobile",
          locale: "fr-FR",
        });
        const p = await ctx.newPage();
        try {
          await p.goto(url, { waitUntil: "load", timeout: 45_000 });
          await p.waitForTimeout(1500);
          for (let y = 0; y < 12_000; y += d.height) {
            await p.evaluate((yy) => window.scrollTo(0, yy), y);
            await p.waitForTimeout(80);
          }
          await p.evaluate(() => window.scrollTo(0, 0));
          await p.waitForTimeout(500);
          const h = Math.min(12_000, await p.evaluate(() => document.documentElement.scrollHeight));
          const hscroll = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
          await p.screenshot({ path: `${out}/${r.label}-${d.name}-${kind}.jpg`, type: "jpeg", quality: 70, fullPage: true, clip: { x: 0, y: 0, width: d.width, height: h } });
          console.log(`${r.label} ${d.name} ${kind}: ${h}px${hscroll ? " HORIZONTAL SCROLL" : ""}`);
        } catch (e) {
          console.log(`${r.label} ${d.name} ${kind}: ${(e as Error).message.slice(0, 120)}`);
        }
        await ctx.close();
      }
    }
    done.push(r.label);
  }
  await browser.close();

  const labels = [...new Set([...(JSON.parse(readFileSync(`${out}/results.json`, "utf8")) as EvalResult[]).filter((r) => r.status === "completed").map((r) => r.label)])];
  const section = (l: string) =>
    DEVICES.map(
      (d) =>
        `<h2>${l} — ${d.name} (${d.width} px)</h2><div class="row ${d.name}">` +
        ["source", "import"].map((k) => `<figure><figcaption>${k}</figcaption><img loading="lazy" src="${l}-${d.name}-${k}.jpg"></figure>`).join("") +
        "</div>",
    ).join("");
  writeFileSync(
    `${out}/index.html`,
    `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Évaluation import</title><style>body{font:14px system-ui;margin:16px;background:#f4f4f5}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}.row.mobile{grid-template-columns:repeat(2,390px)}figure{margin:0;background:#fff;padding:6px;border-radius:6px}figcaption{font-weight:600}img{width:100%;display:block}</style><h1>Évaluation import — source / import</h1>${labels.map(section).join("")}`,
  );
  console.log(`captured ${done.length} page(s) — open ${out}/index.html`);
}

void main();
