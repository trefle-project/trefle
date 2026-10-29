# Self-hosting GrowthBook

## Publisher & trust signals

- **GrowthBook, Inc.**, founded 2020 by Graham McNicoll (CEO) and Jeremy
  Dorn (CTO), who met at Education.com.
- $23.1M raised across two rounds: a $500K YC seed and a $22.6M Series A.
  Investors include Y Combinator, Khosla Ventures, Nexus Venture Partners,
  Nava Ventures.
- ~42 employees, 3,000+ companies using it, 5,300+ GitHub stars, reportedly
  over 1 trillion event lookups processed.
- **SOC 2 Type II certified, GDPR compliant** — relevant directly to this
  project's own GDPR-first posture.
- Notable users: Dropbox, Khan Academy, Wikipedia, Mistral AI, Sony.
- Not a fragile community project — a funded, certified vendor with real
  enterprise adoption.

## Licensing

Open-core. The self-hosted **core is MIT-licensed** — feature flagging and
experimentation (including the visual editor and the Bayesian/frequentist
stats engine) are fully open source. SSO, advanced permissions/approval
workflows, and audit logging sit behind a paid Enterprise tier. Nothing in
Trefle's anticipated usage (a single-workspace, self-hosted deployment)
needs the paid tier.

## Self-hosted architecture

- Ships as **a single Docker image** bundling a Next.js front-end, an
  Express API, and a Python stats engine.
- **Requires MongoDB** (or a MongoDB-compatible database — AWS DocumentDB,
  MongoDB Atlas, Azure DocumentDB) to store login credentials, cached
  experiment results, and metadata. This is a hard requirement, not
  optional — GrowthBook's own docs are explicit that the bundled Mongo
  container in their quick-start `docker-compose.yml` is for dev/staging
  only; production should point at a managed instance.
- Can use an **existing Postgres as the experiment-metrics datasource** —
  GrowthBook connects to it to compute exposure/conversion metrics via
  SQL, issuing SELECT-only queries, no separate data warehouse (BigQuery,
  Snowflake, ClickHouse, etc.) required. This is what lets Trefle avoid
  standing up a second analytics system: reuse the Postgres 16 instance
  Payload already owns as the datasource, while GrowthBook's own Mongo
  stays purely for its own config/metadata.
- Required env vars for a self-hosted instance: `GROWTHBOOK_API_HOST`,
  `GROWTHBOOK_APP_ORIGIN`, plus a Personal Access Token (read-only) or an
  API key for programmatic access (the SDKs, the Agent Skills plugin, the
  MCP server all authenticate this way).
- Also deployable via an official Helm chart if a Kubernetes target is
  ever relevant — not applicable to Trefle's current single-VPS Docker
  Compose setup.

## Trefle-specific implication

This is the one real operational cost of choosing GrowthBook over a
Postgres-native alternative like Flagsmith: a **second database engine**
(MongoDB) to run and back up alongside Postgres on the production VPS.
That trade-off, and its interaction with the VPS's not-yet-installed
offsite backup cron, is weighed in `docs/ab-testing-exploration.md` §2 and
explicitly deferred to a dedicated backup session in §6 — don't re-litigate
it here, follow that document's decision.
