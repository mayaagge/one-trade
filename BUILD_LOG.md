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

## First real-data run and review, 25 November 2026 (session 1.10)

Both hypotheses were run once against the real snapshot in `data/prices.json` -
the first time either has seen a real price. Nothing here changes a rule, a
threshold or a line of research code; this entry records what came out.

**Hypothesis 1.** The registered beginner median - the ratio of effective risk
sources to holdings, as PREREG.md defines it - came out at **0.327**, comfortably
below the **0.523 independence benchmark** published in PREREG_AMENDMENT_2.md
section 2. That matters: 0.327 clearing 0.60 is not just the flat-Dirichlet
weight effect the benchmark exists to catch (which alone would put the median
near 0.52), so the registered "supported" verdict is a real reading. The
headline test tells a different story. The beginner median correlation-only
ratio R came out at **0.773**, above the 0.60 headline threshold, so the
headline verdict is "not supported". The two tests disagree - exactly the case
PREREG_AMENDMENT_2.md section 5 anticipates - and the page has to say so in
plain words rather than lead with the more flattering reading.

**Hypothesis 2.** The registered benchmark, RSP, shows the AI basket's
correlation with the market **falling**, not rising, from the earliest 12
months to the most recent: a difference of **-0.0554** against the 0.10 rise
the claim needs, so "not supported". Reported beside it, not part of the
verdict, the same basket against the S&P 500 index (^GSPC) shows a rise of
**+0.2155** - on that benchmark alone the claim would read "supported". This is
the concrete case for why PREREG.md registered RSP, not the index, as the
verdict's benchmark: each AI stock is about 0.2% of equal-weight RSP, so a rise
there is not mostly the arithmetic fact that the AI stocks are already some of
the largest names in a cap-weighted S&P 500. The index number is real and is
reported, but it was never the registered answer, and choosing it after seeing
this gap would have been exactly the kind of after-the-fact pick pre-registration
exists to rule out.

**The log-return check,** recorded in docs/PRD.md's methods section: daily
simple returns are used everywhere in the code and on the page. After this
first run, the same four verdicts above - Hypothesis 1's headline and registered
tests, and Hypothesis 2 against RSP and against ^GSPC - were recomputed from log
returns instead, with no other change, and all four came out the same. Simple
returns are kept, because they are what a dollar amount in the game actually
does.

Educational, not investment advice.

## The research data step, 25 November 2026 (session 1.11)

Milestone 1's last Check clause needs Hypotheses 1 and 2 to come from real data.
They did in session 1.10, but from a throwaway script, so nobody - including me -
could re-derive the four numbers it reported. This step turns the snapshot into
returns properly, fixes the early window, uses one window per run, adds the three
things PREREG.md asks to be reported beside the verdicts, and commits a script
that reproduces the lot into `data/results.json`.

Tests first in every case, synthetic data for all the new logic, and four new
numpy known-answer fixtures so the new math is held to 1e-9 like the rest:
simple returns, the equal-weight basket, the growing basket and the rolling
126-day correlation. Every pre-existing number in `known_answers.json` is
byte-identical. **230 of 230 tests pass**, and
`node scripts/calibrate_threshold.mjs` still prints 0.60 from a midpoint of
0.603869, so the published threshold has not moved.

### What changed, and why

| Change | Why |
| --- | --- |
| New `js/returns.js`: prices to date-aligned simple returns | Lining tickers up by POSITION only works while every ticker traded on exactly the same days. It is now by date, and no date is assumed |
| It refuses a missing interior day, for **all 42 tickers**, after each ticker's own first date | A hole turns one day's return into two days' worth. VRT and PLTR are not exempt: their late start is registered, a hole in the middle of it would not be. Today's snapshot is clean - all 40 full-history tickers match `^GSPC`'s calendar exactly, and VRT and PLTR are exact subsets of it |
| `scripts/fetch_data.py` downloads from 2016-11-14, eight trading days before the window | A return on the window's first day needs the close from the day before, which sits OUTSIDE the registered window. Without it the earliest 12 months had 250 returns over 251 trading days. The window itself is untouched and is sliced in `js/returns.js`, from dates |
| One window per run in Hypothesis 1, not per portfolio | `alignReturns` used to take each portfolio's own overlap. A portfolio holding PLTR would then be scored over a different stretch of market history from the portfolio beside it, and the median of 500 would be a median across mixed periods. The overlap is now taken once across every name the sampler can draw. (In the game, where one portfolio is the whole run, per-portfolio overlap stays the right reading of the same PRD sentence.) It changed no number here, because every ticker already covers the full 756 days - but it was luck, not design |
| `growingBasket()` and `rollingCorrelation()` in `js/hypothesis2.js` | The two things PREREG.md asks to be reported beside the verdict. A member that has not listed yet is left out of that day's average, never counted as a zero return, which would drag the basket towards zero. Each rolling value is labelled with the LAST day of its window, so the marked 30 November 2022 means the 126 days ENDING then |
| `^GSPC` reported beside RSP, with the reason attached to the number | RSP stays the verdict's benchmark. The index result travels with the sentence explaining why it is not the answer |
| New `scripts/run_research.mjs`, writing `data/results.json` | One command reproduces every verdict, and the headline sentence is generated from the verdicts rather than written by hand, as the PRD asks |

### Yahoo's adjusted closes are not reproducible between fetches

Found when comparing the refetched snapshot against the committed one, before
replacing it.

35 of the 42 tickers came back different. The 7 that were byte-identical -
ADBE, AMD, AMZN, ANET, GLD, PLTR and `^GSPC` - are exactly the non-dividend
payers plus the index. Every dividend payer moved, by up to **1.2e-6 relative**,
and the ratio new/old varied row to row rather than being one constant factor,
so it was not the clean dividend re-adjustment I had expected.

It is not caused by the lead-in. Refetching **KO with the unchanged original
start date** disagreed with the committed snapshot on 1,731 of 2,513 days, by up
to 8.1e-7 relative:

```
start=2016-11-24   identical to the committed snapshot: 782/2513   worst 8.1e-7
start=2016-11-14   identical to the committed snapshot: 825/2513   worst 8.6e-7
```

The two fetches were 36 minutes apart, so no dividend was paid between them. The
likely cause is rounding in Yahoo's back-adjustment, which would differ per
request - but **that cause is inferred, not confirmed**: I did not read
yfinance's or Yahoo's arithmetic. What is measured is that the differences do not
track the start date, appear only in dividend payers, and sit at about 1e-6
relative.

**So the committed `data/prices.json` is the reference data.** Verdicts are
reproducible from that file, not from a fresh fetch. `scripts/run_research.mjs`
therefore reads only the committed snapshot - `--prices` was removed and errors
if passed - and records the snapshot's SHA-256 in `data/results.json`, so any
result can be matched to the exact bytes it came from. A rerun reporting a
different hash is a rerun on different data.

### The three-way comparison, before replacing the snapshot

Three runs: the committed snapshot (which reproduces session 1.10 exactly), the
refetched prices truncated back to the old start date (price differences alone),
and the refetched prices with the lead-in (price differences plus the day the
early window had been losing).

| Quantity | Old snapshot (1.10) | Price wobble only | + the lead-in day |
| --- | --- | --- | --- |
| H1 headline R, beginner median | 0.7727881369 | +1.1e-8 | 0 |
| H1 headline R, control median | 0.8443011078 | +3.0e-7 | 0 |
| H1 registered ratio, beginner median | 0.3265544235 | -1.2e-8 | 0 |
| H1 registered ratio, control median | 0.3811663035 | +2.4e-8 | 0 |
| H1 shares below threshold (29.4%, 92.8%) | - | 0 | 0 |
| H2 RSP, earliest 12 months | 0.5282729893 | -3.1e-6 | -9.1e-4 |
| H2 RSP, recent 12 months | 0.4729138847 | +3.8e-7 | 0 |
| H2 RSP, the rise | -0.0553591046 | +3.5e-6 | +9.1e-4 |
| H2 RSP, interval lower | -0.2650537367 | +2.3e-6 | -8.3e-3 |
| H2 `^GSPC`, the rise | +0.2154691152 | -1.6e-8 | +1.3e-3 |

**All four verdicts are identical in all three runs, and so are all 13
leave-one-out reruns.** The price noise is 100 to 1000 times smaller than the
window fix it arrived with, and Hypothesis 1 does not move at all at the
precision the page prints. The snapshot was replaced on that evidence, with the
reproducibility limit recorded here and in the PRD's methods notes rather than
discovered again later.

### What moved against session 1.10, and why

| Number | Session 1.10 | Now | Why |
| --- | --- | --- | --- |
| H1 headline R, beginner median | 0.773 | 0.773 | Unchanged. Every ticker already covered the full 756-day window, so the one-window fix moved nothing, and the price wobble is 1e-8 |
| H1 registered ratio, beginner median | 0.327 | 0.327 | Unchanged, same reasons |
| H2 against RSP, the rise | -0.0554 | -0.0544 | The earliest 12 months gained its first day, 25 November 2016. 250 returns became 251 |
| H2 against RSP, 90% interval | [-0.2651, 0.0442] | [-0.2733, 0.0520] | The same extra day. The interval moves more than the point estimate because the block bootstrap draws over a 251-day window instead of a 250-day one, so the whole resample sequence differs |
| H2 against `^GSPC`, the rise | +0.2155 | +0.2167 | The same extra day |

Nothing in that list changes a verdict. The registered benchmark still shows the
AI basket's correlation with the market **falling**, not rising, so Hypothesis 2
is still "not supported"; the index still shows a rise, and is still not the
registered answer.

### New numbers, with no session-1.10 counterpart

| Reported | Result |
| --- | --- |
| Growing basket vs RSP (adds names as they list) | rise -0.0404, interval [-0.2505, 0.0663], not supported. Its earliest 12 months is identical to the full-history basket's, because VRT and PLTR had not listed yet, so only the recent window differs |
| Growing basket vs `^GSPC` | rise +0.2203, supported on that benchmark, which is not the verdict's |
| Rolling 126-day correlation | 2,388 values per pair, 2017-05-26 to 2026-11-24. At the marked 30 November 2022: 0.8921 (full-history basket vs RSP), 0.8979 (growing vs RSP), 0.9320 and 0.9301 against `^GSPC` |
| Leave-one-out | No single drop flips any of the three verdicts |

### Decisions recorded

| Decision | What was chosen | Why |
| --- | --- | --- |
| Where the registered window is applied | **In `js/returns.js`, by date**, with `scripts/fetch_data.py` downloading a few days earlier | Keeps the registered boundaries exactly as PREREG_AMENDMENT.md states them while giving the first day the close it needs. The lead-in rows are never returns of their own |
| The lead-in length | **8 trading days** (from 2016-11-14) | One prior trading day is all the arithmetic needs; the rest is slack against holidays, and costs nothing because the window is sliced by date |
| Interior-day gaps | **Refuse, for all 42 tickers, after each ticker's own first date** | Your change to the plan. A hole in a short history is still a hole, and quietly spanning it would inflate one day's move and dent the correlation around it |
| Hypothesis 1's window | **One per run**, from `commonWindow()` across the whole universe | A median of 500 portfolios has to be a median over one window. Uneven input is now refused rather than trimmed, because trimming is what hid this |
| Which pairs get a rolling series | **All four**: both baskets against both benchmarks | The rolling series is reporting, not a verdict, and a reader comparing RSP with the index deserves the same picture for each |
| Which pairs get the leave-one-out reruns | **The registered pair only** (full-history basket vs RSP) | It is the only Hypothesis 2 combination that carries a verdict, and the reruns exist to test whether a verdict depends on one name |
| The reference data | **The committed snapshot, with its SHA-256 in `data/results.json`** | A fresh fetch is not the same data. Pinning the file and publishing its hash is what makes "reproducible" mean something |
| What the reruns keep in `data/results.json` | **Verdicts and medians, not the 500-value distributions** | PREREG.md asks for the full distributions of the baseline run, which are there in full, and of the reruns asks only whether a drop flips a verdict. Keeping all 13 distributions made the file 3.1 MB for nothing |

Educational, not investment advice.
