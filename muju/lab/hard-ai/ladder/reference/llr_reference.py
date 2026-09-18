"""Pure-python transcription of the Stockfish fishtest statistics code.

Source of truth (fetched 2026-09-15):
  https://raw.githubusercontent.com/official-stockfish/fishtest/master/server/fishtest/stats/LLRcalc.py
  https://raw.githubusercontent.com/official-stockfish/fishtest/master/server/fishtest/stats/stat_util.py

This file exists so the TypeScript in ../sprt.ts and ../elo.ts can be pinned
against numbers produced by an implementation that shares no code with it.
It is a transcription, not an import: the upstream functions needed here
(regularize, results_to_pdf, stats, secular, MLE_expected, LLRjumps, LLR,
LLR_logistic, LLR_alt2, stat_util.elo, stat_util.stats, stat_util.get_elo)
are re-typed below.

Two deliberate deviations from upstream, both numerical only:
  - `secular` solves the secular equation with plain bisection instead of
    scipy.optimize.brentq. The equation's left-hand side is strictly
    decreasing in x on the admissible interval (the derivative of each term
    is -p_i a_i^2 / (1 + x a_i)^2 <= 0), so bisection converges to the same
    root; it is iterated to a relative interval width of 1e-15.
  - `Phi` uses math.erf and `Phi_inv` bisects on Phi, instead of
    scipy.stats.norm. Both agree with scipy to well past the 1e-6 tolerance
    the pins use.

No numpy, no scipy: run with a stock python3.

Usage:
    python3 llr_reference.py
prints every pinned case in the format the TypeScript tests quote.
"""

import math

# ---------------------------------------------------------------- LLRcalc.py

EPSILON_REGULARIZE = 1e-3


def regularize(results):
    """Mix in a small prior for regularization (LLRcalc.regularize)."""
    out = list(results)
    for i in range(len(out)):
        if out[i] == 0:
            out[i] = EPSILON_REGULARIZE
    return out


def results_to_pdf(results):
    """LLRcalc.results_to_pdf: counts -> (N, [(value, prob)])."""
    results = regularize(results)
    n = sum(results)
    count = len(results)
    return n, [(i / (count - 1), results[i] / n) for i in range(count)]


def stats(pdf):
    """LLRcalc.stats: expectation and variance of a discrete distribution."""
    epsilon = 1e-3
    for _value, prob in pdf:
        assert -epsilon <= prob <= 1 + epsilon
    n = sum(prob for _value, prob in pdf)
    assert abs(n - 1) < epsilon
    s = sum(prob * value for value, prob in pdf)
    var = sum(prob * (value - s) ** 2 for value, prob in pdf)
    return s, var


def secular(pdf):
    """LLRcalc.secular: solve sum_i p_i a_i / (1 + x a_i) = 0 for x.

    Bisection stands in for scipy.optimize.brentq; see the module docstring.
    """
    epsilon = 1e-9
    values = [a for a, _p in pdf]
    v = min(values)
    w = max(values)
    if v * w >= 0:
        raise ValueError("secular equation requires support straddling zero")
    lo = -1 / w + epsilon
    hi = -1 / v - epsilon

    def f(x):
        return sum(p * a / (1 + x * a) for a, p in pdf)

    f_lo = f(lo)
    f_hi = f(hi)
    if f_lo < 0 or f_hi > 0:
        raise ValueError("secular equation is not bracketed")
    for _ in range(400):
        mid = 0.5 * (lo + hi)
        if hi - lo <= 1e-15 * max(1.0, abs(mid)):
            break
        if f(mid) > 0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def MLE_expected(pdfhat, s):
    """LLRcalc.MLE_expected: MLE of the distribution constrained to mean s."""
    pdf1 = [(a - s, p) for a, p in pdfhat]
    x = secular(pdf1)
    pdf_mle = [(a, p / (1 + x * (a - s))) for a, p in pdfhat]
    s_, _ = stats(pdf_mle)
    assert abs(s - s_) < 1e-6, (s, s_)
    return pdf_mle


def LLRjumps(pdf, s0, s1):
    """LLRcalc.LLRjumps for statistic="expectation"."""
    pdf0, pdf1 = [MLE_expected(pdf, s) for s in (s0, s1)]
    return [
        (math.log(pdf1[i][1]) - math.log(pdf0[i][1]), pdf[i][1])
        for i in range(len(pdf))
    ]


def LLR(pdf, s0, s1):
    """LLRcalc.LLR: generalized log likelihood ratio divided by N."""
    return stats(LLRjumps(pdf, s0, s1))[0]


def LLR_alt2(pdf, s0, s1):
    """LLRcalc.LLR_alt2: the normal approximation, divided by N."""
    s, var = stats(pdf)
    return (s1 - s0) * (2 * s - s0 - s1) / var / 2.0


def L_(x):
    return 1 / (1 + 10 ** (-x / 400))


def LLR_logistic(elo0, elo1, results):
    """LLRcalc.LLR_logistic: the pentanomial GSPRT LLR in logistic Elo."""
    s0, s1 = [L_(elo) for elo in (elo0, elo1)]
    n, pdf = results_to_pdf(results)
    return n * LLR(pdf, s0, s1)


# --------------------------------------------------------------- stat_util.py


def Phi(q):
    return 0.5 * (1 + math.erf(q / math.sqrt(2)))


def Phi_inv(p):
    lo, hi = -40.0, 40.0
    for _ in range(300):
        mid = 0.5 * (lo + hi)
        if Phi(mid) < p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def elo(x):
    """stat_util.elo: the logistic transform, clamped at epsilon = 1e-3."""
    epsilon = 1e-3
    x = max(x, epsilon)
    x = min(x, 1 - epsilon)
    return -400 * math.log10(1 / x - 1)


def stat_util_stats(results):
    """stat_util.stats: per-game mean and variance from 2n+1 frequencies."""
    count = len(results)
    n = sum(results)
    games = n * (count - 1) / 2.0
    mu = sum(results[i] * (i / 2.0) for i in range(count)) / games
    mu_ = (count - 1) / 2.0 * mu
    var = sum(results[i] * (i / 2.0 - mu_) ** 2.0 for i in range(count)) / games
    return games, mu, var


def get_elo(results):
    """stat_util.get_elo: Elo point estimate, 95% half-width and LOS."""
    results = regularize(results)
    games, mu, var = stat_util_stats(results)
    stdev = math.sqrt(var)
    mu_min = mu + Phi_inv(0.025) * stdev / math.sqrt(games)
    mu_max = mu + Phi_inv(0.975) * stdev / math.sqrt(games)
    el = elo(mu)
    elo95 = (elo(mu_max) - elo(mu_min)) / 2.0
    los = Phi((mu - 0.5) / (stdev / math.sqrt(games)))
    return el, elo95, los


# ------------------------------------------------------------------ the pins

# Pentanomial counts are [LL, LD+DL, LW+DD+WL, DW+WD, WW], i.e. the number of
# pairs scoring 0, 0.5, 1, 1.5 and 2 for engine A.
LLR_CASES = [
    ("spread-24", [3, 5, 8, 5, 3], 0.0, 50.0),
    ("skew-A-32", [1, 2, 4, 10, 15], 0.0, 100.0),
    ("skew-B-32", [15, 10, 4, 2, 1], -50.0, 0.0),
    ("all-draws-24", [0, 0, 24, 0, 0], 0.0, 10.0),
    ("bimodal-20", [10, 0, 0, 0, 10], 0.0, 20.0),
    ("all-sweeps-10", [0, 0, 0, 0, 10], 0.0, 5.0),
    ("asym-bounds-20", [2, 3, 5, 7, 3], -20.0, 20.0),
    ("large-300", [50, 60, 80, 60, 50], 0.0, 4.0),
]

ELO_CASES = [
    ("spread-24", [3, 5, 8, 5, 3]),
    ("skew-A-32", [1, 2, 4, 10, 15]),
]


def main():
    print("# pentanomial GSPRT LLR (LLRcalc.LLR_logistic)")
    for name, counts, elo0, elo1 in LLR_CASES:
        llr = LLR_logistic(elo0, elo1, counts)
        n, pdf = results_to_pdf(counts)
        alt2 = n * LLR_alt2(pdf, L_(elo0), L_(elo1))
        print(
            f"{name}: counts={counts} elo0={elo0} elo1={elo1} "
            f"LLR={llr!r} LLR_alt2={alt2!r}"
        )
    print()
    print("# Elo estimate (stat_util.get_elo)")
    for name, counts in ELO_CASES:
        games, mu, var = stat_util_stats(regularize(counts))
        el, elo95, los = get_elo(counts)
        print(
            f"{name}: counts={counts} games={games!r} mu={mu!r} var={var!r} "
            f"elo={el!r} elo95={elo95!r} los={los!r}"
        )


if __name__ == "__main__":
    main()
