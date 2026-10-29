#!/usr/bin/env bash
# Deploy a release tag to this VPS, or roll back to one — runbook Step 2.
# Run as `trefle`, from anywhere; it works in ~/trefle (or $TREFLE_DIR).
#
#   release.sh --snapshot-done <new-tag>              update (§2.1)
#   release.sh --snapshot-done --rollback <prev-tag>  rollback (§2.2)
#
# Always run the copy from the TARGET tag, not the checked-out one:
#   git -C ~/trefle fetch -q --tags origin
#   git -C ~/trefle show <tag>:infra/deploy/release.sh > /tmp/trefle-release.sh
#   bash /tmp/trefle-release.sh --snapshot-done <tag>
#
# It prints key NAMES only, never an infra/.env value, and never runs
# `docker compose config` without --quiet. Safe to re-run after a stop.
set -euo pipefail

# `git checkout` may rewrite this very file mid-run, and bash reads a script
# lazily — run from a private copy so the checkout can't change what executes.
if [ -z "${TREFLE_RELEASE_COPY:-}" ]; then
  copy="$(mktemp /tmp/trefle-release.XXXXXX)"
  cp "$0" "$copy"
  TREFLE_RELEASE_COPY=1 exec bash "$copy" "$@"
fi

die() { printf '\n  x %s\n' "$*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

snapshot=0 rollback=0 target=""
for a in "$@"; do
  case "$a" in
    --snapshot-done) snapshot=1 ;;
    --rollback) rollback=1 ;;
    -*) die "unknown option $a" ;;
    *) [ -z "$target" ] || die "one tag only"; target="$a" ;;
  esac
done
[ -n "$target" ] || die "usage: release.sh --snapshot-done [--rollback] <tag>"
[ "$snapshot" -eq 1 ] || die "take a manual Hostinger snapshot first (hPanel → VPS → Snapshots), then pass --snapshot-done"
[ "$(id -un)" = trefle ] || die "run as trefle (ssh root@<vps-ip>, then sudo -u trefle)"

cd "${TREFLE_DIR:-$HOME/trefle}"
ENV=infra/.env
COMPOSE=(docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml)
getval() { sed -n "s/^[[:space:]]*$1=//p" "$ENV" | head -1; }
keys() { grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' | sort -u; }

# ---------------------------------------------------------------- 1. where are we
step "Fetch and locate"
git fetch -q --tags origin
git rev-parse -q --verify "refs/tags/$target" >/dev/null || die "tag $target not found on origin"
current="$(getval RELEASE)"
[ -n "$current" ] || die "RELEASE is empty in $ENV — can't tell which release is deployed"
# RELEASE is bumped before the build: if a run stopped after that, the
# release it started from is remembered here so a re-run can finish the job.
from_file="$HOME/.trefle-release-from-$target"
if [ "$current" = "$target" ]; then
  [ -f "$from_file" ] || die "$target is already deployed (RELEASE=$target)"
  current="$(cat "$from_file")"
  echo "resuming an interrupted run from $current"
fi
git rev-parse -q --verify "refs/tags/$current" >/dev/null || die "RELEASE=$current is not a tag"
echo "deployed: $current   target: $target   HEAD: $(git describe --tags --always)"
echo "$current" >"$from_file"

# Only the deployed release carries the `down` of its own migrations, so a
# rollback must revert the schema BEFORE leaving it (§2.2).
head_tag="$(git describe --tags --exact-match HEAD 2>/dev/null || true)"
# A marker makes a re-run after a later stop skip the down — running it twice
# would revert one release too many.
down_marker="$HOME/.trefle-migrate-down-done-$current"
if [ "$rollback" -eq 1 ]; then
  git merge-base --is-ancestor "$target" "$current" || die "$target is not older than $current — use a plain update"
  if [ -f "$down_marker" ]; then
    echo "migrate:down already done for $current (marker $down_marker) — resuming"
  else
    [ "$head_tag" = "$current" ] || die "HEAD is not on $current — the migration downs live there; check out $current first"
    step "Revert the last migration batch (payload migrate:down)"
    out="$("${COMPOSE[@]}" run --rm cms npm --workspace @trefle/cms run payload -- migrate:down </dev/null 2>&1)" \
      || { printf '%s\n' "$out" | tail -20; die "migrate:down failed — stop here, nothing else changed"; }
    printf '%s\n' "$out" | grep -E "Migrat|Rolled|Done|No migrations" || true
    touch "$down_marker"
  fi
fi

# ---------------------------------------------------------------- 2. infra/.env
# git-crypt makes the file binary to git: never stash/pop it (the 008 deploy
# silently lost 8 keys that way). Back it up, and when the committed template
# changes, restore the backup and list the new keys for a human to fill.
step "infra/.env"
backup="$HOME/env.backup-before-$target"
[ -f "$backup" ] || { cp "$ENV" "$backup"; chmod 600 "$backup"; }
echo "backup: $backup ($(keys <"$backup" | wc -l) keys)"

template_changed=0
git diff --quiet "$current" "$target" -- "$ENV" || template_changed=1
if [ "$head_tag" = "$target" ]; then
  # Re-run after a stop: the checkout is done and the operator may have hand-
  # edited infra/.env since — never overwrite it here.
  echo "HEAD already on $target — resuming, $ENV left as is"
elif [ "$template_changed" -eq 0 ]; then
  echo "committed template unchanged between $current and $target"
  git checkout -q "$target"
else
  echo "committed template CHANGED between $current and $target"
  git checkout -q -- "$ENV"
  git checkout -q "$target"
  if [ "$rollback" -eq 1 ] && [ -f "$HOME/env.backup-before-$current" ]; then
    cp "$HOME/env.backup-before-$current" "$ENV"   # the pre-bad-release file
  else
    cp "$backup" "$ENV"
  fi
fi
if [ "$template_changed" -eq 1 ]; then
  missing="$(comm -23 <(git show --textconv "$target:$ENV" | keys) <(keys <"$ENV"))"
  if [ -n "$missing" ]; then
    printf '\n%s is on %s but lacks keys the new template adds:\n%s\n' "$ENV" "$target" "$missing"
    die "add them with real prod values (not the template's dev ones), then re-run the same command"
  fi
fi
sed -i "s/^RELEASE=.*/RELEASE=$target/" "$ENV"

lost="$(comm -23 <(keys <"$backup") <(keys <"$ENV"))"
if [ -n "$lost" ] && [ "$rollback" -eq 0 ]; then
  printf 'keys present before but missing now:\n%s\n' "$lost"
  die "restore them from $backup before going further"
fi
./infra/deploy/preflight.sh "$ENV"

# ---------------------------------------------------------------- 3. build, migrate, up
# </dev/null on every compose call: `compose run` reads stdin, and when this
# is fed through `ssh … bash -s <<EOF` it would swallow the rest of the input.
step "Build cms + web + caddy"
# caddy: the custom image of 017 (infra/caddy) — cached, rebuilt only when its Dockerfile changes.
"${COMPOSE[@]}" build cms web caddy </dev/null 2>&1 | tail -3

if [ "$rollback" -eq 0 ]; then
  step "Migrate"
  out="$("${COMPOSE[@]}" run --rm cms npm --workspace @trefle/cms run payload:migrate </dev/null 2>&1)" \
    || { printf '%s\n' "$out" | tail -20; die "migration failed — old containers are still serving; see §2.2"; }
  printf '%s\n' "$out" | grep -E "Migrat|Done" || true
fi

step "Recreate"
if git diff --quiet "$current" "$target" -- infra/docker-compose.yml infra/docker-compose.prod.yml; then
  "${COMPOSE[@]}" up -d --wait cms web </dev/null
else
  echo "compose files changed — recreating every service that needs it"
  "${COMPOSE[@]}" up -d </dev/null
  "${COMPOSE[@]}" up -d --wait cms web </dev/null
fi
# A new Caddy build (infra/caddy) with unchanged compose files: recreate it.
if ! git diff --quiet "$current" "$target" -- infra/caddy; then
  echo "Caddy image changed — recreating Caddy"
  "${COMPOSE[@]}" up -d caddy </dev/null
fi
# A Caddyfile-only change is invisible to compose. A `caddy reload` is not
# enough either: the Caddyfile is a single-file bind mount, and `git checkout`
# replaces the file, so the container keeps seeing the old one (017.1 deploy).
# Recreate Caddy instead (a second or two without the proxy).
if ! git diff --quiet "$current" "$target" -- infra/deploy/Caddyfile infra/deploy/cloudflare-ips.caddy; then
  echo "Caddyfile changed — recreating Caddy"
  "${COMPOSE[@]}" up -d --force-recreate --no-deps caddy </dev/null
fi

# ---------------------------------------------------------------- 4. verify
step "Verify"
bad=0
# The configuration Caddy runs is the one in this release (see "Recreate").
for f in Caddyfile cloudflare-ips.caddy; do
  if docker exec trefle-caddy-1 cat "/etc/caddy/$f" | cmp -s - "infra/deploy/$f"; then
    echo "caddy: $f is this release's"
  else
    echo "caddy: $f IS NOT THIS RELEASE'S — recreate Caddy"; bad=1
  fi
done
for s in cms web; do
  if [ "$(docker inspect "trefle-$s-1" -f '{{.Image}}')" = "$(docker image inspect "trefle-$s" -f '{{.Id}}')" ]; then
    echo "$s: on the new image, $(docker inspect "trefle-$s-1" -f '{{.State.Health.Status}}')"
  else
    echo "$s: STILL ON THE OLD IMAGE"; bad=1
  fi
done
# Hit Caddy locally with the real hostnames (TLS + routing, no DNS hairpin).
# 017: once Caddy requires Cloudflare's origin-pull certificate, present ours
# (git-crypt, written by infra/cloudflare/aop-cert.sh); harmless before.
aop=()
if [ -f infra/cloudflare/secret-aop-client.pem ] && [ -f infra/cloudflare/secret-aop-client.key ]; then
  aop=(--cert infra/cloudflare/secret-aop-client.pem --key infra/cloudflare/secret-aop-client.key)
fi
# check HOST PATH [EXPECTED] — EXPECTED is a code, or unset for any 2xx/3xx.
check() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' ${aop[@]+"${aop[@]}"} --resolve "$1:443:127.0.0.1" "https://$1$2" || true)"
  echo "https://$1$2 -> $code${3:+ (want $3)}"
  if [ -n "${3:-}" ]; then [ "$code" = "$3" ] || bad=1; return; fi
  case "$code" in 2* | 3*) ;; *) bad=1 ;; esac
}
cms_host="$(getval CMS_HOSTNAME)"; web_host="$(getval WEB_HOSTNAMES | awk '{print $1}')"
# 019: this request has no Cloudflare Access token, so the admin host must
# refuse it (401) — the origin check is live. It answers through Caddy only.
[ -n "$cms_host" ] && check "$cms_host" /admin 401
[ -n "$web_host" ] && check "$web_host" /
"${COMPOSE[@]}" run --rm cms npm --workspace @trefle/cms run payload -- migrate:status </dev/null 2>&1 \
  | grep -E "│" | tail -3 || true

[ "$bad" -eq 0 ] || die "verification failed — see above; rollback is §2.2"

# ------------------------------------------------- 5. edge cache (020)
# Cached pages refer to this release's predecessor (its script chunks, its
# rendering): drop them all once the new containers answer (contracts/purge.md).
# Update and rollback alike. Skipped while the purge token is not set.
step "Purge cached pages at the edge"
purge_token="$(getval CLOUDFLARE_PURGE_TOKEN)"; zone_id="$(getval CLOUDFLARE_ZONE_ID)"
if [ -z "$purge_token" ] || [ -z "$zone_id" ]; then
  echo "skipped: CLOUDFLARE_PURGE_TOKEN / CLOUDFLARE_ZONE_ID not set in $ENV"
else
  purge_out="$(curl -sS --max-time 30 -X POST "https://api.cloudflare.com/client/v4/zones/$zone_id/purge_cache" \
    -H "Authorization: Bearer $purge_token" -H "Content-Type: application/json" --data '{"tags":["html"]}' || true)"
  if [ "$(printf '%s' "$purge_out" | grep -o '"success": *true')" != "" ]; then
    echo "purged: html"
  else
    die "edge purge failed — the release is live but cached pages are not refreshed. Re-run from ~/trefle:
  curl -sS -X POST \"https://api.cloudflare.com/client/v4/zones/\$(grep -E '^CLOUDFLARE_ZONE_ID=' $ENV | cut -d= -f2-)/purge_cache\" -H \"Authorization: Bearer \$(grep -E '^CLOUDFLARE_PURGE_TOKEN=' $ENV | cut -d= -f2-)\" -H 'Content-Type: application/json' --data '{\"tags\":[\"html\"]}'"
  fi
fi

# ------------------------------------------------- 6. build cache
# Every release builds cms/web/caddy here and nothing ever dropped the layers:
# 66 GB of build cache had piled up by 2026-10-16 (disk at 83 %). Keep a week
# of it (the next builds stay fast) and drop the rest. Never fails the release.
step "Prune the Docker build cache (older than 7 days)"
docker builder prune -f --filter until=168h </dev/null 2>&1 | tail -1 || true
df -h / | tail -1

rm -f "$from_file" "$down_marker"
printf '\nOK: %s is live (was %s). Backup kept at %s — delete it once satisfied.\n' "$target" "$current" "$backup"
