#!/usr/bin/env bash
# 020-edge-html-cache (research R13, R15) — the edge Worker's routes, and
# nothing else (zone settings and rules stay with apply.sh).
#
# Usage: infra/cloudflare/worker-routes.sh <test|live|off|cut> [--dry-run]
#
#   test   the test host only (EDGE_TEST_HOSTNAME/* → trefle-edge)
#   live   every page host (*/* → trefle-edge) and the no-Worker exclusions
#   off    none of the routes listed in worker-routes.json
#   cut    remove only the routes that send traffic to the Worker; the
#          no-Worker exclusions stay (they are harmless alone) — edge-off.sh
#
# Only patterns listed in worker-routes.json are touched (cut: only routes
# pointing at its script). No-Worker routes are created before and removed
# after the Worker ones, so an excluded path (/api/*) never reaches the Worker.
# Needs CLOUDFLARE_ZONE_ID, CLOUDFLARE_WORKERS_TOKEN (Workers Routes: Edit)
# and the hostnames below — environment, then secret.env, then infra/.env.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

edge_routes="${1:-}"
[[ "$edge_routes" =~ ^(test|live|off|cut)$ ]] || { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
dry=0
[[ "${2:-}" == "--dry-run" ]] && dry=1
need EDGE_TEST_HOSTNAME CMS_HOSTNAME IMG_HOSTNAME ASSET_HOSTNAME GROWTHBOOK_HOSTNAME GROWTHBOOK_API_HOSTNAME
[[ "$dry" -eq 1 ]] || need CLOUDFLARE_ZONE_ID CLOUDFLARE_WORKERS_TOKEN
script_name="$(jq -r '.script' "$CF_DIR/worker-routes.json")"
# Every pattern of every set, filled: {pattern, script|null, wanted}.
routes="$(jq --arg set "$([[ "$edge_routes" == cut ]] && echo off || echo "$edge_routes")" --arg test "$EDGE_TEST_HOSTNAME" --arg cms "$CMS_HOSTNAME" \
  --arg img "$IMG_HOSTNAME" --arg asset "$ASSET_HOSTNAME" --arg gb "$GROWTHBOOK_HOSTNAME" \
  --arg gbapi "$GROWTHBOOK_API_HOSTNAME" -c '
  def fill: gsub("\\{\\{EDGE_TEST_HOSTNAME\\}\\}"; $test) | gsub("\\{\\{CMS_HOSTNAME\\}\\}"; $cms)
    | gsub("\\{\\{IMG_HOSTNAME\\}\\}"; $img) | gsub("\\{\\{ASSET_HOSTNAME\\}\\}"; $asset)
    | gsub("\\{\\{GROWTHBOOK_HOSTNAME\\}\\}"; $gb) | gsub("\\{\\{GROWTHBOOK_API_HOSTNAME\\}\\}"; $gbapi);
  .script as $script
  | ([.sets[][] | .pattern | fill] | unique) as $known
  | [.sets[$set][] | {pattern: (.pattern | fill), script: (if .worker then $script else null end)}] as $wanted
  | {known: $known, wanted: $wanted}' "$CF_DIR/worker-routes.json")"
if grep -q '{{' <<<"$routes"; then echo "apply: unfilled placeholder in worker-routes.json" >&2; exit 1; fi

echo; echo "Worker routes (EDGE_ROUTES=$edge_routes):"
if [[ "$dry" -eq 1 ]]; then
  jq -r '.wanted[] | "  \(.pattern) -> \(.script // "no Worker")"' <<<"$routes"
  if [[ "$edge_routes" == cut ]]; then echo "  (every route to $script_name removed; no-Worker exclusions kept)"
  else jq -r '.wanted | if length == 0 then "  (none: every Worker route in worker-routes.json removed)" else empty end' <<<"$routes"; fi
  exit 0
fi
# Only routes whose pattern appears in worker-routes.json are managed here.
# No-Worker routes are created before and removed after the Worker ones, so an
# excluded path (/api/*) never reaches the Worker, even for a moment.
existing="$(CLOUDFLARE_API_TOKEN="$CLOUDFLARE_WORKERS_TOKEN" cf GET "/zones/$CLOUDFLARE_ZONE_ID/workers/routes")"
while IFS=$'\t' read -r id pattern; do
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_WORKERS_TOKEN" cf DELETE "/zones/$CLOUDFLARE_ZONE_ID/workers/routes/$id" >/dev/null
  echo "  removed $pattern"
done < <(jq -r --argjson r "$routes" --arg cut "$([[ "$edge_routes" == cut ]] && echo 1)" --arg script "$script_name" 'sort_by(.script == null) | .[]
  | select(if $cut == "1" then .script == $script else (.pattern as $p | ($r.known | index($p)) and ([$r.wanted[].pattern] | index($p) | not)) end)
  | "\(.id)\t\(.pattern)"' <<<"$existing")
while IFS= read -r route; do
  pattern="$(jq -r '.pattern' <<<"$route")"
  script="$(jq -r '.script // ""' <<<"$route")"
  current="$(jq -c --arg p "$pattern" 'map(select(.pattern == $p)) | first // empty' <<<"$existing")"
  body="$(jq -c 'if .script == null then {pattern} else {pattern, script} end' <<<"$route")"
  if [[ -z "$current" ]]; then
    CLOUDFLARE_API_TOKEN="$CLOUDFLARE_WORKERS_TOKEN" cf POST "/zones/$CLOUDFLARE_ZONE_ID/workers/routes" "$body" >/dev/null
    echo "  added $pattern -> ${script:-no Worker}"
  elif [[ "$(jq -r '.script // ""' <<<"$current")" != "$script" ]]; then
    CLOUDFLARE_API_TOKEN="$CLOUDFLARE_WORKERS_TOKEN" cf PUT "/zones/$CLOUDFLARE_ZONE_ID/workers/routes/$(jq -r '.id' <<<"$current")" "$body" >/dev/null
    echo "  updated $pattern -> ${script:-no Worker}"
  else
    echo "  unchanged $pattern -> ${script:-no Worker}"
  fi
done < <(jq -c '.wanted | sort_by(.script != null) | .[]' <<<"$routes")

echo; echo "Routes now:"
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_WORKERS_TOKEN" cf GET "/zones/$CLOUDFLARE_ZONE_ID/workers/routes" | jq -r '.[] | "  \(.pattern) -> \(.script // "no Worker")"'
