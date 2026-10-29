# Documentation

## Start here

- [Features](features.md) — everything Trefle does, by area, with links to
  the specifications.
- [README](../README.md) — run Trefle locally, tests, deployment.

## User guides (admins and editors)

| Guide | English | French |
|---|---|---|
| Custom code and direct HTML editing | [custom-code.md](custom-code.md) | [code-personnalise.fr.md](code-personnalise.fr.md) |
| Importing a Penpot site, domain fonts | [penpot-import.md](penpot-import.md) | [import-penpot.fr.md](import-penpot.fr.md) |
| The carousel block | [carousel.md](carousel.md) | [carrousel.fr.md](carrousel.fr.md) |

## Operations

- [Production runbook](../infra/deploy/README.md) ([French](../infra/deploy/README.fr.md))
  — VPS setup, secrets, releases, rollback, backups, adding a client domain.
- [Cloudflare as code](../infra/cloudflare/README.md) — zone settings, WAF and
  rate-limit rules, Access, Worker routes, purge scripts.
- [Load tests](../infra/loadtest/README.md) — k6 scripts for pages, images
  and leads.

## Research notes

Written before or during a feature; they record the options weighed and why
one was chosen. In the public repository, addresses of the original
installation are replaced by `example.com` and documentation IP ranges.

| Note | English | French (original) | Led to |
|---|---|---|---|
| A/B testing exploration | [ab-testing-exploration.md](ab-testing-exploration.md) | — | 008, 018 |
| CDN and HTML cache exploration | [cdn-cache-exploration.md](cdn-cache-exploration.md) | [cdn-cache-exploration.fr.md](cdn-cache-exploration.fr.md) | 017, 020 |
| A/B measurement and the CNIL guidance | [ab-measurement-cnil.md](ab-measurement-cnil.md) | [mesure-ab-cnil.fr.md](mesure-ab-cnil.fr.md) | 018 |
| Cloudflare as a data processor | [cloudflare-processor.md](cloudflare-processor.md) | [sous-traitant-cloudflare.fr.md](sous-traitant-cloudflare.fr.md) | 017, 021 |

## Legal templates

Written for operators established in France, under the GDPR. Templates to
adapt to your jurisdiction and have reviewed, not legal advice. The French
versions are the originals.

| Template | English | French (original) |
|---|---|---|
| Data processing agreement (GDPR Art. 28) | [data-processing-agreement.md](legal/data-processing-agreement.md) | [contrat-sous-traitance.fr.md](legal/contrat-sous-traitance.fr.md) |
| Record of processing activities (GDPR Art. 30) | [record-of-processing.md](legal/record-of-processing.md) | [registre-traitements.fr.md](legal/registre-traitements.fr.md) |
