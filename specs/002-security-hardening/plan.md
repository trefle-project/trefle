# Implementation Plan: Deploy-blocking security hardening

**Branch**: `002-security-hardening` | **Date**: 2026-09-10 | **Spec**: [spec.md](spec.md)

## Summary

Close the four blocking pre-deploy findings — vulnerable deps, missing response
headers, undefined secret delivery, weak default credentials — in five ordered,
independently revertible phases, verified on the local Docker stack. No
deployment.

## Technical Context

**Language/Version**: TypeScript, Node 24. Next 16 (`apps/web`), Next 15 +
Payload 3.68 (`apps/cms`).

**Primary Dependencies**: Payload CMS, `@payloadcms/*`, Next.js, `sharp`,
`undici` (transitive via Payload), Caddy 2 (edge).

**Storage**: PostgreSQL 16 (unchanged). Garage/S3 (unchanged).

**Testing**: Vitest (unit), Playwright (dockerised e2e), `docker compose`
stack, `npm audit`, `curl -sI`, `git-crypt status`.

**Target Platform**: Debian VPS, Docker Compose + Caddy — but this feature is
verified only on the local stack.

**Project Type**: Multi-app monorepo (cms + web + shared) with infra/.

**Constraints**: No data-model change. Every phase keeps `npm run lint`,
`npm run typecheck`, `npm test` and both `build`s green. Dev flows
(`docker compose up`, host `npm run dev`) must not regress.

## Constitution Check

| Principle | Check |
|---|---|
| I. Simplicity First | Each fix is the minimum that clears the finding: `overrides` not a rewrite; `headers()` + one Caddy snippet, not a WAF; git-crypt (already the chosen tool) not a new secret manager; a `requiredInProd` helper reusing the existing `required()` pattern. |
| II. Stack-Native | Next `headers()` + middleware nonce (documented Next pattern); Payload's own `auth`/env conventions; Caddy `import` snippet; npm `overrides`. No wrappers. |
| III. Small, Reversible | Five phases, one commit each. Phase 4b (Payload bump) is isolated so it can be reverted without losing 4a. |
| IV. / V. | No product behaviour change; defence-in-depth only. Tests added for the new pure helper and header presence. |

Gate: **PASS**.

## Phasing

Each phase = one commit on `002-security-hardening`, local only, not pushed.

### Phase 1 — Fail-closed config & weak-credential removal (finding 4)

- `apps/cms/src/lib/env.ts` (new): `requiredInProd(name)` — returns
  `process.env[name]`; throws `Missing required env var: <name>` when unset
  **and** `NODE_ENV === "production"`; returns `undefined` otherwise. Unit test.
- `apps/cms/src/payload.config.ts`: S3 `endpoint` / `region` /
  `accessKeyId` / `secretAccessKey` use `requiredInProd(...)  ?? "<dev
  fallback>"`. Dev unchanged; prod throws if any is unset.
- `apps/cms/src/seed/dev.ts`: admin password —
  `NODE_ENV === "production"` ⇒ require `SEED_ADMIN_PASSWORD` (>= 16 chars),
  else throw; non-prod keeps `trefle-dev-123`. Print a "change on first login"
  note either way.
- `infra/.env.example`: `POSTGRES_PASSWORD=` (empty) + `openssl` hint; add
  `SEED_ADMIN_PASSWORD=` under the prod block; header note "generate every
  secret with `openssl rand -hex 32`".
- `infra/docker-compose.prod.yml`: `db` / `cms` / `pg-backup` make
  `POSTGRES_PASSWORD` required (`${POSTGRES_PASSWORD:?...}`, no `:-trefle`).
- `infra/deploy/preflight.sh` (new, +x): FR-013 checks; exit 1 listing every
  failure; run from the runbook.

Verify: unit test green; `docker compose -f base -f override up` unchanged;
`preflight.sh` exits 1 on a weak env, 0 on a good one; simulate
`NODE_ENV=production` + unset S3 secret ⇒ cms boot throws.

### Phase 2 — Security response headers (finding 2)

- `apps/web/src/middleware.ts` (new): generate a per-request nonce, set it on a
  request header, and emit `Content-Security-Policy` with
  `script-src 'self' 'nonce-<n>' 'strict-dynamic'`,
  `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: https:`,
  `connect-src 'self'`, `font-src 'self' data:`, `object-src 'none'`,
  `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self'`,
  `upgrade-insecure-requests`. Matcher excludes static assets.
- `apps/web/src/app/layout.tsx`: read the nonce (`headers()`), pass to
  `<NextScript nonce>` equivalent — in App Router, set it on the root and let
  Next propagate (Next reads the `Content-Security-Policy` nonce automatically
  when present on the request; confirm and wire explicitly if needed).
- `apps/web/next.config.ts`: `poweredByHeader: false`; static `headers()` for
  `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`,
  `Permissions-Policy`.
- `apps/cms/next.config.mjs`: `poweredByHeader: false`; `headers()` with the
  static set (X-Frame-Options `SAMEORIGIN`, nosniff, Referrer-Policy,
  Permissions-Policy) + a CSP limited to
  `frame-ancestors 'self'; object-src 'none'; base-uri 'self'` (no
  `script-src` restriction — Payload bundle). Comment: tightening is follow-up.
- `infra/deploy/Caddyfile`: a `(sechdr)` snippet —
  `header { Strict-Transport-Security "max-age=31536000; includeSubDomains"
  X-Content-Type-Options nosniff -Server }` — `import sechdr` in each site
  block.

Verify: `curl -sI` renderer + admin on the local stack for every required
header, `X-Powered-By` absent; load a published page and the admin in a browser
— zero CSP violations, form submits, GrapesJS works; `npm run test:e2e:docker`
green; `docker compose -f base -f prod config` renders the Caddyfile import.

### Phase 3 — git-crypt initialisation & runbook truth (finding 3)

- `git-crypt init` in the repo (creates `.git/git-crypt/keys/default`).
- Export the key **outside the repo**:
  `git-crypt export-key ../trefle-git-crypt.key` + `chmod 600`. Hand it to the
  user for their password manager; it never enters the repo or history.
- `.gitignore`: drop the `infra/.env` and `infra/*.env` lines (keep
  `!infra/.env.example` and the repo-root `.env*` rules). `.gitattributes`
  already has the git-crypt filter — no change.
- `git add infra/.env` — commits it **encrypted** (current dev values; these
  are local throwaways, safe in an encrypted blob; the operator overwrites with
  real values on deploy). Add a header comment in the file.
- `infra/deploy/README.md`: new "§0.5 One-time — initialise git-crypt (repo
  owner)" and a corrected "§1 Get the code + secrets" (unlock with the key
  file, `shred` it, `git-crypt status` sanity). Remove any step that assumed
  git-crypt was already set up.
- `.github/workflows/ci.yml`: the existing dual path (GIT_CRYPT_KEY secret vs
  `.env.example` fallback) already works once git-crypt is real — leave it,
  add a one-line comment that `GIT_CRYPT_KEY` is now optional-but-supported.

Verify: `git-crypt status infra/.env` ⇒ encrypted; `git show HEAD:infra/.env`
⇒ binary blob; `git-crypt lock` then `git-crypt unlock ../trefle-git-crypt.key`
round-trips; `npm ci && npm run typecheck` still work in a locked checkout
(nothing reads `infra/.env` at build).

### Phase 4a — Targeted dependency overrides (finding 1, part 1)

- Root `package.json` `overrides`: `"undici": "^7.29.1"` (stay on major 7,
  take every 7.x fix). Evaluate `"uuid": "^11.1.1"` — apply only if `npm ls`
  stays resolvable and builds pass; otherwise document uuid as non-exploitable
  (v4-only usage) pending Phase 4b.
- `apps/cms/package.json`: `sharp` `0.33.5` → `0.34.4` (not a Payload peer;
  clears the libvips CVEs).
- `npm install`; commit `package-lock.json`.
- `npm audit --omit=dev` before/after captured in `research.md`.

Verify: lint, typecheck, `npm test`, both builds; bring the containerised stack
up, upload an image through the CMS (exercises `sharp`), fetch it resized via
ImgProxy.

### Phase 4b — Payload 3.68 → 3.88 (finding 1, part 2), isolated

- `apps/cms/package.json`: `payload` + every `@payloadcms/*` → `3.88.0`.
- `npm install`; `payload generate:types`; `payload generate:importmap`.
- `payload migrate:create` only if the schema drifted; commit any migration.
- Run migrations against the running dev DB.
- Full unit + typecheck + both builds + `npm run test:e2e:docker`.
- `npm audit --omit=dev` delta into `research.md`.

If e2e fails or an un-committable migration appears: **stop, revert this
commit, report**. Phase 4a stands on its own.

### Phase 5 — Verification pass & deploy checklist

- Cold `docker compose ... down -v` → `up -d --wait` → migrate → seed →
  `curl -sI` header assertions → browser smoke → `npm run test:e2e:docker`.
- `npm audit --omit=dev` final numbers into `research.md` (SC-001).
- `infra/deploy/README.md` §5 "Security checklist": mark what is now enforced
  by code/config vs. what stays a manual host step.
- `specs/002-security-hardening/tasks.md`: tick everything; note any residual.

## Project Structure

```text
specs/002-security-hardening/
├── spec.md          # this feature's spec
├── plan.md          # this file
├── research.md      # audit before/after, CSP decisions, residual-risk log
└── tasks.md         # phase-by-phase task list

apps/cms/src/lib/env.ts            # new — requiredInProd
apps/cms/src/lib/env.test.ts       # new
apps/web/src/middleware.ts         # new — nonce CSP
infra/deploy/preflight.sh          # new — prod env preflight
infra/deploy/Caddyfile             # + (sechdr) snippet
infra/deploy/README.md             # git-crypt §0.5, corrected §1, §5 checklist
infra/.env                         # now tracked, git-crypt encrypted
infra/.env.example                 # no usable secrets
infra/docker-compose.prod.yml      # POSTGRES_PASSWORD required
apps/*/next.config.*               # headers() + poweredByHeader:false
apps/cms/src/{payload.config.ts,seed/dev.ts}
package.json / apps/cms/package.json / package-lock.json
```

## Risks

| Risk | Mitigation |
|---|---|
| Nonce CSP breaks Next hydration | Use `'strict-dynamic'` + nonce per Next's documented pattern; verify with e2e + browser console before commit. |
| Admin CSP breaks Payload bundle | Admin CSP omits `script-src`; only `frame-ancestors`/`object-src`. |
| Payload 3.88 needs an uncommitted migration or breaks e2e | Phase 4b isolated + revertible; stop-and-report rule. |
| Committing `infra/.env` exposes dev secrets | Encrypted at rest (git-crypt); values are local dev throwaways; runbook says rotate for prod. `PAYLOAD_SECRET` is *not* rotated (it decrypts the stored service API key). |
| `git-crypt` not on a contributor's machine | Only the e2e job and real deploys need `infra/.env`; `npm ci`/lint/typecheck/build work locked. |
