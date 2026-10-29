import type { DeviceDiff, PageExtract } from "@trefle/grapesjs-page-import/serialize";
import type { Page } from "playwright-core";

/**
 * DOM extract of a rendered page (012-url-page-import, research R2/R3,
 * data-model.md "DOM extract"). Runs INSIDE the source page through
 * `page.evaluate(extractPage, pass)`: Playwright ships the function's source
 * text, so it must stay self-contained — no imports, no module-level
 * helpers, only what's declared inside it.
 *
 * `"desktop"`: numbers every visible text unit, image, form and unsupported
 * element in DOM order (`t1…`, `i1…`, `f1…`), tags the elements with
 * `data-trefle-id` and remembers their desktop box and styles.
 * `"device"`: after the page is resized, returns for the same ids only what
 * changed — box, hidden, and the whitelisted computed styles that differ.
 *
 * Texts keep only safe inline markup (`b strong i em u s br a[href]`, hrefs
 * absolute), escaped exactly as GrapesJS exports text, so the serializer can
 * insert them verbatim (`isSafeInlineHtml`).
 */
export type ExtractPass = "desktop" | "device";
export type DeviceExtract = Record<string, DeviceDiff>;

/**
 * Runs a self-contained function in the page with one JSON argument. The
 * source is shipped as text, preceded by a no-op `__name`: some TypeScript
 * transpilers (esbuild with keepNames — tsx, vitest) wrap named inner
 * functions in that helper, which doesn't exist in the page.
 */
export function inPage<A, R>(page: Page, fn: (arg: A) => R, arg: A): Promise<R> {
  return page.evaluate(`(() => { const __name = (f) => f; return (${fn.toString()})(${JSON.stringify(arg)}); })()`) as Promise<R>;
}

export function extractPage(pass: ExtractPass): PageExtract | DeviceExtract {
  const MAX_TEXTS = 800;
  const MAX_IMAGES = 120;
  const MAX_TEXT_LENGTH = 4000;
  const STYLE_KEYS = [
    "color",
    "backgroundColor",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "fontFamily",
    "textAlign",
    "lineHeight",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderRadius",
  ] as const;
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "HEAD", "META", "LINK", "IFRAME", "VIDEO", "AUDIO", "CANVAS", "OBJECT", "EMBED", "SELECT", "OPTION", "TEXTAREA"]);
  const UNSUPPORTED: Record<string, string> = { VIDEO: "video", IFRAME: "iframe", CANVAS: "canvas", TABLE: "table", OBJECT: "iframe", EMBED: "iframe" };
  const FORMATTING = new Set(["B", "STRONG", "I", "EM", "U", "S"]);
  const state = window as unknown as { __trefleDesktop?: Record<string, { box: Box; style: Record<string, string> }> };

  type Box = { x: number; y: number; width: number; height: number };

  function boxOf(el: Element): Box {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), width: Math.round(r.width), height: Math.round(r.height) };
  }

  function visible(el: Element): boolean {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function hex(value: string): string {
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(value);
    if (!m) return value;
    if (m[4] !== undefined && Number(m[4]) === 0) return "transparent";
    return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  }

  function effectiveBackground(el: Element): string {
    for (let cur: Element | null = el; cur; cur = cur.parentElement) {
      const bg = hex(getComputedStyle(cur).backgroundColor);
      if (bg !== "transparent" && bg.startsWith("#")) return bg;
    }
    return "#ffffff";
  }

  function stylesOf(el: Element): Record<string, string> {
    const cs = getComputedStyle(el);
    const out: Record<string, string> = {};
    for (const key of STYLE_KEYS) {
      const v = key === "backgroundColor" ? effectiveBackground(el) : key === "color" ? hex(cs.color) : cs[key];
      if (v) out[key] = key === "fontFamily" ? v.split(",")[0]!.trim().replace(/^["']|["']$/g, "") : v;
    }
    return out;
  }

  function absolute(url: string | null | undefined): string | undefined {
    if (!url) return undefined;
    try {
      const u = new URL(url, document.baseURI);
      return /^(https?:|mailto:|tel:)$/.test(u.protocol) ? u.href : undefined;
    } catch {
      return undefined;
    }
  }

  const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

  /** Safe inline markup of a text unit's content, whitespace collapsed. */
  function inlineHtml(node: Node, insideLink: boolean): string {
    if (node.nodeType === Node.TEXT_NODE) return escText((node.textContent ?? "").replace(/[ \t\n\r\f]+/g, " "));
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    if (SKIP.has(el.tagName.toUpperCase()) || el.tagName === "IMG") return "";
    if (getComputedStyle(el).display === "none") return "";
    if (el.tagName === "BR") return "<br/>";
    const inner = Array.from(el.childNodes).map((c) => inlineHtml(c, insideLink || el.tagName === "A")).join("");
    if (FORMATTING.has(el.tagName)) return inner.trim() ? `<${el.tagName.toLowerCase()}>${inner}</${el.tagName.toLowerCase()}>` : inner;
    if (el.tagName === "A" && !insideLink) {
      const href = absolute(el.getAttribute("href"));
      return href && inner.trim() ? `<a href="${escAttr(href)}">${inner}</a>` : inner;
    }
    return inner;
  }

  const tidy = (html: string) => html.replace(/^(?: |<br\/>)+|(?: |<br\/>)+$/g, "").replace(/ {2,}/g, " ");

  if (pass === "device") {
    const desktop = state.__trefleDesktop ?? {};
    const out: Record<string, DeviceDiff> = {};
    for (const el of Array.from(document.querySelectorAll("[data-trefle-id]"))) {
      const id = el.getAttribute("data-trefle-id")!;
      const before = desktop[id];
      if (!before) continue;
      if (!visible(el)) {
        out[id] = { hidden: true };
        continue;
      }
      const diff: DeviceDiff = { box: boxOf(el) };
      const style = stylesOf(el);
      const changed = Object.fromEntries(Object.entries(style).filter(([k, v]) => before.style[k] !== v));
      if (Object.keys(changed).length) diff.style = changed;
      out[id] = diff;
    }
    return out;
  }

  // ---- desktop pass
  const snapshot: Record<string, { box: Box; style: Record<string, string> }> = {};
  const extract: PageExtract = {
    url: location.href,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    texts: [],
    images: [],
    forms: [],
    unsupported: [],
    fonts: [],
  };
  const fonts = new Set<string>();
  // 013-saved-page-import: images inlined in a saved page (`data:image/…`)
  // are listed apart and referenced by a short token, so the extract sent to
  // the model never carries their base64 (render.ts moves them out).
  const embedded: string[] = [];
  const embeddedIndex = new Map<string, number>();
  const candidate = (u: string | null | undefined): string | undefined => {
    if (u && /^data:image\//i.test(u)) {
      let n = embeddedIndex.get(u);
      if (n === undefined) {
        n = embedded.push(u) - 1;
        embeddedIndex.set(u, n);
      }
      return `embedded:${n}`;
    }
    const a = absolute(u);
    return a && /^https?:/.test(a) ? a : undefined;
  };
  const claimed = new Set<Element>();
  let t = 0;
  let i = 0;
  let f = 0;

  const tag = (el: Element, id: string) => {
    el.setAttribute("data-trefle-id", id);
    snapshot[id] = { box: boxOf(el), style: stylesOf(el) };
  };
  const insideClaimed = (el: Element) => {
    for (let cur: Element | null = el; cur; cur = cur.parentElement) if (claimed.has(cur)) return true;
    return false;
  };

  /** The block-level element a piece of text belongs to (climbs out of inline wrappers). */
  function unitOf(el: Element): Element {
    let unit = el;
    while (unit.parentElement && unit.parentElement !== document.body && getComputedStyle(unit).display === "inline") {
      unit = unit.parentElement;
    }
    return unit;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const el = node as Element;
      if (SKIP.has(el.tagName.toUpperCase()) && !UNSUPPORTED[el.tagName.toUpperCase()]) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node as Element;
    const name = el.tagName.toUpperCase();

    if (UNSUPPORTED[name]) {
      if (visible(el) && !el.closest("[data-trefle-unsupported]")) {
        el.setAttribute("data-trefle-unsupported", "");
        extract.unsupported.push({ kind: UNSUPPORTED[name]!, box: boxOf(el) });
      }
      continue;
    }

    if (name === "FORM") {
      if (!visible(el)) continue;
      const id = `f${++f}`;
      tag(el, id);
      claimed.add(el);
      const fields = Array.from(el.querySelectorAll("input, select, textarea"))
        .filter((c) => {
          const type = (c.getAttribute("type") ?? "").toLowerCase();
          return !["hidden", "submit", "button", "reset", "image"].includes(type) && visible(c);
        })
        .map((c) => {
          const input = c as HTMLInputElement;
          const labelEl = input.id ? el.querySelector(`label[for="${CSS.escape(input.id)}"]`) : input.closest("label");
          const label = (labelEl?.textContent ?? input.getAttribute("aria-label") ?? input.getAttribute("placeholder") ?? input.name ?? "")
            .replace(/\s+/g, " ")
            .trim();
          const type = c.tagName === "SELECT" ? "select" : c.tagName === "TEXTAREA" ? "textarea" : (input.type || "text").toLowerCase();
          const options =
            c.tagName === "SELECT"
              ? Array.from((c as HTMLSelectElement).options)
                  .filter((o) => o.value !== "")
                  .map((o) => o.text.trim())
                  .filter(Boolean)
              : undefined;
          const legend =
            type === "radio" || type === "checkbox"
              ? (input.closest("fieldset")?.querySelector("legend")?.textContent ?? "").replace(/\s+/g, " ").trim()
              : "";
          return {
            name: input.name || undefined,
            label,
            type,
            required: input.required,
            ...(options ? { options } : {}),
            ...(legend ? { group: legend } : {}),
          };
        });
      const submit = el.querySelector('button:not([type]), button[type="submit"], input[type="submit"]') as HTMLElement | null;
      const submitLabel = (submit instanceof HTMLInputElement ? submit.value : submit?.textContent ?? "").replace(/\s+/g, " ").trim();
      extract.forms.push({ id, box: boxOf(el), fields, ...(submitLabel ? { submitLabel } : {}) });
      continue;
    }

    if (name === "IMG" && extract.images.length < MAX_IMAGES && visible(el) && !el.closest("form")) {
      const img = el as HTMLImageElement;
      const r = img.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) continue;
      const fromSrcset = (img.getAttribute("srcset") ?? "")
        .split(",")
        .map((s) => s.trim().split(/\s+/))
        .filter((p) => p[0])
        .sort((a, b) => parseFloat(b[1] ?? "0") - parseFloat(a[1] ?? "0"))
        .map((p) => p[0]!);
      const candidates = [img.currentSrc, ...fromSrcset, img.getAttribute("src")]
        .map((u) => candidate(u))
        .filter((u): u is string => Boolean(u));
      if (!candidates.length) continue;
      const id = `i${++i}`;
      tag(el, id);
      extract.images.push({ id, kind: "img", candidates: [...new Set(candidates)], alt: img.hasAttribute("alt") ? img.alt : null, box: boxOf(el) });
      continue;
    }

    if (extract.images.length < MAX_IMAGES && !el.closest("form")) {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== "none" && visible(el)) {
        const r = el.getBoundingClientRect();
        const urls = Array.from(bg.matchAll(/url\(["']?([^"')]+)["']?\)/g))
          .map((m) => candidate(m[1]))
          .filter((u): u is string => Boolean(u));
        if (urls.length && r.width >= 100 && r.height >= 60 && !el.hasAttribute("data-trefle-id")) {
          const id = `i${++i}`;
          el.setAttribute("data-trefle-bg", id);
          snapshot[id] = { box: boxOf(el), style: {} };
          extract.images.push({ id, kind: "background", candidates: urls, alt: null, box: boxOf(el) });
        }
      }
    }

    // Text units: an element with its own visible text, lifted to its block.
    if (extract.texts.length >= MAX_TEXTS || el.closest("form")) continue;
    const ownText = Array.from(el.childNodes).some((c) => c.nodeType === Node.TEXT_NODE && (c.textContent ?? "").trim() !== "");
    if (!ownText || !visible(el)) continue;
    const unit = unitOf(el);
    if (insideClaimed(unit)) continue;
    const insideLinkUnit = unit.tagName !== "A" && Boolean(unit.closest("a[href]")) && unit.closest("a[href]") !== unit;
    const html = tidy(Array.from(unit.childNodes).map((c) => inlineHtml(c, unit.tagName === "A" || insideLinkUnit)).join(""));
    if (!html || html.length > MAX_TEXT_LENGTH) continue;
    claimed.add(unit);
    const id = `t${++t}`;
    tag(unit, id);
    const linkEl = unit.tagName === "A" ? unit : unit.closest("a[href]");
    const href = linkEl ? absolute(linkEl.getAttribute("href")) : undefined;
    const style = snapshot[id]!.style;
    if (style.fontFamily) fonts.add(style.fontFamily);
    extract.texts.push({ id, tag: unit.tagName.toLowerCase(), html, ...(href ? { href } : {}), box: boxOf(unit), style });
  }

  // Background images live on `data-trefle-bg` (their element may also hold a text).
  for (const el of Array.from(document.querySelectorAll("[data-trefle-bg]"))) {
    if (!el.hasAttribute("data-trefle-id")) el.setAttribute("data-trefle-id", el.getAttribute("data-trefle-bg")!);
  }

  extract.fonts = [...fonts];
  state.__trefleDesktop = snapshot;
  // Extra field read by render.ts only (not part of the extract type).
  return (embedded.length ? { ...extract, embedded } : extract) as PageExtract;
}
