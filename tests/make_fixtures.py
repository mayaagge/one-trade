"""Known-answer fixtures for One Trade's browser math.

Computes the true answers with numpy and writes them to
tests/fixtures/known_answers.json. tests/math.test.js reloads that file and
checks js/math.js reproduces every number to a relative 1e-9. The two files
share nothing but the JSON, so if Python and JavaScript disagree, the test fails.

Run: .venv/bin/python tests/make_fixtures.py

Educational, not investment advice.
"""

import json
import os

import numpy as np

SEED = 2026              # fixed at pre-registration; see PREREG.md
SHARE_CUTOFF = 1e-12     # variance shares at or below this are dropped from the entropy
REL_TOL = 1e-9           # CLAUDE.md rule 3
ABS_TOL = 1e-12          # fallback for numbers near zero
DAYS = 252
ROLLING_WINDOW = 126      # "the rolling 126-day correlation", PREREG.md Hypothesis 2

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "known_answers.json")


# --- the measures, exactly as js/math.js must implement them -----------------

def covariance(returns):
    return np.cov(returns, rowvar=False, ddof=1)


def correlation(returns):
    return np.corrcoef(returns, rowvar=False)


def effective_bets(weights, cov):
    """Meucci 2009 effective number of bets: exp of the entropy of variance shares."""
    w = np.asarray(weights, dtype=float)
    lam, vecs = np.linalg.eigh(cov)
    lam = np.where(lam < 0.0, 0.0, lam)        # clamp tiny negative eigenvalues to 0
    w_tilde = vecs.T @ w
    port_var = float(w @ cov @ w)
    shares = (w_tilde ** 2) * lam / port_var
    shares = shares[shares > SHARE_CUTOFF]     # defines 0 * ln(0) = 0
    return float(np.exp(-np.sum(shares * np.log(shares))))


def correlation_only_ratio(weights, cov):
    """The correlation-only ratio R of PREREG_AMENDMENT_2.md section 3.

    Effective bets with the real covariance matrix, divided by effective bets
    with the SAME weights and the SAME volatilities but every correlation
    switched off. R = 1 means correlation cost the portfolio nothing; R = 0.5
    means correlation halved the risk sources its weights would have allowed.
    """
    cov = np.asarray(cov, dtype=float)
    independent = np.diag(np.diag(cov))          # same volatilities, zero correlations
    return effective_bets(weights, cov) / effective_bets(weights, independent)


def risk_shares(weights, cov):
    w = np.asarray(weights, dtype=float)
    return (w * (cov @ w)) / float(w @ cov @ w)


def beta_to(portfolio_returns, basket_returns):
    p = np.asarray(portfolio_returns, dtype=float)
    b = np.asarray(basket_returns, dtype=float)
    return float(np.cov(p, b, ddof=1)[0, 1] / np.var(b, ddof=1))


# --- the series measures, exactly as js/returns.js and js/hypothesis2.js must
# --- implement them ----------------------------------------------------------

def simple_returns(closes):
    """Daily simple returns: close-to-close percent change, one fewer than closes.

    PRD, "How the numbers work": "Daily returns are simple returns (close-to-close
    percent change), used consistently everywhere a return appears."
    """
    c = np.asarray(closes, dtype=float)
    return c[1:] / c[:-1] - 1.0


def equal_weight_basket(member_returns):
    """The plain average of the members' returns, one day at a time.

    Rebalanced daily, which is the reading of "AI basket: equal weight" that keeps
    it equal weight for all ten years (see BUILD_LOG.md).
    """
    return np.asarray(member_returns, dtype=float).mean(axis=1)


def growing_basket(member_returns):
    """The equal-weight average of the members that have listed by each day.

    PREREG.md Hypothesis 2: "A second version that adds names as they list is
    reported beside it." A member that has not listed yet is NaN here and null in
    the browser, and is left out of that day's average rather than counted as a
    zero return.
    """
    m = np.asarray(member_returns, dtype=float)
    return np.nanmean(m, axis=1)


def rolling_correlation(a, b, window=ROLLING_WINDOW):
    """Pearson correlation over a sliding window, labelled by the window's LAST day.

    The first value covers days 0 to window-1 inclusive, so a series of n days
    gives n - window + 1 values.
    """
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    return np.array([
        np.corrcoef(a[i:i + window], b[i:i + window])[0, 1]
        for i in range(len(a) - window + 1)
    ])


# --- the five cases ---------------------------------------------------------

def build_cases():
    rng = np.random.default_rng(SEED)
    v = 1e-4                       # a daily variance of 1e-4 is a 1% daily move
    cases = []

    # Case 1: two identical assets. Hand-derivable: the second component carries
    # no variance, so the entropy has one term and ENB is exactly 1.
    col = rng.normal(0.0, 0.01, DAYS)
    identical = np.column_stack([col, col])
    cases.append({
        "name": "two_identical_assets",
        "description": "Two holdings with identical returns. Hand-derivable: ENB is exactly 1.",
        "hand_derivable": True,
        "weights": [0.5, 0.5],
        "returns": identical,
        "covariance_input": np.array([[v, v], [v, v]]),
        "expected_exact": {"effective_bets": 1.0, "correlation_only_ratio": 0.5},
    })

    # Case 2: two independent, equally volatile assets. Hand-derivable: ENB is
    # exactly 2, but ONLY for an exactly diagonal covariance matrix -- see the
    # tied-eigenvalue note in js/math.js. The returns below are constructed, not
    # sampled, so their sample covariance is diagonal to machine precision.
    a = 0.01
    plus_minus = np.array([[a, a], [a, -a], [-a, a], [-a, -a]])
    cases.append({
        "name": "two_independent_equal_vol",
        "description": "Two independent, equally volatile holdings. Hand-derivable: ENB is exactly 2.",
        "hand_derivable": True,
        "weights": [0.5, 0.5],
        "returns": plus_minus,
        "covariance_input": np.array([[v, 0.0], [0.0, v]]),
        "expected_exact": {"effective_bets": 2.0, "correlation_only_ratio": 1.0},
    })

    # Case 3: two holdings, correlation about 0.6, unequal volatility.
    target = np.array([[1.0, 0.6], [0.6, 1.0]])
    scale = np.diag([0.008, 0.020])
    pair = rng.normal(0.0, 1.0, (DAYS, 2)) @ np.linalg.cholesky(scale @ target @ scale).T
    cases.append({
        "name": "pair_correlated_unequal_vol",
        "description": "Two holdings, correlation near 0.6, one twice as volatile as the other.",
        "hand_derivable": False,
        "weights": [0.3, 0.7],
        "returns": pair,
        "covariance_input": None,
        "expected_exact": None,
    })

    # Case 4: three holdings, two of them near-duplicates, so ENB falls below 3.
    base = rng.normal(0.0, 0.012, (DAYS, 2))
    near_dup = base[:, 0] + rng.normal(0.0, 0.002, DAYS)
    three = np.column_stack([base[:, 0], base[:, 1], near_dup])
    cases.append({
        "name": "three_with_near_duplicate",
        "description": "Three holdings where the first and third nearly duplicate each other.",
        "hand_derivable": False,
        "weights": [0.4, 0.2, 0.4],
        "returns": three,
        "covariance_input": None,
        "expected_exact": None,
    })

    # Case 5: five holdings, uneven weights, the realistic case.
    five = rng.normal(0.0, 1.0, (DAYS, 5)) @ np.diag([0.006, 0.009, 0.014, 0.011, 0.004])
    cases.append({
        "name": "five_mixed",
        "description": "Five holdings with uneven dollar weights, covering all four measures.",
        "hand_derivable": False,
        "weights": [0.35, 0.25, 0.20, 0.15, 0.05],
        "returns": five,
        "covariance_input": None,
        "expected_exact": None,
    })

    # One shared AI-basket return series, for the beta tests.
    basket = rng.normal(0.0, 0.015, DAYS)
    return cases, basket


# --- the series cases, for js/returns.js and Hypothesis 2's two additions ----

def build_series_cases():
    """Known answers for prices-to-returns, both baskets and rolling correlation.

    A fresh generator at the same registered seed, so nothing here moves a single
    number in build_cases() above.
    """
    rng = np.random.default_rng(SEED)
    cases = []

    # 1. Four returns anyone can check by hand, including a flat day.
    cases.append({
        "name": "returns_hand_derivable",
        "description": "Closes a reader can divide in their head: +10%, -10%, flat, +25%.",
        "hand_derivable": True,
        "kind": "simple_returns",
        "closes": [100.0, 110.0, 99.0, 99.0, 123.75],
        "expected_exact": [0.1, -0.1, 0.0, 0.25],
    })

    # 2. A longer sampled series, to catch rounding the hand case cannot.
    closes = 100.0 * np.exp(np.cumsum(rng.normal(0.0004, 0.013, 300)))
    cases.append({
        "name": "returns_sampled_300",
        "description": "300 sampled closes; checks the browser's arithmetic, not just its shape.",
        "hand_derivable": False,
        "kind": "simple_returns",
        "closes": closes.tolist(),
        "expected_exact": None,
    })

    # 3. The equal-weight basket: the plain daily average of its members.
    members = rng.normal(0.0, 0.018, (200, 3))
    cases.append({
        "name": "basket_equal_weight_3_members",
        "description": "Three members present every day; the basket is their daily average.",
        "hand_derivable": False,
        "kind": "equal_weight_basket",
        "members": members.tolist(),
        "expected_exact": None,
    })

    # 4. The growing basket: two members list partway through, and days before a
    #    member lists leave it out of the average rather than counting it as zero.
    growing = rng.normal(0.0, 0.018, (200, 4))
    listed_from = [0, 0, 50, 120]
    with_gaps = [
        [None if t < listed_from[i] else float(growing[t, i]) for i in range(4)]
        for t in range(200)
    ]
    cases.append({
        "name": "basket_growing_4_members",
        "description": (
            "Four members, two of them listing on days 50 and 120. Before a member lists "
            "it is null and is left out of that day's average, not counted as a zero."
        ),
        "hand_derivable": False,
        "kind": "growing_basket",
        "members": with_gaps,
        "listed_from": listed_from,
        "expected_exact": None,
    })

    # 5. A rolling correlation short enough to follow by hand: window 3 over 6 days
    #    gives 4 values, each labelled by the last day of its window.
    cases.append({
        "name": "rolling_correlation_window_3",
        "description": "Window 3 over 6 days: 4 values, each covering the 3 days ending at it.",
        "hand_derivable": False,
        "kind": "rolling_correlation",
        "window": 3,
        "a": [0.01, -0.02, 0.015, 0.004, -0.011, 0.007],
        "b": [0.012, -0.015, 0.009, -0.002, -0.014, 0.003],
        "expected_exact": None,
    })

    # 6. The registered 126-day window, on 300 sampled days: 175 values.
    a = rng.normal(0.0, 0.015, 300)
    b = 0.55 * a + np.sqrt(1 - 0.55 ** 2) * rng.normal(0.0, 0.015, 300)
    cases.append({
        "name": "rolling_correlation_window_126",
        "description": "The registered 126-day window over 300 days, two series correlated near 0.55.",
        "hand_derivable": False,
        "kind": "rolling_correlation",
        "window": ROLLING_WINDOW,
        "a": a.tolist(),
        "b": b.tolist(),
        "expected_exact": None,
    })

    for case in cases:
        if case["kind"] == "simple_returns":
            case["expected"] = simple_returns(case["closes"]).tolist()
        elif case["kind"] == "equal_weight_basket":
            case["expected"] = equal_weight_basket(case["members"]).tolist()
        elif case["kind"] == "growing_basket":
            members = np.array([[np.nan if v is None else v for v in row]
                                for row in case["members"]], dtype=float)
            case["expected"] = growing_basket(members).tolist()
        elif case["kind"] == "rolling_correlation":
            case["expected"] = rolling_correlation(case["a"], case["b"], case["window"]).tolist()
        else:
            raise ValueError(f"unknown series case kind: {case['kind']}")
    return cases


def main():
    cases, basket = build_cases()
    series_cases = build_series_cases()
    out = []
    for case in cases:
        returns = case["returns"]
        cov_sample = covariance(returns)
        cov_used = case["covariance_input"] if case["covariance_input"] is not None else cov_sample
        weights = case["weights"]

        expected = {
            "covariance": cov_sample.tolist(),
            "correlation": correlation(returns).tolist(),
            "effective_bets": effective_bets(weights, cov_used),
            "correlation_only_ratio": correlation_only_ratio(weights, cov_used),
            "risk_shares": risk_shares(weights, cov_used).tolist(),
        }
        # Beta needs matching day counts, so only the 252-day cases get one.
        if returns.shape[0] == len(basket):
            # (returns * w).sum(axis=1) rather than returns @ w: numpy 2.0.2 on arm64
            # raises spurious divide-by-zero warnings from matmul here. The two agree
            # to 3e-18, far inside the 1e-9 tolerance.
            portfolio = (returns * np.asarray(weights)).sum(axis=1)
            expected["beta_to_basket"] = beta_to(portfolio, basket)

        out.append({
            "name": case["name"],
            "description": case["description"],
            "hand_derivable": case["hand_derivable"],
            "weights": weights,
            "returns": returns.tolist(),
            "covariance_input": None if case["covariance_input"] is None else case["covariance_input"].tolist(),
            "expected": expected,
            "expected_exact": case["expected_exact"],
        })

    doc = {
        "generated_by": "tests/make_fixtures.py",
        "numpy_version": np.__version__,
        "seed": SEED,
        "days": DAYS,
        "share_cutoff": SHARE_CUTOFF,
        "tolerance": {"relative": REL_TOL, "absolute": ABS_TOL},
        "note": (
            "Synthetic returns only. Real prices are never used here: a known-answer test "
            "must not change when the market does."
        ),
        "basket_returns": basket.tolist(),
        "cases": out,
        "rolling_window": ROLLING_WINDOW,
        "series_cases": series_cases,
    }
    with open(OUT, "w") as handle:
        json.dump(doc, handle, indent=1)
        handle.write("\n")

    print("wrote", OUT)
    for case in out:
        bits = [f"ENB={case['expected']['effective_bets']:.12f}",
                f"R={case['expected']['correlation_only_ratio']:.12f}"]
        if case["expected_exact"]:
            bits.append(f"(exact {case['expected_exact']['effective_bets']})")
        print(f"  {case['name']:<28} holdings={len(case['weights'])} {' '.join(bits)}")
    for case in series_cases:
        print(f"  {case['name']:<32} {case['kind']:<22} {len(case['expected'])} values")


if __name__ == "__main__":
    main()
