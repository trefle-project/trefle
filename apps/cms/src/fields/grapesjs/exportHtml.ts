// GrapesJS exports the top-level "wrapper" component as a literal <body>
// tag whenever it carries its own attributes — which happens the moment
// someone styles the canvas background itself (click outside every block)
// rather than a block, e.g. a page background colour. The renderer's
// DOMPurify allow-list (apps/web/src/lib/render.ts) is a deliberately fixed
// list matching what GJS_BLOCKS + rich-text actually produce and excludes
// `body`/`html` on purpose — so that tag, and the id its style rule is
// keyed to (`#<id>{background-color:...}` etc. in the saved CSS), was
// silently stripped on publish, orphaning the rule and losing the style
// with no error anywhere. `div` is already allowed, carries the same id,
// and `getHtml()` only ever wraps the *entire* export this way (the
// wrapper can't recur inside its own children), so an anchored, whole-string
// replace is safe. Kept in its own module (not Editor.client.tsx, which
// pulls in the browser-only `grapesjs` package) so it's unit-testable
// without a browser — same reasoning as `pageWizardStash.ts`.
export function exportHtml(raw: string): string {
  return raw.replace(/^<body((?:\s[^>]*)?)>([\s\S]*)<\/body>$/, "<div$1>$2</div>");
}
