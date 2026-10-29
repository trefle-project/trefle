"""018-ab-significance (research R9) — the same simulation as simulate.py, for
several verdict rules, to choose one if the default rules call identical
variants winners too often when the screen is checked every hour.

    python compare.py [runs]   # default 300 per rule and scenario
"""

import random
import sys

from gbstats.bayesian.tests import EffectBayesianABTest, EffectBayesianConfig
from gbstats.frequentist.tests import SequentialConfig, SequentialTwoSidedTTest
from gbstats.models.statistics import ProportionStatistic

HOURS = 4 * 7 * 24


def bayes(threshold, min_leads, min_visitors=300):
    def rule(users, leads):
        if min(users) < min_visitors or min(leads) < min_leads:
            return None
        a, b = (ProportionStatistic(n=users[i], sum=leads[i]) for i in (0, 1))
        chance = EffectBayesianABTest(a, b, EffectBayesianConfig()).compute_result().chance_to_win
        return "better" if chance >= threshold else "worse" if chance <= 1 - threshold else None

    return rule


def sequential(min_leads):
    def rule(users, leads):
        if min(users) < 300 or min(leads) < min_leads:
            return None
        a, b = (ProportionStatistic(n=users[i], sum=leads[i]) for i in (0, 1))
        res = SequentialTwoSidedTTest(a, b, SequentialConfig()).compute_result()
        if res.p_value is None or res.p_value >= 0.05:
            return None
        return "better" if res.expected > 0 else "worse"

    return rule


RULES = {
    "Bayésien 95 %, 30 leads (spec actuelle)": bayes(0.95, 30),
    "Bayésien 99 %, 30 leads": bayes(0.99, 30),
    "Bayésien 95 %, 100 leads": bayes(0.95, 100),
    "Séquentiel (fréquentiste), 30 leads": sequential(30),
}


def run(rule, rates, visitors_per_arm=2000, rng=random):
    users, leads = [0, 0], [0, 0]
    per_hour, carry, seen = 2 * visitors_per_arm / HOURS, 0.0, set()
    for _ in range(HOURS):
        carry += per_hour
        arrivals, carry = int(carry), carry - int(carry)
        for _ in range(arrivals):
            arm = rng.randrange(2)
            users[arm] += 1
            leads[arm] += rng.random() < rates[arm]
        v = rule(users, leads)
        if v:
            seen.add(v)
    return seen, rule(users, leads)


def main():
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    rng = random.Random(18)
    print("règle | faux gagnant/perdant (A = B, vu chaque heure) | vrai gagnant détecté à 4 semaines (+50 %)")
    for name, rule in RULES.items():
        false_pos = sum(bool(run(rule, (0.03, 0.03), rng=rng)[0]) for _ in range(runs)) / runs
        power = sum(run(rule, (0.03, 0.045), rng=rng)[1] == "better" for _ in range(runs)) / runs
        print(f"{name} | {false_pos:.1%} | {power:.1%}")


if __name__ == "__main__":
    main()
