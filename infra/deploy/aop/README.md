# Authenticated Origin Pulls — CA (017-edge-protection)

`ca.pem` is the public certificate of our own AOP CA, written by
`infra/cloudflare/aop-cert.sh`. Caddy trusts it in the `(origin_tls_aop)`
snippet (`/etc/caddy/aop/ca.pem`): only a client certificate it signed — the
one uploaded to our Cloudflare zone — may open a TLS connection to the origin.

The private keys never live here: they are in `infra/cloudflare/secret-aop-*`
(git-crypt encrypted).

`ca.pem` is not shipped in the public repository: run
`infra/cloudflare/aop-cert.sh` to create your own CA and client certificate.
