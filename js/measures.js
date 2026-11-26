// js/measures.js - every measure docs/PRD.md names, for one portfolio, at once.
//
// WHY THIS IS NOT js/round.js. A round computes ONE measure, the one its level
// asks about, and refuses to reveal it before the player has guessed: "the guess
// comes first" is the whole design of Learn. Sandbox and My real portfolio ask
// the opposite question - here is a portfolio, tell me everything about it - and
// there is no guess to come first. Bending createRound() into that would have
// meant a round with no level, no threshold, no stars and no guess, which is not
// a round.
//
// SO THIS FILE IS THE MEASURES AND NOTHING ELSE: no DOM, no fetch, no screen
// text beyond the two notes every screen showing these numbers has to carry.
// js/sandbox.js and the real-portfolio screen render what comes out of here.
//
// NO NEW MATH. Every number is js/math.js's, already checked against numpy to
// 1e-9, and the per-holding facts are js/why.js's whyFacts() - the same facts the
// "Why?" cards are written from, so a risk share in Sandbox is the same risk
// share Learn explains. What IS new here is one SELECTION rule - which days
// count as market stress days - and it has its own known-answer tests, because a
// rule that picks 75 days out of 756 can be wrong in ways no eye catches.
//
// THE SHOCK IS NOT HERE EITHER. It is levels.json's stressTest block, read
// through js/levels.js's validateStressTest(), beside every other rule the game
// checks. docs/PRD.md fixes no shock size, so one had to be chosen, and a chosen
// number belongs where a reviewer reads the rules, not in code.
//
// Educational, not investment advice.

import {
  betaContributions,
  correlation,
  covariance,
  equalWeightBasket,
} from './math.js';
import { gameWindow, windowEndingOn, windowMatrix } from './gameView.js';
import { weightsFromDollars } from './levels.js';
import { whyFacts } from './why.js';

/** On every screen that shows a number. docs/PRD.md requires it by name. */
export const DISCLAIMER = 'Educational, not investment advice.';

/**
 * The sentence that goes wherever effective bets appears.
 *
 * docs/PRD.md, on the measure: "It counts risk, not money, so a bond fund adds
 * little. The page says this wherever the number appears." It is one exported
 * constant rather than a sentence typed into each screen, so the two modes
 * cannot drift into saying it two ways - or one of them into not saying it.
 */
export const BETS_NOTE = 'Effective bets counts risk, not money. A quiet holding can '
  + 'take a big share of the dollars and still add little to the count, and holdings that '
  + 'move together collapse into one bet however many tickers they are.';

// ------------------------------------------------------- market stress days

/**
 * Which days of a window are market stress days: the worst `fraction` of them,
 * by the benchmark's own return.
 *
 * docs/PRD.md defines them as the "worst 10% of daily S&P 500 returns in the
 * window", measured on an outside benchmark "so stress isn't defined by the AI
 * stocks under study". Three things that definition leaves open are settled
 * here, and each is settled the way that makes the answer reproducible:
 *
 * A COUNT, NOT A PERCENTILE. floor(days x fraction) days, ranked by return. A
 * percentile would interpolate between two days and hand back a threshold no day
 * actually had; the number of days on the wrong side of it would then depend on
 * ties and on float rounding at the edge. Counting fixes the set: 75 days out of
 * 756, whatever the market did.
 *
 * TIES BREAK BY DATE, earliest first - and a tie is not hypothetical, because a
 * flat day is a real day and two of them are equal to the last bit. The sort
 * below is on (return, index), which is a total order, so there is nothing left
 * for the engine's sort stability to decide. numpy's stable argsort gives the
 * same set, which is what tests/measures.test.js checks.
 *
 * THE DAYS COME BACK IN DATE ORDER, not worst-first: the caller slices rows out
 * of a returns matrix with them, and the rows have to stay paired with the
 * basket's own days.
 *
 * @param {number[]} benchmarkReturns the benchmark's daily returns, in date order
 * @param {number} fraction levels.json's stressTest.stressDays.fraction
 * @returns {number[]} day indices into the window, ascending
 */
export function stressDayIndices(benchmarkReturns, fraction) {
  if (!Array.isArray(benchmarkReturns) || benchmarkReturns.length === 0) {
    throw new Error('stressDayIndices: expected the benchmark\'s daily returns');
  }
  if (!Number.isFinite(fraction) || !(fraction > 0) || !(fraction < 1)) {
    throw new Error(`stressDayIndices: the fraction must be between 0 and 1, got ${fraction}`);
  }
  if (benchmarkReturns.some((value) => !Number.isFinite(value))) {
    const at = benchmarkReturns.findIndex((value) => !Number.isFinite(value));
    throw new Error(
      `stressDayIndices: the benchmark has no return on day ${at}, so the worst days `
      + 'cannot be ranked. A window is sliced to days every ticker covers before it gets here.',
    );
  }

  const count = Math.floor(benchmarkReturns.length * fraction);
  // TWO DAYS IS THE FLOOR, because betaTo() needs two to have a variance at all.
  // A one-day "beta" is a ratio of two numbers dressed as a statistic, and a
  // screen showing it would be making something up. Refused rather than shown.
  if (count < 2) {
    throw new Error(
      `stressDayIndices: ${Math.round(fraction * 100)}% of ${benchmarkReturns.length} days is `
      + `${count} day${count === 1 ? '' : 's'}, too few for a beta`,
    );
  }

  const ranked = benchmarkReturns
    .map((value, index) => ({ value, index }))
    .sort((a, b) => (a.value === b.value ? a.index - b.index : a.value - b.value));
  return ranked.slice(0, count).map((day) => day.index).sort((a, b) => a - b);
}

/**
 * The portfolio's beta to the basket over a chosen subset of days.
 *
 * The subset's OWN means are used, which is what docs/PRD.md's "the same beta,
 * computed on market stress days only" says: a beta over 75 days, not a 756-day
 * beta with 681 days hidden. Both series are cut with the same indices, so a
 * portfolio day never ends up paired with another day's basket.
 *
 * SUMMED FROM THE HOLDINGS' CONTRIBUTIONS, exactly as js/round.js's level 4 and
 * js/why.js's whyFacts() do. The two betas sit side by side on the screen and
 * the only honest difference between them is which days they are over, so they
 * are computed by one method; a number that differed by method as well would
 * make the range mean two things at once.
 */
export function betaOnDays(matrix, weights, basketReturns, dayIndices) {
  if (!Array.isArray(dayIndices) || dayIndices.length < 2) {
    throw new Error('betaOnDays: need at least 2 days for a beta');
  }
  const rows = dayIndices.map((day) => {
    const row = matrix[day];
    if (!Array.isArray(row)) throw new Error(`betaOnDays: the window has no day ${day}`);
    return row;
  });
  const basket = dayIndices.map((day) => basketReturns[day]);
  return betaContributions(rows, weights, basket).beta;
}

/**
 * docs/PRD.md: "Portfolio value x beta x shock size". Negative is a loss.
 *
 * A straight multiplication, written down as a function so that the two numbers
 * on the screen come from one line of arithmetic rather than two, and so the
 * known-answer test has something to call.
 */
export function stressTestLoss(value, beta, shock) {
  if (!Number.isFinite(value) || !(value > 0)) {
    throw new Error(`stressTestLoss: the portfolio value must be positive, got ${value}`);
  }
  if (!Number.isFinite(beta)) throw new Error(`stressTestLoss: beta is ${beta}`);
  if (!Number.isFinite(shock) || !(shock < 0)) {
    throw new Error(`stressTestLoss: the shock must be a negative fall, got ${shock}`);
  }
  return value * beta * shock;
}

/**
 * The stress rules out of a validated levels file, with the one thing the file
 * cannot know - that there IS a stress block - checked here.
 *
 * A caller that reached this far wants the numbers, so a missing block is an
 * error naming the file rather than a silent default. A default shock would be
 * the code choosing the scenario again, which is what putting it in levels.json
 * was for.
 */
export function stressRules(levels) {
  const stress = levels?.stressTest;
  if (!stress) {
    throw new Error(
      'measures: levels.json has no stressTest block, so there is no shock size and no '
      + 'definition of a stress day. See its note: docs/PRD.md fixes neither, so both are data.',
    );
  }
  return {
    shock: stress.shock,
    fraction: stress.stressDays.fraction,
    benchmark: stress.stressDays.benchmark,
  };
}

// ------------------------------------------------------------ all of them

/**
 * Every measure docs/PRD.md names, for one portfolio.
 *
 * @param {object} options.game     data/game.json, parsed
 * @param {object} options.dollars  ticker -> dollars. Any positive amounts; they
 *                                  are turned into weights here, which is what My
 *                                  real portfolio needs and Sandbox gets for free.
 * @param {string[]} options.basket basket.json's members, for the beta
 * @param {object} options.levels   levels.json, validated, for the window and the
 *                                  stress rules
 * @param {Map} [options.groups]    ticker -> {key, label}, from js/why.js
 * @param {string} [options.endDate] a fixed right-hand edge; null is the file's
 *                                  most recent day, which is what both modes use
 *
 * Throws, rather than returning a half-answer, when the window is too short:
 * levels.json's minDays is 252, and a measure over fewer days than that is not
 * one this game is willing to put on a screen. Both modes catch it and say so.
 */
export function measureAll({
  game, dollars, basket, levels, groups = null, endDate = null,
}) {
  if (!Array.isArray(basket) || basket.length === 0) {
    throw new Error('measureAll: the AI basket is needed for the beta, and none was given');
  }
  const { tickers, weights } = weightsFromDollars(dollars);
  if (tickers.length < 2) {
    throw new Error(
      `measureAll: ${tickers.length} holding is not a portfolio - a correlation, a closest `
      + 'pair and a share of risk all need at least 2',
    );
  }
  const { shock, fraction, benchmark } = stressRules(levels);
  const window = levels.window;

  // THE BENCHMARK IS IN THE WINDOW, not read beside it. Stress days are the worst
  // days of THIS window, so the benchmark has to be sliced to the same days as
  // the holdings - taking its own window and lining the two up by position is the
  // mistake js/returns.js exists to prevent.
  const needed = [...new Set([...tickers, ...basket, benchmark])];
  const slice = endDate === null
    ? gameWindow(game, needed, window.days)
    : windowEndingOn(game, needed, window.days, endDate);
  if (slice.days < window.minDays) {
    throw new Error(
      `${needed.join(', ')} overlap on only ${slice.days} trading days, fewer than the `
      + `${window.minDays} this game needs, so no measure would be trustworthy`,
    );
  }

  const matrix = windowMatrix(slice, tickers);
  const basketReturns = equalWeightBasket(slice.byTicker, basket);

  // The per-holding facts, from the same function the "Why?" cards read: the
  // dollar share beside the share of risk, the gap between them, the closest
  // pair, each group's share of the risk, effective bets, and the beta.
  const facts = whyFacts({
    tickers, weights, matrix, groups, basketReturns, basketMembers: basket,
  });

  const stressDays = stressDayIndices(slice.byTicker[benchmark], fraction);
  const betaAll = facts.basket.beta;
  const betaStress = betaOnDays(matrix, weights, basketReturns, stressDays);

  const value = tickers.reduce((sum, ticker) => sum + dollars[ticker], 0);
  const lossAll = stressTestLoss(value, betaAll, shock);
  const lossStress = stressTestLoss(value, betaStress, shock);

  return {
    tickers: [...tickers],
    weights: [...weights],
    dollars: { ...dollars },
    value,
    days: slice.days,
    startDate: slice.startDate,
    endDate: slice.endDate,

    /** Effective bets. Shown with BETS_NOTE beside it, always. */
    bets: facts.bets,
    /** Per holding: dollarShare, riskShare, the gap between them, and its group. */
    holdings: facts.holdings,
    /** The closest pair the portfolio holds, and the risk the two carry between them. */
    pair: facts.pair,
    /** Each group's share of the money and of the risk, biggest risk first. */
    groups: facts.groups,
    /** The whole pairwise correlation matrix, in `tickers` order. */
    correlations: correlation(matrix),
    /** The biggest share of the risk any one holding carries. */
    maxRiskShare: facts.maxRiskShare,

    beta: {
      /** Beta to the AI basket over every day in the window. */
      allDays: betaAll,
      /** The same beta over market stress days only. */
      stressDays: betaStress,
      /** Which holding contributed what, in beta units. See js/math.js. */
      holdings: facts.basket.holdings,
      members: [...basket],
    },

    stress: {
      benchmark,
      fraction,
      /** Day indices into the window, ascending. */
      days: stressDays,
      count: stressDays.length,
      /** The dates themselves, so a screen can say which days these were. */
      dates: stressDays.map((day) => slice.dates[day]),
    },

    loss: {
      shock,
      value,
      atAllDays: lossAll,
      atStressDays: lossStress,
      // THE RANGE IS THE POINT, not either number on its own: docs/PRD.md puts
      // "stress estimates are noisy and look backward" among the things the game
      // has to be honest about, and answers it with "a beta range is shown, not
      // one number". Ordered by size of loss so a screen can print "between X
      // and Y" without working out which way round they came.
      worst: Math.min(lossAll, lossStress),
      mildest: Math.max(lossAll, lossStress),
    },

    /** The covariance matrix is NOT returned: 756 x N numbers no screen reads. */
  };
}
