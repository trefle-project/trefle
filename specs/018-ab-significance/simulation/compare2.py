"""018-ab-significance (research R9) — second round: rules that keep the
hourly refresh but only announce a verdict that lasts (persistence), or only
after a minimum duration, or a sequential test tuned for small samples.

    python compare2.py [runs]
"""

import random
import sys

from gbstats.bayesian.tests import EffectBayesianABTest, EffectBayesianConfig
from gbstats.frequentist.tests import SequentialConfig, SequentialTwoSidedTTest
from gbstats.models.statistics import ProportionStatistic

HOURS = 4 * 7 * 24


def raw_bayes(threshold):
    def rule(users, leads):
        if min(users) < 300 or min(leads) < 30:
            return None
        a, b = (ProportionStatistic(n=users[i], sum=leads[i]) for i in (0, 1))
        c = EffectBayesianABTest(a, b, EffectBayesianConfig()).compute_result().chance_to_win
        return "better" if c >= threshold else "worse" if c <= 1 - threshold else None

    return rule


def raw_sequential(tuning):
    def rule(users, leads):
        if min(users) < 300 or min(leads) < 30:
            return None
        a, b = (ProportionStatistic(n=users[i], sum=leads[i]) for i in (0, 1))
        r = SequentialTwoSidedTTest(a, b, SequentialConfig(sequential_tuning_parameter=tuning)).compute_result()
        if r.p_value is None or r.p_value >= 0.05:
            return None
        return "better" if r.expected > 0 else "worse"

    return rule


def simulate(raw, rates, persist_hours=1, min_hours=0, rng=random):
    """Announced verdicts: the raw verdict held for `persist_hours` refreshes in a row, after `min_hours`."""
    users, leads = [0, 0], [0, 0]
    per_hour, carry = 4000 / HOURS, 0.0
    streak_v, streak, announced, last = None, 0, set(), None
    for hour in range(HOURS):
        carry += per_hour
        arrivals, carry = int(carry), carry - int(carry)
        for _ in range(arrivals):
            arm = rng.randrange(2)
            users[arm] += 1
            leads[arm] += rng.random() < rates[arm]
        v = raw(users, leads)
        streak = streak + 1 if v and v == streak_v else (1 if v else 0)
        streak_v = v
        last = v if (v and streak >= persist_hours and hour >= min_hours) else None
        if last:
            announced.add(last)
    return announced, last


RULES = [
    ("Bayésien 95 %, verdict tenu 72 h", raw_bayes(0.95), 72, 0),
    ("Bayésien 95 %, verdict tenu 7 jours", raw_bayes(0.95), 168, 0),
    ("Bayésien 95 %, pas de verdict avant 14 jours", raw_bayes(0.95), 1, 14 * 24),
    ("Bayésien 97,5 %, verdict tenu 72 h", raw_bayes(0.975), 72, 0),
    ("Séquentiel, réglage petit volume (1 000)", raw_sequential(1000), 1, 0),
    ("Séquentiel, réglage petit volume (300)", raw_sequential(300), 1, 0),
]


def main():
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    rng = random.Random(18)
    print("règle | faux gagnant/perdant (A = B, vu chaque heure) | vrai gagnant détecté à 4 semaines (+50 %)")
    for name, raw, persist, min_hours in RULES:
        fp = sum(bool(simulate(raw, (0.03, 0.03), persist, min_hours, rng)[0]) for _ in range(runs)) / runs
        power = sum(simulate(raw, (0.03, 0.045), persist, min_hours, rng)[1] == "better" for _ in range(runs)) / runs
        print(f"{name} | {fp:.1%} | {power:.1%}")


if __name__ == "__main__":
    main()
