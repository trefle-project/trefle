# Simulation results — 018-ab-significance (research R9)

Engine: `gbstats` 0.8.0 (the version bundled with GrowthBook 5.0.1), Python
3.11. Each simulated test runs 4 weeks with traffic spread evenly; the verdict
is recomputed every hour, as the hourly refresh does. Seeds fixed (18).

## Rules as first specified (instant 95 %, 30 leads + 300 visitors) — `simulate.py 1000`

| Check | Result | Target |
|---|---|---|
| Clear winner (+50 %, 3 % → 4.5 %, 2,000 visitors per variant): « meilleure » at the end | 70.6 % | — |
| Identical variants, checked hourly: called winner **or loser** at least once | 23.1 % | — |
| 70/30 split on a 50/50 test (1,000+ visitors): warning at the end | 100.0 % | 100 % (SC-003) ✓ |
| Normal split, checked hourly: warning at least once | 2.2 % | « never » (SC-003) — see note |

## Choosing a rule — `compare.py 300`, `compare2.py 300`, `compare3.py 500`

False winners counted as SC-001 states them (identical variants reported
« probablement meilleure » at any hourly check); detection = a real +50 %
lift reported « meilleure » at 4 weeks.

| Rule | False winners | Detection |
|---|---|---|
| Bayesian 95 %, instant (first spec) | 6.6 % ✗ | 70.6 % |
| **Bayesian 95 %, held 72 h — chosen 2026-10-20** | **1.4 %** ✓ | **60.6 %** |
| Bayesian 95 %, held 7 days | 0.8 % | 46.2 % |
| Bayesian 97.5 %, held 72 h | 0.2 % | 39.4 % |
| Bayesian 95 %, verdict only at the planned end (4 weeks) | 2.0 % | 72.8 % |
| Bayesian 99 %, instant (winner or loser) | 10.7 % | 33.7 % |
| Bayesian 95 %, 100 leads minimum | 0 % | 0 % (never reached at this traffic) |
| Sequential frequentist (tuning 5,000 / 1,000 / 300) | 3.3 % / 2.3 % / 3.0 % (winner or loser) | 3.3 % / 2.7 % / 0.7 % |

## Notes

- At these volumes (a caterer's landing page) even a single look at the end
  detects a +50 % lift only ~73 % of the time: some tests will end « pas de
  différence nette » although a variant was better. Longer tests or more
  traffic are the only cure; the screen says what is missing.
- The split check stays instant (a broken test must be flagged quickly). Its
  2.2 % chance of a one-off warning over 4 weeks of hourly checks clears at
  the next refresh; accepted rather than delaying real alerts.

Re-run: `uv venv --python 3.11 .venv && uv pip install -r requirements.txt`,
then `python simulate.py`, `python compare3.py`.
