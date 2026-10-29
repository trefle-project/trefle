# Contract: admin organisation, branding, avatars (US2, US4, US5)

## Menu (FR-011)

Order of the `collections` array and groups/labels:

| Group | Entry label (slug) |
|---|---|
| Reports | Pages Stats (`page-stats`), A/B experiments (`experiments`) |
| Contents | Domains (`domains`), Pages (`pages`), Media (`media`), Conf. emails (`opt-in-emails`), Legal Pages (`legal-versions`), Fonts (`fonts`) |
| Imports | Pages Import (`page-imports`), Penpot Import (`site-imports`) |
| Leads | Leads (`leads`), Consent records (`consent-records`), Data-subject requests (`data-subject-requests`) |
| Settings | Users (`users`), Activity log (`activity-log`), Languages (`languages`), Default (global `settings`) |

Hidden, unchanged: `edge-view-windows`, `ab-exposures`, `ab-conversions`,
`edge-access`, new `page-stats-hourly`, `admin-images`.

## Menu look and width (FR-014, FR-015)

- `.nav-group__toggle` 16 px bold; entries 14 px; both themes.
- Drag handle on the nav's right edge (visible on hover, `cursor:
  col-resize`, keyboard: focusable, ←/→ change by 16 px, Enter/double-click
  reset). Width clamped 200–480 px and ≤ 50 % of the viewport; default 275 px.
- Saved to preference `nav-width` on release of the drag; applied on load.

## Settings → Default (FR-012, FR-013)

Unnamed tabs, in order: « Général », « Entités légales », « Textes
légaux », « Consents default », fields as FR-012. Branding fields at the end
of « Général » under a « Apparence de l'admin » heading; `variantCount` /
`variantOneIn` shown according to `variantMode`. Refusal message for a
variant of another size: « La variante doit avoir la même taille que le
motif (L×H px). »

## Branding rendering (FR-018 → FR-023)

Empty Settings slots show Trefle's own look: files shipped in
`apps/cms/public/branding/`, defined in `lib/branding.ts` (`DEFAULT_IMAGES`).

| Piece | Where | Fallback |
|---|---|---|
| Logo | login page (`graphics.Logo`) | Trefle's bundled clover (`/branding/trefle-logo.svg`) |
| Icon | nav (`graphics.Icon`) | Trefle's bundled clover (`/branding/trefle-icon-50.png`) |
| Favicon | every admin page, via `GET /api/admin-branding/favicon` (302, public, `Cache-Control: max-age=300`) | Trefle's bundled clover (`/branding/trefle-logo.svg`) |
| Tab title | « {page} · {operator name} » | « · Trefle » |
| 2FA issuer | new enrolments | « Trefle » |
| Wallpaper | every admin page + login, fixed, under a veil (theme background, opacity set in Settings « Opacité du voile », default 60 %) | Trefle's bundled clovers (`/branding/trefle-pattern-15.png`, variant `trefle-variant-15.png` only with that pattern), « 1 sur 100 » |
| Footer | every admin page + login, bottom, small muted text: « Powered by Trefle v {version} - r {RELEASE} » | RELEASE « dev » locally |

Wallpaper draw: tile W×H from the pattern; grid = ⌈viewport / tile⌉; variant
cells = `perScreen`: K distinct random cells (K capped by the grid) |
`oneIn`: each cell with probability 1/N; redrawn on every route change and on
resize (debounced). A failed image load = no wallpaper (never a broken
image). 2FA setup screen notes that existing authenticator entries keep
their old name.

## Avatars (FR-024 → FR-026)

- `users.avatar` in the account form (self) and in any member's form
  (Administrator); « Supprimer » removes it.
- Shown 24 px on the account button, 24 px in a Users column, 20 px before
  the actor's name in Activity log (the admin's only « modifié par »).
- Fallback: initials (first letters of `name`, else of the e-mail's local
  part, max 2) on a disc coloured from the user ID (fixed palette of 8,
  contrast AA with white text).
- Refusals: not an image → « Choisissez une image (PNG, JPEG, WebP, GIF,
  SVG). »; > 1 MB → « L'image dépasse 1 Mo. »

## Search (FR-016)

`listSearchableFields` per collection as research R7 (validated by the
user 2026-10-23). Payload's search hint lists the fields.

## Time zone (FR-027 → FR-031)

- Settings → Default « Général »: « Fuseau horaire par défaut » (select, IANA
  names, default `Europe/Paris`), Administrators only.
- Account form (Users): « Fuseau horaire d'affichage » (select; first option
  « Par défaut de l'installation ({zone}) »), the member themselves or an
  Administrator.
- Effective zone: member's choice, else installation default; login page:
  installation default.
- Every date cell and read-only date field: `dd/MM/yyyy HH:mm` (existing
  `admin.dateFormat` pattern) in the effective zone; tooltip « Heure de
  {zone} (UTC±hh:mm) ».
- Editable date fields: Payload's picker + note « heure de votre ordinateur »
  (known exception).
- Period pickers: days 00:00 → 24:00 in the effective zone.
- Exports: ISO 8601 with offset in the exporting member's effective zone.

## Tests

- `lib/admin-time.ts`: formatting in several zones; `zoneDayBounds` on normal
  and DST-change days (Europe/Paris last Sunday of March/October); offsets.
- Config pass: every `date` field (and timestamps) of every collection/global
  has the Cell/Field components; none missed (test walks the config).

- Access: a non-Administrator cannot set another member's avatar, nor
  branding fields, nor the installation time zone, nor another member's
  display time zone; a member can set their own; `admin-images` update/delete only by uploader or
  Administrator; Settings still unreadable without sign-in.
- Hooks: variant/pattern size mismatch refused; avatar > 1 MB refused;
  `admin-images` sets `uploadedBy` on create (not overridable by the client);
  Settings `afterChange` re-applies the operator name to the tab-title suffix
  and 2FA issuer objects (constitution IV: every custom hook tested).
- Wallpaper placement function (pure): K cells exactly (capped), 1-in-N
  frequency within tolerance over many draws, deterministic with a seed.
- Favicon endpoint: redirect to upload / default.
- e2e: menu groups and order; tabs present and saving one tab keeps the
  others; width drag + persisted after re-login; search Users by name; login
  page shows logo/name, wallpaper, footer; avatar on account button; axe on
  the login page and one list view.
