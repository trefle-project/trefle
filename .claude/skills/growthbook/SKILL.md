---
name: growthbook
description: >-
  Reference for integrating GrowthBook (self-hosted feature flagging and
  A/B testing) into Trefle: self-hosting requirements, the Next.js App
  Router SDK, the cache/cookie pitfall that silently breaks ISR, and
  GrowthBook's own official AI-agent tooling (Agent Skills plugin, MCP
  server).
when_to_use: >-
  Use whenever the work touches GrowthBook — adding it to
  infra/docker-compose, wiring the GrowthBook SDK into apps/web or
  apps/cms, writing or reviewing the A/B-testing spec/plan under specs/,
  or the user names GrowthBook, feature flags, or experiments directly.
  For Trefle's own design decisions (schema, promotion flow, GrapesJS
  integration, rollback strategy) see docs/ab-testing-exploration.md —
  this skill is technology reference, not the project's design record.
metadata:
  source: "docs.growthbook.io, growthbook.io, github.com/vercel/next.js — researched 2026-09-16"
---

# GrowthBook

Open-source (MIT core) feature-flagging and experimentation platform,
self-hostable, warehouse-native. Not yet a dependency of this repo — this
skill exists to get the integration right on the first pass, written
**before** `apps/cms`/`apps/web`/`infra` actually depend on it.

**Not yet installed in this repo.** Everything below reflects
docs.growthbook.io as of 2026-09; re-verify against the actual installed
version once GrowthBook is added as a dependency — same discipline this
project's `grapesjs` skill already applies to `grapesjs` itself (Rule 0
there: state the API, then verify it against what's really installed).

## Route to the right reference

Read only the file you need.

| Task | File |
| --- | --- |
| Self-hosting: Docker, the MongoDB requirement, using Postgres as the metrics datasource, licensing, publisher/trust signals | `references/self-hosting.md` |
| Next.js App Router SDK, local evaluation, the cache-killing `cookies()`/`headers()` trap, the Partial Prerendering mitigation | `references/nextjs-integration.md` |
| Official AI-agent tooling: the Agent Skills plugin, the MCP server, install commands | `references/ai-agent-tooling.md` |

## Non-negotiables

- Self-hosted GrowthBook needs **MongoDB** in addition to whatever else the
  project already runs — it is not Postgres-only, and the bundled Mongo
  container in GrowthBook's own quick-start compose is dev/staging only.
  Verify the infra impact before assuming otherwise.
- Reading `cookies()`/`headers()` during a Next.js App Router render marks
  the **entire route** dynamic and uncacheable — GrowthBook's own
  cookie-based sticky-bucketing service triggers this if wired in naively.
  Isolate any bucket read inside a small `Suspense` boundary (Partial
  Prerendering / Cache Components), never at page level. Full detail and
  sources in `references/nextjs-integration.md`.
- The feature/experiment payload loads once via a cached, tagged fetch and
  is refreshed by webhook — GrowthBook is never called on the hot request
  path. Assignment itself is a local deterministic hash, not a network
  call.
- `apps/web` must fail open if the self-hosted GrowthBook instance is
  unreachable — serve the control, never surface an error. This is already
  a recorded design commitment, not a suggestion: see
  `docs/ab-testing-exploration.md` §7.

## Where Trefle's own decisions live

This skill is technology reference only — what GrowthBook's SDKs and
self-hosting actually require. What Trefle has actually decided to build
(the `experiments` collection, `experimentOf`, the promotion flow, the two
GrapesJS integration granularities, rollout/rollback sequencing) is
recorded in `docs/ab-testing-exploration.md`, not duplicated here. Read
that first for "what we're building"; read this skill for "how the
vendor's API/SDK actually behaves".
