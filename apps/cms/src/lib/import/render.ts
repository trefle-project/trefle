import type { PageExtract } from "@trefle/grapesjs-page-import/serialize";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright-core";

import type { Tile } from "./convert";
import { ImportError } from "./errors";
import { extractPage, inPage, type DeviceExtract } from "./extract.browser";
import { SAVED_PAGE_FALLBACK_ORIGIN, type SavedFile, type SavedResource } from "./saved-file";
import { IMPORT_UA_TOKEN, guardedAgent, guardedRequest } from "./url-guard";

/**
 * Renders the source page in the `browser` container (012-url-page-import,
 * research R2) and returns its DOM extract and screenshot tiles.
 *
 * One navigation, three widths: desktop (1440×900) is loaded, extracted and
 * screenshotted; the same page is then resized to tablet (820×1180) and
 * mobile (390×844), re-scrolled and re-measured, so every element keeps the
 * id it got at desktop and the extract only adds what differs.
 *
 * Every request the page makes goes through the internal-address guard
 * (research R4): the CMS performs it itself (`guardedRequest`, connections
 * through `guardedAgent`) and hands the response to the browser, so the
 * address checked is the address connected to — a host that resolves to a
 * public address for the check and a private one for the connection (DNS
 * rebinding) is refused. Chromium does not route the target of a redirect
 * handed back to it, so no 3xx ever reaches the browser: a sub-resource's
 * redirects are followed here, hop by hop through the same guard, and the
 * final response delivered; a redirect of the page itself is reported to
 * `renderSource`, which navigates to the target (routed and checked like any
 * request) so the page keeps its real address. A redirect of the page to an
 * internal address fails the import with `private-address`.
 * Audio/video are not loaded (the import omits them anyway).
 */

export type RenderResult = {
  finalUrl: string;
  extract: PageExtract;
  tiles: Tile[];
  truncated: boolean;
  /** `embedded:<n>` image candidates → their `data:` URL (inlined images, 013). */
  embedded: Map<string, string>;
};

const NAV_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;
/** A single resource larger than this is not delivered to the page. */
const MAX_RESOURCE_BYTES = 25 * 1024 * 1024;
/** Request headers the CMS's own connection sets itself. */
const DROP_REQUEST_HEADERS = new Set(["host", "connection", "content-length", "keep-alive", "transfer-encoding", "upgrade"]);
/** Response headers that describe the upstream transfer, not the (already decoded) body. */
const DROP_RESPONSE_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);
const MAX_PAGE_HEIGHT = 12_000;
const TILE_HEIGHT = 2576;
const VIEWPORTS = {
  desktop: { width: 1440, height: 900, maxTiles: 6 },
  tablet: { width: 820, height: 1180, maxTiles: 4 },
  mobile: { width: 390, height: 844, maxTiles: 6 },
} as const;

/** Known cookie / consent / chat widgets, removed before extraction. */
const OVERLAY_SELECTORS = [
  "#onetrust-banner-sdk",
  "#onetrust-consent-sdk",
  "#CybotCookiebotDialog",
  "#didomi-host",
  "#axeptio_overlay",
  "#tarteaucitronRoot",
  ".cc-window",
  ".cookie-banner",
  "#cookie-banner",
  "#cookie-notice",
  "#intercom-container",
  ".intercom-lightweight-app",
  "#hubspot-messages-iframe-container",
  ".crisp-client",
  "#tidio-chat",
  "#launcher",
];

export async function connectBrowser(): Promise<Browser> {
  const ws = process.env.BROWSER_WS_URL;
  if (!ws) throw new ImportError("internal", "BROWSER_WS_URL is not set");
  return chromium.connect(ws, { timeout: 15_000 });
}

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new ImportError("internal", "aborted");
};

class TooLarge extends Error {}

async function readCapped(res: Response): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_RESOURCE_BYTES) {
    await res.body.cancel().catch(() => undefined);
    throw new TooLarge();
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > MAX_RESOURCE_BYTES) throw new TooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * The site refused the automated visit (anti-bot service), as opposed to a
 * page that needs a login: a 429, a Cloudflare challenge, or a 401/403 served
 * by a bot-protection service (Cloudflare, Akamai, DataDome, Imperva, Sucuri).
 * The import does not try to get past these: the editor is told the site
 * blocks automated visits.
 */
export function isBotProtection(status: number, headers: Record<string, string>): boolean {
  if (status === 429 || headers["cf-mitigated"] === "challenge") return true;
  if (status !== 401 && status !== 403) return false;
  const server = (headers["server"] ?? "").toLowerCase();
  return (
    /cloudflare|akamaighost|sucuri|imperva|incapsula|ddos-guard/.test(server) ||
    "cf-ray" in headers ||
    "x-datadome" in headers ||
    "x-iinfo" in headers ||
    "x-sucuri-id" in headers
  );
}

export type GuardedContextEvents = {
  /** The page's own navigation was refused (internal address). */
  onBlockedNavigation: () => void;
  /** The page's own navigation answered with a redirect to `url` (the request is aborted). */
  onMainRedirect?: (url: string) => void;
  /** 013: requests answered from a saved file instead of the network. */
  fromFile?: (url: string) => SavedResource | undefined;
  /** 013: the only main-frame address allowed; any other navigation (meta refresh…) is cancelled. */
  lockMainFrameTo?: string;
};

const isRedirect = (status: number) => [301, 302, 303, 307, 308].includes(status);

/** A context whose every request is performed by the CMS through the internal-address guard. */
export async function guardedContext(browser: Browser, events: GuardedContextEvents): Promise<BrowserContext> {
  const context = await browser.newContext({
    userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/${browser.version()} Safari/537.36 ${IMPORT_UA_TOKEN}`,
    viewport: { width: VIEWPORTS.desktop.width, height: VIEWPORTS.desktop.height },
    serviceWorkers: "block",
    acceptDownloads: false,
    locale: "fr-FR",
  });
  const agent = guardedAgent();
  context.on("close", () => void agent.close().catch(() => undefined));

  await context.route("**/*", async (route: Route) => {
    const request = route.request();
    const isMainNavigation = request.isNavigationRequest() && request.frame().parentFrame() === null;
    if (request.resourceType() === "media") return route.abort("blockedbyclient").catch(() => undefined);
    // ERR_ABORTED leaves the current page in place (no error page replaces it).
    if (isMainNavigation && events.lockMainFrameTo && request.url() !== events.lockMainFrameTo) {
      return route.abort("aborted").catch(() => undefined);
    }
    const local = events.fromFile?.(request.url());
    if (local) {
      return route
        .fulfill({ status: 200, contentType: local.contentType, headers: local.headers, body: local.data })
        .catch(() => undefined);
    }
    try {
      const headers = Object.fromEntries(
        Object.entries(await request.allHeaders()).filter(([k]) => !k.startsWith(":") && !DROP_REQUEST_HEADERS.has(k.toLowerCase())),
      );
      const signal = AbortSignal.timeout(NAV_TIMEOUT_MS);
      let url = request.url();
      let method = request.method();
      let body = request.postDataBuffer() ?? undefined;
      let res = await guardedRequest(url, { method, headers, body, agent, signal });
      for (let hop = 0; isRedirect(res.status) && res.headers.get("location"); hop++) {
        const target = new URL(res.headers.get("location")!, url).href;
        await res.body?.cancel().catch(() => undefined);
        if (isMainNavigation && events.onMainRedirect) {
          events.onMainRedirect(target);
          return route.abort("aborted").catch(() => undefined);
        }
        if (hop >= MAX_REDIRECTS) return route.abort().catch(() => undefined);
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
          method = "GET";
          body = undefined;
        }
        url = target;
        res = await guardedRequest(url, { method, headers, body, agent, signal });
      }
      const payload = await readCapped(res);
      const out: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        if (!DROP_RESPONSE_HEADERS.has(key) && key !== "set-cookie" && key !== "location") out[key] = value;
      });
      const cookies = res.headers.getSetCookie();
      if (cookies.length) out["set-cookie"] = cookies.join("\n");
      return await route.fulfill({ status: res.status, headers: out, body: payload });
    } catch (e) {
      if (e instanceof ImportError && (e.code === "private-address" || e.code === "invalid-url")) {
        if (isMainNavigation) events.onBlockedNavigation();
        return route.abort("blockedbyclient").catch(() => undefined);
      }
      // Too large, network error, timeout, context closing: nothing to deliver.
      return route.abort().catch(() => undefined);
    }
  });
  // No WebSockets: a landing page renders without them, and they would
  // escape the per-request guard above.
  await context.routeWebSocket(/.*/, (ws) => ws.close());
  return context;
}

async function autoScroll(page: Page, signal?: AbortSignal) {
  // Scroll down a screen at a time so lazy content loads, then back to the top.
  for (let step = 0; step < 30; step++) {
    throwIfAborted(signal);
    const done = await page.evaluate((max) => {
      window.scrollBy(0, window.innerHeight);
      return window.scrollY + window.innerHeight >= Math.min(document.documentElement.scrollHeight, max);
    }, MAX_PAGE_HEIGHT);
    await page.waitForTimeout(150);
    if (done) break;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
}

async function removeOverlays(page: Page) {
  await page.evaluate((selectors) => {
    for (const sel of selectors) document.querySelectorAll(sel).forEach((el) => el.remove());
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      const r = el.getBoundingClientRect();
      // Fixed layers (banners, modals, chat) and large sticky ones go; a
      // slim sticky header is put back in the flow so it's extracted once.
      const large = r.height > 120 || (r.width * r.height) / (vw * vh) > 0.25;
      if (cs.position === "fixed" || large) el.remove();
      else (el as HTMLElement).style.position = "static";
    }
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
  }, OVERLAY_SELECTORS);
}

async function takeTiles(page: Page, device: Tile["device"], width: number, maxTiles: number): Promise<{ tiles: Tile[]; truncated: boolean }> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const limit = Math.min(height, MAX_PAGE_HEIGHT, maxTiles * TILE_HEIGHT);
  const tiles: Tile[] = [];
  for (let y = 0, index = 0; y < limit; y += TILE_HEIGHT, index++) {
    const png = await page.screenshot({
      fullPage: true,
      clip: { x: 0, y, width, height: Math.min(TILE_HEIGHT, limit - y) },
      animations: "disabled",
    });
    tiles.push({ device, index, width, top: y, png });
  }
  return { tiles, truncated: height > limit };
}

function mergeDevice(extract: PageExtract, device: "tablet" | "mobile", diffs: DeviceExtract) {
  for (const item of [...extract.texts, ...extract.images]) {
    const diff = diffs[item.id];
    if (diff) item.devices = { ...item.devices, [device]: diff };
  }
}

/** What a loaded page yields: its extract (at three widths), its tiles, its inlined images. */
async function capture(page: Page, signal?: AbortSignal): Promise<Omit<RenderResult, "finalUrl">> {
  await autoScroll(page, signal);
  await removeOverlays(page);
  const raw = (await inPage(page, extractPage, "desktop")) as PageExtract & { embedded?: string[] };
  // Inlined images leave the extract (it goes to the model) for a side map.
  const { embedded: inlined = [], ...extract } = raw;
  const embedded = new Map(inlined.map((data, n) => [`embedded:${n}`, data] as const));
  if (extract.texts.length === 0 && extract.images.length === 0) throw new ImportError("unreachable", "empty page");
  const desktop = await takeTiles(page, "desktop", VIEWPORTS.desktop.width, VIEWPORTS.desktop.maxTiles);
  const tiles = [...desktop.tiles];

  for (const device of ["tablet", "mobile"] as const) {
    throwIfAborted(signal);
    const vp = VIEWPORTS[device];
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(300);
    await autoScroll(page, signal);
    mergeDevice(extract, device, (await inPage(page, extractPage, "device")) as DeviceExtract);
    tiles.push(...(await takeTiles(page, device, vp.width, vp.maxTiles)).tiles);
  }
  return { extract, tiles, truncated: desktop.truncated, embedded };
}

/**
 * Display a page saved from the editor's browser (013-saved-page-import,
 * research S2): the page itself answered from the file under its original
 * address (or a placeholder one), with a Content-Security-Policy that stops
 * all of its scripts, workers, plugins and frames (FR-004) — the import's own
 * extraction runs from outside the page and is unaffected, which it isn't
 * with JavaScript switched off in the browser; the main frame can't navigate
 * away (meta refresh); the file's own resources are answered from it too; any
 * other request goes through the guard exactly as for an address import.
 */
const SAVED_PAGE_CSP = "script-src 'none'; worker-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; base-uri 'none'";

export async function renderSavedFile(browser: Browser, file: SavedFile, signal?: AbortSignal): Promise<RenderResult> {
  const mainUrl = file.originalUrl ?? `${SAVED_PAGE_FALLBACK_ORIGIN}/`;
  const main: SavedResource = {
    contentType: "text/html; charset=utf-8",
    data: Buffer.from(file.html, "utf8"),
    headers: { "content-security-policy": SAVED_PAGE_CSP },
  };
  const context = await guardedContext(browser, {
    onBlockedNavigation: () => undefined,
    lockMainFrameTo: new URL(mainUrl).href,
    fromFile: (url) => {
      let key: string;
      try {
        key = new URL(url).href;
      } catch {
        return undefined;
      }
      return key === new URL(mainUrl).href ? main : file.resources.get(key);
    },
  });
  const onAbort = () => void context.close().catch(() => undefined);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const page = await context.newPage();
    try {
      await page.goto(mainUrl, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
    } catch (e) {
      throwIfAborted(signal);
      throw new ImportError("not-html", String(e));
    }
    throwIfAborted(signal);
    const captured = await capture(page, signal);
    const finalUrl = file.originalUrl ?? "";
    return { ...captured, finalUrl, extract: { ...captured.extract, url: finalUrl } };
  } catch (e) {
    throwIfAborted(signal);
    throw e;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await context.close().catch(() => undefined);
  }
}

/** Load `url` and return its extract and tiles. The caller has already validated the URL. */
export async function renderSource(browser: Browser, url: string, signal?: AbortSignal): Promise<RenderResult> {
  let blockedNavigation = false;
  let redirectTo: string | null = null;
  const context = await guardedContext(browser, {
    onBlockedNavigation: () => {
      blockedNavigation = true;
    },
    onMainRedirect: (target) => {
      redirectTo = target;
    },
  });
  const onAbort = () => void context.close().catch(() => undefined);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const page = await context.newPage();
    let response;
    // The page's redirects are followed by navigating to each target, so every
    // hop is routed through the guard and the page ends up at its real address.
    for (let target = url, hop = 0; ; hop++) {
      redirectTo = null;
      try {
        response = await page.goto(target, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
        break;
      } catch (e) {
        throwIfAborted(signal);
        if (blockedNavigation) throw new ImportError("private-address", "navigation blocked");
        const next: string | null = redirectTo;
        if (next === null) throw new ImportError("unreachable", String(e));
        if (hop >= MAX_REDIRECTS) throw new ImportError("unreachable", "too many redirects");
        target = next;
      }
    }
    if (blockedNavigation) throw new ImportError("private-address", "navigation blocked");
    if (!response) throw new ImportError("unreachable", "no response");
    const status = response.status();
    const headers = response.headers();
    if (isBotProtection(status, headers)) throw new ImportError("blocked", String(status));
    if (status === 401 || status === 403) throw new ImportError("login-required", String(status));
    if (status >= 400) throw new ImportError("unreachable", String(status));
    const type = headers["content-type"] ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) throw new ImportError("not-html", type);

    throwIfAborted(signal);
    const captured = await capture(page, signal);
    return { ...captured, finalUrl: page.url(), extract: { ...captured.extract, url: page.url() } };
  } catch (e) {
    throwIfAborted(signal);
    throw e;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await context.close().catch(() => undefined);
  }
}
