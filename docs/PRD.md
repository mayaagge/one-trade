# One Trade — Product Requirements

Nov 24, 2026

## What this is

One Trade is a free browser game that teaches university students how risk works in a portfolio. It uses live market prices and pretend money. Each round, a player builds a portfolio, guesses how many separate bets it really makes, and then sees the answer worked out from real price history.

It teaches one idea well: **different tickers can be the same bet.** An S&P 500 fund, a tech fund and NVIDIA can rise and fall together, so a player holding all three made something closer to one trade. That is the name.

**One-sentence pitch:** Build a portfolio with $10,000 of pretend money, guess how many bets you made, and find out from live market data.

**Status, 27 November 2026:** milestones 1, 2 and 3 are built, the site is live on GitHub Pages and the Cloudflare Worker is deployed. The three hypotheses were registered and tagged (`prereg`, `prereg-v2`, `prereg-v3`) before any price was downloaded; the tag timestamps precede the first price commit. Hypotheses 1 and 2 have verdicts from the committed snapshot, and Hypothesis 3 reads "collecting" — it now has somewhere to collect from, and no player data yet.

**The `launch` tag exists: 27 November 2026, 22:20 UTC, annotated and pushed.** Hypothesis 3's collection window starts there, which is the rule its test design registers. Everything recorded before it — 26 count pings and 8 guess records, every one of them the author's own testing — is outside the window by construction rather than by a later decision about which rows were real.

Built: the math engine with numpy known-answer tests, the page, Research mode, levels 1 to 7 with their "Why?" cards, Crash replay over the three registered windows, the daily "Same bet?" puzzle, the weekly challenge, the share card, progress saved in the browser, Sandbox, My real portfolio, the About tab, and the Worker's two routes — `/ping` and `/guess`, both anonymous, both writing to Workers Analytics Engine. Guess records leave the browser on levels 2 and 7 and reach `GUESSES`; `?src=playtest` rows are routed to `GUESSES_PLAYTEST` instead and enter no verdict.

Not built: the classroom link, the completion code and its verify page, and the one-page lesson plan, all deferred from milestone 3 on 26 November and still deferred, plus the two launch-secondary modes below. The three-question feedback form was deferred again on 27 November, this time as a decision rather than a wait: see milestone 3 step 4. There is no `/code` route and no secret in the Worker.

**Core game loop** (one round takes 1 to 2 minutes):

```
Build ($10,000 pretend money) → Guess the number of bets → Reveal (from real prices) → "Why?" card → Stars
```

The guess is the most important step: committing to a prediction, then seeing the real answer, is where the lesson lands.

## The market: what already exists

The space is crowded with stock games and finance-literacy apps, but almost none of them teach correlation or concentration risk to university students in a few minutes. The closest in spirit is NGPF's STAX, and it is aimed at high school students and long-term saving, not at diversification.

| Product | Who it's for | What it teaches | What it rewards | How One Trade differs |
| --- | --- | --- | --- | --- |
| [NGPF STAX](https://www.etf.com/sections/index-investor-corner/new-online-game-teaches-investing) | High school, free | Long-term investing; 20 years of choices in about 20 minutes across savings, stocks, index funds, bonds and gold | Long-run wealth | Closest rival. One Trade is for university students and goes deeper on one idea: hidden overlap between holdings |
| [Stock-Trak](https://www.stocktrak.com/stocktrak-product/), [HowTheMarketWorks](https://howthemarketworks.com/), [SIFMA Stock Market Game](https://en.wikipedia.org/wiki/Stock_market_simulator) | High school and college classes | Trading with live prices over a term | Portfolio performance and rankings | Rounds take minutes, not a term; returns score nothing |
| [Zogo](https://www.fool.com:443/the-ascent/personal-finance/zogo-review/) | Gen Z, through banks and credit unions | Bite-sized personal finance lessons, with rewards | Completing lessons | One Trade uses real market data and has the player build things, not answer quizzes |
| [Bloomberg Market Concepts](https://qmplus.qmul.ac.uk/mod/page/view.php?id=3871442) | University finance students | Markets and the Bloomberg Terminal; 10 to 15 hours | A certificate | One Trade is short and free, and needs no terminal or sign-up |
| [Wharton WRDS Mechanics of Diversification](https://wrds-www.wharton.upenn.edu/pages/grid-items/mechanics-diversification/) | Students at subscribing universities | Variance-covariance, two-asset sets, limits of diversification | Nothing; an interactive tool | Same topic, but behind an institutional login and built for the classroom, not for play |
| [St. Louis Fed](https://www.stlouisfed.org/education/diversification-and-risk), Economics Network classroom activities | Teachers | Diversification through paper exercises and slides | Nothing | One Trade is the live, digital version of the same activity |
| [PortfolioPilot](https://portfoliopilot.com/portfolio-management/look-through-analysis), [Koyfin](https://www.koyfin.com/blog/check-etf-overlap-portfolio/) | People who already invest | What their real funds hold in common | Nothing; analysis tools | One Trade needs no real portfolio |

**Where One Trade fits:** stock games ask "can you pick winners?" One Trade asks "do you know what you're actually betting on?" It is the only free option that combines live prices, a university audience, no sign-up, and a lesson about risk instead of returns.

**What to learn from the others:**

- **STAX:** a short, replayable game spreads through teachers. It reached over 120,000 plays within months of launch.

- **Stock-Trak and HowTheMarketWorks:** professors adopt tools that come with a ready assignment. Ship a lesson plan, not just a link.

- **Zogo:** it reached students through partners who already had them (banks and credit unions). One Trade's equivalents are clubs, professors and campus financial wellness offices.

- **Bloomberg Market Concepts:** students value something that looks good on a resume. A shareable completion badge could do the same job.

## Who it is for

**Primary: university students**, mostly 18 to 22, most with no investments yet. Many are in intro economics, finance or business courses; others are just curious. They want to understand what diversification means before investing their first dollar, in a few minutes, without signing up.

**Secondary: instructors and club leaders.** They need a 10 to 20 minute activity with no setup, no student accounts and no student data collected.

**Third: beginning investors with real accounts**, who can check their actual holdings in a separate mode.

## Learning goals and levels

After finishing the 7 levels, a player should be able to do six things without help:

1. Tell whether two holdings tend to move together.

2. Estimate, within 1, how many separate bets a portfolio makes.

3. Explain why an S&P 500 fund is more concentrated than its 500 names suggest.

4. Spread risk across groups that really behave differently.

5. Explain why a holding's share of risk can be much bigger than its share of money.

6. Describe how a portfolio behaved in a real crash, and why.

| Level | Concept | Challenge | Pass condition |
| --- | --- | --- | --- |
| 1. Two of a kind | Correlation | Pick two holdings with different names that move together | Correlation of 0.70 or more |
| 2. How many bets? | Effective bets | Guess the bets in a starter portfolio drawn at random from a pool of 20, then see the answer | Make a guess; scored on accuracy |
| 3. Three real bets | Diversifying across groups | Build a 5-holding portfolio | At least 3 effective bets |
| 4. Hidden AI | Index concentration | Build a 4-holding portfolio and keep at least 30% in QQQ | Beta to the AI basket under 0.5 |
| 5. Where's the risk? | Risk share vs dollar share | Build any 4-holding portfolio | No holding carries more than 35% of the risk |
| 6. Crash test | Behavior under stress | Build a 4-holding portfolio with at least 60% in stocks and replay the February to March 2020 crash | Fell less than half as much as the S&P 500 |
| 7. One trade | Everything | Guess the bets in 3 mystery portfolios | All 3 guesses within 1 |

Level 1's bar was 0.8 until 27 November 2026; the second amendment below says why it is 0.70. Thresholds are checked against real data before launch, so each level has at least 3 different winning designs. A weekly automated test checks that every level can still be passed as prices change.

**Scoring:** each level gives 1 star for passing, 2 if the guess was within 1, and 3 if within 0.5. Returns never earn points, and there is no leaderboard.

**Scoring on a level whose answer is a correlation.** Level 1's answer is a correlation between −1 and 1, so bands of 1 and 0.5 would give 2 stars to every guess. Level 1 therefore scores: 1 star for passing (a correlation of 0.70 or more), 2 for a guess within 0.20 of the actual correlation, and 3 for a guess within 0.10 of it. The three "Same bet?" buckets (0.7 and above is the same bet; 0.3 to 0.7 is partly; below 0.3 is different bets) are the ones the daily puzzle already uses, and are still named on every reveal — since 27 November 2026 they no longer decide a star, because the pass bar is now one of their edges. **Both numbers here were amended on 27 November 2026, from a bar of 0.8 and a second star for naming the right bucket; the second amendment note below says why.**

**Scoring on a level whose answer is not a bets count.** The bands of 1 and 0.5 are bands on a number of bets, and they say something only on a level whose answer is one. Level 1 answers with a correlation between −1 and 1, level 4 with a beta and level 5 with a share of risk; on all three, bands of 1 and 0.5 would hand 2 and 3 stars to nearly every guess. Such a level scores on its own scale instead: 1 star for passing, 2 for a guess within twice its three-star distance, and 3 for a guess within that distance. Every distance in the table below is either a number the game already uses elsewhere or the level's own pass threshold, and every three-star distance is exactly as it was registered.

| Level | The answer it asks for | 2 stars: the right bucket, or a distance | 3 stars: within | The three buckets, named on every reveal |
| --- | --- | --- | --- | --- |
| 1. Two of a kind | A correlation, −1 to 1 | 0.20 of the real correlation, twice the band beside it | 0.10 of the real correlation | 0.7 and above is the same bet; 0.3 to 0.7 is partly; below 0.3 is different bets — the buckets the daily "Same bet?" puzzle already uses, and 0.7 is now also the level's pass bar |
| 4. Hidden AI | Beta to the AI basket, 0 to 1.5 | 0.20 of the real beta, twice the band beside it | 0.10 of the real beta, the band level 1 already uses | under 0.50 is barely an AI bet; 0.50 to 1.00 is partly one; 1.00 and above is an AI bet — the level's own pass threshold, and the basket moving one for one |
| 5. Where's the risk? | The biggest holding's share of risk, 25% to 100%, since four shares adding to 100% put the biggest at 25% or more | 10 points of the real share, twice the band beside it | 5 points of the real share | 35% and under is spread; 35% to 50% is one holding leaning heavy; above 50% is one holding carrying the portfolio — the level's own pass threshold, and a half |

Levels 2 and 3 answer with a number of bets and keep the bands of 1 and 0.5 above. Level 6 answers with a ratio of losses rather than a bets count, so it falls under this rule too, and its bands are fixed when it is built: 2 stars within 0.20 of the real ratio and 3 stars within 0.10 of it, with the three buckets it still names on the reveal being below 0.50 held up, 0.50 to 1.00 fell with the index, and 1.00 and above fell harder than it.

**Amendment, 27 November 2026: on levels 4, 5 and 6 the second star is a distance, not a bucket.** Taken on playtest feedback (BUILD_LOG.md, player feedback 4). This is the first star band in the game to move after results existed, so what was registered is kept in full view and the reasoning is written out rather than summarised.

**What was registered, and is no longer in force on levels 4, 5 and 6:** "2 for naming the right one of three buckets", under the rule that "every bucket edge and every distance in the table below is either a number the game already uses elsewhere or the level's own pass threshold, and each is fixed before the level is built, never tuned once results are in". Those two-star rules are replaced by a distance: 0.20 of the real beta on level 4, 10 points of the real share on level 5, 0.20 of the real ratio on level 6.

**What did not change, on any level:** every pass threshold, every bucket edge (0.7/0.3, 1.00/0.50, 50%/35%, 1.00/0.50), and every three-star distance. **The buckets still exist and are still named on every reveal** — "That is the same bet. You said partly the same bet." — and the daily puzzle's own buckets were never involved. What moved on three levels is only whether naming the right bucket earns the second star. (Level 1's two-star rule was left alone by *this* amendment and moved by the next one, below, when its pass bar changed.)

**Why it moved.** Stars are only awarded to a portfolio that passed, and on these levels the pass threshold *is* a bucket edge. So a passing answer always lands in the same bucket — the bottom one, 100% of passing designs on the sample `scripts/check_levels.mjs` already draws (seed 11, 1,200 draws a level) — and "naming the right bucket" was never the three-way judgement it was written to be. It was asking "did you guess on the passing side of the threshold".

That made it **asymmetric, in the direction a beginner errs.** A passing answer sits just inside the edge, so an error upwards crosses it and the same error downwards does not. On level 5, whose passing answers have a median of 0.3302 against an edge at 0.35, a guess 6 points high scored 1 star and a guess 6 points low scored 2 — the same error, punished differently, and the high guess is the one a beginner makes, since beginners overestimate how concentrated risk is. **85% of level 5's passing answers sit within the three-star band of an edge**, which is why the complaint came from that level and not another.

**Why twice the three-star band, and not some other number.** It is the ratio levels 2 and 3 have used since they were built: "within 1 bet" for two stars is twice "within half a bet" for three. No new distance is introduced — each level takes double its own registered three-star band — so the two-star band is derived from a number fixed before any result existed.

**Why level 1 was examined and left alone — and then moved anyway, hours later.** *At the bar of 0.80 that level 1 still had when this amendment was written*, it had the same shape of rule and none of the defect: no passing pair sat within the three-star band of a bucket edge (0 of 8; the nearest edge a median 0.2483 away, two and a half times the band), so its bucket test had room either side and was a real judgement rather than a coin flip. Moving it would have changed 5 of the 201 guesses its slider offers, **every one of them downwards** — a player who answers 0.72 about a pair correlating 0.95 has named the right bucket, which is the whole lesson of level 1 — and a change made because scoring was too harsh should not make a level harsher.

The second amendment below then moved level 1's **pass bar** to 0.70, which *is* the edge, and the room disappeared: 8 of its 16 passing pairs now sit within the band of an edge, against 0 of 8 before. So its two-star band moved after all. It is recorded this way round, rather than rewritten, because the reason matters: the band did not move on its own merits. It followed the bar.

**It is gentler in some places and stricter in others, and both are reported.** Against each level's median passing answer, swept over every guess its slider can produce: level 5 gains a star on 5 guesses and loses one on none; level 4 gains on 1 and loses on 3; level 6 gains on 2 and loses on 5; level 1, once its bar moved too, gains on 6 and loses on none. The losses are all far-off guesses on the passing side — errors of 0.23 to 0.43 where the three-star band is 0.10 — which the old rule handed two stars purely for naming the bucket. Rewarding a guess three to four times the band out, as generously as one just outside it, was the other half of the same defect.

**What this does not touch.** No hypothesis. Stars appear in none of them: a guess record carries the level, the guess and the actual value, and no star (PREREG.md's five fields). `node scripts/calibrate_bands.mjs` reproduces every number in this note, including the before column, which it computes from the registered rule rather than from the current file.

**Second amendment, 27 November 2026: level 1's pass bar is 0.70, and its second star is a distance.** Also from playtest feedback (BUILD_LOG.md, player feedback 5), taken after the amendment above and partly because of it.

**What was registered:** "Correlation of 0.8 or more", and 2 stars "for naming the right 'Same bet?' bucket". Both are replaced: the bar is **0.70** and the second star is **within 0.20 of the real correlation**, twice the three-star band, which is the same rule levels 4, 5 and 6 took above.

**Why the bar moved.** The rule for choosing it was stated before the numbers were looked at, and it is the rule this document already applies to every value it fixes — a number the game already uses elsewhere. Level 1's challenge line asks a player to "pick two holdings with different names that move together", and the game defines *moving together* in exactly one place: **0.70 and above is the same bet**, in the daily "Same bet?" puzzle and in level 1's own three buckets. 0.8 was not a number the game used anywhere else, and it asked for something stricter than the game's own definition of the thing the level teaches without naming what that stricter thing was.

**Checked, not assumed, over every pair the game can offer** — all 780 from the 40 playable tickers, on the live window, none set aside (`node scripts/check_pass_bar.mjs`): 30 pairs clear 0.70, 18 clear 0.75, 12 clear 0.80, out of 780. So the new bar is still a search and not a giveaway — 3.8% of everything on offer — and within level 1's own pool of 14 it takes the passing pairs from 8 of 91 to 16 of 91. The shares were a check on the rule and did not choose it: had 0.70 turned out to be cleared by most pairs, the answer would have been to say so and leave the bar at 0.8.

**Why the second star had to move with it.** 0.70 *is* a bucket edge, so the moment the bar sits there, every passing pair lands in the "same bet" bucket and the second star stops being a judgement — exactly the defect the first amendment above describes, arriving at level 1 by a different route. The note above says level 1 was examined and left alone "BECAUSE its bar of 0.80 sits above its top edge of 0.70". Moving the bar retires that reason, so the band moves too, in the same change rather than being discovered later.

**What it does to the stars, measured the same way as the first amendment.** Holding the new bar fixed and varying only the star rule, against level 1's median passing answer of 0.8304, swept over all 201 guesses its slider offers: **6 gain a star and none lose one.** Level 1 is the only one of the four where the change is purely gentler in both directions, because its two-star distance of 0.20 reaches further than its bucket did from a typical answer.

**One consequence worth recording: the four-decimal rule is now inert on this level.** "A displayed number never disagrees with the pass check" shows a result to 4 decimals when it falls within 0.005 of its threshold. At a bar of 0.80 that fired on a real pair — VTI and VXUS at 0.7997. At 0.70 no pair in the pool comes near it: the closest miss is VOO with NVDA at 0.6800, two points under, shown at the level's usual three decimals. The rule is unchanged and still right; it simply has nothing to fire on today, and tests/levels.test.js and tests/format.test.js exercise it directly against `formatMeasure` rather than through a pair that no longer exists.

**What this does not touch.** The buckets and their edges, which the daily puzzle shares; the three-star band of 0.10; the three-decimal reveal, which exists because 0.9962 would otherwise read as "1.00" and has nothing to do with the bar; and no hypothesis.

**Level 7 scores on three guesses, not one.** It answers with a number of bets, but it asks for three of them and its pass rule is already "all 3 guesses within 1" - so a 2-star band of "within 1" would be the pass condition a second time, and every player who passed would be handed 2 stars for nothing. Its bands are counts instead, over the same 0.5 the other bets levels use for 3 stars: 1 star for the pass rule, 2 stars for two of the three guesses within 0.5, and 3 stars for all three within 0.5. The distance is not a new number and the rule is the level's own.

**A displayed number never disagrees with the pass check.** The pass check compares the unrounded measure against the threshold. A result within 0.005 of its threshold, where a rounded display could read as the other side of it, is shown to 4 decimals instead: a correlation of 0.6996 against level 1's bar of 0.70 is shown as 0.6996 and fails, never as "0.70" and fails. The worked example used to be 0.7996 against a bar of 0.8, which was a real pair in level 1's pool — VTI and VXUS — until the bar moved on 27 November 2026 and that pair started passing. The rule is unchanged and no pair in the pool sits inside 0.005 of the new bar today; the nearest miss is 0.6796.

**And two results the screen cannot tell apart get the same verdict.** A measure within 1e-9 of its threshold counts as equal to it, which is the same slack the star bands already give a guess, and for the same reason: binary floating point should not decide a level. So the slack passes an inclusive comparison and fails a strict one — a portfolio that fell exactly half as much as the index did not fall *less* than half as much.

Level 6 is why this is written down. A portfolio that fell 20% while the index fell 40% and one that fell 25% while the index fell 50% both fell half as much, but the first works out to 0.4999999999999999 rather than 0.5, because 8000/10000 − 1 is not exactly −0.2 in binary. Both are shown as "0.5000" under the rule above, and without this one they would have been given different verdicts off the same number on screen. No measure in this game sits within a billionth of a threshold for any reason but arithmetic: across every design the level checks sample, the closest any portfolio comes to its own threshold is 6.2e-5.

**Level 1's reveal draws the pair.** Added 27 November 2026 on playtest feedback (BUILD_LOG.md, player feedback 6). A correlation is the one answer in this game that does not look like anything — 0.996 and 0.228 are both just numbers — so the reveal shows the two holdings as two lines, each starting at 100 on the window's first day. A same-bet pair leaves that point together and stays there; an unrelated pair wanders apart, and that picture is the lesson the number is standing in for. **Indexed, never priced:** both lines start at the same place, so the chart reads as "up 40%" rather than inviting a player to compare two share prices, which is not what a correlation is about. The same chart component Crash replay and Research use, and the same compounding a replay does.

**No level offers a hint.** Changed 27 November 2026 on playtest feedback (BUILD_LOG.md, player feedback 7). A level used to show a hint after three failed tries. They are gone, and their ideas moved to the two places a player reads after trying or by choice: that level's "Why?" card, which appears after the reveal, and the About tab's "What each level teaches". A hint arrives while a player is still guessing, which is the moment the game is supposed to leave alone; the same sentence after the reveal is a correction rather than a nudge. This was only safe once a level unlocked by being played rather than passed — before that the hint was the only thing between a stuck player and a dead end.

**Plain words, on every level, in the same place.** Each level shows one line above its question saying what that question is about: correlation on level 1, a bet on levels 2, 3 and 7, beta on level 4, share of risk on level 5, and the fall against the index on level 6. **The three bets levels carry the identical sentence, word for word.** Repeating it is the point rather than a slip: level 2 and the first of level 7's mystery portfolios are the pair Hypothesis 3 compares, and the two screens have to ask the same thing the same way. A first draft defined each term only where it first appeared, which gave level 2 a sentence level 7 did not have — a difference in the instrument between two guesses that are supposed to be equally hard. tests/levels.test.js holds every level to having exactly one definition, and tests/series.test.js renders both screens and holds them to being identical.

The fuller version of every term is in the About tab, which is where depth goes so that a level can say one thing in one sentence.

**The guess comes first.** Every level asks the player to predict the answer before the reveal. Predicting and then being corrected is the main learning moment.

## Game modes

| Mode | What the player does | When |
| --- | --- | --- |
| **Learn** | Levels 1 to 7 in order, each unlocked by *playing* the one before it — finishing a level is enough, passed or not, and level 1 is always open. Progress saved in the browser | Launch |
| **Sandbox** | Build any portfolio from the full ticker list and see every measure | Launch |
| **Crash replay** | Watch a pretend portfolio through the 2020 crash, the 2022 bear market or the January 2025 AI selloff, next to the S&P 500. The three windows are fixed below | Launch |
| **Research** | Read the three pre-registered hypotheses and their verdicts, and see the rolling correlation chart continue past the freeze date on live data | Launch |
| **About** | What the game is and what every word in it means, in plain language: a bet, correlation, effective bets, share of risk, beta, how to build the intuition, and what each level teaches. Nothing in it is needed to play | Added 27 November 2026 |
| **Classroom link** | An instructor picks levels and shares one link; a one-page lesson plan goes with it | Launch |
| **Feedback** | Three-question form after level 3 | **Deferred, 27 November 2026.** Not built and not being built for now; see milestone 3 step 4. Feedback comes from playtests and direct conversations instead |
| **My real portfolio** | Enter real holdings in dollars; nothing is stored or sent | Launch, secondary |
| **Explore the market** | Correlation heatmaps for calm, all and worst-10% days | Later, optional |
| **See inside funds** | Named holdings inside each fund, from SEC filings | Later, optional |

**Crash replay: the three windows, and what the lines are.** Every value a replay
turns on is fixed here, because a window chosen after seeing a result is a window
chosen to flatter it.

| Window | From | To | Trading days | The S&P 500's fall |
| --- | --- | --- | --- | --- |
| The 2020 crash | 19 February 2020 | 23 March 2020 | 24 | −33.99% |
| The 2022 bear market | 3 January 2022 | 12 October 2022 | 196 | −24.52% |
| The January 2025 AI selloff | 24 January 2025 | 28 February 2025 | 25 | −2.27% |

The AI selloff's dates are set here for the first time: it starts on the Friday
before the selloff, so Nvidia's fall of about 17% on 27 January is the first move
the line draws, and runs a month past it, which shows whether the fall was taken
back. It was not.

- **A replay starts at a close, not at a return.** The research windows in the
  hypotheses below are windows of *returns*; a replay is a line that starts at the
  first date's closing price and applies the returns after it. Counting the first
  day's own move as well would make the 2020 crash read −33.6% against the −33.9%
  that is the published peak-to-trough figure.

- **A portfolio is bought and held, never rebalanced.** Each holding's dollars
  grow on their own and the portfolio is their sum, because that is what holding a
  portfolio through a crash does. Rebalancing daily to the starting weights is a
  different thing and a different answer: in the 2022 window it turns a spread
  portfolio's +2.03% into −0.24%.

- **The S&P 500 line is VOO's adjusted closes, labelled "S&P 500 (VOO, with
  dividends)".** Both lines then include dividends, so the comparison is like for
  like. Against the index itself this moves the fall by −0.07 points in 2020,
  +0.90 in the 2022 window and +0.14 in the AI selloff; the 2022 window is the
  only one long enough to span several distributions.

- **A holding with no prices in a window is not offered in it.** PLTR listed in
  September 2020, so it cannot be held through the 2020 crash, and the screen says
  so rather than drawing a flat line.

**Research mode and live data.** The verdicts, and every number behind them, come from the committed price snapshot and never move: the registered windows all end on the freeze date, 24 November 2026. One chart is the exception, and only in what it draws. The rolling 126-day correlation of the AI basket with the equal-weight S&P 500 — already reported-only, entering no verdict — continues past the freeze date on live prices. Everything after 24 November 2026 is shaded and labelled **"after the freeze date; enters no verdict"**, so a reader can see whether the measured rise held up without that view ever reaching the registered test. The frozen part of the line is read from the published results file, and the live part is computed from the same basket, benchmark and 126-day window, so the two halves are the same measure.

## Feature roadmap

Each feature borrows the strongest idea from a competitor, without giving up what sets One Trade apart: short, free, no sign-up, and rewards for understanding risk, never for returns. There are three tiers, and the next tier starts only when the previous one is live.

### Tier 1: at launch

These four address the two hardest problems, getting players to come back and getting instructors to adopt it, for little build time.

| Feature | Borrowed from | How it works | Why it matters |
| --- | --- | --- | --- |
| **Daily "Same bet?" puzzle** | Zogo's bite-sized daily habit | Five ticker pairs a day, the same for every player, picked from the date. For each pair, the player answers "same bet", "partly" or "different bets", scored on last year's correlation (0.7 and above; 0.3 to 0.7; below 0.3). A share button posts a spoiler-free grid of colored squares. | Gives a reason to return daily and a built-in way to share; this is the main growth loop |
| **Completion code** | Stock-Trak and HowTheMarketWorks assignments | When a student finishes the levels on a classroom link, the Worker signs a short code with a secret key. The student pastes it into their course site, and the instructor checks it on a verify page. | Makes One Trade gradable without student accounts. It proves the levels were finished, not who finished them, which is fine for low-stakes credit. |
| **"Why?" cards** | Wharton WRDS's depth, made friendly | After each reveal, rule-based templates name the specific cause, such as the most correlated pair, the biggest gap between dollar share and risk share, one group holding most of the risk, a bond fund that takes less of the risk than of the money, or holdings that really are several separate bets. | Turns a number into understanding; template text cannot invent wrong answers |
| **AI selloff replay** | STAX's sense of history | Adds the January 2025 AI selloff, when Nvidia fell about 17% in one day, to Crash replay | Shows the AI concentration lesson in a real event, not a model |

### Tier 2: after launch, once targets are in sight

| Feature | Borrowed from | How it works | Why it matters |
| --- | --- | --- | --- |
| **Live class view** | Classroom contests, without the ranking | The instructor's screen shows an anonymous histogram of the class's guesses and actual bets, updated live. Data is kept for 24 hours per class code, then deleted. | Makes a 15-minute session feel live and starts the discussion |
| **Time machine** | STAX's "20 years in 20 minutes" | Hold one portfolio from 2016 to 2026 and watch its effective bets shrink as AI stocks grew, year by year | Turns Hypothesis 2 into something players see; no competitor does this |
| **Under the hood** | Wharton WRDS | A toggle that shows the covariance matrix, principal components and the effective-bets formula for the player's own portfolio | One game serves both curious beginners and finance majors |
| **Quick quiz before and after** | Learning research | Three misconception questions before level 1 and again after level 7, sent anonymously with the guess records | Measures learning better than guess error alone; strengthens Hypothesis 3 |
| **Completion badge** | Bloomberg Market Concepts certificates | A public page, such as "Completed One Trade: 7 levels, 18 stars", that can be linked on LinkedIn | Gives students a reason to finish. Worded as completion of a free game, never as an accredited certification |

### Not building

| Idea | Why not |
| --- | --- |
| Return leaderboards and trading contests | The crowded part of the market, and it teaches stock picking |
| Accounts, social feeds or a native app | Add privacy duties and build time; remove the no-sign-up advantage |
| An AI chat tutor | Can state wrong answers about money and adds running costs; "Why?" cards cover most of the value |
| Bank or credit-union partnerships | Zogo's model; worth revisiting only with real traction |

## The research questions, pre-registered

Amended twice on 25 November 2026, before any price was downloaded. PREREG_AMENDMENT.md moved the freeze date to 24 November 2026, moved Hypothesis 2's windows with it, and changed the "no prices before 1 December" rule to "no prices before the prereg-v2 tag is on GitHub". PREREG_AMENDMENT_2.md then added a stricter headline test to Hypothesis 1 (below) and moved the download gate again, to the prereg-v3 tag. PREREG.md keeps the original wording and is not edited; this section carries the amended dates and rules.

Three hypotheses are frozen in a tagged git commit (prereg) before any real data is seen. The Research mode computes "supported", "not supported" or "not enough data" automatically, and its headline is generated from the verdicts. Hypotheses 1 and 2 are about markets. Hypothesis 3 is about whether the game teaches anything. Every result is reported, whichever way it comes out.

### Hypothesis 1: hidden concentration

**Claim:** a beginner who combines a broad index fund, a tech fund and individual AI stocks has far fewer independent sources of risk than holdings.

Amended on 25 November 2026 by PREREG_AMENDMENT_2.md, before any price was downloaded: the registered 0.60 median-ratio test turns out to mostly measure how unevenly the flat Dirichlet draw spreads money, not correlation (see "What the 0.60 threshold actually measures" in BUILD_LOG.md). The registered test is kept, unchanged, and reported; a stricter test is added beside it and becomes the headline.

**Test design:**

1. Universe: the 6 preset funds (VOO, QQQ, VTI, VXUS, BND, GLD), the 13 AI stocks and the 3 non-AI stocks (JPM, JNJ, PG).

2. Beginner set: 500 portfolios of 3 to 8 holdings. Each holds at least one broad fund (VOO or VTI) and at least one of QQQ or an AI stock. Dollar weights are drawn from a flat Dirichlet distribution.

3. Control set: 500 portfolios of 3 to 8 holdings drawn from VTI, VXUS, BND, GLD and the 3 non-AI stocks (JPM, JNJ, PG).

4. For each portfolio, the covariance matrix uses 3 years of daily returns ending on the freeze date (24 November 2026).

5. The random seed is 2026, fixed and published in the repo, and draws the same 500 beginner and 500 control portfolios for both tests below.

**The headline test, added by amendment 2: the correlation-only ratio.** For each portfolio, R is the ratio of effective risk sources computed from the real covariance matrix to effective risk sources computed from the same weights and the same per-holding volatilities with every correlation switched off to zero. Holding the weights and volatilities fixed means only the correlations differ between the two, so R measures correlation's effect alone.

**Supported if:** the beginner set's median R is strictly below 0.60. This threshold is derived, not chosen: it is the midpoint of the median R under two declared synthetic structures (pairwise correlation 0.70 and 0.30, both with a 0.8%-to-2.0% daily volatility ladder), computed before any real price existed. See PREREG_AMENDMENT_2.md section 4.

**The registered test, kept and reported beside the headline:** the original rule is unchanged — supported if the beginner set's median ratio of effective risk sources to holdings is below 0.60 — computed and reported exactly as registered, whichever way it comes out.

**Also reported, not part of either verdict:**

- The full distribution of R and of the registered ratio, for both sets, and the share of beginner portfolios below each threshold.
- The control set's median for each test, showing whether the measure separates a concentrated portfolio from a diversified one.
- **The independence benchmark, 0.523:** what the registered sampler gives when holdings are exactly uncorrelated and exactly equally volatile — no hidden concentration at all. The registered verdict is only meaningful to the extent the beginner median falls below this, not merely below 0.60.
- **The separation margin, 0.10, reporting-only:** the beginner median must sit at least 0.10 below the control median before the page says the measure told the two sets apart. It decides a sentence, never a verdict.

If the headline and registered verdicts disagree, the page says so in plain words and explains which measures what; a disagreement is itself a result and is not resolved by choosing the more favourable reading.

### Hypothesis 2: a tightening market

**Claim:** AI stocks move more closely with the broad market now than they did before the AI trade.

**Test design:**

1. Window: 10 years of daily returns, 24 November 2016 to 24 November 2026, the 10 years ending on the freeze date. Markets were closed on 24 November 2016 (Thanksgiving), so the data begins at the first trading day on or after it.

2. AI basket: equal weight, limited to basket members with the full 10 years of history. A second version that adds names as they list is reported beside it.

3. Benchmark for the verdict: the equal-weight S&P 500 (RSP). In it each AI stock is about 0.2% of the index, so the correlation is not mostly arithmetic. The S&P 500 itself is reported beside it.

4. Compare correlation in the earliest 12 months (24 November 2016 to 23 November 2017) with the most recent 12 months (25 November 2025 to 24 November 2026).

5. Uncertainty: a 90% interval for the difference, using a block bootstrap with 20-day blocks and 2,000 resamples.

**Supported if:** the recent correlation is more than 0.10 higher than the earliest correlation, and the lower end of the 90% interval is above 0.

**Also reported:** the rolling 126-day correlation over the full 10 years, with 30 November 2022 (ChatGPT's release) marked as a reference date only.

### Hypothesis 3: players learn

**Claim:** after a few levels, players estimate a portfolio's number of bets more accurately.

Amended on 26 November 2026 by PREREG_AMENDMENT_3.md, before any real guess record exists: it registers which row counts as "the" level-2 and level-7 record for a player who sends more than one, and that Hypothesis 3's analysis reads only the `GUESSES` dataset, never rows the Worker routed to `GUESSES_PLAYTEST`. PREREG.md keeps the original wording; this section carries the amended rule.

**Test design:**

1. Level 2's portfolio and the first of level 7's mystery portfolios are both drawn at random from one pool of 20, so on average they are equally hard.

2. For each player who reaches level 7, the error is the gap between their guess and the actual number of bets, on level 2 and again on level 7. **Which record counts, added by amendment 3:** for each player ID, the analysis reads the earliest level-2 row and the earliest level-7 row, by the timestamp Workers Analytics Engine puts on every row. A player's first-ever level-7 attempt is the earliest, whatever they do on a replay afterwards.

   **The analysis must check for same-second ties, and report them rather than resolve them.** Those timestamps are second-granular, verified against the live datasets on 27 November 2026 (BUILD_LOG.md session 2.33): three records sent a second apart came back ordered `02:54:20`, `02:54:21`, `02:54:22`. So two rows landing inside one second under a single player ID cannot be ordered by timestamp, and "the earliest" would be ambiguous between them. Real play cannot produce that — each capstone guess needs a new portfolio read, a slider moved and a reveal screen passed through, which is tens of seconds, and the level-2/level-7 pair the test compares is whole levels apart. A tie is therefore not a reading of the data to settle but a sign the rows did not come from a person playing, which is known weakness 10. The analysis counts such ties, names the IDs, and reports them; it does not pick one row and carry on. This is a note on how the analysis runs, not a change to the registered rule — amendment 3 fixes which row counts, and this says what to do when the data cannot answer that.

3. Each guess sends one anonymous record: a random per-browser ID, level, guess, actual value and date. No tickers, amounts or personal data.

4. Data collection closes 60 days after launch. As dates: the window is rows timestamped at or after **27 November 2026, 22:20:16 UTC** (the `launch` tag) and before **26 January 2027, 22:20:16 UTC**. See "The launch window, as dates" below for why the tag, and only the tag, defines launch.

5. **The window opens at the `launch` tag, added 27 November 2026** (BUILD_LOG.md session 2.38). The analysis reads only rows timestamped at or after an annotated git tag named `launch`, created on launch day and pushed to GitHub, whose timestamp is therefore public and fixed before the rows it admits exist. A start bound chosen afterwards, by looking at the rows and deciding which ones were "real", is a researcher degree of freedom; a tag is not.

   **This is a second guard, not the one that excludes the author's own testing.** PREREG_AMENDMENT_3.md section 3 already registers that the analysis reads only the `GUESSES` dataset and never `GUESSES_PLAYTEST`, which is where every `?src=playtest` row goes - the 8 rows in `data/guess_exports/` are all in the playtest file and `GUESSES` holds none. That rule is timestamped on GitHub and is what keeps Maya's play out of the test. The tag bound catches the different case it cannot: a stray row that reached `GUESSES` itself before the game was open to anybody - from a smoke test against the live Worker, say, or a `?src` that was mistyped and so never matched `playtest`.

   **The tag exists: 27 November 2026, 22:20:16 UTC.** Created and pushed, so its timestamp is public. It is also the definition of launch for every other date in this document: see "The launch window, as dates" below.

**Supported if:** at least 60 players reach level 7, their median level-7 error is at most 70% of their median level-2 error, and a one-sided sign test on each player's improvement gives p below 0.05.

**Not enough data:** if fewer than 60 players reach level 7, the page says so and shows what was collected.

**Limit, stated on the page:** there is no control group. Players who reach level 7 may already be the stronger ones, so this shows improvement during the game, not proof that learning lasts or transfers.

### The AI basket

The 13 names from v1 are frozen in basket.json, each with a one-line reason it counts as AI-driven. Both hypotheses are rerun 13 times, dropping one name each time. If any single drop flips a verdict, the page says so.

Hypothesis 2's equal-weight basket already includes only the members with the full 10-year history (11 of the 13 — VRT and PLTR are excluded by that rule regardless of any drop). 11 of the 13 drops change the full-history basket; dropping VRT or PLTR reproduces the baseline, so there are **12 distinct results**. Hypothesis 1 is not affected — all 13 drops change its beginner and control pools, because its universe is the full basket, not the full-history subset.

### Values fixed at registration

Every choice that could be tuned after seeing results is fixed here, before any price is downloaded. PREREG.md carries this same section, and the prereg tag timestamps it.

| Value | Fixed as | Where it is used |
| --- | --- | --- |
| The 3 non-AI stocks | JPM (banks), JNJ (health care), PG (consumer staples) | Hypothesis 1's universe and control set |
| Random seed | 2026 | Hypothesis 1's portfolio sampler and Hypothesis 2's block bootstrap |
| Freeze date | 24 November 2026, a normal trading day (amended 25 November 2026 from 30 November 2026) | The last day of every return window in Hypotheses 1 and 2 |
| Earliest download date | Once the prereg-v3 tag is on GitHub (amended 25 November 2026 from 1 December 2026, then moved forward again the same day by amendment 2) | No price is fetched until the amendment publishing the headline test and its threshold is publicly timestamped |
| AI basket | The 13 names in basket.json | Both hypotheses, including the leave-one-out reruns |
| Full universe | The 9 groups in tickers.json | The ticker list the game and both hypotheses draw from |

One non-AI stock was chosen per non-technology group so the control set spreads across banks, health care and consumer staples rather than sitting inside one industry.

## How the numbers work

Every measure is computed in the browser from daily adjusted closes. The same code produces the published verdicts and the user's results.

**Daily returns are simple returns** (close-to-close percent change), used consistently everywhere a return appears. After the first real-data run, the same computation was redone with log returns instead, with nothing else changed, and gave the same four verdicts: Hypothesis 1's headline and registered tests, and Hypothesis 2 against RSP and against the S&P 500. Simple returns are kept because they are what a dollar amount in the game actually does; the check is recorded so that the choice is shown not to matter here, rather than assumed not to.

**The committed price snapshot is the reference data.** Yahoo's adjusted closes for dividend-paying tickers are not reproducible between fetches. Refetching KO with an unchanged start date disagreed with the committed snapshot on 1,731 of 2,513 days, by up to 8.1e-7 relative; across the whole universe the differences reach 1.2e-6 relative, and they appear only in dividend payers, never in the index or in a ticker that pays nothing. The cause is most likely rounding in Yahoo's back-adjustment, but that is inferred and not confirmed. So every published verdict comes from the committed `data/prices.json`, not from a fresh fetch: `scripts/run_research.mjs` reads that file and no other, and records its SHA-256 in `data/results.json`, so a result can be matched to the exact bytes it came from. The differences are far below anything that moves a verdict - measured, not assumed: replacing the snapshot moved Hypothesis 1's medians by at most 3e-7 and Hypothesis 2's correlations by at most 4e-6, and left all four verdicts and all 13 leave-one-out reruns unchanged (BUILD_LOG.md, session 1.11).

**The window defines which returns are in, not which closes.** A return on a window's first trading day needs the close from the trading day before it, which sits outside the window. The download therefore reaches back a few days before 24 November 2016, and the registered window is applied afterwards by slicing on dates. The lead-in rows supply that one starting price and are never returns of their own, so the registered boundaries are exactly as PREREG_AMENDMENT.md states them. Before this was fixed, the earliest 12 months held 250 returns over its 251 trading days.

**Returns are aligned by date, and a gap stops the run.** Every ticker is lined up on the S&P 500's trading days rather than by position in its own list. If any ticker is missing a trading day inside its own history - after its own first date, so a registered late start such as VRT's or PLTR's is not a gap - no returns are built at all and the ticker and date are named. A missing interior day would otherwise turn one day's return into two days' worth, inflating that day's move and denting the correlation around it.

**Inputs:** for a portfolio of N holdings, *w* is the vector of dollar weights (summing to 1). Σ is the covariance matrix of daily returns over the most recent 756 trading days, about 3 years. Holdings with less history use their overlapping days, with a minimum of 252. For Hypothesis 1 that overlap is worked out **once, across every name the sampler can draw**, and all 1,000 portfolios are scored on those same days: a median over 500 portfolios has to be a median over one window, not over 500 different stretches of market history. In the game, where a single portfolio is the whole calculation, the overlap is that portfolio's own.

### Effective risk sources (Meucci 2009, "effective number of bets")

Split Σ into principal components, Σ = E Λ Eᵀ. Find the portfolio's exposure to each component, then each component's share of total variance. The measure is the exponential of the entropy of those shares:

```math
\tilde{w} = E^{\top} w, \qquad p_k = \frac{\tilde{w}_k^{2}\,\lambda_k}{w^{\top}\Sigma w}, \qquad \text{ENB} = \exp\Big(-\sum_{k} p_k \ln p_k\Big)
```

It scores N for N equal, independent, equally volatile holdings, and 1 for identical ones. It counts risk, not money, so a bond fund adds little. The page says this wherever the number appears.

**Known limit:** principal components are blends of holdings, not holdings themselves. Meucci, Santangelo and Deguest (2013) proposed "minimum-torsion bets" to fix this. It is a stretch goal for the Methods tab, not a launch requirement.

### Share of risk

Each holding's contribution to portfolio variance. The shares sum to 100%, so they can be compared directly with dollar weights:

```math
\text{RC}_i = \frac{w_i\,(\Sigma w)_i}{w^{\top}\Sigma w}
```

### Other measures

| Measure | Definition | Why it's used |
| --- | --- | --- |
| Market stress days | Worst 10% of daily S&P 500 returns in the window | An outside benchmark, so stress isn't defined by the AI stocks under study |
| Beta to the AI basket | Covariance of portfolio returns with the equal-weight AI basket, divided by basket variance | Catches AI exposure held through funds, which direct-holding percentages miss |
| Stress-days beta | The same beta, computed on market stress days only | Shows how exposure changes when markets fall |
| Stress-test loss | Portfolio value × beta × shock size, shown for both betas | A simple, explainable scenario; the range shows its instability |
| Correlation | Pearson correlation of daily returns | Pairwise view behind the heatmap |

## Data, architecture and privacy

There is no server-side math, no database and no user accounts. Prices come in; holdings never go out.

**Architecture:**

```
GitHub Actions, weekday evening ──► Yahoo Finance ──► data/game.json (committed) ──► Browser (all math runs here)

Browser ──► Cloudflare Worker: anonymous count pings and guess records only
```

**There is no live price proxy, and there never was one built.** An earlier
draft of this section had the Worker standing between Yahoo and the browser
on every page load, with the committed snapshot as its fallback. That is not
what got built: `scripts/fetch_data.py` and `.github/workflows/refresh.yml`
call Yahoo on a schedule, never per visitor, and commit the result straight
into the repo as `data/game.json`. Every page read (`js/game.js`,
`js/sandbox.js`, `js/myPortfolio.js`, `js/research.js`) fetches that file
like any other static asset — none of them call a Worker, and none of them
need to. The Worker's only job is the two anonymous analytics routes below.
Practically, this also means breaking the Worker can never affect prices:
see milestone 3 step 5.

**Two price files, and they are not interchangeable.** `data/prices.json` is the frozen research snapshot: 10 years ending on the freeze date, the exact bytes every published verdict was computed from, written once and then left alone. `data/game.json` is what the game plays on: the most recent 756 trading days of daily returns for every ticker, rebuilt every weekday evening by a scheduled workflow and committed only when it changed. The returns in it are built by `js/returns.js`, the same code that produced the verdicts, so the game and the research apply one rule for date alignment, gaps and window slicing. The raw live download is never committed. If a fetch fails the previous `data/game.json` is kept; a file that goes more than 5 weekdays stale fails the job, as does any gap or missing ticker, so a broken file never replaces a good one. `data/game.json` records "Live prices through [date]", which is what the status chip reads.

| Source | Supplies | When | Notes |
| --- | --- | --- | --- |
| Yahoo Finance | Daily adjusted closes, 10 years, about 40 tickers in 9 groups: AI stocks, other large tech, banks, energy, health care, consumer staples, international funds, bonds and gold, and core US funds; plus the S&P 500 and RSP | Launch | Unofficial endpoint, personal-use terms. Labeled as unofficial educational data |
| Levels file | Level rules, thresholds, the pool of 20 guess portfolios, weekly challenge portfolios | Launch | Plain JSON in the repo, so instructors and reviewers can read every rule |
| Names file | Each playable ticker's full name and what kind of thing it is: stock, stock fund, bond fund, gold | Added 27 November 2026 on playtest feedback | `names.json`, separate from the registered `tickers.json` so that display text never means editing a file fixed at the prereg tag. Shown in a closed "What are these?" list on every build screen, beside each holding a player picks, and in the chips' spoken labels. Deliberately carries no sector: level 1 hides the group headings because they say which holdings move together, and this list is on the same screen |
| SEC Form N-PORT | Fund holdings | Later, optional | Official and free. Quarterly, public about 60 days after quarter end |
| OpenFIGI | CUSIP/ISIN to ticker | Later, optional | Free, rate-limited, server-side only |

**Data terms:** committing `data/game.json` to a public repo and serving it from GitHub Pages sends Yahoo data to the public, which goes beyond personal use. There is no Worker in this path to put an allowlist or a cache in front of — the equivalent limits are in the fetch itself: `scripts/fetch_data.py` only ever requests the tickers named in `tickers.json`, and it runs once per weekday evening rather than once per visitor, so the game's many readers never turn into many calls to Yahoo. The Methods tab says this openly. Before launch, test one fallback source's free tier and terms (for example Tiingo) so a switch is planned, not improvised.

**What leaves the browser:** two kinds of anonymous record go to the Worker, and nothing else. A count ping carries the level reached, whether every level before it had been passed, and a source code from the link. A guess record carries a random per-browser ID, the level, the guess, the actual value and the date. Neither carries tickers, amounts, names or emails. Progress, stars and portfolios stay in the browser's own storage, and the page works even if that storage is unavailable.

## Launch goals and definition of done

The project is done when students have played it, at least one instructor has used it in a session, and changes have shipped because of player feedback. Being live is not enough.

### The launch window, as dates

Written down on 27 November 2026, because "60 days after launch" and "day 80" are not dates until somebody works them out, and all three of these decide when something has to happen.

**One definition, fixed 27 November 2026: launch is the `launch` tag, and every date below counts from its timestamp.** The table used to count from the day GitHub Pages first served the site, 26 November, while Hypothesis 3's window started at the tag. Those are different days, and the gap between them made the collection window **59 days against the 60 PREREG.md registers**. There is only one honest way to settle it, because only one of the two candidates is a public, immutable timestamp that the registered analysis already points at.

| What | Date | Where it comes from |
| --- | --- | --- |
| **Launch** | **27 November 2026, 22:20:16 UTC** | The annotated `launch` tag, pushed to GitHub, so the timestamp is public and cannot be moved. This is the single definition every row below uses |
| GitHub Pages first served the site | 26 November 2026 | A fact about hosting, kept because it is true, and **not** a boundary for anything. Nothing was collected from a visitor that day: every row in both datasets before the tag is the author's own testing |
| **Collection closes** | **26 January 2027, 22:20:16 UTC** | The tag plus the 60 days PREREG.md registers. The analysis reads rows with a timestamp at or after the tag and before this, which is exactly 60 days |
| **Export runs** | **27 December 2026, 26 January 2027, 15 February 2027** | `npm run export`, monthly. Workers Analytics Engine keeps data about three months, so the rows must be out of it and into a file before the last of these, which is the tag plus 80 days: the last safe date rather than the intended one |

**What this changed, and what it did not.** The close moved from 25 to 26 January and each export date by one day. Nothing registered moved: PREREG.md says "60 days after launch" and this is the first arrangement under which that is literally true. The previous one would have closed the window a day early, which is the direction that loses data rather than the direction that flatters a result, but it was still wrong.

### Launch is done when

- ☑ The prereg tag exists, and its timestamp comes before the first commit containing real price data.

- ☑ The status chip on the deployed site reads "Live prices through [date]".

- ☑ Hypotheses 1 and 2 show verdicts from real data; Hypothesis 3 shows "collecting".

- ☑ The known-answer math tests and the weekly level-solvability test pass in CI.

- ☑ **Every screen is clear, concise and helpful to a beginner.** Replaced the ten-minute goal on 27 November 2026, on playtest feedback (BUILD_LOG.md, player feedback 6).

  **What was here, and is retired:** "Levels 1 to 3 can be played in under 10 minutes on a mid-range phone", ticked but close to the limit — a real-phone run took 5 to 10 minutes depending on how carefully the text was read, and `node scripts/dev_phone.mjs` put it over ten minutes for a reader at 125 words a minute.

  **Why it went.** The target was measured almost entirely by counting words: reading was about 88% of the estimate and the machine 3%, so the number moved with assumed reading speed and with nothing a player would notice. That made it an incentive to delete explanation, which is the opposite of what the playtest asked for — the feedback this whole round of changes comes from was that screens did not explain enough, not that they explained too slowly. A budget that is tightened by removing the sentence telling somebody what a ticker is was measuring the wrong thing.

  **What replaces it.** Text stays concise, and concise is judged by whether it helps a beginner rather than by a clock. Where a screen needs more explanation than fits, the explanation goes behind a tap — a closed "What are these?" list, the About tab — so a player who already knows pays nothing for one who does not. Clarity is tested by watching five first-time players with no help (Milestone 4), not by a stopwatch and not by a word count.

- ☑ The daily puzzle shows the same pairs on two different devices (it's seeded by the date, which needs no Worker).

- ☐ The classroom link, completion code, verify page and one-page lesson plan work end to end. Deferred past this launch — see milestone 3's note above, 26 November 2026.

- ☑ The README has a live link and "How to run locally", plus the real verdicts — including the two that came out against the claim. **The 60-second demo GIF is dropped from this launch**, by decision on 27 November 2026 (BUILD_LOG.md session 2.30): it needs a screen recording nobody has made, and holding the launch for it buys less than shipping without it. It moves to Milestone 4's outreach work, where a 30-second recording is already on the 8-week plan for weeks 5 to 6 and will be made properly rather than hurriedly.

### Success targets, 60 days after launch

| Metric | Target | How it's measured |
| --- | --- | --- |
| Players who start level 1 | 500 | Count-only ping. Counts **visits**, not people - see below |
| Players who finish level 3 | 150 | Measured by **level 4** pings carrying `passed` - see below |
| Players who reach level 7 | 60 | Level 7's ping carrying `passed`; also the minimum for Hypothesis 3 |
| Classes or club sessions that use it | 3 | Classroom links created, confirmed by the host |
| Feedback responses | 40, **on hold** | Three-question form. Paused 27 November 2026: no form exists and none is being built for now, so this row cannot be measured. It is kept rather than deleted because the target is still the right one if a form is ever added |
| Changes shipped from feedback | 2, written up in the README | Git history |
| Findings write-up | 1 post with all verdicts | Published link |

These are stretch targets.

**The first column says "players" and the pings count visits.** Added 27 November 2026, when the pings were actually wired up (BUILD_LOG.md session 2.29). A count ping carries the level reached, whether every level before it had been passed, and a source code, and deliberately no per-browser id - so nothing downstream can tell one person's second visit from a second person. The client sends each level at most once per visit, so a player who retries level 4 six times in one sitting is counted once; a player who comes back tomorrow is counted again. Every "players who..." row above is therefore an upper bound on people and an exact count of visits, and the write-up should say so rather than quietly reporting visits as players. The guess records are the one place a returning player can be recognised, because those do carry an id - which is exactly why Hypothesis 3 can pair a level-2 error with a level-7 error across visits and the targets table cannot.

**"Finished level 3" is measured by level 4 pings that say the ladder behind them was passed.** Rewritten 27 November 2026 (BUILD_LOG.md session 2.38), when playtest feedback moved the unlock rule from passing a level to playing it. There is no "finished" ping - a ping fires when a level is *reached*. Under the old rule reaching level 4 *was* passing level 3, so the level alone was the measurement; under the new one a player can walk past a level they failed, and the level alone would quietly have started counting something weaker.

So the ping now carries one more field, `passed`: whether **every** level before this one had been passed at the moment this one was reached. "Finished level 3" is the count of level-4 pings with it true, and "reach level 7" is level 7's pings with it true - which is the same sentence as "levels 1 to 6 were all passed", exactly what that row claimed before. Every earlier level and not merely the one before, because those are now different claims.

Three points of honesty about the field. It is still a property of a **visit**, like everything else on a ping - there is no id beside it, by design, so a player who passes level 3 tomorrow having failed it today sends a second, truer ping and is counted twice. It is a **snapshot at the moment of reaching**, so a player who reaches level 5, goes back and passes level 4, and never re-reaches 5 in that visit leaves a `false` behind that their save would now contradict; both of these make the rows an upper bound on visits and never an undercount. And a ping from a page that was already open before the field existed carries no `passed` at all; those rows are written as **-1, "not stated"**, rather than as a 0 that would undercount or a 1 that would inflate, so a query can set them aside instead of averaging them in.

## Audience, marketing and outreach

Reach students in groups, through the people who already gather them: instructors, clubs and campus offices. A game with no sign-up suits that. Online posts amplify what campus proves. Lead every message with a surprising result ("my 5 holdings were 1.7 bets"), never with "please try my app".

### Audience segments

| Segment | What they want | Message | Where to reach them |
| --- | --- | --- | --- |
| Students in intro econ, finance or business | Something quick that connects to class | "Is your diversified portfolio really one trade? Short, free, no sign-up." | Course forums through the instructor; class group chats |
| Curious students outside finance | To start investing without jargon or embarrassment | "Play this before you invest your first $100." | Dorm and club group chats; short videos on Instagram and TikTok; campus newspaper |
| Investing and finance club members | Activities for meetings; something to compete on | "Run a 15-minute diversification challenge at your next meeting." | Club presidents; club newsletters |
| Instructors, TAs, financial wellness staff | A ready activity with no setup and no student data | "A live-data activity on diversification, lesson plan included." | Office hours; department emails; teaching resource lists |
| Beginning investors with real accounts | To know whether their funds overlap | "Is your index fund plus tech ETF one trade?" | Investing subreddits, with moderator permission |

### Growth built into the game

- **Share card:** after each level, a "Share my score" button makes a 1080x1080 image: the level, the stars, one headline built from that level's own measure - "I found 3.2 bets in 5 holdings. Can you beat it?" - the challenge link, and "Educational, not investment advice." It never carries a ticker, a dollar amount or a weight.

  **The two pool levels say how close the guess came, and never the answer.** Levels 2 and 7 are dealt their portfolios from the Hypothesis 3 pools, so the same portfolio reaches other players. Their cards carry the stars and a band - "within half a bet" - and neither the real number of bets nor the guess, since the two together are the answer. Every other level builds its own portfolio, so its number gives nobody else anything. The link carries ?src=share and nothing about the portfolio or the draw.

- **Weekly challenge:** one new mystery portfolio each Monday, so there's a reason to come back and to post about it.

- **Source tags:** every shared link carries a short source code (for example ?src=club-ucla). The count ping records only that code, so you can see which channel works without tracking anyone.

### Instructor kit

Professors adopt tools that come with a ready assignment, so ship these together:

1. A one-page lesson plan in two versions: 15 minutes (levels 1 to 3) and 50 minutes (all levels plus discussion).

2. Five discussion questions, such as "Why can an S&P 500 fund be a concentrated bet?"

3. A classroom link builder: pick levels, get one link and a QR code.

4. A one-paragraph privacy and "not advice" statement an instructor can paste into a course page.

### 8-week plan

**Weeks 1 to 2: playtest.** Run 5 in-person tests with friends and floormates; most will have no account, which is now the point. Give no help; note where they stall, and note every screen they had to read twice. Fix the top 3 problems, then test 5 more. Pass mark: 4 of 5 finish level 3 and can explain the idea back. **Do not time them.** How long it takes is not the measure and never was a useful one — a player who takes twelve minutes because the screens are interesting is not a problem, and one who takes six because they gave up reading is.

**Weeks 3 to 4: seed your campus.**

- Pitch 3 club presidents on a 15-minute "One Trade challenge" at a meeting, with pizza for the best guess score.

- Visit 2 intro econ or finance professors in office hours with the instructor kit. Ask one to be your faculty advisor; it adds credibility.

- Ask the campus financial wellness office to list it among their resources.

- Pitch the campus newspaper on the findings, not the app: "Freshman finds most student portfolios are one bet."

- Post once in each dorm, class and club group chat you belong to, and never repeat.

**Weeks 5 to 6: launch online.**

- Findings post on LinkedIn and X with one chart and the honest verdicts, including any that failed. Tag your school and your faculty advisor, with their permission.

- A 30-second screen recording: "I thought I had 4 bets. I had 1.4." Post it on Instagram Reels, TikTok and YouTube Shorts.

- Show HN on Hacker News, with you online for the first 2 hours to answer questions.

- r/SideProject, and r/dataisbeautiful with an original chart. Ask moderators before posting in r/Bogleheads, r/personalfinance or r/investing.

**Weeks 7 to 8: reach other campuses.**

- Email 20 instructors at other universities whose public syllabi cover diversification, with the instructor kit attached and one sentence on what happened in your campus session.

- Submit it to teaching resource collections such as the Economics Network and to personal finance educator newsletters.

- Ask each club that ran a session to forward it to one club at another school.

### Budget

Under $100: pizza for two club sessions, about 50 printed QR flyers, and optionally a domain name (about $12 a year). Everything else is free.

### Message templates

**Group chat or friend:**

I made a short game with pretend money and live market data. It shows how many real bets your portfolio makes, and most people guess way off. No sign-up. Can you beat 3 stars on level 3? [link]

**Professor or financial wellness office:**

Hi [name], I'm a freshman in [major]. I built a free browser game that teaches diversification with live market data: students build portfolios with pretend money and guess how many independent bets they've made. It needs no sign-up, collects no student data, and comes with a one-page lesson plan. Could I show it to you for 5 minutes, or could it be shared with your students? [link]

**Club president:**

Hi [name], could I have 15 minutes at a meeting to run a diversification challenge? Everyone plays a short game on their phone with pretend money and live prices, and the best guess score wins pizza. No sign-up needed. [link]

### Rules for every channel

- Every post and screen says "educational, not investment advice". Never promise returns.

- **Never promise how long it takes.** Added 27 November 2026, with the clarity goal that replaced the ten-minute target (BUILD_LOG.md, player feedback 6). "Short, free, no sign-up" is the claim; a number is a promise about a stranger's reading speed that nothing in the game can keep, and the moment it is made, every later decision about explaining something properly is measured against it. Asking a club for a 15-minute slot is a different thing and is fine — that is time you are asking for, not time you are promising.

- Follow each community's self-promotion rules, and ask moderators first when unsure.

- Don't imply a university, club or professor endorses it without their written yes.

- Product feedback is fine to collect. If you ever want to publish player data as research beyond Hypothesis 3's anonymous guesses, ask your faculty advisor about your school's research ethics review (IRB) first.

## Known weaknesses

Each of these limits is also stated in the Research mode's methods notes.

| # | Weakness | What the design does about it |
| --- | --- | --- |
| 1 | **Learning is measured without a control group.** Players who reach level 7 may be the stronger ones. | Hypothesis 3 is framed as improvement during the game, not proof of lasting learning. A classroom comparison could come later. |
| 2 | **Pretend money with real tickers can feel like stock picking.** | Returns never score; no leaderboard; "educational, not advice" on every screen. |
| 3 | **Live data moves the goalposts.** A design that passes a level today may fail next month. | A weekly test checks every level stays passable; the player is told why results change, which is itself a lesson. |
| 4 | **Hindsight in the AI basket.** Today's AI leaders are picked, then their past is measured. | Basket frozen with reasons; leave-one-out check; full-history and growing-basket versions reported. Not solved. |
| 5 | **Yahoo is unofficial** and can rate-limit or change; public serving goes beyond its terms. | Caching, an allowlist, a fallback snapshot and a tested backup source. Mitigated, not solved. |
| 6 | **Hypothesis 1's universe is chosen** by the author. | Sampling rules and seed published; the control set shows the measure separates portfolios. |
| 7 | **Correlation with the S&P 500 is partly arithmetic.** | Verdict uses the equal-weight S&P 500. |
| 8 | **Stress estimates are noisy and look backward.** | Crash replay uses real history instead of a model; a beta range is shown, not one number. |
| 9 | **The main metric comes from principal components**, not actual holdings. | Explained in plain words; minimum-torsion bets are a stretch goal. |
| 10 | **A `/guess` record can be forged by a script**, not just sent by a browser playing the game. | The Worker validates the exact field set, the ID's shape, that the level is 2 or 7, that the guess and actual value sit in that level's registered range, and that the date is within a day of the Worker's own clock; a Cloudflare rate limit caps requests per visitor without the Worker ever reading or storing an IP. A determined forger with many IPs and well-formed payloads is not fully ruled out. |

## Build plan

There are five milestones, in order, and each ends with a check you can verify. Do not fetch real prices until step 1.3 is done.

### Milestone 1: lock the tests, then run real data (about a week of evenings)

1. Write basket.json: the 13 AI tickers, each with a one-line reason. Write tickers.json: the full list of about 40, grouped.

2. Write PREREG.md: copy in the research section of this document word for word, including all three hypotheses, thresholds, windows, sample sizes and the random seed.

3. Commit both, run git tag prereg, and push the tag. GitHub now timestamps the tests before any results exist.

4. Write scripts/fetch_data.py: 10 years of daily adjusted closes for the full ticker list in tickers.json, plus RSP and the S&P 500 index.

5. In the browser code, add the Hypothesis 1 sampler (seeded), the control set, the block bootstrap for Hypothesis 2 and the leave-one-out loop.

6. Nothing to remove. This is a fresh build, so the resilience score and the fixed-rule portfolio comparisons never existed here; do not build them.

7. Write known-answer tests: tests/make_fixtures.py computes effective bets, share of risk, beta and correlation with numpy for 3 fixed portfolios; tests/math.test.js (run with node --test) checks the browser math matches to 1e-9. Include two hand-derivable cases: two identical assets score 1; two independent, equally volatile assets score 2.

8. Add a GitHub Actions workflow that runs the tests on every push.

9. Run fetch_data.py on real prices and let the generated headline say whatever the verdicts say.

**Check:** the tag predates the real-data commit; CI is green; Hypotheses 1 and 2 render from real data.

### Milestone 2: the game (about two weeks of evenings)

1. Write levels.json: each level's goal, pass rule, threshold and explanation text, plus the pool of 20 guess portfolios.

2. Build the round flow: build with $10,000 of pretend money, guess, reveal, explain, award stars.

3. Write the "Why?" card templates and the rules that pick them: most correlated pair, largest gap between dollar share and risk share, one group holding most of the risk.

4. Tune thresholds on real data so each level has at least 3 different winning designs. Add a weekly CI test that fails if any level becomes impossible.

5. Build Crash replay for the 2020 crash, the 2022 bear market and the January 2025 AI selloff, drawn next to the S&P 500.

6. Build the daily "Same bet?" puzzle: five pairs picked from the date, three answer buckets, and a spoiler-free share grid.

7. Save progress in the browser's storage, wrapped in try/catch so the game still works without it.

8. Add the share card (an image with the stars and one headline, never holdings, and never the answer on the two pool levels) and the weekly challenge.

9. Build the Sandbox and My real portfolio modes.

**Check:** a first-time player can get through levels 1 to 3 on a phone and say what each one was about. Until 27 November 2026 this read "in under 10 minutes"; see the clarity goal in "Launch is done when" above for why the clock went.

### Milestone 3: launch (one weekend)

**Narrowed on 26 November 2026 (BUILD_LOG.md session 2.27): this milestone ships
only `/ping` and `/guess`.** The classroom link, the completion-code flow (and
the `/code` route and its secret key that signed it), the instructor's verify
page and the one-page lesson plan are deferred to a later session — none of
them exist in the code yet. They stay unticked in "Launch is done when" below
on purpose. One upside of the narrower scope: with `/code` deferred, this
Worker never holds a secret.

1. Deploy the Cloudflare Worker with ALLOWED_ORIGIN, strict server-side
   validation on `/guess` (exact fields, id shape, level 2 or 7 only, guess
   and actual inside that level's registered guess range, a date within a day
   of the Worker's own clock), a Cloudflare dashboard rate-limit rule on both
   routes (per visitor, no IP read or stored by our code), and two routes:
   `/ping` (level reached, whether every earlier level had been passed, and
   a source code) and `/guess` (per-browser ID,
   level, guess, actual value, date). Both are anonymous and written to
   Workers Analytics Engine — `/guess` rows carrying `?src=playtest` go to a
   separate `GUESSES_PLAYTEST` dataset instead of `GUESSES`, so Maya's own
   testing never enters Hypothesis 3 without adding a field to the registered
   record. See PREREG_AMENDMENT_3.md.

2. ABOUT.url and GitHub Pages are already live (done 26 November 2026) and
   the refresh workflow's secret is already set and running on schedule. What
   remains here is narrower: set PROXY in js/config.js to the deployed
   Worker's URL once step 1 is done.

3. Deferred. See the note above.

4. **Deferred, 27 November 2026: decided not to add a form for now.** It had
   been waiting on whether a ready three-question form existed to link to; the
   answer is that none will be made yet. The only form worth linking would be
   hosted elsewhere, and a page that promises nothing you build leaves the
   browser should not send a player to a third party for the sake of a target
   nobody is yet in a position to hit: no visitor outside this project has
   ever reached the game. Feedback until then comes from playtests and direct
   conversations, written up in BUILD_LOG.md as every change in this round of
   sixteen already was.

5. Break the Worker URL on purpose and confirm gameplay is completely
   unaffected — there is no price fallback to test for, since prices never
   passed through the Worker (see "Architecture" above). Then restore it and
   confirm Analytics Engine shows rows again for both routes.

6. Write the README: live link, 60-second GIF, verdicts, "How to run locally".

**Check:** every item in "Launch is done when" is ticked.

### Milestone 4: players and outreach (8 weeks)

**Moved here from "Launch is done when" on 26 November 2026** (BUILD_LOG.md
session 2.27): run 5 first-time players through level 3 with no help, and
confirm each can explain "different tickers can be the same bet" in their own
words. This is a post-launch step now, not a launch gate — the 8-week plan's
own weeks 1 to 2 already call for exactly this playtest, so it was never
really a pre-launch check to begin with. Every playtest session is opened
with `?src=playtest`, which the Worker routes to a separate
`GUESSES_PLAYTEST` dataset (see PREREG_AMENDMENT_3.md); none of those guesses
enter Hypothesis 3.

Follow the 8-week plan above. Log weekly: players by source code, levels reached, responses, top complaint, change shipped. Ship at least two changes that came from players.

### To watch in the next playtest

Things measured but deliberately not acted on yet, because what they mean depends on watching somebody play. Added 27 November 2026.

- **Is every screen clear?** The goal that replaced the ten-minute one, and the only way to answer it is five people and no help. For each screen: did they read it twice? Did they ask what a word meant? Did they act on it or ignore it? A screen that is skipped is as much a problem as one that is slow, and the word count could not see either.

- **The ladder's difficulty is wildly uneven, and level 3 is the hard one.** On the live window, the share of randomly drawn designs that pass each level: level 3 **1.4%** (17 of 1,199), level 6 4.6%, level 1 8.8%, level 5 10.5%, **level 4 56.1%** (635 of 1,131). So level 3 — the third thing a new player meets, and the last one in the 15-minute classroom cut — is by some distance the hardest in the game, and level 4 passes more often than not. `node scripts/check_pass_bar.mjs` prints the table. **Nothing is being changed on this now**: a pass rate over random draws is not a pass rate over what a person builds, and a player who has just been taught to spread across groups is not drawing at random. Whether level 3 is actually a wall is a question for five people and no help, which is what this milestone is for. Watch where they stall, and how many reach level 4 without being told anything.

**Run `npm run export` monthly: 27 December 2026, 26 January 2027 when collection closes, and 15 February 2027 at the latest.** Workers Analytics Engine retains data for about three months; the registered 60-day collection window already uses most of that margin, and 15 February is the tag plus 80 days, the last safe date rather than the intended one. The script is idempotent: every run is a full, fresh pull of whatever is still in each dataset, never an append, so running it early or twice costs nothing. See "The launch window, as dates" above. Added 26 November 2026 (BUILD_LOG.md session 2.29), set to monthly on 27 November 2026 (session 2.36).

**Check:** the success targets table is filled in with real numbers, met or not, and Hypothesis 3 has a verdict.

### Milestone 5: fund look-through (optional, a few days)

1. Map VOO, QQQ, VTI, VXUS, BND and GLD to their SEC series IDs through EDGAR.

2. Pull the latest quarterly N-PORT holdings for those series.

3. Resolve identifiers to tickers through OpenFIGI, server-side, and report the match rate.

4. Store each fund's top 25 holdings, total AI weight and filing date in a small file.

5. Show them under Sandbox and My real portfolio; funds without data say so.

**Check:** entering VOO shows named companies, percentages and the filing date.

## Sources

- Meucci, A. (2009). "Managing Diversification." *Risk*, 22(5).

- Meucci, A., Santangelo, A., Deguest, R. (2013). "Risk Budgeting and Diversification Based on Optimized Uncorrelated Factors."

- Market: [NGPF STAX](https://www.etf.com/sections/index-investor-corner/new-online-game-teaches-investing), [STAX plays](https://dev2.ngpf.org/blog/credit-scores/looking-for-a-simulation-here-are-ten-your-students-will-love/), [Stock-Trak](https://www.stocktrak.com/stocktrak-product/), [HowTheMarketWorks](https://howthemarketworks.com/), [Zogo](https://www.fool.com:443/the-ascent/personal-finance/zogo-review/), [Bloomberg Market Concepts](https://qmplus.qmul.ac.uk/mod/page/view.php?id=3871442), [Wharton WRDS](https://wrds-www.wharton.upenn.edu/pages/grid-items/mechanics-diversification/), [St. Louis Fed](https://www.stlouisfed.org/education/diversification-and-risk), [PortfolioPilot](https://portfoliopilot.com/portfolio-management/look-through-analysis), [Koyfin](https://www.koyfin.com/blog/check-etf-overlap-portfolio/).