# Contract: CMS endpoints, script and admin UI

**Feature**: 019-admin-access | research R3–R7

## Authentication rule (all CMS endpoints)

A **human** caller counts as authenticated only when its session passed the
second factor (`req.user._strategy === "totp"`), or when the plugin is
disabled (`TOTP_DISABLED=1`, never in production). API-key callers
(`_strategy === "api-key"`, `isService`) are unchanged. Implemented once in
`apps/cms/src/access/index.ts`; every endpoint in `src/endpoints/` authorises
through those helpers or `totpAccess`.

| Caller | Before 019 | After 019 |
|---|---|---|
| Password only, enrolled member | authenticated | refused (`403`) everywhere except the plugin's verify view/endpoint |
| Password only, not enrolled | authenticated | refused except own `me` and the setup endpoint |
| Password + code | authenticated | authenticated |
| Renderer API key | authenticated | unchanged |

## `GET /api/edge-access`

- Auth: header `X-Edge-Sync-Secret` = `EDGE_SYNC_SECRET` (constant-time
  compare). Missing/wrong → `401`. Secret unset on the server → `503`.
- `200` `{"emails": ["a@x.fr", "b@y.fr"]}` — active human members,
  lower-cased, sorted, de-duplicated.

## `POST /api/edge-access/synced`

- Auth: same secret.
- Body `{"emails": [...]}` (the list actually applied). Invalid body → `400`.
- Effect: global `edge-access` = `{emails, syncedAt: now}`; activity log
  `edge-synced` with the count. `204`.

## `POST /api/users/:id/reset-totp`

- Auth: Administrator with a verified second factor. Editor → `403`.
  `:id` = caller → `400` (« Utilisez votre page de compte. »).
  Unknown id → `404`.
- Effect: `totpSecret` cleared, code lockout cleared, activity log
  `totp-reset` (actor = caller). `204`.

## Script `apps/cms/scripts/reset-totp.ts <email>`

- Run on the VPS:
  `$COMPOSE exec cms npm --workspace @trefle/cms run totp:reset -- <email>` (with `COMPOSE` as defined in `infra/deploy/README.md`)
- Local API; same effect as the endpoint; no actor, `meta.via: "ssh"`. Exit `0` with
  « Double authentification réinitialisée pour <email>. », `1` if no such
  member.

## Admin UI (French copy)

- **Setup page hint** (above the plugin's QR code):
  « Enregistrez aussi la clé affichée sous le QR code dans le gestionnaire de
  mots de passe de l'équipe : c'est votre secours si vous perdez votre
  téléphone. Si vous l'utilisez un jour, refaites ensuite votre double
  authentification : l'ancienne clé ne fonctionnera plus. »
- **Reset button** on a member's edit view (Administrators, not on own
  account): « Réinitialiser la double authentification » → confirmation
  « <nom> devra reconfigurer son application d'authentification à sa
  prochaine connexion. Continuer ? » → success toast / error message.
- **Drift banner** (Administrators, every admin page, when drift ≠ ∅):
  « L'accès Cloudflare n'est pas à jour : à ajouter <adresses>, à retirer
  <adresses>. Lancez `infra/cloudflare/apply.sh --sync-members`. » When the
  global was never written: « L'accès Cloudflare n'a jamais été synchronisé. »
