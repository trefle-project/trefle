# Contract: renderer routes, footer line, lead-form link (apps/web)

Research R4, R6, R7.

## `GET /confidentialite` and `GET /mentions-legales`

- Fixed routes on every active domain; `?lang=<code>` optional.
- Domain has its own URL for that page → 302 to it.
- Otherwise: page shell (domain fonts/branding, no lead form, no tag
  manager), `<h1>` title, the HTML from `/api/legal/:kind` (sanitised like
  page HTML), then « Version <version> du <versionDate> », and on the privacy
  policy a link to `/mesure-audience`. `lang` attribute = the returned
  language.
- Unknown host → 404 like other routes. CMS unreachable → 503 page (no
  stale legal text invented).
- Fetch cached with tags `settings`, `domain:<id>`; route itself dynamic
  (reads `lang`).
- Worker: both paths are pass paths (the query must reach the origin).
- Reserved page paths: `/confidentialite`, `/mentions-legales`.

## Footer line (every page rendered by `PageShell` for a real page)

```html
<footer class="trefle-legal-footer" lang="<page language>">
  <a href="<notice href>">Mentions légales</a> · <a href="<policy href>">Confidentialité</a>
</footer>
```

- href: the domain's own URL when set, else `/mentions-legales?lang=<page
  language>` / `/confidentialite?lang=<page language>`.
- Labels from `legalTexts` for the page language, else French defaults.
- Accessible (real links, focus visible), readable on any background,
  wraps at 360 px; no serious/critical axe violation on a published page.

## Lead form

- Link « Politique de confidentialité »: the form's own `privacyNoticeUrl`
  if set, else the domain's `ownPrivacyPolicyUrl`, else
  `/confidentialite?lang=<page language>`.
- `/api/leads` consent context: `privacyNoticeUrl` = that effective link
  (absolute), `privacyNoticeVersion` = the form's own version when its own
  URL is used, else the `version` of `/api/legal/privacy` for the domain and
  page language. A failure to get the version stores the link with version
  « indisponible » and logs; the lead is never refused for it.

Tests: the three link cases; consent context per case; footer present on
catch-all, ab-variant, confirmation pages with the right hrefs and labels;
routes: redirect, language choice, 404, shape.
