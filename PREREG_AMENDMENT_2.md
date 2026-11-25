# One Trade — pre-registration amendment 2

**Amendment date:** 25 November 2026

**Status of the data at this date: no prices have been downloaded.** There is no
`data/` directory, no price file anywhere in the repository, and no price file has
ever been added in any commit in its history — the only file whose name contains
"data" is `scripts/fetch_data.py`, the downloader itself, which has never been run
against the live market. Anyone can check this with
`git log --all --diff-filter=A --name-only`. That is what makes this amendment
legitimate rather than a change made after seeing an answer.

**What is not changing:** [PREREG.md](PREREG.md) is not edited. It stays exactly as
it was committed at the `prereg` tag, and that tag stays where it is.
[PREREG_AMENDMENT.md](PREREG_AMENDMENT.md) is not edited either, and the freeze date
of 24 November 2026 it set stands. This file records every difference from those
two. Where they disagree, the later file wins.

**Reason for the amendment:** Hypothesis 1's registered threshold turns out to
measure mostly something other than what the hypothesis claims. This was found
while writing the tests for the sampler, before any price existed, and it is set
out in section 1. The registered test is kept and reported. A stricter test is
added beside it, because the registered one cannot answer the question on its own.

---

## 1. What was found, and how

Hypothesis 1 scores each portfolio by the ratio of effective risk sources to
holdings, and counts the claim supported if the beginner set's median ratio is
below 0.60.

Build the friendliest case diversification can have: 22 holdings that are exactly
uncorrelated and exactly equally volatile, so there is no hidden concentration of
any kind. Run the registered sampler, unchanged, on that. The result:

| Set | Median ratio | Share below 0.60 |
| --- | --- | --- |
| Beginner | 0.523 | 68% |
| Control | 0.512 | 67% |

Both are below 0.60, so the registered test returns **"supported" on data where
its claim is false by construction.**

The cause is arithmetic, not market structure. When holdings are independent,
each principal component's share of variance reduces to each weight squared
divided by the sum of the squared weights, so the ratio depends on **the weights
alone**. The flat Dirichlet distribution registered for the dollar weights is
uneven enough by itself to put the median near 0.52 across portfolios of 3 to 8
holdings. The same figure comes out of an independent numpy calculation: 0.5117
over 600,000 draws.

So the registered 0.60 threshold mostly measures how unevenly a flat Dirichlet
spreads money, and only secondarily whether the holdings share risk.

## 2. The registered test is kept, and reported with its baseline beside it

The registered verdict rule is **unchanged**: supported if the beginner set's
median ratio is below 0.60. It is computed and reported exactly as registered,
whichever way it comes out.

Four numbers are reported with it, so that it cannot be read as more than it is:

| Reported number | Why |
| --- | --- |
| The beginner set's median ratio | The registered statistic |
| **The independence benchmark, 0.523** | What the same sampler gives when the holdings are exactly uncorrelated and exactly equally volatile. The registered verdict is only meaningful to the extent the beginner median falls below this, not merely below 0.60 |
| The control set's median ratio | Registered in PREREG.md already; shows whether the measure separates a concentrated portfolio from a diversified one |
| The share of beginner portfolios below 0.60 | Registered in PREREG.md already |

If the beginner and control medians come out close to each other, the page says
that the measure has not separated the two sets, rather than claiming support.

## 3. The new primary test: the correlation-only ratio

**What it is.** For each of the 500 registered beginner portfolios, the ratio of
effective risk sources is computed twice:

- once with the real covariance matrix Σ, as registered; and
- once with **the same dollar weights and the same per-holding volatilities, but
  every correlation switched off** — that is, Σ with all its off-diagonal entries
  set to zero.

The statistic is the first divided by the second:

```math
R = \frac{\text{ENB}(w, \Sigma)}{\text{ENB}(w, \operatorname{diag}\Sigma)}
```

**What it means.** R = 1 says correlation cost this portfolio nothing: every risk
source it lost, it lost to uneven weights. R = 0.5 says correlation halved the
risk sources its weights would otherwise have allowed. Because the weights and
the volatilities are identical in the numerator and the denominator, **nothing
but the correlations differs between them.**

**Why this one.** Of the ways to separate correlation from weight unevenness, this
is the only one that holds both the weights and the volatilities fixed. It also
requires **no new random draws**: it is a second measurement of the 500 portfolios
already registered, under the seed already registered. The sampler, the sample
size, the 3-to-8 sizes, the flat Dirichlet weights and seed 2026 are all untouched
by this amendment.

**The statistic for the verdict:** the median of R across the 500 beginner
portfolios.

**Supported if the beginner median R is strictly below 0.60.**

Strictly: a median of exactly 0.60 is **not** supported. That matches how
PREREG.md reads its own thresholds — its 0.60 median rule and Hypothesis 2's 0.10
correlation rise are both strict — so no verdict anywhere in this project turns on
a value landing exactly on its cut-off.

> **Where 0.60 comes from:** the procedure declared in section 4, whose output is
> recorded there. It is not a chosen number.

That it lands on the same number as the registered v1 threshold in section 2 is a
coincidence of rounding and nothing more. The two measure different things: 0.60
there is a median ratio of effective risk sources to holdings, and 0.60 here is a
median of that ratio divided by what the same weights and volatilities would give
with correlations switched off.

**Also reported, not part of the verdict:** the full distribution of R for both
sets, the control set's median R, and the gap between the beginner and control
median R. The control's median R is the most direct answer to whether the measure
can tell the two pools apart, since it is free of the weight effect that spoils
the comparison in section 2.

**Not enough data:** unchanged at fewer than 252 overlapping trading days. If any
universe member has no variance at all over the window, R is undefined for
portfolios holding it, and the page reports "not enough data" rather than dropping
the portfolio.

## 4. How the threshold is fixed, declared before it is computed

The threshold must not be chosen after seeing real prices, so it is derived by the
procedure below from structures declared here. **No price is used at any point in
this section, and none exists in the repository to use.** The procedure runs on
the registered portfolios' weights and on covariance matrices built from the two
declared structures; it never opens a price file. The gate in section 7 still lies
ahead, so no price has been downloaded when this threshold is published.

**The two declared structures.** Both differ only in correlation, so that nothing
but correlation moves between them:

| Structure | Every pairwise correlation | Volatility | Stands for | Why this value |
| --- | --- | --- | --- | --- |
| Tight | 0.70 | The ladder below | A market where nearly everything moves together | What a concentrated, single-theme market looks like |
| Diversified | 0.30 | The same ladder | A genuinely diversified set of holdings | Typical correlation between stocks in different sectors; a lower value would make the test easier to pass |

**The volatility ladder, used by both structures.** Each portfolio's holdings are
given volatilities spread evenly from **0.8% to 2.0% a day** — so a 3-holding
portfolio gets 0.8%, 1.4% and 2.0%, and an 8-holding portfolio gets eight evenly
spaced values across the same range. The range covers what a quiet fund and a
volatile single stock actually do in a day. Both structures use the identical
ladder.

The ladder exists for a specific technical reason, and the reason is worth stating
because it changed this file. An earlier draft gave every holding the **same**
volatility. That makes all but one of the eigenvalues of these matrices exactly
equal, and effective bets has no single right answer when eigenvalues are tied —
the weakness already recorded in `BUILD_LOG.md` and in the comments of
`js/math.js`. The effect was not small: every one of the 500 portfolios changed
its R when only the volatility level changed, by as much as 0.57, and the
threshold this procedure produced came out at 0.55 or 0.54 depending on a number
that is meant to carry no information at all. numpy and the browser also
disagreed, because their eigensolvers resolve arbitrary eigenvectors differently.
A threshold nobody can reproduce is not a pre-registered threshold. Spreading the
volatilities separates the eigenvalues and removes the problem.

**The level of the ladder cannot affect the answer.** R divides one effective-bets
figure by another computed on the same volatilities, so multiplying every
volatility by any constant leaves R unchanged. Multiplying the whole ladder by 2.5
moves the median R by 0.0. Only the fact that the volatilities *differ* matters.

**The procedure.** Run the registered sampler at seed 2026 to get the 500 beginner
portfolios. Compute the median R under the tight structure and the median R under
the diversified structure. The threshold is the midpoint of those two medians —
their arithmetic mean — rounded to two decimal places.

Note on the direction of that choice: the diversified structure sets the easier
end of the scale, so raising it from a loose 0.15 to 0.30 lowers the midpoint and
makes the test **harder** to pass, not easier. That is the intended direction. A
diversified structure with very low correlation would flatter the hypothesis, by
putting the cut-off so high that ordinary cross-sector correlation would clear
it.

**The output, recorded.** Run with `node scripts/calibrate_threshold.mjs`:

| | Median R |
| --- | --- |
| Tight structure, correlation 0.70 | 0.503775 |
| Diversified structure, correlation 0.30 | 0.703964 |
| Midpoint | 0.603869 |
| **Threshold, rounded to two decimals** | **0.60** |

Three checks printed by the same command, each of which a reader can repeat:
the threshold sits between the two medians; the median R is unchanged when the
whole ladder is scaled by 2.5; and the median R is exactly 1.000000 when no
holding is correlated with any other, which is the property that makes R immune to
the weight effect described in section 1.

**What was fixed before this was run, and what was not.** The two correlations,
the rule, and the use of the registered 500 portfolios at seed 2026 were all
written down before any R was computed. The volatility ladder was added
afterwards, to repair the tied-eigenvalue fault described above, and it is the
only parameter here that was changed in response to a computation. It was changed
because the old structure produced an unreproducible number, not because of which
number it produced, and exactly one ladder was tried: 0.8% to 2.0%. A different
range would be equally defensible and could move the threshold, so anyone
repeating this work should use the range above rather than choosing their own.

**What the rule means.** A portfolio set is counted as showing hidden concentration
if its median R sits closer to a market where everything moves together than to a
diversified one. The threshold is therefore derived, not chosen: the only freedom
in it is the two correlations declared above, and they are declared before the
number is known.

**The reference nature of this calibration is stated on the page.** Real holdings
do not have one shared correlation or one shared volatility. The two structures
are reference points for setting a cut-off, not claims about what the market looks
like.

## 5. Which verdict is the headline

The page reports both, always, whichever way each comes out:

| Test | Role |
| --- | --- |
| The correlation-only ratio of section 3 | **The headline verdict for Hypothesis 1** |
| The registered 0.60 median ratio of section 2 | Reported beside it, as registered, with the 0.523 independence benchmark |

If the two disagree, the page says so in plain words and explains which measures
what. A disagreement is itself a result and is not resolved by choosing the more
favourable one.

## 6. The leave-one-out reruns cover the new test

PREREG.md requires both hypotheses to be rerun 13 times, dropping one basket name
each time, and the page to say so if any single drop flips a verdict. That applies
to the new primary test exactly as it applies to the registered one: 13 reruns at
seed 2026, and any drop that flips either verdict is named.

## 7. New rule for downloading prices

| | Was | Is now |
| --- | --- | --- |
| When prices may be downloaded | Once the `prereg-v2` tag is on GitHub | **Once the `prereg-v3` tag is on GitHub** |

`prereg-v3` marks the commit containing this amendment and the threshold fixed by
section 4. Moving the gate forward is the point: a stricter test added after data
arrived would be worth nothing, so this amendment, its declared structures and its
threshold are all timestamped publicly before any price exists.

## 8. What is limited about the new test, stated on the page

The correlation-only ratio answers "how much did correlation cost this portfolio?"
That is the right reading of PREREG.md's phrase *independent sources of risk*, but
it is narrower than the claim's own wording, which is about a beginner's whole mix.
A portfolio can score well on R and still be a poor mix — for example by holding
nearly all its money in one name, which R deliberately ignores, because holding the
weights fixed is exactly how it isolates correlation. The section 2 numbers are
what speak to weight concentration, and that is why both are reported.

## 9. Unchanged

Everything else in PREREG.md and PREREG_AMENDMENT.md stands, in particular: all
three hypotheses and their claims; the freeze date of 24 November 2026 and the
windows restated from it; Hypothesis 1's 500 beginner and 500 control portfolios,
3 to 8 holdings, flat Dirichlet weights and 0.60 median threshold; Hypothesis 2's
0.10 correlation rise, 90% interval, 20-day blocks, 2,000 resamples and RSP
benchmark; Hypothesis 3 in full; the leave-one-out reruns; the random seed 2026;
the 3 non-AI stocks JPM, JNJ and PG; the frozen 13-name basket in basket.json; the
universe in tickers.json; and the rule that every verdict is reported whichever way
it comes out.

Educational, not investment advice.
