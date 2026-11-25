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
