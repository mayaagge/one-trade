# Build log

## 2026-11-25: Choosing the AI basket (before session 1.2)
- Changed: Wrote basket.json with 13 AI stocks, a one-sentence selection rule, and a reason for each.
- I decided or corrected: Claude's first draft included SMCI. I swapped it for AMZN because SMCI is extremely volatile and had an accounting crisis in 2024, which could distort an equal-weight basket, and AMZN is a name every student recognizes. I also kept TSLA out because most of its revenue still comes from cars, and TSM out because the basket is limited to US companies.

## 2026-11-25: Pre-registration (sessions 1.2 and 1.3)
- Changed: Wrote tickers.json (40 tickers, 9 groups) and PREREG.md; pushed the annotated prereg tag. Added PREREG_AMENDMENT.md moving the freeze date to 24 Nov 2026.
- I decided or corrected: Added a 9th group for VOO, VTI and QQQ; fixed CSCO's reason; chose JPM, JNJ, PG and seed 2026; moved the freeze date forward before any data was downloaded so I can use real prices now.

## 2026-11-25: Tests first (session 1.4)
- Changed: Wrote tests/make_fixtures.py (numpy, seed 2026, five cases), the generated tests/fixtures/known_answers.json, and tests/math.test.js (48 tests). Stubbed js/math.js so the suite runs red: 47 failures, all "not implemented". Added package.json (no dependencies, just `"type": "module"` so node can load the browser files) and .gitignore.
- I decided or corrected: Claude found that Case 2 cannot use randomly sampled returns. Sampling two "independent" assets gave an effective-bets answer of 1.82 instead of 2, because a sample correlation of even 0.000002 breaks the tie between the eigenvalues. The two hand-derivable cases now use an exact covariance matrix and only the other three use seeded returns. Also kept numpy out of the system Python by using a .venv.

### Note for the Methods tab: tied eigenvalues

Effective bets splits a portfolio's risk into principal components. When two
components have exactly the same variance, there is no single right way to draw
them: any rotation within that plane fits equally well, and the effective-bets
number changes depending on which one is chosen.

The clearest example is two independent holdings of equal volatility held 50/50.
Drawn one way, the portfolio sits half on each component and the answer is 2
bets. Drawn another, it sits entirely on one component and the answer is 1 bet.
Both are mathematically valid. One Trade returns the first, because it matches
what anyone would work out by hand.

This is not only a tie-breaking rule. Two such holdings with a correlation of
just 0.01 give an answer of 1.0 rather than 2.0, so the measure is genuinely
unstable when holdings are close to equally volatile and close to uncorrelated.
Real portfolios rarely sit exactly there, but players who build near-symmetric
portfolios may see the number jump. This is a sharper version of weakness 9 in
the PRD: the measure is built from components, not from holdings, and the
components are not always uniquely defined.

## 2026-11-25: The browser math goes green (session 1.5)
- Changed: Implemented all seven functions in js/math.js - jacobiEigen, covariance, correlation, effectiveBets, riskShares, betaTo and portfolioReturns. No libraries, no changes to the tests or the fixtures. `node --test tests/` is 48 passed, 0 failed.
- I decided or corrected: Wrote the eigensolver as cyclic Jacobi with the standard threshold strategy, and gave it an early exit so an already-diagonal matrix is returned unrotated with the identity - that is what holds Case 2 at exactly 2 bets, per the tied-eigenvalue note above. Mirrored numpy's arithmetic where rounding could show: covariance is computed once per pair so the matrix is exactly symmetric, and correlation divides by each standard deviation separately and clips to [-1, 1], as numpy.corrcoef does. Eigenvalues come back ascending like numpy.linalg.eigh, sorted stably so ties keep their order.

## 2026-11-25: 1.4b Math implemented
- Changed: Wrote js/math.js (Jacobi, covariance, correlation, effective bets, risk shares, beta); 48/48 tests green.
- I decided or corrected: Caught Claude saying prereg-v2 didn't exist after it had shown the tag on GitHub; checked before fetching data.

## 2026-11-25: 1.8 CI
- Changed: Added a GitHub Actions workflow; 48/48 green on GitHub.
- I decided or corrected: Pushed straight to main with Node 24; told Claude the next step was 1.5, not 1.9, since the fetch script and research code didn't exist yet.
## 2026-11-25: 1.5 The research code (Hypothesis 1, Hypothesis 2, leave-one-out)
- Changed: Added js/rng.js (seeded generator), js/hypothesis1.js (the beginner
  sampler, the control set, the ratio and the verdict), js/hypothesis2.js (the
  equal-weight basket, window correlations, the 20-day block bootstrap and the
  verdict) and js/leaveOneOut.js (13 reruns of both hypotheses). Tests first in
  all four cases: tests/rng.test.js, tests/hypothesis1.test.js,
  tests/hypothesis2.test.js and tests/leaveOneOut.test.js, each run red before
  the module existed. 147 of 147 tests pass. Synthetic data only; nothing in
  this step fetches a price.
- I decided or corrected: Told Claude to draw a portfolio's size first and keep
  it fixed, redrawing only the names until both beginner conditions are met, so
  the registered 3-to-8 sizes stay uniform instead of favouring the sizes that
  are easier to satisfy. Fixed the block bootstrap's starts at 0 to n-20 so every
  block is a full 20 days. Asked for the equal-weight basket to be stated as a
  daily rebalanced average. Had the Dirichlet draw guarded so u is never exactly
  zero. Two tests were wrong and the code was right: one assumed a bootstrap
  interval sits around zero when two samples share a true correlation (it sits
  around the OBSERVED difference, and two 252-day draws from the same 0.5 came
  out 0.145 apart), and one read the wrong field off the leave-one-out result.

### The equal-weight AI basket is rebalanced daily

The basket is the plain average of its members' daily returns, which is the same
as returning to equal weights at every close. Buying equal dollar amounts once
in 2016 and leaving them would not stay equal weight: NVDA would have grown into
most of the basket, and the correlation being measured would really be NVDA's.
PREREG.md says "AI basket: equal weight", and daily rebalancing is the reading
that keeps it equal weight for all ten years.

### Three things PREREG.md does not settle, decided before any data existed

1. **The control set's size.** PREREG registers 3 to 8 holdings for both sets,
   but the control pool holds only 7 names, so 8 is impossible. The draw stays 3
   to 8 and the result is capped at 7, which makes 7 holdings about twice as
   likely as the other sizes in the control set. A property of the pool, not a
   change to the draw.
2. **"Not enough data" for Hypotheses 1 and 2.** PREREG defines it for
   Hypothesis 3 only. H1 needs 252 overlapping trading days, which is the PRD's
   existing floor for a covariance window. H2 needs 200 trading days in each
   12-month window and at least 2 basket names with full history.
3. **Hypothesis 2's rolling 126-day correlation.** In the PRD as something
   "also reported", with no verdict role. Left for the reporting step.

Two smaller gaps, resolved the same way: the 90% interval is the 5th and 95th
percentiles of the 2,000 bootstrap differences, interpolating between neighbours
as numpy's default does; and a median over an even count is the average of the
two middle values.

### What the 0.60 threshold actually measures

Found while writing the tests, before any price was downloaded.

Build the friendliest case diversification can have: 22 holdings that are
exactly uncorrelated and exactly equally volatile, so there is no hidden
concentration at all. Run the registered sampler on it. The beginner set's
median ratio is 0.523 and the control set's is 0.512. Both are below 0.60, so
Hypothesis 1 comes out "supported" on data where its claim is false by
construction.

The reason is arithmetic, not market structure. When holdings are independent,
each component's share of variance reduces to w squared over the sum of w
squared, so the ratio depends on the weights alone. Flat Dirichlet weights are
uneven enough by themselves to average about 0.52 across sizes 3 to 8. The same
figure comes out of numpy independently: 0.5117 over 600,000 draws.

So the 0.60 threshold is mostly measuring how unevenly a flat Dirichlet spreads
money, and only secondarily whether the holdings share risk. Nothing was changed
in response: PREREG.md is frozen, the threshold stays at 0.60, the sampler is
exactly as registered, and the verdict will be reported whichever way it comes
out. What this does change is how the result must be read, and PREREG already
asks for the two numbers that show it - the control set's median, and the share
of beginner portfolios below 0.60. If the beginner and control medians come out
close together, the measure has not separated a concentrated portfolio from a
diversified one, and the page has to say so rather than claim support.

tests/hypothesis1.test.js carries this as a test, named "FINDING: flat-Dirichlet
weights alone put the median below 0.60", so the property cannot quietly
disappear.

Educational, not investment advice.

## 2026-11-25: Amendment 2 and the correlation-only ratio
- Changed: Drafted PREREG_AMENDMENT_2.md, which keeps the registered 0.60 verdict
  and reports it with the 0.523 independence benchmark beside it, and adds a
  stricter primary test for Hypothesis 1: the correlation-only ratio
  R = ENB(w, Sigma) / ENB(w, diag Sigma). Added correlationOnlyRatio and
  registeredSets to js/hypothesis1.js, js/calibration.js and
  scripts/calibrate_threshold.mjs, with tests first in every case
  (tests/calibration.test.js, plus 13 new tests in tests/hypothesis1.test.js).
  Added correlation_only_ratio to tests/make_fixtures.py and regenerated the
  fixtures; every pre-existing number in known_answers.json is byte-identical.
  180 of 180 tests pass. Still no prices: the calibration never takes a return
  series.
- I decided or corrected: Chose the correlation-only ratio over comparing the two
  medians, because it holds weights and volatilities fixed and needs no new
  random draws, so the registered 500 portfolios and seed 2026 stay as tagged.
  Set the diversified structure at 0.30 rather than 0.15, the typical correlation
  between stocks in different sectors, because a lower value would have made the
  test easier to pass. Required the threshold to be calibrated on declared
  synthetic structures before tagging rather than guessed. Claude found that the
  first draft's structures were degenerate and stopped before publishing a number
  from them, which is what the draft-then-tag order is for.

### Why the calibration needed a volatility ladder

The first draft of section 4 gave every holding the same volatility. An
equicorrelated matrix with equal volatilities has all but one of its eigenvalues
exactly tied, and effective bets has no single right answer when eigenvalues are
tied. This is the same weakness as the tied-eigenvalue note above, met again in a
place where it decides a published number.

What it did, measured: all 500 portfolios changed their R when only the
volatility level changed, one of them by 0.57. numpy moved too - 0.4470 at a 1%
volatility against 0.4449 at 5% - because numpy's eigensolver and our Jacobi pick
different eigenvectors out of a tied subspace, and both are entitled to. Carried
through the rule, the threshold would have been published as 0.55 or 0.54
depending on a parameter that is meant to mean nothing.

Spreading volatility evenly from 0.8% to 2.0% a day across a portfolio's holdings
separates the eigenvalues. The median R is then invariant to the ladder's level
to 2.2e-16, the smallest relative eigenvalue gap across sizes 3 to 8 is 0.0079,
and numpy and the browser agree to all 12 printed digits: 0.503774609006 for the
tight structure and 0.703964103449 for the diversified one. A test refuses a flat
ladder outright, so this cannot creep back.

Only one ladder was tried, and the amendment says so. The ladder was changed
because the old structure produced an unreproducible number, not because of which
number it produced.

### The threshold

`node scripts/calibrate_threshold.mjs` gives median R of 0.503775 under the tight
structure and 0.703964 under the diversified one, a midpoint of 0.603869, so the
threshold is **0.60**. Landing on the same number as the registered v1 threshold
is a coincidence of rounding: one is a median ratio of risk sources to holdings,
the other is that ratio divided by what the same weights and volatilities would
give with correlations switched off.

One test caught a real bug on the way: building the matrix as `rho * d[i] * d[j]`
on one side and `rho * d[j] * d[i]` on the other is not symmetric to the last bit,
because the two multiply in a different order, and jacobiEigen assumes a
genuinely symmetric matrix. Each off-diagonal entry is now computed once and
written to both sides, as covariance() in js/math.js already did.

Educational, not investment advice.

### Decisions recorded for amendment 2, 25 November 2026

| Decision | What was chosen | Why |
| --- | --- | --- |
| The stricter test | **Option A, the correlation-only ratio** R = ENB(w, Sigma) / ENB(w, diag Sigma) | The only candidate that holds both the weights and the volatilities fixed, so nothing but correlation differs. It also needs no new random draws, so the registered 500 portfolios and seed 2026 stay exactly as tagged. The two rejected options were comparing the beginner and control medians (simplest, but the pools differ in size and composition, so weight and size effects leak in) and a weight-matched paired control (rigorous, but it registers a second 500-portfolio sample) |
| The diversified anchor | **0.30**, not 0.15 | Typical correlation between stocks in different sectors. A lower value would have made the test easier to pass, because the diversified structure sets the easier end of the scale and a looser one lifts the cut-off |
| The tight anchor | 0.70, unchanged | What a concentrated, single-theme market looks like |
| The structures' volatility | **A ladder, 0.8% to 2.0% a day, replacing equal volatilities** | Equal volatilities tie all but one eigenvalue, and effective bets has no single answer when eigenvalues are tied. See the section above: the threshold would have been published as 0.55 or 0.54 depending on a meaningless parameter, and numpy and the browser disagreed. The ladder is the only parameter here changed in response to a computation, and it was changed because the old structure was unreproducible, not because of the number it produced |
| The threshold | **0.60**, from a midpoint of 0.603869 | Derived by the declared rule, not chosen. Supported if the beginner median R is strictly below 0.60 |
| The download gate | **Moved from `prereg-v2` to `prereg-v3`** in CLAUDE.md rule 6 and in scripts/fetch_data.py | The stricter test and its threshold have to be timestamped publicly before any price exists, or adding them would be worthless. The snapshot's provenance field is renamed `prereg_v3_commit` to match |


## Wiring the correlation-only test into the verdict, 25 November 2026

`hypothesis1()` computed only the registered v1 ratio until now, so the primary
test registered in PREREG_AMENDMENT_2.md section 3 existed in `js/hypothesis1.js`
as a measure but decided nothing. It now decides the headline verdict, and the
registered test is reported beside it exactly as tagged.

What the result looks like, in plain language. `hypothesis1()` returns two
labelled blocks rather than one set of numbers:

- `headline` — the correlation-only ratio R. Supported if the beginner median R
  is **strictly** below 0.60. R is reported for **both** sets: median, full
  distribution, share below the threshold, and the beginner-vs-control gap.
- `registered` — the 0.60 median ratio of effective risk sources to holdings,
  computed exactly as registered, with the 0.523 independence benchmark, a flag
  for whether the beginner median actually falls below that benchmark, the
  control median and the same gap.
- `verdict` is the headline one, repeated at the top because that is what the
  page leads with. `verdictsAgree` and `statement` cover section 5: if the two
  tests disagree the page says so in plain words and says which measures what.

Both blocks score the **same** 500 beginner and 500 control portfolios from one
`registeredSets()` draw at seed 2026. Nothing new is drawn, so nothing about the
tagged sampler moves.

| Decision | What was chosen | Why |
| --- | --- | --- |
| The result shape | **Two named blocks, `headline` and `registered`**, instead of keeping one `beginner`/`control` pair at the top level | Two different statistics now come out of the same portfolios. Leaving `result.beginner.median` to mean one of them, with the other bolted on, is how a reader ends up comparing the wrong number with 0.523. Each block names its own statistic and carries its own threshold |
| **The separation margin, 0.10** | A **reporting-only** constant, `SEPARATION_MARGIN`. The beginner median must sit at least 0.10 below the control median before the page says the measure told the two sets apart | Section 2 requires the page to say the measure "has not separated the two sets" when the medians come out close, but registers no number for "close". 0.10 is half the 0.20 span between the two calibration medians (0.503775 tight, 0.703964 diversified) — the same midpoint logic that fixed the 0.60 threshold. **It enters no verdict:** both verdicts are a median against its own threshold and nothing else, so this number cannot turn a "supported" into a "not supported". It decides one sentence. Committed before any price was downloaded |
| A universe member that never moves | **"not enough data" for the whole hypothesis**, naming the ticker | Section 3: R is undefined where there is no variance to divide by. Scoring the portfolios that happened to avoid that holding would quietly reshape the registered 500, which the section forbids |
| The leave-one-out loop | **One set of 13 reruns, two verdicts read out of it** | Section 6 applies the reruns to the new test "exactly as it applies to the registered one", so a drop that flips *either* verdict is named — including one that moves only the registered verdict while the headline survives all 13. Running the hypothesis twice per drop would double the work and let the two readings drift apart |

A test caught something worth recording. The 0.10 margin has a boundary, and the
boundary is mostly untestable: a gap of "0.10" is usually not a gap of 0.10 in
binary, because `0.5 - 0.4` is `0.09999999999999998`. The first version of the
test asserted the boundary with that pair and failed. The margin is checked with
a gap that subtracts exactly instead, and the test says why. This is the same
reason no *verdict* in this project is allowed to turn on a value landing exactly
on its cut-off — a margin that decides a sentence can afford a boundary, and a
verdict cannot.

`node --test "tests/**/*.test.js"`: **197 tests, all passing.** The published
threshold is unmoved — `node scripts/calibrate_threshold.mjs` still prints 0.60
from a midpoint of 0.603869. No price data was fetched, and none exists in the
repository.

Educational, not investment advice.

## Trimming VRT to its post-merger history, 25 November 2026

The first full fetch under `prereg-v3` returned 2,090 rows for VRT starting
2018-08-02, while `tickers.json` already marks VRT `full_history: false` for
the gap that creates. Before any hypothesis touched the snapshot, the pre-2020
rows were checked for what they actually are.

Vertiv went public via a SPAC merger (with GS Acquisition Holdings Corp), not
an IPO: the "VRT" rows before the merger are the SPAC shell trading near its
$10 trust value, not Vertiv's own stock. The 381 rows before 2020-02-07 in the
fetched data run $9.64–$12.78 with a mean of $10.11 — flat around $10, the
signature of an unredeemed SPAC trust, not an operating company's price. The
merger closed 2020-02-07; Vertiv's stock began trading as VRT on the NYSE on
the next trading day, Monday 2020-02-10.

| Decision | What was chosen | Why |
| --- | --- | --- |
| Where to cut VRT's history | **2020-02-10**, Vertiv's first trading day under the VRT ticker, not the 2020-02-07 merger-close date or the 2018-08-02 SPAC IPO date | yfinance returns one continuous price series under the VRT symbol reaching back to the SPAC's own IPO, because the ticker was reused rather than newly listed. Everything before the first post-merger trading day prices a shell, not Vertiv |
| Where the trim lives | **`scripts/fetch_data.py`**, as a `TICKER_TRIM_START` table applied to the downloaded series before the history report and before the snapshot is written, not a one-off edit to `data/prices.json` | A hand-edited snapshot would be silently overwritten by the next fetch and would not explain itself. The trim is reproducible and the reason travels with the code |
| Where the trim is recorded | A `trimmed` field in the snapshot JSON itself, naming the start date and the reason, alongside `prereg_v3_commit` | Anyone reading `data/prices.json` later should see that VRT's history was shortened and why, without having to find this log entry |

This is a data-cleaning decision, made by inspecting the prices themselves, not
by trying thresholds against a hypothesis result: no hypothesis has been run
against this snapshot yet, and none is run in this change.

Educational, not investment advice.
