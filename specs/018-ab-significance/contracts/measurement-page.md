# Contract: the measurement page `/mesure-audience`

Research R10, R15 (cookieless, 2026-10-20). Served by the renderer on every
domain (a fixed route like `/confirmation`), never cached at the edge;
linked from each domain's privacy policy. Information only.

## `GET /mesure-audience`

- 200, `Cache-Control: private, no-store`, `noindex`, no tag manager, no
  form, writes no cookie.
- Content (French): the site sometimes compares versions of a page; the
  version is drawn at random at each view; nothing is stored on or read from
  the visitor's device for it; a random number valid for that view only, kept
  in the page's form, lets us count the view and, if the form is sent, know
  which version it came from; data used only for statistics on our own pages,
  never shared, deleted 30 days after the test ends.

Works without JavaScript; keyboard reachable; no serious/critical axe
violation (Principle V).

## Reserved path

`/mesure-audience` is reserved (same guard as `/confirmation`,
`apps/cms/src/hooks/pages-path-validate.ts`).

Tests: content and no `Set-Cookie`; axe; a page saved at `/mesure-audience`
is refused.
