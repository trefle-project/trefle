#!/usr/bin/env bash
# 019-admin-access (contracts/edge-access.md, research R1, R7) — Cloudflare
# Access in front of the admin and GrowthBook: one application over the three
# internal hosts, e-mail one-time code only, 24 h sessions; its allow-list is
# the CMS's active members. Run by apply.sh (every run) and by
# `apply.sh --sync-members` (this script alone). Idempotent.
#
# Usage:
#   infra/cloudflare/access.sh             apply the application + member sync
#   infra/cloudflare/access.sh --dry-run   print what would be sent, change nothing
#   ACCESS_ENABLED=0 infra/cloudflare/access.sh
#                                          delete the application (rollback)
#
# Sequence (each run):
#   1. the `trefle-apply` service token — created on the first run, which then
#      stops: Cloudflare shows its secret only once, save it in secret.env;
#   2. GET https://$CMS_HOSTNAME/api/edge-access (EDGE_SYNC_SECRET + the
#      service token) → the active members' e-mails; an empty list aborts;
#   3. the two reusable policies (access/policies.json), then the application
#      (access/application.json), created or updated by name;
#   4. POST /api/edge-access/synced with the list applied — the admin's record
#      of what Cloudflare enforces.
#
# Needs CLOUDFLARE_API_TOKEN with Account → Access: Apps and Policies, Access:
# Service Tokens — Edit (and Access: Organizations, Identity Providers, and
# Groups — Read), CLOUDFLARE_ACCOUNT_ID, the three internal hostnames,
# EDGE_SYNC_SECRET, and after the first run ACCESS_SERVICE_TOKEN_ID/_SECRET.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

dry=0
[[ "${1:-}" == "--dry-run" ]] && dry=1

APP_NAME="trefle-internal"
TOKEN_NAME="trefle-apply"

need CMS_HOSTNAME GROWTHBOOK_HOSTNAME GROWTHBOOK_API_HOSTNAME
[[ "$dry" -eq 1 ]] || need CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
acct="/accounts/${CLOUDFLARE_ACCOUNT_ID:-dry-run}/access"

# by_name LIST_PATH NAME — the id of the object with that name, or empty.
by_name() { cf GET "$1" | jq -r --arg n "$2" '[.[]? | select(.name == $n)][0].id // empty'; }

# --- 0. rollback switch
if [[ "${ACCESS_ENABLED:-1}" == "0" ]]; then
  if [[ "$dry" -eq 1 ]]; then echo "Access: would delete the application $APP_NAME"; exit 0; fi
  app_id="$(by_name "$acct/apps" "$APP_NAME")"
  if [[ -z "$app_id" ]]; then echo "Access: no application $APP_NAME — nothing to delete"; exit 0; fi
  cf DELETE "$acct/apps/$app_id" >/dev/null
  echo "Access: application $APP_NAME DELETED (ACCESS_ENABLED=0) — the internal hosts are no longer behind Access."
  echo "Access: if Caddy still checks the Access token (019 step 3), the admin now answers 401 to everyone: roll the release back first (release.sh --rollback 019.2-edge-access)."
  exit 0
fi

if [[ "$dry" -eq 1 ]]; then
  members='["member@example.com"]'; token_uuid="<trefle-apply token id>"; idp_id="<one-time PIN id>"
else
  need EDGE_SYNC_SECRET

  # --- 1. service token
  token="$(cf GET "$acct/service_tokens" | jq -c --arg n "$TOKEN_NAME" '[.[]? | select(.name == $n)][0] // empty')"
  if [[ -z "$token" ]]; then
    created="$(cf POST "$acct/service_tokens" "$(jq -cn --arg n "$TOKEN_NAME" '{name: $n, duration: "8760h"}')")"
    cat <<EOF
Access: service token $TOKEN_NAME CREATED. Cloudflare shows its secret only now.
Add these two lines to infra/cloudflare/secret.env, then run the same command again:

ACCESS_SERVICE_TOKEN_ID=$(jq -r '.client_id' <<<"$created")
ACCESS_SERVICE_TOKEN_SECRET=$(jq -r '.client_secret' <<<"$created")

EOF
    exit 3
  fi
  need ACCESS_SERVICE_TOKEN_ID ACCESS_SERVICE_TOKEN_SECRET
  [[ "$(jq -r '.client_id' <<<"$token")" == "$ACCESS_SERVICE_TOKEN_ID" ]] || {
    echo "access: ACCESS_SERVICE_TOKEN_ID does not match the $TOKEN_NAME token in Cloudflare. If its secret is lost, delete $TOKEN_NAME (Zero Trust → Access controls → Service credentials) and run again." >&2
    exit 1
  }
  token_uuid="$(jq -r '.id' <<<"$token")"
  expires="$(jq -r '.expires_at // empty' <<<"$token")"
  echo "Access: service token $TOKEN_NAME present (expires ${expires:-never})."

  # --- 2. members, from the CMS (through Access once the application exists)
  out="$(curl -sS --max-time 20 -w '\n%{http_code}' "https://$CMS_HOSTNAME/api/edge-access" \
    -H "X-Edge-Sync-Secret: $EDGE_SYNC_SECRET" \
    -H "CF-Access-Client-Id: $ACCESS_SERVICE_TOKEN_ID" -H "CF-Access-Client-Secret: $ACCESS_SERVICE_TOKEN_SECRET")"
  code="${out##*$'\n'}"
  [[ "$code" == "200" ]] || { echo "access: GET https://$CMS_HOSTNAME/api/edge-access answered $code — is the 019 step 2 release live, and EDGE_SYNC_SECRET the same as on the VPS?" >&2; exit 1; }
  members="$(jq -c '.emails' <<<"${out%$'\n'*}")"
  [[ "$(jq 'length' <<<"$members")" -gt 0 ]] || { echo "access: the CMS returned no active member — refusing to apply an empty allow-list" >&2; exit 1; }

  # --- one-time PIN, the only login method
  idp_id="$(cf GET "$acct/identity_providers" | jq -r '[.[]? | select(.type == "onetimepin")][0].id // empty')"
  [[ -n "$idp_id" ]] || { echo "access: no One-time PIN login method — add it (Zero Trust → Integrations → Identity providers → Add new → One-time PIN). If it is there, the token lacks Access: Organizations, Identity Providers, and Groups — Read." >&2; exit 1; }
fi
echo "Access: $(jq 'length' <<<"$members") member(s): $(jq -r 'join(", ")' <<<"$members")"

# --- 3. policies, then the application
policy_ids=()
while IFS= read -r policy; do
  name="$(jq -r '.name' <<<"$policy")"
  if [[ "$dry" -eq 1 ]]; then echo; echo "Policy $name:"; jq . <<<"$policy"; policy_ids+=("<$name id>"); continue; fi
  id="$(by_name "$acct/policies" "$name")"
  if [[ -n "$id" ]]; then cf PUT "$acct/policies/$id" "$policy" >/dev/null; else id="$(cf POST "$acct/policies" "$policy" | jq -r '.id')"; fi
  policy_ids+=("$id")
  echo "Access: policy $name applied."
done < <(jq -c --argjson members "$members" --arg token "$token_uuid" '
  .policies[] | walk(
    if . == "{{MEMBERS}}" then ($members | map({email: {email: .}}))
    elif . == "{{SERVICE_TOKEN_ID}}" then $token else . end)' "$CF_DIR/access/policies.json")

ids="$(printf '%s\n' "${policy_ids[@]}" | jq -R . | jq -sc .)"
app="$(jq -c --arg cms "$CMS_HOSTNAME" --arg gb "$GROWTHBOOK_HOSTNAME" --arg gbapi "$GROWTHBOOK_API_HOSTNAME" \
  --arg idp "$idp_id" --argjson ids "$ids" '
  del(._comment) | walk(if type == "string" then
      gsub("\\{\\{CMS_HOSTNAME\\}\\}"; $cms) | gsub("\\{\\{GROWTHBOOK_API_HOSTNAME\\}\\}"; $gbapi)
      | gsub("\\{\\{GROWTHBOOK_HOSTNAME\\}\\}"; $gb) | gsub("\\{\\{OTP_IDP_ID\\}\\}"; $idp)
    else . end)
  | .policies = [$ids | to_entries[] | {id: .value, precedence: (.key + 1)}]' \
  "$CF_DIR/access/application.json")"
if grep -q '{{' <<<"$app"; then echo "access: unfilled placeholder in access/application.json" >&2; exit 1; fi
if [[ "$dry" -eq 1 ]]; then echo; echo "Application $APP_NAME:"; jq . <<<"$app"; exit 0; fi

app_id="$(by_name "$acct/apps" "$APP_NAME")"
if [[ -n "$app_id" ]]; then result="$(cf PUT "$acct/apps/$app_id" "$app")"; else result="$(cf POST "$acct/apps" "$app")"; fi
echo "Access: application $APP_NAME applied on $CMS_HOSTNAME, $GROWTHBOOK_HOSTNAME, $GROWTHBOOK_API_HOSTNAME."
echo "Access: AUD tag = $(jq -r '.aud' <<<"$result")  (ACCESS_AUD for the VPS infra/.env, 019 step 3)"

# --- 4. tell the CMS what Cloudflare now enforces (it is behind Access now:
# the service token goes through; a new policy can take a few seconds).
body="$(jq -cn --argjson e "$members" '{emails: $e}')"
for attempt in 1 2 3 4 5 6; do
  code="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' -X POST "https://$CMS_HOSTNAME/api/edge-access/synced" \
    -H "Content-Type: application/json" -H "X-Edge-Sync-Secret: $EDGE_SYNC_SECRET" \
    -H "CF-Access-Client-Id: $ACCESS_SERVICE_TOKEN_ID" -H "CF-Access-Client-Secret: $ACCESS_SERVICE_TOKEN_SECRET" \
    --data "$body" || true)"
  [[ "$code" == "204" ]] && { echo "Access: the CMS recorded the synced list."; exit 0; }
  sleep 5
done
echo "access: the application is applied, but POST /api/edge-access/synced answered $code — the admin will show the list as out of date. Run apply.sh --sync-members again." >&2
exit 1
