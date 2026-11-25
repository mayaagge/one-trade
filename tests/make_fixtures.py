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


def risk_shares(weights, cov):
    w = np.asarray(weights, dtype=float)
    return (w * (cov @ w)) / float(w @ cov @ w)


def beta_to(portfolio_returns, basket_returns):
    p = np.asarray(portfolio_returns, dtype=float)
    b = np.asarray(basket_returns, dtype=float)
    return float(np.cov(p, b, ddof=1)[0, 1] / np.var(b, ddof=1))


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
        "expected_exact": {"effective_bets": 1.0},
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
        "expected_exact": {"effective_bets": 2.0},
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


def main():
    cases, basket = build_cases()
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
    }
    with open(OUT, "w") as handle:
        json.dump(doc, handle, indent=1)
        handle.write("\n")

    print("wrote", OUT)
    for case in out:
        bits = [f"ENB={case['expected']['effective_bets']:.12f}"]
        if case["expected_exact"]:
            bits.append(f"(exact {case['expected_exact']['effective_bets']})")
        print(f"  {case['name']:<28} holdings={len(case['weights'])} {' '.join(bits)}")


if __name__ == "__main__":
    main()
