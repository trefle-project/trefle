#!/usr/bin/env bash
# 017-edge-protection (FR-018, research R15) — applies infra/cloudflare/ to the
# zone. Idempotent: run it after any change to settings.json or rules/*.json,
# or to a hostname in infra/.env.
#
# Usage:
#   infra/cloudflare/apply.sh             apply settings + every rules/*.json
#   infra/cloudflare/apply.sh --dry-run   print what would be sent, call nothing
#   infra/cloudflare/apply.sh --sync-members
#                                         only Cloudflare Access (019, access.sh):
#                                         re-read the members from the CMS and
#                                         apply them — after adding or removing one
#   ACCESS_ENABLED=0 infra/cloudflare/apply.sh --sync-members
#                                         delete the Access application (rollback)
#   LOADTEST_IP=203.0.113.9 infra/cloudflare/apply.sh
#                                         also let that address skip rate limiting
#                                         (k6 run, R16) — re-run without it after
#   EDGE_ROUTES=test|live|off infra/cloudflare/apply.sh
#                                         then set the edge Worker's routes
#                                         (020, worker-routes.sh); unset = keep
#                                         the routes as they are
#
# Each rules/*.json replaces its whole phase (PUT on the phase entrypoint):
# a rule removed from the file is removed from the zone. Placeholders:
#   {{IMG_HOSTNAME}} {{ASSET_HOSTNAME}}   single hosts
#   {{NON_PAGE_HOSTS}} {{INTERNAL_HOSTS}} quoted host lists, for `in { … }`
#   {{LOADTEST_IP}}                       rules with "_only_if": "LOADTEST_IP"
#                                         are sent only when it is set
# Needs CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN (Zone Settings, Zone WAF,
# Config Rules/Cache Rules, Bot Management: Edit) and the hostnames below; with
# EDGE_ROUTES, also EDGE_TEST_HOSTNAME and CLOUDFLARE_WORKERS_TOKEN (Workers
# Routes: Edit).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

dry=0
[[ "${1:-}" == "--dry-run" ]] && dry=1
# 019-admin-access — Cloudflare Access alone.
[[ "${1:-}" == "--sync-members" ]] && exec "$CF_DIR/access.sh" "${@:2}"

need IMG_HOSTNAME ASSET_HOSTNAME CMS_HOSTNAME GROWTHBOOK_HOSTNAME GROWTHBOOK_API_HOSTNAME
[[ "$dry" -eq 1 ]] || need CLOUDFLARE_ZONE_ID CLOUDFLARE_API_TOKEN

quoted() { printf '"%s" ' "$@" | sed 's/ $//'; }
internal="$(quoted "$CMS_HOSTNAME" "$GROWTHBOOK_HOSTNAME" "$GROWTHBOOK_API_HOSTNAME")"
non_page="$(quoted "$IMG_HOSTNAME" "$ASSET_HOSTNAME" "$CMS_HOSTNAME" "$GROWTHBOOK_HOSTNAME" "$GROWTHBOOK_API_HOSTNAME")"
edge_routes="${EDGE_ROUTES:-}"
[[ -z "$edge_routes" || "$edge_routes" =~ ^(test|live|off)$ ]] || { echo "apply: EDGE_ROUTES must be test, live or off" >&2; exit 1; }
if [[ -n "$edge_routes" ]]; then
  need EDGE_TEST_HOSTNAME
  [[ "$dry" -eq 1 ]] || need CLOUDFLARE_WORKERS_TOKEN
fi
loadtest="${LOADTEST_IP:-}"
[[ -z "$loadtest" || "$loadtest" =~ ^[0-9a-fA-F:.]+$ ]] || { echo "apply: LOADTEST_IP '$loadtest' is not an address" >&2; exit 1; }

render() {
  jq --arg img "$IMG_HOSTNAME" --arg asset "$ASSET_HOSTNAME" --arg internal "$internal" \
    --arg nonpage "$non_page" --arg lt "$loadtest" '
    def fill: gsub("\\{\\{IMG_HOSTNAME\\}\\}"; $img) | gsub("\\{\\{ASSET_HOSTNAME\\}\\}"; $asset)
      | gsub("\\{\\{INTERNAL_HOSTS\\}\\}"; $internal) | gsub("\\{\\{NON_PAGE_HOSTS\\}\\}"; $nonpage)
      | gsub("\\{\\{LOADTEST_IP\\}\\}"; $lt);
    {phase, rules: [.rules[]
      | select((._only_if // "") != "LOADTEST_IP" or $lt != "")
      | del(._only_if)
      | walk(if type == "string" then fill else . end)]}' "$1"
}

# --- zone settings
echo "Zone settings:"
while IFS=$'\t' read -r id value; do
  if [[ "$dry" -eq 1 ]]; then echo "  $id = $value"; continue; fi
  if [[ "$id" == "polish" ]]; then
    # Pro feature: on Free it cannot be set, and is off anyway.
    (cf PATCH "/zones/$CLOUDFLARE_ZONE_ID/settings/$id" "$(jq -cn --arg v "$value" '{value: $v}')" >/dev/null 2>&1) \
      && echo "  $id = $value" || echo "  $id: not available on this plan (off)"
    continue
  fi
  cf PATCH "/zones/$CLOUDFLARE_ZONE_ID/settings/$id" "$(jq -cn --arg v "$value" '{value: $v}')" >/dev/null
  echo "  $id = $value"
done < <(jq -r '.settings | to_entries[] | "\(.key)\t\(.value)"' "$CF_DIR/settings.json")

fight="$(jq '.bot_fight_mode' "$CF_DIR/settings.json")"
if [[ "$dry" -eq 1 ]]; then
  echo "  bot fight mode = $fight"
else
  cf PUT "/zones/$CLOUDFLARE_ZONE_ID/bot_management" "$(jq -cn --argjson f "$fight" '{fight_mode: $f}')" >/dev/null
  echo "  bot fight mode = $fight"
fi

# --- rulesets
for file in "$CF_DIR"/rules/*.json; do
  body="$(render "$file")"
  phase="$(jq -r '.phase' <<<"$body")"
  if grep -q '{{' <<<"$body"; then echo "apply: unfilled placeholder in $file" >&2; exit 1; fi
  if [[ "$dry" -eq 1 ]]; then
    echo; echo "PUT phase $phase ($(basename "$file")):"; jq '.rules' <<<"$body"; continue
  fi
  cf PUT "/zones/$CLOUDFLARE_ZONE_ID/rulesets/phases/$phase/entrypoint" "$(jq -c '{rules}' <<<"$body")" >/dev/null
  echo "Phase $phase: $(jq '.rules | length' <<<"$body") rule(s) applied ($(basename "$file"))."
done

# --- edge Worker routes (020, research R13): worker-routes.sh
if [[ -n "$edge_routes" ]]; then
  echo
  "$CF_DIR/worker-routes.sh" "$edge_routes" $([[ "$dry" -eq 1 ]] && echo --dry-run)
fi

# --- Cloudflare Access on the internal hosts (019-admin-access): access.sh
echo
exec "$CF_DIR/access.sh" $([[ "$dry" -eq 1 ]] && echo --dry-run)
