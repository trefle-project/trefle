# Contract: public rendering of custom code

Applies to every route that renders a page through `PageShell`: `[[...slug]]`,
`ab-variant/[pageId]`, `(preview)/preview/[pageId]`, `(confirmation)/confirmation`
(where a conversion pixel belongs) and `(form-retry)/form-retry`. Each passes
`code={await codeContext(preview)}` (`lib/code-context.ts`); without it
PageShell emits no page code.

## Inputs

| Input | Source |
|---|---|
| `page.customCode` | Payload read by the service account (R1) |
| `page.builder.html` / `.css` | unchanged fields |
| `nonce` | `x-nonce` request header set by `middleware.ts` (every page route is dynamic) |
| `preview` | route flag |

## Output order in the page body

```html
<!-- head snippet: <meta>/<link>/<title> hoisted into <head> by React -->
<div style="display:contents" data-tf-code="head">…head snippet (rest)…</div>
<style>…builder.css with "</style" escaped…</style>
<div class="trefle-page-shell" …>
  …page content…
  <div id/class/style from placeholder data-tf-code="block">…block snippet…</div>   <!-- each code block, in place -->
  …
</div>
<div style="display:contents" data-tf-code="bodyEnd">…end snippet…</div>
<!-- ConsentCodeRunner client component, only if at least one <template data-tf-consent> was emitted -->
```

## Per-snippet emission rule

Let `s = withNonce(code, nonce)`.

| consent | context | emitted |
|---|---|---|
| `essential` | any | `s` verbatim (live) |
| `consent` (or absent) | not preview | `<template data-tf-consent>s</template>`; runs only if the `tf_consent` cookie is (or becomes) `accepted` |
| `consent` (or absent) | preview | same template, runner in `always` mode |

The consent cookie (007) is the single source of truth, so the domain's
banner setting isn't consulted: on a domain without banner nobody can
accept, so consent snippets never run (FR-008b); on the confirmation page
(no banner of its own) they run for visitors who accepted on the landing
page. Head `<meta>`/`<link>`/`<title>` tags carry no code and are emitted
whatever the consent setting.

Empty/absent `code` → nothing. Unknown `data-code-id` → nothing.

## `withNonce`

- Every `<script` opening tag (case-insensitive, followed by whitespace or
  `>`) gets `nonce="<nonce>"`; an existing `nonce=…` attribute on it is
  removed first.
- Nothing else in the snippet is changed (byte-exact otherwise).

## `ConsentCodeRunner` (client)

Props: `nonce: string`, `always?: boolean`.

1. Activate now if `always`, or if `parseConsentCookie(document.cookie)?.choice === "accepted"`.
2. Otherwise listen once for `window` event `tf:consent` with
   `detail === "accepted"`; ignore `"rejected"`.
3. Activation (idempotent — each template is removed once activated): for
   each `template[data-tf-consent]` in document order, clone content;
   replace each `<script>` with a new element copying all attributes and
   text, `nonce` set from props, `async = false` for external ones; insert
   in place of the template; for each external script, await `load` or
   `error` before inserting the next script.
4. A throwing or failing script never stops the loop (FR-022).

## Banner change

`CookieConsentBanner.decide(choice)` additionally dispatches
`window.dispatchEvent(new CustomEvent("tf:consent", { detail: choice }))`.

## CSP (middleware.ts)

```text
default-src 'self';
script-src 'self' 'nonce-<n>' 'strict-dynamic';
style-src 'self' 'unsafe-inline' https:;
img-src 'self' data: https: http:;
font-src 'self' data: https:;
connect-src 'self' https:;
frame-src 'self' https:;
media-src 'self' https: blob:;
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
[upgrade-insecure-requests]
```

## Sanitisation of page markup

`sanitizeHtml(html)` = `DOMPurify.sanitize(html, SANITIZE_CONFIG)`
(unchanged call site, widened config). Scripts, `on*` attributes, unsafe URI
schemes, `form`/inputs, `style`, `object`/`embed`, `iframe[srcdoc]` remain
removed.

## Test obligations

- `withNonce`: adds, replaces, leaves non-script markup byte-identical,
  handles `<SCRIPT>`, attributes, several scripts.
- Emission table: one test per row (render to string, assert markup).
- Runner (jsdom): no activation without consent; activation on cookie; on
  event; not on reject; order preserved with external scripts; a throwing
  script doesn't stop the next.
- CSP header string: exact directives above.
- `sanitizeHtml`: each new tag/attribute kept; each forbidden construct
  removed; existing render tests unchanged (SC-006).
- CSS: `</style>` inside builder.css can't close the element.
