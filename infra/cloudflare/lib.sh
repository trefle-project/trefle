# Shared by the infra/cloudflare scripts (017-edge-protection, research R15).
# Sourced, not run. Needs bash, curl, jq.

CF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$CF_DIR/.." && pwd)"

# need NAME… — each from the environment, else infra/cloudflare/secret.env
# (production values for these scripts, git-crypt), else infra/.env.
need() {
  local name value file
  for name in "$@"; do
    for file in "$CF_DIR/secret.env" "$INFRA_DIR/.env"; do
      [[ -n "${!name:-}" || ! -f "$file" ]] && continue
      value="$(grep -E "^${name}=" "$file" | tail -1 | cut -d= -f2- || true)"
      [[ -n "$value" ]] && export "$name=$value"
    done
    [[ -n "${!name:-}" ]] || { echo "$(basename "$0"): $name is not set (environment, infra/cloudflare/secret.env or infra/.env)" >&2; exit 1; }
  done
}

# cf METHOD PATH [JSON] — Cloudflare API v4 with CLOUDFLARE_API_TOKEN; prints
# `.result`, exits with Cloudflare's errors on failure.
cf() {
  local method="$1" path="$2" body="${3:-}" out
  local args=(-sS -X "$method" "https://api.cloudflare.com/client/v4$path"
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json")
  [[ -n "$body" ]] && args+=(--data "$body")
  out="$(curl "${args[@]}")"
  if [[ "$(jq -r '.success' <<<"$out" 2>/dev/null)" != "true" ]]; then
    echo "$(basename "$0"): $method $path refused: $(jq -c '.errors // .' <<<"$out" 2>/dev/null || echo "$out")" >&2
    exit 1
  fi
  jq '.result' <<<"$out"
}
