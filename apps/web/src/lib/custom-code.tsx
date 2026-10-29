import type { CSSProperties, ReactNode } from "react";
import parse from "html-react-parser";

import { withNonce } from "@trefle/shared";

import type { CodeSnippet } from "./payload-client";

/**
 * 014-custom-code-editing — emits the admin-only page code
 * (contracts/rendering.md). Snippets are trusted admin input that never
 * went through the page-markup sanitizer; what makes them runnable is the
 * request's CSP nonce, added to every `<script>` by `withNonce`.
 *
 * Emission rule per snippet (research R2/R4):
 *  - « Essentiel » → verbatim, live: the browser runs its scripts while
 *    parsing, in document order, like hand-written markup.
 *  - « Nécessite le consentement » → inert inside `<template data-tf-consent>`
 *    until `ConsentCodeRunner` activates it, only if the visitor accepted
 *    cookies (the 007 consent cookie is the single source of truth). On a
 *    domain without banner nobody can accept, so it never runs (FR-008b);
 *    on the confirmation page (no banner of its own) it runs for visitors
 *    who accepted on the landing page. In preview it runs at once (FR-007).
 *
 * The wrapper is a `display: contents` div filled through
 * `dangerouslySetInnerHTML`: React never re-renders or re-runs that content
 * on hydration. `suppressHydrationWarning` because the browser blanks each
 * script's `nonce` attribute once parsed (nonce hiding) and vendor scripts
 * rewrite their own markup — both expected differences from the server HTML.
 */
export type CodeContext = {
  /** The request's CSP nonce (middleware.ts `x-nonce`). */
  nonce: string;
  /** Draft preview: no banner, consent snippets run immediately. */
  preview?: boolean;
};

export type SnippetMode = "live" | "consent" | null;

export function snippetMode(snippet: CodeSnippet | undefined): SnippetMode {
  if (!snippet?.code?.trim()) return null;
  return snippet.consent === "essential" ? "live" : "consent";
}

export const CONSENT_TEMPLATE_ATTR = "data-tf-consent";

export function snippetHtml(snippet: CodeSnippet | undefined, ctx: CodeContext): string | null {
  const mode = snippetMode(snippet);
  if (!mode) return null;
  const code = withNonce(snippet!.code!, ctx.nonce);
  return mode === "live" ? code : `<template ${CONSENT_TEMPLATE_ATTR}="">${code}</template>`;
}

export function CustomCodeSnippet({
  snippet,
  ctx,
  name,
  id,
  className,
  style,
}: {
  snippet: CodeSnippet | undefined;
  ctx: CodeContext;
  /** `data-tf-code` value: "head", "bodyEnd" or "block". */
  name: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
}): ReactNode {
  const html = snippetHtml(snippet, ctx);
  if (html === null) return null;
  return (
    <div
      id={id}
      className={className}
      // A code block keeps the layout the editor gave its placeholder; page
      // scripts take no box of their own.
      style={style ?? { display: "contents" }}
      data-tf-code={name}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// --- Head snippet: <meta>/<link>/<title> go into the real <head> ------------

// Scripts and noscripts are copied through untouched: a `<link …>` inside a
// script's string literal or a noscript fallback is not a head tag.
const OPAQUE_RE = /<(script|noscript)\b[\s\S]*?<\/\1\s*>/gi;
const HEAD_TAG_RE = /<(?:meta|link)\b[^>]*>|<title\b[^>]*>[\s\S]*?<\/title\s*>/gi;

/**
 * Splits the « Dans l'en-tête » snippet: its top-level `<meta>`, `<link>` and
 * `<title>` tags (e.g. a site-verification meta) are returned as React
 * elements, which React 19 hoists into `<head>`; the rest (scripts,
 * noscript) is emitted at the very top of the body, before any content —
 * a page component can't inject raw scripts into `<head>` (research R2).
 */
export function splitHeadSnippet(code: string): { headTags: ReactNode; rest: string } {
  const head: string[] = [];
  let rest = "";
  let last = 0;
  const takeHeadTags = (chunk: string) =>
    chunk.replace(HEAD_TAG_RE, (tag) => {
      head.push(tag);
      return "";
    });
  for (const m of code.matchAll(OPAQUE_RE)) {
    rest += takeHeadTags(code.slice(last, m.index)) + m[0];
    last = m.index! + m[0].length;
  }
  rest += takeHeadTags(code.slice(last));
  return { headTags: head.length ? parse(head.join("")) : null, rest };
}

/** The head snippet: head tags hoisted, the rest live or deferred like any snippet. */
export function HeadSnippet({ snippet, ctx }: { snippet: CodeSnippet | undefined; ctx: CodeContext }): ReactNode {
  if (!snippet?.code?.trim()) return null;
  const { headTags, rest } = splitHeadSnippet(snippet.code);
  // Head tags carry no code: they're emitted whatever the consent setting
  // (a verification meta must be there even on a domain without banner).
  return (
    <>
      {headTags}
      <CustomCodeSnippet snippet={{ ...snippet, code: rest }} ctx={ctx} name="head" />
    </>
  );
}
