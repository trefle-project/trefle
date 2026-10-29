# Phase 1 Data Model: Page A/B testing

One new Payload collection, one new field on an existing collection, one
new non-Payload (client-side + cache) entity.

## `experiments` (new collection)

| Field | Type | Notes |
|---|---|---|
| `name` | text | Operator-facing label. |
| `controlPage` | relationship → `pages` | The page under test. Access `isAdminOrEditor` (FR-015). |
| `growthbookExperimentKey` | text | Join key into GrowthBook; set when the test starts. |
| `status` | select: `draft` \| `running` \| `concluded` | `draft` while variants are still being authored; `running` from when bucketing starts (FR-002); `concluded` after promotion or an unpromoted end (FR-010). This field is also the "flag" constitution Principle III requires — every commit up to the first `running` row ships to `main` and stays provably inert (`docs/ab-testing-exploration.md` §7). |
| `startedAt` / `endedAt` | date | Set on the corresponding status transition. |
| `winner` | relationship → `pages`, optional | Set only on a promoting conclusion (FR-010); absent when a test concluded without promoting anything. |

**Constraint (FR-004)**: at most one `experiments` document with
`status: running` per distinct `controlPage` — enforced in a
`beforeChange` hook on this collection (queries for an existing `running`
row for the same `controlPage`, rejects a second), not left to the admin
UI alone.

**Variants are discovered by query, not stored as an array here**: any
`pages` document with `experimentOf` equal to this document's
`controlPage` id is a variant of this test (see below). This is a
deliberate single-copy-of-the-relationship design
(`docs/ab-testing-exploration.md` §5.3) — no array field to keep in sync,
no risk of an `experiments` row and a `pages` row disagreeing about
membership. Three-or-more-way tests (FR-003) fall out of this for free:
any number of `pages` documents can share one `experimentOf` value.

## `pages` (extended)

| Field | Type | Notes |
|---|---|---|
| `experimentOf` | relationship → `pages`, optional, self | Set only on a challenger variant, pointing at its control page. When set: `domain`/`path` are admin-hidden (`admin.condition`) and `publishGuard` skips the domain/path/URL-uniqueness checks that apply to an ordinary page (FR-012 — a variant is never independently reachable by URL). |

No other field on `pages` changes. A variant is created by copying
`builder`/`form`/`seo` from the control (the "Create test variant" admin
action, `docs/ab-testing-exploration.md` §5.1) — ordinary field values, no
schema implication.

## Bucket assignment (cache + cookie — not a Payload entity)

| Concern | Shape | Notes |
|---|---|---|
| Active-tests lookup | `{ [domainId/path]: { experimentKey, variants: [{ pageId, weight }] } }`, cached | Read by `apps/web/src/middleware.ts`; refreshed by the `experiments-revalidate` webhook on a start/conclude transition (research.md §2), never a live Payload call per request. |
| Sticky bucket cookie | one first-party cookie per active experiment (e.g. `tf-ab-<controlPageId>`) | Strictly necessary (research.md §4, FR-017) — no consent gate. Value is the assigned variant's page id, read/written entirely in middleware, never via `cookies()` inside a rendered page (research.md §1). |

Deliberately not a Payload collection: like `007-gtm-tagging`'s consent
cookie, this has no admin-visible lifecycle, no query/filter/export need,
and exists purely to keep one visitor's experience consistent within a
running test (FR-005).

## Relationships summary

```text
experiments
 ├── controlPage ──────────► pages   (the page under test)
 └── winner ───────────────► pages   (set only once promoted)

pages
 └── experimentOf ─────────► pages   (self; set only on a challenger
                                       variant, points at its control)

(middleware, not Payload)
 activeTestsCache[domain/path] ──► variant pageIds
   refreshed by: experiments.afterChange → /api/experiments-revalidate
```

## State transitions (`experiments.status`)

```text
draft ──(operator starts the test, ≥1 variant exists)──► running
running ──(operator promotes a variant)──► concluded  (winner set)
running ──(operator ends without promoting)──► concluded  (winner absent)
```

No transition back to `running` from `concluded` — starting a new
comparison on the same control page creates a new `experiments` document
(FR-004's one-running-test-per-page constraint is about concurrency, not a
lifetime cap on how many tests a page can have over time).
