# Contributing to Trefle

Thanks for your interest! Trefle is a showcase project that you can also run
yourself. Bug reports, documentation fixes and focused pull requests are all
welcome.

## Before you start

- **Bugs**: open an issue with the steps to reproduce it.
- **Larger changes**: open an issue first to discuss the idea. Trefle is built
  feature by feature from written specifications (see below), and a change
  that touches behaviour usually needs one.
- **Security problems**: never in a public issue — see [SECURITY.md](SECURITY.md).

## Contributor License Agreement

Trefle is licensed under the AGPL-3.0-or-later, and may also be offered under
other licences. Before your first pull request can be merged, you sign the
[Contributor License Agreement](CLA.md): the CLA bot asks you to post one
comment on the pull request. You keep the copyright in your work.

## Development setup

See the [README](README.md#run-it-locally). In short: Docker, Node 24, then
`infra/dev-env.sh` and `docker compose up`.

## How the code is organised

- `apps/cms` — Payload 3 admin, content and lead storage, jobs.
- `apps/web` — the public renderer (Next.js) and the lead intake API.
- `apps/edge` — the optional Cloudflare Worker (edge cache, A/B, counting).
- `packages/shared` — framework-free types and zod schemas.
- `packages/grapesjs-page-import` — page and Penpot import converters.
- `infra/` — Docker Compose files, Caddy, Garage, Cloudflare scripts, runbook.
- `specs/` — one folder per feature: spec, plan, tasks, contracts
  ([index](specs/README.md)).

The project rules (simplicity first, no wrapper layers, tests with every
change, GDPR by default) are written down in
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## Spec-driven workflow

Features are developed with [Spec Kit](https://github.com/github/spec-kit):
`spec.md` (what and why) → `plan.md` (how) → `tasks.md` (ordered steps) →
code and tests. The files in `.specify/` and `.claude/` support that workflow
with an AI coding assistant; you do not need them to contribute.

## Pull requests

- One topic per pull request, with tests for the behaviour you change.
- `npm run lint`, `npm run typecheck` and `npm test` must pass; CI also runs
  the full stack with Playwright.
- Keep the style of the surrounding code (comment density, naming, idioms).
- Update [`docs/features.md`](docs/features.md) when user-visible behaviour
  changes.

## Language

Code, commits, issues and documentation are in English (some documents also
keep their French original as `*.fr.md`). The admin interface is in
English and French: new admin texts need both (see
`specs/023-admin-i18n/`); other languages are a welcome contribution.
