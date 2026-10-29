"""018-ab-significance (research R9) — third round, counting only what SC-001
names: identical variants reported as a WINNER (« probablement meilleure »).
Adds the fixed-horizon option: during the test the screen shows the trend,
the verdict appears only once the planned duration (4 weeks) is reached.

    python compare3.py [runs]
"""

import random
import sys

from compare2 import raw_bayes, simulate

RULES = [
    ("Bayésien 95 %, instantané (spec actuelle)", raw_bayes(0.95), 1, 0),
    ("Bayésien 95 %, verdict tenu 72 h", raw_bayes(0.95), 72, 0),
    ("Bayésien 95 %, verdict tenu 7 jours", raw_bayes(0.95), 168, 0),
    ("Bayésien 97,5 %, verdict tenu 72 h", raw_bayes(0.975), 72, 0),
    ("Bayésien 95 %, verdict à la fin des 4 semaines prévues", raw_bayes(0.95), 1, 4 * 7 * 24 - 1),
]


def main():
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 500
    rng = random.Random(18)
    print("règle | faux gagnant (A = B) | vrai gagnant (+50 %) détecté à 4 semaines")
    for name, raw, persist, min_hours in RULES:
        fp = sum("better" in simulate(raw, (0.03, 0.03), persist, min_hours, rng)[0] for _ in range(runs)) / runs
        power = sum(simulate(raw, (0.03, 0.045), persist, min_hours, rng)[1] == "better" for _ in range(runs)) / runs
        print(f"{name} | {fp:.1%} | {power:.1%}")


if __name__ == "__main__":
    main()
