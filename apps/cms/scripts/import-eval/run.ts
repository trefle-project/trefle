/**
 * One evaluation run: real imports through the LOCAL stack (costs money when
 * the cms runs with a real key — ask before running). From the repo root:
 *
 *   npx tsx apps/cms/scripts/import-eval/run.ts --out ../eval-t070/run2 \
 *     elevalift=https://elevalift.fr/ goldentree=https://sp.goldentree.fr/p/mpr/mpr-p4/
 *
 * A page saved from the browser is given as `label=file:<path>` (013 — for
 * sites that refuse the importer).
 *
 * Options: `--out <dir>` (results.json is appended there, created if needed),
 * `--type subscription|free|confirmation` (default subscription).
 * Prints a one-line summary per page and the run total.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { api, arg, pairs, type EvalResult } from "./api";

type ImportDoc = {
  status: string;
  step: string | null;
  errorCode?: string | null;
  costEur?: number | null;
  costUsd?: number | null;
  aiModel?: string | null;
  page?: number | { id: number } | null;
  report?: unknown;
};

async function main() {
  const out = resolve(process.cwd(), arg("out", "../import-eval"));
  const pageType = arg("type", "subscription");
  mkdirSync(out, { recursive: true });
  const file = `${out}/results.json`;
  const results: EvalResult[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];

  const languages = (await api<{ docs: { id: number; code?: string; name?: string }[] }>("/languages?depth=0&limit=50")).body.docs;
  const fr = languages.find((l) => /fr/i.test(l.code ?? l.name ?? ""));
  if (!fr) throw new Error("no French language in the local cms");

  let total = 0;
  for (const { label, url } of pairs()) {
    const t0 = Date.now();
    const fields = { pageType, title: `Éval — ${label}`, language: fr.id };
    let body: BodyInit;
    if (url.startsWith("file:")) {
      // 013: a page saved from the browser (for sites that refuse the importer).
      const path = resolve(process.cwd(), url.slice("file:".length));
      const form = new FormData();
      form.append("_payload", JSON.stringify(fields));
      form.append("file", new Blob([readFileSync(path)]), basename(path));
      body = form;
    } else {
      body = JSON.stringify({ url, ...fields });
    }
    const start = await api<{ id?: number; errors?: unknown }>("/page-imports/start", { method: "POST", body });
    if (start.status !== 202 || !start.body.id) {
      console.log(`${label}: start refused ${start.status} ${JSON.stringify(start.body)}`);
      continue;
    }
    const steps: EvalResult["steps"] = [];
    let doc: ImportDoc;
    for (;;) {
      doc = (await api<ImportDoc>(`/page-imports/${start.body.id}?depth=0`)).body;
      if (steps.at(-1)?.step !== doc.step) steps.push({ step: doc.step, at: Math.round((Date.now() - t0) / 1000) });
      if (["completed", "failed", "cancelled"].includes(doc.status)) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    const result: EvalResult = {
      label,
      // Saved files are recorded by absolute path so compare.ts can open them.
      url: url.startsWith("file:") ? `file:${resolve(process.cwd(), url.slice("file:".length))}` : url,
      importId: start.body.id,
      status: doc.status,
      errorCode: doc.errorCode ?? null,
      seconds: Math.round((Date.now() - t0) / 1000),
      steps,
      costEur: doc.costEur ?? null,
      costUsd: doc.costUsd ?? null,
      aiModel: doc.aiModel ?? null,
      page: typeof doc.page === "object" ? (doc.page?.id ?? null) : (doc.page ?? null),
      report: doc.report ?? null,
    };
    results.push(result);
    writeFileSync(file, JSON.stringify(results, null, 2));
    total += result.costEur ?? 0;
    console.log(`${label}: ${result.status}${result.errorCode ? ` (${result.errorCode})` : ""} in ${result.seconds}s, €${(result.costEur ?? 0).toFixed(2)}`);
  }
  console.log(`run total €${total.toFixed(2)} — results in ${file}`);
}

void main();
