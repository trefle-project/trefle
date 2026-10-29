#!/usr/bin/env bash
# 017-edge-protection (T021, research R4) — the Hostinger VPS firewall, as
# code: 22/tcp from anywhere, 443/tcp only from Cloudflare's published ranges,
# nothing else (80/tcp closed — Cloudflare redirects to HTTPS, certificates
# use DNS-01). It filters upstream of the VPS, where Docker cannot bypass it
# (Docker-published ports skip ufw).
#
# Usage:
#   infra/cloudflare/origin-firewall.sh --dry-run   print the rules, call nothing
#   infra/cloudflare/origin-firewall.sh             create/replace + sync + activate
#
# Idempotent: the firewall named $FIREWALL_NAME is created once, its rules are
# replaced atomically on every run (PUT …/rules, sync), and it is activated on
# the VPS if it is not the active one. Re-run after refresh-ips.sh changes the
# list. Hostinger API: https://developers.hostinger.com (VPS → Firewall).
# Needs HOSTINGER_API_TOKEN (hPanel → Account → API) and HOSTINGER_VPS_IP
# (the VPS address, to find its id), from secret.env.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

FIREWALL_NAME="trefle-cloudflare-only"
API="https://developers.hostinger.com"

dry=0
[[ "${1:-}" == "--dry-run" ]] && dry=1

fetch() {
  curl -fsS --retry 3 "$1" | tr -d '\r' | grep -E '^[0-9a-fA-F:.]+/[0-9]+$'
}
ranges="$(printf '%s\n%s\n' "$(fetch https://www.cloudflare.com/ips-v4)" "$(fetch https://www.cloudflare.com/ips-v6)")"
[[ "$(wc -l <<<"$ranges")" -ge 10 ]] || { echo "origin-firewall: Cloudflare range list looks wrong, nothing sent" >&2; exit 1; }

rules="$(jq -Rn --argjson ssh '{"protocol":"TCP","port":"22","source":"any","source_detail":"any"}' '
  [$ssh] + [inputs | select(length > 0) | {protocol: "TCP", port: "443", source: "custom", source_detail: .}]
' <<<"$ranges")"

if [[ "$dry" -eq 1 ]]; then
  echo "Firewall $FIREWALL_NAME — $(jq length <<<"$rules") rules (everything else dropped):"
  jq -r '.[] | "  accept \(.protocol) \(.port) from \(.source_detail)"' <<<"$rules"
  exit 0
fi

need HOSTINGER_API_TOKEN HOSTINGER_VPS_IP

# hapi METHOD PATH [JSON] — Hostinger API; prints the body, exits on HTTP >= 400.
hapi() {
  local method="$1" path="$2" body="${3:-}" out code
  local args=(-sS -X "$method" "$API$path" -w '\n%{http_code}'
    -H "Authorization: Bearer ${HOSTINGER_API_TOKEN}" -H "Content-Type: application/json" -H "Accept: application/json")
  [[ -n "$body" ]] && args+=(--data "$body")
  out="$(curl "${args[@]}")"
  code="$(tail -n1 <<<"$out")"
  out="$(sed '$d' <<<"$out")"
  if [[ "$code" -ge 400 ]]; then
    echo "origin-firewall: $method $path refused ($code): $out" >&2
    exit 1
  fi
  printf '%s' "$out"
}

vm="$(hapi GET /api/vps/v1/virtual-machines | jq --arg ip "$HOSTINGER_VPS_IP" \
  '(if type == "array" then . else .data end) | map(select(any(.ipv4[]?; .address == $ip))) | .[0] // empty')"
[[ -n "$vm" ]] || { echo "origin-firewall: no VPS with IPv4 $HOSTINGER_VPS_IP on this account" >&2; exit 1; }
vm_id="$(jq -r '.id' <<<"$vm")"
active_fw="$(jq -r '.firewall_group_id // empty' <<<"$vm")"

fw_id="$(hapi GET /api/vps/v1/firewall | jq -r --arg n "$FIREWALL_NAME" '.data[] | select(.name == $n) | .id' | head -1)"
if [[ -z "$fw_id" ]]; then
  fw_id="$(hapi POST /api/vps/v1/firewall "$(jq -cn --arg n "$FIREWALL_NAME" '{name: $n}')" | jq -r '.id')"
  echo "Created firewall $FIREWALL_NAME ($fw_id)."
fi

hapi PUT "/api/vps/v1/firewall/$fw_id/rules" "$(jq -c '{rules: ., sync: true}' <<<"$rules")" >/dev/null
echo "Firewall $FIREWALL_NAME ($fw_id): $(jq length <<<"$rules") rules set, sync requested."

if [[ "$active_fw" != "$fw_id" ]]; then
  hapi POST "/api/vps/v1/firewall/$fw_id/activate/$vm_id" >/dev/null
  echo "Activated on VPS $vm_id (was: ${active_fw:-none})."
else
  echo "Already the active firewall on VPS $vm_id."
fi

hapi GET "/api/vps/v1/firewall/$fw_id" | jq -r '"  synced: \(.is_synced), rules on Hostinger: \(.rules | length)"'
