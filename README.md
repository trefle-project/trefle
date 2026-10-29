# Trefle

**Landing pages and small websites on many domains, GDPR-compliant lead
capture, and A/B tests that tell you when a variant really wins.**

Trefle is a self-hosted publishing platform: editors build pages in a visual
block editor (or import them from a URL, a saved page or a Penpot design),
publish them on any number of domains, collect leads with full consent
evidence, and measure pages with statistically sound A/B tests. Privacy is
part of the design: consent records, data-subject requests, retention and
legal pages are built in.

It is a working product, running in production, published as a showcase you
can read, run and build on.

→ **[Full feature description](docs/features.md)**

## Highlights

- **Visual editor** (GrapesJS in a Payload 3 admin): sections, columns,
  carousel, lead form, direct HTML/CSS editing, consent-gated custom scripts.
- **Imports**: a page from a URL (AI-assisted), from a saved file, or a whole
  site from a Penpot design (deterministic, no AI cost).
- **Multi-domain** publishing from one workspace, with self-hosted fonts and
  a privacy policy and legal notice generated per domain.
- **Leads**: spam-resistant form, double opt-in, error recovery, CSV export,
  consent evidence, export/erasure requests, retention sweeps.
- **A/B tests** with Bayesian significance and broken-test detection
  (self-hosted GrowthBook), measured without any cookie.
- **Edge** (optional, Cloudflare): WAF, rate limiting, HTML cached at the edge
  and personalised per request by a Worker, client domains as custom
  hostnames.
- **Admin security**: roles, two-factor login, Cloudflare Access with a second
  token check at the origin.
- **Bilingual admin**: English or French per member; built-in visitor texts
  (form messages, confirmation pages) follow each page's language.

## Architecture

```
apps/cms                    Payload 3 admin (Next.js), GrapesJS, jobs, GDPR endpoints
apps/web                    public renderer for every domain (Next.js), lead intake API
apps/edge                   optional Cloudflare Worker (edge cache, A/B, view counting)
packages/shared             framework-free types, zod schemas, cache-tag helpers
packages/grapesjs-page-import   URL / saved-file / Penpot converters
infra/                      Docker Compose, Caddy, Garage (S3), Cloudflare-as-code, runbook
specs/                      one folder per feature: spec, plan, tasks, contracts
```

PostgreSQL 16 stores everything, behind Payload only. Media live in Garage
(S3-compatible); imgproxy resizes them from signed URLs. The renderer reads
published content through Payload's REST API with a read-only key. Details in
[docs/features.md](docs/features.md#architecture).

## Run it locally

**Prerequisites:** Docker with Compose v2, Node 24 and npm, `openssl`.
Every `*.localhost` host resolves to 127.0.0.1, so no `/etc/hosts` edit is
needed.

```bash
git clone https://github.com/trefle-project/trefle.git
cd trefle
npm install
infra/dev-env.sh
```

`infra/dev-env.sh` writes `infra/.env` from `infra/.env.example` with freshly
generated development secrets. That file is gitignored.

Start the whole stack (the same production images, plus Mailpit and a
single-node Garage), then create the schema and the seed data:

```bash
cd trefle
docker compose --env-file infra/.env -f infra/docker-compose.yml -f infra/docker-compose.override.yml up -d --build --wait
docker compose --env-file infra/.env -f infra/docker-compose.yml -f infra/docker-compose.override.yml exec cms npm --workspace @trefle/cms run payload:migrate
docker compose --env-file infra/.env -f infra/docker-compose.yml -f infra/docker-compose.override.yml exec cms npm --workspace @trefle/cms run seed:dev
```

Then open:

| What | Where |
|---|---|
| Admin | http://admin.trefle.localhost:3000/admin — `admin@trefle.localhost` / `trefle-dev-123` |
| Sample sites | http://site-a.localhost:3001, http://site-b.localhost:3001 |
| Caught e-mails | http://localhost:8025 (Mailpit) |

To add a site: in the admin, create a domain (any `name.localhost`), create a
page on it, publish, and open `http://name.localhost:3001/<path>`.

Optional features stay hidden until configured in `infra/.env`: the URL
import needs `ANTHROPIC_API_KEY`, the Penpot import `PENPOT_IMPORT=on` (the
dev overlay sets it). Two-factor login is off in development
(`TOTP_DISABLED=1`, refused in production).

### Hot reload (apps on the host)

Run only the stand-in services in Docker and the apps with `npm run dev`:

```bash
cd trefle
docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml up -d db garage garage-setup mailpit imgproxy
```

Copy `apps/cms/.env.local.example` to `apps/cms/.env.local` and
`apps/web/.env.local.example` to `apps/web/.env.local`, and fill the empty
secrets with the values from `infra/.env`. Then:

```bash
cd trefle
npm --workspace @trefle/cms run payload:migrate
npm --workspace @trefle/cms run seed:dev
npm --workspace @trefle/cms run dev
```

and, in a second terminal:

```bash
cd trefle
npm --workspace @trefle/web run dev
```

## Tests

```bash
cd trefle
npm run lint
npm run typecheck
npm test
```

End-to-end tests (Playwright) run against the running stack, either with a
local browser or in the same container as CI:

```bash
cd trefle
npm run test:e2e:docker
```

See [`apps/web/tests/e2e/`](apps/web/tests/e2e/) and the CI workflow
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Deploy to production

The runbook [`infra/deploy/README.md`](infra/deploy/README.md) (also in
[French](infra/deploy/README.fr.md)) takes you from a fresh Debian VPS to a
running installation: secrets, `preflight.sh`, the production Compose overlay,
Caddy, backups, releases with `release.sh` and rollback. The Cloudflare layer
(protection, edge cache, Access) is described as code in
[`infra/cloudflare/`](infra/cloudflare/README.md).

Secrets live in `infra/.env` on the server, never in the repository; generate
each one with `openssl rand -hex 32`. Nothing sensitive goes in
`NEXT_PUBLIC_*` variables.

## Documentation

| | |
|---|---|
| [Features](docs/features.md) | Everything Trefle does, by area, with links to the specs |
| [Documentation index](docs/README.md) | User guides, research notes, legal templates |
| [Specs index](specs/README.md) | The 21 feature specifications and how to read them |
| [Constitution](.specify/memory/constitution.md) | The project's engineering principles |

All documentation is in English; where a document was first written in French,
the French original is kept next to it (`*.fr.md`). The admin interface
is in English or French (each member picks theirs).

## How it was built

Trefle was developed feature by feature from written specifications with
[Spec Kit](https://github.com/github/spec-kit) and an AI coding assistant
(Claude Code): each feature has a spec, a plan, ordered tasks and contracts in
[`specs/`](specs/README.md), and was validated by unit and end-to-end tests
before release.

## Contributing

Issues and pull requests are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md)
first. Contributors sign the [Contributor License Agreement](CLA.md) once (a
bot asks on the first pull request). Please report security problems
privately: see [SECURITY.md](SECURITY.md). This project follows the
[Contributor Covenant](CODE_OF_CONDUCT.md).

## Licence

Copyright (C) 2026 Jérôme LAFERE.

Trefle is free software: you can redistribute it and/or modify it under the
terms of the **GNU Affero General Public License** as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version. See [LICENSE](LICENSE). If you run a modified version as a
network service, the AGPL requires you to offer its source code to its users.

For use under other terms (for example a commercial licence), contact
trefle@lafere.com. Third-party material is listed in [NOTICE.md](NOTICE.md).

"Trefle" here is unrelated to the Trefle plants API (trefle.io).
