# Contract: `experiments` admin surface

## `experiments` collection (Payload admin, `apps/cms`)

| Action | Who | Effect |
|---|---|---|
| Create a challenger variant | Editor/Administrator (`isAdminOrEditor`) | "Create test variant" action on a published page's edit view — copies `builder`/`form`/`seo` onto a new `pages` document with `experimentOf` set to the source page's id. Repeatable: a second invocation adds a third variant, and so on (FR-003). |
| Start a test | Editor/Administrator | Requires ≥1 challenger variant to exist for the control. Creates (or moves to) `experiments.status: running`, sets `startedAt`, and registers the variant list with GrowthBook under `growthbookExperimentKey`. From this point, `apps/web` begins splitting visitors (FR-002). Rejected if the control already has a `running` experiment (FR-004). |
| View results | Anyone with read access to the page/collection | `ExperimentStats`, mounted both on the control page's "Tests A/B" tab and on the `experiments` collection's own list/edit views — aggregate visit/conversion counts per variant only, never per-visitor data (FR-009). |
| Promote a variant | Editor/Administrator | `promoteVariant` endpoint copies the chosen variant's `builder`/`form`/`seo` onto the control document (same id, same `domain`/`path`, same leads already attached — FR-011), sets `experiments.winner` and `status: concluded`, archives the non-promoted variant(s) (retained, not deleted — FR-011). |
| End without promoting | Editor/Administrator | Sets `experiments.status: concluded` with no `winner`; the control's own content is left untouched. |

No new REST endpoint is needed for "view results" beyond what
`ExperimentStats` already queries from GrowthBook directly (read-only,
server component) — only "start", "promote", and "end without promoting"
are real state-changing actions, each backed by a Payload endpoint/hook
rather than a raw field edit, so `publishGuard`-equivalent invariants
(FR-004, the content-copy-not-identity-swap rule) are enforced
server-side, not just by the admin UI's own affordances.

## `pages` collection (extended)

| Field | Editable by | Effect |
|---|---|---|
| `experimentOf` | Never directly by a human — set only by the "Create test variant" action | Marks a page as a challenger; `domain`/`path` become admin-hidden and `publishGuard`'s URL checks are skipped for this document (FR-012). |

A variant's own `builder` content is edited exactly like any other page's
— the same GrapesJS field, same collection, same access rules — no new
editing surface for variant content itself.
