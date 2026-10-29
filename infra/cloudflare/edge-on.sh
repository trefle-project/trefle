#!/usr/bin/env bash
# 020-edge-html-cache (research R15) — switch page caching back on.
#
# Usage: infra/cloudflare/edge-on.sh [live|test] [--dry-run]
#
#   live   every page host through the Worker (the default once live)
#   test   the test host only (EDGE_TEST_HOSTNAME), as during validation
set -euo pipefail
set_name=live
if [[ "${1:-}" == live || "${1:-}" == test ]]; then set_name="$1"; shift; fi
[[ $# -eq 0 || "$1" == --dry-run ]] || { echo "edge-on: usage: edge-on.sh [live|test] [--dry-run]" >&2; exit 1; }
exec "$(dirname "$0")/worker-routes.sh" "$set_name" "$@"
