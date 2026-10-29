# Phase 0 Research: Post-launch debugging & improvements (phase 1)

All unknowns from the plan's Technical Context are resolved below.

---

## 1. Trusting the client IP (X-Forwarded-For bypass)

**Decision**: Have Caddy set `X-Real-IP` from the real TCP peer on every
request it proxies to `web` (`header_up X-Real-IP {http.request.remote.host}`,
which **overwrites** rather than appends, unlike `X-Forwarded-For`). The app
trusts `X-Real-IP` only; it falls back to the **last** hop of
`X-Forwarded-For` solely when `X-Real-IP` is absent (host-mode dev without
Caddy in front).

**Rationale**: `req.headers.get("x-forwarded-for").split(",")[0]` (the
current code) trusts the **first**, client-controlled hop of a header a proxy
conventionally *appends to*, not overwrites — Caddy's default `reverse_proxy`
behaviour appends the real peer address to whatever `X-Forwarded-For` arrived
with, so a spoofed value survives at the front of the list untouched. Reading
a header Caddy fully owns and rewrites removes the client's ability to
influence it at all, and needs no header-chain-length reasoning at the app
layer.

**Alternatives considered**:
- *Trust the last hop of `X-Forwarded-For` instead of adding `X-Real-IP`* —
  works but is fragile: it silently breaks if a second proxy is ever added in
  front of Caddy, or if `X-Forwarded-For` handling changes upstream. A
  dedicated, Caddy-owned header is more legible and matches 002's pattern of
  doing edge-trust concerns in the Caddyfile.
- *Configure Caddy's `trusted_proxies` and keep parsing `X-Forwarded-For`* —
  more "correct" in the general N-proxies case, but this deployment has
  exactly one edge proxy; the simpler, single-purpose header wins under
  Principle I.

---

## 2. Reflected content escaping

**Decision**: A small local `escapeHtml()` helper (`&`, `<`, `>`, `"`, `'`)
applied at every interpolation site in `apps/web/src/app/api/leads/route.ts`'s
`page()` helper that carries request-influenced text (validation messages
built from field labels, the `referer`-derived back-link). No new dependency.

**Rationale**: The unsafe values here are short, plain-text-shaped (labels,
a URL used only as an `href`), not rich HTML — a five-line escape function is
the minimum that closes the hole, consistent with Principle I ("no wrapper
... to make it ours", but also no dependency where a function suffices).

**Alternatives considered**: pulling in a general escaping library — rejected
as unjustified weight for a handful of interpolation sites.

---

## 3. Sanitising GrapesJS editor-authored HTML

**Decision**: Add `isomorphic-dompurify` (DOMPurify on Node/edge via jsdom) as
the one new runtime dependency this feature introduces, applied in
`page-shell.tsx` to `builder.html` (and, as a defence-in-depth pass, `builder.css`
via DOMPurify's `SAFE_FOR_TEMPLATES`-style handling is not applicable to CSS —
CSS is instead scoped/parsed, not sanitised as HTML) before
`dangerouslySetInnerHTML`. Configure an explicit allow-list of tags/attributes
that covers what GrapesJS's own export actually produces (divs, sections,
headings, forms/inputs for the lead-form block, `data-*` attributes,
`class`/`id`/`style`), removing `<script>`, inline event handlers
(`on*` attributes), and `javascript:`/`data:` URLs in `href`/`src`.

**Rationale**: This is the Principle II justification required for a new
dependency: hand-rolling an HTML sanitiser is a well-known way to reintroduce
the exact bug being fixed (mutation-XSS, obscure parsing edge cases);
DOMPurify is small, widely used, actively maintained, and has a Node-safe
build. The alternative — a strict allow-list `rehype`/`unified` pipeline — is
heavier (a full HTML AST toolchain) for a single sanitisation call site.

**Alternatives considered**:
- *`sanitize-html`* — comparable option, slightly larger API surface; either
  is acceptable, DOMPurify chosen for its Node-safe build being the most
  battle-tested for this exact "trusted-ish editor, untrusted rendering"
  pattern.
- *Sanitise at save time in Payload instead of at render time in the
  renderer* — considered, but rejected as the sole control: sanitising only
  once at save cannot protect against a bug/regression in the sanitiser being
  fixed later without re-saving every page, whereas render-time sanitisation
  protects every page on every deploy. (Both may be added later as
  defence-in-depth; render-time is the one this phase requires.)

---

## 4. Preview link expiry window

**Decision**: Preview tokens gain an `issuedAt` embedded in the signed body
(mirroring `signFormToken`) and expire after **24 hours**.

**Rationale**: A preview link is generated fresh each time an editor opens
the admin's preview action — there is no workflow that depends on a link
surviving days (unlike, say, an email-delivered link). 24h comfortably covers
"share a draft with a colleague over lunch or overnight" while bounding how
long a leaked link stays useful, and needs no new secret or storage (same
HMAC + timestamp pattern already proven by the form token).

**Alternatives considered**: a much shorter window (matching the form token's
2h) — rejected as likely to annoy an editor reviewing a draft over a longer
session; a much longer window (7 days) — rejected as offering little
practical benefit over "no expiry" for the leaked-link threat model.

---

## 5. Bounding the in-memory rate-limit store

**Decision**: Cap the `Map` in `rate-limit.ts` at a fixed number of distinct
keys (e.g. 50,000 — roughly an order of magnitude above any plausible
legitimate daily unique-IP count for this product's traffic) with eviction of
expired entries first, then oldest-by-insertion; add a periodic sweep (on
each `hit()` call, opportunistically, no new timer/cron) that drops expired
buckets so the store doesn't grow unbounded between evictions.

**Rationale**: The "shared store" finding isn't a network service to
rate-limit — it's a single-instance `Map` that already documents itself as
"move to a shared store if this scales out" (unchanged scope for this
feature). The actual exposure is unbounded memory growth from an attacker
cycling through many fake IPs/emails. A cap + opportunistic sweep is the
minimum fix; no new infrastructure (Redis, etc.) is justified while the
service remains single-instance, matching Principle I/II.

**Alternatives considered**: a dedicated cleanup `setInterval` — rejected as
an extra background timer for a problem the opportunistic sweep already
solves cheaply on the hot path; moving to a real external store (Redis) —
explicitly out of scope until the renderer scales beyond one instance.

---

## 6. Body-size limit value

**Decision**: **500 KB**, applied to both `payload.config.ts`'s
`bodyParser.limits.fieldSize` and `next.config.mjs`'s
`serverActions.bodySizeLimit`, per the user's explicit instruction.

**Rationale**: The capped field (`_payload`) carries only JSON text — the
GrapesJS block tree, generated HTML/CSS, and SEO copy — never binary image
data (`rejectInlineImages` already blocks base64 images in this field; real
images are uploaded and referenced separately, served via ImgProxy). The
`builderField`'s own `html`/`css` exports are already capped at 200,000
characters (~195 KB) each; 500 KB leaves comfortable headroom over
`projectData`'s JSON (which is typically smaller than its own HTML/CSS
export) without reintroducing the original 1 MB-default failure this stopgap
exists to avoid.

**Alternatives considered**: keeping the 10 MB stopgap (rejected — arbitrary,
no relationship to what this field actually contains); 2 MB (an earlier,
more conservative recommendation before the field's binary-free nature and
the existing 200 KB export caps were fully accounted for — superseded by the
user's decision).

---

## 7. Republish reliability — root cause

**Decision**: The bug is a **silent single-attempt failure**, not a caching
architecture problem. `pages-revalidate.ts`'s `pageRevalidate` hook already
fires on every save to a published page (draft↔draft saves correctly emit
nothing); `revalidateTags()` already POSTs to the renderer with the right
tags. But the call is `void`-fired-and-forgotten with **one** attempt and a
`warn`-level log on failure — a transient blip (renderer cold-starting,
brief network hiccup, TLS renewal window) permanently misses that
invalidation, and the page falls back to serving stale content for up to the
1h ISR ceiling (`revalidate: opts.revalidate ?? 3600`), with nothing in the
admin telling the editor it happened.

**Fix**: retry the POST (mirroring the bounded retry-with-deadline pattern
`apps/web`'s own `postLeadIntake` already uses) before giving up; log final
failure at `error` level with the page id and tags so it's operationally
visible; and give the admin UI a way to reflect that the best-effort call
either succeeded or could not be confirmed, so the editor is never left
guessing whether "saved" also means "live" (which is what a report of "no
republish function" really describes from the outside).

**Rationale**: This stays inside the hook's own documented invariant ("a
failed revalidation must never block a save") — retries add bounded latency
to a fire-and-forget background call, not to the save response itself, and a
final failure is now loud instead of silent.

**Alternatives considered**: a full outbox/queue with durable retry —
rejected as disproportionate for a single internal HTTP hop between two
containers on the same Docker network; adding an explicit "Republish" button
as the *primary* fix — rejected as treating the symptom (no escape hatch)
without also fixing the actual reliability gap (a single untried retry), but
the admin-visible confirmation from the retry work doubles as exactly that
escape-hatch/feedback loop without a separate control to build and maintain.

---

## 8. Confirmation page mechanism

**Decision**: A `confirmationPage` relationship field on `pages` (`relationTo:
"pages"`), resolved server-side in `leadIntake.ts` and rendered by
`apps/web` through the same `PageShell` used for every other page, with an
`{{unsubscribeUrl}}` placeholder token substituted in the rendered output.

**Rationale**: Reuses the existing `Page`/GrapesJS/`PageShell` machinery
end-to-end — a confirmation page is edited, previewed, and rendered exactly
like a landing page, so it inherits accessibility/responsive/no-JS handling
for free (constitution Principle V) instead of needing a second, bespoke
"confirmation content" editor.

**Alternatives considered**: a dedicated `confirmation-pages` collection —
rejected, no behavioural difference from an ordinary `Page` justifies a
second collection (Principle I, "introduce an abstraction only on the third
concrete use"); a rich-text field directly on the form config instead of a
page relationship — rejected, it was explicitly asked to be "editable ...
containing the unsubscribe link" using the same page-building experience,
not a second, weaker content field.

---

## 9. Domain/`www` default page mechanism

**Decision**: Wire up the **already-declared, currently unused**
`Domain.notFoundPagePath` field: when `getPublishedPage` finds nothing for
the requested path, retry once against `domain.notFoundPagePath` (if set and
different) before returning not-found.

**Rationale**: The schema and its admin description ("Optional path to serve
for unmatched paths on this host") already express exactly this intent; the
type even flows all the way to the renderer's `Domain` interface
(`notFoundPagePath?: string`). Nothing in `[[...slug]]/page.tsx` or
`lib/domains.ts` ever reads it — this is dead capability, not a gap needing
new schema. Fixing the consumer is strictly smaller and lower-risk than
adding a new field or a new collection, and it naturally covers the `www` case:
each hostname is (and stays) its own `Domain` record, and an operator points
both `domaine.com` and `www.domaine.com` at the same `notFoundPagePath`.

**Alternatives considered**: a global, product-wide default page — rejected,
loses per-domain branding and isn't what the field already models; automatic
apex↔`www` canonical redirect — explicitly deferred (see spec.md
Assumptions); a new `domains.defaultPage` relationship mirroring
`confirmationPage` — considered, but `notFoundPagePath` (a path string,
resolved through the same `getPublishedPage` lookup already used everywhere
else) is simpler than adding a second relationship-resolution code path for
the same effect.

---

## 10. GrapesJS starter template

**Decision**: `projectData`'s `defaultValue` returns a small GrapesJS project
built from the same `blocks.ts` definitions the editor itself renders
(a heading/text block plus the existing `lead-form` block), with matching
`html`/`css` defaults, rather than a hand-authored JSON literal.

**Rationale**: Building the default from the real block definitions
guarantees it is a project state the editor could have produced itself —
`countBlocks`/`recomputeBlockCount` and the publish guard see a normal,
valid document, with no special-cased "template" branch to keep in sync as
blocks change.

**Alternatives considered**: a separate "templates" collection an editor
picks from at creation time — rejected as over-scoped for "start from
something instead of blank" (Principle I); multiple starter templates —
explicitly out of scope, spec.md describes one starter template.

---

## 11. Admin login branding

**Decision**: `admin.components.graphics.Logo` (Payload's own documented
admin-branding slot, confirmed present in the installed Payload version) →
a new `apps/cms/src/components/Logo.tsx`.

**Rationale**: This is the tool's own supported customisation point — no CSS
overrides, no DOM hacking, following the same
`admin.components.<slot>: "@/components/X#default"` pattern already used for
`PageStatsPanel`.

**Alternatives considered**: none meaningfully different — this is a
documented one-line config point once located.

---

## 12. Admin IP allow-list

**Decision**: A Caddy-level `remote_ip` matcher on `{$CMS_HOSTNAME}`,
returning `403` for any address outside `ADMIN_ALLOWED_IPS` before
`reverse_proxy` is reached — nothing enters the Payload app for a blocked
address.

**Rationale**: Matches 002's own pattern of doing edge/network concerns in
the Caddyfile rather than app middleware (e.g. HSTS), keeps the control
outside the admin app entirely (defence-in-depth: even an admin-app bug
can't leak past a blocked IP), and needs no new dependency. Per the user's
decision, MFA is out of scope for this phase.

**Alternatives considered**: a Payload `beforeLogin`/access-control check
using the request IP — rejected as strictly weaker (the request still
reaches the Node process) and duplicative of what Caddy already does for
every other host-level concern in this project.
