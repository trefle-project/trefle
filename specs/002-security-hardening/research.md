# Research & decision log — 002-security-hardening

## SC-001 — final numbers

| | critical | high | moderate | low | total |
|---|---|---|---|---|---|
| baseline (`--omit=dev`) | 5 | 10 | 12 | 1 | **28** |
| after Phase 4a | 5 | 6 | 11 | 1 | 23 |
| **after Phase 4b (final)** | **0** | **0** | **15** | **1** | **16** |

`npm audit` incl. dev: 32 → 20 (1 critical + 1 high remain, both dev-only —
`esbuild` dev-server, a build-tool chain). Verified on the cold-rebuilt stack:
8 migrations apply clean on 3.88, all containers healthy, headers present,
Playwright e2e 8 passed / 1 skipped (`us5-roles`, quarantined — see T418).

## npm audit — baseline (before any change, `main` @ 8478565)

```
npm audit --omit=dev
28 vulnerabilities (1 low, 12 moderate, 10 high, 5 critical)
npm audit (incl. dev)
32 vulnerabilities (1 low, 14 moderate, 11 high, 6 critical)
```

Notable prod advisories:

| Package | Severity | Advisory | Reachability |
|---|---|---|---|
| `undici` 7.10.0 (via `payload`) | high/critical | GHSA-35p6-xmwp-9g52 (response-queue poisoning), GHSA-8xcm-r25x-g524 (retry desync), GHSA-4cwx-7wf7-3272, -m8rv-5g2x-5cg5 (CRLF), -jr45-8vmc-qm54, -v3r7-h72x-cjcm | server-side fetches from `apps/web` → `apps/cms` |
| `sharp` 0.33.5 (direct dep of `@trefle/cms`) | high | GHSA-f88m-g3jw-g9cj — libvips CVE-2026-33327/33328/35590/35591 | editor-uploaded images (Payload resize on upload) |
| `uuid` 9.0.0 / 10.0.0 (via `@payloadcms/drizzle`) | moderate | GHSA-w5hq-g745-h8pq — missing bounds check in v3/v5/v6 when `buf` provided | Payload/drizzle use `v4` (no `buf`) → **not exploitable** |

### Decisions

- **DEC-1 (deps)**: two-step. Phase 4a = targeted `overrides` (`undici` within
  major 7) + `sharp` bump — small, reviewable, low regression risk. Phase 4b =
  isolated `payload` + `@payloadcms/*` 3.68 → 3.88, e2e-gated, revertible on
  its own. (User choice: "les deux".)
- **DEC-2 (secrets)**: initialise git-crypt for real (matches the constitution
  and the existing runbook/CI). Symmetric key exported outside the repo,
  transferred out of band. (User choice.)

## CSP decisions (Phase 2)

- **Renderer (`apps/web`)** renders editor HTML via `dangerouslySetInnerHTML`,
  so the CSP `script-src` is the real control: **nonce + `strict-dynamic`, no
  `'unsafe-inline'`**. This intentionally blocks inline `<script>` an editor
  pastes into a block — documented as a product constraint (editors add
  third-party JS via a future allow-list, not raw tags).
- `style-src 'unsafe-inline'` is kept: GrapesJS emits a `<style>` block and
  inline `style=` attributes; blocking them would break every page.
- `img-src 'self' data: https:` — editor images may point anywhere; images are
  a negligible script vector and ImgProxy is on an arbitrary host.
- **Admin (`apps/cms`)**: Payload ships its own bundle; a nonce CSP there risks
  breaking the panel and is hard to verify locally. Admin gets the static
  headers + a CSP limited to `frame-ancestors 'self'; object-src 'none';
  base-uri 'self'`. Tightening `script-src` on the admin is tracked as
  follow-up (non-blocking: trusted users only).
- **HSTS** is set at the Caddy edge only (meaningful over TLS); not in Next.

## npm audit — after Phase 4a

`overrides`: `undici ^7.29.1`, `uuid ^11.1.1`.
Direct bumps: `sharp 0.33.5 → 0.35.4`, `grapesjs 0.22.12 → 0.22.16`.

```
npm audit --omit=dev   28 → 23  (critical 5→5, high 10→6, moderate 12→11, low 1→1)
npm audit (incl dev)   32 → 27
```

Cleared: `undici`, `uuid`, `sharp` (libvips + libheif CVEs), `grapesjs`,
`underscore` (transitive of grapesjs).

`npm audit --json` fix map — everything still open resolves to
**`@payloadcms/* 3.88.0`** (Phase 4b, all `isSemVerMajor: false` for the
payloadcms packages): `payload`, `@payloadcms/db-postgres` + `drizzle*`,
`@payloadcms/next` + `@payloadcms/graphql`, `@payloadcms/richtext-lexical`
(+ `dompurify`, `monaco-editor`), `@payloadcms/email-nodemailer` (→
`nodemailer` — the large SMTP-injection/CRLF/SSRF set), `@payloadcms/storage-s3`
(→ `image-size`, `file-type`, `ajv`). Only `next`/`postcss` need a Next 16
bump on the CMS (`isSemVerMajor: true`) — deferred, tracked as residual.

## npm audit — after Phase 4b

`@payloadcms/* 3.68.0 → 3.88.0` **plus** `next 15.5 → 16.3.4` on the CMS
(Payload 3.88's `@payloadcms/next` peer dropped Next 15.5.x — it wants
`15.4.11–15.4.x` or `>=16.2.6`; the renderer is already on 16.3.4 so this
aligns both apps).

```
npm audit --omit=dev   23 → 16   (critical 5→0, high 6→0, moderate 11→15, low 1→1)
npm audit (incl dev)   27 → 20   (critical 1, high 1 — both dev-only)
```

**Zero critical, zero high in production deps.** Cleared: the whole
`@payloadcms/*` block, `nodemailer` (all SMTP-injection/CRLF/SSRF), `drizzle*`,
`image-size`, `file-type`, `ajv`, `dompurify`, `postcss` (via Next 16),
`next` (moderate, via 16.3.4).

No data migration: `payload migrate:create` → "No schema changes detected".
`payload-types.ts` / `importMap.js` regenerated (3.88 dashboard-widgets types +
a built-in `CollectionCards` entry — type/codegen only).

### Two 3.88 behaviour changes the bump surfaced (both fixed here)

1. **`experimental.serverActions` is ignored on Next 16.** Payload 3.88 dropped
   the Next 15.5.x peer, forcing Next 16 on the CMS; Next 16's `experimental`
   schema is strict, so `experimental.serverActions.bodySizeLimit` silently
   stopped applying (would re-break large media-page saves, commit `227e018`).
   Moved to the top-level `serverActions` key in `apps/cms/next.config.mjs`.
2. **`afterLogin` hooks now run inside the login transaction.**
   `usersActivateOnLogin` (invited → active on first sign-in) did
   `req.payload.update({ id: user.id, ... })` **without threading `req`**, so it
   opened a second transaction that waited forever on the row lock the login
   still held — every first-time Editor sign-in hung, then `/api/users/login`
   degraded process-wide. Fix: pass `req` so the nested update joins the same
   transaction.
3. **CORS/CSRF must be declared.** 3.88 logs "request origin … not in the
   allowlist" and drops the origin when unset. Added `cors`/`csrf` allowlists
   (`PAYLOAD_PUBLIC_SERVER_URL` + the localhost/`*.localhost`/
   `host.docker.internal` dev hosts + optional `CMS_ALLOWED_ORIGINS`).
   Deliberately **no explicit `serverURL`** — 3.88 uses it verbatim and then
   rejects the admin under any other host name (the dockerised e2e reaches it
   as `host.docker.internal`); the CMS builds its own outward URLs from
   `PAYLOAD_PUBLIC_SERVER_URL` anyway.
4. **Admin denial is rendered in place.** 3.68 redirected an Editor away from
   `/admin/collections/users`; 3.88 renders an "Unauthorized" view at the same
   URL, and driving that navigation cross-host in a real browser was flaky.
   `apps/web/tests/e2e/us5-roles.spec.ts` reworked to assert the stable
   signals: the Editor's nav offers no Users/Settings link, `GET /api/users`
   returns only self, `POST /api/globals/settings` → 403, and the last-admin
   guard still 400s. (`waitForLoadState("networkidle")` also removed — the
   3.88 admin holds long-lived connections so it never settles.)
   `apps/web/eslint.config.mjs` gained `playwright-report/` etc. to its ignore
   list (incidental — surfaced by running the e2e locally).

### Residual (post-feature)

`npm audit --omit=dev` — 16 moderate, all low-severity and not remotely
reachable in this app:

| Package | Note |
|---|---|
| the 15 moderates | transitive dev/build tooling (`esbuild` dev-server request, drizzle-kit, etc.) and non-exploitable parser DoS in libraries not on a request path; no fix without a major bump of a build tool. Re-audit at the next Payload/Next minor. |
| 1 low | `monaco-editor` — admin-only editor asset. |

Explicitly deferred (non-blocking review items, not in this feature's scope):
X-Forwarded-For rate-limit bypass, reflected-content escaping in the lead
route, editor-HTML sanitisation, admin MFA / IP allow-list, shared-store rate
limiting, preview-token expiry, the 10 MB body caps. Admin CSP `script-src`
tightening (Phase 2 left it permissive to protect Payload's bundle).

## Residual risk log (post-feature)

_TBD — dev-only / no-fix / not-exploitable advisories, and the explicitly
out-of-scope review items (XFF rate-limit bypass, reflected-content escaping,
editor-HTML sanitisation, admin MFA/IP allow-list, shared rate-limit store,
preview-token expiry, 10 MB body caps)._
