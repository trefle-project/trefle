# Data model: Statistical significance for page A/B tests

**Feature**: 018-ab-significance | **Research**: [research.md](research.md)

## New collection `ab-exposures` (R2)

Hidden in the admin; every access function returns `false` (written and read
only with `overrideAccess`).

| Field | Type | Rules |
|---|---|---|
| `visitorId` | text (`visitor_id`) | UUID from `tf-visitor`; required |
| `experimentKey` | text (`experiment_key`) | must match a `running` experiment's `growthbookExperimentKey` at intake; required |
| `variant` | relationship → `pages` (`variant_id`) | must be the test's control or one of its variants; required |
| `domain` | relationship → `domains` | from the edge message; required |
| `exposedAt` | date (`exposed_at`) | edge time of the first view; required |

Index: unique `(visitor_id, experiment_key)`; index on `experiment_key`.

## New collection `ab-conversions` (R2, R3)

Same access as above.

| Field | Type | Rules |
|---|---|---|
| `lead` | relationship → `leads` | unique; required |
| `visitorId` | text (`visitor_id`) | required |
| `experimentKey` | text (`experiment_key`) | the running test of the lead's page at submission |
| `variant` | relationship → `pages` (`variant_id`) | = the lead's page |
| `convertedAt` | date (`converted_at`) | = lead `submittedAt` |
| `confirmedAt` | date (`confirmed_at`) | set when the lead's opt-in is confirmed (006), else null |

Index on `experiment_key`.

## `experiments` — new fields

| Field | Type | Purpose |
|---|---|---|
| `growthbookId` | text, read-only | GrowthBook's experiment id once declared |
| `analysisStartedAt` | date, read-only | start of GrowthBook's phase (= `startedAt`, or the declaration time for tests started before 018) |
| `analysis` | json, read-only, hidden | last analysis (shape below) |
| `analysisRefreshedAt` | date, read-only | when `analysis` was computed |
| `analysisError` | text, read-only, hidden | last refresh failure, cleared on success |

`analysis` shape (aggregates only — FR-009):

```ts
{
  totalUsers: number;
  srmPValue: number;
  splitWarning: boolean;
  arms: Array<{ pageId: number; users: number; conversions: number; confirmed: number }>;
  challengers: Array<{
    pageId: number;
    chanceToBeatControl: number;   // 0..1
    ciLow: number; ciHigh: number; // relative change, e.g. -0.04 .. 0.31
    verdict: "not-enough-data" | "no-clear-difference" | "leaning-better" | "leaning-worse" | "better" | "worse" | "unreliable";
    reading?: "better" | "worse" | null; // before the 72-hour hold
    readingSince?: string | null;         // carried across refreshes
    confirmAt?: string;                   // with "leaning-*"
    missingVisitorsPerArm?: number;
    missingLeads?: number;
  }>;
}
```

State: `analysis` is written by the hourly task and the refresh endpoint while
`status = running`; one last write at conclusion, then frozen.

## Postgres role (migration, R4)

`growthbook_reader` — `LOGIN` with `GROWTHBOOK_PG_PASSWORD` (else `NOLOGIN`),
`SELECT` on `ab_exposures` and `ab_conversions` only. Down: revoke, drop.

## Cookies

None for A/B since 2026-10-20 (research R15): the version is drawn per view,
and the view number travels only in the signed form token (`pageId.issuedAt.<view
number>`). `visitorId` in `ab-exposures` / `ab-conversions` holds that view
number (11 base64url characters); the column name stays (no migration).

## Retention and erasure (R11)

- `endedAt + 30 days < now` → delete that test's `ab-exposures` and
  `ab-conversions` (daily sweep).
- Lead erased (`dsrErase`) or consent withdrawn (`consentWithdraw`) → delete
  its `ab-conversions` row.
