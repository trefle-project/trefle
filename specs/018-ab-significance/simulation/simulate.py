"""018-ab-significance (research R9, T037) — do the FIRST verdict rules hold
when the operator looks at the test screen every hour?

GrowthBook's own engine (gbstats, as bundled in GrowthBook 5.0.1) computes the
chance to beat the original and the split check; Trefle's rules
(apps/cms/src/lib/ab-verdict.ts) turn them into a verdict: split warning when
p < 0.001, then at least 30 leads and 300 visitors in both arms, then
>= 95 % better / <= 5 % worse. Each simulated test runs 4 weeks; the verdict
is recomputed every hour, as the hourly refresh does.

    python simulate.py [runs]   # default 1000 per scenario
"""

import random
import sys

from gbstats.bayesian.tests import EffectBayesianABTest, EffectBayesianConfig
from gbstats.models.statistics import ProportionStatistic
from gbstats.utils import check_srm

MIN_LEADS, MIN_VISITORS, WIN, SRM = 30, 300, 0.95, 0.001
HOURS = 4 * 7 * 24


def verdict(users, leads, srm_p):
    if srm_p < SRM:
        return "unreliable"
    if min(users) < MIN_VISITORS or min(leads) < MIN_LEADS:
        return "not-enough-data"
    a = ProportionStatistic(n=users[0], sum=leads[0])
    b = ProportionStatistic(n=users[1], sum=leads[1])
    chance = EffectBayesianABTest(a, b, EffectBayesianConfig()).compute_result().chance_to_win
    if chance >= WIN:
        return "better"
    if chance <= 1 - WIN:
        return "worse"
    return "no-clear-difference"


def run(visitors_per_arm, rates, share_a=0.5, peek=True, rng=random):
    """One 4-week test; returns every hourly verdict (or the last one only)."""
    total = 2 * visitors_per_arm
    users, leads = [0, 0], [0, 0]
    seen = []
    per_hour = total / HOURS
    carry = 0.0
    for hour in range(HOURS):
        carry += per_hour
        arrivals, carry = int(carry), carry - int(carry)
        for _ in range(arrivals):
            arm = 0 if rng.random() < share_a else 1
            users[arm] += 1
            if rng.random() < rates[arm]:
                leads[arm] += 1
        if peek or hour == HOURS - 1:
            seen.append(verdict(users, leads, check_srm(users, [0.5, 0.5])))
    return seen


def main():
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    rng = random.Random(18)
    out = []

    # (a) SC-001 — a clear winner: +50 % (3 % -> 4.5 %), 2,000 visitors per arm.
    final = [run(2000, (0.03, 0.045), peek=False, rng=rng)[-1] for _ in range(runs)]
    out.append(("Gagnant net (+50 %, 2 000 visiteurs/variante) : « meilleure » à la fin", final.count("better") / runs))

    # (b) SC-001 — identical arms, looked at every hour: ever called a winner (or a loser)?
    ever = 0
    for _ in range(runs):
        seen = run(2000, (0.03, 0.03), rng=rng)
        if "better" in seen or "worse" in seen:
            ever += 1
    out.append(("Variantes identiques, consultées chaque heure : déclarées gagnante/perdante au moins une fois", ever / runs))

    # (c) SC-003 — 70/30 split on a 50/50 test, >= 1,000 visitors: warning at the end.
    final = [run(1000, (0.04, 0.04), share_a=0.7, peek=False, rng=rng)[-1] for _ in range(runs)]
    out.append(("Répartition 70/30 sur un test 50/50 (1 000+ visiteurs) : alerte à la fin", final.count("unreliable") / runs))

    # (d) SC-003 — a normal split never warns (checked every hour).
    warned = sum("unreliable" in run(2000, (0.03, 0.03), rng=rng) for _ in range(runs))
    out.append(("Répartition normale, consultée chaque heure : alerte au moins une fois", warned / runs))

    for label, rate in out:
        print(f"{rate:6.1%}  {label}")


if __name__ == "__main__":
    main()
