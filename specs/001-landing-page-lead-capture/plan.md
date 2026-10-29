# Implementation Plan: Landing Page Builder with GDPR-Compliant Lead Capture

**Branch**: `001-landing-page-lead-capture` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-landing-page-lead-capture/spec.md`

## Summary

Build a block-based landing-page builder and a GDPR-compliant lead-capture pipeline as a
two-application Docker Compose stack:

- **`cms`** — a Payload CMS application (content model, admin UI, access control, lifecycle
  hooks, background jobs). GrapesJS is embedded in the Payload admin as the page-editing and
  preview surface; on save it stores its exported HTML/CSS (plus its project JSON for
  re-editing) on the `pages` document.
- **`web`** — a separate Next.js App Router application that resolves the requested host to a
  registered domain, fetches the matching published page from Payload's REST/GraphQL API,
  and renders it with SSR + ISR. It owns the public lead-capture endpoint and the
  consent-withdrawal endpoint.
- Shared **PostgreSQL** database (owned exclusively by Payload), **Garage** S3-compatible
  object storage for assets, and **ImgProxy** for image optimisation.

Members are Payload users with an `admin`/`editor` role enforced by Payload access functions;
onboarding is a Payload-sent "set password" email over SMTP. Cache invalidation is driven by
Payload `afterChange`/`afterDelete` hooks calling a signed revalidation endpoint on `web`.
Retention deletion and data-subject-request fulfilment run as Payload jobs and admin
actions. Anti-spam on the public form is honeypot + fill-time heuristic + rate limiting, with
no third-party captcha (data-minimisation).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 (both apps; the constitution's earlier
"22 LTS" note is superseded — Node 24 is the dev/CI baseline). React 19.2.

**Primary Dependencies**:
- `cms`: Payload 3.x (`payload`, `@payloadcms/next`, `@payloadcms/db-postgres`,
  `@payloadcms/storage-s3`, `@payloadcms/email-nodemailer`), GrapesJS 0.22.x (+ pinned
  plugins) embedded via a custom Payload field/component.
- `web`: Next.js 16.3.4 (App Router, `eslint-config-next` 16.3.4), Tailwind CSS v4 (chrome
  only — published pages carry GrapesJS-exported CSS).
- Shared: `packages/shared` for TypeScript types generated from Payload + hand-written DTOs.
- No third-party captcha, no external identity provider, no page-builder library beyond
  GrapesJS.

**Storage**: One PostgreSQL 16 instance, schema owned and migrated by Payload
(`payload migrate`). Assets in Garage (S3 API). No second datastore; `web` never connects to
Postgres directly — it reads through Payload's API with a service API key.

**Testing**: Vitest for unit/integration (Payload access rules, collection hooks, the
lead-intake path, revalidation logic, the retention job, token signing). Playwright for E2E
smoke (author → publish → render on a host → submit form → lead visible; role restrictions;
unsubscribe link). Each app lints and type-checks independently.

**Target Platform**: Linux (Debian) VPS running Docker Compose in production; the same
Compose stack runs locally, including multi-domain resolution via `*.localhost` / hosts
entries. Public pages target modern evergreen browsers and MUST degrade to a working form
with JavaScript disabled.

**Project Type**: Multi-app web project — one repository, npm workspaces: `apps/cms`,
`apps/web`, `packages/shared`, plus `infra/` (Compose, ImgProxy config) and
`specs/`.

**Performance Goals**:
- Published page: server response < 500 ms warm (ISR hit served from cache), Largest
  Contentful Paint < 2.5 s and Interaction to Next Paint < 200 ms at p75 on a mid-range
  mobile; per-page client JS < 150 KB gzipped.
- Lead submission: visitor sees success/error < 2 s p95.
- Export: up to 10,000 leads streamed to a file in < 30 s.
- Cache invalidation: a published change is live within 10 s.

**Constraints**:
- GDPR: no lead stored without an active, un-pre-ticked consent; every lead has an immutable
  consent record; erasure removes personal data across all pages; configurable retention
  with automatic deletion; personal data never in logs.
- Data-minimisation: no third-party script on published pages by default; anti-spam uses no
  personal data beyond a short-lived rate-limit key.
- Secrets: only git-crypt-encrypted files in the repo; `.env.example` unencrypted.
- `web` has read-only knowledge of content via Payload's API; it must tolerate `cms` being
  briefly unavailable by serving the last good ISR render.

**Scale/Scope**: Single shared workspace, a handful of members, up to ~50 registered domains
and a few hundred landing pages, tens of thousands of leads per year. Not multi-tenant.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against `.specify/memory/constitution.md` **v2.0.0** (amended 2026-09-09 to adopt
this exact architecture, so the stack itself is no longer a violation).

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity First | PASS (with watch) | Stack is deliberately large; everything built *on top* stays conventional — no custom ORM, no bespoke auth, no page-builder abstraction beyond GrapesJS. Watch item: keep the GrapesJS↔Payload glue and the `web`↔Payload client thin. |
| II. Stack-Native, Minimal Additions | PASS | Content/model/access/hooks/jobs → Payload primitives. Editing → GrapesJS API. Routing/render/cache → Next.js primitives. No runtime dependency added beyond the stack named in the constitution. |
| III. Small, Reversible Changes | PASS | Delivery is phased (see roadmap); each phase is independently shippable. Schema changes via reversible Payload migrations. Unpublished Payload docs and inactive domains hide in-progress work. |
| IV. Working Software Over Ceremony | PASS | Test list targets the risk: access rules, hooks, lead-intake, revalidation, retention job, token signing. Presentational/GrapesJS markup exempt; each page template gets a render smoke test. |
| V. Quality the User Feels | PASS | Published pages: keyboard-navigable, axe-clean, usable at 360px, form works without JS, images via ImgProxy, <150 KB JS/page. Explicit loading/empty/error states in admin and on pages. |

**Secrets & config**: PASS — git-crypt for encrypted env files, `.env.example` unencrypted,
nothing sensitive in `NEXT_PUBLIC_*`.

**Result**: PASS. No unjustified violations → Complexity Tracking left empty. One watch item
recorded under Principle I for the Phase 1 re-check.

### Post-Design Re-check (after Phase 1)

PASS. `data-model.md` keeps every entity as a Payload collection/global (no side data store).
`contracts/` are Payload API usage + two small `web`-owned HTTP endpoints (lead intake,
revalidation) — no new framework, no wrapper layer. The GrapesJS glue is confined to one
Payload field component plus one publish hook. Watch item from the initial check is
satisfied.

## Project Structure

### Documentation (this feature)

```text
specs/001-landing-page-lead-capture/
├── plan.md              # This file
├── research.md          # Phase 0 output — decisions & rationale
├── data-model.md        # Phase 1 output — Payload collections/globals, fields, rules
├── quickstart.md        # Phase 1 output — run & validate the stack end to end
├── contracts/           # Phase 1 output
│   ├── payload-collections.md   # Collection/global API surface the apps rely on
│   ├── lead-intake.md           # POST /api/leads (web-owned public endpoint)
│   ├── consent-withdrawal.md    # GET/POST /unsubscribe (web-owned)
│   └── revalidation.md          # POST /api/revalidate (web-owned, cms → web)
└── checklists/
    └── requirements.md  # Spec quality checklist (from /speckit-specify)
```

### Source Code (repository root)

```text
apps/
├── cms/                         # Payload CMS + admin + GrapesJS editing surface
│   ├── src/
│   │   ├── collections/         # Pages, Domains, Leads, ConsentRecords,
│   │   │                        #   DataSubjectRequests, Users, Media, PageStats,
│   │   │                        #   ActivityLog
│   │   ├── globals/             # Settings (retention, consent defaults, privacy notice)
│   │   ├── fields/grapesjs/     # Custom field + React component embedding GrapesJS
│   │   ├── hooks/               # publish → revalidate, one-form-block guard,
│   │   │                        #   optimistic-concurrency guard, last-admin guard,
│   │   │                        #   consent-record writer
│   │   ├── jobs/                # retention-sweep (scheduled), erasure-worker
│   │   ├── endpoints/           # lead-intake (service), dsr-export, dsr-erase,
│   │   │                        #   consent-withdraw
│   │   ├── access/              # role-based access functions
│   │   ├── payload.config.ts
│   │   └── migrations/
│   └── tests/                   # Vitest: access, hooks, jobs, endpoints
├── web/                         # Next.js public renderer (current root app moves here)
│   ├── src/
│   │   ├── app/
│   │   │   ├── [[...slug]]/     # host+path → published page render (SSR + ISR)
│   │   │   ├── (preview)/       # authenticated draft-accurate preview (renderer path)
│   │   │   ├── unsubscribe/     # consent-withdrawal page
│   │   │   └── api/
│   │   │       ├── leads/       # public POST endpoint (honeypot, timing, rate-limit)
│   │   │       └── revalidate/  # signed endpoint called by cms hooks
│   │   ├── lib/
│   │   │   ├── payload-client/  # thin typed fetch wrapper over Payload API
│   │   │   ├── domains.ts       # host → domain resolution + cache tags
│   │   │   └── rate-limit.ts
│   │   └── components/          # page shell, form renderer, states
│   └── tests/                   # Vitest + Playwright
packages/
└── shared/                      # generated Payload types + shared DTOs/zod schemas
infra/
├── docker-compose.yml          # cms, web, db (postgres:16), imgproxy
├── docker-compose.override.yml # local: volumes, *.localhost, mail catcher
├── imgproxy/                   # signing key handling, presets
└── .env.example                # unencrypted; real *.env files are git-crypt'd
```

**Structure Decision**: One repository, npm workspaces. The existing root Next.js app becomes
`apps/web`. `apps/cms` is a new Payload app. Two application containers (`cms`, `web`) plus
infra containers (`db`, `imgproxy`) in `infra/docker-compose.yml`; the user's "2 containers"
= the two application services, sharing the single `db`. `web` communicates with `cms` only
over the Docker network via Payload's REST/GraphQL API (service API key) — it never opens a
Postgres connection. `packages/shared` carries types so both apps agree on shapes without
`web` importing Payload.

## Complexity Tracking

> No unjustified constitution violations — the architecture was ratified into the constitution
> (v2.0.0) before this plan. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
