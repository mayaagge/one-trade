// One Trade - Hypothesis 1: hidden concentration.
//
// THE CLAIM, from PREREG.md: "a beginner who combines a broad index fund, a tech
// fund and individual AI stocks has far fewer independent sources of risk than
// holdings." Supported if the beginner set's median ratio of effective risk
// sources to holdings is below 0.60.
//
// Every number below is fixed in PREREG.md and must not be tuned: 500
// portfolios per set, 3 to 8 holdings, flat Dirichlet weights, seed 2026,
// threshold 0.60.
//
// Nothing here fetches anything. Returns come in as a plain object of
// ticker -> array of daily returns, oldest day first.
//
// Educational, not investment advice.

import { makeRng, SEED } from './rng.js';
import { covariance, effectiveBets } from './math.js';

// --- values fixed at pre-registration ---------------------------------------

/** Portfolios in each set. PREREG.md: "500 portfolios of 3 to 8 holdings". */
export const PORTFOLIO_COUNT = 500;
export const MIN_HOLDINGS = 3;
export const MAX_HOLDINGS = 8;

/** Supported if the beginner set's median ratio is below this. */
export const MEDIAN_THRESHOLD = 0.60;

/**
 * The covariance window: "3 years of daily returns ending on the freeze date".
 * The PRD puts that at 756 trading days, and sets 252 as the floor below which
 * there is not enough data. The 252 floor is NOT in PREREG.md - it is carried
 * over from the PRD's "How the numbers work" section and is recorded as
 * decision 2 in BUILD_LOG.md.
 */
export const WINDOW_DAYS = 756;
export const MIN_DAYS = 252;

/** The 6 preset funds, in the order PREREG.md lists them. */
export const PRESET_FUNDS = ['VOO', 'QQQ', 'VTI', 'VXUS', 'BND', 'GLD'];

/** A beginner portfolio must hold at least one of these. */
export const BROAD_FUNDS = ['VOO', 'VTI'];

/** One per non-technology group, so the control spreads across industries. */
export const NON_AI_STOCKS = ['JPM', 'JNJ', 'PG'];

/**
 * The control pool: "VTI, VXUS, BND, GLD and the 3 non-AI stocks". Seven names,
 * and no AI stock, no QQQ and no VOO among them.
 */
export const CONTROL_POOL = ['VTI', 'VXUS', 'BND', 'GLD', ...NON_AI_STOCKS];

/** Give up rather than spin forever if a condition can never be met. */
const MAX_DRAW_ATTEMPTS = 10000;

// --- the universe and the beginner conditions -------------------------------

/**
 * The beginner universe: the 6 preset funds, the AI basket and the 3 non-AI
 * stocks. 22 names with the full basket; 21 during a leave-one-out rerun.
 */
export function beginnerPool(basket) {
  if (!Array.isArray(basket) || basket.length === 0) {
    throw new Error('beginnerPool: expected the AI basket as an array of tickers');
  }
  return [...PRESET_FUNDS, ...basket, ...NON_AI_STOCKS];
}

/**
 * PREREG.md's two conditions: "Each holds at least one broad fund (VOO or VTI)
 * and at least one of QQQ or an AI stock."
 *
 * The basket is passed in rather than read from basket.json, so that a
 * leave-one-out rerun which drops MU also stops counting MU as an AI stock.
 */
export function isBeginnerPortfolio(tickers, basket) {
  const held = new Set(tickers);
  const hasBroadFund = BROAD_FUNDS.some((ticker) => held.has(ticker));
  const hasTechOrAi = held.has('QQQ') || basket.some((ticker) => held.has(ticker));
  return hasBroadFund && hasTechOrAi;
}

// --- the sampler ------------------------------------------------------------

/**
 * Draw one portfolio of a GIVEN size, redrawing the names until it satisfies
 * isValid.
 *
 * The size is handed in and never changed. That matters: if a rejected draw
 * also redrew the size, small portfolios - which are the hardest to fit a broad
 * fund and a tech holding into - would be quietly under-represented, and the
 * registered "3 to 8" would no longer be uniform. Rejecting only the names
 * keeps the result uniform over the portfolios PREREG.md describes.
 */
export function samplePortfolio(rng, pool, size, isValid = () => true) {
  if (size > pool.length) {
    throw new Error(`samplePortfolio: asked for ${size} holdings from a pool of ${pool.length}`);
  }
  for (let attempt = 0; attempt < MAX_DRAW_ATTEMPTS; attempt += 1) {
    const tickers = rng.pick(pool, size);
    if (isValid(tickers)) return tickers;
  }
  throw new Error(
    `samplePortfolio: no portfolio of ${size} holdings met the conditions in `
    + `${MAX_DRAW_ATTEMPTS} draws, so the conditions cannot be met from this pool`,
  );
}

/**
 * Draw a whole set of portfolios: a size first, then the names, then the dollar
 * weights from a flat Dirichlet.
 *
 * The size is capped at the pool's length. PREREG.md registers 3 to 8 holdings
 * for both sets, but the control pool holds only 7 names, so 8 is impossible
 * there. Capping keeps the registered draw and resolves the one value the pool
 * cannot supply; it makes 7 holdings about twice as likely as the other sizes
 * in the control set. Recorded as decision 1 in BUILD_LOG.md.
 */
export function sampleSet({
  rng,
  pool,
  count = PORTFOLIO_COUNT,
  isValid = () => true,
  minSize = MIN_HOLDINGS,
  maxSize = MAX_HOLDINGS,
}) {
  if (!Array.isArray(pool) || pool.length < minSize) {
    throw new Error(`sampleSet: the pool needs at least ${minSize} names`);
  }
  const sizes = maxSize - minSize + 1;
  const portfolios = [];
  for (let i = 0; i < count; i += 1) {
    const drawn = minSize + rng.int(sizes);
    const size = Math.min(drawn, pool.length);
    const tickers = samplePortfolio(rng, pool, size, isValid);
    portfolios.push({ tickers, weights: rng.dirichletFlat(size) });
  }
  return portfolios;
}

// --- the measure -------------------------------------------------------------

/**
 * Line up a portfolio's holdings on their overlapping days, most recent first
 * in the window. The PRD: "Holdings with less history use their overlapping
 * days, with a minimum of 252." So the window is the shortest history among the
 * holdings, capped at 756 days, taken from the end of each series.
 */
function alignReturns(tickers, returnsByTicker) {
  const series = tickers.map((ticker) => {
    const values = returnsByTicker[ticker];
    if (!Array.isArray(values)) {
      throw new Error(`alignReturns: no returns for ${ticker}`);
    }
    return values;
  });
  const days = Math.min(WINDOW_DAYS, ...series.map((values) => values.length));
  const windows = series.map((values) => values.slice(values.length - days));
  // One row per day, one column per holding, as js/math.js expects.
  return Array.from({ length: days }, (_, t) => windows.map((values) => values[t]));
}

/**
 * The ratio PREREG.md tests: effective risk sources divided by holdings.
 * 1 means every holding is its own independent source of risk; 1/N means they
 * are all really the same bet.
 */
export function portfolioRatio(portfolio, returnsByTicker) {
  const { tickers, weights } = portfolio;
  const aligned = alignReturns(tickers, returnsByTicker);
  return effectiveBets(weights, covariance(aligned)) / tickers.length;
}

// --- summarising and the verdict ---------------------------------------------

/** The middle value, or the average of the two middle values of an even count. */
export function median(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('median: expected at least one value');
  }
  const sorted = [...values].sort((a, b) => a - b);     // a copy: never reorder the caller's list
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Everything PREREG.md asks to be reported for a set: the median ratio, the
 * share of portfolios below the threshold, and the full distribution.
 */
export function summarise(ratios, threshold = MEDIAN_THRESHOLD) {
  return {
    count: ratios.length,
    median: median(ratios),
    shareBelowThreshold: ratios.filter((ratio) => ratio < threshold).length / ratios.length,
    ratios,
  };
}

/**
 * The registered rule: supported if the beginner median is below 0.60. Too
 * little history outranks it, whatever the median says.
 */
export function verdictFor({ median: medianRatio, days, minDays = MIN_DAYS }) {
  if (!Number.isFinite(medianRatio)) {
    throw new Error(`verdictFor: the median must be a number, got ${medianRatio}`);
  }
  if (days < minDays) return 'not enough data';
  return medianRatio < MEDIAN_THRESHOLD ? 'supported' : 'not supported';
}

// --- the whole hypothesis -----------------------------------------------------

/**
 * Run Hypothesis 1 end to end and return everything the Research page reports.
 *
 * @param {object} options
 * @param {object} options.returnsByTicker ticker -> daily returns, oldest first
 * @param {string[]} options.basket the AI basket for this run
 * @param {number} options.seed 2026 for any published run
 */
export function hypothesis1({ returnsByTicker, basket, seed = SEED }) {
  const pool = beginnerPool(basket);
  const needed = [...new Set([...pool, ...CONTROL_POOL])];
  for (const ticker of needed) {
    if (!Array.isArray(returnsByTicker[ticker])) {
      throw new Error(`hypothesis1: no returns for ${ticker}`);
    }
  }
  const days = Math.min(WINDOW_DAYS, ...needed.map((ticker) => returnsByTicker[ticker].length));

  const base = {
    seed,
    days,
    minDays: MIN_DAYS,
    threshold: MEDIAN_THRESHOLD,
    disclaimer: 'Educational, not investment advice.',
  };

  if (days < MIN_DAYS) {
    return {
      ...base,
      verdict: 'not enough data',
      beginner: null,
      control: null,
      note: `Only ${days} overlapping trading days; ${MIN_DAYS} are needed.`,
    };
  }

  // One generator, used for the beginner set and then the control set, so the
  // whole run is one reproducible stream from seed 2026.
  const rng = makeRng(seed);

  const beginnerSet = sampleSet({
    rng,
    pool,
    isValid: (tickers) => isBeginnerPortfolio(tickers, basket),
  });
  const controlSet = sampleSet({ rng, pool: CONTROL_POOL });

  const beginner = summarise(beginnerSet.map((p) => portfolioRatio(p, returnsByTicker)));
  const control = summarise(controlSet.map((p) => portfolioRatio(p, returnsByTicker)));

  return {
    ...base,
    verdict: verdictFor({ median: beginner.median, days, minDays: MIN_DAYS }),
    beginner,
    control,
  };
}
