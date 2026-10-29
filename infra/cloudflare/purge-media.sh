#!/usr/bin/env bash
# 017-edge-protection (FR-015, research R12) — take an image down from the edge.
#
# Usage: infra/cloudflare/purge-media.sh <key> [<key>…]
#
#   <key>  an object key as stored in the bucket (the media's filename,
#          e.g. photo-3fa1c09b.jpg), not a URL.
#
# Remove the file from storage first, then run this with every old key:
#   - unused image: delete it in the admin (Médiathèque → Supprimer), then
#     purge its key;
#   - used image (deletion is refused while a page uses it): replace its file
#     with the corrected or a neutral image (« Remplacer partout »), then purge
#     the old key(s) — the pages already show the new file through the alias map.
#
# Purges https://$ASSET_HOSTNAME/<key> by URL and the whole $IMG_HOSTNAME by
# hostname (imgproxy URLs start with their signature: no narrower purge can
# target one source; every image is re-processed once, a rare deliberate act).
#
# Needs CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN (cache purge), ASSET_HOSTNAME,
# IMG_HOSTNAME — read from the environment, else from infra/.env.
set -euo pipefail

if [[ $# -eq 0 || "$1" == "-h" || "$1" == "--help" ]]; then
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
  exit $([[ $# -eq 0 ]] && echo 1 || echo 0)
fi

source "$(dirname "$0")/lib.sh"
need CLOUDFLARE_ZONE_ID CLOUDFLARE_API_TOKEN ASSET_HOSTNAME IMG_HOSTNAME
purge() { cf POST "/zones/$CLOUDFLARE_ZONE_ID/purge_cache" "$1" >/dev/null; }

# The purge-by-URL API takes at most 30 URLs per call.
urls=()
for key in "$@"; do
  key="${key#/}"
  urls+=("https://${ASSET_HOSTNAME}/${key}")
done
for ((i = 0; i < ${#urls[@]}; i += 30)); do
  purge "$(jq -cn '{files: $ARGS.positional}' --args "${urls[@]:i:30}")"
done
echo "Purged ${#urls[@]} asset URL(s) on ${ASSET_HOSTNAME}."

purge "$(jq -cn --arg h "$IMG_HOSTNAME" '{hosts: [$h]}')"
echo "Purged every cached image on ${IMG_HOSTNAME} (re-processed on next view)."
