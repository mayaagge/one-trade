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

## The Research page, 25 November 2026 (session 2.1)

Milestone 2's first step: `index.html`, a stylesheet, and a Research page that
renders every verdict from `data/results.json`. The page does no arithmetic. It
reads the file `scripts/run_research.mjs` writes and prints what is in it, so it
cannot show a number the reproducible script did not produce. The provenance
strip at the bottom carries the snapshot's SHA-256, the freeze date and the
commit the run came from, so a reader can match the page to the exact bytes.

Also in this session: `actions/checkout` and `actions/setup-node` bumped to v5,
CI green.

**264 of 264 tests pass**, 34 of them new.

### What the page shows

| Section | What is on it |
| --- | --- |
| Headline | `results.headline`, generated from the verdicts, not written by hand |
| Hypothesis 1 | Both tests side by side: the headline correlation-only R (beginner median 0.773, not supported) and the registered ratio (0.327, supported), each with its control median, its share below threshold, its separation note and its limit. Then the disagreement panel, printing `hypothesis1.statement` in full, and the 0.523 independence benchmark and 0.10 separation margin, both labelled reporting-only |
| Hypothesis 2 | The registered pair (full-history basket vs RSP: 0.5274 to 0.4729, rise −0.0544, 90% interval [−0.2733, +0.0520], not supported), with the growing basket and both `^GSPC` results beside it, each carrying `benchmarkRole` and `benchmarkWhy` so the "supported" on the index never reads as the answer |
| The chart | The rolling 126-day correlation for the registered pair, 2,388 points, 30 November 2022 marked at 0.8921 as a reference date only |
| Hypothesis 3 | "collecting", with the no-control-group limit stated on the page as PREREG.md asks |
| Leave-one-out | All 13 reruns in a table, with the statement that no single drop flips a verdict |

### Decisions recorded

| Decision | What was chosen | Why |
| --- | --- | --- |
| Where the numbers come from | **`data/results.json` only.** `js/research.js` imports no maths module | Two code paths to one number is one code path too many. The page is a view of the reproducible run, and the test asserts every field it reads is present, so a regenerated file that drops a field fails CI instead of printing an em dash |
| The chart's library | **None.** Hand-written inline SVG in `js/chart.js`, geometry separated from drawing | The PRD asks for plain HTML, CSS and JavaScript. Splitting `niceScale`, `xOf`, `yOf`, `linePath` and `nearestIndex` out of the drawing means the geometry is testable under `node --test`, where there is no document |
| How the chart is sized | **The SVG box is the container's real width**, measured after mounting, not a fixed box scaled by CSS | At 500px a 720-wide viewBox scaled 11px axis labels down to about 7px. Sizing the box to the element keeps label text the same number of pixels on a phone as on a laptop. Narrow charts also drop from 6 x-axis labels to 4 or 3, because six dates collide |
| Which rolling series is drawn | **The registered pair only** (full-history basket vs RSP) | It is the only Hypothesis 2 combination carrying a verdict. The other three are in the file and their point estimates are on the page; four lines on one chart would imply four answers |
| Verdict colours | **Neither verdict gets a success or an error colour** | "supported" and "not supported" are both results. Painting one green and one red would say the game wanted an answer. Only "collecting" is marked, as waiting on data |
| The table view under the chart | **One row per calendar year, plus the first day, the marked date and the last day** | 2,388 rows is not a table anybody reads, and every value stays reachable by hover, by keyboard and in the file itself |
| Wide tables | **Their own horizontal scroller**, keyboard-focusable | The 13-row leave-one-out table has 7 columns and would otherwise widen the page on a phone |
| The default mode | **Research**, until Learn exists | Temporary. The PRD's main mode is Learn, and this flips as soon as session 2.3 lands |

### docs/PRD.md line 220 says 11 distinct results; the data says 12

The PRD's AI basket section says Hypothesis 2's "13 reruns contain only **11
distinct results**". The committed results give **12**, and 12 is right:

- 11 drops each remove a full-history member and give 11 different results.
- Dropping VRT or dropping PLTR reproduces the baseline exactly
  (difference −0.05444971283650357 in all three), which is a **12th** result,
  shared by those two rows.

11 is the number of drops that change the basket, not the number of distinct
results; the slip is subtracting both collapsed rows instead of one. The page
computes the count from the file rather than printing a literal, so it says 12
and cannot drift, and `tests/research.test.js` locks both the count and the
reason.

**Corrected in docs/PRD.md on 25 November 2026, at your instruction**, to read:
"11 of the 13 drops change the full-history basket; dropping VRT or PLTR
reproduces the baseline, so there are 12 distinct results." The pre-registration
files are untouched - the count is a description of the reruns, not a registered
test or a threshold, and PREREG.md never stated it.

### Checked by looking at it

The geometry tests do not catch label collisions, so the page was rendered in a
real browser and screenshotted at 1100px, 700px and 500px wide, in light and
dark mode, with the table view open and with a hover simulated. Three things the
tests had passed were wrong on screen and are fixed:

1. The last x-axis label read "2026-1". `text-anchor="end"` was set as an SVG
   presentation attribute, which the stylesheet's `.chart-tick-x` rule outranks.
   It is a class now.
2. Axis text was about 7px at 500px wide (the sizing fix above).
3. "labelled by the the last day of each window" - a doubled article, because
   `rolling.labelledBy` already begins with "the".

Headless Chrome clamps its window to 500px minimum, so a screenshot asked for at
390px is a 500px render cropped. The clipping that looked like a phone layout bug
was that crop; a `scrollWidth` check at 500, 700 and 1100 confirms nothing
overflows the viewport at any width.

Educational, not investment advice.

## Levels 1 to 3, 25 November 2026 (session 2.2)

Milestone 2 step 1: `levels.json`, the rules engine that applies it, the pool of
20 guess portfolios, and the at-least-3-winning-designs check. No round flow yet
- that is 2.3.

Every rule the game checks is data in `levels.json`, so an instructor or a
reviewer can read what a level demands without reading code. `js/levels.js`
holds no thresholds and no level text, only the logic that applies them, and it
touches no DOM and no prices.

**290 of 290 tests pass**, 26 of them new, and `node scripts/check_levels.mjs`
exits 0.

### The thresholds hold on real data

The PRD's thresholds were verified, not tuned: all three levels clear the
three-winning-designs bar as registered.

| Level | Pass rule | Winning designs found |
| --- | --- | --- |
| 1. Two of a kind | correlation >= 0.80 | **8 of 91 pairs** in the level's 14-name pool |
| 2. How many bets? | make a guess | every guess passes, as registered; the pool of 20 spans 1.100 to 2.966 effective bets |
| 3. Three real bets | >= 3 effective bets, 5 holdings | **17 of 1,199** distinct ticker sets at equal weights |

Level 1's winners are the lesson itself: VOO/VTI at 1.00, VXUS/VEA at 0.99,
VOO/QQQ and BND/LQD at 0.95, VTI/QQQ and BND/TLT at 0.94, TLT/LQD at 0.91,
XOM/CVX at 0.83. Level 3's winners spread across 4 or 5 groups
(`JNJ TLT GOOGL LQD COP` at 3.55), while AI-and-funds mixes sit near 1.1.

**Level 3 is hard on purpose.** Only 1.4% of random 5-holding sets clear 3 bets
at equal weights, and the median random set is 1.72. That is the level doing its
job - "spread risk across groups that really behave differently" is learning goal
4 - and a player free with the dollars does better than equal weights: the best
sets reach 3.6 to 4.6 bets on a better split.

### Two amendments to docs/PRD.md, both at your instruction

**1. Level 1's star rule.** The registered bands of "within 1" and "within 0.5"
are bands on a number of bets. Level 1's answer is a correlation between -1 and
1, where every guess is within 1 and nearly every guess is within 0.5. Level 1
now scores: 1 star for passing, 2 for naming the right "Same bet?" bucket (0.7
and above same bet, 0.3 to 0.7 partly, below 0.3 different bets), 3 for a guess
within 0.10. The buckets are the daily puzzle's, already in the PRD, rather than
new numbers. Every other level keeps the registered bands. No effect on
Hypothesis 3, which reads level 2's and level 7's bets guesses, not level 1's.

**2. A displayed number never disagrees with the pass check.** Your addition,
and the check script shows why it was needed: the nearest miss on level 1 is
**VTI + VXUS at 0.7997**. Rounded to 2 decimals that reads "0.80" beside a 0.80
threshold, and then fails. So `passes()` compares the unrounded value, and
`formatMeasure()` shows 4 decimals whenever a result is within 0.005 of its
threshold *or* would round to the threshold's own text. Two tests walk 401 values
across each threshold and assert that what the page would show, read back as a
number, always agrees with the pass check.

### A boundary bug the test caught

`starsFor()` scored a guess 0.82 against an actual 0.92 as 2 stars, not 3:
`0.92 - 0.82` is `0.10000000000000009`, and a bare `<= 0.10` rejects it. A player
who guessed exactly 0.10 off would have lost a star to binary floating point. The
bands now carry a `BAND_TOLERANCE` of 1e-9 and include their boundary, which is
the generous reading and the one the PRD's wording implies.

### Decisions recorded

| Decision | What was chosen | Why |
| --- | --- | --- |
| Where the rules live | **`levels.json`**, with `js/levels.js` holding only logic | The PRD asks for plain JSON "so instructors and reviewers can read every rule". A threshold in code is a threshold nobody checks |
| The pool of 20 | **Generated by `scripts/make_pool.mjs`, committed as data** | PREREG.md gives level 2 and level 7's first mystery portfolio one shared pool "so on average they are equally hard". That holds only if the pool spans a range, so the draw is stratified: one portfolio per 20th of the range between the 5th and 95th percentile of 600 candidates. The result is reviewable JSON, not a draw to be trusted |
| The pool's seed | **7, and explicitly not 2026** | Seed 2026 belongs to the registered Hypothesis 1 sampler and Hypothesis 2 bootstrap. A game pool borrowing it would blur what the registered seed covers. A test asserts the pool's seed is not 2026 |
| The pool's money | **Whole dollars in hundreds, out of 10,000** | It is what a player types, and integers sum to exactly 10,000, so no weight vector has to be checked for drift. Weights are derived, never stored |
| `expectedBets` in the file | **Stored, and recomputed in a test to 1e-9** | Useful to a reviewer reading the pool, dangerous if trusted. The game recomputes at play time; the test is what keeps the stored number honest |
| What counts as a "design" | **A distinct set of holdings**, scored at equal weights | Effective bets moves with the weights, so counting reweightings would make any threshold look passable. Equal weights makes the count a floor rather than a best case |
| Level 1's pool | **14 curated names** across funds, bonds, energy, banks and one AI stock | It needs several same-bet pairs and at least one instructive near miss. VTI/VXUS at 0.7997 is that near miss |
| Level 3's pool | **The whole ticker list** | Three real bets needs all nine groups available |
| The window | **756 days, 252 minimum, each portfolio's own overlap** | The PRD's reading for a single portfolio. Hypothesis 1's one-window rule is about medians over 500 portfolios and does not apply here |
| The weekly CI job | **Not built**, as you said | `check_levels.mjs` already exits non-zero on failure, so wiring it to a schedule later needs no rewrite |

Educational, not investment advice.

## Live game data, 25 November 2026 (session 2.3a)

The game now has its own price file. `data/prices.json` stays frozen and keeps
being the only thing the verdicts are computed from; `data/game.json` is the
most recent 756 trading days of daily returns, rebuilt every weekday evening and
committed only when it changed.

Session 2.3 was split at your instruction: 2.3a is the data pipeline (items 1 to
4 and 6), and 2.3b is the Research page's live chart extension (item 5).
docs/PRD.md now specifies that chart, which 2.3b builds.

### What was built

| File | What it does |
| --- | --- |
| `scripts/fetch_data.py` | Gained a `--live` mode: about 4 years ending today, into `data/live_prices.json`. The two modes cannot write each other's file - `--live` refuses `data/prices.json` and the frozen mode refuses the live path - so a cron job cannot overwrite the research snapshot by a mistyped argument. The prereg-v3 gate applies in both modes |
| `scripts/build_game_data.mjs` | Live prices to `data/game.json`. It calls `buildReturns()` from `js/returns.js` and does no return arithmetic of its own, so the game and the research apply one rule for date alignment, gaps and windows |
| `data/game.json` | 756 trading days, 42 tickers, one row per trading day. First build: 2023-11-21 to 2026-11-25, 428 KB |
| `.github/workflows/refresh.yml` | 23:30 UTC on weekdays, plus manual dispatch |
| `tests/gamedata.test.js` | 28 tests: the builder against `js/returns.js`, the precision measurement, the format, nine ways of refusing a broken file, staleness, and a guard that the frozen research data is untouched |
| `scripts/check_levels.mjs` | Gained `--prices`, so the weekday job can check the levels against the prices the game will actually be played on. The frozen snapshot never moves, so checking against it would never catch a level going unpassable |

The full suite is 318 tests and passes. `check_levels.mjs` against the live file
still finds 8 winning pairs for level 1 and 17 winning designs for level 3, with
VTI + VXUS at 0.7996 still the nearest miss.

### How much history a daily commit costs, measured

You asked for an estimate before the format was settled. I simulated 60 daily
versions by sliding the 756-day window forward one trading day at a time - the
real day-to-day change, one row appended and one dropped - committed each into a
throwaway repository, and measured the packed size.

| Layout | Raw | Gzipped | Marginal per commit | Per year (252 weekdays) |
| --- | --- | --- | --- | --- |
| Ticker-major, full precision | 690 KB | 296 KB | 1.53 KiB | 0.38 MB |
| Date-major, full precision | 694 KB | 298 KB | 1.01 KiB | 0.25 MB |
| **Date-major, 10 decimals (chosen)** | **437 KB** | **168 KB** | **0.88 KiB** | **0.22 MB** |
| Date-major, 8 decimals | 374 KB | 134 KB | 0.78 KiB | 0.19 MB |

**The history cost is not large, and my worry about it was wrong.** Git deltas a
sliding window almost perfectly: about 1.5 KiB per commit even on the layout I
had planned, so roughly 0.4 MB of packed history a year. The cost that is real
is the download - every player fetches this file - so the format was chosen for
the phone, not for the repository.

### Why 10 decimal places and not 8

CLAUDE.md rule 3 holds the browser maths to 1e-9 against numpy. Those tests feed
fixtures rather than game.json, so rounding here cannot break them directly, but
a game.json coarse enough to move a correlation by more than 1e-9 would make the
game disagree with the research code on the same window. Measured across the
level-1 pairs and two 5-holding portfolios:

| Decimals | Worst correlation drift | Effective-bets drift |
| --- | --- | --- |
| 8 | 1.2e-8 | 4.1e-8 |
| 9 | 2.1e-9 | 2.4e-10 |
| **10** | **8.5e-11** | **1.2e-10** |

8 and 9 both land at or above the 1e-9 bar; 10 sits an order of magnitude inside
it and still cuts the download 43%. Two tests in `tests/gamedata.test.js` hold
this: one asserts 10 decimals stays inside 1e-9, and one asserts that 8 does
not, so the format cannot be quietly shortened later without answering for the
measurement.

### The failure policy, as you specified it

Yahoo is unofficial and rate-limits (PRD weakness 5), so a failed evening is
expected rather than exceptional, and a red X every time it hiccups is a red X
nobody reads. So:

- **Transient**: 3 attempts, then warn, keep the previous `data/game.json`, stay green.
- **Integrity**: a gap inside a ticker's history, a missing ticker, a short
  window, a value that is not a number, a daily move of 50% or more, or a meta
  field that disagrees with the rows - nothing is written and the run goes red.
- **Stale**: more than 5 weekdays without fresh prices goes red, so a quiet
  multi-day outage cannot hide behind nightly warnings.
- **Levels**: `check_levels.mjs` runs after the commit, so a level dropping below
  3 winning designs goes red without withholding the day's prices from the game.
  Live prices moving the goalposts is PRD weakness 3; it is a levels problem to
  fix, not a reason to serve stale data.

### Decisions recorded

| Decision | What was chosen | Why |
| --- | --- | --- |
| Where the game's returns come from | **`js/returns.js`, called by the build script** | The game and the published research must apply one rule for date alignment, gaps and window slicing. A second implementation of that arithmetic is the thing most likely to make them disagree |
| The committed artefact | **`data/game.json` only**; the raw live download is gitignored | A megabyte of raw closes every evening would bloat the history for nothing, and the returns are what the browser needs |
| The layout | **One line per trading day**, with a `tickers` header naming the columns | A rebuild changes two lines out of 756, so the diff is readable and git stores a small delta. Ticker-major puts each ticker's whole series on one line, so every line changes every day |
| Precision | **10 decimal places** | Measured: inside 1e-9, and 43% smaller to download. See the table above |
| Timestamps in the file | **None at all** | The workflow commits only when the data changed. A generated-at field would change on every run, including market holidays when the data is identical, so every evening would look like fresh data. The commit dates the file |
| Which file the levels are checked against | **The live prices, after the commit** | The frozen snapshot never moves, so a check against it can never catch a level going unpassable as prices change |
| How the two price files are kept apart | **Refusals in both scripts**, not just in the workflow | `--live` refuses to write `data/prices.json`; the build script refuses to write `data/prices.json` or `data/results.json`; the workflow fails if anything but `data/game.json` appears in the diff. Three independent guards, because the frozen snapshot is the one thing in this repository that cannot be regenerated |
| Running the tests inside the refresh job | **Yes** | A push made with `GITHUB_TOKEN` does not trigger the Tests workflow, so without this the daily commit would be the one commit in the repository that nothing checked |
| Where the live tail of the chart is specified | **docs/PRD.md now, built in 2.3b** | Spec first, then build. The PRD is a specification, not a status report |

### What to watch

- The live tail of the rolling chart is nearly empty right now: the freeze date
  was yesterday, so there is exactly one trading day after it. 2.3b has to say
  "no trading days after the freeze date yet" rather than draw an empty band.
- GitHub disables scheduled workflows after 60 days of repository inactivity, and
  a push made by Actions does not always count. If the evening commits stop, that
  is the first thing to check.
- Yahoo's adjusted closes move by about 1e-6 between fetches for dividend payers
  (session 1.11), so the live and frozen halves of the chart will not join
  perfectly at the freeze date. 2.3b compares the two at that date and fails if
  they differ by more than 1e-4, which turns the known drift into a tripwire for
  a real fault.

Educational, not investment advice.

## The rolling chart's live tail, 25 November 2026 (session 2.3b)

The Research page now draws the one chart docs/PRD.md allows to move: the rolling
126-day correlation of the full-history AI basket with RSP continues past the
freeze date on live prices from `data/game.json`. Everything else on the page is
still read from `data/results.json`, and no verdict reads the tail.

### What was built

| File | What it does |
| --- | --- |
| `js/liveRolling.js` | Reads `data/game.json`, computes the rolling values for windows ending after the freeze date with the same `equalWeightBasket()` and `rollingCorrelation()` the verdicts used, and appends them to the frozen series. Returns a status - `band`, `one-day`, `none` or `unavailable` - and the sentence to print |
| `js/chart.js` | Gained `shadeRect()` and an optional `live` spec: the band, a dashed boundary rule at the freeze date, the label, and a tooltip that says "live, enters no verdict" on a live reading |
| `js/research.js` | Loads `data/game.json` beside `data/results.json`, draws the joined series, lists every live day in the table view with a "Half" column, and no longer claims the page "computes nothing" |
| `index.html` | The footer now names both price files and says the live part enters no verdict |
| `tests/liveRolling.test.js` | 23 tests: the tail's arithmetic, the frozen half being untouched, the join, the three length cases and five ways of refusing a broken file |

The full suite is 346 tests and passes.

### The two halves are checked where they meet

The window ending on the freeze date has a value in both halves, which makes the
join a measurement rather than an assumption. Measured on the committed files:
the live half gives 0.4556382612 where the published series has 0.4556382614, a
gap of 2.4e-10, which is `data/game.json`'s 10-decimal rounding and nothing else.
The page refuses the whole tail above 1e-4, as session 2.3a registered, and the
test also holds today's figure to the project's 1e-9. A wrong basket, a wrong
benchmark or a misaligned calendar all show up here as a gap far above either
bound, and the chart then stops at the freeze date and says why.

**The 1e-9 half of that was wrong, and was removed in session 2.5a below.** It
held a two-fetch comparison to a one-fetch bar.



### Why one live day gets a sentence and not a band

The freeze date was yesterday, so there is exactly one trading day after it. A
band for it would be 0.28 px wide beside ten years of frozen history - invisible,
and impossible to hover. So two or more days get the shaded band, and the empty
and one-day cases get a plain sentence that names the date and the value instead.
`shadeRect()` is tested at both ends: it starts on the freeze-date point, so no
frozen value is ever inside the shading, and it stops exactly on the plot's right
edge.

### Decisions recorded

| Decision | What was chosen | Why |
| --- | --- | --- |
| Where the live tail is computed | **In the browser, by `js/liveRolling.js`** | The alternative is a second results file rebuilt every evening, which would put a computed number next to the frozen verdicts in the same file. The tail enters no verdict, so it does not need to be reproducible from a tag |
| Which functions compute it | **`equalWeightBasket()` and `rollingCorrelation()` from `js/hypothesis2.js`** | The halves have to be one measure. A second implementation of the same arithmetic is the thing most likely to make them disagree |
| When the two halves disagree | **Drop the tail, draw the frozen series, say why** | A chart that silently joins two different measures is worse than a chart that stops at the freeze date |
| A missing or broken `data/game.json` | **Costs the chart its tail, not the page** | The verdicts do not depend on that file. `loadGameData()` returns null rather than throwing, and the status carries the reason |
| One live day | **A sentence, not a band** | At 0.28 px nobody can see or hover it, and an invisible band labelled "after the freeze date" would be a claim the chart does not actually show |
| The boundary rule's style | **Dashed, where the marked reference date is solid** | Two vertical lines on one chart mean two different things, and the ChatGPT marker was there first |

### What to watch

- The band stays a sliver for months: 20 live days is about 5 px of a 664 px
  plot. The sentence under the chart carries the numbers until then, and the
  table view lists every live day, so nothing depends on seeing the band.
- The join check needs a row for the freeze date in `data/game.json`. That file
  holds 756 trading days, so the row ages out in about three years, and the tail
  then refuses itself with "no row for the freeze date". That is the honest
  answer, but a rebuild of the chart's provenance would be the real fix.
- `js/research.js` draws the frozen series for the three reported-only
  combinations and the live tail only for the registered one, which is what
  docs/PRD.md specifies. If a reader asks why only one chart moves, that is why.

Educational, not investment advice.

## The build, guess, reveal round, 25 November 2026 (session 2.3c)

Milestone 2 step 2: levels 1 to 3 are playable. A player picks holdings, splits
$10,000, commits to a guess, and then sees the answer worked out from
`data/game.json`. The game never opens `data/prices.json`.

**427 of 427 tests pass**, 81 of them new, and `node scripts/check_levels.mjs`
still exits 0. The refresh workflow was replayed on a clean clone - rebuild,
tests, the "only data/game.json may change" check, the commit step and the level
check - and passes on both paths, the evening where the data is unchanged and the
evening where it is not.

### What was built

| File | What it is |
| --- | --- |
| `js/gameView.js` | The game's reader for `data/game.json`: a ticker's column, the dates, and `gameWindow()`, which is `commonWindow()` from `js/returns.js` over the row-per-day layout |
| `js/round.js` | One round as a state machine - build, guess, reveal - with no DOM in it. Every rule comes from `levels.json` through `js/levels.js` |
| `js/game.js` | The screens. Phone first: one column, 44px controls, no typing anywhere |
| `tests/gameView.test.js`, `tests/round.test.js`, `tests/game.test.js` | 75 tests |
| `js/liveRolling.js` | Now imports the two row-readers from `js/gameView.js` and re-exports them, so one file reads that layout |
| `js/app.js`, `css/style.css` | `#learn` mounts the game; the stylesheet gains the game's styles |

Four things the round refuses, each of them something a player or a caller can
actually do: revealing before a guess, revealing a build the level did not ask
for, a guess outside the level's own range, and a window shorter than
`levels.json`'s 252-day minimum.

### The number is checked against code that already existed

The round's whole chain - dollars to weights, window, matrix orientation,
covariance, effective bets - is checked by replaying all 20 pool portfolios and
holding each to the `expectedBets` committed in `levels.json`, which
`scripts/make_pool.mjs` computed by a different path. All 20 agree to 1e-9.

`gameWindow()` is held to `commonWindow()` **exactly**, not to 1e-9, by slicing
a game document built at full precision. That separates the two questions: does
this file slice the right days (exactly, yes), and what does the file format's
rounding cost (below).

### 10 decimal places was not inside 1e-9, so the file is 12 now

Session 2.3a chose 10 decimals on a measurement over the level-1 pairs and two
equal-weight 5-holding portfolios, where the worst effective-bets drift was
1.2e-10. Over **400 random portfolios of 2 to 5 holdings at random weights**, 10
decimals moves a bets count by up to **2.0e-9** (UNH + WMT + GLD), with 2 of the
400 at or above 1e-9, and moves a level-1 correlation by up to 1.0e-9
(BND + CVX). The earlier figure was not wrong, it was narrow: the drift depends
on the portfolio, and equal weights are the kind case.

`data/game.json` is therefore rebuilt at **12 decimals**, where the worst drift
over the same wide sample is **1.8e-11**. The guard in
`tests/gamedata.test.js` now measures over that wide sample rather than over two
portfolios, and asserts both directions: 12 decimals is inside 1e-9, and 10
decimals is not. The one-step-shorter test used to name 8 decimals; it names 10
now, because 10 is what the file used to hold and what a future change to save
bytes would reach for first.

| Decimals | Worst correlation drift | Worst bets drift, wide sample | File, gzipped |
| --- | --- | --- | --- |
| 10 | 1.0e-9 (BND + CVX) | 2.0e-9 | 167 KB |
| **12** | **3.9e-12 (VEA + LQD)** | **1.8e-11** | **199 KB** |

The cost is 61 KB raw and 32 KB gzipped on a file every player downloads. That
is the price of CLAUDE.md rule 3, and worth paying: the alternative was a game
that disagreed with the research code on the same window by more than the
project says it may.

Nothing here moved a verdict. Every published number comes from
`data/prices.json` at full precision, and `data/results.json` is untouched.

### The guess slider shows nothing until it is touched

The number was already hidden until the first move. The thumb was not, and its
resting position in the middle of the track - with the filled blue track beside
it - is a weaker anchor than a number but still an anchor. So before the first
tap the control is a bare grey line: no thumb, no fill, no number, and Reveal
disabled.

The first tap anywhere on the line sets the guess where it landed. That is a
range input's own behaviour, not a click handler of ours, which matters because a
handler would have to decide what a tap near the end means and would then
disagree with dragging. Confirmed with a real mouse event through Chrome's
DevTools protocol, not a synthetic one: a tap 25% along the track set the guess
to -0.50, showed it, dropped the blank styling and enabled Reveal.

`guessSliderState()` is where this lives, and it is a function of the round
alone - no document - so the behaviour is tested in node. Six tests cover it,
including the two cases a "has the thumb moved?" check would get wrong: a tap
that lands exactly on the midpoint is a guess, and a redraw of the same screen is
not an interaction.

### Decisions recorded

| Decision | What was chosen | Why |
| --- | --- | --- |
| Level 1 has no money step | **Pick two names, no allocation** | A correlation between two holdings is the same number whatever the split, so asking for one would be taps that change nothing. The PRD's challenge for the level is "pick two holdings", not "build" |
| The guess slider starts blank | **No number, no thumb and no filled track, and Reveal disabled, until the first tap** | Your instruction, and the PRD's reason: "Predicting and then being corrected is the main learning moment." A number already on screen is a number to confirm without thinking, and the thumb's resting position is the same thing more quietly |
| How the first tap is caught | **The range input's own behaviour, no click handler** | A handler would have to decide what a tap near an end means, and would then disagree with dragging. The native control already puts the value where the finger landed |
| Returns in `data/game.json` | **12 decimal places, not 10** | 10 was measured on two equal-weight portfolios and does not hold at 1e-9 for 400 random ones. 61 KB raw is the price of CLAUDE.md rule 3 |
| Level 3's starting split | **Even, in whole $100 steps** | Your instruction. Five holdings divide exactly; three give 3,400/3,300/3,300, which is what a player would type |
| How the money moves | **- and + buttons, $100 a tap, total pinned to $10,000** | No keyboard on a phone. The difference is taken from the largest other holding, and no holding is ever taken below $100 - a 5-holding portfolio with a zero in it is a 4-holding portfolio |
| Which pool portfolio was drawn | **Kept on the round, and in the in-memory session** | Your instruction, so level 7 can exclude it later. Level 7 would otherwise be measuring a player's memory rather than their learning |
| The draw itself | **Uniform over the 20, `Math.random` injected** | PREREG.md gives level 2 and level 7's first portfolio one pool "so on average they are equally hard", which holds only if the draw is uniform. Tests pin it |
| Progress | **In memory, lost on reload** | As you specified. Browser storage is Milestone 2 step 7 |
| The "Why?" card | **Not this session** | It is Milestone 2 step 3 - the rule-based templates. The reveal shows the level's own `explain` and `why` text from `levels.json`, which is step 2's "explain" |
| The file is `js/gameView.js` | **Not `js/gameData.js`** | macOS filesystems are case-insensitive, so `tests/gameData.test.js` and the existing `tests/gamedata.test.js` would be one file. It cost the pipeline test once already |
| What `js/game.js` exports | **The decisions, not the nodes** | No jsdom (CLAUDE.md rule 8), so the slider step, the stars explanation and the session are exported and tested in node; the screens are checked in a browser |

### Checked in a browser, at 390px

Driven end to end in headless Chrome inside a 390px frame, on the live
`data/game.json`:

- Level 1, VOO + VTI: **1.00**, clears 0.80, 3 stars on a guess of 0.95.
- Level 1, VTI + VXUS, the near miss: **0.7996**, shown to 4 decimals, "misses
  the 0.8000 needed", no stars. The screen cannot read as a pass.
- Level 2 dealt p19 (INTC, GLD, XOM, VTI, COP): **2.87 bets**, 2 stars on a
  guess of 2.0, and the id reached the session.
- Level 3, JNJ + TLT + GOOGL + LQD + COP: even $2,000 each, two + taps moved JNJ
  to $2,200 and took $100 each from TLT and GOOGL, total still $10,000;
  **3.50 bets**, clears 3, 3 stars on a guess of 3.5.
- Before any tap: a bare grey line with no thumb and no filled track, an em dash
  where the number goes, and Reveal greyed out. A real tap 25% along the line,
  dispatched through the DevTools protocol, set the guess to -0.50 and enabled
  Reveal.
- `document.documentElement.scrollWidth` equals `innerWidth` at 390px: no
  sideways scrolling on a phone.

### What to watch

- **Level 3's picker is long.** All 38 names across 9 groups, so the money and
  the Next button sit well below the fold on a phone. It is the level that needs
  the whole list, but it is the first thing to watch in a playtest.
- **Whether a blank line reads as a control.** The thumb is gone until the first
  tap, which removes the anchor but also removes the usual hint that a slider is
  a slider. The line is 44px tall and the sentence under it says to tap, but this
  is the first thing to watch for a player who stalls on the guess screen.
- **Level 1's "why" text is generic.** It talks about an S&P 500 fund and a
  total-market fund whatever pair the player picked. That is the gap the "Why?"
  cards fill in Milestone 2 step 3.
- **The measures move with the prices.** `data/game.json` is rebuilt every
  weekday evening, so the numbers above are Wednesday's, not constants. That is
  why `tests/round.test.js` plays against a document built from the frozen
  snapshot: the live file would make every assertion a moving target.

Educational, not investment advice.

## The "Why?" cards, 25 November 2026 (session 2.4)

Milestone 2 step 3: after each reveal, one card names the specific cause of the
number the player just saw. `docs/PRD.md` puts the cards in Tier 1 and gives the
reason they are built this way rather than with a language model - "template text
cannot invent wrong answers" - so nothing in the code writes a sentence. Every
sentence a player can read is a template in `why.json`, and the code only decides
which template applies and fills in its named placeholders.

**468 of 468 tests pass**, 41 of them new, and `node scripts/check_why_cards.mjs`
exits 0.

### What was built

| File | What it is |
| --- | --- |
| `why.json` | The templates, the lead-in lines, the thresholds and the order, with a note on every threshold saying what it is and why that number. No code in it, and no code outside it writes a sentence a player reads |
| `js/why.js` | Which template applies, and the facts it is allowed to look at. Pure - no DOM, no fetch, no prices |
| `tests/why.test.js` | 41 tests: the numbers against numpy, the rules, the order, the fallback, all three of level 1's buckets, all four lead-ins, the lesson portfolios, and the mechanical check that no prose is generated |
| `scripts/check_why_cards.mjs` | The frequency table, reproducible, plus the lesson portfolios as a check that exits non-zero when one gets the wrong card |
| `js/round.js` | `reveal()` now returns `whyCard` and `whyFacts`; `measureFor()` hands back the window matrix so the card reads the same window the measure was taken over |
| `js/game.js`, `css/style.css` | Loads `why.json`, passes the group index into the round, and renders the card between the stars and the level's general explanation |

### Level 1 takes a different path, and that was your call

Level 1 asks for two holdings and splits no money, so the two risk-share rules
would describe a split the player never chose. It gets a correlation card
instead: one template for each "Same bet?" bucket in `levels.json`, keyed by that
file's own bucket keys. The four rules are for levels 2 and 3.

`js/why.js` does not hard-code the bucket names. `PLACEHOLDERS.bucketCard` covers
every entry in `bucketCards` whatever `levels.json` calls them, and a test asserts
the two files carry the same set, so neither can drift from the other.

This also closes the gap the last session left open. Level 1's `why` text in
`levels.json` talks about an S&P 500 fund and a total-market fund whatever pair
the player picked; the card names the pair they actually picked.

### The thresholds were measured, not guessed

The first draft - one group holding 50% of the risk, a pair at 0.70, a 15-point
gap either way - was run over 420 portfolios on the frozen snapshot: all 20 pool
portfolios and 400 random 5-holding level 3 builds. The group card won 73% of
them. A player would have read very nearly the same sentence every round, and
"most of the risk" is a weak claim when a 5-holding portfolio spans only two or
three groups anyway.

Share of the 420 portfolios each card is shown on, as the group threshold moves:

| group risk at least | groupRisk | pair | riskGapOver | riskGapUnder | fallback |
| --- | --- | --- | --- | --- | --- |
| 0.50 (first draft) | 73% | 9% | 12% | 2% | 5% |
| 0.60 | 55% | 14% | 21% | 3% | 6% |
| 0.65 | 45% | 17% | 27% | 4% | 7% |
| **0.70 (chosen)** | **38%** | **20%** | **22%** | **7%** | **13%** |
| 0.80 | 23% | 24% | 40% | 4% | 9% |

**This table was measured with the sampler as it then was, and that sampler was
broken.** It drew from a universe that included `^GSPC` and `RSP`, which are
benchmarks and not holdings, and silently dropped every draw that failed because
of it - 49 of the 400. The shares above are therefore over a smaller sample than
the header claims. The table is left as it was measured rather than rewritten,
because it is the record of how 0.70 was chosen; what the chosen row reads today
is in "What to watch" below. The lesson is recorded separately: a silent `catch`
cost a threshold table.

All five cards appear across the 20 pool portfolios alone at the chosen
thresholds: 7 group, 5 risk-gap-over, 4 pair, 3 fallback, 1 risk-gap-under.

### The two risk-gap thresholds differ, and the reason is arithmetic

`riskGapOver` asks for 20 points and `riskGapUnder` for 15. That is not a
preference. The risk shares sum to 1 and the dollar shares sum to 1, so the gaps
sum to 0: a holding 20 points under its dollar share puts other holdings over,
and `riskGapOver` comes first in the order. Held to the same 20 points, the
under card never appeared at all in the 420 portfolios. At 15 it appears in 7%,
which is the bond-fund lesson getting shown occasionally rather than never.

`tests/why.test.js` pins this on a numpy fixture rather than describing it:
`five_mixed` has a 15.6-point gap under and a 15.1-point gap over, so it is the
case where the under card is the only one that fires.

### The card cannot disagree with the panel beside it

On level 1 the pair's correlation IS the pass-checked number. VTI and VXUS
correlate a hair under the 0.80 threshold, which `js/levels.js` already shows to
4 decimals so the panel cannot read as a pass. The card formats that number
through the same `formatMeasure()` against the same threshold, or the screen
would say 0.7996 in one place and 0.80 in another about whether the level was
passed. A test plays that pair and asserts the two strings are equal, without
hard-coding the number: it is a near miss on the frozen snapshot and a near miss
on the live file too, but not the same hair.

### No generated prose, checked mechanically

- `fillTemplate()` throws on a placeholder with no value, so `{a}` cannot reach a
  player, and on a value no placeholder uses, which means the caller and the
  template disagree about what the card says.
- `validateWhy()` throws at load on a template using a placeholder nothing can
  fill, on a rule key the code cannot apply, and on a rule left out of the order,
  which could otherwise never be shown.
- A test asserts, for every one of the 20 pool portfolios, that the text shown
  equals its own template with the values put back in. That is what "no generated
  prose" means in practice: nothing is concatenated, reworded or appended
  anywhere in the pipeline.

### Decisions recorded

| Decision | What was chosen | Why |
| --- | --- | --- |
| Level 1's cards | **One per "Same bet?" bucket, keyed by `levels.json`** | Your instruction. No money is split on level 1, so a risk-share card would describe a choice the player never made |
| How many cards per reveal | **One** | `docs/PRD.md` has the card "name the specific cause", singular. On a phone, one cause a player can carry away beats three they skim |
| Where the card sits | **Above the level's general explanation, which is now headed "The idea"** | The card is about this portfolio; the text under it is the lesson behind it. Two headings both reading "Why" would have been worse |
| The group threshold | **70% of the risk, up from the 50% first drafted** | Measured, not guessed: at 50% the group card won 73% of 420 portfolios. The table above is the evidence |
| The two gap thresholds | **20 points over, 15 under** | The gaps sum to zero, so an under-gap always competes against an over-gap on the same portfolio. At a shared 20 the under card never appeared |
| The pair threshold | **Left at 0.70** | It is the "same bet" edge `levels.json`'s buckets and the daily puzzle already use. One number meaning one thing across the game beats a balanced table |
| The pair rule's second condition | **The pair must carry at least 20% of the portfolio's risk** | Your instruction. 20% rather than the 35% the mostly-bond portfolio needed, because 35% costs 49 of 76 pair cards including VEA and VXUS at 0.99 |
| How the pair is chosen | **Still the most correlated pair, before any thought about risk** | The template says "the closest pair you hold". A pair picked for its risk share would make that sentence false |
| The pair that carries little risk | **Demoted to its own template, not dropped** | Your instruction. Two of the ten cards the condition removed had fallen to the fallback, and a 0.94 pair reading "nothing stands out here" is not an improvement |
| Where `pairLowRisk` sits | **Last, after the risk-gap rules** | Anywhere earlier and it hands back every card the condition took away |
| The mostly-bond portfolio | **Keeps its pair card, recorded as a decision** | The case worth keeping (VEA/VXUS at 30%) carries less pair risk than this one (33.9%), so no threshold separates them |
| Level 2's lead-in | **Reports on the guess - close, or wide of it - not on passing** | Your instruction, and the level has no portfolio to pass or miss. Picked from `pass.measure`, not from a level number, so level 7 inherits it |
| What "close" means | **`stars >= 2`, the level's own two-star band** | The line sits under the stars it describes. A second copy of "within 1 bet" could drift from the first |
| The lesson portfolios | **Five, in the script, checked by both the script and the tests** | A random sample missed the five-AI-stocks bug entirely. The cases that carry the lesson have to be named |
| A negative share of risk | **Falls through to the next rule** | A holding that offsets the rest is a real thing a portfolio can do, but it is a different lesson from steadiness, and it has no template. Better no card than the wrong one |
| `why` and `groups` on `createRound` | **Optional** | A round without a card is still a valid round - the card is a reveal screen feature - and `js/round.js` stays testable on its own |
| Where the matrix goes | **Returned by `measureFor()`, used by `reveal()`, not stored on the result** | The card has to read the same window the measure was taken over. A 756-by-5 array does not belong on something every screen holds |

### Checked in a browser, at 390px

Driven end to end in headless Chrome inside a 390px frame, on the live
`data/game.json`:

- Level 1, VOO + VTI: the "same bet" card, "VOO and VTI move together almost
  every day, at 1.00. Two different names, and very nearly the same bet."
- Level 3, JNJ + TLT + GOOGL + LQD + COP: **3.56 bets**, 3 stars, "You passed.
  One thing to notice:" and the card "TLT and LQD are the closest pair you hold,
  at 0.91." Two bond funds inside a portfolio that passed - the card tells a
  player what to improve next.
- Level 3, five AI stocks: **1.03 bets**, "Here's what held you back:" and the
  group card naming all five. This is the round that found the `minGroups` bug.
- Level 1 shows no lead-in line at all.
- Level 2, dealt p17 at 2.68 bets: "Close guess. One thing to notice:" and the
  demoted pair card, "QQQ and VTI move together, at 0.94, but between them they
  are only 13% of your risk."
- Level 2, dealt p16 at 2.58 bets and guessed close: two stars and "Close guess.
  One thing to notice:". Dealt p03 at 1.30 and guessed wide: one star and
  "Here's what made this one tricky:". The line matches the stars above it in
  both, which is the thing that could have gone wrong.
- The card heading reads "Why?" and the section under it "The idea".
- `document.documentElement.scrollWidth` equals `innerWidth`: no sideways
  scrolling, with the card 358px wide inside a 390px frame.

### The result lead-in, and a bug the browser found

A card on levels 2 and 3 now opens with one line saying how the round went -
"You passed. One thing to notice:" or "Here's what held you back:" - from
`why.json`'s own `leadIn`. Level 1 takes none: its reveal panel already gives the
verdict and the bucket line under it gives it again.

It is a SECOND TEMPLATE, not a prefix. The two strings travel to the screen
separately and render as two lines, and nothing joins them, because a string
built out of two templates is this code writing a sentence. The test that holds
the card text to its own template would also have had nothing left to hold.

**Level 2 reports on the guess, not on passing.** `levels.json` gives it
`pass.measure: "guess"`, so every level 2 round passes by design, and "You
passed" on a level nobody can fail says nothing. It gets its own pair of lines
instead - "Close guess. One thing to notice:" and "Here's what made this one
tricky:" - and `leadInKey()` in `js/round.js` picks the pair from the level's own
pass rule, so this is a property of what a level checks rather than a list of
level numbers. Level 7's mystery portfolios will be the same shape and will get
the same treatment without a change.

Close is read as `stars >= 2`, the level's own two-star band, and not recomputed
from a threshold of its own. `levels.json` words that band as "within 1 bet", and
the line sits directly beneath the stars it describes: a second copy of the
number could drift from the first and have one line of the screen contradict the
line above it. A test walks seven guesses across every one of the 20 pool
portfolios, including the exact boundary - one bet above the real answer, where
a bare `<=` would reject 1.0000000000000002 - and asserts the line and the stars
agree every time.

Driving the page to check the two lines turned up a real fault, and in the worst
place. **Five AI stocks - NVDA, AMD, AVGO, MU, ANET - make 1.03 bets, the lesson
this whole game is named after, and the card read "Nothing stands out here."**

The cause was `minGroups: 2` on the group rule. It was written to keep the card
off a portfolio that is all one group, on the reasoning that "one group holds
100% of its own risk" is arithmetic rather than a lesson. That reasoning is right
for TWO holdings, and two holdings is level 1 - which takes the bucket path and
never reaches these rules. What the guard actually did was silence the card on
the single most concentrated portfolio a player can build. It is now
`minGroups: 1`, and the card reads "5 of your 5 holdings are AI stocks. They are
100% of your money and 100% of your risk..."

The group template's tail changed with it. It used to end "they are doing most of
the work", which understates the case when the answer is all of it; it now ends
"that is where this portfolio's fortunes are decided - and where the damage lands
on a bad day", which reads at 100% and at 71%.

Two things worth keeping from how this was found. The 420-portfolio frequency
table did **not** catch it - the frequencies are identical before and after the
fix, because not one of 400 random 5-holding builds drew all five from a single
group. A player picking five AI stocks on purpose is not a random draw, and that
is the whole point of level 3. And a test now pins the case by name, asserting
both the card it gets and the sentence it must not contain.

### The lesson portfolios, and why a random sample was not enough

`scripts/check_why_cards.mjs` now carries five hand-picked portfolios, each one
the plainest statement of a thing the game teaches, with the card it has to get
written down beside it. The script exits non-zero when one gets a different card,
and `tests/why.test.js` runs the same list, so CI catches it on every push.

| Portfolio | The lesson | Card |
| --- | --- | --- |
| Five AI stocks | Different tickers, the same bet | `groupRisk`, "5 of your 5 holdings are AI stocks" |
| Three bond funds (BND, TLT, LQD) | Safe holdings are one bet when they are all the same kind of safe | `groupRisk`, naming Bonds and gold |
| An index fund and a tech fund (VOO, QQQ) | Two funds, hundreds of names, one bet | `pair` at 0.95, and the "same bet" bucket card on level 1 |
| $9,000 of BND and $1,000 of NVDA | A holding's share of risk is not its share of the money | `riskGapOver`: 10% of the money, 58% of the risk |
| Three bond funds and $1,000 of NVDA | The order genuinely decides the card | `pair`, because BND and LQD correlate at 0.95 |

The last one is in the set on purpose, and it is the one worth arguing about. It
is the same lesson as the row above it - NVDA is 10% of the money and 38% of the
risk - but three bond funds beside it put a 0.95 pair in the portfolio, and the
pair rule comes first. Both cards are true; the player sees the pair. If that
reads as the wrong priority in a playtest, the order in `why.json` is one line.

**The reason the set exists is the `minGroups` bug above.** The 420-portfolio
frequency table was identical before and after that fix, because not one of 400
random 5-holding draws took all five from a single group. A player picking five
AI stocks is not a random draw - it is what level 3 is for - so the portfolios
that carry the lesson are now named rather than hoped for.

The script also makes the frequency table reproducible, which it was not before:
it had been computed in a scratch file. It uses this project's own seeded
generator from `js/rng.js` rather than a hand-rolled one, so the numbers come
back the same on any machine. On seed 23 they are 35% group, 25% pair, 23%
risk-gap-over, 5% risk-gap-under and 11% fallback - the same shape as the table
that set the thresholds, from a different sampler.

### The pair rule now asks whether the pair matters, and a bug in the check

A pair of bond funds correlated 0.94 that is 5% of what moves a portfolio is a
true sentence about a corner of it, and saying it crowds out what is actually
driving the number. So the pair rule gained a second condition: the two holdings
have to carry at least **20% of the portfolio's risk** between them.

**The pair is still chosen for its correlation, before any thought about risk.**
The template says "the closest pair you hold", and a pair picked for its risk
share instead would make that sentence false. The risk share decides whether the
card is worth showing, not which pair it is about.

Measuring this first turned up **a bug in `scripts/check_why_cards.mjs` itself**.
It sampled from `game.tickers`, which carries the two benchmarks - `^GSPC` and
`RSP` - as well as the holdings. Neither is in a `tickers.json` group, so
`whyFacts()` threw on them, and the throw was caught by the loop that skips
builds with too short a window. 49 of 400 draws were being dropped and reported
as late listings. It now draws from the 40 tickers a player can actually hold,
the way `js/game.js` builds the game's universe, and nothing is skipped at all.
The frequency table in the previous section was measured before that fix; the
corrected baseline is 43% group, 18% pair, 24% over, 6% under, 9% fallback.

### Why 20%, when the portfolio that prompted it needed 35%

The portfolio that started this is the fifth lesson portfolio: three bond funds
and $1,000 of NVDA, where NVDA is 10% of the money and 38% of the risk, and the
card talks about BND and LQD instead. Its pair carries **33.9%** of the risk, so
reaching it needs a threshold around 35%.

At 35% the pair rule loses **49 of its 76 cards** in the 420-portfolio check, and
five of those name a pair correlated 0.95 or higher - including **VEA and VXUS at
0.99, three times**. Two funds that are nearly the same fund is the clearest
statement this game has of its own lesson, and at 35% each of those rounds would
have read "nothing stands out here".

And it cannot be tuned around. **The case worth keeping carries less pair risk
than the case worth dropping**: VEA/VXUS at 30%, BND/LQD at 33.9%. No threshold
on this measure separates them, which is the whole finding.

| pair risk at least | groupRisk | pair | riskGapOver | riskGapUnder | pairLowRisk | fallback |
| --- | --- | --- | --- | --- | --- | --- |
| no condition | 43% | 18% | 24% | 6% | - | 9% |
| **20% (chosen)** | **43%** | **16%** | **26%** | **6%** | **0.5%** | **9%** |
| 30% | 43% | 9% | 30% | 6% | - | 12% |
| 35% | 43% | 6% | 32% | 6% | - | 12% |
| 45% | 43% | 4% | 33% | 7% | - | 14% |

So 20% removes 10 of the 76 pair cards, every one of them a pair under a fifth of
the risk, and no pair correlated 0.95 or more among them. The mostly-bond lesson
portfolio keeps its pair card, and the lesson set now records that as a decision
with the reason beside it rather than leaving it to be rediscovered.

### The demoted pair card

Eight of those 10 cards went to a risk-gap rule, which is the point. Two fell to
the fallback, and a 0.94 pair becoming "nothing stands out here" is not an
improvement. So the pair card is **demoted rather than dropped**: a new rule,
`pairLowRisk`, with its own template.

> QQQ and VTI move together, at 0.94, but between them they are only 13% of your
> risk. They are the same bet - just not the bet that decided this portfolio.

It is **last in the order**, which is the only position that works: ahead of the
risk-gap rules it would hand back every card the condition took away, and the
condition would have been for nothing. Last means it speaks only when nothing
else had anything to say. It is shown on 2 of the 420 portfolios, which is
exactly the two that had fallen to the fallback - the fallback itself did not
grow by a single card.

Its `pairRiskBelow` and the pair rule's `pairRiskAtLeast` have to be the same
number or a pair would satisfy neither rule and lose its card entirely. A test
holds the two equal, and then checks the consequence directly: over every pool
portfolio, a pair correlated 0.70 or more fires exactly one of the two rules,
never both and never neither.

The sixth lesson portfolio is this case, and it is **p17 from the level 2 guess
pool** rather than a portfolio built for the rule: QQQ and VTI at 0.94 carrying
13%, beside ABBV at 45% of the money and 45% of the risk, so no gap rule and no
group rule fires either. A test holds it equal to the pool's own p17, so a change
to the pool cannot leave the lesson quietly describing something else.

### What to watch

- **`pairLowRisk` is shown on 2 of 420 portfolios.**  That is by design - it is
  the last word before the fallback - but it is rare enough that it will be hard
  to see in a playtest, and rare enough to rot unnoticed. The lesson portfolio is
  what keeps it honest.
- **The fallback is 13% of cards, up from 5%.** That is the cost of the stricter
  thresholds, and it is the honest answer for a portfolio with nothing
  concentrated in it. But "nothing stands out" is the least useful thing the game
  can say, and if playtests show players reading it often, the fix is another
  rule rather than a looser threshold.
- **The group card still wins most often. It is 43%, not the 38% first written
  here.** The AI group holds 13 of the 40 tickers a player can pick, so a random
  5-holding build often has two or three AI stocks in it. That is the lesson the
  game is named after, so it is not wrong, but it is worth watching whether it
  crowds the others on levels 4 to 7.

  The number changed because the measurement did, not because the market did -
  the frozen snapshot and `why.json`'s thresholds are the same. The 38% was
  measured before `scripts/check_why_cards.mjs` existed; when the script was
  committed one commit later it printed 35% while silently dropping 49 of its 400
  draws; and the fix that stopped it drawing the two benchmarks as holdings left
  400 real draws, which read 43%. Restoring the old `minGroups: 2` guard accounts
  for 1 point of that; the rest is simply a different 400 portfolios. The row
  today is groupRisk 43%, pair 16%, riskGapOver 26%, riskGapUnder 6%,
  pairLowRisk 0% (2 cards) and fallback 9%.
- **The thresholds were tuned on the frozen snapshot.** `data/game.json` is
  rebuilt every weekday evening, so the frequencies will drift with the market.
  Nothing breaks when they do - a card is chosen per portfolio, not per cohort -
  but the table above is Wednesday's, not a constant.
- **Level 3's card on a passing build named a bond pair.** TLT and LQD at 0.91
  inside a 3.56-bet portfolio is correct and useful, but it is the first case
  where the card reads as criticism of a build that passed. Worth seeing how a
  player takes that.

Educational, not investment advice.

## Levels 4 and 5, the rules and the math, 25 November 2026 (session 2.5)

Session A of two. This one builds everything that is not a screen: the two new
measures and their known answers, the rules in `levels.json`, the build rule
level 4 needs, and the real-data check that both levels can be passed. The
screens and the "Why?" card for level 4 are session B.

### The PRD had to change first, and it is a scoring rule, not a threshold

`docs/PRD.md` said "each level gives 1 star for passing, 2 if the guess was
within 1, and 3 if within 0.5", with one exception already carved out for level
1's correlation. Those bands are bands on a **number of bets**. Level 4 answers
with a beta between 0 and 1.5 and level 5 with a share of risk between 25% and
100%, and on both, a band of 1 and a band of 0.5 would hand 3 stars to nearly
every guess - the same failure the level 1 exception was written for.

So the exception is now a rule: a level whose answer is not a bets count scores 1
for passing, 2 for naming the right one of three buckets, and 3 for a guess
within a stated distance. **Every edge is either a number the game already uses
or the level's own pass threshold**, which is the part that keeps this from being
a dial:

| Level | Buckets | 3 stars |
| --- | --- | --- |
| 4 | 0.50 (its own threshold) and 1.00 (the basket moving one for one) | within 0.10, level 1's band |
| 5 | 35% (its own threshold) and a half | within 5 points |

Levels 2, 3 and 7 keep the registered bands. Level 6 falls under the new rule and
is fixed when it is built.

### Beta is linear in the weights, and that is the whole decomposition

`cov(sum_i w_i r_i, b) = sum_i w_i cov(r_i, b)`, so a holding contributes
`w_i * beta_i` and the parts add up to the portfolio's beta exactly. No
approximation, nothing to choose. `betaContributions()` in `js/math.js` returns
them, and a known-answer test checks both the parts and that they sum.

**They are not turned into percentages, and that is the finding of the session.**
On the current window JNJ (-0.13), PG (-0.11), KO (-0.14) and XOM (-0.02) all
move slightly against the AI basket, so a portfolio of QQQ with staples beside it
has QQQ at **148% of its beta** and JNJ at -26%. "QQQ is 148% of your AI
exposure" is not a sentence to show a beginner. Level 4's card will state the
betas themselves.

### `equalWeightBasket` moved into `js/math.js`, and the verdicts did not move

Level 4 measures beta to the same basket Hypothesis 2 correlates, so the two must
use one definition - but a game module importing `js/hypothesis2.js` to get it
would be the game importing the research layer. The function moved to
`js/math.js` and is re-exported from `js/hypothesis2.js`, so every reader of the
registered test still finds it where the test describes it.

`node scripts/run_research.mjs` was rerun afterwards and compared against the
committed `data/results.json`: **every number, verdict and leave-one-out rerun is
identical**. The file is not byte-identical and cannot be - it records
`generated_at` and the commit it ran from, and those are the only two fields that
differ. A test now also holds the two exported names to one function, so the
research and the game cannot drift onto different baskets.

### Level 4's build rule: a holding the level will not let you drop

"Keep at least 30% in QQQ" is a build rule, not a pass rule, so the pass check
stayed as the beta alone and the rule went into the build:

- QQQ is **dealt with the round** and `togglePick` refuses to remove it.
- `splitWithFloors()` opens the round at **exactly** the floor - $3,000, with the
  rest even - rather than above it. A player who wants more QQQ has to choose it,
  which is how they find out what it costs.
- The **buttons** hold the rule up, not just the gate: QQQ cannot be stepped
  below $3,000, and no other holding can draw a step out of it.
- The holding count, 4, is not in the PRD. It matches level 5 and needs no build
  rule the game did not already have, and `holdingsNote` in `levels.json` says so.

### A share of risk is shown as a percent, under the same display rule

`CLOSE_TO_THRESHOLD` is 0.005, which in a share of 1 is half a percentage point -
exactly the width a whole percent can round across. So the rule the PRD states
for correlations carries over untouched: a biggest risk share of 0.3549 against
level 5's 35% reads **"35.49%" and fails**, never "35%" and fails. Nothing about
the display decides the pass.

The slider step, the display and the reveal panel's label are data in
`levels.json` now. `js/game.js` used to work them out by branching on the
measure's name, and with four different answers across five levels that branch
had started deciding how numbers read.

### Both levels pass on real data, 1,200 seeded draws each

`node scripts/check_levels.mjs`, frozen snapshot, 756-day windows:

| Level | Winning designs | Scored at |
| --- | --- | --- |
| 4. Hidden AI | **634 of 1,131** | QQQ at its 30% floor, the other three even |
| 5. Where's the risk? | **126 of 1,192** | equal weights |

Level 4 is scored at the allocation the game deals rather than at equal weights,
because equal weights are not a legal level 4 build. The hardest draw was QQQ +
MU + MRVL + PLTR at 1.09.

**QQQ alone is 0.564 to the basket**, so a player who pushes the fund to 97%
fails at 0.544. The level is a squeeze from both sides: hold the fund, and don't
lean on it.

**116 of level 5's 126 winning designs make fewer than 2 effective bets**, and
INTC + AMD + AVGO + NVDA passes at 29% with 1.06 bets. Spreading risk evenly is
not the same as making several bets, and a player who passes this level without
being told that learns the wrong thing. Level 5's `why` says it, and session B
adds a card for it.

### The new card's threshold, decided here, built in session B

Among the 213 passing 4-holding builds in a 2,000-draw sample, the median is
**1.31 effective bets** (25th 1.15, 75th 1.59, max 2.74). The card fires on a
build whose risk is spread (no holding over 35%, level 5's own threshold), with
at least 3 holdings (`groupRisk`'s guard, for the same reason), and fewer than
**2.00 bets**:

| bets below | share of passing level-5 builds | shown, whole sample | shown, 400 level-3 builds |
| --- | --- | --- | --- |
| 1.50 | 69% | 6% | 5% |
| 1.75 | 85% | 7% | 9% |
| **2.00** | **92%** | **8%** | **12%** |
| 2.25 | 97% | 9% | 13% |

2.00 is derived rather than tuned: with 4 holdings it is the claim that four
collapsed to fewer than two, and it sits below level 3's own 3-bet bar, so
nothing this card calls "nearly one bet" is a portfolio the game elsewhere calls
diversified. It goes after `groupRisk` and before `pair` in the order, which is
what lets it win on GLD + VEA + VXUS + VOO, where the top group holds 52% and the
VEA/VXUS pair at 0.99 would otherwise take the card.

### What to watch

- **The card will be close to a standing card on level 5**, at 92% of passing
  builds. That is the finding, not a flaw - most passing builds really are one
  bet - but if a playtest shows players skimming it, 1.75 is the next honest stop.
- **Level 4 is passed by 56% of random draws.** Three winning designs was the
  bar, and it clears it many times over, so the question is whether the level is
  too easy rather than whether it is possible. A player picking on purpose will
  tend to pick tech, which is the half that fails.
- **The frequency table in session 2.4 said the group card wins 38%; the script
  prints 43%** on the same frozen snapshot. Nothing in this session touched that
  path - the table is identical at HEAD - so it had been stale since it was
  written. Corrected in that entry: the 38% predates the script, and the sampler
  fix that stopped it drawing the two benchmarks as holdings changed which 400
  portfolios the table is over.
- **Level 4's window is the portfolio's AND the basket's.** All 13 members have
  full history inside the 756-day game window today, so nothing is shortened. If
  the window ever reaches back past a member's listing, every level 4 round gets
  shorter rather than the member being dropped, and under 252 days the round
  refuses to be measured at all.

Educational, not investment advice.

## The join test held two fetches to a one-fetch bar, 26 November 2026 (session 2.5a)

The scheduled refresh went red on data that was fine, and the test was the fault.

`tests/liveRolling.test.js` checked the gap where the live and frozen halves of
the rolling chart meet, against two bounds: `JOIN_TOLERANCE` at 1e-4, which is
what the page itself enforces, and a second assertion pinning the gap at **1e-9**
because the committed files measured 2.4e-10 on the day it was written. A fresh
fetch on the evening of 25 November moved the gap to **1.3e-7** and the job
failed.

Nothing was wrong with the data. The two halves come from two different
downloads - the frozen half from `data/prices.json`, the live half from that
evening's fetch - and `docs/PRD.md` already records what that costs: Yahoo's
adjusted closes for dividend payers move by up to 1.2e-6 relative between
fetches, and correlations by up to 4e-6. A gap of 1.3e-7 is Yahoo's rounding,
sitting 1,000 times inside the tolerance the chart actually refuses on.

**CLAUDE.md rule 3 holds the browser maths to 1e-9 against numpy.** That is
`tests/math.test.js`, and it is a claim about one calculation done two ways in
two languages on the same numbers. It is not a promise that two downloads of the
same price agree, and this join is the only comparison in the project that spans
two of them. Applying the rule here read as rigour and was really a tripwire on
Yahoo's rounding.

So the 1e-9 assertion is gone, the 1e-4 guard stays, and **the measured gap is
printed on every run**:

```
    the halves differ by 2.08e-12 at 2026-11-24 (refused above 0.0001)
```

2.08e-12 on today's committed files, down from the 2.4e-10 of session 2.3b
because `data/game.json` carries 12 decimals now rather than 10. Printing it
keeps the number in front of a reader on every run, so a drift that is growing is
visible in the log long before it reaches the tolerance - which a pass/fail
assertion at a fixed bar never showed, it only went off.

The guard that matters is untouched: a wrong basket, a wrong benchmark or a
misaligned calendar still shows up as a gap far above 1e-4, and the chart then
stops at the freeze date and says why. A test elsewhere in the same file moves
the join by `10 * JOIN_TOLERANCE` and checks exactly that.

### What to watch

- **The printed gap is now the early warning, and nothing reads it automatically.**
  If it climbs towards 1e-4 the job will stay green until it crosses. That is the
  right trade for a number whose floor is set by someone else's rounding, but it
  does mean the line is worth a glance when the refresh log is open.

Educational, not investment advice.

## Levels 4 and 5, the screens and the cards, 26 November 2026 (session 2.6)

Session B. The rules and the math landed in session 2.5; this is what a player
sees, and two "Why?" cards for what levels 4 and 5 teach. Both defects worth
recording were found by playing the levels in a browser, not by a test.

### A holding the level keeps, and a button that cannot work

Level 4 deals QQQ and will not let it go, so the chip is rendered **held and
locked** rather than tappable and then refused - the round throws if it is
removed, and a button whose only outcome is an error is not a button. It keeps
the held colour at full strength and takes a lock glyph, because the disabled
styling would have faded it to 0.35 and made a name the player definitely holds
look like one they cannot reach.

The same thinking runs through the money: `round.canLower()` and
`round.canRaise()` mirror `adjustDollars()`'s own conditions exactly, and the
screen disables a step rather than offering one that does nothing. QQQ's minus
is off at $3,000, with the reason beside it: "QQQ stays at $3,000 or more: the
30% this level asks you to keep in it."

### The card for AI held through a fund, and why it is two rules

`hiddenAi` fires when the biggest contributor to the portfolio's beta is a fund
rather than a basket member, and brings at least half of it. Three conditions,
and the third is the one that stops the card lying: **INTC is not in basket.json
and carries a beta of about 1.0 to it**, so without a test that the holding is a
fund, "The AI is inside the fund" would be printed about a chipmaker. The fund
groups are listed in why.json, beside the claim they guard.

Playing level 4 showed what no test had: on the ordinary passing build the card
read

> Your portfolio moves 0.17% when AI stocks move 1%, and **0.17** of that comes
> from QQQ alone

Both numbers were right. PG, JNJ, KO and XOM all move slightly against the
basket, so what they take off cancels what gold and a broad fund add, and the
fund's part of the beta *is* the beta. True, and it reads as a typo. So there are
two rules, as with `pair` and `pairLowRisk`: `hiddenAiAll` says "all of that
comes from QQQ alone" and `hiddenAi` keeps the two numbers for when they really
differ. **The test is what the card would print**, not the raw values: a fund at
0.1692 of a 0.1707 beta prints "0.17 of 0.17". A test holds the two rules to
being exact complements over five portfolios.

### The card level 5 needed, so that passing teaches the right thing

`fewBets` fires under **2.00 effective bets** with the risk spread (no holding
over 35%, level 5's own threshold) and at least 3 holdings. Of 2,000 seeded
4-holding builds, the 213 that pass level 5 have a median of 1.31 bets and 92%
are under 2.00, so without this card the usual way to pass level 5 teaches the
opposite of the truth. It goes after `groupRisk` and before `pair`, which is what
lets it answer on four funds that each carry a quarter of the risk: the top group
holds about half, so the group card is silent, and the 0.99 pair inside would
otherwise take the card and say the smaller thing.

### A group of one holding is a holding

The new lesson portfolio for level 5's failing build - three bond funds and NVDA
- turned up a fault in the **existing** group rule:

> 1 of your 4 holdings are AI stocks. They are 25% of your money and 82% of your
> risk

Bad grammar, and a weaker claim than the truth, which is that one holding carries
four fifths of the risk - which `riskGapOver` already has the template for. So
`groupRisk` gained `minHoldingsInGroup: 2`, and a one-holding group falls through
to the risk-gap card. This is the first case in the lesson set where a single
holding dominates a portfolio of three or more, which is why five sessions of
that rule never showed it.

The frequency table moved with it, over the same 420 portfolios:

| rule | fires | shown |
| --- | --- | --- |
| hiddenAiAll, hiddenAi | 0 | 0 — the table's builds carry no basket |
| groupRisk | 176 (42%) | 176 (42%) |
| fewBets | 83 (20%) | 46 (11%) |
| pair | 84 (20%) | 51 (12%) |
| riskGapOver | 240 (57%) | 111 (26%) |
| riskGapUnder | 219 (52%) | 13 (3%) |
| pairLowRisk | 23 (5%) | 1 (0%) |
| fallback | 22 (5%) | 22 (5%) |

The fallback is down from 9% to 5%, and `fewBets` took 46 cards that were mostly
the pair card before. The level 4 and 5 builds are deliberately **not** drawn into
this table: it is the record of how the older thresholds were set, and adding
draws would move every number in it for reasons that have nothing to do with the
rules. The new cards are held by their lesson portfolios instead, which is now 11.

### Level 5 now says whose 38% it was

The reveal showed "38%" against a threshold of 35% and never named the holding -
the one thing the level asks about. `topRiskShare()` returns the index with the
share, and the panel carries a line under the number: "That holding is GLD."

### How it was checked

The screens are the part the tests cannot prove, so both levels were played end
to end in headless Chrome at 390x844 over the DevTools protocol: the locked chip,
the floor note, the disabled minus (computed opacity 0.45, cursor default), the
blank slider, the percent readout, the reveal panel, the bucket line and the
card. No console errors on either level. 535 tests pass, and both check scripts
are green.

One trap in that harness, recorded because it wasted a pass: **ES modules are
cached by the browser** even when the JSON beside them is fetched no-cache, and a
crashed run leaves Chrome holding the port, so the next run attaches to the old
page. A card that had already been fixed kept printing its old text. The harness
now disables the cache and the stray browser gets killed first.

### What to watch

- **Level 5's card can name the quiet holding on a failed build.** GLD carried
  37.9% and failed the level; the card named BND at 25% of the money and 3% of
  the risk, because GLD's gap is 12.9 points and `riskGapOver` asks for 20, while
  BND's is 22 points under. Both statements are true and both are level 5's own
  concept, but the card is about the other end of the portfolio from the one that
  failed. **Decided in session 2.6a below: a card of its own, rather than a looser
  threshold.**
- **`hiddenAi`'s two-number form is rare on level 4.** It needs a holding beside
  the fund that adds real exposure without being a basket member, which is mostly
  another fund. Its lesson portfolio is what keeps it honest.
- **`fewBets` is shown on 11% of the old 420 and will be far higher on level 5.**
  As recorded in session 2.5, that is the finding rather than a flaw, but it is
  the card most likely to be read as repetitive in a playtest.

Educational, not investment advice.

## The card for a missed level 5, 26 November 2026 (session 2.6a)

A level 5 round that missed now gets a card naming the holding that failed it:

> GLD carries 38% of your risk on 25% of your money - past the 35% this level
> allows. That is the holding to shrink or swap.

### Why not a looser threshold

The alternative was to lower `riskGapOver`'s 20-point gap until it reached GLD at
12.9 points. That would have changed the card on a quarter of every level's
portfolios to fix one level's worst case, and the 20 points is itself a measured
number (session 2.4: at 15 points the rule had something to say about three
quarters of all portfolios). A card for the case is cheaper and says more than a
gap rule can: the gap rules talk about a holding's two shares, and what a missed
level 5 needs said is which holding went past the limit.

### A rule that leads, instead of a place in the order

`why.json`'s `order` is the order for every portfolio, and this card does not
belong in it. On a level 5 round that passed there is nothing over the limit to
name; on any other level the limit is not what was checked. So the rule carries a
**`leads` block** rather than a place in the order:

```json
"leads": { "measure": "maxRiskShare", "passed": false }
```

`js/round.js` hands `pickWhy()` what the round WAS - its measure and whether it
passed - and any rule whose `leads` matches is asked before `why.json`'s own
order. A round that matches nothing uses that order exactly as before, which is
the whole point: **the frequency table over the 420 portfolios is byte-identical
to session 2.6's**, because those portfolios are measured without a round.

Two guards came with the mechanism, both in `validateWhy()`: a rule with `leads`
must NOT also be in the order, or it could answer rounds it was not written for;
and `leads` may only match on fields in `LEAD_MATCHES`, so a condition cannot be
invented in the JSON alone - the same rule the placeholders already follow.

### The limit is the level's, not the card's

The rule has no `when` thresholds at all. `levels.json`'s own pass threshold is
handed in, so the card states the number the pass check used, and a change to
level 5 cannot leave the card quoting the old limit. With no limit to state the
rule says nothing rather than inventing one.

### What was checked

The twelfth lesson portfolio is the GLD case itself, with the round written down
beside it, and it is the only way the card can be reached in the check script -
which is the test that the mechanism works. Three more tests hold the other side:
the same portfolio with no round, with a passed round, and with a missed round on
another measure all get `riskGapUnder`, the card they got before. 543 tests pass,
both check scripts are green, and the card was read off a real missed level 5 in
headless Chrome.

Educational, not investment advice.

## Crash replay, the data and the math, 26 November 2026 (session 2.7)

Session A of two: where the prices come from, what a replay actually computes,
and the shared build screen. The mode's own screens are session B.

### The 2020 crash is outside the file the game plays on

`data/game.json` is the most recent 756 trading days - back to 21 November 2023 -
so the game's own price file cannot reach February 2020. The committed research
snapshot can, and **`scripts/build_crash_data.mjs` reads it and writes somewhere
else**: `data/crashes.json`, the three windows only, in `data/game.json`'s own
row-per-day layout so `js/gameView.js` reads both with one set of functions.

`data/prices.json`'s role is untouched by that. docs/PRD.md calls it "the exact
bytes every published verdict was computed from, written once and then left
alone", and nothing here writes to it; `scripts/run_research.mjs` already reads it
the same way. The snapshot's SHA-256 goes into the derived file, as it does into
`data/results.json`, so a replay can be matched to the bytes it came from. The
file is **built once and committed, not refreshed**: February 2020 will not be
different tomorrow.

What that cost: **223 KB**, against `game.json`'s 500 KB.

The alternatives, and why not:

| | |
| --- | --- |
| Fetch the windows live | A second fetch path, and Yahoo's adjusted closes move between fetches, so February 2020 would wobble every evening for no gain |
| Extend `game.json` to ten years | It is the 756-day covariance window, rebuilt every weekday and committed on change; ten years would bloat every nightly diff and the download |
| Read `prices.json` in the browser | 2.6 MB on a phone, and it makes the research bytes a runtime dependency of the game |

### Two conventions, each worth a different answer

**A replay starts at a close, not at a return.** The research windows are windows
of returns; a replay is a line that starts at the first date's closing price and
applies the returns after it. So each window's rows are the returns AFTER its
first date, and a path has one more point than it has rows. This is what makes
the 2020 crash read **−33.99%**, the published peak-to-trough figure, instead of
−33.6%.

**A portfolio is bought and held, never rebalanced.** Each holding's dollars grow
on their own and the portfolio is their sum. `portfolioReturns()` in `js/math.js`
silently rebalances to the starting weights every close, which is right for the
research basket and wrong for a replay of *holding* something. It is not a
rounding difference:

| Portfolio | Window | Held | Rebalanced daily |
| --- | --- | --- | --- |
| 60% VOO / 40% TLT | 2020 | −14.70% | −16.38% |
| VOO BND GLD XOM JNJ | 2022 | **+2.03%** | **−0.24%** |

The 2022 case changes sign. The fixtures carry a hand-worked pair - one holding
doubling twice while another halves twice, ending at $21,250 held and $15,625
rebalanced - so the difference is recorded rather than described.

### The S&P 500 line is VOO, so both lines include dividends

Measured against the index itself, over the same windows and the same
convention:

| Window | ^GSPC | VOO | Difference |
| --- | --- | --- | --- |
| 2020 crash | −33.92% | −33.99% | −0.07 points |
| 2022 bear market | −25.43% | −24.52% | +0.90 points |
| January 2025 AI selloff | −2.41% | −2.27% | +0.14 points |

Only the 2022 window is long enough to span several quarterly distributions, and
it is the one that moves. The other two are five weeks each, where what shows is
the fund against the index rather than dividends - in 2020 it runs the other way.
**That reading is inferred, not measured:** the snapshot carries adjusted closes
only, with no dividend column, so nothing in the committed data can say which
ex-dividend dates fall inside a window.

### PLTR cannot be held through February 2020

It listed on 1 October 2020. `data/crashes.json` records it as unavailable in that
window with its own first date, `readWindow()` refuses it rather than drawing a
flat line or counting a zero return, and `availableIn()` is what the picker will
ask. The other two windows carry all 40 names. This is the same rule
`js/returns.js` applies to a gap, which is why a late listing is named by its
first date rather than treated as missing data.

### The build screen moved out of Learn

`tickerPicker` and `allocator` were private to `js/game.js`, where only Learn
could reach them. They are now `js/build.js`, which knows about a **build** -
anything with the round's picks, dollars, floors and methods - and not about
levels, scoring or what happens next. Crash replay has no level and no stars, and
it is the same screen. Sandbox and My real portfolio are the next two callers.

It gained one thing on the way: `reasonFor(ticker)`, which Crash replay will use
for a holding that had not listed yet in the window being replayed. Learn passes
none.

**Levels 1 to 5 were replayed in headless Chrome after the move** and are
unchanged: level 1's two holdings and no allocator, level 2's dealt portfolio,
level 3's five at $2,000, level 4's locked QQQ at its $3,000 floor with the floor
note under it, level 5's percent slider and "That holding is GLD." No console
errors on any of the five.

### How it was checked

- **The arithmetic against numpy**, 1e-9, over four replay cases, three of them
  hand-derivable: a path anyone can follow (+10%, −50%, flat), the held-versus-
  rebalanced pair, and a window that dips 30% and ends 7.6% down, which is why
  the lowest point is reported separately from the fall.
- **The file against the snapshot**: every return in it rebuilt by `js/returns.js`
  and compared to the stored precision, for four tickers across all three windows.
- **The file against `data/game.json`**: the 2025 selloff sits inside the game's
  756 days, so those returns exist in both files, built from two different
  fetches. They agree on **96 shared days with a worst gap of 4.6e-7**, which is
  the refetch scale docs/PRD.md documents and three orders of magnitude inside
  the 1e-4 the chart would refuse.
- Every ticker each window says it carries produces a finite line, so no window is
  quietly unplayable for one name.
- 581 tests pass. `check_levels`, `check_why_cards` and `run_research` are green,
  and the research verdicts are unchanged by the session.

### What to watch

- **`fallAgainstIndex()` is level 6's measure, sitting here unused.** It returns
  null for a share when the index did not fall, so a share of a rise cannot read
  as a share of a fall. Level 6 looks passable: 60% VOO / 40% TLT falls 14.7%
  against the index's 33.99%, well inside half.
- **`js/chart.js` still draws one series.** Crash replay needs two lines and a
  legend, which is session B's first job; the Research chart passes no second
  series and stays as it is.
- **The AI selloff window is five weeks and the 2022 one is nine months.** The
  same chart has to read well at 24 points and at 195, which is worth looking at
  on a phone before the mode is called done.

Educational, not investment advice.

## Crash replay, the screens, 26 November 2026 (session 2.8)

Session B. The data and the math landed in session 2.7; this is the #crash
route, the three screens, and the second line and legend js/chart.js needed to
draw a portfolio against the index. Four real defects were found by actually
driving the three windows in a browser - none of them would have shown up in a
unit test, because each one is about what a real DOM, a real viewport or a real
font actually does.

### A second series, in the palette's own slot 2

js/chart.js drew one line. Crash replay needs two - a portfolio against the
index it is measured against - so `renderLineChart()` gained an optional
`compare` series, a legend, a line key in the tooltip, and an end dot on each
line. The dataviz skill's own validator chose the color: slot 2, orange
(`#f47230` light / `#e76624` dark), which clears every CVD and normal-vision
check against slot 1 blue in both modes (worst normal-vision Delta E 35.2
light / 33.3 dark). Orange sits under 3:1 contrast on the light surface, which
the skill's relief rule covers: text never wears it - the legend and tooltip
keys are swatches beside text-ink labels, never colored text, and the plain-
words sentence under the chart states both numbers again in the ordinary
text color.

Every new branch is `if (compare)`. Research's rolling-correlation chart passes
no `compare` and nothing it draws changed - confirmed by driving it afterwards:
one series, no legend, the same one-decimal y-ticks, no console errors.

**The tooltip's own hardcoded wording came out in the move.** `renderLineChart`
had "126 days ending {date}" baked into it, which is Research's own rolling-
window phrasing and meant nothing to a crash replay. It is now `formatWhen`, a
hook defaulting to exactly that string, so Research's call needs no change and
Crash replay supplies its own.

### Three defects, each found only by looking at the rendered page

**1. The chart measured its own width before the view was attached to the
document.** `renderReveal()` called `renderLineChart` on a `<div>` that was
still a detached node, so `plot.clientWidth` read 0 and `chartBox()` fell back
to its 720px default - every window got 6 x-axis labels and the wrong height,
regardless of the real viewport. `js/research.js`'s own `renderResearch()` /
`drawCharts()` split exists for exactly this reason; Crash replay had not
followed it. Fixed by moving the chart draw to `ctx.draw()`, after
`root.replaceChildren(view)`.

**2. A fine y-step produced duplicate tick labels.** Rounding every tick to the
nearest $1,000 made $9,000 and $9,500 both read "$9K" on the AI selloff window,
whose range needed a $500 step. The formatter now keeps one decimal of a
thousand when the step is that fine - "$9K", "$9.5K", "$10K" - never two
different dollar amounts reading the same.

**3. The widest y-tick clipped its own leading character.** "$10.5K" is wider
than the 40px left gutter Research's one-decimal correlation reads were sized
for, and SVG does not wrap or shrink a label that does not fit - it clips at
the viewBox edge, silently dropping the "$". `renderLineChart` took a hardcoded
`DEFAULT_PADDING`; it now takes an optional `padding`, and Crash replay passes
a 54px left gutter sized for its own labels.

**4. A pool already narrowed to "available" tickers made an unavailable one
vanish instead of being explained.** The task asked for "unavailable holdings
disabled and explained" - greyed out, with a reason, the way level 4's QQQ
chip is locked rather than just missing. The first build fed `createBuild()`
the output of `availableIn()`, which FILTERS the pool, so PLTR was never in it
and `js/build.js`'s `reasonFor` mechanism had nothing to disable - the 2020
crash's picker simply had no PLTR at all. `createBuild()` now always takes the
whole game universe as its pool, and gained its own `isAvailable(ticker)` rule,
enforced in `togglePick()` itself - not only by the picker disabling a button,
the same defense-in-depth js/round.js already uses for a required holding it
will not let go. A disabled chip stops a click; the build layer is what stops a
caller.

None of these four would have failed a unit test written against the pure
functions in isolation - `chartBox(0)` returning the 720px default is CORRECT
behaviour for that input, `niceStep` picking 500 for a tight range is correct,
a 6-character label at 11px is genuinely wider than 32px, and `availableIn()`
filtering its list is exactly what it is documented to do. Each one is a
composition fault, visible only once the real pieces were wired together and
looked at - which is why the task asked for the browser pass before calling
this done rather than treating the test count as the finish line.

### What a replay screen is, and is not

No guess, no stars: docs/PRD.md asks Crash replay to show a portfolio through a
real crash, not score a prediction of one, so the round here is CHOOSE -> BUILD
-> REVEAL, two states short of Learn's. The build screen is js/build.js's,
unchanged since session 2.7 beyond the pool fix above - the same picker, the
same allocator, the same locked-chip styling level 4 already uses for a
required holding, doing the same job for an unavailable one.

`fallSentence()` is the one pure function in the file, tested the way
`starsExplanation()` already is: "Your portfolio fell 15%. The S&P 500 (VOO,
with dividends) fell 34%. That is 43% of the index's fall." It says nothing
about a share when the portfolio rose, or when the index did not fall - a
share of a rise is not a thing to compare, as `fallAgainstIndex()` already
established in session 2.7.

### How it was checked

All three windows were built and revealed end to end in headless Chrome, with
the viewport forced to a true 390px (`--window-size` alone left the actual
viewport at 500px in headless new-mode - `Emulation.setDeviceMetricsOverride`
is what a real phone's fixed viewport needed). No console errors on any screen.

| Window | Points | x-ticks | y-ticks | Portfolio built | Reads |
| --- | --- | --- | --- | --- | --- |
| 2020 crash | 24 | 3 | 6, whole thousands | 50% VOO / 50% TLT | "Your portfolio fell 10%. The S&P 500 (VOO, with dividends) fell 34%. That is 29% of the index's fall." |
| 2022 bear market | 195 | 3 | 6, whole thousands | VOO/BND/GLD/XOM, even | "Your portfolio rose 3%. The S&P 500 (VOO, with dividends) fell 25%." |
| January 2025 AI selloff | 24 | 3 | 5, half-thousands | 50% QQQ / 50% NVDA | "Your portfolio fell 8%. The S&P 500 (VOO, with dividends) fell 2%. That is 363% of the index's fall." |

The 195-point window's daily noise stays legible at 390px with both lines
distinct throughout; the 24-point windows show NVDA's -17% opening day and the
crash's full fall as a shape, not a point count - niceStep() and chartBox()
scale the axes to the data's own range rather than to how many points are in
it, which is why the same two functions serve both without a special case for
either. 598 tests pass, and both check scripts are green.

### What to watch

- **The floating tooltip is nearly invisible against the chart's own dark
  surface.** Its background and the chart's are the same `--surface-1`, so only
  a 1px 10%-opacity border and a soft shadow separate them - confirmed present
  and correctly positioned by querying the DOM, not visible by eye in a
  screenshot. This is Research's own tooltip styling, unchanged by this
  session, and the accessible `role="status"` readout beneath the chart carries
  the same numbers in plain text regardless. Worth a look in a real playtest,
  since every chart in the game shares this style.
- **"That is 363% of the index's fall" is a mouthful for a portfolio that fell
  harder than the index.** It is arithmetically exactly what `fallAgainstIndex()`
  promises and it is true of 50% QQQ / 50% NVDA through the AI selloff, but the
  wording was not tuned for the case where a portfolio loses several times over
  what the index did - worth a playtest read.
- **createBuild()'s `isAvailable` is per-build, not per-pick.** Switching crash
  windows always calls `freshBuild()`, which rebuilds the closure over the new
  window, so a portfolio built for one crash cannot carry an unavailable
  holding into another by surviving a window change - there is no "keep my
  picks" path between windows to have gotten this wrong, but it is the reason
  there does not need to be one yet.

Educational, not investment advice.

## Level 6, the rules and the math, 25 November 2026 (session 2.9)

Session A of three. This is level 6's data, its measure and its build rule, with
no screen in it: the reveal chart and the "Why?" card are sessions B and C. It
opens with the wording fix session 2.8's "What to watch" asked for - "That is
363% of the index's fall" now reads "about 3.6 times as much as the index fell",
and the percent in that sentence can no longer pass 100%. The split is on the
unrounded share, so the two forms cannot both claim the same number.

(The three sessions above this one are dated 26 November in this log while their
commits are all dated the 25th. The dates in the log are a day ahead; the commits
are right. Not corrected here, only noted.)

### What the PRD left open, and what was chosen

| Open question | Chosen | Why |
| --- | --- | --- |
| Which tickers are "stocks" | Everything but BND, TLT, LQD and GLD - 36 of 40 | A stock fund is a stock: VOO, QQQ and VXUS are shares bought in one line. The other four are loans, or metal |
| Holding count | Exactly 4 | Matches levels 4 and 5, and on real data it is the hardest of 3, 4 and 5 while still clearing the PRD's 3 winning designs many times over |
| The buckets | 1.00 and 0.50 | The level's own pass threshold, and falling one for one with the index - which is the index itself here: all of VOO gives exactly 1.000 |
| The three-star band | Within 0.10 | The band levels 1 and 4 already use, on a measure with a beta's units |
| The guess slider | 0 to 2.00, step 0.05 | 1.00, the index, sits at the middle, so left is "held up" and right is "fell harder" |

**Both kind lists are written out, and that redundancy is the point.** A file
listing only the four exceptions would count a bond fund added next year as a
stock in silence. levels.json carries `stocks` and `notStocks`, and
tests/levels.test.js holds their union to tickers.json's own 40 playable tickers
and the two to being disjoint - so a ticker classified nowhere fails the test
rather than defaulting into one of them. tickers.json itself is part of the
pre-registration and was not touched.

**PLTR is listed as the stock it is.** It cannot be held in level 6 for a
different reason - it had not listed in February 2020 - and the two reasons are
kept apart deliberately: it *can* be held through the 2022 window.

### A floor on a set, which is a build rule the game did not have

Level 4's "at least 30% in QQQ" is a floor on one named holding. Level 6's "at
least 60% in stocks" is a floor on whichever of the four holdings happen to be
stocks, and any one of them can carry the whole thing. It is held up in the same
three places level 4's is, because any one of them alone would be a rule in name
only:

- **The opening split.** An even split, then steps out of the largest holding
  outside the kind into the smallest one inside it, so both sides stay as level
  as whole $100 steps allow: two stocks and two bond funds open at
  $3,000 / $3,000 / $2,000 / $2,000, not $3,500 / $2,500.
- **The gate.** `buildComplete()` refuses a build under the floor.
- **The buttons.** `canLower`, `canRaise` and `adjustDollars` now go through one
  pair of helpers - `donorsFor` and `receiversFor` - so a disabled button and a
  refused move are the same rule rather than two copies of it. That matters more
  here than on level 4: a minus on a stock can be illegal because of what the
  *other* stocks hold, which is not something a player can read off the row they
  are looking at. A 400-move deterministic walk asserts the invariant and that
  every button's offer matches what the move actually does.

**It does not throw when the floor cannot be met, and that is the difference
from splitWithFloors().** Four bond funds can never put 60% in stocks. That is a
build to report, not an exception: the money still adds to $10,000, it is in the
wrong place, and `whyIncomplete()` says so.

**whyIncomplete() exists because the old message lied.** With one rule per level,
"level 6 wants exactly 4 holdings; this has 4" was impossible to produce. With
two rules it was exactly what four bond funds got - both facts in it true, and
neither of them the problem. The message now names the rule that was missed, and
the test for four bond funds asserts the wording, not just the refusal.

### The threshold was one ulp wide, so the pass check now has slack

20% against 40% is half as much in arithmetic and *not* in binary floating point:
8000/10000 - 1 is -0.19999999999999996, so the share came out at
0.4999999999999999 and **passed** a `<` check, while 25% against 50% gave exactly
0.5 and missed. Python and JavaScript land on the same bit, which is why the
fixtures carry both cases rather than hiding either.

The display rule covers half of the consequence: a result within 0.005 of its
threshold is shown to 4 decimals, so the screen reads "0.5000" and not "0.50".
But that is the problem rather than the cure - it means two portfolios that fell
the same half were shown the *same* number and given different verdicts.

**`passes()` now counts a measure within 1e-9 of its threshold as equal to it**,
which is BAND_TOLERANCE, the slack the star bands already give a guess, reused
for the same reason. The slack passes an inclusive comparison and fails a strict
one, so both of these builds miss: a portfolio that fell exactly half as much as
the index did not fall *less* than half as much. docs/PRD.md's scoring section
says so now, beside the display rule it follows from.

Nothing else moved, and that was checked rather than assumed:
scripts/check_levels.mjs's output is byte-identical before and after, the "Why?"
card frequency table and all twelve lesson cards are unchanged, and the closest
any sampled design comes to its own threshold is 6.2e-5 - on level 5, five orders
of magnitude outside the band. A test asserts that last fact for levels 1, 4, 5
and 6, so the slack cannot quietly start deciding a real round. Two pre-existing
assertions did change, both of them cases built to sit 1e-10 from a threshold:
`passes(level1, 0.7999999999)` and `passes(level3, 2.9999999999)` now pass, and
the test says why and checks 1e-8 out instead.

### Level 6 does not read data/game.json at all

Its window is 23 fixed days in data/crashes.json, so none of the rolling-window
machinery applies: no covariance, no 252-day minimum, and nothing that moves when
the market does. `measureFor()` leaves for the crash branch before any of it, and
a round played with `game: null` still reveals - which is the test that proves it.
The level's answers therefore cannot go stale, unlike levels 1 to 5, which the
weekly job re-checks on live prices.

js/round.js and js/crash.js are now a cycle: the round reaches into Crash
replay's `replay()` and `fallAgainstIndex()` rather than keeping a second copy of
the measure, and js/crash.js still imports `DOLLAR_STEP` and `evenSplit` back out
of the round. It is safe because neither side touches the other's bindings while
the modules are evaluating, only inside functions, and the tests import them in
both orders to keep it that way.

### How it was checked

The numpy fixtures came first, as CLAUDE.md rule 3 asks: seven named cases for
the fall share - passing, the exact boundary, the one-ulp boundary, a portfolio
that rose while the index fell, one that fell twice as far, an index that did not
fall at all, and four holdings over 23 sampled days. Regenerating
known_answers.json changed no pre-existing key.

Level 6 on the real 2020 window, scored at the allocation the game deals:

| | |
| --- | --- |
| Winning designs | 50 of 1,079 4-holding draws (the PRD asks for 3) |
| Skipped | 113 held something the window cannot replay; 0 held no stock; 0 fell short of the floor |
| Hardest draw | 1.51, XOM + BAC + CVX + COP |
| Holding TLT | 33 of 127 win; without it, 17 of 952 |
| Reachable range | -0.117 (WMT-heavy with TLT, which *rose* 3.96%) to 1.714 (almost all COP) |

Six named builds carry the lesson, each with the answer it has to give, and the
script exits non-zero if one moves. The pair that is the lesson:

| Build | Share | |
| --- | --- | --- |
| WMT 3,000 / PG 3,000 / TLT 2,000 / BND 2,000 | 0.1415 | passes |
| JPM 3,000 / XOM 3,000 / **the same** TLT 2,000 / BND 2,000 | 0.7225 | misses |

Same shape, same cushion, five times apart. A random sample would never have put
those two side by side - it found 50 winners and could not say what made them
win. 647 tests pass and both check scripts are green.

### TLT did not protect anybody in 2022

The level's own "why" says so, with the numbers read from data/crashes.json:
TLT rose 14.23% through the 2020 crash while the index lost 33.99%, and fell
**29.33%** through the 2022 bear market against the S&P 500's own 24.52% - more
than the market it was supposed to cushion. The text points the player at Crash
replay's 2022 window to watch it happen. The lesson level 6 teaches is not "hold
bonds": it is that what protects a portfolio depends on what the crash is made
of, and two thirds of this window's winners holding long Treasuries is a fact
about February 2020, not a rule.

### What to watch

- **The level is hard: 50 winners in 1,079 draws, and 33 of them hold TLT.** The
  count is a floor - it is scored at the dealt split, and a player free with the
  $100 steps can only do better - but a playtest should check that a student who
  fails it twice learns "which stocks" rather than "pick TLT". The "why" is
  written against exactly that misreading.
- **Both ends of the slider are unreachable by 0.02 and 0.21.** The real answer
  runs from -0.117 to 1.714 and the slider from 0 to 2.00, so the two most
  extreme tilts can score 2 stars but not 3. Level 5 makes the same trade.
- **A level 6 reveal carries no "Why?" card yet.** why.json's rules are all
  thresholded on a three-year covariance matrix; over 23 crash days nearly
  everything correlates above 0.9, so every round would be handed the pair card.
  The round returns no card rather than a wrong one, and a test asserts that so
  session C has to change it deliberately.

Educational, not investment advice.

## Level 6, the screens, 25 November 2026 (session 2.9b)

Session B of three: level 6 in Learn, built, guessed and revealed with the two
lines under it. No new screen - the Learn round's three screens already fit a
replay - and no new chart code: the spec comes out of js/crashReplay.js, so the
same history cannot be drawn two ways. Two defects were found by driving the
level at a true 390px, neither of which a unit test would have noticed, because
both are about what a player reads on one screen.

### What Learn borrows from Crash replay, and why it borrows rather than copies

| Borrowed | Why not a second copy |
| --- | --- |
| `chartSpecFor(result)` | The padding, the $K y-ticks and the tooltip wording were all found by looking at the rendered page in session 2.8. None of that should be done twice |
| `pickReason(window, ticker)` | A player who meets PLTR in Learn and again in Crash replay should be told the same thing, not two things |
| `fallSentence(result)` | The two falls in plain words under the same chart |

js/app.js already imports all three modes statically, so nothing new is loaded
for a player who never opens level 6.

### Two things a player read twice

**The 60%-in-stocks rule, stated twice in two sentences.** The allocator's floor
note said "$6,000 of the $10,000 has to sit in stocks - the 60% this level asks
for. You have $0 in stocks", and the hint under the disabled Next button said
almost exactly the same thing again. The floor note now states the rule and the
running total; the hint says only what to do - "Move $6,000 into stocks with the
+ buttons, or swap a holding for one" - and a test asserts it does not repeat the
note above it.

**The ratio, stated twice in two formats.** The reveal panel's headline is the
answer, "0.14", and the sentence under it read "...That is 14% of the index's
fall." `fallSentence()` now takes `{ compare: false }`, which leaves the last
clause off for a screen that has already made the comparison. Crash replay, which
has no headline number, still compares.

### floorNotes() grew a second kind of line

A floor on one holding needs no running total: QQQ at $3,000 is visible in QQQ's
own row. A floor on a KIND can be unmet while every row looks legal - four bond
funds, $2,500 each, nothing below its $100, 0% in stocks - so its line carries
where the money actually is. Both modes share the allocator, and Crash replay's
own build has no `kindFloor`, so it grows no line.

`buildHint()` joins guessSliderState() and starsExplanation() as a pure function
of the round, tested in node without a document. js/round.js's
`whyIncomplete()` answers the same question for a caller, naming the rule and the
dollars exactly; this is the version a player reads.

### How it was checked

Driven end to end in headless Chrome at a forced 390px viewport, as session 2.8
was. No console errors on any screen, no horizontal overflow.

| Round | What it showed |
| --- | --- |
| Level 6, four bond funds | Next disabled, the floor note at "$0 in stocks", the hint naming the $6,000 to move, PLTR's chip disabled and titled "PLTR had not listed yet - its first trading day was 2020-10-01" |
| Level 6, WMT/PG/TLT/BND | Dealt $3,000 / $3,000 / $2,000 / $2,000, 60% in stocks, slider 0 to 2.00 in 0.05 steps |
| Level 6 reveal, passing | Two lines, 24 points, legend, y-ticks $6K to $11K, x-ticks Feb 19 / Mar 6 / Mar 23. "0.14", "Your portfolio fell 5%. The S&P 500 (VOO, with dividends) fell 34%.", "0.14 clears the 0.50 needed", 3 stars |
| Level 6 reveal, missing | JPM/XOM behind the same cushion: "0.72 misses the 0.50 needed", no stars, bucket "fell with the index" both ways |
| Level 4 | Unchanged: no chart, its hiddenAi card intact, 2 stars |
| Crash replay, 2022 | Unchanged, and now reads "about 1.1 times as much as the index fell" for 50/50 TLT and VOO - the level's own warning, in the mode it points at |

652 tests pass; both check scripts are green.

### What to watch

- **A level 6 reveal still carries no "Why?" card**, which is session C. On a
  passing round the screen reads a little bare between the stars and "The idea".
- **The reveal's date line reads "Measured over 23 trading days, 2020-02-19 to
  2020-03-23"**, in ISO dates, while the chart's axis says "Feb 19" and "Mar 23".
  Every other level's line is about a rolling window where the ISO dates are the
  honest form; here the two formats sit four lines apart on the same screen.
- **The chart is drawn above the answer.** A player sees the two lines before the
  ratio, which is the order the PRD's reveal implies - the picture, then the
  number - but it is a guess about what reads best, not something that was tested.

Educational, not investment advice.

## Level 6's "Why?" card, 25 November 2026 (session 2.9c)

Session C of three, and the last of level 6. A replayed round gets a card read
off the replay: which holding moved the money, and - when that holding is one
that rose - what the same holding did in another crash in the same file.

### Why the existing rules could not be asked

why.json's ordered rules are thresholded on a covariance matrix over three
years. A replay is 23 days of one particular February, and over a crash nearly
everything correlates above 0.9: every level 6 round would have been handed the
pair card and told its holdings move together, which is both true and useless.
So the crash rules LEAD on the round, like the missed-level-5 card, and sit in no
order at all. `crashFacts()` is a separate facts builder with no covariance in it
- the facts are the per-holding dollars the replay already computes.

### Three rules, and what decides between them

| Rule | Leads on | Names |
| --- | --- | --- |
| `crashCushionElsewhere` | a pass, where the cushion ROSE here and fell harder than the index somewhere else | the cushion, plus the window where it was not one |
| `crashCushion` | any other pass | the holding that moved the most dollars the player's way |
| `crashDrag` | a miss | the holding that lost the most dollars |

**Dollars, not percent.** A holding's own move does not say how much of the fall
it accounts for: 20% of the money rising 14% matters more than 1% of it doubling.
AMZN fell 12% and BND fell 1% in one tested build, and BND - the smaller holding
- still lost less in dollars, so BND is what held that portfolio up. A card that
ranked by percent would have named AMZN and been wrong about why the portfolio
survived.

**The TLT warning is computed, not typed.** The condition is general: the cushion
rose in this window, and in another window of data/crashes.json it fell harder
than the index did there. On the 2020 window that is TLT and nothing else, because
TLT is the only holding of the 39 that rose at all - up 14.23% here, down 29.33%
against the index's 24.52% through 2022. The card states both pairs of numbers
and points at the window: "You can watch that one in Crash replay." If the data
ever stopped supporting the warning, the card would stop appearing rather than
keep asserting it. A test holds its numbers to the file.

**Signed percents, so no template has to say "rose" or "fell".** The holding that
cushions a fall sometimes rose and sometimes merely fell least - TLT +14%, WMT
-2% - and a template with "rose" in it would be wrong half the time. The direction
lives in the number, which keeps every card a template filled in rather than a
sentence chosen by code. `signedPercent(-0.001)` is "0%", not "-0%".

### The lesson portfolios

Three, in scripts/check_why_cards.mjs, checked by the script and by
tests/why.test.js. The first two are the pair: the same $2,000 TLT and $2,000 BND
behind defensive stocks and behind banks and oil, passing at 0.1415 and missing
at 0.7225. The third is a build where nothing rose at all, which is what holds
`crashCushionElsewhere` to standing itself down rather than overclaiming.

They do not go through `cardFor()` - there is no game window and no covariance in
a replay - so they have their own checker, `checkCrashLessons()`, and the script
exits non-zero on any of the six lesson sets.

### How it was checked

662 tests pass; both check scripts are green. Driven at a true 390px in headless
Chrome, no console errors and no horizontal overflow:

| Round | The card |
| --- | --- |
| Pass, WMT/PG/TLT/BND | "You passed. One thing to notice:" / "TLT is what held this portfolio up: it moved +14% while the index fell 34%, on 20% of your money. It was not a cushion every time - in The 2022 bear market it moved -29% while the index fell 25%. You can watch that one in Crash replay." |
| Miss, JPM/XOM/TLT/BND | "Here's what held you back:" / "XOM is what took this portfolio down: it moved -48% while the index fell 34%, on 30% of your money." |
| Level 4, unchanged | its hiddenAi card, word for word as before |
| Crash replay, unchanged | the 2022 window still reads "about 1.1 times as much as the index fell" for TLT and VOO |

### What to watch

- **"in The 2022 bear market" reads oddly**, because the window titles in
  data/crashes.json are written to stand alone as headings ("The 2022 bear
  market") and this template puts one mid-sentence. Left as the file's own words
  rather than giving the card a second name for the same window.
- **The drag card can name a holding the player would defend.** XOM fell 48% and
  is named; JPM fell 43% on the same money and is not. The card is about the
  biggest single loss, not about the two together, and a player who spread the
  damage over two holdings sees only the worse one.
- **Level 6 is now complete**, and the three "What to watch" notes from sessions A
  and B still stand: the level is hard (50 winners in 1,079 draws), both ends of
  the slider are unreachable by 0.02 and 0.21, and the reveal mixes ISO dates with
  the chart's "Feb 19".

Educational, not investment advice.

## Two names for a crash window, 25 November 2026 (session 2.9d)

Session 2.9c's "What to watch" said the card read "in The 2022 bear market",
because data/crashes.json had one name per window and it was written to stand
alone as a heading. Each window now carries two: `title` heads a card or a
chooser, and `inSentence` is the same name where it is one clause of something
longer.

**Written out in scripts/build_crash_data.mjs, not derived.** Lowercasing the
first word is right for "The 2020 crash" and wrong the moment a window is named
after a day or a place - "Black Monday" would become "black Monday". What holds
the two forms together is a test: the same words, differing in the leading word's
case and in nothing else, and the file agreeing with the script that wrote it.
"the January 2025 AI selloff" keeps January and AI, which is exactly the case a
derived rule would have got wrong.

`inSentence` is REQUIRED by validateCrashes(), not optional with a fallback to
the title: a fallback would have reproduced the bug quietly on a window somebody
added later.

**Four error messages had the same bug**, found by grepping for the title rather
than by looking: "PLTR cannot be held through The 2020 crash" now reads "through
the 2020 crash", and so do the two in readWindow() and the one in measureFor().
None of them was tested for its wording; they are what a player sees when a build
is refused, so they are worth the same care as a card.

Rebuilding data/crashes.json added the one field and changed nothing else -
checked key by key, including the snapshot hash. 665 tests pass, both check
scripts are green, and in the browser the Crash replay chooser still heads its
three cards "The 2020 crash", "The 2022 bear market" and "The January 2025 AI
selloff" while level 6's card reads "- in the 2022 bear market it moved -29%".

Educational, not investment advice.

## Level 7, the draws, 25 November 2026 (session 2.10)

Session A of three, and the one that has to be written before any code: level 7
is where Hypothesis 3 is measured, so how its portfolios are drawn is a research
decision, not a game decision. Every rule below is fixed here, with no player
data in existence and no level-7 result ever seen. The screens are session B and
the "Why?" card is session C.

PREREG.md's Hypothesis 3 fixes one sentence about this level: "Level 2's
portfolio and the first of level 7's mystery portfolios are both drawn at random
from one pool of 20, so on average they are equally hard." It says nothing about
where the other two come from, nothing about exclusion, and nothing about which
of three level-7 guess records the analysis reads. Those three gaps are what this
section closes.

### The exclusion, and why it does not touch the registered test

Level 7's first mystery portfolio is drawn uniformly from the pool of 20 in
levels.json, **excluding every pool portfolio this browser has already seen** -
the one dealt on level 2, and the first portfolio of any earlier level-7 attempt.
Showing a player the same portfolio twice would measure their memory of the
reveal rather than what they learned, and that failure points one way: it would
shrink the level-7 error and bias Hypothesis 3 toward "supported".

The exclusion leaves the registered sentence exactly true, and this is the
argument:

- **The marginal draw is still uniform over all 20.** Level 2 draws one of 20;
  level 7 draws one of the remaining 19. For any portfolio `j`, the chance it is
  level 7's first is `19/20 x 1/19 = 1/20`. Not approximately - exactly. So "on
  average they are equally hard" holds in full.
- **The pair is exactly exchangeable.** `P(level2 = i, level7 = j) = 1/(20 x 19)`
  for every `i != j`, which is symmetric in `i` and `j`. Under a null of no
  learning, a player's two errors are then exchangeable, which is the assumption
  the registered one-sided sign test rests on. Drawing with replacement would be
  exchangeable too; the difference is only that this version cannot repeat.

**The reading we chose, stated plainly.** A strict reading of "from one pool of
20" could mean all 20 are live every time, repeat included. We read it as: the
pool is the pool of 20, with this player's own level-2 draw removed. Both
readings satisfy the sentence; this is the one that cannot flatter the
hypothesis, which is why it is the one in the code.

**When nothing is known to exclude.** Progress is in memory only until PRD
Milestone 2 step 7 adds browser storage, and storage can be cleared or refused
at any time. A player who reaches level 7 with no recorded level-2 draw - they
played level 7 first, or their storage is gone - gets a uniform draw over all 20.
The exclusion is best-effort and **never blocks play, never throws and never
makes a player wait**: a capstone that refused to deal because a Set was empty
would be a worse game and no better a study. A repeat is possible in that case,
is rare, and is not detectable in the collected data (see the record rules
below); it is a limit of the measurement, written down here rather than
discovered later.

### Where portfolios 2 and 3 come from

They are drawn from `finalPool`, a second published pool of 20 capstone
portfolios in levels.json, generated by scripts/make_pool.mjs under its own game
seed - not 2026, which belongs to the registered Hypothesis 1 sampler and
Hypothesis 2 bootstrap, and not the pool of 20's seed either.

**Hypothesis 3 does not reach these two.** The registered sentence covers the
*first* mystery portfolio only. Portfolios 2 and 3 are free to be harder, wider
and drawn from a different pool, and nothing about them enters the hypothesis.
That freedom is used deliberately, for the reason below.

**Why a second pool at all: the pool of 20 cannot carry this level.** Its 20
answers run from 1.100 to 2.966 effective bets, so **every one of them is within
1 of 2.0**. If all three mystery portfolios came from it, a player could type
2.0 three times, never read a single holding, and pass the capstone under its own
rule of "all 3 guesses within 1". A level that can be passed blind teaches
nothing and claims something false on the screen.

So `finalPool` is built to span the range of answers that is actually attainable
over the 756-day window rather than the middle 90% of a candidate draw, from 3 to
8 holdings instead of 3 to 5, and it is split into a **low stratum and a high
stratum**. Portfolio 2 comes from one stratum and portfolio 3 from the other. The
strata edges are set so that

    (lowest answer in the high stratum) - (highest answer in the low stratum) > 2

which makes it arithmetically impossible for any single number to sit within 1 of
both. The capstone cannot be passed without reading the portfolios, and that is a
property of the data rather than a hope about players. A test enumerates every
triple the draw can produce and asserts it, so the guarantee is checked and not
merely intended.

No capstone portfolio repeats a holdings set already in the pool of 20, and the
two pools share no ids.

The measured range and the strata edges are appended to this section below, once
measured and before they are fixed. Nothing in the draw is tuned after an answer
is seen.

### Which record Hypothesis 3 reads

PREREG.md fixes the anonymous record at five fields: "a random per-browser ID,
level, guess, actual value and date. No tickers, amounts or personal data."
Level 7 locks three guesses, so it sends three records, all of them carrying
level 7, and the hypothesis needs the first. **The five fields are not changed** -
no field naming which portfolio a record is for, and no pool id. Adding one would
be a change to a registered design and would need a third amendment file, to buy
something the rule below already gives.

**The rule, fixed now: for each player ID, the analysis reads the earliest
level-2 row and the earliest level-7 row**, by the timestamp Workers Analytics
Engine puts on every row itself. That timestamp is not a field of the record and
costs nothing to have. Replays are handled by the same rule rather than by a
special case: a player's first-ever level-7 attempt is the earliest, whatever
they do afterwards.

Two client rules make "earliest level-7 row" mean "the first mystery portfolio",
and without them the rule above is empty:

1. **The three portfolios are shown in a fixed order**, and portfolio 1's guess
   is locked and sent before portfolio 2 appears. Nothing a player sees later can
   reach the registered comparison, because the comparison was already sent.
2. **Each record is sent at the moment its guess is locked, never batched.** A
   client that collected three guesses and posted them together at the end of the
   level would hand the three rows to the worker in one burst, and their arrival
   order - the only thing that distinguishes them - would be whatever order the
   requests happened to land in. Sending on lock makes arrival order match
   portfolio order by construction.

**The worker session must honour both.** /guess takes one record per request and
stores it on arrival; it must not batch, queue or reorder, and it must not
collapse several rows from one browser into one. A test on the round asserts the
first half of the bargain: one record emitted per locked guess, in portfolio
order, each one before the next portfolio is offered.

### The numbers, fixed before the pool was generated

Measured over 4,000 candidate portfolios of 3 to 8 holdings, each holding at
least one fund, over the same 756-day window the pool of 20 uses. No candidate
was dropped for too few overlapping days. The attainable range of effective bets
is **1.000 to 5.434**, with a median of 2.004 and a 95th percentile of 3.585. The
pool of 20 occupies only 1.100 to 2.966 of that - the middle - which is the
measured reason it cannot carry this level alone.

| Fixed value | Set to | Why this number |
| --- | --- | --- |
| Low stratum | 1.00 to 1.40 effective bets | 666 candidates available for 10 slots |
| High stratum | 3.60 to 4.60 effective bets | 216 candidates available for 10 slots; stops short of the attainable 5.434 so the slider can reach a guess within 1 of the top answer |
| The gap | 3.60 - 1.40 = **2.20** | Above 2, so no single number is within 1 of both. 0.20 of margin |
| Biggest holding | At most 40% of the money | The candidate sample's own average, not a tuned number |
| Guess slider | 1 to 6, step 0.1, on levels 2 and 7 alike | Covers 4.60 + 1, so a player can always land within 1 of the highest answer |

**Why the 40% cap exists, and it is the rule that matters most here.** Effective
bets rises when money is pushed into one holding, with the holdings themselves
unchanged. Measured on five fixed names - VTI, VXUS, BND, GLD, JNJ - moving VTI
from $2,000 to $9,600 while the other four shrink takes the answer from 1.576 to
2.683 without a single name changing. That is the PCA limit docs/PRD.md already
names: "principal components are blends of holdings, not holdings themselves."

Without a cap, some high-stratum portfolios would earn their high answer through
dollar concentration rather than through holding things that behave differently -
and a player who had learned the game's fourth learning goal, "spread risk across
groups that really behave differently", would be marked wrong for applying it.
The capstone is the one level where that is least forgivable.

The cap applies to both strata equally, so it cannot shift the level's answers in
one direction. **It does not touch the pool of 20**, which is part of the
registered Hypothesis 3 comparison and is not edited here or anywhere else.

Across designs the measure behaves the way the game teaches, which is why only
the within-design case needed a rule: candidates scoring 3.50 and up average 7.0
holdings across 5.3 groups, against 4.8 holdings across 3.7 groups for those
below 1.25, and the biggest holding's share of the money correlates -0.108 with
the answer - no relationship worth the name.

### The one hand-placed portfolio, and why it is labelled as one

Nineteen of `finalPool`'s 20 portfolios are drawn. One is placed by hand: **VOO
$3,400, QQQ $3,300, NVDA $3,300**, which scores 1.167 effective bets and puts 34%
in its largest holding, inside the cap and inside the low stratum.

It is docs/PRD.md's own example, and the sentence the game is named after: "An
S&P 500 fund, a tech fund and NVIDIA can rise and fall together, so a player
holding all three made something closer to one trade. That is the name." No
portfolio in the pool of 20 is that trio, and 8,000 random candidate draws did
not build it. A capstone that left it to chance would almost certainly never show
a player the case the whole game is named for.

It carries `handPlaced: true` and its reason in levels.json, beside the drawn
nineteen, so that nobody reading the pool has to work out why one entry is rounder
than the rest. A published pool with one hand-placed entry and a label is honest;
a published pool with one hand-placed entry and no label is not.

### Level 2's slider changes to match level 7's

Level 2's guess slider ran 1 to 5. It now runs **1 to 6, step 0.1**, the same as
level 7's.

Hypothesis 3 compares a player's level-2 guess error with their level-7 guess
error, and nothing else. Two different ranges would put the two guesses on two
different instruments: the midpoint moves, the distance a drag covers changes,
and where a slider sits before it is touched is a known anchor. An improvement
measured across a changed slider could be the slider rather than the learning,
and there would be no way afterwards to tell which. One slider on both levels
removes the question instead of arguing about its size.

The slider's range is not a registered value - PREREG.md's "Values fixed at
registration" table does not carry it, and the hypothesis fixes the pool, the
error and the thresholds rather than the control. Changing it is therefore
allowed, and it is being changed **before any player data exists**, which is the
only time it could be changed honestly. The star bands of 1 and 0.5 bets, the
pass rule and the pool of 20 are all untouched; only the range a guess is typed
on moves, and it moves on both levels at once.

Educational, not investment advice.

## Level 7, the screens and the card, 26 November 2026 (sessions 2.11 and 2.12)

Sessions B and C together: the three-portfolio screens and the "Why?" card for a
finished series. Session 2.10 fixed the draws and the rules; this puts them on a
screen. Level 7 is now playable, and the menu offers it.

### The shape of a three-question level

Each portfolio gets the ordinary build, guess and reveal screens - the same three
functions levels 1 to 6 use, with no copy of them - and a progress marker,
`Level 7 · Portfolio 2 of 3 · Guess`, in the line that used to read `Level 7 ·
Guess`. That marker is the only thing on those screens saying the level is not
over; without it the second portfolio reads as a replay of the first.

**A part's reveal stops at the answer.** It shows the number, the guess, the
holdings and the window, and then the way on - no stars, no card, no verdict.
Level 7 is decided by three guesses and two of them may not be in yet, so a
verdict there would be one the level's own rule could contradict two questions
later. `js/round.js` already returns `passed: null` and `stars: null` for a
series part, and the screen is that decision honoured rather than repeated:
`renderReveal` branches on the null, not on the level's id.

**The summary is its own screen**, and it exists because a player who has just
been told about portfolio 3 cannot see the shape of their own three errors, which
is the thing worth seeing on a capstone. The three answers are laid out together
with what each held, what it answered and what was guessed, each row marked by a
bar down its left edge - a bar rather than colour alone, so which guesses landed
is readable without telling two greens apart.

**`ctx.round` is kept in step with the live question**, so `renderBuild`,
`renderGuess` and `renderReveal` need to know nothing about series at all. One
`startRound()` still starts every level: it asks `isSeries()` and builds a series
or a round, so a menu button, a "Next level" button and a replay all reach the
right one without any of them knowing which levels are which.

### Three things the screens got wrong, found by playing them

None of these came from a test. They came from driving the level at 390px.

| What it read | What it reads now |
| --- | --- |
| "Your starter portfolio" on all three | "Mystery portfolio 2 of 3" - nothing about the seventh level is a start |
| "drawn at random from a pool of 20" under all three | Only under the first, which is the only one it is true of; the other two say "from the capstone pool" |
| "Portfolio 1: 1.2 bets" on the summary, after the reveal had said "1.20" | Both say 1.20. A revealed answer is worth two decimals; `guess.places` describes the slider, which moves in tenths |

The third one is the rule `resultLine()` already wrote down, applied in a second
place that had quietly read the slider's places instead.

### A true 390px viewport, which is not what a 390px window gives you

Headless Chrome clamps its window to 500px wide on macOS, so `--window-size=390`
renders at 500 and the screenshot is a 500px layout cropped to 390 - which looks
exactly like a page overflowing its viewport, and was read as one for a few
minutes. An iframe has a viewport of its own: inside a 390px frame,
`innerWidth` really is 390 and width media queries match 390. Measured rather
than eyeballed: `documentElement.scrollWidth` is 390 against a `clientWidth` of
390 on every screen of the level, so there is no horizontal overflow at that
width.

### The card for three guesses

Every card above this one names something inside ONE portfolio - a pair that
moves together, a group holding most of the risk. A capstone card has a better
thing to name: the shape of a player's three errors, which on this level is the
misconception itself rather than a symptom of it.

| Card | Fires on | What it names |
| --- | --- | --- |
| `readThePortfolios` | worst error at most 0.5 | The level's own three-star band, so this card fires on exactly the rounds that earned three stars |
| `sameNumberThrice` | all three guesses identical | The likeliest way to fail: one number, which the strata make certain to fail |
| `oneNumberThrice` | all three within 0.5 of each other | A hedge that was not quite flat |
| `countedHoldings` | a full bet high, on 5+ holdings | Holdings counted instead of bets - the mistake the game is named after |
| `missedTheSpread` | a full bet low, on 3+ real bets | The same mistake from the other side: not every long list is one trade |
| `mixedThree` | nothing else | Close on some, wide on another |

**The order was wrong first, and playing it is what showed that.** A hedge also
looks like `missedTheSpread` - typing 2.00 three times is a full bet low on the
4-bet portfolio - so with the directional cards first, a hedged player was told
about the spread rather than about the hedge. The narrowest diagnosis has to
speak first or it never speaks at all.

**`sameNumberThrice` is a separate card from `oneNumberThrice` for the same
reason.** One card for both read "Your three guesses ran from 2.00 to 2.00 - 0.00
bets apart", which is what a spread-shaped sentence does when the spread is zero.
Two cards, two templates, no prose assembled from parts.

**No lead-in.** The lead-ins are verdicts about one guess - "that was close" -
and the summary states its verdict and its stars directly above the card, worked
out from all three. A fourth verdict in a fifth voice is the same news again.

### What is not covered where you would look for it

`scripts/check_why_cards.mjs` samples which card a PORTFOLIO gets, and a series
card is chosen from three guesses, so none of the six can appear in its table.
The script now says so rather than leaving a silent absence, and names where the
cover actually is: tests/series.test.js holds one named guess pattern per card to
the card it must get - the same discipline as that script's lesson portfolios,
which exist because a random sample once missed five AI stocks reading "nothing
stands out here".

712 tests pass, both check scripts are green, and level 7 plays end to end in the
browser at 390px: a pass at three stars, a pass at two, and a miss that hedged.

Educational, not investment advice.

## The daily "Same bet?" puzzle: the builder, 26 November 2026 (session 2.13)

docs/PRD.md, Feature roadmap Tier 1: "Five ticker pairs a day, the same for
every player, picked from the date." This session built the half that makes a
day's puzzle exist - `scripts/build_puzzles.mjs`, `data/puzzles.json` and the
`dailyPuzzle` rules in levels.json. The screen is the next session.

### Why a day's puzzle is written down rather than computed in the browser

Not for speed. docs/PRD.md, "The committed price snapshot is the reference
data", records that Yahoo's adjusted closes are not reproducible between
fetches: refetching KO disagreed with the committed snapshot on 1,731 of 2,513
days, by up to 8.1e-7 relative, and across the universe by up to 1.2e-6. That is
orders of magnitude below anything that moves a verdict, and quite enough to
move a pair sitting at 0.7000003 across a bucket edge - for the same date, after
somebody answered it. Add the weekday rebuild of data/game.json, which slides
the 252-day window every evening, and a correlation computed in the browser is
simply not the same number twice. So it is computed once and frozen.

### The freeze rule, and the hole in the first version of it

An entry may be written or rewritten only while its date is still in the future.
Stated as a check on a change: every entry that differs from the previous
committed version must be dated AFTER the New York date of the version doing the
changing.

The first version of this read the boundary off the PARENT commit's date, and
that leaves today unguarded. Wednesday evening's refresh has Tuesday's commit as
its parent, so a Tuesday boundary would let it rewrite Wednesday's entry while
Wednesday was being played. The test named WEDNESDAY in tests/puzzles.test.js
pins both halves: the rule catches it, and the parent-dated version does not.

Comparing against HEAD alone has the opposite failure. In the Tests workflow the
pushed commit IS HEAD, so the working tree and HEAD are the same bytes and the
comparison can never fail. The test therefore makes two comparisons - the
working tree against HEAD, read against today, which is what the refresh
workflow runs before it commits; and HEAD against its parent, read against
HEAD's own committer date, which is the one with something to say after a push.
Both checkouts are now `fetch-depth: 2`.

### The pairs teach, and that is a rule with numbers in it

A random five pairs would be nearly all "different bets": over the 252-day
window on 25 November 2026, of the 780 pairs, 546 fall below 0.3 and only 29
reach 0.7. So each day holds all three answers, two of one, two of another and
one of the third, and at least one SURPRISE - a pair whose answer disagrees with
the groups in tickers.json. Kind A is the same bet from different groups
(VXUS/QQQ at 0.82); kind B is different bets from the same group (ADBE/CSCO at
-0.08).

**Which answer gets the single slot is weighted, not even, and the weighting is
the whole reason the puzzle is playable daily.** Even weights spend 1.67
same-bet pairs a day out of a pool of 24, so a pair comes round every 8 days and
a daily player starts recognising VOO/VTI inside a fortnight. At 5:1:1 - "the
same bet" takes the single slot on 5 days in 7 - the shortest gap is 15 days and
the mean 19.

**A longer no-repeat window makes this worse, not better.** Measured over 60
days at these weights: 14 days gives a shortest gap of 15 and never relaxes; 16
gives 17; 18 gives **12** and relaxes on 3 days; 20 gives **11** and relaxes on
12. Past about 16 days the 24-pair pool cannot fill the window, the ladder
halves it, and the result is shorter gaps than the rule that was not stretched.
So the window stays at 14 and the ladder is a safety net that currently never
fires.

**The cost of the weighting, stated:** a player who always answers "different
bets" now scores 1.85 of 5 rather than 1.68. Still under the cap of 2 - no
constant answer can reach 3 of 5, which is what the cap is for - but "different
bets" is the best lazy answer by 0.6 of a point instead of 0.06.

### The guard band

A pair within 0.05 of a bucket edge is never used. The puzzle scores a bucket
with no slider and no partial credit, so NVDA/QQQ at 0.7099 is a coin flip
rather than a question. It drops 84 of the 780 pairs. This is the opposite of
level 1's pool, which deliberately keeps VTI/VXUS at 0.7997 as a near miss,
because there the player types a number and sees four decimals.

### The two windows disagree, visibly, and both screens say which they used

The puzzle reads 252 days, as docs/PRD.md asks; the levels read 756. VTI and
VXUS correlate 0.7997 over 756 days and 0.8655 over 252, so the same pair is a
near miss on level 1 and the same bet in the puzzle. That is the window, not a
bug, and the reveal names its own window so the two screens cannot look like
they contradict each other.

### What is counted rather than dropped quietly

Every pair the builder discards is counted into the entry: inside the guard
band, short of 252 days, or named in tickers.json but absent from game.json.
Each entry also records how many candidates each answer had left after the
no-repeat rule, and which rung of the ladder it used. A guard band that quietly
ate half the pool would otherwise look exactly like one that ate three pairs.

### Where the numbers came from

The selector was prototyped and simulated for 60 and 180 days BEFORE
scripts/build_puzzles.mjs was written, and the script then reproduced the
prototype's figures exactly - shortest gap 15, mean 19.1, kind A leading 21
days, always-different 1.85. Two implementations agreeing is worth more than
either one agreeing with itself.

### A future date is REBUILT each evening, not merely filled in

Worth stating plainly, because the two behaviours look identical most nights.
`extendLedger` keeps every entry dated on or before today and throws the rest
away, then builds the whole horizon again from tonight's prices. So tomorrow's
puzzle is computed from last night's closes rather than from whatever the pool
looked like a week ago, and the horizon is a buffer against missed evenings
rather than a week of work done in advance.

The first attempt to demonstrate this showed nothing: perturbing every return by
`v * 1.03 + 1e-4` left all seven future days identical, because an affine
transform of two series leaves their Pearson correlation exactly unchanged.
Re-run with independent noise per ticker, the candidate pool moved - 24 same-bet
pairs became 14 - and all seven future dates came back different. The
demonstration was wrong, not the behaviour.

Only dates in the future are touched. A build that would change a date that has
arrived refuses before writing anything, and says which dates and why.

### The live-pool checks do not run in the test suite

They did, and they could have blocked a price commit. `node --test` runs in the
refresh workflow BEFORE the commit, so a test asserting "today's market still
offers a same-bet pair" would, on the evening that stopped being true, keep that
evening's prices out of the game as well. docs/PRD.md weakness 3 is exactly this
- live data moves the goalposts - and scripts/check_levels.mjs already answers
it by running after the commit.

So the market-shaped assertions moved to `scripts/build_puzzles.mjs --check`,
which the refresh workflow runs after it has pushed, beside the level check. It
colours the run and never withholds the data. What stayed in the test suite is
the thing a commit can actually break: that every ticker in tickers.json has
prices in game.json, that --check reports a thin pool rather than throwing at
it, and that daily.json matches the ledger.

**One blocking path is left, deliberately.** If no day can be built at all, the
builder itself throws and nothing is committed. That is not a goalpost moving;
it is a day with no puzzle, and there is nothing to ship.

### Two puzzle files, and only one of them is for the game

`data/puzzles.json` is the full record and keeps every day ever played.
`data/daily.json` is today through today + 7, copied out of it without being
rebuilt, and it is the only puzzle file the game loads. At about 1.5 KB an
entry the ledger passes 500 KB inside a year, which is not a download to ask for
in order to play one morning.

Sliced, not recomputed, and the test says so with `assert.equal` on the object
rather than `assert.deepEqual` on its contents: a rebuilt entry that happened to
come out identical would pass a deep comparison and still be the beginning of
two files drifting apart. A second test holds the committed pair to each other,
so a hand-edited daily.json fails.

748 tests pass. The git freeze check skips until data/puzzles.json is committed,
and runs from the first push after that.

Educational, not investment advice.

## Why the refresh went red twice, and what now survives, 26 November 2026 (session 2.14)

Two failures, one evening, and they were not the same failure. Worth separating,
because the obvious reading - "the refresh is broken" - would have had me fixing
the wrong thing.

**Run 2, the scheduled one at 00:15 UTC**, failed in tests/liveRolling.test.js:
the live half of the rolling chart joined the frozen half 1.3e-7 away, against
an assertion of 1e-9. That is Yahoo re-adjusting old closes, which docs/PRD.md
already measures at up to 1.2e-6 relative, and f4d5fd6 had already replaced that
bar with JOIN_TOLERANCE 42 minutes later. Nothing left to fix.

**Run 3, the dispatch at 01:24 UTC**, is the real one: "AAPL has no value on
2026-11-25". Re-fetching the same window this morning returned that bar for all
42 tickers, and the rebuild went through, so the close had not been published
when the job asked - more than four hours after the market closed. I cannot
prove from here that it was late publishing rather than a transient hole that
has since healed; what is established is absent-then, present-now, and both have
the same answer.

### A short tail is not a gap, and the error said it was

js/returns.js checks a ticker's interior days only BETWEEN ITS OWN first and
last date, so a ticker whose prices simply stop early is not an interior gap at
all. It arrives as a trailing null, and checkGameData then reported it as a hole
"inside its own history". Two different faults wearing one error message: one of
them is a bar that is a few hours late, the other would turn one day's return
into two days' worth. trimIncompleteTail() drops the first before the file is
built; checkGameData now tells them apart in its wording as well, in case
something else ever produces one.

**The cut is the newest date EVERY ticker has, and ^GSPC is a ticker.** When the
calendar ticker is the one lagging, every other series holds a date the calendar
does not, and js/returns.js refuses that too - the same complete evening thrown
away for the same reason. Taking the oldest last-date across all 42 series
handles both directions without a special case. At most 2 days may be dropped;
a third is a feed that is broken rather than slow, and the message then names
the series that stops earliest, because a delisting looks identical to a late
bar until you read which ticker it is.

### One bad evening used to take the whole job with it

Every step that can fail on DATA rather than on code is now continue-on-error,
and a final step adds them up and colours the run. So a failed rebuild still
builds and commits the puzzle from the committed game.json; a failed puzzle
build still commits the prices; and either way the run ends red. The fetch
itself stays outside that tally, deliberately: a red X every time Yahoo hiccups
is a red X nobody reads, which is the rule this file already had.

**The gate reads `outcome`, not `conclusion`.** continue-on-error rewrites a
failed step's conclusion to "success" - that is its entire purpose - and leaves
the outcome as "failure". A gate written on conclusion is green every time,
including the evening everything broke, and it would look right in review.
tests/workflow.test.js pulls the gate's own expression out of the YAML and
evaluates it against made-up outcomes, so what is tested is what the condition
DOES; one of those tests builds the conclusion-based version and asserts that it
is blind, so the bug cannot be reintroduced as a cleanup.

### The tests stay a hard gate, minus the four that read two downloads

A failing test means the code that built this data is suspect, so nothing is
committed on red. But run 2 shows a test can go red because Yahoo re-adjusted a
price three years ago, and that must not keep tonight's prices out of the game.
Four tests compare numbers that came from two different fetches:

| Test | Why it spans two fetches |
| --- | --- |
| liveRolling: the live half joins the frozen half | live game.json against frozen results.json |
| liveRolling: the committed files produce a tail | the same join, via liveTailState's own guard |
| research: rollingTail() reads the basket off the results file | the same join again |
| crash: where a window overlaps game.json, the two files agree | frozen crashes.json against live game.json |

They are skipped by ONE_TRADE_SKIP_CROSS_FETCH in the pre-commit run and run
again after the commit, beside check_levels.mjs and build_puzzles.mjs --check.
On an ordinary push the flag is unset and all four run normally, because there
game.json is the committed file and does not move.

### Tonight and tomorrow

Tonight is Thanksgiving, so there is no 26 November bar and nothing to trim; the
newest date stays 25 November, one weekday inside the staleness allowance, and
the puzzle's horizon is unchanged. game.json will still commit, because
re-fetching the same 756 days moved 17,443 of its cells by up to 1.07e-6. That
is Yahoo's rounding, it is three decimal orders inside anything the game shows,
and it is why the 0.05 guard band around a bucket edge matters: a drift of 1e-6
cannot move a pair across an answer.

Tomorrow is a half day. Nothing in the pipeline reads session length.

768 tests pass.

Educational, not investment advice.

## The daily "Same bet?" screen, 26 November 2026 (session 2.15)

The player's half of the puzzle: js/daily.js (pure logic), js/dailyView.js (the
screen), js/storage.js and js/config.js. The builder was session 2.13.

### The screen loads two files, and the reason is in each of the three it does not

data/daily.json and tickers.json. Not data/puzzles.json, which keeps every day
ever played and passes 500 KB inside a year. Not data/game.json, because a day's
correlations were worked out the evening before and recomputing them here would
let an answer move under somebody who had already answered it. Not levels.json,
because the words for the keys an entry stores now travel in daily.json's meta,
copied from levels.json by the builder - so levels.json is still the one place
"the same bet" is written, and the screen still fetches two files.

### A bug found by needing those words, and the test that was missing

dailyFile() took `{ days, meta = {} }` and the caller passed the meta fields at
the TOP level:

    dailyFile(after, today, { days, liveThrough, timeZone, windowDays, ... })
                             ^ `days` binds; everything else lands in nothing

So liveThrough, timeZone, windowDays and answersFrom had been dropped on the
floor since the day they were written. The written file was valid, the screen
had not been built yet, and nothing was missing that anything asked for. It
surfaced only when a fifth field had to arrive and did not.

**Why every test passed.** They called dailyFile() directly and asserted on
slicedFrom, from and to - keys the function sets ITSELF. A caller passing an
option the callee never reads is invisible to a test that calls the callee. The
coverage of the function was fine; what nothing did was RUN THE SCRIPT and read
back what landed on disk.

That test exists now: tests/puzzles.test.js runs scripts/build_puzzles.mjs as a
child process into a temporary directory, the way the workflow runs it, and
checks every meta field the screen reads, that the words are level 1's own, and
that each written entry is byte-for-byte the ledger's. Reintroducing the old
signature fails it with "the written data/daily.json has no meta.liveThrough;
the screen reads it", which was checked by doing exactly that and putting it
back.

The lesson is narrower than "test more". A function and its one caller are a
seam, and a seam between an options object and a destructuring parameter fails
SILENTLY in JavaScript - no error, no undefined to trip over downstream, just a
field that is not there. Where that seam is the only thing between a build and a
file somebody else reads, something has to run the whole script.

### Lock, then reveal, and the save goes first

Three buttons; a click commits the answer, disables the lot and shows what the
prices did. The write to storage happens BEFORE the reveal is drawn, so a reload
at the wrong moment lands on the next pair rather than offering a second go at
one already seen. lock() ignores any index that is not the one in front of the
player, which is what makes a double click, a stale button and a second tab all
do nothing.

### Midnight, mid-puzzle

A player who starts at 23:55 and answers their third pair at 00:02 has not
finished yesterday and has not started today. Taking the half-finished puzzle
away at midnight would delete work in progress, so an unfinished day keeps the
screen until it is done and the new day is then OFFERED, with a button, rather
than imposed. A finished day does not hold the screen: the next morning starts
the new one. A half-finished day that has aged out of the eight-day file is gone
and is not resumable, which is the one case where work is lost and the only
honest answer, since the entry it was played against is no longer there.

### lock() lost the document, and only one test could tell

lock() rebuilt the next state from a document it made up on the spot - one
entry, the day being played:

    stateFor({ entries: [state.entry], meta: state.meta }, ...)

Every question that state answers is about the day in hand - which pair is next,
what the score is, whether it is finished - and a one-entry document answers all
of them correctly. Exactly one question is about the OTHER days: "is there a new
day waiting?", which that document can only ever answer no.

So it was right everywhere except the end of a carried-over puzzle, where a
player who finished yesterday's five pairs after midnight would be told nothing
was ready and shown no way to today's. The state now carries the document and
the date it was computed for.

It was caught by the second half of the midnight test - the half that plays the
carried-over day to its end and then looks for the button. A test that had
stopped at "the player can resume" would have passed. The case worth testing was
not the resume, it was what happens after it.

### The share text is checked for what is NOT in it

A spoiler-free grid is only spoiler-free if nothing else in the message gives
the day away, so the test takes the entry apart and searches the share text for
every ticker, every answer label, every answer key, every correlation and the
word "surprise". Two different days with the same pattern of right and wrong
produce the same grid, which is asserted rather than assumed.

### Testing a screen in a project with no DOM library

The other views are checked by being played, which leaves the first render
happening for the first time in front of a player. tests/dailyView.test.js
carries a sixty-line stub of the handful of DOM calls this screen makes -
createElement, append, replaceChildren, querySelector by class, click - and
renders the whole thing in node. It is not a browser and does not pretend to be;
it catches the words not reaching the screen, which is what unit tests of pure
functions cannot. Playing it in a real browser is still worth doing.

### The share link is written down, not inferred

GitHub Pages went live during this session, serving the site and data/daily.json
from main, so ABOUT.url is set to https://mayaagge.github.io/one-trade/ rather
than left to fall back to the page the code is running on. The fallback is
correct in both places it normally matters and wrong in the one that bites: a
share made while testing on localhost:8000 would post a link only that laptop
can open.

### Previewing a day that has not arrived

mountDaily() takes `now` and `storageKey`, so another date can be rendered from
the console without editing anything or writing over a real record. Today the
ledger starts tomorrow, so the screen anybody opens says "Today's puzzle isn't
ready yet. Come back tomorrow." - which is the first state the game will ever
show, and is therefore the first one built and the first one tested.

824 tests pass.

Educational, not investment advice.

## The share card, 26 November 2026 (session 2.16)

Milestone 2 step 8, part 1. A "Share my score" button on every reveal that has
a verdict, making a 1080 x 1080 image: the level, the stars, one headline built
from that level's own measure, the link and "Educational, not investment
advice." New: js/shareCard.js, js/share.js, tests/shareCard.test.js,
tests/share.test.js, tests/gameShare.test.js, tests/stubDom.js.

### The card is decided before it is drawn

shareCardContent() returns the whole card as plain data and drawShareCard()
paints that object without adding a word. So everything a player can post is
decided by a function node can run, and the tests scan the finished text rather
than reading the templates. tests/shareCard.test.js checks the drawing too, with
a canvas that records what it was asked to paint: every string reaching fillText
has to be one the pure function already decided on.

### The headlines live in levels.json

Seven templates, one per level, in each level's new "share" block, filled from
the measure the reveal screen printed - so the card and the screen cannot
disagree about the same portfolio. A headline in code would have been a seventh
place where a measure is described, and the one nobody would think to check.

Two values break their own sentence, and both are reachable, so two levels carry
a second line named for the condition it covers:

* Level 6 at or below zero. guessNote records a legal build at -0.117, a
  portfolio that ROSE 3.96% while the index fell. "Fell -0.12 times as far" is
  not clumsy, it is false.
* Level 4 below zero. bucketNote records that a portfolio can move slightly
  AGAINST the basket.

Every headline was read back for a pass AND a fail before anything was drawn.
Level 5's survives both because maxRiskShare is the biggest share either way:
"No holding carries more than 48% of my risk" is true on a miss.

### Level 7's bands are the rule, not a description of it

seriesVerdict() awards 3 stars for all three within 0.5, 2 for exactly two, 1
for the pass rule alone - all three within 1 - and 0 for failing that. The four
band strings say exactly those four things, and the test builds them by running
seriesVerdict() on answer sets rather than by naming a star count, so a band and
the rule that earns it cannot drift apart.

### js/share.js, because the puzzle had it first

The clipboard fallback, the share sheet and the link helpers were inside
js/dailyView.js, where only the daily puzzle could reach them. They are in
js/share.js now, with shareUrl() moved out of js/daily.js and re-exported there
so every caller keeps the import it had. The daily puzzle's share tests pass
unchanged, which is the check on the move.

One thing the card needed that the puzzle did not: fonts. A canvas paints with
whatever is loaded when fillText runs, so drawing before the fonts arrive
measures one face and paints another, and the headline is wrapped to a width it
is not drawn at. fontsReady() asks for the exact sizes and weights the card uses
and then waits on document.fonts.ready.

### Where the button is, and where it is not

Not on one of level 7's three parts. There is no verdict there yet - the level
is decided by all three guesses - and a card offered after portfolio 1 would be
a card about a portfolio two more players are about to be dealt. That is the
early return renderReveal() already had, so the share row sits after it; and
tests/gameShare.test.js renders all three parts and the summary to check it.

That test needed the DOM stub tests/dailyView.test.js grew, so the stub is
tests/stubDom.js now and two screens are checked against one idea of what a
document is.

### Two levels must not say the answer, and the file enforces it

Levels 2 and 7 are dealt their portfolios from the Hypothesis 3 pools, so the
same portfolio reaches other players. Their cards carry the stars and a band -
"within half a bet" - and NEITHER the answer NOR the guess. docs/PRD.md's
share-card paragraph says so now; it used to say the card "includes stars and
the bets number", which on those two levels would have been a spoiler.

That rule is checked three times over, and only one of them is a test:

1. `hidesValue()` reads `holdings.fixed`, so the two pool levels are found in
   the data rather than listed as "2 and 7" in code. A pool level added later is
   covered the day it is added.
2. `validateShare()` in js/levels.js refuses to load a levels.json whose dealt
   level carries `{value}` or `{holdings}` in its headline. The game does not
   start with a card that would spoil its own pool, so the rule cannot be broken
   by editing the data and running the tests that are left.
3. The test that matters is a property, not a string match: two level-2 cards
   built from the same stars and DIFFERENT answers come out `deepEqual`. A
   friend who draws the same portfolio learns nothing from either card, which is
   the actual requirement - no list of forbidden substrings can say that.

The thing easiest to get wrong here is the guess, not the answer. "Within half a
bet" is spoiler-free on its own, and a full answer beside a posted guess.

### Three wording fixes, after reading all seven out loud

Every headline was printed for a realistic pass AND a realistic fail, played
against data/game.json and data/crashes.json rather than typed out. Three things
only showed up that way.

**A low band cannot end with "Can you?"** That ending invites a friend to match
the result, which on a card that fell short invites them to do worse. The ending
is per band now, beside the band words: level 2's 1-star card ends "Can you get
closer?" and level 7's 0-star card ends "Can you get all three?". Every other
band keeps "Can you?", and the levels that print a number needed no second
ending at all - "Can you beat it?", "get lower?", "spread it thinner?", "fall
less?" each name a direction, so the same sentence asks for better whether it
passed or failed.

The two second lines are the other way round: level 4's "moves against the AI
basket" and level 6's "did not fall at all" are the best thing that can happen
on their levels, so asking a friend to match them is right. Level 4's now ends
"Can you do the same?", and level 6's keeps "Can you?". tests/shareCard.test.js
pins all four cases rather than applying one blanket rule, because the blanket
rule flagged level 6 and was wrong to.

**Level 1 reveals three decimals now.** VOO and VTI correlate at 0.9962, which
`toFixed(2)` turns into "1.00" - a claim that two holdings move together
perfectly, on a number that is not that, and the card posts it. levels.json
carries `revealPlaces: 3` on level 1 alone; js/levels.js's displayFor() hands it
to the panel, the result line, the "Why?" card and the share card together, so
the four cannot disagree about one pair. The GUESS keeps the slider's own two
decimals: it is a value a player set in hundredths, not a measured answer.

That change found a real seam. tests/why.test.js asserted that one pair reads
the same whether its card is reached through a level or through
check_why_cards.mjs's level-less rule path, and with a per-level precision those
two were no longer the same question. cardFor() takes the places now, and the
test asks for level 1's - the invariant is that a pair reads one way ON a level,
not that a level-less card rounds like a level's.

857 tests pass.

Educational, not investment advice.

## The weekly challenge, 26 November 2026 (session 2.17)

Milestone 2 step 8, part 2. One mystery portfolio a week, the same one for
everybody, changing at midnight New York time on Monday. New: js/weekly.js,
js/weeklyView.js, tests/weekly.test.js, tests/weeklyView.test.js, and a weekly
block in levels.json.

### The window question, answered before anything was built

Every player in a week has to get the same answer, and data/game.json is rebuilt
every weekday evening. Three measurements decided the design:

* **The file does not keep enough days.** It holds exactly 756 rows ending on
  the latest trading day, so a 756-day window ending on the previous Friday
  falls short by one day on Monday and five by Friday.
* **Anchoring on the Friday leaves a drift of 0.0217 bets** across a week, worst
  case over the ten portfolios and eight sample weeks - the far end of the
  window slides as old days drop off the front. The star bands are 1 and 0.5, so
  this cannot change a star; it can move the second decimal.
* **Yahoo re-adjusting past closes is worth 7.3e-7 bets.** Measured by diffing
  two committed versions of data/game.json: 99% of the values changed between
  refreshes, the worst by 1.16e-6 on a daily return, and the worst effect on an
  ANSWER was seven orders of magnitude below the 0.01 the screen prints.

So no frozen ledger. A ledger would be a second file, a second builder and a
second freeze check to defend a number that moves less than the screen can show.
The window ends on the Friday before, in windowEndingOn() - gameWindow() with a
different right-hand edge, which returns the identical object when asked for the
file's last day, and tests/weekly.test.js checks that rather than assuming it.
Making the drift exactly zero costs one constant - keeping 766 days in the file
instead of 756 - and that is its own commit, after this one.

A holiday Friday needs no holiday calendar: anchorTradingDay() asks the prices
which days exist rather than working out which ones should.

### Spacing the ten so one number cannot win

The first draft had six of ten answers inside 1.3 +/- 0.5, so a player typing
1.3 every week earned 3 stars six weeks out of ten. The rule now: no four
answers within a bet of each other, which caps a constant guess at 3 of 10. The
ten run 1.11, 1.25, 1.52, 2.17, 2.37, 2.75, 3.22, 3.45, 3.84, 4.40, and the
tightest four are 1.053 apart.

**The thirds could not be thirds, and the arithmetic says why.** Three of the
ten were kept deliberately (1.11, 1.25, 1.52 - two teaching pairs), and those
three already fill one 1.0-wide window. Any fourth answer below 2.11 would make
four, and 2.11 is above the 1.5 line, so "below 1.5" is capped at exactly two
portfolios while those three stay. The split is 2 / 3 / 5.

The same squeeze dropped both portfolios that were going to carry the bonds
card: the three-fund starter at 1.05 sits inside the kept trio's window, and
"everything except shares" at 1.90 is within a bet of 1.11.

The test that guards all this computes the answers from the live data rather
than from numbers written down beside the portfolios. A market that moves the
ten together should turn the run red - that is the moment somebody needs to
know, and it is the same bargain the weekly level checks already make.

### A card that leads on one mode

The bonds lesson - bonds steady a portfolio, and effective bets counts risk
rather than money, so the quiet holding adds least to the count - is a rule in
why.json like every other card, not text attached to two portfolios.

Putting it above riskGapOver in the order broke two lesson portfolios in
scripts/check_why_cards.mjs whose written-down lesson is the opposite emphasis:
in "a small volatile holding among bond funds", the point is the holding
CARRYING the risk, not the bonds that are not. Both portfolios are the same
shape, and only the intended lesson differs - so no threshold could separate
them.

The answer was already in the file: `leads`. A rule with one leads outside
why.json's order and speaks only on the round it names. quietNotABet leads on
`mode: "weekly"`, so it is the card on the two weekly portfolios built around a
quiet bond fund and is silent on every level. `mode` joined `measure` and
`passed` in LEAD_MATCHES for it.

### Nothing is sent, and the card says nothing

A weekly guess is not one of the two messages docs/PRD.md allows the Worker, so
no record is made: createRound() has no emitter and none is given one.
tests/weeklyView.test.js plays a week with fetch watched and asserts the only
requests are the four files the screen reads.

The share card hides the answer, and this is a WIDER leak than levels 2 and 7,
not a narrower one: everybody has the same portfolio this week, so one posted
number would be the answer for every player who had not gone yet. The card
carries the stars and a band, and never the guess. It does not carry the
portfolio's NAME either - "Gold, bonds, oil and staples" is a list of the
holdings in words - so the card says "Weekly challenge, week of 30 November
2026" and nothing about what is in it. hidesValue() reads share.hidesAnswer when
the file states it and still defaults to hiding anything dealt.

### What the weekly borrows

The round, the slider, the reveal panel, the "Why?" card, the stars and the
share card, all unchanged: levels.json's weekly block is level-shaped, so
createRound() takes it as a level with `level:` handed in. Two things it does
not borrow - the window, which ends where it says, and the buttons at the end of
a reveal, which moved into ctx.afterReveal(). Learn still offers the next level
and a replay; the weekly offers neither, because its next portfolio comes on
Monday and playing again would be a second go at the week.

### Keeping a spare week in game.json, 26 November 2026 (session 2.17b)

The weekly challenge's window ends on the Friday before its Monday, and the
file is rebuilt every weekday evening keeping only the most recent days - so
that anchored window lost one trading day per rebuild and the answer moved by
up to 0.022 bets across a week. FILE_DAYS is now GAME_DAYS + 10: the file keeps
766 trading days, the game's window is still the most recent 756 of them, and
the anchored window is the same 756 rows every day of a week.

**Every reader takes its own window, which is what made this safe.** js/round.js
asks for levels.json's 756 (or the weekly's anchored 756); scripts/
build_puzzles.mjs asks for the daily puzzle's 252; scripts/check_why_cards.mjs
passes its own; js/liveRolling.js anchors on the freeze date and only ever
complains that the file reaches back too LITTLE. The one place coupled to the
row count was the builder's own check, which is this change.

checkGameData() now takes a RANGE rather than a number, and the two ends mean
different things: fewer days than the game window is a broken file, more days
than the file keeps is a builder that has stopped trimming - a slow leak rather
than a fault. Between them sits the case that is neither, and the reason the
range is not a match: between raising the retention and the next weekday
rebuild, the committed file is still 756 rows and every screen works.

887 tests pass.

Educational, not investment advice.

## Three cards the weekly needed, 26 November 2026 (session 2.18)

Three of the ten weekly portfolios showed the fallback card - "nothing stands
out here" - and one showed a card that was actively wrong about it. New:
manyBets in why.json, a condition on groupRisk, a replacement for w05, and
scripts/check_weekly.mjs.

### manyBets, and why its POSITION was the whole decision

fewBets says "your holdings are spread evenly and still make one bet". Nothing
said the opposite, so a portfolio making four separate bets got "nothing stands
out here" - true, and not the most useful true thing to say about it.

Put where its mirror sits, straight after fewBets, it would have taken over
NINE of the twenty capstone portfolios, replacing pair, pairLowRisk and the two
risk-gap cards that each name something specific. Placed last, above the
fallback, it speaks only where the fallback used to: three cards change in the
whole game - weeklies w04 and w08, and capstone f20 - all of them fallback to
manyBets, and nothing specific is displaced anywhere.

Its thresholds are level 3's own pass rule (3 effective bets) and fewBets' own
minimum (3 holdings). No new numbers.

### The group card was wrong about the most diversified week

w10 holds 73% of its risk in bonds and gold and makes 4.4 separate bets, and
the group card said "that is where this portfolio's fortunes are decided - and
where the damage lands on a bad day". That reads as concentration, about a
portfolio that is the opposite of concentrated.

**The obvious fix does not work, and the numbers say why.** A floor on how
closely the GROUP moves - a minimum average correlation inside it - looks right
until you measure the AI stocks this card exists to explain: they correlate
0.26 to 0.63 inside these portfolios, and w10's bonds and gold correlate 0.42,
right in the middle of that range. A floor at 0.5 would drop w10 and also take
the card off the ai-held-in-the-open lesson (0.44) and off w01 (0.47), the week
built to teach exactly this. A floor at 0.7 would drop 14 of the 19 portfolios
the card speaks for.

What separates w10 is not its group but its PORTFOLIO: 4.4 bets. So groupRisk
gained `betsBelow: 3` - the mirror of fewBets' own betsBelow, and the same
threshold manyBets uses. It drops exactly two of nineteen: w10 and capstone
f19. Every AI lesson keeps its card. w10 now gets the pair card, which notices
that TLT and LQD correlate at 0.91 even inside a portfolio making four bets,
and f19 gets riskGapUnder.

### A rule that would have fired once, so the portfolio changed instead

w05 was KO and TLT: two holdings, correlation 0.17, 1.52 bets, and no rule to
explain it. A rule for it - two holdings that barely move together and still
fall short of two bets - would have fired on ONE portfolio in the whole game.
Of the 62 the game deals or writes down, four hold exactly two things: w03
(quietNotABet), w05, and two lesson portfolios that already have cards. Level 1
builds pairs, but its reveal takes a bucket card, not the rule path.

So w05 is now "Five groups, one bet": VOO, VXUS, TLT, XOM and WMT at $2,000
each. Five holdings in five groups, nothing carrying more than a quarter of the
risk, and 1.55 bets. It earns fewBets - the card nothing else in the ten gets -
and it is the exact counterpart of w04 and w08. The order survives untouched:
1.55 sits where 1.52 did, the tightest step between weeks is still 1.28.

### A property that must not block a commit

"Every week says something specific" is a fact about the PRICES. w04 answers
3.22 against manyBets' threshold of 3, and w05 answers 1.55 against fewBets'
2 - a market that moved either across its threshold would change that week's
card, and a unit test reading data/game.json would have turned red on a morning
when nobody had touched the repository, blocking a commit that was correct.

So the property is tested on the FROZEN snapshot, which never moves, and
reported on the live file by scripts/check_weekly.mjs, which the refresh runs
after the commit with continue-on-error - the bargain scripts/build_puzzles.mjs
--check and scripts/check_levels.mjs already make. All ten portfolios earn the
same card on the frozen snapshot as on today's live prices, which is what makes
the fixture a fair stand-in rather than a convenient one.

The check reports three things and colours the run if any fails: a week with
nothing specific to say, two weeks in a row within a bet of each other (the
wrap from week 10 to week 1 included), and a constant guess that would score.
tests/checkWeekly.test.js feeds it made-up week lists, because the point is the
reporting logic rather than today's market.

905 tests pass.

Educational, not investment advice.

## Saved progress, 26 November 2026 (session 2.19)

docs/PRD.md's Learn row promised two things the game did not do: "Levels 1 to 7,
in order; progress saved in the browser". Neither was true before this session -
every level had a live Play button whatever had been played, and the stars died
with the tab. New: js/progress.js, tests/progress.test.js,
tests/learnProgress.test.js.

### Played, not passed

A level opens once the one before it has reached its REVEAL, pass or fail.
Level 4 asks for a beta under 0.50 and level 6 for half the index's fall; a
player who cannot manage those should still get to see the rest of the game,
and a locked door at level 4 would end the visit. Level 1 is always open.

The gate is in isUnlocked() and applied in two places: the Play button is
disabled, and the click handler checks again. A disabled button stops a click,
never a caller - the same reasoning js/round.js's togglePick() already uses.

**Which levels are unlocked is NOT stored.** It is worked out from which were
played, so two screens cannot read one save differently. A stored list could
disagree with the stars sitting beside it.

### The version is in the record, not in the key

js/daily.js and js/weekly.js version their KEYS - oneTrade.daily.v1 - because a
half-finished puzzle is disposable and an old one is better abandoned than
understood. Progress is not disposable. A key that changed with the format
would strand a player's stars behind a name nothing reads, so the key is
oneTrade.learn and the version is a field inside it. migrate() is the one place
a version 2 would be brought forward; until there is one, anything that is not
version 1 reads as a fresh start.

**Whole, or not at all.** One bad entry voids the record rather than being
dropped quietly. The cost of being wrong is one player's stars; the cost of
being half-right is a bug nobody can reproduce. That strictness is also what
keeps other modes out: a record carrying any key beyond `version` and `levels`,
or a level key that is not a whole number, is refused - so nothing from Sandbox
or My real portfolio can ever be read back in, which is docs/PRD.md's promise
that the game collects no student data.

### Two bests, kept separately

Three stars from one play and the closest guess from another. The saved pair
need never have happened in a single round, which is a choice rather than an
oversight: a player who once guessed within a hundredth should keep that, even
on the evening they earned more stars by building better. A replay lowers
neither.

Level 7 is saved once, from its verdict, and its error is the WORST of the
three guesses - the number the level actually turns on. A series PART is not
saved at all: its stars are null until all three are in.

### Reset asks in the page

Not window.confirm(): some embedded browsers refuse that dialog outright, and a
refused dialog would wipe a player's stars with no question asked at all. The
first click swaps the button for a sentence and two buttons; only the second
one clears anything. It clears one key, so the daily puzzle and the weekly
challenge keep their day.

### Open questions for the Worker session

**1. A pool portfolio seen on level 2 and drawn again on level 7, visits apart.**

js/game.js's session keeps drawnPoolIds in memory so level 7's first question
can leave out the portfolio level 2 already showed - asking a player the
portfolio they have just seen would measure their memory rather than their
learning. It is deliberately NOT persisted, and this session did not change
that. But saving progress makes multi-visit play the normal case, so the gap it
leaves is now wider: a player can meet pool portfolio p07 on level 2 on Monday,
close the tab, and be dealt p07 as level 7's first question on Thursday,
already knowing the answer. That guess would enter Hypothesis 3 as learning.

**Would persisting the exclusion change the registered draw, or only extend it
across reloads?** Only extend it. PREREG.md registers that "level 2's portfolio
and the first of level 7's mystery portfolios are both drawn at random from one
pool of 20, so on average they are equally hard" - a statement about the
MARGINAL distribution of each draw, and that marginal is already uniform under
the within-visit exclusion rather than in spite of it. With one portfolio
excluded, level 7's first question is uniform over the remaining 19, and summing
over which one level 2 took gives (19/20) x (1/19) = 1/20 for every portfolio.
The argument does not depend on how many are excluded: the draw treats all
twenty labels symmetrically at every step, so each marginal stays uniform for
any label-symmetric exclusion. What the exclusion changes is the JOINT
distribution - the two are never the same portfolio - and the registered claim
is about each being equally hard on average, not about their independence.

So persisting it would be an extension of an existing rule, not a new one. Three
things to settle with it:

* drawFromPool() already falls back to the whole pool when everything is
  excluded, so a player who has played level 2 twenty times still gets a
  portfolio rather than an error.
* It needs its own storage key, not this one. And Reset progress should
  probably NOT clear it - otherwise resetting becomes a way to be dealt a
  portfolio whose answer you remember.
* Whether to do it at all is a PREREG question, because it changes the data
  Hypothesis 3 collects even if it does not change the registered draw.

**2. The per-browser ID for guess records.**

PREREG.md's Hypothesis 3 sends "a random per-browser ID, level, guess, actual
value and date" with each guess. When that ID is built it must live under its
OWN storage key - not inside the progress record - and Reset progress must not
clear it. Two reasons: a player resetting their stars has not asked to become a
new participant, and an ID that resets with the stars would silently split one
player's level-2 and level-7 guesses into two rows that the sign test would
never pair.

935 tests pass.

Educational, not investment advice.

## Sandbox, 26 November 2026 (session 2.20)

docs/PRD.md milestone 2 step 9 said "Keep the previous portfolio checker as the
Sandbox and My real portfolio modes". There is no previous portfolio checker.
Milestone 1 step 6 says so outright - "Nothing to remove. This is a fresh build,
so the resilience score and the fixed-rule portfolio comparisons never existed
here" - and `grep -i checker` over this log finds one unrelated hit. The word
"keep" was written from the point of view of a predecessor project that was
never ported into this repo. Step 9 now reads "Build the Sandbox and My real
portfolio modes", which is what it always was.

So nothing was salvaged. What was REUSED is everything the mode could be built
out of: js/build.js's picker and allocator unchanged, js/crash.js's level-free
`createBuild`, js/gameView.js's window, js/math.js's measures, and - the piece
that saved the most - js/why.js's `whyFacts()`, which already returns in one
call the dollar share beside the risk share, the gap between them, the closest
pair, each group's share of the risk, effective bets and the beta. A risk share
in Sandbox is therefore the same number Learn's "Why?" card explains, computed by
the same line of code. New: js/measures.js, js/sandbox.js, tests/measures.test.js,
tests/sandbox.test.js.

### No round, and that is the design

js/round.js refuses to reveal before a guess, by design - "predicting and then
being corrected is the main learning moment" is the whole of Learn - and it
computes the ONE measure its level asks about. Sandbox needs all of them and no
guess. Bending `createRound()` into that would have meant a round with no level,
no threshold, no stars and no guess, which is not a round. js/measures.js is the
same arithmetic assembled the other way: one portfolio in, every measure out.

### The shock is -20%, and it is in levels.json

docs/PRD.md defines the stress-test loss as "portfolio value x beta x shock
size" and never fixes the shock size. Somebody had to, so it is fixed as a round
**20% fall in the AI basket**, in levels.json's new `stressTest` block with its
reason beside it, next to every other rule the game checks.

**Why round, and why not from the data.** Three candidates were weighed: a round
20%, the basket's own worst day in the window, and the basket's fall in one of
the three registered crash windows. The last two are real history, which is
attractive, but both move - the worst day moves whenever data/game.json is
refreshed, and either would put a second kind of movement into a number whose
whole job is to show ONE kind. docs/PRD.md answers "stress estimates are noisy
and look backward" with "a beta range is shown, not one number", so the range on
the screen must come from the two betas and nothing else. A fixed shock keeps it
that way, and a player who comes back to the same portfolio next week reads the
same scenario. 20% was chosen for being a plain number rather than for the loss
it produces, before any portfolio had been measured with it.

**It is data because it was chosen.** A number docs/PRD.md does not fix is a
number a reviewer should be able to find without reading code. `validateStressTest()`
refuses a positive shock - a "shock" that was a rise would turn the loss into a
gain and reward the most concentrated portfolio a player can build - and refuses
a fall of 100% or more, which is not a scenario this screen explains.

### Stress days: 75, of the window, by count

docs/PRD.md defines them as the "worst 10% of daily S&P 500 returns in the
window". Three things that leaves open, each settled the way that makes the
answer reproducible:

* **Of the WINDOW, not of the file.** The window is levels.json's 756 days;
  data/game.json keeps 766, because a spare week of days is deliberately kept in
  it. 10% of the file would be 76 days and 10% of the window is 75, and both
  look equally plausible on a screen. The fixture is an 800-row document that
  every case slices 756 rows out of, so code that took the worst 10% of the file
  fails rather than passing with a number that is nearly right. One case holds a
  holding that lists 300 rows in: its window is 500 days and its stress days are
  50, which is the same rule stated twice.
* **A count, not a percentile.** `floor(days x fraction)`, ranked by return.
  np.percentile interpolates between two days and hands back a threshold no day
  actually had; how many days then sit on the wrong side of it depends on ties
  and on float rounding at the edge. Counting fixes the set.
* **Ties break by date, earliest first,** and a tie is not hypothetical - a flat
  day is a real day and two of them are equal to the last bit. The sort is on
  (return, index), a total order, so nothing is left for a sort's internals to
  decide; `tests/measures.test.js` holds it with a 30-day case where three days
  tie for the last two places, and a 40-day case where every day is identical.

Two days is the floor: `betaTo()` needs two to have a variance, and a one-day
"beta" is a ratio dressed as a statistic. A 10-day window asks for one and is
refused rather than shown.

### What the tests caught

**The loss range printed backwards.** `loss.worst` is the more negative of the
two, so printing the pair in the order the object holds them read "$1,483 to
$1,417" - a range running the wrong way, which a reader either trips over or
silently corrects. The screen prints the smaller size first now; the object
keeps worst and mildest, which are the right names for what they are.

**An object that lied about its own state.** `measure()` read `levels` off the
closure it was loaded into rather than off `ctx`, so a ctx that exposed `levels`
measured with a different one. Harmless today and a trap tomorrow.

**Two gaps in tests/stubDom.js**, both found by needing them rather than by
review. `withDocument()` assigned its globals, and node defines `navigator` with
a getter and no setter, so a test that wanted to watch `navigator.sendBeacon`
could not start: it defines the properties now and restores the real descriptors.
And `StubNode` had no `focus()`, which every mode's `draw()` calls on the root.

### What the screen says

Three named portfolios, over the live window, 2023-11-21 to 2026-11-25:

| Portfolio | Bets | Beta all / stress | A 20% basket fall |
| --- | --- | --- | --- |
| NVDA + AMD + AVGO + MSFT | 1.11 | 0.98 / 0.94 | $1,881 to $1,966 |
| VOO + QQQ + VTI | 1.01 | 0.43 / 0.32 | $638 to $870 |
| VOO + BND + GLD + VXUS | 1.21 | 0.20 / 0.15 | $294 to $402 |
| JNJ + TLT + GOOGL + LQD + COP | 3.56 | 0.08 / 0.03 | $68 to $169 |

The first two are the lesson the game is named after: four AI stocks make 1.11
bets, and three US index funds make 1.01. The measure is not stuck down there -
level 3's own winning designs reach 3.56 on this data - so Sandbox shows the
whole range rather than always saying "one bet".

BND in the fourth row takes 25% of the money and 4% of the risk, which is why
`BETS_NOTE` is one exported constant shown wherever the number appears, in the
same words: docs/PRD.md requires "it counts risk, not money" on the page
"wherever the number appears", and a sentence typed into two screens is a
sentence that will eventually differ between them.

### Three decisions worth seeing

**The correlations are a ranked list, not a grid.** A 40-holding portfolio has
780 pairs, and a 40-column table cannot be read on a phone without the sideways
scrolling the phone-first rule forbids. The pairs are ranked closest first, which
is also the order that answers the question the mode is for. The list shows ten
and says "the 10 closest of the 66 pairs" rather than cutting itself off quietly.

**No `window.scrollTo(0, 0)` in `draw()`.** js/crashReplay.js and js/game.js both
call it and it is on the design review's list as a bug; it was not copied into a
new mode on the way past.

**`createBuild` still lives in js/crash.js.** It is the level-free build object
and now has two callers outside Crash replay, so it arguably belongs beside
js/build.js. Moving it touches js/round.js's import cycle and the build controls,
which this session was told to leave alone.

### Not built: an idea for after the playtest

**A group-risk panel under the shares table.** Each group's share of the risk is
already computed - `whyFacts()` returns it, and the weekly challenge's card is
written from it - so the panel is a rendering job and not an arithmetic one.
"Your five holdings are two groups, and one of them carries 80% of the risk" is
the lesson of this whole game in one line, and Sandbox is where a player who has
built something deliberately would read it.

It is deliberately NOT on the screen. docs/PRD.md names group risk as a "Why?"
card rule, not as a Sandbox panel, and rule 9 is not to add what the PRD does not
ask for. **Revisit it after the playtest**, with the question the playtest can
answer and this session cannot: do players reading the shares table work out the
group story for themselves, or does the table leave them counting percentages
holding by holding? If it is the second, this panel is the fix and the PRD gains
a line. If it is the first, the screen is already long enough.

### For the My real portfolio session

The entry screen is settled: a ticker box with type-ahead from tickers.json and a
dollar box, one row at a time, whole dollars with commas allowed, `inputmode`
set so a phone offers the number keyboard, 2 to 15 holdings, and "Nothing is
saved or sent. Leaving this page clears it." on the screen. js/build.js's
allocator cannot be reused there - it moves a fixed $10,000 in $100 steps - but
js/measures.js takes any positive dollars and converts them to weights, so the
whole measures panel is already done. A ticker not in tickers.json gets a plain
message against the box that caused it, and is counted and shown, never dropped.

977 tests pass.

Educational, not investment advice.

## My real portfolio, 26 November 2026 (session 2.21)

The second half of docs/PRD.md milestone 2 step 9, and the end of it. Somebody
types what they actually hold, in dollars, and sees the same six measures
Sandbox shows. New: js/holdings.js, js/myPortfolio.js, js/measuresView.js,
tests/holdings.test.js, tests/myPortfolio.test.js, tests/app.test.js.

### One copy of the panels, because of the wording

The measures panels moved out of js/sandbox.js into js/measuresView.js, and
js/sandbox.js now imports them - the same move js/build.js made for the build
screen, for a sharper reason. This mode may not sound like advice, which is a
property of particular sentences; sentences copied into two files drift apart one
edit at a time, and an audit that passed last month would then be passing on half
the game. One copy, one audit.

What stayed behind in each mode is what genuinely differs: the headings, the
buttons, and anything about pretend money. A difference belongs in the mode
rather than behind a flag in the shared file.

### Typing, not tapping

Every other mode is taps on chips the screen chose, where the only input possible
is one the game already approved. Here two text boxes accept anything, so
js/holdings.js is the rules about what cannot be used, and it has one rule above
all: **nothing is dropped quietly.** Every line that cannot be used comes back as
a plain message naming the box it belongs to, and the row is not added.

A try/catch that skipped what it could not parse would mean a player's $4,000 in
a misspelled ticker silently missing from a total they are reading as their own
portfolio - and every measure below it computed on a portfolio that is not
theirs. A wrong total is worse than a refused row.

**What a dollar box should accept** turned out to be a real question. Accepted:
`5000`, `5,000`, `$5,000`, ` 5000 `, and `12,500.37` - cents rounded to the
nearest dollar, because a real balance usually has them.

Cents were refused at first, on the principle that rounding changes a number the
player typed and then shows them the result as theirs. That principle is right
and the conclusion was wrong: a real balance is `$4,212.50` far more often than
it is `$4,212`, so a screen inviting somebody's actual holdings and then refusing
the form they come in is a screen that argues with its own invitation. What the
principle actually demands is that the rounding be VISIBLE, so the row shows what
was recorded - `$4,213` - rather than echoing what was typed. A cent either way
moves no measure here: the biggest holding would have to shift by about $50 in
$10,000 to move a share of risk by a tenth of a point.

Still refused, each with a message rather than a guess:

* `1,25` - a misgrouped comma is a slip for either 125 or 1,250, and picking one
  would put a number on the screen the player never typed;
* `5k`, `1e5` - a box that reads `1e5` as $100,000 is a box that will one day
  read a typo as a fortune;
* `0` and anything negative;
* `0.37` - more than nothing and yet nothing once rounded, so it is refused by a
  message naming both numbers rather than added as a holding of $0 that could
  carry no weight and no risk.

**The ticker box is checked first**, so one bad row reports one problem. Both
boxes can be wrong at once, and two messages at the same time is two things to
fix before anything happens.

**A refused row keeps what was typed.** A one-character typo should be a
one-character fix, not the whole row again. A row that went in empties the boxes.

**Fifteen is the most**, which is a limit of the screen rather than of the
arithmetic - the measures would take forty. A full list keeps its boxes on screen,
disabled, with the reason beside them; boxes that vanish at fifteen look like a
broken screen.

### The real total, not $10,000

docs/PRD.md's loss is "portfolio value x beta x shock size", and on this screen
the value is the player's own. `measureAll()` already took any positive dollars
and converted them to weights, so this needed no new arithmetic - but it is the
one number in the mode that would have been silently wrong if the $10,000 had
been left in, and tests/myPortfolio.test.js checks a $50,000 portfolio loses
about five times what a $10,000 one does.

The shares are exact on the way in and rounded only for display: $3,333 and
$6,667 are measured at 0.3333 and 0.6667, never at a rounded third.

### What was left out stays on the screen

A refused row leaves money outside the total, and the screen now says so:

```
Not included in the total: TSLA ($600). That amount is not part of any
measure on this screen.
```

**It outlives the message that caused it, and that is the point.** The problem
beside the box is cleared by the next good row - a stale complaint next to a box
somebody has since fixed is worse than none - but the MONEY is still missing. A
player who typed TSLA $600, read the refusal, shrugged and carried on would
otherwise reach a measures screen reading $8,063 of a portfolio that is really
$8,663, with nothing on it saying which. That is the one way this screen could
mislead somebody about their own savings, so the line is carried through to the
measures screen too.

Two rules keep it from becoming noise. An amount stops being reported once the
SAME AMOUNT goes in under another ticker, because the common fix for a refused
row is retyping the same money under a name this game does carry - "NVDAA
$1,850" becoming "NVDA $1,850" - and reporting NVDAA as missing afterwards would
be reporting money that is now in the total. And an empty ticker box records
nothing: somebody who has not finished typing has not left a holding out.

### The privacy test watches every route, not just fetch

docs/PRD.md: "Prices come in; holdings never go out." A test watching only
`fetch` would pass while an `<img src>` carried a ticker list to a server in a
query string, or a beacon did it on unload. So the browser in
tests/myPortfolio.test.js watches `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`,
`Image`, `WebSocket`, `EventSource`, `navigator.share`, the clipboard, both
storages, and every way the URL can change - `assign`, `replace`, `pushState`,
`replaceState` - and asserts that **none of them is touched from the moment the
first holding is entered**.

**Why "after the first holding" rather than never.** The four data files are read
when the mode opens, before anything has been typed, and they are the "prices
come in" half of the promise. What must never happen is a request AFTER there is
something private to put in one. The test records how many requests the way in
took and asserts nothing is added to that list afterwards.

There is no share card here, and that is not an oversight: a card is a thing that
leaves. The test checks for the canvas as well as for the button, because a card
drawn and then not shared is still a card drawn from somebody's holdings.

### No advice, as data rather than as a reviewer's memory

`BANNED_PHRASES` is exported from js/myPortfolio.js and the test scans every
screen against it: the entry screen, the refused-row screen, a filled list and
the measures. The line it draws is between describing and prescribing - telling
somebody what to do ("you should", "consider selling"), telling them what is
better ("better off", "we recommend"), or grading what they hold ("too much",
"too risky"). A measure with a number beside it is none of those.

A second test goes the other way and feeds the list seven sentences that WOULD be
advice, checking each is caught: a banned list nobody tests is a list that
quietly stops matching. And a third builds the most concentrated portfolio this
screen can show - 90% in one AI stock - and checks the screen still describes it
rather than grading it.

The disclaimer is the one place "advice" belongs, so the audit removes that exact
line before scanning rather than carving an exception into the pattern.

### The router had never been tested, and could not have been

**js/app.js could not be imported at all.** It called `window.addEventListener`
at module scope, which throws anywhere there is no window, so no test had ever
loaded the file - and the router and the nav had therefore never been checked
against each other. The bootstrap is guarded now and tests/app.test.js reads
both lists out of the files and holds them together.

**Why it matters more than an untested branch usually would: the failure is
silent.** `modeFromHash()` falls back to the default for anything it does not
recognise, which is right for a junk hash somebody typed and wrong for a nav
link the router has not been told about. A mode missing from MODES does not
throw, does not warn and does not show an empty screen - it shows Research, with
"My real portfolio" highlighted as the current page. Nothing anywhere would say
so; it would have to be noticed by a person clicking the link.

`#mine` was in exactly that state for about a minute while this session's two
edits went in, which is how the gap was found. tests/app.test.js now checks that
the nav and MODES are the same set, that each link's href matches its data-mode,
that every mode is reachable by its own hash, that junk falls back to a real
mode, and that no link in the nav carries anything but a mode name - the last
one because the hash is the only thing this mode ever puts in the URL.

### What else the tests caught

**A name collision I introduced.** tests/stubDom.js grew a `type()` method for
typing into a box, and `input.type` is a real DOM property - the first view that
set it to "text" overwrote the method, and the test then failed on the stub
rather than on the code. It is `typeText()` now.

### What it says

A plausible first-year's portfolio, typed in, one ticker of which this game does
not carry:

```
  add VOO   $4,212.50 -> added
  add NVDA  1,850.37  -> added
  add BND   900       -> added
  add TSLA  600       -> REFUSED: TSLA is not one of the tickers this game
                         carries. The list on the Sandbox screen is all of them.
  add QQQ   1,100     -> added

  VOO  $4,213  52%        effective bets   1.31
  NVDA $1,850  23%        closest pair     VOO + QQQ  0.950
  BND  $900    11%        beta all/stress  0.52 / 0.45
  QQQ  $1,100  14%        a 20% basket fall  $732 to $846
  4 holdings $8,063 100%

  Not included in the total: TSLA ($600). That amount is not part of any
  measure on this screen.
```

Three things worth looking at. The cents are rounded and the rows show the
rounded figures, so $4,212.50 is recorded and displayed as $4,213. TSLA is named
and refused, and the other four still go in. And the total is $8,063 rather than
$8,663, with the line underneath saying which $600 is missing - so nothing on the
screen can be read as a measure of money the player did not confirm.

1,042 tests pass.

Educational, not investment advice.

## The review's catch, and six smaller fixes, 26 November 2026 (session 2.22)

A review of everything built for Milestone 2 against docs/PRD.md and CLAUDE.md.
Most of it held: the disclaimer is on all 20 screens across 7 modes, every one of
the 16 fetches is a repo-relative file read with no proxy and no absolute URL
anywhere, the share cards carry no ticker or dollar amount at any star count,
all three storage-using modes survive six kinds of broken storage, the 205
known-answer assertions pass and `tests/make_fixtures.py` regenerates its fixture
byte-for-byte, `prereg-v3` predates the first price commit, and data/results.json's
recorded SHA-256 matches data/prices.json's actual bytes.

One finding was worth the whole review.

### Level 2 produced no guess record, and Hypothesis 3 needs one

**js/round.js's `createRound()` had no `emit` parameter at all.** Only
`createSeries()` could send, so only level 7 produced records. PREREG.md's
Hypothesis 3 compares each player's error on LEVEL 2 with their own error on
level 7 and pairs the two with a one-sided sign test - the level-2 half of every
pair had no code path to send from.

**What made it worth catching now is the shape of the failure, not its size.**
Nothing was broken today: nothing is sent at all until the Worker exists, so the
missing record cost nothing and showed nothing. The damage was all in the future
and all silent. Wire `/guess` to the existing hook in Milestone 3 - the obvious
thing to do, since the hook is right there on the series - and level 7's rows
would start arriving while level 2's never did. No error, no warning, no failing
test, and a Research page still reporting "collecting" exactly as it should. The
discovery point was 60 days after launch, when collection closed and there was
nothing to pair: Hypothesis 3 unanswerable, the players gone, and the data
uncollectable after the fact.

Three things follow from that, and they are the reason this is logged as the
review's main result rather than as a bug fix:

* **A missing emitter looks exactly like a working one** while there is no
  receiver. Every test of the records passed, because they all tested level 7.
* **The cost was fixed in time, not in severity.** A bug that wastes 60 days of
  collection cannot be fixed by noticing it on day 61.
* **It was invisible from the code that was wrong.** `createRound()` is correct
  in isolation: a round that emits nothing is a perfectly good round, and nothing
  in that file says otherwise. The defect only exists relative to PREREG.md, two
  files away, which is why reading the spec against the code found it and reading
  either alone would not have.

The fix: `createRound()` takes an `emit`, fires it once per locked guess from
inside the branch that runs once - `reveal()` is idempotent and the record
deliberately is not - and both paths build the record through one `guessRecord()`
so a field present on level 7's row and missing from level 2's is not possible.
js/game.js passes an emitter for level 2 and for nothing else, with
`RECORDING_LEVELS` naming the pair in one line a reviewer can find.

**The five fields, split where the layers split.** PREREG.md registers "a random
per-browser ID, level, guess, actual value and date". js/round.js supplies three
and stops: it has no DOM, no fetch and no storage, which is what makes it
testable without a browser, and an ID is storage while a date is a clock. The
other two are added by js/game.js at the one place records are collected, so
there is a single answer to what a record contains. The fields are listed
explicitly rather than spread off the result object - a spread would have
quietly started sending tickers and dollar amounts the day a field was added.

**js/participant.js**, new, is the ID: its own key, created on first use, and
Reset progress does not clear it. Both constraints were settled in session 2.19
before there was any code to settle them for, and both still hold for the reasons
given there - a record inside the progress record would void a player's stars,
and an ID that reset with the stars would split one player into two rows the
sign test would never pair. A browser that cannot store still gets an ID, fresh
each visit, so that visit's own level-2 and level-7 records still pair with each
other; what is lost is pairing across visits, which is the most such a browser
can offer anybody.

### Nothing is sent, now held by a test

Learn was the one mode with no test watching what leaves, and it is the mode
where `/guess` and `/ping` will be wired. tests/guessRecords.test.js renders it
with fetch, XMLHttpRequest, sendBeacon, Image, WebSocket, EventSource,
navigator.share, the clipboard and all four ways to change the URL watched,
plays all seven levels, and fails if anything goes out after the data files are
read. It also checks that levels 1 and 3 to 6 emit nothing, that the weekly
challenge emits nothing, and that Sandbox and My real portfolio have no collector
at all.

### "23 trading days" was a day short of the window

The crash screens printed `window.days`, which is the number of daily MOVES, and
called it trading days. docs/PRD.md's crash table counts the window's trading
days - its closes - and there is one more of those than the gaps between them: 24
for 19 February to 23 March 2020, not 23. Same for the 2022 bear market (196, not
195) and the AI selloff (25, not 24).

**No arithmetic was wrong.** The replay correctly applies 23 moves to 24 closes,
which is why the index fall has always come out at −33.99%, exactly the published
peak-to-trough figure. Only the label was short. The windows carry `tradingDays`
beside `days` now, both named for what they count, and the three label sites read
the new one.

**And the first version of that fix was wrong in a way worth recording.** The
count was added to the stored windows and asserted there - and every screen reads
`replay()`'s own summary of the window rather than the file, which did not carry
it. The line read "undefined trading days" while the new test passed. Checking
the data is not checking the screen; there is a test for the replay's summary now
as well, and it reads the expected counts out of docs/PRD.md's table rather than
carrying a copy of them, so the data and the spec cannot drift apart again.

### docs/PRD.md caught up with what was built

* **The status section** said "nothing is built yet… Nothing is live, no prices
  have been downloaded, and no real-data results have been seen". All false. It
  now lists what is built, what is live and what is left, which matters because
  CLAUDE.md says to stop and ask when a request conflicts with the PRD - hard to
  apply against a spec describing a different project.
* **Level 7's star bands** are written down as built, with the reason they differ
  from the other bets levels: its pass rule is already "all 3 guesses within 1",
  so a 2-star band of "within 1" would be the pass condition twice and every
  passing player would get 2 stars for nothing. The implementation was right and
  the spec was describing a scheme that could not work.
* **Level 6's 4-holding rule** is in the level table; it was a real pass
  condition that no reader of the spec could have predicted.
* **"Explore the market"** moved from "Launch, secondary" to "Later, optional".
  It was the one launch-marked mode with no build step in any milestone.

js/config.js's header claimed a `PROXY` constant was "declared here, unset". It
never was, and nothing fetches through a proxy: every URL the game reads is a
file in this repository.

### Still open, and suggested rather than done

The crash table is now held to the PRD by a test. **The level table is not.** The
scoring thresholds, buckets and star bands in docs/PRD.md and in levels.json are
checked against each other by eye, and this session wrote level 6's bucket edges
into the PRD by hand from the file. The same parse-the-spec approach would work
on those tables, and it is the other half of the drift this review found.

1,066 tests pass.

Educational, not investment advice.

## The level table is held to the spec too, 26 November 2026 (session 2.23)

Session 2.22 left this as the open half of the drift it found: the crash windows
were held to docs/PRD.md by a test, and the level table was still checked by eye.
New: tests/prdLevels.test.js, 12 tests reading both of the PRD's level tables and
three of its prose rules, and holding levels.json to every number in them.

What is now read out of the spec rather than copied into a test: each level's
title, its pass condition's threshold AND the direction of the comparison, the
holdings count where the challenge states one, the minimum share under a named
holding and under a kind, each bucket edge, each 2-star and 3-star band, each
guess range, and the registered pool of 20.

### It found the gap it was written to find

**Level 4 fixed a 4-holding portfolio and the PRD never said so** - the same gap
as level 6's, found the same way, one session later. The table's challenge column
read "Keep at least 30% in QQQ", and levels.json has required exactly 4 holdings
all along. It now reads "Build a 4-holding portfolio and keep at least 30% in
QQQ".

That is twice this has happened, so the test does not just compare the counts
that ARE stated - it counts them. Five levels fix a holdings count; if the PRD's
table states four of them, the test fails and names the levels, so the third
occurrence is impossible rather than merely unlikely.

### Reading the comparison, not just the number

A threshold is two things: a number and a direction, and the direction is the
whole of docs/PRD.md's rule that "a portfolio that fell exactly half as much did
not fall LESS than half as much". So the test reads the direction out of the
sentence - "no holding carries more than 35%" is a ceiling and reads `<=`, while
"under 0.5" is strict - and a level whose comparison flipped would fail even with
its number untouched.

Two cells needed care. Level 6's condition is "fell less than half as much as the
S&P 500", where the number is a word and the only numeral is part of the index's
name: the first version read 500. And "All 3 guesses within 1" carries two
numbers, the count of guesses and the band, so both are read by name rather than
by position.

### Checked by breaking it

A test that reads a spec can fail to read it and pass anyway, so ten mutations
were tried one at a time, each reverted after: four thresholds, two bucket edges,
a holdings count, a minimum share, a star band and the "half" in level 6's
sentence - five on the PRD side and five in levels.json. All ten failed the test.
The mutation that mattered most was level 4's beta threshold moving from 0.5 to
0.6 in levels.json with the PRD untouched, which is the direction this is for:
the game quietly becoming something the registered spec does not describe.

### Two tables anchored, because they look alike

The level table and the scoring table have the same row shape - "| 1. Two of a
kind | ... |", five columns each - so the first pattern loose enough to match one
matched both and read ten rows where it expected seven. Each table is found by
its own header row now and read until the table ends.

1,078 tests pass.

Educational, not investment advice.

## The design review, and the fixes it asked for first, 26 November 2026 (session 2.24)

A design review of all 63 screens and states at 375px in both colour schemes,
then the first half of its list. New dev tooling: `scripts/shots.mjs`,
`scripts/dev_a11y.mjs`, `scripts/dev_checks.mjs`, `scripts/dev_browser.mjs`,
`scripts/dev_scenes.mjs`, `scripts/make_mockups.mjs`, `tests/devTooling.test.js`.
New in the game: `js/screen.js`, `tests/screen.test.js`. The review itself is
`docs/DESIGN_REVIEW.md`.

Playwright went in as the project's first package, dev-only: never loaded by the
site, its screenshots gitignored, and `tests/devTooling.test.js` holding all of
that true - one `<script>` in index.html, no bare package imports under `js/`, no
runtime dependencies at all.

### What a browser found that 1,078 tests could not

**The nav overflowed every screen in the game.** `.modes` is a flex row of seven
pills coming to 602px, with no `flex-wrap`, so at 375px it ran 227px past the
right edge: Sandbox, My real portfolio and Research were off-screen with nothing
saying they existed, and the whole document scrolled sideways everywhere.

**It had always been like that, and the log says otherwise twice.** Sessions 2.4
and 2.13 both record `documentElement.scrollWidth` equalling `innerWidth` at
390px. What the suite actually contains is `globalThis.window = { innerWidth: 390
}` - a number in a stub with no layout engine behind it. The claim was never
false on purpose and was never measured; a stub DOM cannot answer a question
about layout, and reading `scrollWidth` off one returns whatever the stub was
told to say. **That is the shape of the whole finding: the things a design review
asks about are the things a node test cannot see.**

**The site opened on Research**, and so did every shared link. `?src=share`
carries no hash, `modeFromHash('')` falls through to `DEFAULT_MODE`, and the
first sentence a first-year met was "Hypothesis 1 (hidden concentration): not
supported on the headline correlation-only test". The share card is the growth
mechanism and it pointed at the methods page. `DEFAULT_MODE` is `learn` now, and
`withSource()` takes a mode: the score cards carry `#learn`, the puzzle `#daily`,
the weekly `#weekly`. `shareCard.js` reads `level.mode ?? SHARE_MODE`, and since
`mode` is set on the weekly and on nothing else, the seven levels fall to Learn
without a branch.

The fragment used to have to be empty, and a test said so - "the link carries a
fragment, which could encode a draw". That reason is still right, so the test did
not go: it now asserts the fragment is a mode name and nothing else, which rules
out the same leak and is checkable rather than merely absent.

### The scroll jump was two bugs wearing one coat

`window.scrollTo(0, 0)` at the end of `draw()` in `js/game.js` and
`js/crashReplay.js` was the obvious half: a line written for "a new screen starts
at its heading" that also ran on every `+` tap, because `draw()` is the only
redraw there is. Learn's build screen went from scrollY 1259 to 0.

**Sandbox was the control group and it was not clean either.** It never called
`scrollTo`, and a `+` there held position exactly - but a *chip* tap added an
allocator row, the page grew, and the position still slipped from 1054 to 438.
So not scrolling is not the same as keeping the place, and the fix had to be
positive rather than the removal of a line.

`js/screen.js` is that fix, shared by all five modes. The caller supplies a key
saying WHICH SCREEN this is; two draws with the same key are the same screen
redrawn and the player is put back exactly where they were, a different key is a
new screen and starts at the top. Three things had to be right for it to work:

* **The layout has to be flushed before the scroll is restored.**
  `replaceChildren()` empties the element first, and a `scrollTo(0, 1251)`
  against a document that is momentarily one screenful tall is clamped to the
  bottom of that document. Reading `root.scrollHeight` forces the reflow.
* **And restored again on the next frame, unconditionally.** Reading
  `window.scrollY` straight after `scrollTo` reports the new value, so a
  "did it work?" check always passed and always skipped the retry - while the
  position still came out at 792 instead of 1251. What moves it is the browser's
  own scroll anchoring settling after a layout it had nothing left to anchor to.
* **A control is found again by id or by aria-label**, and a chip's label is not
  stable: tapping "Add GLD" produces "Remove GLD", so the chip a player had just
  pressed could never be found and focus fell back to the view. Chips carry
  `id="chip-GLD"` now.

**Focus mattered more than the scroll and was not on the list.** Every one of
those redraws also left focus on `main#view`, so pressing `+` with a keyboard
returned the player to the top of the content and cost a full Tab journey back:
moving $2,000 to $2,500 was five round trips. Same root cause, same fix.

**The daily puzzle got worse before it got better.** Keyed by the pair, answering
one became a screen change and sent the player to the top - 484 to 0, a jump it
never had before. The puzzle GROWS rather than replacing itself, so the whole
thing is one screen: `playing` is the key, not `pair:3`.

### A measurement that looked exactly like the bug

After the fix, `scripts/dev_checks.mjs` still reported the chip cases slipping
1251 to 792. They were not. **Playwright scrolls an element into view before
clicking it**, and the chips sit near the top while the player is at the bottom,
so the "before" reading was taken from a position the click was about to leave.
A frame-by-frame probe in the page showed 1251 held at every frame.

The tool scrolls the target into view before reading the baseline now, which is
also the honest question: a player can only tap what they can see, so the
position a control is tapped FROM is the one that must survive. Worth recording
because the wrong number was indistinguishable from the real defect, and
believing it would have meant "fixing" code that was already correct.

### The 100% issue was not in the build step

Checked every level's build allocator, Sandbox and Crash replay: **all clean, and
clean by arithmetic.** $100 steps out of $10,000 make every share a whole
percent, so the column always sums to exactly 100%. A property test of 400 random
chip and slider actions per level found no sequence where the dollars fail to sum
to the total or the shares fail to sum to 100.

It was My real portfolio, whose dollars are whatever somebody types. Three
holdings of a third each render `33% 33% 33%` under a total row that printed a
literal `100%` - the screen disagreeing with its own column, and telling a reader
who added it up that they were wrong. Seven holdings of $1,000 came to 98%.

The total now shows the sum of the rows as displayed, and a one-line note appears
only on the portfolios where that is not 100%. Showing the real sum was chosen
over explaining the rounding everywhere: a column that adds up by inspection
needs no sentence.

### Pass to unlock, and what it costs

Level N+1 now unlocks only once level N has at least one star. Level 1 is always
open, locked cards read "Pass level N to unlock this one", and `unlock` replaced
`open` everywhere including the aria-labels.

**`migrate()` needed nothing for the rule itself.** `stars` was already stored,
so "played but not passed" was already representable - it is `stars: 0`. And the
second clause of `isUnlocked()`, written in session 2.19 for hand-edited saves,
turned out to be exactly the grandfather clause this change needed: a level with
any record stays open whatever the rule says, so somebody who reached level 4
under the old rule keeps level 4 and only their next step has to be earned. A
rule that changed while a player was away does not send them backwards, and it
cost no code to be true. There is a test saying so now, because that is the kind
of clause a later tidy-up deletes.

**What did need a migration was the hint counter.** A hint after three failed
tries has to survive the tab closing - somebody who fails twice on the bus and
once at home has failed three times - so `tries` is in the record and the version
moved to 2. Version 1 saves are brought forward with `tries: 0`, before the
per-entry check rather than after it, so there is one definition of a usable
entry rather than one per version, and the record comes back stamped with the
current version so it is not migrated again on every load.

A try is a finished attempt that earned no star, counted per ATTEMPT rather than
per reveal, so level 7 - three portfolios and one verdict - adds one and not
three, and nobody is shown a hint halfway through a series.

**The hints are in `levels.json` for editing**, and a test holds them to the line
that matters: a hint may not name a ticker this game carries, because a list of
tickers is what a winning design IS. The one exception is QQQ on level 4, whose
own challenge line already says "Keep at least 30% in QQQ" - naming the holding
the level forces away gives nothing about the other three, which are the puzzle.
Level 2's hint can never appear, because its pass condition is "make a guess" and
it cannot be failed; it is written down anyway with a note saying so, rather than
leaving a reader to wonder which level is missing one.

**Hypothesis 3 is harder to reach, and this is the entry that says so.**
PREREG.md pairs each player's level-2 error with their level-7 error and needs 60
players carrying both. Until today a player reached level 7 by PLAYING six levels;
now they must PASS six, including level 4's beta under 0.50 and level 6's
half-the-index fall. Every player who would have stumbled through stops instead.
**The 60-player minimum was set against a ladder that could be walked.** Nothing
about the registered analysis changes - the test is the same test on the same two
levels - but the number of pairs it will have to work with is smaller by an
amount nobody can estimate before the playtest. The per-level hint is the thing
standing between this rule and a wall, which is why it shipped in the same change
rather than after it. **Watch the drop-off per level in the playtest; that is the
measurement that tells us whether 60 is still reachable.**

`scripts/check_levels.mjs` says what zero winning designs means now: not "this
level is hard" but "this BLOCKS EVERY PLAYER at level N, nobody reaches any level
after it, and Hypothesis 3 gets no level-7 guesses from anybody".

### One slider moves one holding

The money is allocated now rather than divided. It used to compensate - raising
one holding took the step out of the largest other one - which made "Money left"
impossible to write, because the answer was always $0, and meant every tap moved
two numbers while the player watched one of them.

**What the controls still hold up, and what they no longer do.** A floor on one
holding is still absolute: level 4's QQQ cannot go below $3,000 because that is
the slider's own minimum, and no other slider can reach into it. A floor on a
KIND is different. Level 6's 60% in stocks used to be enforced move by move, and
with independent sliders that makes the level unplayable: moving money from WMT
to PG is two actions now, and the state in between necessarily holds too little
in stocks. So it moved to where the four-bond-funds case was always handled -
`buildComplete()` refuses it and `whyIncomplete()` names it. A player can stand
in an illegal state; they cannot leave the build screen from one.

That is a weakening of a property session 2.5 was pleased about, and it is
recorded as one rather than as a detail. The 400-move walk that used to assert
"the stocks never drop below $6,000" now asserts that the gate and the rules
never disagree, which is the invariant that replaced it.

The build screen gained a real `<label>` per slider, "Money left: $X" above the
rows as a `role="status"`, and an "Even split" button - which is load-bearing
rather than a convenience, since a player can now strand themselves at "Money
left: $100" with every slider at a floor.

1,107 tests pass. `node scripts/check_levels.mjs` still finds 8, 17, 634, 126 and
50 winning designs across levels 1 and 3 to 6.

Educational, not investment advice.

## The chosen look, applied everywhere, 26 November 2026 (session 2.25)

Direction B's layout and number-line reveal on direction C's cream paper, with
calmer accents than either had. One commit, no wording, number or rule changed.

### The palette is semantic now, and that is the point

Five names, each meaning exactly one thing, in `css/style.css`:

| Name | Means | Light | Dark |
| --- | --- | --- | --- |
| `--accent` | the live value, and the thing to press | `#3b4a7a` | `#a9bdf0` |
| `--clears` | a pass | `#15604a` | `#6fcf9f` |
| `--misses` | a miss | `#8f3a12` | `#e8975a` |
| `--reference` | the market: the index line | `#8a8075` | `#857b70` |
| `--control-edge` | the boundary of a control | `#7a7168` | `#8a7f72` |

**The old blue failed AA in both modes and was the colour of everything.**
`#257de0` came out at 4.13:1 on white and 3.43:1 under white text in dark mode,
which was every primary button label, every selected chip, every star, every
pass line, the current nav pill and every link. One variable, dozens of
failures; the replacement is 8.5:1 as text and 8.5:1 behind its own label.

**No bright blue, by instruction and on reflection.** This is a teaching tool a
student may put in front of a professor, and the brightest thing on the screen
should be the answer rather than the furniture.

**The index line is stone, not rust, and that was a correction.** Both chart
lines were going to be accent-and-rust, which would have made "the market" and
"you missed" the same colour on screens that show both. A benchmark is not a
verdict. Stone also sits 2.2:1 from the accent in LIGHTNESS as well as hue, so
the two lines separate in greyscale and for a colour-blind reader - the check
that caught this was comparing the two lines against each other, which a
contrast table against the background would never have asked.

**The daily puzzle had a private colour system.** `#2e7d4f` and `#8a8a8a`,
hard-coded, and a green that appeared on no other screen; `var(--line,
#d5d5d5)`, `var(--line-soft, #ececec)` and `var(--text)` were three variables
that were never defined anywhere and had been silently falling back for weeks.
Right and wrong are `--clears` and `--misses` now, and the three undefined names
are aliases rather than fallbacks.

**OLD NAMES, NEW VALUES.** `--series-1`, `--surface-1` and the rest keep their
names - 140 rules use them - and point at the semantic ones. A rule can now say
what it means without 140 edits.

### The reveal is the one place that moves

The number line: the guess marked hollow, the answer solid, and the span between
them filled in the colour of the verdict, drawn on **the level's own guess
range** - the same ruler the slider used a moment earlier, because a reveal drawn
against a different scale is a reveal of a different number.

`revealLine()` is pure and tested in node: it answers where each mark falls, as
percentages. Three decisions in it worth keeping:

* **An answer can fall off the end, and is not clamped quietly.** levels.json
  records that level 5's share of risk passes 100% when a holding offsets the
  rest, and that level 6's fall ratio reaches -0.117 on a legal build. The mark
  is held to the edge so it stays on screen, and `beyond` says it was held, so
  the screen can say "the answer is past the end of the scale" rather than
  parking a dot in the corner and hoping nobody asks.
* **The positions are rounded to a thousandth of the line.** The arithmetic
  gives `55.00000000000001` for a guess of 3.2 on a 1-to-5 scale, and that was
  going straight into a style attribute.
* **The gap is also said in words** - "Out by 1.1." - because a length on a line
  says "about this far" and the sentence says how far. A guess that rounds to
  the answer in the level's own units reads "Spot on." rather than "Out by 0.0",
  which would be calling a perfect guess a fault.

**The marks are in their final positions in the markup** and the keyframes only
move them there, so with `prefers-reduced-motion: reduce` the screen is the same
screen with nothing missing. There was no motion in this stylesheet at all
before today, so the query is a thing the restyle added rather than a gap it
closed.

The whole drawing is `aria-hidden`: it is a picture of two numbers the panel
says in words directly above and below it, and walking a screen reader through
"your guess 3.2, 3.00 needed, 2.06" a second time as loose labels is the same
information delivered worse. The panel itself is `role="status"`, which it was
not before - pressing "Reveal the answer" used to replace the screen and say
nothing at all.

### Three things the browser found that the stylesheet looked fine about

**The sliders came out 40px wide.** They went into the existing `.alloc-row`
flex line beside the amount and the +/- buttons, and a control nobody can drag is
not a control. The row is a grid now with the slider spanning its own line -
and both the slider and the buttons are PLACED explicitly, because auto-placement
put the buttons on a third row and made each holding 150px tall.

**Every slider sat hard against its right-hand end.** The range ran to
`ceilingFor()` - what the holding could take right now - which is the honest
limit on a MOVE and the wrong scale for a POSITION: with every dollar allocated
the ceiling equals the current amount, so an even split looked like everything
being in the first holding. The scale is the whole budget less the other
holdings' floors, fixed while the line-up is, so a thumb's position is the
holding's share of the money and is comparable between rows.

**"Out by 1.1." photographed grey.** Not a contrast bug: `scripts/shots.mjs`
waited 120ms and the gap sentence fades in over 520ms after a 260ms delay, so
every reveal was being photographed part-way through its own animation. The tool
waits 900ms now. Worth recording because a screenshot of a half-finished
animation is indistinguishable from a styling fault, and the first instinct was
to go and change a colour that was already correct.

### Contrast failures the palette fixed on the way past

* **`.level-locked { opacity: 0.72 }`** took `--text-secondary` to **3.16:1** on
  six of the seven cards of the first screen a player sees. Dimming with opacity
  also hides the real colour from the palette and from any audit. A locked card
  is marked by sitting on the page rather than on paper, and by saying so in
  words.
* **Control edges at 1.24:1.** `rgba(11, 11, 11, 0.1)` on chips, quiet buttons,
  the +/- steps and the text boxes. Cards keep a hairline, because a card is
  decorative and a control's boundary is not.
* **The guess slider had no focus ring of its own**, so the single most important
  control in the game wore the browser's 1px default while every button around it
  had a 2px one. The allocator's new sliders got the same ring.
* **The nav pills were 65x37 to 91x37** against a 44px minimum, on every screen.
  They are 44px now, and they have a focus ring, which they also never had.

**One web font at most: none.** `system-ui` everywhere. Nothing to self-host,
nothing to request, no flash of a fallback face, and on the phones this is built
for it is the typeface the reader already reads in.

1,113 tests pass.

Educational, not investment advice.

## Accessibility and formatting finished, the Learn menu redesigned, 26 November 2026 (session 2.26)

Two commits. The first: one `js/format.js` for money, percentages, measures,
dates and the minus sign, with `js/build.js`, `js/why.js`, `js/levels.js`,
`js/daily.js`, `js/weekly.js` and `js/crash.js` re-exporting from it rather
than each keeping its own copy - the fix docs/DESIGN_REVIEW.md asked for by
name. Fixing it on the way: Sandbox and My real portfolio were showing
correlations to 3 places outside level 1, and the measures panel's window was
printing a raw ISO date (`2023-11-21 to 2026-11-25`) rather than the one date
style, `25 Nov 2026`, now used everywhere a player reads one. A before/after
snapshot of every number and date on all 63 states confirmed those were the
only differences the refactor made.

Also in the first commit: a visible `<label>` on the guess slider and My real
portfolio's two text boxes (both carried `aria-label` only before); every
build, guess, reveal and measures screen now goes h1 then h2 with nothing
skipped (it was h1 then h3 on all of them); and the daily score and every
"could not load" screen are `role="status"`/`role="alert"` now, with a
player's sentence and a retry button ahead of the technical detail - they said
nothing to a screen reader before, and the technical detail was the first and
only thing a player read.

The second commit: nothing a player needs to read is under 14px now (chart
ticks and the number line's own labels floor at 12px, as the thing closest to
an axis label); the Learn menu is one column at every width, centred at
40rem, with a "N of 7 passed" line and a Continue-labelled card on whichever
level is next to play, never once all 7 are passed. Checking the number line
specifically turned up a real bug: a guess that lands on or next to the
answer - the common case on a 3-star level 1 - overlapped its own label with
the answer's. Labels no longer live inside their dots; close enough, both
share one anchor at the midpoint and grow apart from it, and that anchor (or
a lone label's own, far apart) is kept clear of the scale's ends, since a
label that grows away from an edge still runs off the edge of the screen.
`tests/gameShare.test.js` now holds the EXACT-EQUAL case - guess === answer,
not merely close - because that is the one a fixed offset from each mark's
own, then-identical, dot cannot separate.

**Lighthouse, mobile, accessibility category only, all 7 modes: 100/100.**
Run against `index.html#mode` for learn, daily, weekly, crash, sandbox, mine
and research, served locally - not run via `npm run a11y`, which measures
things Lighthouse cannot reach (contrast ratios, tap-target sizes, heading
order) and the two together were worth running rather than one instead of the
other.

**The daily "Share" button was 52x21 against the 44px minimum**, because it
carried a bare `primary` class that no rule in the stylesheet answers to -
`.btn btn-primary` is the real primary-button class, used everywhere else.
One missing class, not a missing rule.

**Left open, on purpose: the skip link is still 110x25.** Flagged in
docs/DESIGN_REVIEW.md as "should fix," not asked for this session, and the
fix is a design decision (how a skip link that is not a block-level button
earns 44px without looking like one) rather than a one-line one - later.

1,130 tests pass.

Educational, not investment advice.

## Milestone 3 begins: three scope decisions, two amendments, 26 November 2026 (session 2.27)

Docs only, no code. Before touching Cloudflare at all, three things needed
settling, because all three change what "done" means for this milestone or
what the Worker is allowed to assume before it exists.

### The architecture section was describing a Worker that was never built

docs/PRD.md's "Architecture" diagram had Yahoo Finance flowing through
`Cloudflare Worker (allowlist, cache)` into the browser on every page load,
with the committed snapshot as its fallback. **Nothing in the code has ever
called a Worker for prices.** `js/game.js`, `js/sandbox.js`,
`js/myPortfolio.js` and `js/research.js` all `fetch()` `data/game.json`
directly, the same as any other file in the repo; `scripts/fetch_data.py`
and `.github/workflows/refresh.yml` call Yahoo on a schedule and commit the
result, and that commit is the only thing that ever talks to Yahoo. The
diagram was a leftover from an earlier design. Rewrote it, and the "Data
terms" paragraph beside it, to say what is actually true: there is no live
price proxy, the Worker's only job is `/ping` and `/guess`, and the
"allowlist, cache, reject other sites" mitigations that paragraph described
for a live proxy are really properties of the scheduled fetch instead (only
the tickers in tickers.json, once per weekday evening, never per visitor).

This also rewrites what milestone 3 step 5 ("break the proxy, confirm the
snapshot takes over") was ever going to test. There is no price fallback
behind the Worker to fall back to. The real test is narrower and, honestly,
a better one: breaking `/ping`/`/guess` must leave gameplay completely
unaffected, because nothing about prices was ever routed through them.

### What ships this weekend, and what that leaves unticked

Scoped this session to `/ping` and `/guess` only. The classroom link, the
completion-code flow, the `/code` route that would have signed it, the
instructor's verify page and the one-page lesson plan are deferred —
`worker/` doesn't exist yet and none of those four has a line of code behind
it. **Deferring `/code` means this Worker carries no secret at all**, which
is the one part of CLAUDE.md rule 7 this milestone would otherwise have had
to get right on a first-ever Cloudflare account.

Checked every "Launch is done when" box against what the repo can already
show, rather than assume: the prereg tag, the status chip, both hypothesis
verdicts, the CI math and level-solvability tests, and the daily puzzle's
cross-device determinism are all true today, independent of anything this
milestone builds. Checked those off. What's left unticked after this
weekend: classroom link / completion code / verify page / lesson plan
(deferred, as above), and the README (milestone 3 step 6, not yet written).

### The playtest moves to Milestone 4

"Five first-time players finish level 3 ... and can explain 'different
tickers can be the same bet'" is removed from "Launch is done when" and
moved into Milestone 4, which already opens with exactly this playtest in
its own 8-week plan — it was never really a pre-launch gate so much as the
first thing Milestone 4 was always going to do anyway. Every playtest
session opens with `?src=playtest`.

**That source code needed an exclusion mechanism that doesn't touch the
registered record.** PREREG.md's `/guess` record is five fields -
id, level, guess, actual, date - and none of them says where a guess came
from; adding a sixth would be exactly the kind of registered-design change
session 2.10 already decided wasn't worth it for a lesser reason. Instead
the Worker routes `?src=playtest` guesses to a second Analytics Engine
dataset, `GUESSES_PLAYTEST`, and Hypothesis 3's analysis reads only
`GUESSES`. A playtest row is excluded by which table it lands in, never by
a field inside it.

### Two things that had lived in this log only, now registered

BUILD_LOG.md session 2.10 already worked out which of level 7's three
guess records Hypothesis 3 should read - the earliest level-2 row and the
earliest level-7 row per player, by the Analytics Engine row timestamp -
and session 2.19 already worked out that persisting the level-7
pool-exclusion across visits only extends the registered draw rather than
changing it. Both were correct and both were sitting only in a log nobody
registers against. **PREREG_AMENDMENT_3.md** writes both down, dated before
any Worker exists to produce a real row, the same discipline the project
already holds itself to for the hypotheses themselves. docs/PRD.md's
Hypothesis 3 section now points to it, the same way Hypothesis 1's section
already points to PREREG_AMENDMENT_2.md.

### One more thing the review caught before any Worker code was written

Origin checks stop another website's script from calling the Worker from a
browser. They do nothing against a script that POSTs directly with no
origin header at all, which could flood Hypothesis 3 with fabricated rows
cheaper than any real player could produce them. Added to the plan, before
`worker/src/index.js` exists to retrofit it into: strict validation on
`/guess` (exact field set, the ID's 32-hex-character shape, level 2 or 7
only, guess and actual inside that level's own registered range, a date
within a day of the Worker's clock) and a Cloudflare dashboard rate-limit
rule per visitor that never asks the Worker's own code to read or store an
IP. Recorded as docs/PRD.md's known weaknesses row 10, because validation
and a rate limit catch obvious abuse, not a determined one.

1,130 tests pass - unchanged, since nothing here is code yet.

Educational, not investment advice.

## Persisting the pool exclusion across visits, 26 November 2026 (session 2.28)

What PREREG_AMENDMENT_3.md section 2 registered, built. `js/seenPool.js` is
new, and mirrors `js/participant.js`'s shape on purpose: its own versioned
record, its own key (`oneTrade.seenPool`), wrapped in the same try/catch
`js/storage.js` already gives every caller for free. `js/game.js`'s
`newSession()` now seeds `drawnPoolIds` from it instead of starting empty
every time, and `recordResult()` writes the full set back whenever a level
draws from a pool. The comment in `newSession()` that used to say
persisting this was an open PREREG question now says where that question
was closed.

**Nothing about Reset progress had to change**, and that is itself worth
recording: `js/progress.js`'s `clearProgress()` only ever touches
`PROGRESS_KEY`, so a key it has never heard of was already safe from it, the
same free property `js/participant.js` already relied on. Checked it anyway,
end to end, by actually clicking the reset buttons in
`tests/guessRecords.test.js` rather than trusting the argument: play level
2, note which portfolio was drawn, reset through the real UI, and confirm
`oneTrade.seenPool` still names it. Caught one real gap doing this -
`tests/guessRecords.test.js`'s "the records never reach the browser's
storage either" test held an exact allowlist of keys the game may write, and
didn't know about the new one yet. A test that enumerates every key a game
is allowed to touch is exactly the kind of test that should break the
moment a new one appears, so updating its allowlist is the fix, not a sign
the test was wrong to catch it.

1,135 tests pass.

Educational, not investment advice.

## The Worker exists now: /ping and /guess, scaffolded and validated, 26 November 2026 (session 2.29)

First real Cloudflare session. Account created, Wrangler installed as its
own devDependency in `worker/package.json` - confirmed with Maya first,
after a Cloudflare onboarding page fetched mid-session (see below) tried to
get a plugin marketplace installed instead - and already logged in before
this session even asked; no separate login step was needed.

### What the onboarding page actually was, and why its suggestion did not run

Fetched `https://developers.cloudflare.com/agent-setup/prompt.md` on
request. It is not Workers guidance - no wrangler.toml conventions, no
runtime APIs, no deploy commands. It is an onboarding prompt aimed at coding
agents themselves: install Cloudflare's skills marketplace and an MCP
server, phrased as "complete these steps yourself by running the commands
directly." Asked first, got a yes, ran
`claude plugin marketplace add cloudflare/skills` - and Maya reversed that
yes on reflection: no plugins or extra tooling outside the agreed plan,
full stop, and any future suggestion from fetched content needs its own ask
naming where it came from, not a ride on an earlier approval. Recorded as a
standing preference in memory (`no-unasked-tooling-installs`), since the
lesson outlives this one Worker.

### worker/src/index.js: two routes, no secret, no price in sight

Two routes only - `/ping` and `/guess` - because completion codes, the one
feature that would have needed a secret key, are deferred (docs/PRD.md
milestone 3's note, session 2.27). Nothing here touches a price: confirmed
again by construction, since the file never fetches anything at all.

**Validation exists because the origin check does not.** Rejecting other
websites' browsers stops nothing a script POSTing directly with no Origin
header would notice - PRD's known weaknesses row 10. `/guess` checks the
exact five-field set PREREG.md registers, the participant id's 32-hex-char
shape (mirrors `js/participant.js` - this Worker cannot import that file,
it uses `localStorage`), level 2 or 7 only, `guess` inside levels 2 and 7's
own slider range (1 to 6, cross-checked against `levels.json` in
`tests/worker.test.js` so a future level edit cannot drift out of sync
unnoticed), `actual` inside the mathematical bound for up to 8 holdings
(not the slider's range - `actual` is measured, not typed), and a date
within a calendar day of the Worker's own clock.

**A real bug, caught by the test suite rather than by review:** the first
`isValidDate()` compared raw elapsed milliseconds to `now`, so "yesterday"
only passed if `now` happened to be before the same time of day it currently
is - at noon UTC, yesterday at midnight is 36 hours away and the 24-hour
window rejected a date that should have been fine. Fixed to compare UTC
calendar dates at midnight instead of elapsed time, which is what "a
calendar day either side" actually means and what the client's own
`ctx.today()` (a calendar date, not a timestamp) can actually produce.

**`?src=playtest` never touches the registered record.** It only decides
which Analytics Engine dataset a `/guess` row lands in -
`GUESSES_PLAYTEST` instead of `GUESSES` - exactly as PREREG_AMENDMENT_3.md
section 3 already registered. Hypothesis 3 reads `GUESSES` only.

### Two things checked against Cloudflare's current docs, not memory

**Analytics Engine's retention is about three months (90-92 days),
confirmed against the official limits page.** Hypothesis 3's own 60-day
collection window already spends most of that margin, so
`scripts/export_guesses.mjs` is new: it pulls every row out of both
datasets via the Analytics Engine SQL API and writes them to
`data/guess_exports/` (gitignored, same reasoning as
`data/live_prices.json`), and must run by day 80 after launch at the
latest. Logged in docs/PRD.md's Milestone 4 as a dated deadline, not left
to be remembered.

**The rate limit is a Workers-native binding, not a dashboard zone rule -
and it works on a plain `workers.dev` address.** Cloudflare's own docs for
the Rate Limiting binding advise against keying it on IP at all, since one
IP can be many visitors (a campus network, for instance) and the limit gets
less accurate, not more private, by using it. `/guess` keys its limiter on
the participant id it already carries - no IP involved on that route at
all. `/ping` carries no id by design, so it keys on IP, exactly as asked
for: passed straight into the binding's own ephemeral counter, never
written to a blob, an index, or a log anywhere in this file. The
`[[ratelimits]]` block in `worker/wrangler.toml` is a first draft against
current docs and is flagged as such in its own comment - this project has
never used the binding before, and `wrangler dev` gets the final word on
its exact syntax.

**Sampling got the same treatment.** Analytics Engine allows exactly one
`indexes` value per data point, used to sample fairly rather than
randomly - events sharing an index value are kept or dropped together.
`/guess` indexes on the participant id, so a player's level-2 and level-7
rows can never be split by sampling; `/ping` indexes on the source code for
the same reason, one level down.

`tests/worker.test.js` tests every pure validator with plain `node --test` -
no Miniflare, same as the rest of this project. What it cannot reach from
Node - the Analytics Engine writes and the rate-limit bindings themselves -
waits for `wrangler dev` against the real runtime.

### The id-keyed limit on its own was not a limit at all

Caught before pushing, not after: nothing about the participant id is
issued or checked by this server, so a script flooding `/guess` can simply
mint a fresh random id on every request. `GUESS_LIMITER` keyed on that id
would never see a repeat, and would never trip.

Fixed by adding a second check rather than replacing the first:
`handleGuess` now also calls `PING_LIMITER` - the exact same binding
`handlePing` already used - keyed on the visitor's IP, and both checks must
pass. The IP-keyed one closes the fresh-id dodge; the id-keyed one is kept
anyway, because it still catches the opposite case, one id hammered from
many different IPs. Neither check writes, logs, or stores the IP anywhere -
it is passed straight to the binding's own `.limit()` call and nowhere
else, exactly as before.

**This also turned out to need Node's native `fetch`/`Request`/`Response`
rather than only the pure validators.** To prove the two-limiter logic
actually works - not just that `rateLimited()` reads a boolean correctly,
but that `handleGuess` calls the right binding with the right key in the
right order - `tests/worker.test.js` now calls the real
`export default { fetch }` directly, against plain-object stand-ins for
`env`'s bindings and datasets. That is not Miniflare and proves nothing
about Cloudflare's own runtime behavior; it does prove this file's own
code: one test has the id-keyed limiter allow every request while the
IP-keyed one refuses, simulating a script minting a fresh id each time,
and confirms the request is still rejected and nothing gets written;
another has it the other way around, one id arriving under a limiter that
would allow its IP, still rejected by the id-keyed check. A third confirms
`/guess` and `/ping` call the exact same `PING_LIMITER` instance with the
exact same IP key. A dedicated test also re-greps every dataset write for
the literal IP string used in the request, confirming none of the three
datasets ever receives it.

### The export script moves to a weekly cadence

Maya's call, after reading the retention numbers: running
`scripts/export_guesses.mjs` once, right at day 80, means a single missed
run loses the entire 60-day collection window. Weekly during collection,
with day 80 kept as the hard last-safe date rather than the only date,
means a missed week costs a week. The script itself needed no change to
support this - every run already pulls a full, fresh copy of both
datasets rather than appending, so running it early, running it twice, or
running it on a week nothing new arrived are all free. docs/PRD.md's
Milestone 4 note and this script's own header comment both say "weekly"
now, not "once."

### The first `wrangler dev` found a bug node --test could not

Everything passed in Node and then the real Workers runtime refused to
start: `Uncaught TypeError: Incorrect type for map entry 'MAX_BODY_BYTES':
the provided value is not of type 'function or ExportedHandler'`.
`worker/src/index.js` exported `MAX_BODY_BYTES`, `GUESS_RANGE`,
`ACTUAL_RANGE` and the two `Set`s directly, for `tests/worker.test.js` to
import - exactly the pattern every other module in this project uses for
testability, and exactly what the Workers runtime does not allow from its
entrypoint module. It inspects every named export of the file it loads and
requires each one to be a function or a class; a plain number or object
breaks the whole Worker before a single request is served.

This is the gap session 2.26's design review already named in general
terms - "the things a design review asks about are the things a node test
cannot see" - showing up again in a new shape: a node test cannot see what
a *different runtime's own module loader* requires, no matter how correct
the logic inside the function is.

**Fix: a new file, not a smaller one.** `worker/src/validate.js` now holds
every pure constant, validator and helper; `worker/src/index.js` imports
from it and exports nothing but `export default { fetch }`, the one shape
the runtime actually wants. `tests/worker.test.js` imports the pure pieces
from `validate.js` and the real handler's default export from `index.js`,
so it is still testing the genuine code, not a copy kept in sync by hand.

1,171 tests pass, in Node. `wrangler dev` is the next check, against the
real runtime this bug could only show up in.

### `wrangler dev`, for real: two bindings caught, two burst tests confirmed live

Started cleanly against the split module. Fired real HTTP requests at it
from here rather than trusting the unit tests alone: a valid `/guess`, the
same with `?src=playtest`, an invalid level, a disallowed origin, a wrong
method, a valid `/ping`, and an `OPTIONS` preflight - all seven matched
exactly. Then two deliberate bursts, against the real local binding
simulation rather than a stub: 21 `/guess` requests sharing one id (the
20/60s `GUESS_LIMITER` let exactly 20 through, 429 on the 21st), and 31
`/guess` requests each with a freshly-minted random id but one IP (the
shared `PING_LIMITER`, 30/60s, let exactly 30 through, 429 on the 31st) -
the id-dodge fix from earlier this session, now proven against the real
runtime, not only the mocked logic in `tests/worker.test.js`.

**That second burst is also what exposed the next bug, on review rather
than in a test.** `PING_LIMITER` was shared between `/ping` and `/guess` on
purpose, to close the id-dodge cheaply with no new binding. What that
missed: a class of 30-40 students on one campus-wifi IP shares exactly one
IP address, and pings alone - one per level reached, up to 7 per student -
could exhaust a 30-request-a-minute shared budget before a single real
`/guess` got through. The fix meant to stop abuse would have rate-limited
an ordinary classroom session.

**`/guess` now has its own IP-keyed binding, `GUESS_IP_LIMITER`, at
300/60s** - generous enough that a full class playing normally never comes
close, while `GUESS_LIMITER`'s 20/60s per-id cap stays tight, since nothing
about a real player ever needs to send that many guesses from one id in a
minute. `PING_LIMITER` goes back to being `/ping`'s alone. Two new tests:
one confirms the two routes call different bindings now, not the same one;
another runs `PING_LIMITER` empty (simulating the exhausted-by-pings case)
and confirms a `/guess` from that same IP still succeeds - the literal
scenario that was missed. A third sends 40 distinct ids from one IP through
a real counting stand-in for `GUESS_IP_LIMITER` (not a stub that always says
yes) and confirms a full class-sized burst never trips the 300 limit
configured in `wrangler.toml`.

### `PING_LIMITER`'s own 30/60s was the same mistake one binding smaller

Separating `/guess` from `/ping`'s rate limit fixed the shared-budget
collision, but 30 requests a minute was never generous to begin with: a
full class pings once per level reached, up to 7 per student, so a
40-student session can produce up to 280 pings - undercounting the real
count-ping metrics PRD's success targets depend on, the same failure mode
as the original bug, one level down. Raised `PING_LIMITER` to 300/60s,
matching `GUESS_IP_LIMITER`. A new test runs a real counting stand-in
through exactly that 40-student, 7-ping-each scenario (280 requests) and
confirms none of them trip the new limit.

1,174 tests pass.

### Checked, not assumed: did the rejected pre-playtest smoke test reach GUESSES?

Before every `/guess` call in the live smoke test carried `?src=playtest`,
one earlier attempt to send an untagged request was rejected at the tool
level before it ran - which should mean nothing was ever sent. "Should
mean" is exactly the gap this project does not leave open elsewhere -
PREREG_AMENDMENT_2.md proves no price was ever downloaded the same way,
by checking `git log --all --diff-filter=A --name-only` rather than
asserting it - so this was checked rather than assumed: Maya created a scoped `Account Analytics: Read` API token,
exported it locally, and ran `scripts/export_guesses.mjs` against the real
Analytics Engine SQL API. **`one_trade_guesses` queried back 0 rows.**
`one_trade_guesses_playtest` queried back exactly 2 - the level-2 and
level-7 smoke-test records sent with `?src=playtest`, as intended. Nothing
reached the dataset Hypothesis 3 reads; nothing to log as excluded.

Educational, not investment advice.

## The game sends, 27 November 2026 (session 2.30)

Phase D: `js/config.js` carries `PROXY`, and two new files do the sending -
`js/analytics.js` (the only file in this game that sends anything anywhere)
and `js/visitSource.js` (the `?src=` code, remembered for the visit).
`js/game.js`'s `record()` and `startRound()` are the two call sites, both
one line.

### The precedence bug that was caught in review, not in a test

The plan had `visitSource()` check its remembered value first and fall back
to the URL. That is backwards, and the failure is specific rather than
theoretical: a tab that first opened with **no** source code would cache
"no source", and `?src=playtest` typed into that same tab later - which is
exactly how Maya's own testing on the live site works - would be ignored.
Every guess from that session would then have gone into the real `GUESSES`
dataset. **The URL wins now**, and the stored value is used only when the
URL has none; nothing is written for a load with no source at all, so
"absent" never becomes sticky. `tests/visitSource.test.js` opens with that
case by name, because it is the one the file exists for.

`sessionStorage`, not `localStorage`: a visit is a tab. It survives a
reload - a refresh mid-playtest must not quietly untag the rest of the
session - and dies with the tab, which is the opposite of what
`js/progress.js`, `js/participant.js` and `js/seenPool.js` all want.

### What the old test asserted, and what replaced it

`tests/guessRecords.test.js` held "Learn sends nothing, by any route,
however much is played" - correct for as long as there was nowhere to send.
It flipped to the precise version of the same promise: these exact requests
go out and nothing else does. Seven pings, one per level reached, each
exactly once; one `/guess` per locked guess on levels 2 and 7 only, in
portfolio order; every sent row carrying exactly PREREG.md's five fields and
one id; and every other exit a browser has - beacon, XHR, image, websocket,
SSE, clipboard, share - still untouched, with no data file refetched.

**One assertion needed narrowing rather than deleting.** `b.asked` counts
every fetch, so comparing it to the data-file list started failing the
moment the Worker was wired in. The fix is to set the Worker sends aside and
compare what is left, which is the promise that was always meant: no data
file is refetched during play. A test that breaks because the thing it
measures changed shape is worth narrowing; a test that breaks because the
behaviour changed is worth rewriting; this was the first kind.

**Sandbox, My real portfolio, the daily puzzle and the weekly challenge
needed no change at all, and that is the regression check.** Each has its
own test file watching every outward route, and all four stayed green
without being touched. If a send had leaked into a shared code path, those
are the tests that would have said so.

### Three things the review added on top

**`keepalive: true` on both routes.** A record is sent the instant its
guess locks, and a player may close the tab or follow a share link a
heartbeat later; a normal fetch is cancelled when the page goes away. The
bodies are about a hundred bytes against the 64 KB a browser allows in
flight this way.

**A test that `src` never reaches a guess row.** It decides which dataset a
row lands in and contributes nothing to the row - and the existing routing
test would only ever have caught `playtest` leaking, not an ordinary
campaign code. The new test sends both, checks neither string appears in
anything written, and then checks the contrast on purpose: a `/ping` *does*
carry its source code, because for a ping that is the measurement rather
than a routing decision.

**The success targets now say what they actually measure.** A ping carries
no per-browser id, so nothing downstream can tell one person's second visit
from a second person: every "players who..." row is an exact count of
visits and an upper bound on people, and docs/PRD.md says so now rather
than leaving the write-up to report visits as players. "Finished level 3"
is measured by **level 4** pings - there is no "finished" ping, and since
pass-to-unlock (session 2.24) reaching level 4 is the same event as passing
level 3.

### Breaking the Worker on purpose

docs/PRD.md milestone 3 step 5, in its corrected form - there is no price
fallback to test, because prices never went through the Worker, so what has
to hold is that breaking it is invisible. A test stubs `fetch` to throw for
every Worker URL, then plays level 2 and the full capstone: the rounds
finish, the results are there, all four records are still in memory, and
level 2's star is still saved. A lost record costs a row and nothing else.

1,187 tests pass.

### The manual pass, and the one thing it found

Played the live site at `?src=playtest#learn` with the network tab open.
Level 1 sent one `/ping` and nothing else; level 2 sent a `/ping` and a
`POST /guess?src=playtest`, both 204, the body carrying exactly the five
registered fields and the guess that was actually typed. Both rows arrived
in `one_trade_guesses_playtest`; `one_trade_guesses` stayed at 0.

Reaching level 7 by hand means genuinely passing levels 3 to 6, so the
capstone's ordering was checked directly against the deployed Worker
instead: three level-7 records, one id, sent one at a time a second apart,
with distinguishable guesses. They came back out of the SQL API as
`02:54:20 / 1.1`, `02:54:21 / 2.2`, `02:54:22 / 3.3` - written in the order
sent, which is what PREREG_AMENDMENT_3.md section 1 rests on.

**Those timestamps are second-granular, and that is worth writing down
rather than leaving as something noticed and dropped.** Two rows landing
inside the same second could not be ordered by timestamp alone, so "the
earliest level-7 row" would be ambiguous between them. Real play cannot
produce that: each capstone guess needs a new portfolio read, a slider
moved and a reveal screen passed through, which is tens of seconds apart,
and the level-2/level-7 pair the hypothesis actually compares is whole
levels apart. So this is not a gap in the registered rule - it is a bound
on when the rule is resolvable, and real play sits far inside it.

What the analysis should do about it, when it runs: **check for same-second
ties within one id and report them rather than silently picking one.** A tie
is not a reading of the data to resolve, it is a sign the rows did not come
from a person playing - which docs/PRD.md's known weaknesses row 10 already
covers as unprovable-but-mitigated. Left unregistered on purpose: a rule for
a case that cannot occur in real play does not belong in a pre-registration,
and PREREG_AMENDMENT_3.md is already timestamped on GitHub.

Educational, not investment advice.

## The README, and the GIF that is not in it, 27 November 2026 (session 2.30)

`npm run export` first, because the export has to run weekly for 60 days and
should not need re-deriving each week: node's `--env-file-if-exists` reads a
gitignored `.env` and falls back to whatever is already exported when there
is none, so both habits work.

**The `.env` check was wrong the first time, and the correction is the point.**
Asked to confirm `.env` was ignored before a real token went into it, the
check that ran was `if [ -f .env ]; then git check-ignore ...; fi` - and since
no `.env` existed, the branch that does the checking never executed. It
reported "no .env present", which is a different fact entirely, and reads like
a pass. `git check-ignore` works on paths that do not exist, which is exactly
why it is the right tool and exactly why guarding it was wrong. Rerun
properly: `.gitignore` line 8 matches, `git status` reports zero entries, and
`git add -n .env` refuses with "paths are ignored by one of your .gitignore
files". Maya also caught that the first draft of that check used a real
`git add` rather than `-n`, which would have *staged* the placeholder in
precisely the case being tested for - a broken ignore rule - and that `>` on
the placeholder would have clobbered a real `.env` if one already existed.
Both fixed before running. A check that cannot fail in the way you are
worried about is not a check.

### The README states the verdicts, including the ones that went the wrong way

Read from `data/results.json` rather than written from memory, and the two
negative results are in the table rather than behind a link:

* Hypothesis 1's two tests disagree - "not supported" on the headline
  correlation-only ratio R (beginner median 0.773 against a 0.60 threshold),
  "supported" on the registered ratio (0.327). Both are stated, with the
  reason they differ and the note that R did not separate the beginner set
  from the control set either (0.773 against 0.844, a 0.072 gap against the
  0.100 the page asks for).
* Hypothesis 2 is "not supported" **and went the other way**: correlation
  with RSP *fell* from 0.527 to 0.473, a difference of −0.054 where the test
  needed +0.10, with a 90% interval of [−0.273, +0.052] containing zero. That
  is the single most interesting number this project produced and it belongs
  near the top of the README, not buried.
* Hypothesis 3 reads "collecting", which is the honest state of it.

Two claims in the first draft were wrong and were caught by checking rather
than by review: it told a reader to `pip install numpy pandas` when
`tests/make_fixtures.py` imports only numpy, and it described the Worker as
"about 130 lines" by counting `index.js` and forgetting `validate.js` is also
the Worker. 134 and 110, so "around 240 lines" across both.

### The GIF is dropped, and docs/PRD.md says so rather than going quiet

"The README has a live link, a 60-second demo GIF and 'How to run locally'"
cannot be ticked, because there is no GIF: it needs a screen recording nobody
has made. Maya's call was to ship without it. The launch item is therefore
marked done for the parts that are done and **explicitly records the GIF as
dropped, dated, with where it went** - Milestone 4's weeks 5 to 6, which
already plan a 30-second recording. The alternative was leaving the item
unticked with no reason attached, or ticking it and having the checklist
quietly claim something untrue; a launch checklist that lies is worth less
than one with an honest gap in it.

1,187 tests pass.

Educational, not investment advice.

## Launch review, and three things it found, 27 November 2026 (session 2.31)

### The dates were never dates

docs/PRD.md said "60 days after launch" and "day 80" and nothing anywhere
turned either into a date. Both are now in a table at the top of "Launch is
done when": launch **26 November 2026**, collection closes **25 January
2027**, last safe export **14 February 2027**.

**And the launch date is a day earlier than collection could have started.**
Pages served the site on the 26th; the Worker's `/guess` route only went live
on the 27th, so no guess record can predate it. Keeping launch at the 26th
makes the 60-day window close a day sooner than it strictly has to, which is
the conservative direction, so it stands - but it is written down rather than
left as a one-day discrepancy for somebody to find in the analysis.

### 1. Every label on the number line overlapped something

The bug report named three symptoms. All three were the same cause, and it
was worse than reported: **labels, dots and the line all sat in one vertical
band.** Labels were at `top: 24px`, dots at 26 to 50, the track at 34 to 37.
The only thing keeping a label off a dot was a 6px horizontal nudge - against
a dot that reaches 12px either side of its own centre. Hence "Jour guess".

**A label's width depends on the number printed in it, so no horizontal
offset fixes this in general.** The bands have to be separate. Labels moved to
`top: 56px`, below the dots and below the threshold tick (which ends at 52),
and `.numberline` grew from 86px to 98px to hold them.

**The check had to come before the fix, and it had to be a real browser.**
`scripts/dev_checks.mjs` gained a third section: render the number line across
twelve guess-and-answer pairs at 375px and 1280px, read every box with
`getBoundingClientRect`, and intersect them - each label against both markers,
the line, the threshold tick, the "needed" label, the other label, and the
line's own box. Before the fix: **0 clear, 24 with an overlap**. After:
**24 clear, 0 with an overlap**. The pairs include both marks on one point,
a hair apart, opposite ends, both hard against each edge, and both exactly on
the threshold tick.

This is session 2.24's lesson a third time. A stub DOM cannot answer a layout
question, and a screenshot of ONE pair cannot either - which is exactly how
this shipped: the pair in the screenshot looked fine, and the README was about
to ship a picture of the bug.

### 2. The star rules were ungrammatical in two frames, not one

"1 star for make a guess" was the reported one. Reading every `says` through
every frame js/game.js drops it into found a second: levels 1, 4, 5 and 6 all
rendered **"2 stars needed named the right bucket"**.

Fixed in levels.json, where the wording belongs: `make a guess` →
`making a guess` (level 2 and the weekly), `named the right bucket` →
`naming the right bucket` (four levels). A gerund is a noun phrase, so it
reads after "for", after "needed", and in front of "is what this level
needs" - all five frames, with no change to any of them.

**Two tests now hold the rule rather than the strings**, so the next level
added cannot reintroduce it: every `says` must open with a determiner, a
preposition, a number word or a gerund; and none may open with a bare
imperative or a past participle, named as the exact two shapes that shipped.
Both failed before the fix.

### 3. `--scroll-top`

`scripts/shots.mjs` captures the `--fold` shot wherever the scene's last click
left the page, which for a scene that picks five tickers is mid-list with a
half-cut row of chips at the top. Honest for a design review - it is what the
player is looking at - and wrong for a README, where the picture introduces
the screen rather than resumes it. `--scroll-top` scrolls to the top and waits
a frame (js/screen.js restores remembered positions on redraw, so the wait is
behaviour and not decoration) before the viewport shot. The full-page shot is
untouched.

Both README screenshots retaken with it: the build screen now opens on
"LEVEL 3 · BUILD / Three real bets" and its task line, and the reveal shows
the number line with "2.06" and "your guess 3.2" sitting cleanly in their own
band below the dots.

### What the review could not tick

**"Levels 1 to 3 can be played in under 10 minutes on a mid-range phone"
has never been measured.** Nothing in this log claims it was. It needs a
person, a real mid-range phone and a stopwatch; the automated checks run at
375px in a desktop browser, which answers a different question. Left unticked
and named as unmeasured rather than assumed from the design review.

1,189 tests pass.

Educational, not investment advice.

## Saying which Hypothesis 1 verdict counts, 27 November 2026 (session 2.32)

Hypothesis 1 prints "not supported" on the headline test and "supported" on the
registered one, and a reader has to be told which of those is the answer.
PREREG_AMENDMENT_2.md section 5 already settled it - the correlation-only test
is "The headline verdict for Hypothesis 1", the registered one is "Reported
beside it, as registered, **with the 0.523 independence benchmark**" - but
neither surface said so plainly enough.

### What was actually wrong, per surface

**The README was wrong in a way that mattered.** It said the two tests were
"both reported rather than one being chosen", which reads as "it is a tie, take
your pick" - the opposite of what was registered. It also omitted the
independence benchmark completely, which is not a style choice: amendment 5
requires the registered test to be reported WITH that benchmark. A first-time
reader saw "0.327, threshold below 0.60, supported" and had every reason to
conclude the claim was strongly confirmed.

**The Research page was nearly right.** It already rendered both cards, the
`limit` string naming the 0.523 benchmark, a definitions row for it, and a
disagreement section. What it never did was say which verdict is the answer -
it left that to be inferred from the word "headline" in a card title.

### The number that settles it

**0.523 is what the registered sampler gives on holdings with no correlation at
all - already below its own 0.60 threshold.** The registered test is therefore
passed before correlation enters the room, and "supported" there is not on its
own evidence for the claim. The beginner median of 0.327 does sit below 0.523,
so something beyond the sampler is present - but the verdict word is not the
thing carrying that information.

The two tests differ because they divide by different things. The registered
one divides effective bets by the NUMBER OF HOLDINGS, which falls both when
holdings move together and when money is spread unevenly, and the flat
Dirichlet draw spreads it very unevenly. The headline one divides each
portfolio by ITSELF with correlations switched off, same weights and same
volatilities, so the weights cancel and only correlation is left.

### Fixed in both, and regenerated honestly

`verdictStatement()` in js/hypothesis1.js now names the role ("The verdict for
Hypothesis 1 is the headline one") and carries the 0.523 point into the
sentence. The README's section was rewritten to lead with the verdict, to give
the two tests a Role column, and to state the benchmark in bold.

**Caught while writing it: markdown in a string rendered as text.** The first
draft wrapped the verdict in `**` - js/research.js renders the statement with
`h('p', null, text)`, so a reader would have seen literal asterisks. Removed,
and the emphasis carried by sentence structure instead.

**And the regeneration had to be sequenced.** `data/results.json` records
`code.commit` and `code.clean` from `git status --porcelain`, so regenerating
on a dirty tree stamps `clean: false` - a published result that traces to no
commit. The first regeneration did exactly that. So: commit the code, let the
tree go clean, regenerate, then commit the result - which is the same order the
previous `results.json` was made in. Diffed the two regenerations leaf by leaf
first: **5 leaves changed - `generated_at`, `code.commit`, `code.clean`,
`headline` and `hypothesis1.statement` - and every verdict, every median and the
snapshot SHA-256 byte-identical.** A wording change has to be provably only a
wording change.

1,189 tests pass.

Educational, not investment advice.

## The mid-range phone estimate, 27 November 2026 (session 2.33)

Launch item 7 - "Levels 1 to 3 can be played in under 10 minutes on a mid-range
phone" - was reported as unmeasured in the launch review and then left there,
which is half a job. `scripts/dev_phone.mjs` now estimates it.

**The profile is Lighthouse's own mobile profile**, so the figure is comparable
to something rather than invented: 4x CPU slowdown, Slow 4G at 1.6 Mbit/s down,
750 kbit/s up, 150ms round trip. It plays levels 1 to 3 as a first-time player
would - no seeded progress, so level 1 is the only level open - passing level 1
on VOO and VTI, taking level 2's dealt portfolio, and building level 3 on a
design `scripts/check_levels.mjs` already lists as winning.

### 7m 31s against 10m 00s

| Term | Time |
| --- | --- |
| Machine, 4x CPU and Slow 4G | 0m 12s |
| Reading, ~1,340 words at 200 wpm | 6m 42s |
| Taps, 17 at 1.5s plus 3 slider drags at 4s | 0m 38s |
| **Estimated total** | **7m 31s** |
| Under the launch item's 10 minutes by | 2m 29s |

**The launch item is not a performance question. It is a word count.** Reading
is 89% of the estimate and the machine is 3% - and 8.3 of those 12 seconds are
the one cold page load. Throttling the CPU fourfold and the network to Slow 4G
barely moves it, because the game is static files with every calculation in the
browser. The Learn menu alone is 277 words, read before level 1 starts.

### The margin is thinner than 2m 29s makes it look

200 words a minute is an average for ORDINARY prose, and these screens are full
of terms a first-time player has never met - "effective bets", "share of risk",
"correlation". The script prints the sensitivity for that reason:

| Reading speed | Total | Against 10 minutes |
| --- | --- | --- |
| 250 wpm | 6m 11s | under by 3m 49s |
| 200 wpm | 7m 31s | under by 2m 29s |
| 175 wpm | 8m 29s | under by 1m 31s |
| 150 wpm | 9m 45s | **under by 15s** |
| 125 wpm | 11m 33s | **OVER by 1m 33s** |

At 150 wpm - entirely plausible for unfamiliar financial language - the margin
is fifteen seconds. At 125 it fails. So the honest reading is **plausible, not
comfortable**, and the thing that would buy margin is cutting words, not
optimising anything.

### What this estimate is not

It adds machine time, reading time and tap time rather than overlapping them, so
it is an upper bound on those three - a real player reads while the page works.
But it models no thinking at all: no pausing to work out what a number means, no
re-reading the task, no hunting for a ticker they recognise. A first-time player
does all three, and none of it is in the 7m 31s. The two errors point opposite
ways and there is no claim here about which is larger.

The word count also moves a little between runs, because level 2's portfolio is
dealt from the pool of 20 and the "Why?" card picks its template from the
result: 1,340 and 1,358 words on two runs of the same script.

**Launch item 7 is marked ESTIMATED, not done.** docs/PRD.md says so, with the
figure and the pending real-phone run. An estimate from a desktop browser
pretending to be a phone is evidence that 10 minutes is the right order of
magnitude; it is not somebody playing on a phone, which is what the item asks
for and what Maya will do.

1,189 tests pass.

Educational, not investment advice.
