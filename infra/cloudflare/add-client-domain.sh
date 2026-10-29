#!/usr/bin/env bash
# 017-edge-protection (US5, FR-016, research R2) — puts a client domain behind
# Cloudflare for SaaS, on its `www.` host (apex proxying is Enterprise-only;
# the client's root forwards to www. at their registrar).
#
# Usage: infra/cloudflare/add-client-domain.sh www.<client-domain>
#
# Creates the custom hostname (edge certificate validated over HTTP, automatic
# once the client's CNAME exists), then prints what the client must add and
# what we change on our side. Re-running shows the current status.
# Needs CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN (SSL and Certificates: Edit),
# SAAS_CNAME_TARGET and ACME_DELEGATE_HOSTNAME.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

host="${1:-}"
if [[ ! "$host" =~ ^www\.[a-z0-9.-]+\.[a-z]{2,}$ ]]; then
  echo "Usage: $0 www.<client-domain>   (the www. host, lower case)" >&2
  exit 1
fi
root="${host#www.}"
need CLOUDFLARE_ZONE_ID CLOUDFLARE_API_TOKEN SAAS_CNAME_TARGET ACME_DELEGATE_HOSTNAME

existing="$(cf GET "/zones/$CLOUDFLARE_ZONE_ID/custom_hostnames?hostname=$host" | jq '.[0] // empty')"
if [[ -z "$existing" ]]; then
  existing="$(cf POST "/zones/$CLOUDFLARE_ZONE_ID/custom_hostnames" \
    "$(jq -cn --arg h "$host" '{hostname: $h, ssl: {method: "http", type: "dv"}}')")"
  echo "Custom hostname $host created."
else
  echo "Custom hostname $host already exists."
fi
echo "  hostname status:    $(jq -r '.status' <<<"$existing")"
echo "  certificate status: $(jq -r '.ssl.status' <<<"$existing")"

cat <<MSG

1. The client adds, at their DNS provider:
     www.$root                  CNAME  $SAAS_CNAME_TARGET
     _acme-challenge.www.$root  CNAME  $ACME_DELEGATE_HOSTNAME
2. The client's registrar forwards the root to www., permanently:
     https://$root/<path>?<query>  →  301  →  https://www.$root/<path>?<query>
   HTTPS on the root, 301, path AND query kept (links in already-sent emails
   point at the root). If the registrar cannot keep path + query, move that
   client's zone into our account instead (research R2) — check with:
     curl -sI "https://$root/x?y=1" | grep -i '^location'
3. On our side:
   - admin: the Domains record's hostname is www.$root;
   - infra/.env: add www.$root to WEB_HOSTNAMES (instead of $root), then deploy
     (infra/deploy/release.sh) so Caddy obtains its origin certificate by DNS-01.
4. Re-run this script until both statuses are "active", then open
   https://www.$root/ (quickstart V9).
MSG
