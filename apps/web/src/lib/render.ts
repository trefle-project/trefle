import { Fragment, createElement, type CSSProperties, type ReactElement, type ReactNode } from "react";
import DOMPurify from "isomorphic-dompurify";
import parse, { Element, domToReact, type DOMNode, type HTMLReactParserOptions } from "html-react-parser";

import {
  CAROUSEL_MARKER,
  CAROUSEL_MAX_SLIDES,
  CAROUSEL_SLIDE_MARKER,
  CODE_ID_ATTR,
  CUSTOM_CODE_MARKER,
  SANITIZE_CONFIG,
  parseCarouselSettings,
} from "@trefle/shared";

import { Carousel } from "../components/carousel";
import { langIfDifferent, visitorCopy } from "./visitor-copy";

/**
 * Sanitise GrapesJS editor-authored HTML before it ever reaches
 * `dangerouslySetInnerHTML` (003-post-launch-improvements, FR-003). The
 * allow-list itself lives in @trefle/shared (html-allowlist.ts) so the page
 * import serializer is tested against the same list (012, FR-008), and the
 * editor's « Code » view warns with the very same config (014, FR-015).
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

/**
 * The lead-form placeholder marker — the same `data-block="lead-form"`
 * attribute the CMS counts server-side and GrapesJS preserves on export.
 * Since 012-url-page-import the placeholder may sit anywhere in the tree
 * (inside a Section or a Column, FR-025), so it is located by parsing, not
 * by splitting the HTML string around it.
 */
const LEAD_FORM_RE = /<[a-z][a-z0-9]*\b[^>]*\sdata-block=["']lead-form["']/i;

/** A GrapesJS export is exactly one wrapping element only when the canvas
 * background itself was styled (the ex-`<body>` `exportHtml.ts` turns into a
 * `<div>` so it survives `sanitizeHtml`) — otherwise it's a flat run of
 * sibling top-level blocks with no wrapper at all. This matches the FIRST
 * tag in the string either way; `wrapsWholeString` below is what tells the
 * two cases apart. */
const WRAPPER_OPEN_RE = /^<([a-z][a-z0-9]*)\b[^>]*>/i;

/**
 * True only if the element opened by the first `tagName` tag in `html`
 * genuinely encloses the *entire* string — i.e. depth-balanced scanning of
 * every `<tagName>`/`</tagName>` occurrence first returns to zero exactly at
 * the string's end, not partway through.
 *
 * The previous check here was `html.endsWith(closeTag)` — comparing the
 * string's tail against the expected closing-tag text. That's true even
 * when the "wrapper" closes early and is simply followed by an unrelated
 * sibling that happens to share its tag name: two sibling `<div>`s (a hero
 * block + the lead-form block — both blocks in GJS_BLOCKS render as `<div
 * data-block="...">`, and no canvas background was ever styled, so there is
 * no real wrapper) end with `</div>` regardless, which made `endsWith` treat
 * the FIRST div as if it wrapped the second. Peeling its tag off then
 * stripped the lead-form div's own closing tag along with it, the string
 * matcher used before 012 could no longer match, and the export silently lost its form — `hasForm`
 * just came back `false`, no error anywhere (root-caused from a failed e2e
 * run against this exact shape: `<div data-block="hero">…</div><div
 * data-block="lead-form"></div>`).
 *
 * Depth-balanced scanning gets both cases right: a genuine single wrapper
 * (e.g. `<div id=X>` from a styled background) commonly nests same-tag
 * children too — a rich-text or call-to-action block is *also* `<div
 * data-block="...">` — so depth legitimately dips back toward zero and rises
 * again before the true, final close; only the position of the first return
 * to zero matters, and here it lands at the end of the string, correctly
 * recognised as one real wrapper.
 */
function wrapsWholeString(html: string, tagName: string): boolean {
  const tagRe = new RegExp(`<(/?)${tagName}\\b[^>]*>`, "gi");
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return tagRe.lastIndex === html.length;
  }
  return false;
}

/** Reads one attribute's value out of a raw opening-tag string. Requires a
 * preceding whitespace so e.g. `id` doesn't match inside `data-id`. Bounded
 * to the fixed, already-sanitised attribute vocabulary `sanitizeHtml`
 * allows — not a general HTML-attribute parser. */
function extractAttr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}=["']([^"']*)["']`, "i").exec(tag)?.[1];
}

/** Minimal `"prop:value;prop2:value2"` → React style-object parser, bounded
 * to what the `style` attribute can contain once `sanitizeHtml` has run on
 * it — not a general CSS parser. Used to carry the lead-form placeholder's
 * own inline style (an editor may set width/alignment/background on it in
 * GrapesJS) onto the real wrapper the renderer places around the
 * server-driven `<LeadForm>` below. */
function parseInlineStyle(style: string | undefined): CSSProperties | undefined {
  if (!style) return undefined;
  const result: Record<string, string> = {};
  for (const decl of style.split(";")) {
    const i = decl.indexOf(":");
    if (i === -1) continue;
    const prop = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    if (!prop || !value) continue;
    result[prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
  }
  return Object.keys(result).length ? (result as CSSProperties) : undefined;
}

export type PageWrapper = {
  /** The export without its top-level wrapper's own tag (or unchanged when
   * there is no single wrapper). */
  inner: string;
  /** The GrapesJS export's own top-level wrapper's `id`/`class`/`style`
   * (exportHtml.ts's ex-`<body>`) — carries the page's chosen background
   * colour (`#<id>{background-color:...}` in page.builder.css). Returned
   * separately so page-shell.tsx applies it once, to `.trefle-page-shell`
   * itself (a real, full-width, full-height element), so the background
   * covers the WHOLE page — including the row a lead-form sits in. */
  wrapperId?: string;
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
};

/**
 * Peels the export's single top-level wrapper off, if there really is one
 * (`wrapsWholeString` — otherwise `html` is a flat run of sibling blocks and
 * treating the first one as a wrapper would corrupt the page).
 */
export function extractWrapper(html: string): PageWrapper {
  const wrapperOpen = WRAPPER_OPEN_RE.exec(html);
  const tagName = wrapperOpen?.[1];
  const wrapperOpenTag = wrapperOpen?.[0] ?? "";
  if (!tagName || !wrapsWholeString(html, tagName)) return { inner: html };
  // A page made of one single block (a lone section, or a lone « Code
  // personnalisé » block on a free page) also "wraps the whole string" — but
  // it's a block, not the ex-<body> wrapper, which never carries `data-block`.
  // Peeling it would drop the block's own tag, attributes and styles.
  if (extractAttr(wrapperOpenTag, "data-block") !== undefined) return { inner: html };
  return {
    inner: html.slice(wrapperOpenTag.length, -`</${tagName}>`.length),
    wrapperId: extractAttr(wrapperOpenTag, "id"),
    wrapperClassName: extractAttr(wrapperOpenTag, "class"),
    wrapperStyle: parseInlineStyle(extractAttr(wrapperOpenTag, "style")),
  };
}

/** Whether the (sanitised) export contains the lead-form placeholder. */
export function hasLeadForm(html: string): boolean {
  return LEAD_FORM_RE.test(html);
}

/** The lead-form placeholder's own `id`/`class`/`style`, so the renderer can
 * reapply them to a real element around `<LeadForm>` — otherwise whatever an
 * editor sets on it in GrapesJS (position, width, background) would be
 * silently discarded at publish time. */
export type LeadFormSlot = { id?: string; className?: string; style?: CSSProperties };

/** 014-custom-code-editing — a « Code personnalisé » placeholder: which code
 * row to render, and the id/class/style the editor gave the block. */
export type CodeSlot = LeadFormSlot & { codeId: string };

/**
 * Turns sanitised page HTML into React elements, replacing the lead-form
 * placeholder — wherever it sits, top level or nested in a Section/Column —
 * by `renderForm(slot)`. Only the first placeholder becomes a form; any
 * further one (the publish guard allows exactly one) renders nothing.
 * Call `sanitizeHtml()` first: this parses trusted, script-free HTML only.
 *
 * 014-custom-code-editing (research R5) — each « Code personnalisé »
 * placeholder is likewise replaced in place by `renderCode(slot)` (nothing
 * when no callback is given). The code itself never passes through here: it
 * comes from the page's admin-only `customCode.blocks`, not from the HTML.
 *
 * 016-carousel-block — each top-level-or-nested `data-block="carousel"`
 * becomes the interactive `<Carousel>` (contracts/markup.md). Its slides go
 * through the same replacements, except that a carousel nested in a slide
 * (only possible through the « Code » view or the API) stays plain markup.
 * Images of every slide but the first get `loading="lazy"` (FR-015).
 */
export function renderPageBody(
  html: string,
  renderForm: (slot: LeadFormSlot) => ReactNode,
  renderCode?: (slot: CodeSlot) => ReactNode,
  /** 023-admin-i18n (US6) — the page's language code: the carousel's controls follow it. */
  { language }: { language?: string } = {},
): ReactNode {
  if (!html) return null;
  let formRendered = false;

  const replaceBlock = (node: Element): ReactElement | undefined => {
    if (node.attribs["data-block"] === CUSTOM_CODE_MARKER) {
      return createElement(
        Fragment,
        null,
        renderCode?.({
          codeId: node.attribs[CODE_ID_ATTR] ?? "",
          id: node.attribs.id || undefined,
          className: node.attribs.class || undefined,
          style: parseInlineStyle(node.attribs.style),
        }),
      );
    }
    if (node.attribs["data-block"] !== "lead-form") return undefined;
    if (formRendered) return createElement(Fragment);
    formRendered = true;
    return createElement(
      Fragment,
      null,
      renderForm({
        id: node.attribs.id || undefined,
        className: node.attribs.class || undefined,
        style: parseInlineStyle(node.attribs.style),
      }),
    );
  };

  // Inside a slide: the same replacements, but no carousel in a carousel.
  const slideOptions: HTMLReactParserOptions = {
    replace: (node: DOMNode) => (node instanceof Element ? replaceBlock(node) : undefined),
  };
  const pageOptions: HTMLReactParserOptions = {
    replace(node: DOMNode) {
      if (!(node instanceof Element)) return undefined;
      if (node.attribs["data-block"] === CAROUSEL_MARKER) return renderCarousel(node, slideOptions, language);
      return replaceBlock(node);
    },
  };
  return parse(html, pageOptions);
}

function renderCarousel(node: Element, slideOptions: HTMLReactParserOptions, language: string | undefined): ReactElement {
  // Only the carousel's own strings reach the client bundle (SC-009).
  const { lang, copy } = visitorCopy(language);
  const settings = parseCarouselSettings(node.attribs);
  const slides = node.children
    .filter((c): c is Element => c instanceof Element && c.attribs["data-block"] === CAROUSEL_SLIDE_MARKER)
    .slice(0, CAROUSEL_MAX_SLIDES);
  slides.slice(1).forEach(lazyImages);
  return createElement(Carousel, {
    // The block's own name when the editor gave one, else Trefle's, in the page's language.
    settings: { ...settings, label: node.attribs["aria-label"]?.trim() ? settings.label : copy.carousel.label },
    copy: copy.carousel,
    lang: langIfDifferent(lang, language),
    id: node.attribs.id || undefined,
    className: node.attribs.class || undefined,
    style: parseInlineStyle(node.attribs.style),
    slides: slides.map((slide) => ({
      id: slide.attribs.id || undefined,
      className: slide.attribs.class || undefined,
      style: parseInlineStyle(slide.attribs.style),
      children: domToReact(slide.children as DOMNode[], slideOptions),
    })),
  });
}

/** `loading="lazy"` on every image under `node` that doesn't say otherwise. */
function lazyImages(node: Element): void {
  for (const child of node.children) {
    if (!(child instanceof Element)) continue;
    if (child.name === "img" && child.attribs.loading === undefined) child.attribs.loading = "lazy";
    lazyImages(child);
  }
}

/** Scope page CSS lightly so it can't restyle the shell chrome. */
export function scopedCss(css: string): string {
  return css ?? "";
}
