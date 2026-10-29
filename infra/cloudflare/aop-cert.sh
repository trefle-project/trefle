#!/usr/bin/env bash
# 017-edge-protection (FR-002, research R4) — zone-level Authenticated Origin
# Pulls with OUR OWN certificate: the origin then accepts TLS only from
# Cloudflare acting for this zone, not from any Cloudflare customer (the
# shared global AOP certificate would prove only "from Cloudflare").
#
# Usage:
#   infra/cloudflare/aop-cert.sh            first run: CA + client certificate,
#                                           upload, enable zone-level AOP
#   infra/cloudflare/aop-cert.sh --renew    new client certificate from the
#                                           same CA (before expiry; Caddy unchanged)
#
# Writes:
#   infra/deploy/aop/ca.pem                 CA certificate, public — Caddy trusts it
#   infra/cloudflare/secret-aop-ca.key      CA key        ┐ git-crypt encrypted
#   infra/cloudflare/secret-aop-client.pem  client cert   │ (.gitattributes
#   infra/cloudflare/secret-aop-client.key  client key    ┘  infra/**/secret*)
# Commit them (check `git crypt status` shows the secret-* files encrypted).
#
# Enabling AOP at the zone changes nothing for the origin until Caddy imports
# `(origin_tls_aop)` (tasks T020) — do that only once every host is proxied.
# Needs CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN (Zone → SSL and Certificates → Edit).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

ca_crt="$INFRA_DIR/deploy/aop/ca.pem"
ca_key="$CF_DIR/secret-aop-ca.key"
cl_crt="$CF_DIR/secret-aop-client.pem"
cl_key="$CF_DIR/secret-aop-client.key"
renew=0
[[ "${1:-}" == "--renew" ]] && renew=1

need CLOUDFLARE_ZONE_ID CLOUDFLARE_API_TOKEN

if [[ ! -f "$ca_key" ]]; then
  [[ "$renew" -eq 1 ]] && { echo "aop-cert: --renew needs the existing CA ($ca_key)" >&2; exit 1; }
  echo "Creating the AOP CA (10 years)…"
  openssl req -x509 -newkey rsa:4096 -nodes -sha256 -days 3650 \
    -subj "/O=Trefle/CN=Trefle origin-pull CA" \
    -keyout "$ca_key" -out "$ca_crt" 2>/dev/null
fi

echo "Issuing the client certificate Cloudflare will present (2 years)…"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
openssl req -new -newkey rsa:2048 -nodes -subj "/O=Trefle/CN=Cloudflare origin pull" \
  -keyout "$tmp/client.key" -out "$tmp/client.csr" 2>/dev/null
printf 'extendedKeyUsage=clientAuth\nkeyUsage=digitalSignature,keyEncipherment\n' >"$tmp/ext"
openssl x509 -req -sha256 -days 730 -in "$tmp/client.csr" -CA "$ca_crt" -CAkey "$ca_key" \
  -CAcreateserial -CAserial "$tmp/ca.srl" -extfile "$tmp/ext" -out "$tmp/client.pem" 2>/dev/null
openssl verify -CAfile "$ca_crt" "$tmp/client.pem" >/dev/null

echo "Uploading it as the zone's Authenticated Origin Pulls certificate…"
id="$(cf POST "/zones/$CLOUDFLARE_ZONE_ID/origin_tls_client_auth" \
  "$(jq -n --rawfile c "$tmp/client.pem" --rawfile k "$tmp/client.key" '{certificate: $c, private_key: $k}')" | jq -r '.id')"
for _ in $(seq 1 30); do
  status="$(cf GET "/zones/$CLOUDFLARE_ZONE_ID/origin_tls_client_auth/$id" | jq -r '.status')"
  [[ "$status" == "active" ]] && break
  sleep 5
done
[[ "$status" == "active" ]] || { echo "aop-cert: certificate $id still '$status' — check the dashboard" >&2; exit 1; }
cp "$tmp/client.pem" "$cl_crt"
cp "$tmp/client.key" "$cl_key"

cf PUT "/zones/$CLOUDFLARE_ZONE_ID/origin_tls_client_auth/settings" '{"enabled":true}' >/dev/null
echo "Zone-level AOP enabled with certificate $id (expires $(openssl x509 -enddate -noout -in "$cl_crt" | cut -d= -f2))."

if [[ "$renew" -eq 1 ]]; then
  echo "Older certificates stay listed: delete them once this one is active:"
  cf GET "/zones/$CLOUDFLARE_ZONE_ID/origin_tls_client_auth" | jq -r --arg id "$id" '.[] | select(.id != $id) | "  \(.id)  \(.status)  expires \(.expires_on)"'
fi
echo "Next: commit infra/deploy/aop/ca.pem and infra/cloudflare/secret-aop-*, then deploy."
