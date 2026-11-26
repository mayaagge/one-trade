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


def beta_contributions(holding_returns, weights, basket_returns):
    """Each holding's share of the portfolio's beta, in beta units.

    Beta is linear in the dollar weights, because covariance is:
    cov(sum_i w_i r_i, b) = sum_i w_i cov(r_i, b). So holding i contributes
    w_i * beta_i, and the contributions add up to the portfolio's beta exactly.
    That is what lets level 4's "Why?" card name where the AI exposure came from
    without inventing a decomposition.

    Returned in beta units and NOT as percentages of the total: a holding whose
    beta is negative contributes a negative amount, which would make the shares
    run past 100% and below 0%. See BUILD_LOG.md, session 2.x.
    """
    r = np.asarray(holding_returns, dtype=float)
    w = np.asarray(weights, dtype=float)
    betas = np.array([beta_to(r[:, i], basket_returns) for i in range(r.shape[1])])
    return betas, betas * w


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


# --- the replay measures, for Crash replay -----------------------------------

def value_path(start, returns):
    """What one holding is worth after each day, starting from `start`.

    The path has one more point than there are returns: a replay starts at a
    CLOSE and applies the returns after it, so the first point is the money as it
    went in. docs/PRD.md, "Crash replay: the three windows".
    """
    path = [float(start)]
    for r in returns:
        path.append(path[-1] * (1.0 + r))
    return path


def buy_and_hold_path(dollars, returns):
    """A portfolio held through a window, never rebalanced.

    Each holding's dollars grow on their own and the portfolio is their sum,
    which is what holding a portfolio through a crash does. `returns` is one row
    per day and one column per holding, in the order of `dollars`.
    """
    r = np.asarray(returns, dtype=float)
    held = np.asarray(dollars, dtype=float).copy()
    path = [float(held.sum())]
    for day in range(r.shape[0]):
        held = held * (1.0 + r[day])
        path.append(float(held.sum()))
    return path


def rebalanced_path(dollars, returns):
    """The same portfolio with its weights put back every close.

    Not what Crash replay draws. It is here so the fixtures carry the number the
    two conventions differ by, rather than the difference being described.
    """
    r = np.asarray(returns, dtype=float)
    total = float(np.sum(dollars))
    weights = np.asarray(dollars, dtype=float) / total
    path = [total]
    for day in range(r.shape[0]):
        path.append(path[-1] * (1.0 + float(r[day] @ weights)))
    return path


def total_change(path):
    """End over start, as a fraction: -0.339 is a fall of 33.9%."""
    return path[-1] / path[0] - 1.0


def deepest_fall(path):
    """The lowest point the path reached, against where it started.

    Not a peak-to-trough drawdown: a replay window starts at the peak by
    construction - 19 February 2020 is the S&P 500's own high - so the question a
    player asks is how far below their starting money it ever went.
    """
    return min(path) / path[0] - 1.0


def fall_share(portfolio_path, index_path):
    """Level 6's measure: the portfolio's fall as a fraction of the index's.

    "Fell less than half as much as the S&P 500" is this number under 0.5. It is
    a ratio of two total changes, so the money each line started with cancels and
    the two paths do not have to start from the same dollars.

    None when the index did not fall. A share of a rise is not what level 6 asks
    about, and 0.4 of a gain would read on screen as if it were.
    """
    portfolio = total_change(portfolio_path)
    index = total_change(index_path)
    if index >= 0.0:
        return None
    return portfolio / index


def build_fall_share_cases():
    """Known answers for level 6's measure, portfolio against index.

    The replay cases above read their index off the portfolio's own first
    holding, so their share is 1 by construction. These carry an index series of
    their own, which is what a level 6 round has: the portfolio is the player's
    and the index line is VOO.

    A fresh generator at the same registered seed, so nothing here moves a number
    in any case above.
    """
    rng = np.random.default_rng(SEED)
    cases = [
        {
            "name": "fall_share_passes",
            "description": (
                "One day. The index halves; the portfolio is 60% in a holding that "
                "falls 30% and 40% in one that rises 10%, so it falls 14% against the "
                "index's 50% and its share is 0.28."
            ),
            "hand_derivable": True,
            "dollars": [6000.0, 4000.0],
            "returns": [[-0.30, 0.10]],
            "index_returns": [-0.50],
            "expected_exact": {"total_change": -0.14, "index_change": -0.50, "fall_share": 0.28},
        },
        {
            "name": "fall_share_at_the_threshold",
            "description": (
                "The portfolio falls exactly half as much as the index - 25% against 50% - "
                "so the share is exactly 0.5 and level 6 refuses it: a portfolio that fell "
                "exactly half as much did not fall LESS than half as much. The boundary is "
                "a real build, not a limit."
            ),
            "hand_derivable": True,
            "dollars": [10000.0],
            "returns": [[-0.25]],
            "index_returns": [-0.50],
            "expected_exact": {"total_change": -0.25, "index_change": -0.50, "fall_share": 0.5},
        },
        {
            "name": "fall_share_one_ulp_under_the_threshold",
            "description": (
                "20% against 40% is the same half as the case above in arithmetic, and not "
                "in binary floating point: 8000/10000 - 1 is -0.19999999999999996, so the "
                "share comes out at 0.4999999999999999 rather than at 0.5. Python and "
                "JavaScript land on the same bit, which is the point of carrying it. Both "
                "builds display as 0.5000 and both miss, because js/levels.js's passes() "
                "counts a measure within 1e-9 of its threshold as equal to it - the slack "
                "the star bands already give a guess. Without it, these two portfolios got "
                "different verdicts off the same number on screen."
            ),
            "hand_derivable": True,
            "dollars": [10000.0],
            "returns": [[-0.20]],
            "index_returns": [-0.40],
            # Not -0.2 and not 0.5: the numbers the arithmetic actually produces.
            "expected_exact": {
                "total_change": -0.19999999999999996,
                "index_change": -0.4,
                "fall_share": 0.4999999999999999,
            },
        },
        {
            "name": "fall_share_rose_while_the_index_fell",
            "description": (
                "The portfolio gains 10% while the index falls 40%, so the share is "
                "negative. Rare but reachable, which is why level 6's lowest bucket has "
                "no floor."
            ),
            "hand_derivable": True,
            "dollars": [10000.0],
            "returns": [[0.10]],
            "index_returns": [-0.40],
            "expected_exact": {"total_change": 0.10, "index_change": -0.40, "fall_share": -0.25},
        },
        {
            "name": "fall_share_fell_harder_than_the_index",
            "description": "The portfolio falls twice as far as the index: a share of exactly 2.",
            "hand_derivable": True,
            "dollars": [10000.0],
            "returns": [[-0.50]],
            "index_returns": [-0.25],
            "expected_exact": {"total_change": -0.50, "index_change": -0.25, "fall_share": 2.0},
        },
        {
            "name": "fall_share_index_did_not_fall",
            "description": (
                "The index ends above where it started, so there is no fall to take a "
                "share of and the answer is no number at all."
            ),
            "hand_derivable": True,
            "dollars": [10000.0],
            "returns": [[-0.10]],
            "index_returns": [0.05],
            "expected_exact": {"total_change": -0.10, "index_change": 0.05, "fall_share": None},
        },
        {
            "name": "fall_share_four_holdings_23_days",
            "description": (
                "Four holdings over 23 sampled days - the 2020 window's own length - "
                "unevenly split, against a sampled index. Checks the arithmetic rather "
                "than the shape: held dollars drift apart over 23 days, so this share is "
                "not the one a rebalanced portfolio would give."
            ),
            "hand_derivable": False,
            "dollars": [3000.0, 3000.0, 2000.0, 2000.0],
            "returns": rng.normal(-0.004, 0.03, (23, 4)).tolist(),
            "index_returns": rng.normal(-0.006, 0.025, 23).tolist(),
            "expected_exact": None,
        },
    ]

    out = []
    for case in cases:
        path = buy_and_hold_path(case["dollars"], case["returns"])
        # The index line is one holding, started at the same money as the
        # portfolio, exactly as js/crash.js's replay() draws it.
        index_path = buy_and_hold_path([path[0]], [[r] for r in case["index_returns"]])
        out.append({
            "name": case["name"],
            "description": case["description"],
            "hand_derivable": case["hand_derivable"],
            "dollars": case["dollars"],
            "returns": case["returns"],
            "index_returns": case["index_returns"],
            "expected": {
                "path": path,
                "index_path": index_path,
                "total_change": total_change(path),
                "index_change": total_change(index_path),
                "fall_share": fall_share(path, index_path),
                # The same share off an index line started at $1 instead of the
                # portfolio's money: a ratio of changes cannot depend on it.
                "fall_share_unit_index": fall_share(path, buy_and_hold_path([1.0], [[r] for r in case["index_returns"]])),
            },
            "expected_exact": case["expected_exact"],
        })
    return out


def build_replay_cases():
    """Known answers for what a replay draws and the falls under it.

    A fresh generator at the same registered seed, so nothing here moves a number
    in any case above.
    """
    rng = np.random.default_rng(SEED)
    cases = []

    # 1. Three days anyone can check in their head: +10%, -50%, flat.
    cases.append({
        "name": "replay_hand_derivable",
        "description": "One holding over three days: +10%, -50%, flat. $10,000 ends at $5,500.",
        "hand_derivable": True,
        "dollars": [10000.0],
        "returns": [[0.10], [-0.50], [0.0]],
        "expected_exact": {
            "path": [10000.0, 11000.0, 5500.0, 5500.0],
            "total_change": -0.45,
            "deepest_fall": -0.45,
        },
    })

    # 2. Two holdings where buy and hold and daily rebalancing disagree, by hand:
    #    A doubles twice and B halves twice. Held: 5,000 -> 20,000 and 5,000 ->
    #    1,250, so 21,250. Rebalanced: +25% a day on 10,000, so 15,625.
    cases.append({
        "name": "replay_hold_or_rebalance",
        "description": (
            "Two holdings, one doubling and one halving twice. Hand-derivable: held is "
            "$21,250 and rebalanced daily is $15,625."
        ),
        "hand_derivable": True,
        "dollars": [5000.0, 5000.0],
        "returns": [[1.0, -0.5], [1.0, -0.5]],
        "expected_exact": {
            "path": [10000.0, 12500.0, 21250.0],
            "rebalanced_path": [10000.0, 12500.0, 15625.0],
            "total_change": 1.125,
            "deepest_fall": 0.0,
        },
    })

    # 3. A dip and a recovery, so the deepest fall is not the last day. The
    #    distinction matters: a window can end above where it bottomed.
    cases.append({
        "name": "replay_dips_and_recovers",
        "description": "One holding that falls 30% and comes most of the way back: the low is mid-window.",
        "hand_derivable": True,
        "dollars": [10000.0],
        "returns": [[-0.20], [-0.125], [0.20], [0.10]],
        "expected_exact": {
            "path": [10000.0, 8000.0, 7000.0, 8400.0, 9240.0],
            "total_change": -0.076,
            "deepest_fall": -0.30,
        },
    })

    # 4. Five holdings over 60 sampled days, which checks the arithmetic rather
    #    than the shape.
    sampled = rng.normal(-0.002, 0.02, (60, 5))
    cases.append({
        "name": "replay_five_holdings_60_days",
        "description": "Five holdings over 60 sampled days, unevenly split.",
        "hand_derivable": False,
        "dollars": [3500.0, 2500.0, 2000.0, 1500.0, 500.0],
        "returns": sampled.tolist(),
        "expected_exact": None,
    })

    out = []
    for case in cases:
        dollars = case["dollars"]
        returns = case["returns"]
        path = buy_and_hold_path(dollars, returns)
        out.append({
            "name": case["name"],
            "description": case["description"],
            "hand_derivable": case["hand_derivable"],
            "dollars": dollars,
            "returns": returns,
            "expected": {
                "path": path,
                "rebalanced_path": rebalanced_path(dollars, returns),
                "total_change": total_change(path),
                "deepest_fall": deepest_fall(path),
                # One holding on its own, which is what the S&P 500 line is.
                "first_holding_path": value_path(dollars[0], [row[0] for row in returns]),
            },
            "expected_exact": case["expected_exact"],
        })
    return out


# --- the beta cases, for level 4's measure -----------------------------------

def build_beta_cases():
    """Known answers for the whole chain level 4 computes.

    Level 4 asks for beta to the equal-weight AI basket, which is three steps:
    average the basket members' returns, weight the holdings into one portfolio
    return series, then divide the covariance by the basket's variance. The cases
    in build_cases() above check beta against ONE shared basket series; these
    check the chain end to end, basket included, and the per-holding
    decomposition the "Why?" card reads.

    A fresh generator at the same registered seed, so nothing here moves a single
    number in build_cases() or build_series_cases().
    """
    rng = np.random.default_rng(SEED)
    cases = []

    # 1. A portfolio that IS the basket, equally weighted. Hand-derivable: the
    #    two series are identical day by day, so beta is exactly 1.
    members = rng.normal(0.0, 0.015, (DAYS, 2))
    cases.append({
        "name": "beta_portfolio_is_the_basket",
        "description": "A 50/50 portfolio of the basket's two members. Hand-derivable: beta is exactly 1.",
        "hand_derivable": True,
        "members": members,
        "holdings": members,
        "weights": [0.5, 0.5],
        "expected_exact": {"portfolio_beta": 1.0},
    })

    # 2. One of two independent, equally volatile members, held alone.
    #    Hand-derivable: cov(a, (a+b)/2) = v/2 and var((a+b)/2) = v/2, so beta is
    #    exactly 1 here too - a single name can carry the whole basket's beta.
    #    Constructed rather than sampled, so the sample covariance is exactly
    #    diagonal, as in Case 2 of build_cases().
    a = 0.01
    plus_minus = np.array([[a, a], [a, -a], [-a, a], [-a, -a]])
    cases.append({
        "name": "beta_one_member_of_two",
        "description": (
            "One of two independent, equally volatile members, held alone. "
            "Hand-derivable: beta is exactly 1."
        ),
        "hand_derivable": True,
        "members": plus_minus,
        "holdings": plus_minus[:, [0]],
        "weights": [1.0],
        "expected_exact": {"portfolio_beta": 1.0},
    })

    # 3. The realistic case, shaped like level 4 itself: a 13-member basket, and
    #    four holdings - one basket member, a fund that holds the basket's names
    #    without being one of them (QQQ's job), an unrelated holding, and one that
    #    moves against the basket. The negative one is deliberate: it makes a
    #    contribution negative, which is why the card states beta rather than
    #    shares of it.
    thirteen = rng.normal(0.0, 0.016, (DAYS, 13))
    basket_mean = thirteen.mean(axis=1)
    fund = 0.6 * basket_mean + rng.normal(0.0, 0.006, DAYS)
    unrelated = rng.normal(0.0, 0.009, DAYS)
    against = -0.25 * basket_mean + rng.normal(0.0, 0.007, DAYS)
    cases.append({
        "name": "beta_thirteen_member_basket",
        "description": (
            "A 13-member equal-weight basket, as basket.json has, and four holdings: a "
            "member, a fund holding the members, an unrelated holding and one that moves "
            "against the basket."
        ),
        "hand_derivable": False,
        "members": thirteen,
        "holdings": np.column_stack([thirteen[:, 0], fund, unrelated, against]),
        "weights": [0.30, 0.30, 0.25, 0.15],
        "expected_exact": None,
    })

    out = []
    for case in cases:
        members = np.asarray(case["members"], dtype=float)
        holdings = np.asarray(case["holdings"], dtype=float)
        weights = case["weights"]
        basket = equal_weight_basket(members)
        portfolio = (holdings * np.asarray(weights)).sum(axis=1)
        betas, contributions = beta_contributions(holdings, weights, basket)
        out.append({
            "name": case["name"],
            "description": case["description"],
            "hand_derivable": case["hand_derivable"],
            "members": members.tolist(),
            "holdings": holdings.tolist(),
            "weights": weights,
            "expected": {
                "basket_returns": basket.tolist(),
                "portfolio_beta": beta_to(portfolio, basket),
                "holding_betas": betas.tolist(),
                "beta_contributions": contributions.tolist(),
            },
            "expected_exact": case["expected_exact"],
        })
    return out


def main():
    cases, basket = build_cases()
    series_cases = build_series_cases()
    beta_cases = build_beta_cases()
    replay_cases = build_replay_cases()
    fall_share_cases = build_fall_share_cases()
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
            # Level 5's measure: "no holding carries more than 35% of the risk".
            "max_risk_share": float(np.max(risk_shares(weights, cov_used))),
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
        "beta_cases": beta_cases,
        "replay_cases": replay_cases,
        "fall_share_cases": fall_share_cases,
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
    for case in beta_cases:
        members = len(case["members"][0])
        print(f"  {case['name']:<32} {members:>2} members, {len(case['weights'])} holdings, "
              f"beta={case['expected']['portfolio_beta']:.12f}")
    for case in replay_cases:
        print(f"  {case['name']:<32} {len(case['dollars'])} holdings, {len(case['returns'])} days, "
              f"change={case['expected']['total_change']:.12f} "
              f"low={case['expected']['deepest_fall']:.12f}")
    for case in fall_share_cases:
        share = case["expected"]["fall_share"]
        print(f"  {case['name']:<32} {len(case['dollars'])} holdings, {len(case['returns'])} days, "
              f"share={'none' if share is None else f'{share:.12f}'}")


if __name__ == "__main__":
    main()
