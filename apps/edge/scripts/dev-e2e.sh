#!/usr/bin/env bash
# 020-edge-html-cache (T028) — the edge Worker in front of the local stack,
# for the e2e `edge` run (`npm run test:e2e:docker:edge`).
#
# Listens on 0.0.0.0:8787 (reachable from the Playwright container as
# host.docker.internal:8787) and sends every origin request to the renderer
# on localhost:3001 (ORIGIN_OVERRIDE). EDGE_SECRET and FORM_TOKEN_SECRET are
# read from infra/.env, so the renderer and the Worker agree. Local wrangler
# does not reproduce Cloudflare's cache: every page goes through edge mode and
# the substitution, uncached. 018: `EXPOSURES=on ./scripts/dev-e2e.sh` turns
# the A/B measurement on; the local queue posts exposures to the renderer.
set -euo pipefail
cd "$(dirname "$0")/.."
env_file=../../infra/.env
value() { grep -E "^$1=" "$env_file" | tail -1 | cut -d= -f2-; }
edge_secret="$(value EDGE_SECRET)"
form_secret="$(value FORM_TOKEN_SECRET)"
[[ -n "$edge_secret" && -n "$form_secret" ]] || { echo "dev-e2e: set EDGE_SECRET and FORM_TOKEN_SECRET in infra/.env" >&2; exit 1; }
exec npx wrangler dev --ip 0.0.0.0 --port 8787 \
  --var "ORIGIN_OVERRIDE:${ORIGIN_OVERRIDE:-http://localhost:3001}" \
  --var "EXPOSURES:${EXPOSURES:-off}" \
  --var "ORIGIN_INGEST_URL:${ORIGIN_INGEST_URL:-http://localhost:3001}" \
  --var "EDGE_SECRET:$edge_secret" \
  --var "FORM_TOKEN_SECRET:$form_secret"
