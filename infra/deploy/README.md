# Deploy & operate — Debian VPS

> 🇫🇷 Version française : [README.fr.md](./README.fr.md)

Target: a single Debian 12 host running the four Trefle containers behind Caddy.
This is the constitution delivery-roadmap **Phase 4** path; it does not add an
orchestrator.

This runbook has four parts:

1. **[First deployment](#step-1--first-deployment)** — one-time: bring the stack up from a bare host.
2. **[Updates & rollback](#step-2--updates--rollback)** — move the running stack to a new release, or back.
3. **[Permanent configuration](#step-3--permanent-configuration)** — the settings, checklist, and cron you set once and then audit.
4. **[Adding a web domain](#step-4--adding-a-web-domain)** — onboard a new public site host onto the running stack.

Throughout, `$COMPOSE` in a command block assumes you have exported this in the
current shell (from `~/trefle`):

```bash
export COMPOSE="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml"
```

---

## Step 1 — First deployment

One-time, from a freshly provisioned host to a running stack.

### 1.1 One-time host setup

```bash
# as root
apt update && apt install -y git git-crypt ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
adduser --disabled-password --gecos "" trefle && usermod -aG docker trefle

# firewall: only 22, 80, 443
apt install -y ufw && ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
```

### 1.2 One-time — the git-crypt key (repo owner, on your laptop)

`infra/.env` is committed **git-crypt-encrypted**. The repo is already
initialised (`git-crypt init` was run once); you only need to export the
symmetric key and store it safely — it is the single secret that unlocks
everything and it MUST NOT enter the repo, CI logs, or chat.

```bash
git-crypt export-key ~/trefle-git-crypt.key   # from a clone that can already read infra/.env
chmod 600 ~/trefle-git-crypt.key
# put ~/trefle-git-crypt.key in your password manager; it is your only copy
```

To add a teammate instead of sharing the raw key, use
`git-crypt add-gpg-user <their-gpg-key-id>` and commit.

### 1.3 Get the code + secrets

```bash
sudo -iu trefle
git clone <repo-url> ~/trefle && cd ~/trefle
git checkout main

# unlock infra/.env — copy the key over SSH, never commit it
scp you@laptop:~/trefle-git-crypt.key /tmp/k
git-crypt unlock /tmp/k && shred -u /tmp/k
git-crypt status infra/.env          # -> "encrypted: infra/.env"
test -r infra/.env && head -1 infra/.env   # readable plaintext now
```

Then replace every value in `infra/.env` with a real production value
(the committed ones are local-dev throwaways) and:

```bash
./infra/deploy/preflight.sh          # must print "preflight: OK"
```

`infra/.env` must define, in addition to the local keys (see `infra/.env.example`):

| Key | Value |
|---|---|
| `RELEASE` | the deployed git sha or tag (feeds error capture) |
| `CMS_PUBLIC_URL` | `https://admin.trefle.example` |
| `CMS_HOSTNAME` | `admin.trefle.example` |
| `WEB_HOSTNAMES` | space-separated, e.g. `trefle.example www.trefle.example promo.acme.com` |
| `IMG_HOSTNAME` | `img.trefle.example` — Caddy routes it to ImgProxy |
| `S3_ENDPOINT` / `S3_*` | the production Garage cluster endpoint + credentials + bucket (its own bucket, separate from the dev stand-in). All four are **required** — the cms refuses to boot in production if any is unset. Two options: **(a)** an external Garage/S3 cluster you already run, or **(b)** the single-node `garage` service in `docker-compose.prod.yml`, self-hosted on this VPS (`S3_ENDPOINT=http://garage:3900`, `S3_REGION=garage`) — in that case also set `ASSET_HOSTNAME` and `GARAGE_RPC_SECRET` below. |
| `ASSET_ORIGIN` | public, browser-reachable base URL of the bucket, e.g. `https://assets.trefle.example`. Media URLs + admin thumbnails resolve here; published-page `<img>` are rewritten through ImgProxy. The bucket must allow public `GET` on object paths (ImgProxy itself reads `s3://` privately). |
| `ASSET_HOSTNAME` | **option (b) only** — public host of the self-hosted bucket (e.g. `assets.trefle.example`), routed by Caddy to `garage:3902`. Unused with an external cluster (a). |
| `GARAGE_RPC_SECRET` | **option (b) only** — `openssl rand -hex 32`, the Garage node's internal RPC secret. |
| `IMGPROXY_URL` | `https://img.trefle.example` (= `https://<IMG_HOSTNAME>`) |
| `IMGPROXY_KEY` / `IMGPROXY_SALT` | shared with the `imgproxy` service; the renderer signs URLs with them |
| `SMTP_*` | the real mail provider |
| `ERROR_SINK_URL` | optional; error envelopes POST here |
| `ANTHROPIC_API_KEY` | optional — the Claude API key for "Importer depuis une page web" (Step 6). **Empty keeps the import hidden.** |
| `IMPORT_AI_MODEL` / `IMPORT_AI_EFFORT` | optional — conversion model and effort, defaults `claude-opus-5` / `medium` |

**Object-storage keys — create them now, before the first boot (option b).**
The Garage access key, its secret and `GARAGE_RPC_SECRET` used in local dev
are pinned in `infra/docker-compose.override.yml`, so they are public.
Production must never reuse them: generate its own on the VPS.

```bash
echo "S3_ACCESS_KEY_ID=GK$(openssl rand -hex 12)"
echo "S3_SECRET_ACCESS_KEY=$(openssl rand -hex 32)"
echo "GARAGE_RPC_SECRET=$(openssl rand -hex 32)"
```

Paste the three lines into `infra/.env` (replacing the existing ones) and keep
a copy in your password manager. The access key id is `GK` followed by 24
hexadecimal characters, Garage's own format; an installation set up with
another id keeps it (Garage accepted it at its first boot). On its first boot the
`garage` service creates the bucket and this key from these values
(`--default-bucket`); it does not do it again, so changing them later means
importing the new key into Garage by hand (`garage key import`) and granting
it the bucket. `preflight.sh` refuses the dev values and a key id under 20 characters.
With an external cluster (option a), use the key that cluster gives you.

DNS: point every host in `CMS_HOSTNAME` + `WEB_HOSTNAMES` + `IMG_HOSTNAME` at the VPS `A`/`AAAA`.

### 1.4 First boot

```bash
cd ~/trefle
$COMPOSE build
$COMPOSE up -d db
$COMPOSE run --rm cms npm --workspace @trefle/cms run payload:migrate
# seed needs SEED_ADMIN_PASSWORD (>= 16 chars) set in infra/.env — it refuses
# to create a default admin password in production.
$COMPOSE run --rm cms npm --workspace @trefle/cms run seed:dev   # creates the first admin + service key
$COMPOSE up -d
$COMPOSE ps   # all healthy
```

`CMS_SERVICE_API_KEY` in `infra/.env` is used verbatim — `seed:dev` pins the
`service` user's key to it (and re-syncs on drift), so there is nothing to
copy back. Sign in, change the admin password, invite the real team (US5).

**Admin language** *(023)*. The admin speaks French or English. A new
installation starts in English; to run it in French, sign in and set
*Settings → Default → Default admin language* to *Français*. It applies to
the login page and to every member who has not chosen a language, within
30 seconds. Each member can choose their own under *Account → Admin
language*; it takes effect at once and follows them on every device. An
installation upgraded to 023 keeps a French admin: the migration sets the
installation language to French when members already exist, and leaves
every member's own choice empty (the installation's language).

---

## Step 2 — Updates & rollback

Releases are annotated git tags on `main` named after the feature
(`010-date-range-filters`, `011-form-field-types`, …). `RELEASE` in
`infra/.env` is set to that tag. Every deploy so far has hit at least one of
the traps below; the procedure is written around them.

### 2.0 The short way — `release.sh`

[`release.sh`](./release.sh) runs 2.1 and 2.2 end to end with every check
below built in. Take the Hostinger snapshot first, then, as `trefle` on the VPS:

```bash
git -C ~/trefle fetch -q --tags origin
git -C ~/trefle show <tag>:infra/deploy/release.sh > /tmp/trefle-release.sh
bash /tmp/trefle-release.sh --snapshot-done <tag>
```

For a rollback, pass `--rollback <previous-tag>` instead. Always take the
script from the **target** tag (`git show`), never the checked-out copy, so
the release you deploy also brings its own deploy logic.

- **What it refuses:** to run without `--snapshot-done`, as a user other than
  `trefle`, on an unknown tag, or to redeploy the tag already live.
- **When the `.env` template gains keys:** it stops and lists the missing key
  names. Add them to `infra/.env` with real values and re-run the same
  command.
- **Re-running after any stop is safe:** it resumes without overwriting
  `infra/.env` and without running a second `migrate:down`.
- **Docker build cache:** at the end of a release it drops the cache older
  than 7 days (`docker builder prune --filter until=168h`) and prints the disk
  space. Without it every build piles up: 66 GB by October 2026.

From Claude, pipe it over SSH the same way (the script already puts
`</dev/null` on every compose call):
`ssh root@<vps-ip> 'sudo -u trefle bash -s' <<'EOF' … EOF`.

The sections below are what the script does, step by step. Use them to
understand a stop, or to deploy by hand.

### 2.1 Update to a new release

**0. Before you start (on your laptop).**

- Take a manual **Hostinger snapshot** of the VPS (hPanel → VPS → Snapshots).
  Only one is kept, so it is always "just before the last deploy". It is the
  whole-machine safety net on top of the migration `down`.
- Connect as `root@<vps-ip>`, then switch to `trefle`. The `~/.ssh/config`
  alias for the domain names a user that does not exist on the VPS and fails
  with `Permission denied (publickey)`.
- Note the currently deployed tag (`git describe --tags` on the VPS). You need
  it for the `.env` comparison and for a rollback.

**1. Set `infra/.env` aside and check whether its template changes.**

`infra/.env` is git-crypt encrypted and, on the VPS, carries real secrets as
an uncommitted local modification. Git sees it as a binary file and cannot
merge it.

```bash
cd ~/trefle
export COMPOSE="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml"
cp infra/.env ~/env.backup-before-<new-tag>
git fetch --tags origin
git diff --quiet <current-tag> <new-tag> -- infra/.env && echo "template unchanged" || echo "TEMPLATE CHANGED"
```

- **Template unchanged** (the usual case): `git checkout <new-tag>` keeps the
  local `.env` as-is. Go to step 2.
- **Template changed** (the release adds new keys): discard the local copy,
  check out, put the backup back, then add **by hand** only the new keys from
  the new template:

  ```bash
  git checkout -- infra/.env
  git checkout <new-tag>
  cp ~/env.backup-before-<new-tag> infra/.env
  diff <(git show --textconv <new-tag>:infra/.env | grep -oE '^[A-Z_]+=' | sort) <(grep -oE '^[A-Z_]+=' infra/.env | sort)
  ```

  Lines prefixed with `<` are keys to add (with real prod values, not the dev
  placeholders).

  Never use `git stash` / `git stash pop` on this file. Because git's binary
  merge falls back silently, the result looked clean in `git status` but had
  lost 8 prod keys (hostnames, `GARAGE_RPC_SECRET`, `RELEASE`, …) during the
  008 deploy. Always read the committed version with
  `git show --textconv <ref>:infra/.env`. Without `--textconv`, git-crypt does
  not decrypt and you get garbage or an empty result.

**2. Check out, bump `RELEASE`, preflight.**

```bash
git checkout <new-tag>
sed -i 's/^RELEASE=.*/RELEASE=<new-tag>/' infra/.env
diff <(grep -oE '^[A-Z_]+=' ~/env.backup-before-<new-tag> | sort) <(grep -oE '^[A-Z_]+=' infra/.env | sort) && echo "same keys"
./infra/deploy/preflight.sh
```

The key-list diff must be empty, unless you deliberately added keys in step 1.
Compare **names only**: never print `.env` values, `docker compose config`
without `--quiet`, or raw `seed:dev` logs (they echo `apiKey = …`), since
secrets have already leaked into a chat transcript twice this way.

**3. Build, migrate, recreate.**

```bash
$COMPOSE build cms web
$COMPOSE run --rm cms npm --workspace @trefle/cms run payload:migrate </dev/null
$COMPOSE up -d --wait cms web </dev/null
```

- Build only `cms` and `web`: the other services use pinned upstream images.
- The old `cms`/`web` keep serving during build and migration. Migrations are
  additive by design, so the old code tolerates the new schema for those few
  seconds.
- **`</dev/null` is mandatory when the commands run from a script** (for
  example `ssh root@<vps-ip> 'sudo -u trefle bash -s' <<'EOF' … EOF`, which is
  how Claude deploys). `docker compose run` reads standard input, so it
  swallows every remaining line of the script: the migration runs, then
  nothing else does, with no error. This is what left prod on the old
  containers during the 010 and 011 deploys.
- If the release only changes `infra/deploy/Caddyfile`, `up -d` does **not**
  pick it up (compose sees no service change). A `caddy reload` does not
  either: the Caddyfile is a single-file bind mount, and the checkout replaced
  the file, so the container still sees the old one. Recreate Caddy (a second
  or two without the proxy):
  `$COMPOSE up -d --force-recreate --no-deps caddy </dev/null`.

**4. Verify, don't assume.**

```bash
$COMPOSE ps cms web
for s in cms web; do [ "$(docker inspect trefle-$s-1 -f '{{.Image}}')" = "$(docker image inspect trefle-$s -f '{{.Id}}')" ] && echo "$s on new image" || echo "$s STILL ON OLD IMAGE"; done
curl -s -o /dev/null -w '%{http_code}\n' https://<apex-domain>/
curl -s -o /dev/null -w '%{http_code}\n' https://<cms-hostname>/admin
```

- Both containers must be `healthy` **and** report "on new image". A recent
  `Up` time alone is not enough.
- The migration output must list each new migration (`Migrated: <name>`). If
  the release has a migration, also check its effect directly in the database
  (`docker exec trefle-db-1 psql -U <user> <db> -c '…'`).
- Once everything checks out, delete `~/env.backup-before-<new-tag>` or keep
  it until the next deploy. It holds prod secrets, so it must stay readable
  by `trefle` only.

### 2.2 Rollback

Migrations ship a tested `down` (constitution Principle III), but the `down`
code only exists **in the release that added the migration**. Roll back the
schema *before* leaving the bad tag:

```bash
cd ~/trefle
$COMPOSE run --rm cms npm --workspace @trefle/cms run payload -- migrate:down </dev/null
git checkout <previous-tag>
sed -i 's/^RELEASE=.*/RELEASE=<previous-tag>/' infra/.env
$COMPOSE build cms web
$COMPOSE up -d --wait cms web </dev/null
```

- `migrate:down` reverts the **last batch**, meaning every migration applied
  by the last `payload:migrate` run. That is exactly one release's worth when
  each deploy runs it once. Check its output before going further.
- Checking out the previous tag and running `payload:migrate` there does
  **not** roll anything back. That tag doesn't know the newer migrations and
  leaves them in place.
- If the `.env` template changed in the bad release, restore
  `~/env.backup-before-<bad-tag>`.
- Then go through the checks in 2.1 step 4.
- If the data itself is damaged, restore the Hostinger snapshot or the
  Postgres dump (§3.4).

---

## Step 3 — Permanent configuration

The stack from Steps 1–2 keeps running on its own. This section is the
configuration you set once and then **audit periodically** — nothing here is a
per-deploy action.

### 3.1 Enforced by code / config (verify, don't re-implement)

- `infra/deploy/preflight.sh` passes (secret lengths, no default
  `POSTGRES_PASSWORD`, all `S3_*` set) — run it before the first `up`.
- The cms refuses to boot in production with any `S3_*` unset; `seed:dev`
  refuses a default admin password without `SEED_ADMIN_PASSWORD`.
- `db` / `cms` / `web` / `imgproxy` / `browser` publish **no** host ports (`ports: !reset []`
  in `docker-compose.prod.yml`) — only Caddy is exposed.
- Page import (Step 6): the cms refuses to boot in production
  (`DEPLOY_ENV=production`) with the test-only `IMPORT_AI_MODE=fixture` or
  `IMPORT_ALLOW_PRIVATE_HOSTS` set, and `preflight.sh` flags both. Every
  address an import loads — the page, its sub-resources, its images and each
  redirect — must resolve to a public IP (no `cms`, `db`, host or cloud
  metadata address).
- Caddy adds `Strict-Transport-Security` + `nosniff` and strips `Server`
  (`(sechdr)` snippet); HTTP → HTTPS is automatic.
- The renderer sends a nonce CSP (`script-src` has no `'unsafe-inline'`),
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, no
  `X-Powered-By`; the admin sends the static set + `frame-ancestors 'self'`.
- ImgProxy answers only signed URLs (`IMGPROXY_KEY`/`SALT`) and `s3://` sources;
  `IMGPROXY_MAX_SRC_RESOLUTION=50`.
- `infra/.env` is committed git-crypt-encrypted; the key travels out of band
  only (never the repo or CI logs).
- `CMS_HOSTNAME` and the GrowthBook hosts are behind Cloudflare Access (an
  e-mail code, members only), and Caddy refuses any request to them without a
  valid Access token (`401`, 019-admin-access). The admin login adds an
  authenticator-app code (step 8). The former address list
  (`ADMIN_ALLOWED_IPS`) is gone.
- `npm audit --omit=dev`: 0 critical / 0 high at the 002-security-hardening
  cut (16 moderate/low residual — dev tooling + non-reachable parser DoS;
  re-audit at the next Payload/Next minor).

### 3.2 Manual host / ops checklist

- [ ] SSH key-only, root login disabled, `ufw` limited to 22/80/443.
- [ ] Unattended-upgrades enabled for the host OS.
- [ ] `RELEASE` is set so error envelopes are attributable.
- [ ] The retention worker runs (`JOBS_AUTORUN=true` on `cms`); confirm a
      `retention-deletion` entry appears after the first scheduled run (03:00).
- [ ] Change the seeded admin password on first login; invite the team.
- [ ] Smoke-test a first-time Editor sign-in (the `us5-roles` e2e is
      quarantined for a cross-host test-harness reason — single-host prod is
      fine, but confirm it once by hand).
- [ ] The off-box backup cron (3.3) is installed and its last run succeeded.

### 3.3 Backups off-box

`pg-backup` writes `~/trefle` volume `backups` nightly (03:30, 14-day retention).
If object storage is the self-hosted `garage` service (option b, §1.3),
`garage-backup` does the same at 03:45 (tars `garage-data` + `garage-meta`,
same retention). Ship it all off-box with a host cron — `find -mmin` picks up
both, not just the single newest file:

```bash
# cron on the host, 04:00
docker run --rm -v trefle_backups:/b -v /home/trefle/offsite:/o alpine \
  sh -c "find /b -maxdepth 1 -type f -mmin -180 -exec cp {} /o/ \;" \
  && rclone copy /home/trefle/offsite <remote>:trefle-backups
```

If object storage is an **external** Garage/S3 cluster (option a, §1.3)
instead of the `garage` service on this VPS, back it up on its own side — it
writes nothing to the local `backups` volume. The SMTP provider is external
either way, nothing to back up here.

### 3.4 Restore

```bash
$COMPOSE up -d db
gunzip -c backups/trefle-YYYYMMDD-HHMMSS.sql.gz | \
  $COMPOSE exec -T db psql -U trefle -d trefle
```

### 3.5 Tracked follow-ups (not done in 002-security-hardening)

X-Forwarded-For rate-limit bypass (take Caddy's `client_ip`); escape
reflected `referer` / editor `label` in `apps/web/.../api/leads/route.ts`;
sanitise editor GrapesJS HTML (or tighten the renderer CSP further); admin
MFA / IP allow-list in front of `CMS_HOSTNAME`; move the in-memory rate
limiter to a shared store; expire preview tokens; revisit the 10 MB body
caps; tighten the admin CSP `script-src`.

---

## Step 4 — Adding a web domain

> Once the platform is behind Cloudflare (Step 7), a client domain is added
> on `www.` with [7.4](#74-a-client-domain-replaces-41-once-behind-cloudflare)
> instead of 4.1; 4.2–4.5 are unchanged.

Onboarding a new public site host (e.g. `promo.acme.com`) touches four places.
No code change, no Caddyfile edit and no release deploy is needed. Do them in
this order:

| # | Where | What | Required |
|---|---|---|---|
| [4.1](#41-dns--point-the-host-at-the-vps) | the domain's DNS (registrar) | `A` + `AAAA` → the VPS | yes |
| [4.2](#42-vps--add-the-host-to-web_hostnames--recreate-caddy) | VPS, as `trefle` | `WEB_HOSTNAMES` + recreate Caddy (TLS certificate) | yes |
| [4.3](#43-admin--register-the-domain) | admin | **Domains** record + pages | yes |
| [4.4](#44-verify) | browser / `curl` | TLS, page, lead form | yes |
| [4.5](#45-brevo--the-domains-own-email-sender-optional) | Brevo + DNS + admin | send opt-in emails as `@promo.acme.com` | optional |

**Not needed for a new domain** — these hosts exist once for the whole
platform and serve every site, so they get **no** DNS record under the new
domain:

- `experiments.` / `experiments-api.` (GrowthBook) — A/B-test bucketing runs
  server-side in the renderer's middleware, which reads the test from the cms
  over the internal Docker network. The browser never calls GrowthBook. A/B
  tests work on any registered domain.
- `img.` / `assets.` — every page's images are rewritten to the platform-wide
  `IMGPROXY_URL` / `ASSET_ORIGIN`. The renderer's CSP allows `img-src https:`,
  so a page on `promo.acme.com` loading from `img.<platform domain>` works
  as is.
- `admin.` — the one admin serves every domain.

### 4.1 DNS — point the host at the VPS

At the registrar that holds the new domain's DNS zone (often **not**
Hostinger), create:

| Type | Name | Value |
|---|---|---|
| `A` | `@` (apex) or the subdomain | the VPS IPv4 |
| `AAAA` | same | the VPS IPv6 |

For apex **and** `www`, create both pairs. Each host is also its own entry in
4.2 and its own record in 4.3. The values are the same ones `CMS_HOSTNAME`
already resolves to — copy them from there rather than retyping:

```bash
dig +short A admin.<platform domain>
dig +short AAAA admin.<platform domain>
```

Before moving on, check both records resolve through a public resolver. Caddy's
ACME HTTP-01 challenge fails if they don't, and Let's Encrypt rate-limits
repeated failures:

```bash
dig +short A promo.acme.com @1.1.1.1
dig +short AAAA promo.acme.com @1.1.1.1
```

Remove any registrar-default `A`/`AAAA`/`CNAME` on the same name (parking
page, "coming soon"), or half the requests go elsewhere.

### 4.2 VPS — add the host to `WEB_HOSTNAMES` + recreate Caddy

The repo and `infra/.env` live under the **`trefle`** user
(`/home/trefle/trefle`). As `root`, `~/trefle` is `/root/trefle`, which does
not exist, so `infra/.env` looks empty. Always switch user first.
`sudo -iu trefle` opens a fresh login shell, so `export COMPOSE` must come
**after** it, or `$COMPOSE up` expands to plain `up` (`command not found`):

```bash
ssh root@<VPS IP>
sudo -iu trefle
cd ~/trefle
export COMPOSE="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml"
```

Add the new host(s) to `WEB_HOSTNAMES`, a single space-separated line:

```bash
nano infra/.env
```

```
WEB_HOSTNAMES=<existing hosts> promo.acme.com www.promo.acme.com
```

In nano, `Ctrl+O` then `Enter` saves, and `Ctrl+X` quits. Check the line, then
recreate Caddy and watch it obtain the certificates:

```bash
grep '^WEB_HOSTNAMES=' infra/.env
./infra/deploy/preflight.sh
$COMPOSE up -d caddy
docker exec trefle-caddy-1 printenv WEB_HOSTNAMES
$COMPOSE logs -f caddy
```

- `preflight` must still print `preflight: OK`.
- `printenv` must show the new host(s). Caddy reads `WEB_HOSTNAMES` only when
  the container is **recreated**. A `caddy reload` or a restart without
  `up -d` keeps the old list.
- In the logs, wait for `certificate obtained successfully` for **each** new
  host, then `Ctrl+C` (this stops the log view, not Caddy).

`{$WEB_HOSTNAMES}` in `deploy/Caddyfile` routes every listed host to
`web:3001`, so no Caddyfile edit is needed.

This change lives only in the VPS's uncommitted `infra/.env` (the committed
file is the dev template). `release.sh` backs it up and restores it on every
deploy, so it survives updates. **Exception:** `release.sh --rollback`
restores the file as it was *before the release being rolled back*, so a
domain added after that deploy disappears. Re-check `WEB_HOSTNAMES` after
any rollback.

### 4.3 Admin — register the domain

The renderer resolves the request `Host` against the **Domains** collection
(`apps/web/src/lib/domains.ts`). Until an *active* record exists, it returns
not-found for every path on that host, even though Caddy already serves it
with a valid certificate.

In `https://<CMS_HOSTNAME>` → **Content → Domains → New**, one record per
host (apex and `www` are two records):

| Field | Value |
|---|---|
| `hostname` | bare host, lowercase, no scheme or path — e.g. `promo.acme.com` (validated) |
| `isActive` | checked — unchecked ⇒ the renderer returns not-found for this host |
| `label` | optional admin-facing name |
| `defaultLanguage` | optional (005) — pre-fills the language of a new page created under this domain; no effect on existing pages |
| `senderName` / `senderEmail` | **leave empty for now** — set them only in 4.5 step 7, once Brevo shows the domain as authenticated |
| `branding` | optional favicon / default OG image / theme tokens |
| `notFoundPagePath` | recommended — the `path` of a published page **of this same domain**, served on every path that has no page (including the root, if no page has path `/`) instead of a 404. The fallback is looked up on this Domain record only: pointing `www` at a page that belongs to the apex (or the reverse) still gives a 404 |
| `gtmContainerId` | optional (007) — this domain's Google Tag Manager container, e.g. `GTM-ABC1234`. Empty ⇒ no GTM snippet |
| `consentBannerEnabled` | checked by default (007) — cookie-consent banner on this domain |

Then create or assign pages to the domain. Saves trigger a targeted
revalidation (`domain-changed`), so the host is live within seconds.

018: describe the page tests in the domain's privacy policy and link
`/audience-measurement` — see 5.1.

### 4.4 Verify

```bash
curl -sSI https://promo.acme.com/ | head -n 20
```

Expect a `200` (or the `notFoundPagePath` page), a valid certificate and the
`strict-transport-security` header. Then, in a browser:

- open a page assigned to the domain and check that images load (from
  `img.<platform domain>`);
- submit its lead form and check that the lead appears in the admin;
- if the page has a confirmation page (003), check that the redirect stays on
  `promo.acme.com`.

### 4.5 Brevo — the domain's own email sender (optional)

**What it changes:** only the **double opt-in confirmation email**
(006-double-optin-email), sent to a visitor after they submit a lead form on
this domain's pages. With `senderEmail` set on the Domain record, it goes out
as e.g. `Acme Promo <no-reply@promo.acme.com>`. Without it, it goes out from
the platform default (`SMTP_FROM`). The confirmation link inside always points
to the page's own domain either way. Admin invites and new-lead notifications
always use the platform sender, whatever the domain.

**What it doesn't change:** nothing on the VPS. It's the same Brevo account,
SMTP key and `SMTP_*` block. The `From` is chosen per send from the Domain
record.

Skip this section if the platform sender is fine for this domain. Otherwise,
**authenticate the domain in Brevo before** setting `senderEmail`. Mail from
an unauthenticated domain gets spam-filtered or rejected.

1. **Add the domain in Brevo.** Go to Senders, Domains & Dedicated IPs →
   **Domains** → **Add a domain**. Enter the bare sending domain
   (`promo.acme.com`, not `no-reply@promo.acme.com`). Choose to add the
   records yourself (manual DNS), unless Brevo offers to connect to this
   exact registrar.

2. **Copy Brevo's records into the domain's DNS zone** (same registrar as
   4.1). Use the exact host/value pairs Brevo shows for *this* domain — never
   reuse another domain's. Brevo currently shows:

   | Type | Name (relative) | Purpose | Needed |
   |---|---|---|---|
   | `TXT` | `@` | `brevo-code:…` — domain ownership | yes |
   | `CNAME` | `brevo1._domainkey` | DKIM key 1 | yes |
   | `CNAME` | `brevo2._domainkey` | DKIM key 2 | yes |
   | `CNAME` | `mail` | branded tracking domain | recommended |
   | `CNAME` | `r.mail` | branded click-tracking links | recommended |
   | `CNAME` | `img.mail` | branded open-tracking pixel / images | recommended |

   Names can differ slightly — follow Brevo's screen, not this table. The
   three `*.mail` CNAMEs make tracked links and the open pixel use
   `…mail.promo.acme.com` instead of a Brevo domain. That matches the sender
   domain, which helps deliverability. They point to Brevo, **never** to the
   VPS: don't add them to `WEB_HOSTNAMES` or Domains.

   Registrar pitfalls:
   - **Relative names.** Most registrar UIs append the zone automatically.
     Type `r.mail`, not `r.mail.promo.acme.com`, or you get
     `r.mail.promo.acme.com.promo.acme.com`.
   - **An existing `mail` record.** Many registrars create a default `mail`
     `A`/`CNAME` for their webmail. A `CNAME` can't coexist with another
     record of the same name. Delete the default one, unless you really use
     the registrar's mailbox on this domain.
   - **Existing TXT on `@`.** The `brevo-code` TXT is added *alongside* any
     existing TXT (e.g. SPF, Google verification). Don't replace them.
   - **SPF.** Nothing to add for Brevo. If the domain already has an SPF
     record for another sender, leave it as is.

3. **DMARC.** Brevo expects one. Check first whether the domain already
   has a `_dmarc` TXT (some registrars create one). If not, start with a
   monitoring-only policy:

   | Type | Name | Value |
   |---|---|---|
   | `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:<an address you read>` |

   Tighten to `p=quarantine` later, once reports show nothing legitimate
   failing.

4. **Check propagation** from your machine, with the names Brevo gave:

   ```bash
   dig +short TXT promo.acme.com @1.1.1.1
   dig +short CNAME brevo1._domainkey.promo.acme.com @1.1.1.1
   dig +short CNAME brevo2._domainkey.promo.acme.com @1.1.1.1
   dig +short CNAME r.mail.promo.acme.com @1.1.1.1
   dig +short TXT _dmarc.promo.acme.com @1.1.1.1
   ```

5. **Authenticate in Brevo.** Back on the domain in Brevo, click
   **Authenticate this email domain** / **Verify**. It can take minutes to a
   few hours. Wait until every record shows green and the domain shows
   **Authenticated**.

6. **Sender address.** Authenticating the domain covers every
   `@promo.acme.com` address. If Brevo's Senders tab still lists no sender
   for it, add `no-reply@promo.acme.com` under **Senders** (no mailbox is
   needed for a `no-reply` address on an authenticated domain).

7. **Admin.** On the Domain record (4.3), set:

   | Field | Value |
   |---|---|
   | `senderName` | display name, e.g. `Acme Promo` |
   | `senderEmail` | an address on the authenticated domain, e.g. `no-reply@promo.acme.com` |

   Apex and `www` are two Domain records. Set the sender on **both**, or pages
   on the one left empty keep sending from the platform default.

8. **Verify end to end.** On a published page of this domain with an opt-in
   confirmation email attached (006, US2), submit the lead form with a real
   address you can read (ideally Gmail + another provider). Check that:
   - the `From` is `Acme Promo <no-reply@promo.acme.com>`;
   - it lands in the inbox, not spam — this proves authentication worked,
     not just that Brevo accepted the send;
   - in the message headers ("Show original" in Gmail), `SPF`, `DKIM` and
     `DMARC` all show `PASS`, with DKIM `d=promo.acme.com`;
   - the confirmation link opens `https://promo.acme.com/…` and confirms the
     lead;
   - Brevo → Transactional → Logs shows the email as delivered.

### 4.6 Remove a domain

- **Admin:** uncheck `isActive` (reversible) or delete the Domains record.
- **VPS:** drop the host from `WEB_HOSTNAMES` in `infra/.env`, then
  `$COMPOSE up -d caddy`.
- **DNS:** remove or repoint the `A`/`AAAA`.
- **Brevo:** if the domain went through 4.5, first clear `senderName` /
  `senderEmail` on any Domain record still using it. Removing the domain in
  Brevo and its DNS records is optional — leaving them is harmless.

### 4.7 Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Browser certificate error; `curl` gives `tlsv1 alert internal error` (alert 80) | Caddy has no certificate for this host: it isn't in the running container's `WEB_HOSTNAMES` | 4.2. Compare `grep '^WEB_HOSTNAMES=' infra/.env` with `docker exec trefle-caddy-1 printenv WEB_HOSTNAMES`, then `$COMPOSE up -d caddy` |
| Caddy logs show ACME errors (`challenge failed`, `NXDOMAIN`, `unauthorized`) | DNS doesn't point (yet) at the VPS, or a parking record answers too | 4.1. Fix DNS, wait for `dig @1.1.1.1`, then `$COMPOSE up -d caddy` again |
| Valid certificate, but a 404 on every path | no **active** Domains record for this exact host (`www` ≠ apex), or no published page at that path | 4.3 — check `hostname`, `isActive`, the page's domain and status |
| Pages work, but the domain root (`/`) is a 404 | the home page has path `/index` (or anything but `/`), or the page belongs to the other host (apex vs `www`), and no `notFoundPagePath` | give the home page the path `/` on this host, or set `notFoundPagePath` to a page of **this** Domain record (4.3). Allow a few seconds after saving before re-testing |
| `infra/.env` looks empty | you're `root`, in `/root` | `sudo -iu trefle`, `cd ~/trefle` |
| `-bash: up: command not found` | `$COMPOSE` not exported in this shell | the `export COMPOSE=…` line from 4.2 |
| SSH asks to confirm the host key fingerprint | first connection from this machine/account | compare with the fingerprint already in a trusted machine's `known_hosts` (`ssh-keygen -F <VPS IP> -l`); answer `no` if they differ |
| Opt-in email in spam / missing | domain not **Authenticated** in Brevo, `senderEmail` on another domain, or DMARC failing | 4.5 steps 2–5. Check the headers and Brevo's Transactional logs |
| Opt-in email still from the platform sender | `senderEmail` empty on this exact Domain record (e.g. set on apex, not `www`) | 4.5 step 7 |

### Notes / gotchas

- **Let's Encrypt rate limits** — 50 certificates per registered domain per
  week, 5 duplicate certificates per week. Batch domain adds into one Caddy
  recreate, and fix DNS *before* recreating rather than retrying in a loop.
- **`www` vs apex** — separate entries in `WEB_HOSTNAMES` **and** separate
  Domain records. There is no automatic redirect or canonicalisation between
  them (003-post-launch-improvements).
- **`CMS_ALLOWED_ORIGINS`** — only needed if something on the new host calls
  the admin API cross-origin. Normal pages and lead forms post to the
  renderer, which proxies to the cms server-side.
- A domain is **routing/presentation only**, not a tenant boundary — one
  shared workspace, one set of users.
- **Brevo authentication is per sending domain, not per address** —
  authenticating `promo.acme.com` once covers every `@promo.acme.com`
  address.
- **`senderEmail` needn't be on the site's own domain** — `hostname` (what
  visitors browse) and the Brevo-authenticated domain (what mail is sent
  from) are independent. A site on `promo.acme.com` can send from
  `no-reply@acme.com` if `acme.com` is the authenticated one.
- Leaving `senderName`/`senderEmail` empty is always a safe, fully supported
  state.

## Step 5 — Enabling A/B testing (GrowthBook)

`008-ab-testing`'s two new services (`growthbook`, `growthbook-mongo`) come
up as part of the normal `$COMPOSE up -d` from Step 1/2 — no separate
deploy step for the containers themselves. What's left is one-time,
manual setup inside GrowthBook's own admin UI (not expressible as
env/compose config):

1. Set `GROWTHBOOK_HOSTNAME`, `GROWTHBOOK_API_HOSTNAME`,
   `GROWTHBOOK_APP_ORIGIN`, `GROWTHBOOK_API_HOST_PUBLIC`,
   `GROWTHBOOK_MONGO_PASSWORD`, `GROWTHBOOK_JWT_SECRET`, and
   `GROWTHBOOK_ENCRYPTION_KEY` in `infra/.env` (see `.env.example`'s
   GrowthBook section) and point their two DNS hostnames at this VPS.
2. Visit `https://<GROWTHBOOK_HOSTNAME>` and create the first GrowthBook
   admin account (its own login, independent of the Payload admin).
3. The data source is **not** added in the UI any more: since 018 it is
   code (`infra/growthbook/config.yml`, read-only role `growthbook_reader`)
   — see 5.1.
4. The API key is created in 5.1 step 2 (the CMS now uses it).

**Follow-up, not done here**: offsite backup of `growthbook-mongo-data` is
explicitly deferred to a dedicated backup session covering the whole VPS
(`docs/ab-testing-exploration.md` §6) — same status as §3.3's offsite
cron for the existing `pg-backup`/`garage-backup` volumes. Only the
in-container Mongo data volume exists so far; it is not yet shipped
off-box.

### 5.1 Statistical significance (018-ab-significance)

The CMS asks GrowthBook for the analysis of every running test (hourly, and
« Rafraîchir » on the test screen) and shows a plain verdict. GrowthBook
reads only two tables (`ab_exposures`, `ab_conversions`) as the read-only
role `growthbook_reader`; the data source is `infra/growthbook/config.yml`.
Views are measured only once the edge Worker has `EXPOSURES=on`. Since
2026-10-20 the tests are **cookieless** (research R15): the version is drawn
for every view, nothing is stored on or read from the visitor's device, and
each view is numbered inside its signed form token — so the cookie banner
plays no part and landing pages are testable from the first view
(`docs/mesure-ab-cnil.fr.md`).

Go-live, in this order (no identifier may be set before steps 3–4 exist):

1. **Before `release.sh`**: add a strong `GROWTHBOOK_PG_PASSWORD` to the VPS
   `infra/.env` (`openssl rand -hex 32`, never printed). The production
   compose file requires it; the release's migration creates
   `growthbook_reader` with it, and GrowthBook connects with it.
2. After the release: in GrowthBook (Settings → API Keys) create a **secret
   key** with the admin role, put it in `GROWTHBOOK_API_KEY` in the VPS
   `infra/.env`, recreate `cms`. Empty key = analysis off (screens show the
   counts only).
3. Legal: validate the text of `/audience-measurement` and add the measurement to
   the processing register (draft in `docs/mesure-ab-cnil.fr.md` § 5, legal
   basis: consent).
4. The privacy policy of each domain (Step 9) already describes the page
   tests and links to `/audience-measurement`: just make sure every domain's legal
   pages are complete. No cookie-banner change is needed.
5. Deploy the Worker (`apps/edge`), then set `EXPOSURES=on` in
   `apps/edge/wrangler.jsonc` and deploy again.

**Cut the measurement** (seconds, nothing else changes): `EXPOSURES=off` in
`wrangler.jsonc` and deploy the Worker. No identifier is set any more, no
exposure is recorded; the stored analyses stay. The versions keep being
drawn per view either way.

**Local check**: `npm --workspace @trefle/cms run ab:seed` creates three
demo tests (clear winner, identical, 70/30 split; `-- --clean` removes
them); with a local GrowthBook key in the cms environment, « Rafraîchir »
shows their verdicts.

## Step 6 — Page import from a URL (012-url-page-import)

"Importer depuis une page web" (page creation wizard) renders a public page
in the `browser` container, converts it into editor blocks with the Claude
API and stores its images in the Media library.

**Services.** `browser` (`mcr.microsoft.com/playwright:v1.63.0-noble`,
`playwright run-server` on port 3100) comes up with the normal `$COMPOSE up
-d`. It publishes no port, sits on its own `browser` network shared with
`cms` only, and is capped at `mem_limit: 1g`. Its first start downloads
Playwright 1.63.0 from npm (a few seconds). Memory: the browser can use at
most 1 GB of the KVM 2's 8 GB, and each import renders one page at a time;
after enabling imports, check `docker stats --no-stream` during an import
to confirm the host keeps headroom.

**Turning it on.**

1. Put the Claude API key in `infra/.env` as `ANTHROPIC_API_KEY`
   (optionally `IMPORT_AI_MODEL` / `IMPORT_AI_EFFORT`), then
   `$COMPOSE up -d cms`.
2. In the admin, **Settings → « Plafond mensuel des imports (€) »**
   (default 20) is the workspace's monthly cap, and « Budget d'import par
   défaut par utilisateur (€) » the per-user default; each user record can
   override it (« Budget IA mensuel (€) »). The
   « Imports de pages » list shows the month's spending per user.

**Turning it off.** Either set the monthly cap to `0` in Settings (instant,
no redeploy) or empty `ANTHROPIC_API_KEY` and `$COMPOSE up -d cms`. Both
hide the option in the wizard; imports already running finish.

**Sites behind an anti-bot service** (Cloudflare, Akamai…) refuse the
import; the editor sees « Le site a bloqué la visite automatique ». The
import does not try to get past them. When the page is the client's own,
the client can allow it in that service: requests carry the product token
`TrefleImport/1.0` in their `User-Agent` and come from the VPS's public IP.
Otherwise the wizard offers the other way in: the editor saves the page from
their own browser (« Page web, un seul fichier », or the SingleFile
extension) and drops the file (013-saved-page-import; also offered when a
page needs a login). Nothing to configure: the file is kept in the cms
container's temporary directory only while its import runs, 25 MB at most.

**Never in production:** `IMPORT_AI_MODE` and `IMPORT_ALLOW_PRIVATE_HOSTS`
are test-only (canned conversion, private test host). Leave them unset —
the cms refuses to boot with either, and `preflight.sh` reports them.

**Releases.** The committed `infra/.env` has no import key, so `release.sh`
never asks for one: add `ANTHROPIC_API_KEY` directly in the VPS copy (step 1
above) when you want imports. If the key is ever added to the committed
file, `release.sh` stops the next release until the VPS copy has it too.

---

## Step 7 — Cloudflare in front (017-edge-protection)

Every host is served through Cloudflare: attacks are absorbed at the edge,
images and fonts come from Cloudflare's cache, and the VPS only answers
Cloudflare acting for our zone. Page HTML is **not** cached at the edge (lot
1). Configuration is code in `infra/cloudflare/` — its README lists every
file, token and routine operation; this section is the operator's runbook.

Values: `infra/cloudflare/secret.env` (git-crypt, on your laptop — the
Cloudflare scripts run from there) and, on the VPS, `CLOUDFLARE_DNS_TOKEN` and
`ACME_DELEGATE_HOSTNAME` in `infra/.env` (Caddy). Validation scenarios:
`specs/017-edge-protection/quickstart.md` (V1–V12).

### 7.1 Switch (once, in this order)

Each step is undone by the one before it; do not skip ahead.

1. **Code live** — the release with unique media keys and the alias map is
   deployed (quickstart V0, V10).
2. **Load baseline** — `infra/loadtest/README.md`, off-peak.
3. **Zone** — add `example.com` to Cloudflare (Free, full setup),
   copy every record from the checklist in `infra/cloudflare/README.md` with
   the proxy **off**, compare with `dig` against the Cloudflare nameservers,
   then change the nameservers at GoDaddy. Send a test opt-in email: delivered,
   DKIM pass (V1).
4. **Configuration** — on your laptop:

   ```bash
   infra/cloudflare/apply.sh --dry-run
   infra/cloudflare/apply.sh
   infra/cloudflare/aop-cert.sh
   ```

   Commit `infra/deploy/aop/ca.pem` and `infra/cloudflare/secret-aop-*`.
   In Cloudflare DNS, add `_acme-challenge.<host> CNAME acme-delegate.example.com`
   (proxy off) for every Trefle host, and a proxied `cf-check` A record to
   rehearse on.
5. **Origin certificates by DNS-01** — on the VPS, set `CLOUDFLARE_DNS_TOKEN`
   and `ACME_DELEGATE_HOSTNAME` in `infra/.env`; in the Caddyfile add
   `import origin_tls` to every site; release. Traffic is still direct. Check
   Caddy's log shows DNS-01 issuance and every host still answers (V3). Caddy
   will not start with a missing or malformed token.
6. **Proxy** — turn every Trefle record orange in Cloudflare; check each host
   through Cloudflare (V2 third bullet, V4, V5).
7. **Require Cloudflare's certificate** — only when **every** host is proxied:
   replace `import origin_tls` with `import origin_tls_aop` in every site,
   release. A direct request now fails the TLS handshake (V2).
   `release.sh`'s own checks present the client certificate from
   `infra/cloudflare/secret-aop-client.*`.
8. **Firewall** — on your laptop, with `HOSTINGER_API_TOKEN` in
   `infra/cloudflare/secret.env` (hPanel → Account → API):

   ```bash
   infra/cloudflare/origin-firewall.sh --dry-run
   infra/cloudflare/origin-firewall.sh
   ```

   Hostinger firewall `trefle-cloudflare-only`: 22/tcp open, 443/tcp only from
   Cloudflare's ranges (IPv4 **and** IPv6), everything else dropped — 80/tcp
   included. `ufw` is not enough: Docker-published ports bypass it. Check from
   outside: a direct `curl --resolve <host>:443:<VPS IP>` times out, SSH works.
   It takes about a minute after the script reports `synced` to apply.
9. **Regression** — full e2e suite against production (V8), V6, V7; load
   test again (V12).
10. **New VPS address** — last (Hostinger support, or a new VPS + restore);
    update the proxied records only, and make sure no DNS-only record points
    at the new address.

### 7.2 Rollback (< 15 minutes)

Before the address change (7.1 step 10):

1. Cloudflare → DNS: every Trefle record back to DNS-only (grey cloud).
2. VPS: Caddyfile sites back to `import origin_tls` (or no snippet), release
   (or `$COMPOSE up -d --force-recreate --no-deps caddy` — a reload would
   re-read the old file, see 2.1).
3. Hostinger firewall: open 80 and 443 to everyone.

After the address change, a grey cloud publishes the new address and undoes
the protection. Prefer rolling back only what broke (Caddyfile, firewall)
while staying proxied. If grey cloud was unavoidable, plan another address
change afterwards.

Client `www.` hosts (7.4) cannot be rolled back by us alone: the client must
replace their `CNAME` by `A`/`AAAA` records — slower, which is why client
domains move only once 7.1 has been stable.

### 7.3 Routine

- **Cloudflare ranges changed** (a few times a year): `infra/cloudflare/refresh-ips.sh`,
  commit `infra/deploy/cloudflare-ips.caddy`, release (Caddy reloads), and
  update the Hostinger firewall from the printed list.
- **Members of the admin**: after adding, deactivating or removing one,
  `infra/cloudflare/apply.sh --sync-members` (step 8.5).
- **AOP certificate**: `infra/cloudflare/aop-cert.sh --renew` before the
  expiry date it printed (2 years), commit, then delete the old certificate it
  lists in the Cloudflare dashboard.
- **Move to Pro** (~20 $/month) when one of these happens: an attack gets
  through the Free managed rules and degrades the sites; one rate-limiting
  rule is no longer enough (another endpoint needs one); the 5 custom WAF
  rules are used up.

### 7.4 A client domain (replaces 4.1 once behind Cloudflare)

Client sites are served on `www.` through Cloudflare for SaaS; the root
forwards to `www.` at the client's registrar.

```bash
infra/cloudflare/add-client-domain.sh www.client-domain.fr
```

The script prints the two records the client adds —
`www CNAME sites.example.com` and
`_acme-challenge.www CNAME acme-delegate.example.com` — and the
forwarding to set at their registrar. Acceptable forwarding: HTTPS on the
root, **301**, path **and** query kept. Check with:

```bash
curl -sI 'https://client-domain.fr/confirm?token=x&y=1' | grep -i '^location'
```

The answer must be `https://www.client-domain.fr/confirm?token=x&y=1`. If the
registrar cannot do that, move the client's whole zone into our Cloudflare
account instead (research R2).

**GoDaddy's domain forwarding does not keep the path** (checked 2026-10-10 on
`client-site.example`: `/` → 301 to `www.`, any other path → 404). It
is only acceptable when nothing links to the root (no emails, no ads); otherwise
use research R2.

**Validate before switching `www`.** The custom hostname is checked when it is
created, then less and less often: switching the client's `www` to the CNAME
before it is `active` leaves the site without a certificate (TLS handshake
failure) until the next check — 15 minutes on 2026-10-10. After the CNAME
change, run `add-client-domain.sh` again and, if still `pending`, press
**Refresh** on the custom hostname (SSL/TLS → Custom Hostnames of
`example.com`); keep the old A record values at hand to roll back.

Then, as in Step 4: add `www.client-domain.fr` to `WEB_HOSTNAMES` (instead of
the root), release, and in the admin set the **Domains** record's hostname to
`www.client-domain.fr`. Re-run the script until both statuses are `active`.

### 7.5 Taking an image down

The cached copies outlive the file, so removing an image from the sites is
two steps:

- **Unused image**: delete it in the admin (Médiathèque), then
  `infra/cloudflare/purge-media.sh <its filename>`.
- **Used image** (the admin refuses to delete it while a page uses it): open
  it, choose a corrected or neutral file, confirm « Remplacer partout », then
  `infra/cloudflare/purge-media.sh <old filename>`. The pages show the new
  file at once.

The script purges the file's URL on the asset host and the whole image host
(every image is re-processed once — a rare, deliberate action).

### 7.6 Switching page caching off (020-edge-html-cache)

Pages can be served from Cloudflare's cache by the edge Worker
(`apps/edge`, `infra/cloudflare/README.md`). If something looks wrong with
cached pages — stale content that a purge does not fix, a broken form, an
unexpected error — switch it off; every request then goes straight to the
server, which renders it as before. No deploy, effective within seconds:

```bash
infra/cloudflare/edge-off.sh
```

Switch back on (`live` = every site, `test` = the test host only):

```bash
infra/cloudflare/edge-on.sh live
```

Both print the routes in place afterwards. They need
`CLOUDFLARE_WORKERS_TOKEN` in `infra/cloudflare/secret.env` (operator
machine). Stale pages only: `infra/cloudflare/purge-pages.sh` first. If the
Worker itself fails, Cloudflare already falls back to the server for that
request.

## Step 8 — Admin second factor (019-admin-access)

Since 019 the admin asks, after the password, for a 6-digit code from an
authenticator app on the member's phone (Google Authenticator, 1Password,
Authy…). The API's endpoints also refuse a session that only passed the
password. The renderer's API key (`service`) is not affected.

### 8.1 What members see

- **First login after the release**: a "Setup Two-Factor Authentication" page
  with a QR code. The member scans it with their app and types the code shown.
  Nothing else in the admin works until they do.
- **Every login after that**: password, then code.
- **After 5 wrong codes**: the account is locked for 10 minutes (same settings
  as the password). An Administrator can lift it sooner with "Force Unlock" on
  the member's edit view.

Every enrolment, reset and lockout is in the activity log (`totp-enrolled`,
`totp-reset`, `totp-locked`).

### 8.2 The backup key (no recovery codes)

The plugin has no recovery codes. At enrolment, under the QR code, "Add code
manually" shows the **key**: each member saves it in the team's password
manager (the page says so). Many password managers can produce the codes
themselves too.

Two rules, because that key stays valid until it is replaced:

1. **After any use of the vault copy**, the member redoes their second factor
   (reset as in 8.3, then enrol again) and replaces the vault copy. The old
   key then stops working.
2. **A departing member is deactivated** ("isActive" unchecked): their login is
   refused at once, whatever key they hold.

### 8.3 Lost phone — reset a member

The member first uses their vault key (8.2), then gets reset so they enrol
again. If no Administrator can sign in, the same reset runs on the VPS, as
`trefle` in `~/trefle`:

```bash
$COMPOSE exec cms npm --workspace @trefle/cms run totp:reset -- <email>
```

It clears the member's key and lifts both lockouts (codes and password), and
logs it (`totp-reset`, via `ssh`). The member sets their app up again at next
login. It answers "Aucun membre avec l'adresse …" for an unknown address.

### 8.4 Rollback

If the second factor stops people working, switch it off without a
deployment: add both lines to `infra/.env` on the VPS, then recreate `cms`.

```bash
TOTP_DISABLED=1
ALLOW_TOTP_DISABLED=1
```

```bash
$COMPOSE up -d --force-recreate cms
```

`ALLOW_TOTP_DISABLED=1` says it is on purpose: without it the CMS refuses to
boot and `preflight.sh` refuses the release. Saved keys are kept: remove both
lines and recreate `cms` to turn the second factor back on, with no new
enrolment.

### 8.5 The e-mail code before the admin (Cloudflare Access, 019 step 2)

Before the admin's login page (and GrowthBook's), Cloudflare asks for an
e-mail address and sends a 6-digit code to it. Only the CMS's active members'
addresses get one. The session lasts 24 hours per browser. The password and
the app code come after that (8.1).

- **After adding, deactivating or removing a member**, from your machine:
  `infra/cloudflare/apply.sh --sync-members`. Until then a new member is
  stopped at the e-mail code step.
- **The server checks too** (019 step 3): Caddy refuses (`401`) any request
  to the admin or GrowthBook without the token signed by Cloudflare Access.
  Going around Cloudflare leads nowhere.
- **Rollback**: first the release, `--rollback 019.2-edge-access` (§2.0),
  which removes the server-side check. Only then, if needed,
  `ACCESS_ENABLED=0 infra/cloudflare/apply.sh --sync-members` deletes the
  Access application. The other way round leaves the admin unreachable.
- **If the Access application is re-created**, it gets a new AUD tag: put it
  in `ACCESS_AUD` in the VPS `infra/.env` and recreate Caddy.

Set-up and details: `infra/cloudflare/README.md`, "Cloudflare Access".

### 8.6 Members: joining, leaving, lost phone, emergency

**Add a member**
1. Admin → Workspace → Users → create the member (role, e-mail). They get the
   link to choose their password. The yellow banner at the top of the admin
   then says « à ajouter <address> ».
2. On your machine: `infra/cloudflare/apply.sh --sync-members`. The banner is
   gone at the next page load.
3. At first login the member gets the e-mail code, chooses their password,
   then sets up their authenticator app (8.1) and stores their backup key in
   the password manager (8.2).

**Remove a member**: uncheck **isActive** on their record (their login is
refused at once), then `apply.sh --sync-members` (no more e-mail code).

**Lost phone**: the member signs in with the backup key from the vault
(8.2). Then an Administrator opens their record and clicks **Réinitialiser
la double authentification**; the member sets their app up again at next
login and replaces the vault copy. The button is not shown on one's own
account.

**Emergency: no Administrator can sign in.** Three means, in this order, each
under 30 minutes:

1. **The vault backup key**: the Administrator signs in with it, then redoes
   their second factor (reset by another Administrator, or means 2) and
   replaces the vault copy. The old key then stops working.
2. **The SSH reset** (8.3):
   `$COMPOSE exec cms npm --workspace @trefle/cms run totp:reset -- <email>`.
   The Administrator sets their app up again at next login.
3. **The e-mail code doesn't arrive** (mailbox unreachable, Cloudflare e-mails
   blocked): in the Cloudflare dashboard, Zero Trust → Access controls →
   Policies → `trefle-members` → temporarily add another e-mail address of
   the Administrator, save, sign in with it. Then `apply.sh --sync-members`
   puts the policy back to exactly the member list, removing the added
   address. Do not delete the Access application to "open up": since step 3
   the server then refuses everything (8.5).

Every reset is in the activity log (`totp-reset`, by an Administrator or by
`ssh`).

## Step 9 — Legal pages (021-legal-pages)

Every domain serves `/privacy` (privacy policy) and
`/legal-notice` (legal notice), built from editable texts and two
identities, and every page ends with a footer line linking both. Lead forms
without a link of their own point to the domain's policy; each consent
records the policy version, whose text is archived (« Versions des pages
légales »).

1. **Settings → Opérateur de l'installation** (Administrators): the company
   that runs this installation (it is the domain owners' processor and the
   sites' host). **Sous-traitants**: its suppliers that process visitors'
   data — mark the one hosting the server « Hébergeur des sites » with its
   address and phone.
2. **Settings → Textes juridiques**: default French texts are installed by
   the migration; **review them** (a template, not legal advice) and add a
   row per other language if needed. Placeholders are listed in the field
   help; a paragraph whose placeholder is empty is not shown.
3. **Each domain → Propriétaire du domaine**: the owner (controller and
   publisher). The domains list shows « Pages légales : Complètes /
   À compléter ». An owner with its own pages elsewhere gives their
   addresses instead.
4. Outside the product: sign the processing agreement with each owner
   (`docs/legal/contrat-sous-traitance.fr.md`) and keep the registers
   (`docs/legal/registre-traitements.fr.md`).

New domain (Step 4): fill the owner identity before going live.

**Paths (since 023-admin-i18n).** The pages every domain serves have English
paths: `/privacy`, `/legal-notice`, `/audience-measurement`. The French paths
of before (`/confidentialite`, `/mentions-legales`, `/mesure-audience`) answer
with one permanent redirect (308, query kept), or go straight to the owner's
own page when the domain has one; none of the six can be an editor page's
path. The migration moves the links of the default legal texts only if nobody
edited them; an edited text keeps its old links, which redirect.

Release note (023 US7): **deploy the edge Worker in the same window** as the
origin (`npm run deploy --workspace @trefle/edge`): it passes the new paths to
the origin. Until it is deployed, the legal pages are cached at the edge
without their `?lang=`. Then check, on a domain:

```bash
curl -sI https://www.example.com/mentions-legales?lang=en | grep -iE '^(HTTP|location)'
curl -sI https://www.example.com/legal-notice?lang=en | grep -iE '^HTTP'
```

The first answers `308` with `location: /legal-notice?lang=en` (or the owner's
own page, with a `307`); the second `200`.
