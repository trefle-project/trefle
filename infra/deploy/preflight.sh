#!/usr/bin/env bash
# Pre-deploy check for infra/.env — run this on the VPS before the first
# `docker compose ... up`. Exits non-zero and lists every problem.
#
#   ./infra/deploy/preflight.sh [path-to-env]   (default: infra/.env)
#
# It starts nothing and prints no secret value. Portable to bash 3.2.
set -u

ENV_FILE="${1:-infra/.env}"
fail=0
note() { printf '  x %s\n' "$1"; fail=1; }

[ -f "$ENV_FILE" ] || { echo "preflight: $ENV_FILE not found (git-crypt unlock first?)"; exit 2; }

# First KEY=VALUE match, comments ignored. Value may itself contain '='.
getval() { sed -n "s/^[[:space:]]*$1=//p" "$ENV_FILE" | head -1; }

need() { # need KEY [minlen]
  local k="$1" min="${2:-1}" v
  v="$(getval "$k")"
  if [ -z "$v" ]; then note "$k is empty"; return; fi
  if [ "${#v}" -lt "$min" ]; then note "$k is shorter than $min chars"; fi
}

echo "preflight: checking $ENV_FILE"

need PAYLOAD_SECRET 32
need REVALIDATE_SECRET 16
need UNSUBSCRIBE_SECRET 16
need FORM_TOKEN_SECRET 16
need CMS_SERVICE_API_KEY 16
need IMGPROXY_KEY 8
need IMGPROXY_SALT 8
need RELEASE 1
need ASSET_ORIGIN 1
need CMS_PUBLIC_URL 1
need SMTP_HOST 1

need POSTGRES_PASSWORD 12
case "$(getval POSTGRES_PASSWORD)" in
  trefle | trefle-* | "") note "POSTGRES_PASSWORD is a default/dev value" ;;
esac

for k in S3_ENDPOINT S3_REGION S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do
  need "$k" 1
done

# The dev Garage stand-in's key, secret and RPC secret are pinned in the dev
# overlay, hence public: production creates its own (README §1.3).
dev_overlay="$(dirname "$0")/../docker-compose.override.yml"
devval() { sed -n "s/.*$1 \"\([^\"]*\)\".*/\1/p" "$dev_overlay" | head -1; }
not_dev() { # not_dev KEY PATTERN-IN-DEV-OVERLAY
  local d
  d="$(devval "$2")"
  if [ -n "$d" ] && [ "$(getval "$1")" = "$d" ]; then
    note "$1 is the public dev value from docker-compose.override.yml (create a production one, README §1.3)"
  fi
}
if [ -f "$dev_overlay" ]; then
  not_dev S3_ACCESS_KEY_ID '&garage-key'
  not_dev S3_SECRET_ACCESS_KEY '&garage-secret'
  not_dev GARAGE_RPC_SECRET 'GARAGE_RPC_SECRET:'
fi
if [ "$(getval S3_ENDPOINT)" = "http://garage:3900" ]; then
  # GK + 24 hex is Garage's own format, the one README §1.3 generates; an
  # installation set up before that keeps the id Garage accepted at its first
  # boot (changing it means `garage key import`), so only its length counts.
  need S3_ACCESS_KEY_ID 20
  echo "$(getval S3_SECRET_ACCESS_KEY)" | grep -qE '^[0-9a-f]{64}$' ||
    note "S3_SECRET_ACCESS_KEY must be 64 hex chars for the self-hosted garage (README §1.3)"
  need GARAGE_RPC_SECRET 64
fi

seed_pw="$(getval SEED_ADMIN_PASSWORD)"
if [ -n "$seed_pw" ] && [ "${#seed_pw}" -lt 16 ]; then
  note "SEED_ADMIN_PASSWORD is set but shorter than 16 chars"
fi

# 012-url-page-import — all optional (an empty ANTHROPIC_API_KEY keeps the
# import hidden), but the test-only switches must never reach production.
case "$(getval IMPORT_AI_MODE)" in
  "") ;;
  *) note "IMPORT_AI_MODE is set (test-only; the cms refuses to boot with it in production)" ;;
esac
[ -z "$(getval IMPORT_ALLOW_PRIVATE_HOSTS)" ] ||
  note "IMPORT_ALLOW_PRIVATE_HOSTS is set (test-only; the cms refuses to boot with it in production)"
case "$(getval IMPORT_AI_EFFORT)" in
  "" | low | medium | high | xhigh | max) ;;
  *) note "IMPORT_AI_EFFORT must be one of low, medium, high, xhigh, max" ;;
esac
anthropic_key="$(getval ANTHROPIC_API_KEY)"
case "$anthropic_key" in
  "" | sk-ant-*) ;;
  *) note "ANTHROPIC_API_KEY is set but doesn't look like a Claude API key (sk-ant-…)" ;;
esac

# 019-admin-access — the admin's second factor stays on in production; off
# only as the rollback of its release, said explicitly.
if [ "$(getval TOTP_DISABLED)" = "1" ] && [ "$(getval ALLOW_TOTP_DISABLED)" != "1" ]; then
  note "TOTP_DISABLED=1 turns the admin's second factor off (set ALLOW_TOTP_DISABLED=1 too only to roll 019 back)"
fi

# 019-admin-access — Caddy verifies the Cloudflare Access token on the
# internal hosts with these two (compose refuses to start it without them).
need ACCESS_AUD 64
case "$(getval ACCESS_TEAM_DOMAIN)" in
  https://*.cloudflareaccess.com) ;;
  *) note "ACCESS_TEAM_DOMAIN must be https://<team>.cloudflareaccess.com" ;;
esac

# 019-admin-access — optional until Cloudflare Access is synced; when set, a
# real value (the same as infra/cloudflare/secret.env on the operator's machine).
edge_sync="$(getval EDGE_SYNC_SECRET)"
if [ -n "$edge_sync" ]; then
  [ "${#edge_sync}" -ge 32 ] || note "EDGE_SYNC_SECRET is shorter than 32 chars"
  case "$edge_sync" in dev-*) note "EDGE_SYNC_SECRET is the dev template value" ;; esac
fi

case "$(getval PAYLOAD_SECRET)" in
  ci-* | *not-a-real* | build-placeholder) note "PAYLOAD_SECRET looks like a placeholder" ;;
esac

if [ "$fail" -eq 0 ]; then
  echo "preflight: OK"
else
  echo "preflight: FAILED — fix the items above before deploying."
fi
exit "$fail"
