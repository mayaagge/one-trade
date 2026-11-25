# One Trade — pre-registration

**Registered:** 25 November 2026, before any price data was downloaded.

This file freezes the research questions, their thresholds and every tunable
value, so that results cannot be chosen after the fact. It is committed and
tagged `prereg`; GitHub's timestamp on that tag is the evidence that these
tests existed before any result did.

The text below is copied word for word from the research section of
`docs/PRD.md`. The PRD stays the source of truth; a test checks the two
remain identical. Nothing in this file may be edited after the tag. If a
test design has to change later, the change goes in a new, separately
labelled file and is reported alongside these original terms.

**Rules this registration binds:**

- No price is downloaded before 1 December 2026.
- Every verdict is reported, whichever way it comes out, including any that fail.
- The AI basket in `basket.json` is frozen and is never edited.
- Educational, not investment advice.

---

## The research questions, pre-registered

Three hypotheses are frozen in a tagged git commit (prereg) before any real data is seen. The Research mode computes "supported", "not supported" or "not enough data" automatically, and its headline is generated from the verdicts. Hypotheses 1 and 2 are about markets. Hypothesis 3 is about whether the game teaches anything. Every result is reported, whichever way it comes out.

### Hypothesis 1: hidden concentration

**Claim:** a beginner who combines a broad index fund, a tech fund and individual AI stocks has far fewer independent sources of risk than holdings.

**Test design:**

1. Universe: the 6 preset funds (VOO, QQQ, VTI, VXUS, BND, GLD), the 13 AI stocks and the 3 non-AI stocks (JPM, JNJ, PG).

2. Beginner set: 500 portfolios of 3 to 8 holdings. Each holds at least one broad fund (VOO or VTI) and at least one of QQQ or an AI stock. Dollar weights are drawn from a flat Dirichlet distribution.

3. Control set: 500 portfolios of 3 to 8 holdings drawn from VTI, VXUS, BND, GLD and the 3 non-AI stocks (JPM, JNJ, PG).

4. For each portfolio, compute the ratio of effective risk sources to holdings, using 3 years of daily returns ending on the freeze date (the last trading day on or before 30 November 2026).

5. The random seed is 2026, fixed and published in the repo.

**Supported if:** the beginner set's median ratio is below 0.60.

**Also reported, not part of the verdict:** the full distribution for both sets, the share of beginner portfolios below 0.60, and the control set's median. The control shows whether the measure can tell a concentrated portfolio from a diversified one.

### Hypothesis 2: a tightening market

**Claim:** AI stocks move more closely with the broad market now than they did before the AI trade.

**Test design:**

1. Window: 10 years of daily returns, December 2016 to November 2026.

2. AI basket: equal weight, limited to basket members with the full 10 years of history. A second version that adds names as they list is reported beside it.

3. Benchmark for the verdict: the equal-weight S&P 500 (RSP). In it each AI stock is about 0.2% of the index, so the correlation is not mostly arithmetic. The S&P 500 itself is reported beside it.

4. Compare correlation in the earliest 12 months (Dec 2016 to Nov 2017) with the most recent 12 months (Dec 2025 to Nov 2026).

5. Uncertainty: a 90% interval for the difference, using a block bootstrap with 20-day blocks and 2,000 resamples.

**Supported if:** the recent correlation is more than 0.10 higher than the earliest correlation, and the lower end of the 90% interval is above 0.

**Also reported:** the rolling 126-day correlation over the full 10 years, with 30 November 2022 (ChatGPT's release) marked as a reference date only.

### Hypothesis 3: players learn

**Claim:** after a few levels, players estimate a portfolio's number of bets more accurately.

**Test design:**

1. Level 2's portfolio and the first of level 7's mystery portfolios are both drawn at random from one pool of 20, so on average they are equally hard.

2. For each player who reaches level 7, the error is the gap between their guess and the actual number of bets, on level 2 and again on level 7.

3. Each guess sends one anonymous record: a random per-browser ID, level, guess, actual value and date. No tickers, amounts or personal data.

4. Data collection closes 60 days after launch.

**Supported if:** at least 60 players reach level 7, their median level-7 error is at most 70% of their median level-2 error, and a one-sided sign test on each player's improvement gives p below 0.05.

**Not enough data:** if fewer than 60 players reach level 7, the page says so and shows what was collected.

**Limit, stated on the page:** there is no control group. Players who reach level 7 may already be the stronger ones, so this shows improvement during the game, not proof that learning lasts or transfers.

### The AI basket

The 13 names from v1 are frozen in basket.json, each with a one-line reason it counts as AI-driven. Both hypotheses are rerun 13 times, dropping one name each time. If any single drop flips a verdict, the page says so.

### Values fixed at registration

Every choice that could be tuned after seeing results is fixed here, before any price is downloaded. PREREG.md carries this same section, and the prereg tag timestamps it.

| Value | Fixed as | Where it is used |
| --- | --- | --- |
| The 3 non-AI stocks | JPM (banks), JNJ (health care), PG (consumer staples) | Hypothesis 1's universe and control set |
| Random seed | 2026 | Hypothesis 1's portfolio sampler and Hypothesis 2's block bootstrap |
| Freeze date | The last trading day on or before 30 November 2026 | The last day of every return window in Hypotheses 1 and 2 |
| Earliest download date | 1 December 2026 | No price is fetched before this date, so the freeze date's window is complete when the data arrives |
| AI basket | The 13 names in basket.json | Both hypotheses, including the leave-one-out reruns |
| Full universe | The 9 groups in tickers.json | The ticker list the game and both hypotheses draw from |

One non-AI stock was chosen per non-technology group so the control set spreads across banks, health care and consumer staples rather than sitting inside one industry.
