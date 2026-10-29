# Contract: analysis (GrowthBook calls, refresh, admin screens)

Research R4–R8.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `GROWTHBOOK_API_URL` | cms | default `http://growthbook:3100/api` (internal network) |
| `GROWTHBOOK_API_KEY` | cms | GrowthBook secret API key; empty → analysis off (screens show counts only, no error) |
| `GROWTHBOOK_PG_PASSWORD` | cms (migration), growthbook (`config.yml`) | password of `growthbook_reader` |

`infra/growthbook/config.yml` (mounted read-only in the growthbook container):
data source `trefle` (postgres, host `db`, user `growthbook_reader`), id type
`visitor_id`, exposure query `ab_exposures` (research R4).

## GrowthBook objects (created by the CMS, found again by name)

- Fact table « Trefle — leads attribués » over `ab_conversions`.
- Fact metrics « Lead envoyé » (binomial) and « Lead confirmé » (binomial,
  `confirmed_at IS NOT NULL`).
- One experiment per Trefle test: `trackingKey` = `growthbookExperimentKey`,
  variations `[control, …variants]` with `key` = page id and `name` = page
  title, primary metric « Lead envoyé », secondary « Lead confirmé », phase
  start = `analysisStartedAt`. Started on declaration, stopped at conclusion.

## `refreshAnalysis(experiment)` (one code path)

1. Analysis off → return.
2. Not declared → declare (above), store `growthbookId`, `analysisStartedAt`.
3. `POST /v1/experiments/{id}/snapshot`; poll `GET /v1/snapshots/{snapshotId}`
   every 3 s, up to 2 min.
4. `GET /v1/experiments/{id}/results` → verdict function (R8) → write
   `analysis`, `analysisRefreshedAt`, clear `analysisError`.
5. Any failure → write `analysisError` (short French text for the screen +
   the technical cause in the log); previous `analysis` kept.

Callers: task `ab-analysis` (hourly, every `running` test, sequentially);
`POST /api/experiments/:id/refresh-analysis` (admin/editor, 2FA as other
admin endpoints; one test; answers the new state or 502 with the error); the
conclude and promote endpoints (one last refresh, then
`POST /v1/experiments/{id}/stop`; failures never block concluding).

## Verdict function (pure, `apps/cms/src/lib/ab-verdict.ts`)

Input: GrowthBook results for the primary metric and the previously stored
analysis. Output: the `analysis` shape (data-model.md). Rules R8, including
the 72-hour hold (verdicts `leaning-better` / `leaning-worse` before it,
with `reading`, `readingSince`, `confirmAt`). Unit tests: thresholds exactly
at 30/300, 0.95/0.05; SRM below/above 0.001; three arms; no conversion yet
(missing leads message); missing variation in results; hold at 71 h / 72 h,
reset on a dropped or flipped reading.

## Screens

- Test results panel (`ExperimentStats`): under today's table, a block per
  challenger: « Probabilité de battre l'original : 87 % », « Effet probable :
  entre −4 % et +31 % », the verdict line; or the split warning instead of
  every verdict; then « Analyse sur toute la durée du test, mise à jour il y
  a 12 min » + « Rafraîchir ». When a period is selected: « La période choisie
  ne s'applique qu'aux chiffres ; l'analyse couvre tout le test. » For tests
  started before 018: « Analyse disponible pour les visites à partir du
  <date> ». Analysis off or never computed: nothing new shown. Last refresh
  failed: « Analyse statistique momentanément indisponible » + time of the
  last good one, if any. Loading state on « Rafraîchir ».
- Experiments list: column « Verdict » (one line: the best challenger's
  verdict, or the split warning, or « — »).
- Never any per-visitor value.
