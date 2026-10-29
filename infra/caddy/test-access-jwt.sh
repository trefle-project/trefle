#!/usr/bin/env bash
# 019-admin-access (T026, contracts/edge-access.md "Origin verification") —
# runs the Caddy image with the real `(access_jwt)` snippet of
# infra/deploy/Caddyfile against a local key set, and checks each case of the
# contract: no token, foreign key, wrong audience, wrong issuer, expired, a
# member, the service token, a CORS preflight, and a key added to the key set
# after Caddy started (Access rotates its signing key).
#
#   infra/caddy/test-access-jwt.sh [image]   (default: trefle-caddy)
#
# Needs docker, openssl, python3, curl. Starts and removes its own container.
set -euo pipefail

IMAGE="${1:-trefle-caddy}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CADDYFILE="$HERE/../deploy/Caddyfile"
WORK="$(mktemp -d)"
NAME="trefle-access-jwt-test-$$"
PORT=18480
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

TEAM="http://127.0.0.1:9000"
AUD="test-aud-0123456789"

# --- keys and key set
for k in A B C; do openssl genrsa -out "$WORK/$k.pem" 2048 2>/dev/null; done
jwks() { # jwks KID… → JSON key set (Access serves it at /cdn-cgi/access/certs)
  python3 - "$WORK" "$@" <<'EOF'
import base64, json, subprocess, sys
work, kids = sys.argv[1], sys.argv[2:]
def b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()
keys = []
for kid in kids:
    mod = subprocess.check_output(["openssl", "rsa", "-in", f"{work}/{kid}.pem", "-noout", "-modulus"],
                                  stderr=subprocess.DEVNULL).decode().strip().split("=", 1)[1]
    keys.append({"kty": "RSA", "alg": "RS256", "use": "sig", "kid": kid, "e": "AQAB", "n": b64(bytes.fromhex(mod))})
print(json.dumps({"keys": keys}))
EOF
}
token() { # token KID CLAIMS_JSON → RS256 JWT signed with that key
  python3 - "$WORK" "$1" "$2" <<'EOF'
import base64, json, subprocess, sys
work, kid, claims = sys.argv[1], sys.argv[2], sys.argv[3]
def b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()
head = b64(json.dumps({"alg": "RS256", "kid": kid, "typ": "JWT"}).encode())
body = b64(claims.encode())
sig = subprocess.check_output(["openssl", "dgst", "-sha256", "-sign", f"{work}/{kid}.pem"], input=f"{head}.{body}".encode())
print(f"{head}.{body}.{b64(sig)}")
EOF
}
now="$(date +%s)"
claims() { # claims ISS AUD EXP EXTRA_JSON
  printf '{"iss":"%s","aud":["%s"],"iat":%s,"nbf":%s,"exp":%s%s}' "$1" "$2" "$((now - 60))" "$((now - 60))" "$3" "${4:-}"
}

mkdir -p "$WORK/srv/cdn-cgi/access"
jwks A >"$WORK/srv/cdn-cgi/access/certs"

# --- Caddyfile: the production snippet, verbatim, in front of a stub
{
  echo '{'
  echo '	admin off'
  echo '}'
  awk '/^\(access_jwt\) \{$/,/^\}$/' "$CADDYFILE"
  cat <<'EOF'

:9000 {
	root * /srv
	file_server
}

:8080 {
	import access_jwt
	respond "ok" 200
}
EOF
} >"$WORK/Caddyfile"
grep -q 'jwtauth' "$WORK/Caddyfile" || { echo "test: no (access_jwt) snippet found in $CADDYFILE" >&2; exit 1; }

docker run -d --name "$NAME" -p "127.0.0.1:$PORT:8080" \
  -e ACCESS_TEAM_DOMAIN="$TEAM" -e ACCESS_AUD="$AUD" \
  -v "$WORK/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$WORK/srv:/srv:ro" \
  "$IMAGE" >/dev/null
for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.2; done

fail=0
check() { # check LABEL EXPECTED_CODE [curl args…]
  local label="$1" want="$2" got; shift 2
  got="$(curl -s -o /dev/null -w '%{http_code}' "$@" "http://127.0.0.1:$PORT/")"
  if [[ "$got" == "$want" ]]; then echo "ok   $label → $got"; else echo "FAIL $label → $got (want $want)"; fail=1; fi
}
hdr() { echo "Cf-Access-Jwt-Assertion: $1"; }

member="$(token A "$(claims "$TEAM" "$AUD" $((now + 600)) ',"email":"member@example.com"')")"
service="$(token A "$(claims "$TEAM" "$AUD" $((now + 600)) ',"common_name":"abc.access"')")"

check "no token" 401
check "token signed by a key not in the key set" 401 -H "$(hdr "$(token B "$(claims "$TEAM" "$AUD" $((now + 600)) ',"email":"x@example.com"')")")"
check "token for another application (aud)" 401 -H "$(hdr "$(token A "$(claims "$TEAM" other-aud $((now + 600)) ',"email":"x@example.com"')")")"
check "token from another team (iss)" 401 -H "$(hdr "$(token A "$(claims https://other.cloudflareaccess.com "$AUD" $((now + 600)) ',"email":"x@example.com"')")")"
check "expired token" 401 -H "$(hdr "$(token A "$(claims "$TEAM" "$AUD" $((now - 30)) ',"email":"x@example.com"')")")"
check "member token" 200 -H "$(hdr "$member")"
check "member token + Payload's own Authorization header" 200 -H "$(hdr "$member")" -H "Authorization: JWT not-an-access-token"
check "service token (common_name, no email)" 200 -H "$(hdr "$service")"
check "CORS preflight without a token" 200 -X OPTIONS
check "POST without a token" 401 -X POST

# Rotation: a new key appears in the key set after Caddy started. The first
# request with it triggers a refresh; the next ones are accepted.
jwks A C >"$WORK/srv/cdn-cgi/access/certs"
rotated="$(token C "$(claims "$TEAM" "$AUD" $((now + 600)) ',"email":"member@example.com"')")"
curl -s -o /dev/null -H "$(hdr "$rotated")" "http://127.0.0.1:$PORT/" || true
sleep 2
check "token signed by a key added after start (rotation)" 200 -H "$(hdr "$rotated")"

if [[ "$fail" -ne 0 ]]; then
  echo "--- caddy logs"; docker logs "$NAME" 2>&1 | tail -20
  exit 1
fi
echo "all origin checks passed"
