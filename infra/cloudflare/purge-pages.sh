#!/usr/bin/env bash
# 020-edge-html-cache (contracts/purge.md) — drop cached pages from the edge
# by hand. Content changes and releases already purge on their own; this is
# for the odd case (a purge that failed, a page that looks stale).
#
# Usage: infra/cloudflare/purge-pages.sh [html | domain:<id> …]
#
#   html          every cached page of every host (the default)
#   domain:<id>   the cached pages of one CMS domain (its id in the admin URL)
#
# Needs CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN (cache purge) — read from the
# environment, else infra/cloudflare/secret.env, else infra/.env.
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

tags=("${@:-html}")
for tag in "${tags[@]}"; do
  [[ "$tag" == "html" || "$tag" =~ ^domain:[0-9]+$ ]] || { echo "purge-pages: '$tag' is neither html nor domain:<id>" >&2; exit 1; }
done

source "$(dirname "$0")/lib.sh"
need CLOUDFLARE_ZONE_ID CLOUDFLARE_API_TOKEN
cf POST "/zones/$CLOUDFLARE_ZONE_ID/purge_cache" "$(printf '%s\n' "${tags[@]}" | jq -R . | jq -cs '{tags: .}')" >/dev/null
echo "Purged: ${tags[*]}"
