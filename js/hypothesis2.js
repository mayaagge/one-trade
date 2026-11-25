// One Trade - Hypothesis 2: a tightening market.
//
// THE CLAIM, from PREREG.md: "AI stocks move more closely with the broad market
// now than they did before the AI trade." Supported if the recent 12 months'
// correlation is more than 0.10 above the earliest 12 months', AND the lower end
// of a 90% interval for that difference is above 0.
//
// The windows, restated by PREREG_AMENDMENT.md from the freeze date of
// 24 November 2026:
//   full window      24 November 2016 to 24 November 2026
//   earliest 12 mths 24 November 2016 to 23 November 2017
//   recent 12 mths   25 November 2025 to 24 November 2026
// Choosing those dates is the data step's job. This file takes the two windows
// already sliced, so it never needs a calendar and never fetches anything.
//
// Educational, not investment advice.

import { makeRng, SEED } from './rng.js';
import { correlation } from './math.js';

// --- values fixed at pre-registration ---------------------------------------

/** "a block bootstrap with 20-day blocks and 2,000 resamples". */
export const BLOCK_DAYS = 20;
export const RESAMPLES = 2000;

/** "a 90% interval for the difference". */
export const INTERVAL_LEVEL = 0.90;

/** "the recent correlation is more than 0.10 higher than the earliest". */
export const CORRELATION_RISE = 0.10;

/**
 * Not in PREREG.md, which defines "not enough data" for Hypothesis 3 only.
 * Recorded as decision 2 in BUILD_LOG.md: a 12-month window needs 200 trading
 * days (a full year is about 252), and an equal-weight basket needs at least
 * two names to be a basket at all.
 */
export const MIN_WINDOW_DAYS = 200;
export const MIN_FULL_HISTORY_NAMES = 2;

/**
 * "the rolling 126-day correlation over the full 10 years" - about six months of
 * trading days. Reported only; it enters no verdict.
 */
export const ROLLING_WINDOW = 126;

/**
 * "with 30 November 2022 (ChatGPT's release) marked as a reference date only".
 *
 * A MARKER AND NOTHING MORE. It splits no window, starts no test and enters no
 * verdict. The registered windows are the earliest and most recent 12 months,
 * and they were fixed from the freeze date before any price existed; choosing a
 * window around this date after seeing the rolling series is exactly what
 * pre-registration rules out.
 */
export const CHATGPT_RELEASE = '2022-11-30';

// --- the equal-weight basket -------------------------------------------------

/**
 * The equal-weight AI basket: the plain average of its members' daily returns,
 * one day at a time.
 *
 * REBALANCED DAILY, and that is a real choice. Averaging daily returns is the
 * same as selling a little of whatever rose and buying a little of whatever fell
 * at every close, so the weights go back to equal each day. The alternative -
 * buying equal dollar amounts once at the start and leaving them - would let the
 * winners grow into most of the basket, which over ten years of NVDA would make
 * the "basket" mostly one stock, and its correlation with the market would then
 * be measuring NVDA. PREREG.md says "AI basket: equal weight", and daily
 * rebalancing is the reading that keeps it equal weight throughout.
 */
export function equalWeightBasket(returnsByTicker, tickers) {
  if (!Array.isArray(tickers) || tickers.length === 0) {
    throw new Error('equalWeightBasket: expected at least one ticker');
  }
  const series = tickers.map((ticker) => {
    const values = returnsByTicker[ticker];
    if (!Array.isArray(values)) throw new Error(`equalWeightBasket: no returns for ${ticker}`);
    return values;
  });
  const days = series[0].length;
  for (const [i, values] of series.entries()) {
    if (values.length !== days) {
      throw new Error(
        `equalWeightBasket: every member needs the same number of days; `
        + `${tickers[0]} has ${days} and ${tickers[i]} has ${values.length}`,
      );
    }
  }
  return Array.from({ length: days }, (_, t) => {
    let sum = 0;
    for (const values of series) sum += values[t];
    return sum / series.length;
  });
}

/**
 * The growing basket: the equal-weight average of the members that have LISTED
 * by each day.
 *
 * PREREG.md, Hypothesis 2 step 2: the verdict's basket holds only the members
 * with the full 10 years of history, and "a second version that adds names as
 * they list is reported beside it". This is that second version. It carries no
 * verdict.
 *
 * WHY IT IS REPORTED AT ALL. The full-history rule drops VRT and PLTR, the two
 * newest names, and dropping the newest names from a question about a new trade
 * is a real limitation - weakness 4 in the PRD, hindsight in the AI basket. The
 * growing version keeps them from the day they list, so a reader can see whether
 * the answer depends on leaving them out.
 *
 * A member that has not listed yet arrives as null and is LEFT OUT of that day's
 * average. It is not counted as a zero return: a flat day is a real market
 * observation and would pull the basket towards zero, weakening the very
 * correlation being measured. A null in the middle of a member's history is a
 * fault rather than a late listing - js/returns.js refuses those outright - so
 * it is refused here too rather than quietly skipped.
 */
export function growingBasket(returnsByTicker, tickers) {
  if (!Array.isArray(tickers) || tickers.length === 0) {
    throw new Error('growingBasket: expected at least one ticker');
  }
  const series = tickers.map((ticker) => {
    const values = returnsByTicker[ticker];
    if (!Array.isArray(values)) throw new Error(`growingBasket: no returns for ${ticker}`);
    return values;
  });
  const days = series[0].length;
  for (const [i, values] of series.entries()) {
    if (values.length !== days) {
      throw new Error(
        'growingBasket: every member needs the same number of days; '
        + `${tickers[0]} has ${days} and ${tickers[i]} has ${values.length}`,
      );
    }
  }
  // A member may be null only at the START of the window, before it listed.
  for (const [i, values] of series.entries()) {
    let listed = false;
    for (let t = 0; t < days; t += 1) {
      if (values[t] === null || values[t] === undefined) {
        if (listed) {
          throw new Error(
            `growingBasket: ${tickers[i]} has a gap at day ${t}, after it had already listed. `
            + 'A missing interior day is a fault in the snapshot, not a late listing, and is not '
            + 'skipped. js/returns.js refuses these when the returns are built.',
          );
        }
      } else {
        listed = true;
      }
    }
  }
  return Array.from({ length: days }, (_, t) => {
    let sum = 0;
    let count = 0;
    for (const values of series) {
      const value = values[t];
      if (value !== null && value !== undefined) { sum += value; count += 1; }
    }
    if (count === 0) {
      throw new Error(
        `growingBasket: no member had listed by day ${t}, so there is nothing to average. `
        + 'Returning 0 would invent a flat market day.',
      );
    }
    return sum / count;
  });
}

// --- correlation -------------------------------------------------------------

/** Pearson correlation of two equal-length daily return series. */
export function pairCorrelation(a, b) {
  if (a.length !== b.length) {
    throw new Error(`pairCorrelation: ${a.length} days against ${b.length} days`);
  }
  const paired = Array.from({ length: a.length }, (_, t) => [a[t], b[t]]);
  return correlation(paired)[0][1];
}

/**
 * The rolling correlation of two daily return series.
 *
 * PREREG.md asks for it over the full 10 years, 126 days at a time, "with
 * 30 November 2022 (ChatGPT's release) marked as a reference date only".
 *
 * EACH VALUE IS LABELLED WITH THE LAST DAY OF ITS WINDOW. So a point dated
 * 30 November 2022 is the correlation over the 126 trading days ENDING that day,
 * not starting it, and the first value a 10-year series can have is dated 126
 * trading days in. The page has to say which, or a marked date means nothing.
 *
 * REPORTED ONLY. No verdict reads this, and no window boundary comes from it.
 *
 * @param {number[]} a one series, oldest day first
 * @param {number[]} b the other, the same days
 * @param {number} options.window 126 for anything published
 * @param {string[]} options.dates one date per day of a and b
 * @param {string} options.mark a date to mark, for reference only
 */
export function rollingCorrelation(a, b, { window = ROLLING_WINDOW, dates = null, mark = null } = {}) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    throw new Error('rollingCorrelation: expected two arrays of daily returns');
  }
  if (a.length !== b.length) {
    throw new Error(`rollingCorrelation: ${a.length} days against ${b.length} days`);
  }
  if (!Number.isInteger(window) || window < 2) {
    throw new Error(`rollingCorrelation: a window of ${window} days is not usable`);
  }
  if (a.length < window) {
    throw new Error(
      `rollingCorrelation: ${a.length} days cannot fill a ${window}-day window`,
    );
  }
  if (dates !== null && dates.length !== a.length) {
    throw new Error(
      `rollingCorrelation: ${dates.length} dates for ${a.length} days; they must match`,
    );
  }

  const count = a.length - window + 1;
  const values = new Array(count);
  for (let i = 0; i < count; i += 1) {
    values[i] = pairCorrelation(a.slice(i, i + window), b.slice(i, i + window));
  }
  // The window's last day, which is why the series starts window-1 days in.
  const labels = dates === null ? null : dates.slice(window - 1);

  const series = {
    window,
    values,
    dates: labels,
    labelledBy: 'the last day of each window',
    disclaimer: 'Educational, not investment advice.',
  };
  if (mark === null) return series;

  if (labels === null) {
    throw new Error('rollingCorrelation: a date can only be marked when dates are given');
  }
  // The marker attaches to the first window ENDING on or after the marked date,
  // so a date that is not itself a trading day still lands somewhere sensible.
  //
  // Two cases get no marker at all, and say so rather than sliding quietly to an
  // end of the series: a date before the first full window, where no window ends
  // near it, and a date after the last one. Putting the marker at labels[0]
  // regardless would label a window ending in 2017 with a date in 2022.
  const index = labels.findIndex((date) => date >= mark);
  const beforeFirst = mark < labels[0];
  const inSeries = index !== -1 && !beforeFirst;
  let note;
  if (inSeries) {
    note = `${mark} is marked as a reference date only, on the ${window}-day window ending `
      + `${labels[index]}. It splits no window and enters no verdict.`;
  } else if (beforeFirst) {
    note = `${mark} falls before the first full ${window}-day window, which ends ${labels[0]}, `
      + 'so there is no rolling value to mark there.';
  } else {
    note = `${mark} falls after the last ${window}-day window, which ends `
      + `${labels[labels.length - 1]}, so there is no rolling value to mark there.`;
  }
  series.mark = {
    requested: mark,
    date: inSeries ? labels[index] : null,
    index: inSeries ? index : null,
    value: inSeries ? values[index] : null,
    inSeries,
    note,
  };
  return series;
}

// --- the block bootstrap -----------------------------------------------------

/**
 * Day numbers for one block-bootstrap resample of a window.
 *
 * WHY BLOCKS, in plain language: an ordinary bootstrap draws single days at
 * random, which quietly assumes each day is unrelated to the one before it.
 * Markets are not like that - calm and turbulent days arrive in runs, and
 * correlations rise together during those runs. Drawing 20 days at a time keeps
 * each run intact, so the interval is not falsely narrow.
 *
 * Block starts run from 0 to days - 20 inclusive, so every block is a full 20
 * days taken from inside the window: none is short and none runs off the end.
 * Blocks overlap, which is the standard moving-block bootstrap (Kunsch 1989).
 * Enough blocks are glued together to cover the window, and the result is then
 * trimmed to exactly the window's length.
 */
export function blockIndices(rng, days, blockDays = BLOCK_DAYS) {
  if (!Number.isInteger(days) || days < blockDays) {
    throw new Error(`blockIndices: a window of ${days} days cannot hold a ${blockDays}-day block`);
  }
  const possibleStarts = days - blockDays + 1;
  const blocks = Math.ceil(days / blockDays);
  const indices = [];
  for (let block = 0; block < blocks; block += 1) {
    const start = rng.int(possibleStarts);
    for (let i = 0; i < blockDays; i += 1) indices.push(start + i);
  }
  return indices.slice(0, days);
}

/** Correlation of one window's two series, read off the given day numbers. */
function correlationOnDays(window, indices) {
  const a = indices.map((t) => window.basket[t]);
  const b = indices.map((t) => window.benchmark[t]);
  return pairCorrelation(a, b);
}

/**
 * The bootstrap itself: 2,000 resampled values of (recent correlation minus
 * earliest correlation).
 *
 * Two details that matter:
 *   - Within a window, the basket and the benchmark are read off the SAME day
 *     numbers. Resampling them separately would break the very relationship
 *     being measured and push every resample towards zero.
 *   - The two windows are resampled independently of each other. They are nine
 *     years apart, so there is no run of days to preserve between them.
 */
export function bootstrapDifferences({
  early,
  recent,
  rng = makeRng(SEED),
  resamples = RESAMPLES,
  blockDays = BLOCK_DAYS,
}) {
  const differences = new Array(resamples);
  for (let i = 0; i < resamples; i += 1) {
    const earlyDays = blockIndices(rng, early.basket.length, blockDays);
    const recentDays = blockIndices(rng, recent.basket.length, blockDays);
    differences[i] = correlationOnDays(recent, recentDays) - correlationOnDays(early, earlyDays);
  }
  return differences;
}

// --- the interval -------------------------------------------------------------

/**
 * The value below which the given share of the list falls, interpolating
 * between neighbours. This is numpy's default percentile method ("linear"), so
 * the browser and any numpy check agree.
 */
export function percentile(values, level) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('percentile: expected at least one value');
  }
  if (!(level >= 0 && level <= 1)) {
    throw new Error(`percentile: the level must be between 0 and 1, got ${level}`);
  }
  const sorted = [...values].sort((a, b) => a - b);     // a copy: never reorder the caller's list
  const position = level * (sorted.length - 1);
  const below = Math.floor(position);
  const above = Math.ceil(position);
  if (below === above) return sorted[below];
  return sorted[below] + (position - below) * (sorted[above] - sorted[below]);
}

/** A two-sided interval: for 90%, the 5th and 95th percentiles. */
export function percentileInterval(values, level = INTERVAL_LEVEL) {
  const tail = (1 - level) / 2;
  return {
    level,
    lower: percentile(values, tail),
    upper: percentile(values, 1 - tail),
  };
}

// --- the verdict ----------------------------------------------------------------

/**
 * The registered rule: supported if the rise is MORE than 0.10 and the lower end
 * of the interval is ABOVE 0. Both are strict, so a rise of exactly 0.10 or a
 * lower end of exactly 0 is not supported.
 */
export function verdictFor({
  difference,
  lower,
  earlyDays,
  recentDays,
  fullHistoryNames,
  minWindowDays = MIN_WINDOW_DAYS,
  minNames = MIN_FULL_HISTORY_NAMES,
}) {
  if (earlyDays < minWindowDays || recentDays < minWindowDays) return 'not enough data';
  if (fullHistoryNames < minNames) return 'not enough data';
  if (!Number.isFinite(difference) || !Number.isFinite(lower)) {
    throw new Error(`verdictFor: need a difference and a lower end, got ${difference} and ${lower}`);
  }
  return difference > CORRELATION_RISE && lower > 0 ? 'supported' : 'not supported';
}

// --- the whole hypothesis ---------------------------------------------------------

/**
 * Run Hypothesis 2 end to end.
 *
 * @param {object} options
 * @param {{basket: number[], benchmark: number[]}} options.early earliest 12 months
 * @param {{basket: number[], benchmark: number[]}} options.recent recent 12 months
 * @param {number} options.fullHistoryNames basket members with the full 10 years
 * @param {number} options.seed 2026 for any published run
 */
export function hypothesis2({
  early,
  recent,
  fullHistoryNames,
  seed = SEED,
  resamples = RESAMPLES,
  blockDays = BLOCK_DAYS,
}) {
  const earlyDays = early.basket.length;
  const recentDays = recent.basket.length;

  const earlyCorrelation = pairCorrelation(early.basket, early.benchmark);
  const recentCorrelation = pairCorrelation(recent.basket, recent.benchmark);
  const difference = recentCorrelation - earlyCorrelation;

  const base = {
    seed,
    blockDays,
    resamples,
    earlyDays,
    recentDays,
    fullHistoryNames,
    minWindowDays: MIN_WINDOW_DAYS,
    rise: CORRELATION_RISE,
    earlyCorrelation,
    recentCorrelation,
    difference,
    disclaimer: 'Educational, not investment advice.',
  };

  const shortWindow = earlyDays < MIN_WINDOW_DAYS || recentDays < MIN_WINDOW_DAYS;
  if (shortWindow || fullHistoryNames < MIN_FULL_HISTORY_NAMES) {
    return {
      ...base,
      verdict: 'not enough data',
      interval: null,
      note: shortWindow
        ? `A 12-month window needs ${MIN_WINDOW_DAYS} trading days; got ${earlyDays} and ${recentDays}.`
        : `An equal-weight basket needs at least ${MIN_FULL_HISTORY_NAMES} names with full history.`,
    };
  }

  const interval = percentileInterval(
    bootstrapDifferences({ early, recent, rng: makeRng(seed), resamples, blockDays }),
    INTERVAL_LEVEL,
  );

  return {
    ...base,
    interval,
    verdict: verdictFor({
      difference, lower: interval.lower, earlyDays, recentDays, fullHistoryNames,
    }),
  };
}
