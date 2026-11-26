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
