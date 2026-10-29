# GrowthBook's official AI-agent tooling

Two separate, official ways for an AI coding agent to *operate a running
GrowthBook instance* — create/manage feature flags and experiments live.
Both are operational tooling for once GrowthBook is actually deployed;
neither changes Trefle's own architecture decisions, which live in
`docs/ab-testing-exploration.md`.

## Option 1 — Agent Skills plugin (Claude Code, Cursor, Codex, …)

```
/plugin marketplace add growthbook/skills
/plugin install growthbook@growthbook-skills
```

Then run `/growthbook:gb-setup` to configure credentials via a Personal
Access Token.

Standalone — **no MCP server process required**, calls GrowthBook's REST
API directly via shell commands ("same playbooks as the MCP server, no MCP
process," per GrowthBook's own docs). Covers four domains:

- **Feature flags** — create, target, ramp, review, publish, search, clean up.
- **Experiments** — brainstorm, design, launch, analyze, stop A/B tests.
- **Analytics** — search the metric catalog, chart data, build dashboards.
- **Setup** — credential configuration and validation.

## Option 2 — MCP server

Official Model Context Protocol server: <https://docs.growthbook.io/integrations/mcp>.
Same underlying capabilities as the Agent Skills plugin, exposed as MCP
tools instead, for any MCP-compatible client (Claude Code, Cursor, VS
Code, Codex). Launched in early 2025 as, per GrowthBook, the first
open-source production MCP server for experimentation.

## Not installed here — deliberately

Neither is installed in this repo. Installing either adds a plugin/
marketplace source and, once a Personal Access Token is configured, gives
the agent **live write access** to a real GrowthBook instance (creating
and modifying real feature flags and experiments). That's a call for
whoever is running the session once GrowthBook actually exists in this
project — not something to do speculatively ahead of it, and not something
this skill enables by default. Revisit once GrowthBook is actually
deployed per `docs/ab-testing-exploration.md`.
