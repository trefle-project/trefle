/**
 * Saves a page as a single-file MHTML the way Chrome's « Page web, un seul
 * fichier » does (CDP `Page.captureSnapshot`), using the stack's browser.
 * Runs INSIDE the cms container (013-saved-page-import, test material):
 *
 *   docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml \
 *     exec -T -w /app/apps/cms cms ../../node_modules/.bin/tsx scripts/import-eval/save-mhtml.ts <url> > out.mhtml
 *
 * The MHTML goes to stdout. Only for trusted test pages (the fixture site):
 * it does not go through the import's address guard.
 */
import { connectBrowser } from "../../src/lib/import/render";

async function main() {
  const url = process.argv[2];
  if (!url) throw new Error("usage: save-mhtml.ts <url>");
  const browser = await connectBrowser();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto(url, { waitUntil: "load" });
    const cdp = await page.context().newCDPSession(page);
    const { data } = (await cdp.send("Page.captureSnapshot", { format: "mhtml" })) as { data: string };
    process.stdout.write(data);
  } finally {
    await browser.close();
  }
}

void main();
