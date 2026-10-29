# Implementation Plan: Admin UX improvements (batch 1)

**Branch**: `022-ux-improvement` | **Date**: 2026-10-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/022-ux-improvement/spec.md`

## Summary

Five independent stories, all in the CMS app. **US1** replaces the Pages
Stats list with a custom view summing the existing daily counters per page
over the chosen period (SQL), with a per-page SVG chart by day or hour, and a
CSV export; a new hourly counter is written next to the daily one, kept 90
days and back-filled for 30 days from the edge ledger. **US2** reorders and
renames the menu through Payload's own `admin.group`/labels/array order,
styles group headings, adds a drag handle storing the menu width in Payload
preferences, splits Settings into unnamed tabs, and lists search fields per
collection. **US3** drops empty sections' headings in the legal builder.
**US4** adds branding uploads to Settings and renders them through Payload's
graphics slots, one admin provider (canvas wallpaper, veil, version footer)
and a favicon redirect. **US5** adds an avatar upload to members, shown via
Payload's avatar slot and two list cells. **US6** adds a display time zone —
an installation default in Settings and a per-member choice on the account:
one formatting helper, one provider exposing the member's effective zone, one
config pass giving every date field a zone-aware cell/field, zone days in
period pickers and Pages Stats, zone dates with offset in exports.

## Technical Context

**Language/Version**: TypeScript (strict), Node ≥ 24.

**Primary Dependencies**: Payload 3.88 (custom list view, providers,
graphics/avatar slots, `tabs`, `listSearchableFields`, preferences, upload
collection + `s3Storage`), Next 16.3.4, payload-totp 3.0.6, existing
`DateRangePicker` (react-day-picker). **No new dependency.**

**Storage**: PostgreSQL — new tables `page_stats_hourly`, `admin_images`;
new columns on `settings` and `users`; migrations with down paths (one per
story that changes storage), US1's with a 30-day back-fill. Images in Garage (existing bucket/plugin).

**Testing**: vitest (unit + db), Playwright e2e (admin), axe on the login
page and Pages Stats.

**Target Platform**: the existing VPS + Cloudflare; admin behind Access.

**Project Type**: web — monorepo; only `apps/cms` changes (+ `apps/web` not
touched: legal HTML comes from the CMS endpoint).

**Performance Goals**: Pages Stats renders in < 1 s for 90 days × all pages;
wallpaper drawn in < 50 ms on a 4K screen; no extra request per admin page
except the (cached) favicon redirect and the image files.

**Constraints**: Settings never readable without sign-in (FR-023); slugs and
URLs unchanged; daily counters unchanged; version number changed only by the
user.

**Scale/Scope**: a few hundred pages, a handful of members; hourly table ≈
pages × 24 × 90 rows at most.

## Constitution Check

*GATE: checked before research and after design.*

| Principle | Check | Status |
|---|---|---|
| I. Simplicity | Native Payload slots and config for menu, tabs, search, avatar, logo; one custom view, one provider, two small endpoints; SVG chart instead of a library. | Pass |
| II. Stack-native | Payload views/providers/preferences/uploads, existing `s3Storage`, existing upsert path for counters; no new dependency. | Pass |
| III. Small, reversible | Each story ships alone; one migration (expand only: new table/columns, back-fill) with down path; renames are labels only. | Pass |
| IV. Tests | Aggregation SQL, endpoints, counters, back-fill, retention, access rules, hooks, legal builder, wallpaper placement: tests listed in the contracts; e2e + axe for views. | Pass |
| V. Quality | Pages Stats loading/empty/error states; drag handle keyboard-accessible; veil keeps contrast; French copy for every message. | Pass |
| Architecture | No change to edge, renderer or multi-domain model. | Pass |
| US6 (time zone) | One pure helper on `Intl`, one provider, one config pass, one user field + one setting; stored dates stay UTC; known exceptions (editable pickers, Payload's document-header dates if not replaceable) written in the spec. | Pass |

Post-design re-check (after Phase 1): unchanged — Pass. One point to verify
during implementation, not a violation: runtime update of the tab-title
suffix and 2FA issuer (research R9) with a stated fallback.

## Project Structure

### Documentation (this feature)

```text
specs/022-ux-improvement/
├── backlog.md           # closed list UX-01 → UX-11 (decision history)
├── spec.md
├── plan.md              # this file
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── page-stats.md
│   ├── admin-ui.md
│   └── legal.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/cms/src/
├── payload.config.ts                  # collections order, providers, graphics, avatar, meta.icons, totp options ref, onInit sync
├── app/(payload)/
│   ├── layout.tsx                     # + import custom.css
│   └── custom.css                    # nav headings, footer, veil
├── collections/
│   ├── PageStats.ts                   # group Reports, label, custom list view
│   ├── PageStatsHourly.ts             # NEW hidden
│   ├── AdminImages.ts                 # NEW hidden upload
│   ├── Users.ts                       # avatar field, avatar cell, search fields
│   └── *.ts                           # groups, labels, listSearchableFields
├── globals/Settings.ts                # tabs, French labels, branding fields, size hook, group/label
├── components/
│   ├── PageStatsView.tsx              # NEW server view (US1)
│   ├── PageStatsChart.client.tsx      # NEW SVG chart (US1)
│   ├── NavResize.client.tsx           # NEW drag handle (US2)
│   ├── AdminChrome.tsx                # NEW provider: reads Settings/RELEASE (US4)
│   ├── AdminChrome.client.tsx         # NEW wallpaper canvas, veil, footer (US4)
│   ├── Logo.tsx                       # logo / operator name (US4)
│   ├── Icon.tsx                       # NEW menu icon (US4)
│   ├── Avatar.tsx                     # NEW account avatar + cells (US5)
│   ├── AdminTimezone.tsx              # NEW provider + context (US6)
│   └── AdminDate.client.tsx           # NEW zone-aware date Cell/Field (US6)
├── endpoints/
│   ├── pageStatsSeries.ts             # NEW (US1)
│   ├── pageStatsExport.ts             # NEW (US1)
│   └── adminFavicon.ts                # NEW (US4)
├── lib/
│   ├── page-stats.ts                  # hourBucket, incrementPageStat(at), totals/series SQL
│   ├── wallpaper.ts                   # NEW pure placement function (US4)
│   ├── admin-time.ts                  # NEW zone formatting / day bounds (US6)
│   ├── dateRangeBounds.ts             # zone bounds replace local bounds (US6)
│   ├── branding.ts                    # NEW read Settings + apply title/issuer (US4)
│   ├── retention.ts                   # + hourly sweep
│   └── legal/build.ts                 # + empty-heading pass (US3)
└── migrations/2026xxxx_022_ux_improvement.ts

apps/cms/tests/                        # vitest unit/db per contracts
e2e/ (existing Playwright setup)       # admin specs per contracts
```

**Structure Decision**: everything stays in `apps/cms`, following the
existing layout (collections/, globals/, components/, endpoints/, lib/,
migrations/, tests/).

## Delivery order

Stories are independent; suggested order by value and risk: US3 (smallest,
public fix) → US6 (zone helper also used by US1's day cutting) → US1 → US2 →
US4 → US5. If US1 ships before US6, it cuts days in Europe/Paris through the
same helper with a constant, replaced by the setting when US6 lands. Each can be its own PR/release tag
(`022.1-…`), the migration split per story if released separately.

## Complexity Tracking

No violation to justify.
