#!/usr/bin/env bash
# 020-edge-html-cache (research R15, FR-023) — switch page caching off, now.
# Removes every route that sends traffic to the edge Worker: each request then
# goes straight to the origin, which renders it as before 020 (legacy mode),
# within seconds and without a server deploy. The no-Worker exclusions stay
# (harmless alone). Undo with edge-on.sh.
#
# Usage: infra/cloudflare/edge-off.sh [--dry-run]
set -euo pipefail
exec "$(dirname "$0")/worker-routes.sh" cut "$@"
