# 017-edge-protection (research R3) — Caddy with the Cloudflare DNS provider,
# so origin certificates are issued by ACME DNS-01 (written at
# acme-delegate.<zone> through CNAME delegation) instead of HTTP-01: issuance
# keeps working behind Cloudflare, for client `www.` hosts too, with port 80
# closed. The official image has no DNS providers built in.
#
#
# 019-admin-access (research R2) — plus caddy-jwt, so the internal hosts
# (admin, GrowthBook) verify the Cloudflare Access token at the origin
# (`(access_jwt)` in infra/deploy/Caddyfile). Needs Caddy >= 2.10.1.
#
# Pinned: bump the versions together and rebuild (`release.sh` builds it).
ARG CADDY_VERSION=2.11.7

FROM caddy:${CADDY_VERSION}-builder AS builder
RUN xcaddy build \
	--with github.com/caddy-dns/cloudflare@v0.2.4 \
	--with github.com/ggicci/caddy-jwt@v1.4.0

FROM caddy:${CADDY_VERSION}
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
