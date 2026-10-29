/**
 * Render-only dry run of the page import — no Claude call, no cost.
 * Runs INSIDE the cms container (it needs the `browser` service):
 *
 *   docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml \
 *     exec -T -w /app/apps/cms cms ../../node_modules/.bin/tsx scripts/import-eval/render.ts <url>...
 *
 * Prints one JSON line per URL: reachable or the import error code
 * (`blocked`, `login-required`…), tiles per device, extract size and a rough
 * input-token estimate (tiles by pixel area / 750, text by length / 3.5).
 */
import { connectBrowser, renderSource } from "../../src/lib/import/render";
import { assertPublicHttpUrl } from "../../src/lib/import/url-guard";

async function main() {
  for (const url of process.argv.slice(2)) {
    const t0 = Date.now();
    const browser = await connectBrowser();
    try {
      await assertPublicHttpUrl(url);
      const r = await renderSource(browser, url);
      const tiles: Record<string, number> = {};
      let imageTokens = 0;
      for (const t of r.tiles) {
        tiles[t.device] = (tiles[t.device] ?? 0) + 1;
        imageTokens += Math.ceil((t.png.readUInt32BE(16) * t.png.readUInt32BE(20)) / 750);
      }
      const extractChars = JSON.stringify(r.extract).length;
      console.log(
        JSON.stringify({
          url,
          ok: true,
          seconds: Math.round((Date.now() - t0) / 1000),
          finalUrl: r.finalUrl,
          truncated: r.truncated,
          tiles,
          texts: r.extract.texts.length,
          images: r.extract.images.length,
          forms: r.extract.forms.length,
          extractKB: Math.round(extractChars / 1024),
          estInputTokens: imageTokens + Math.ceil((extractChars + 6000) / 3.5),
        }),
      );
    } catch (e) {
      console.log(JSON.stringify({ url, ok: false, seconds: Math.round((Date.now() - t0) / 1000), error: (e as { code?: string }).code ?? String(e) }));
    } finally {
      await browser.close().catch(() => undefined);
    }
  }
}

void main();
