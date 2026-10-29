import { DEVICE_PREVIEW_WIDTHS } from "@trefle/grapesjs-page-import/layout";
import type { DeviceCheck } from "@trefle/grapesjs-page-import/serialize";
import type { Browser } from "playwright-core";

import { inPage } from "./extract.browser";

/**
 * Automatic check of an imported page at each of the editor's device widths
 * (012-url-page-import, research R16, FR-011c): 1440 / 770 / 568 / 320 px.
 * The generated html + css is loaded with `setContent` in a context with no
 * network (image requests get a neutral placeholder), wrapped in the public
 * renderer's own base CSS, and measured:
 *
 * - `horizontal-scroll`: the document is wider than the viewport;
 * - `small-text`: visible text whose computed font-size is under 14px;
 * - `small-target`: a button (or a link styled as one) under 44px in either
 *   dimension, or a standalone text link — a link that is its paragraph's
 *   whole text, such as a card title — under 24px (WCAG 2.2 2.5.8); links
 *   inside a sentence are exempt;
 * - `overflow`: a block or image whose right edge passes the viewport.
 *
 * Findings only feed the import report; they never fail an import.
 */

/** apps/web/src/app/globals.css — the shell published pages render in. */
const RENDERER_BASE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#171717;background:#fff}
img{max-width:100%;height:auto}
.trefle-page-shell{min-height:100vh;display:flow-root}
`;

const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="100%" height="100%" fill="#e5e7eb"/></svg>';

const MAX_PER_DEVICE = 20;

type Finding = Omit<DeviceCheck, "device">;

/** Runs in the page: measures the current viewport. Self-contained (shipped as source). */
function measure(): Finding[] {
  const vw = document.documentElement.clientWidth;
  const found: Finding[] = [];
  const where = (el: Element) => {
    const block = el.closest("[data-block]")?.getAttribute("data-block") ?? "page";
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    return text ? `${block} « ${text} »` : block;
  };
  const shown = (el: Element) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
  };

  if (document.documentElement.scrollWidth > vw + 1) {
    found.push({ kind: "horizontal-scroll", where: "page", detail: `${document.documentElement.scrollWidth}px > ${vw}px` });
  }

  const all = Array.from(document.body.querySelectorAll("*"));
  for (const el of all) {
    if (!shown(el)) continue;
    const ownText = Array.from(el.childNodes).some((c) => c.nodeType === Node.TEXT_NODE && (c.textContent ?? "").trim());
    if (ownText) {
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 14) found.push({ kind: "small-text", where: where(el), detail: `${size}px` });
    }
    // Buttons: <button>, and links styled as one (inline-block / block).
    const isButton = el.tagName === "BUTTON" || (el.tagName === "A" && getComputedStyle(el).display !== "inline");
    // A link is "standalone" when it is its parent's only content (not a link inside a sentence).
    const standaloneLink =
      el.tagName === "A" && (el.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim() === (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (isButton || standaloneLink) {
      const r = el.getBoundingClientRect();
      const min = isButton ? 44 : 24;
      if (r.width < min || r.height < min) {
        found.push({ kind: "small-target", where: where(el), detail: `${Math.round(r.width)}×${Math.round(r.height)}px` });
      }
    }
    if (el.hasAttribute("data-block") || el.tagName === "IMG") {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1) found.push({ kind: "overflow", where: where(el), detail: `${Math.round(r.right)}px > ${vw}px` });
    }
  }
  return found;
}

export async function deviceCheck(browser: Browser, html: string, css: string): Promise<DeviceCheck[]> {
  const context = await browser.newContext({ serviceWorkers: "block", javaScriptEnabled: false });
  try {
    // No network at all: images get a neutral same-for-all placeholder, the rest is refused.
    await context.route("**/*", (route) =>
      route.request().resourceType() === "image"
        ? route.fulfill({ status: 200, contentType: "image/svg+xml", body: PLACEHOLDER_SVG })
        : route.abort(),
    );
    const page = await context.newPage();
    const results: DeviceCheck[] = [];
    for (const [device, width] of Object.entries(DEVICE_PREVIEW_WIDTHS) as [DeviceCheck["device"], number][]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(
        `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">` +
          `<style>${RENDERER_BASE_CSS}</style><style>${css}</style></head>` +
          `<body><div class="trefle-page-shell">${html}</div></body></html>`,
        { waitUntil: "load" },
      );
      const seen = new Set<string>();
      for (const f of await inPage(page, measure, null)) {
        const key = `${f.kind}|${f.where}`;
        if (seen.has(key) || seen.size >= MAX_PER_DEVICE) continue;
        seen.add(key);
        results.push({ device, ...f });
      }
    }
    return results;
  } finally {
    await context.close().catch(() => undefined);
  }
}
