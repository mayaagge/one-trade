// js/crash.js - Crash replay: a pretend portfolio through a real crash.
//
// docs/PRD.md, Game modes: "Watch a pretend portfolio through the 2020 crash,
// the 2022 bear market or the January 2025 AI selloff, next to the S&P 500."
// This file is the arithmetic and the window rules, with no DOM in it; the
// screens are Crash replay's own view, and the prices come from
// data/crashes.json through readWindow() below.
//
// TWO CONVENTIONS ARE FIXED IN docs/PRD.md, and both change the headline number,
// so they are stated here too rather than left to be read off the code:
//
//   1. A REPLAY STARTS AT A CLOSE, NOT AT A RETURN. The research windows in the
//      hypotheses are windows of returns; a replay is a line that starts at the
//      first date's closing price and applies the returns after it. So a path has
//      one more point than it has returns, the first being the money as it went
//      in. Counting the first day's own move as well would make the 2020 crash
//      read -33.6% against the -33.9% that is the published figure.
//
//   2. A PORTFOLIO IS BOUGHT AND HELD, NEVER REBALANCED. Each holding's dollars
//      grow on their own and the portfolio is their sum, because that is what
//      holding a portfolio through a crash does. Rebalancing to the starting
//      weights every close - which is what portfolioReturns() in js/math.js does,
//      and the right thing for the research basket - is a different measure and a
//      different answer: in the 2022 window it turns a spread portfolio's +2.03%
//      into -0.24%. tests/math.test.js carries both numbers for a hand-worked
//      case so the difference is recorded rather than described.
//
// THE S&P 500 LINE IS VOO, labelled "S&P 500 (VOO, with dividends)". Both lines
// then include dividends and the comparison is like for like; the index itself
// pays none. data/crashes.json names the ticker and the label, so the chart does
// not decide what it is drawing.
//
// Educational, not investment advice.

import { gameDates, tickerSeries } from './gameView.js';
import { DOLLAR_STEP, evenSplit } from './round.js';

export const CRASHES_URL = 'data/crashes.json';
export const DISCLAIMER = 'Educational, not investment advice.';

/** The pretend money a replay starts with, as everywhere else in the game. */
export const STARTING_DOLLARS = 10000;

// ------------------------------------------------------------------ paths

/**
 * What one holding is worth after each day, starting from `start`.
 *
 * The path is one point longer than `returns`: the first point is the money as it
 * went in, at the window's opening close.
 */
export function valuePath(start, returns) {
  if (!Number.isFinite(start) || start <= 0) throw new Error('valuePath: nothing was invested');
  if (!Array.isArray(returns)) throw new Error('valuePath: expected a list of returns');
  const path = [start];
  for (const [i, r] of returns.entries()) {
    if (!Number.isFinite(r)) throw new Error(`valuePath: day ${i} has no return`);
    path.push(path[path.length - 1] * (1 + r));
  }
  return path;
}

/**
 * A portfolio held through a window and never rebalanced.
 *
 * @param {number[]} dollars what went into each holding
 * @param {number[][]} returns one row per day, one column per holding
 */
export function buyAndHoldPath(dollars, returns) {
  if (!Array.isArray(dollars) || dollars.length === 0) throw new Error('buyAndHoldPath: no holdings');
  if (!Array.isArray(returns)) throw new Error('buyAndHoldPath: expected a matrix of returns');
  const held = Array.from(dollars, Number);
  if (held.some((d) => !Number.isFinite(d) || d < 0)) {
    throw new Error('buyAndHoldPath: every holding needs an amount of money');
  }
  const sum = (list) => list.reduce((total, value) => total + value, 0);
  const path = [sum(held)];
  if (!(path[0] > 0)) throw new Error('buyAndHoldPath: nothing was invested');

  for (const [day, row] of returns.entries()) {
    if (!Array.isArray(row) || row.length !== held.length) {
      throw new Error(`buyAndHoldPath: day ${day} has ${row?.length} holdings, expected ${held.length}`);
    }
    for (let i = 0; i < held.length; i += 1) {
      if (!Number.isFinite(row[i])) throw new Error(`buyAndHoldPath: day ${day} has no return for holding ${i}`);
      held[i] *= 1 + row[i];
    }
    path.push(sum(held));
  }
  return path;
}

/** End over start, as a fraction: -0.339 is a fall of 33.9%. */
export function totalChange(path) {
  if (!Array.isArray(path) || path.length < 2) throw new Error('totalChange: a path needs two points');
  return path[path.length - 1] / path[0] - 1;
}

/**
 * The lowest point the path reached, against where it started.
 *
 * NOT a peak-to-trough drawdown. A replay window starts at the peak by
 * construction - 19 February 2020 is the S&P 500's own high - so the question a
 * player is asking is how far below their starting money it ever went. In a
 * window that dips and recovers the two differ, and tests/math.test.js has that
 * case: it fell 30% at the bottom and ended 7.6% down.
 */
export function deepestFall(path) {
  if (!Array.isArray(path) || path.length < 2) throw new Error('deepestFall: a path needs two points');
  return Math.min(...path) / path[0] - 1;
}

// ----------------------------------------------------------- the windows

/** Check a crashes file over before any screen reads it. */
export function validateCrashes(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('crashes.json: expected an object');
  if (!doc.meta || typeof doc.meta.indexTicker !== 'string' || typeof doc.meta.indexLabel !== 'string') {
    throw new Error('crashes.json: meta.indexTicker and meta.indexLabel are missing, so no chart could say what it draws');
  }
  if (!Array.isArray(doc.windows) || doc.windows.length === 0) {
    throw new Error('crashes.json: a non-empty windows list is missing');
  }
  const keys = new Set();
  for (const window of doc.windows) {
    const where = `crashes.json window ${window.key ?? '(unnamed)'}`;
    // `inSentence` is the title as one clause of a longer sentence - "in the 2022
    // bear market it moved -29%" - and is required, not optional: a card that
    // fell back to the heading form would read "in The 2022 bear market", which
    // is the thing it exists to prevent.
    for (const field of ['key', 'title', 'inSentence', 'from', 'to', 'startDate']) {
      if (typeof window[field] !== 'string' || window[field].length === 0) {
        throw new Error(`${where}: ${field} is missing`);
      }
    }
    if (keys.has(window.key)) throw new Error(`crashes.json: duplicate window ${window.key}`);
    keys.add(window.key);
    if (!Array.isArray(window.tickers) || window.tickers.length === 0) {
      throw new Error(`${where}: it carries no tickers`);
    }
    if (!Array.isArray(window.rows) || window.rows.length === 0) {
      throw new Error(`${where}: it carries no rows`);
    }
    if (!window.tickers.includes(doc.meta.indexTicker)) {
      throw new Error(`${where}: it does not carry ${doc.meta.indexTicker}, which every replay draws`);
    }
    const width = window.tickers.length + 1;
    for (const [i, row] of window.rows.entries()) {
      if (!Array.isArray(row) || row.length !== width) {
        throw new Error(`${where}: row ${i} does not have a date and one return for each ticker`);
      }
    }
    // The opening close is the day BEFORE the first return, and the window's
    // own first date. A file that disagrees would draw the line in the wrong
    // place, which is the one thing the convention above exists to prevent.
    if (window.startDate !== window.from) {
      throw new Error(`${where}: startDate ${window.startDate} is not the window's own first date ${window.from}`);
    }
    if (window.rows[0][0] <= window.startDate) {
      throw new Error(`${where}: its first return is dated ${window.rows[0][0]}, which is not after the opening close`);
    }
    if (window.rows[window.rows.length - 1][0] !== window.to) {
      throw new Error(`${where}: its last return is dated ${window.rows[window.rows.length - 1][0]}, not ${window.to}`);
    }
  }
  return doc;
}

/** One window by key, or an error naming what was asked for. */
export function windowByKey(doc, key) {
  const window = doc.windows.find((w) => w.key === key);
  if (!window) throw new Error(`crashes.json has no window "${key}"`);
  return window;
}

/**
 * Can this holding be replayed through this window?
 *
 * PLTR listed in September 2020, so it cannot be held through the February 2020
 * crash. A holding with no prices is refused rather than drawn as a flat line or
 * counted as a zero return - the same rule js/returns.js applies to a gap.
 */
export function unavailableIn(window, ticker) {
  const missing = (window.unavailable ?? []).find((entry) => entry.ticker === ticker);
  return missing ?? null;
}

/** The tickers a player may hold through this window. */
export function availableIn(window, universe) {
  return universe.filter((ticker) => window.tickers.includes(ticker) && !unavailableIn(window, ticker));
}

// ------------------------------------------------------------ the replay

/**
 * One window's returns for a set of holdings, as a matrix of days by holding,
 * plus the dates of the path's points.
 *
 * The dates are the opening close followed by each row's date, so they line up
 * with a path one by one.
 */
export function readWindow(window, tickers) {
  if (!Array.isArray(tickers) || tickers.length === 0) throw new Error('readWindow: no holdings');
  for (const ticker of tickers) {
    const missing = unavailableIn(window, ticker);
    if (missing) {
      throw new Error(
        `${ticker} has no prices in ${window.inSentence}: the snapshot's first day for it is ${missing.firstDate}`,
      );
    }
  }
  const series = Object.fromEntries(tickers.map((ticker) => [ticker, tickerSeries(window, ticker)]));
  const days = window.rows.length;
  const matrix = Array.from({ length: days }, (_, day) => tickers.map((ticker) => {
    const value = series[ticker][day];
    if (!Number.isFinite(value)) {
      throw new Error(`${ticker} has no return on ${window.rows[day][0]}, inside ${window.inSentence}`);
    }
    return value;
  }));
  return { matrix, dates: [window.startDate, ...gameDates(window)] };
}

/**
 * A whole replay: the portfolio's line, the index's line beside it, and the
 * numbers under them.
 *
 * Both lines start at the same money, so they can be read against each other
 * directly, and both are drawn by the same arithmetic - the index is a portfolio
 * of one holding.
 *
 * @param {object} doc      data/crashes.json, validated
 * @param {string} key      which window
 * @param {object} dollars  ticker -> dollars, summing to the starting money
 */
export function replay(doc, key, dollars) {
  const window = windowByKey(doc, key);
  const tickers = Object.keys(dollars);
  if (tickers.length === 0) throw new Error('replay: the portfolio is empty');
  const amounts = tickers.map((ticker) => dollars[ticker]);
  const start = amounts.reduce((total, value) => total + value, 0);

  const { matrix, dates } = readWindow(window, tickers);
  const path = buyAndHoldPath(amounts, matrix);

  // What each holding did on its own, and what that was worth in dollars. The
  // dollars are the point: a holding's move does not say how much of the fall it
  // accounts for, and 20% of the money rising 14% matters more than 1% of it
  // doubling. `gain` is signed - positive is what cushioned the fall, negative is
  // what drove it - and the gains sum to the portfolio's own change in dollars.
  const holdings = tickers.map((ticker, i) => {
    const own = buyAndHoldPath([amounts[i]], matrix.map((day) => [day[i]]));
    const change = totalChange(own);
    return {
      ticker,
      dollars: amounts[i],
      dollarShare: amounts[i] / start,
      change,
      gain: own[own.length - 1] - own[0],
      end: own[own.length - 1],
    };
  });

  // The index, from the same window and the same starting money. It is read as a
  // portfolio of one holding so that both lines go through one code path.
  const indexTicker = doc.meta.indexTicker;
  const { matrix: indexMatrix } = readWindow(window, [indexTicker]);
  const indexPath = buyAndHoldPath([start], indexMatrix);

  return {
    window: {
      key: window.key,
      title: window.title,
      inSentence: window.inSentence,
      from: window.from,
      to: window.to,
      // The daily MOVES this replay applied, which is one per row.
      days: window.rows.length,
      // And the window's trading days, meaning its closes - the path below has
      // one point per close, so it is always one more. docs/PRD.md's crash table
      // counts these, and the screens label them, so it is carried rather than
      // recomputed from `days` at each label.
      tradingDays: window.rows.length + 1,
    },
    dates,
    tickers,
    dollars: { ...dollars },
    start,
    path,
    holdings,
    indexPath,
    indexTicker,
    indexLabel: doc.meta.indexLabel,
    change: totalChange(path),
    indexChange: totalChange(indexPath),
    deepest: deepestFall(path),
    indexDeepest: deepestFall(indexPath),
    end: path[path.length - 1],
    indexEnd: indexPath[indexPath.length - 1],
  };
}

/**
 * What one holding did in the file's OTHER windows, against the index there.
 *
 * The 2020 crash is not every crash, and a card that says "long Treasuries held
 * this portfolio up" is true of February 2020 and false of 2022, where TLT fell
 * 29.33% against the index's 24.52%. This is how a card can say so from the data
 * rather than from a sentence somebody typed: the same file, the same
 * bought-and-held arithmetic, the other windows.
 *
 * A window the holding cannot be replayed through is left out rather than
 * reported as a zero - PLTR in February 2020 is the case - so a caller gets only
 * windows where the comparison is real.
 */
export function elsewhereFor(doc, key, ticker, money = STARTING_DOLLARS) {
  return doc.windows
    .filter((window) => window.key !== key)
    .map((window) => {
      if (!window.tickers.includes(ticker) || unavailableIn(window, ticker)) return null;
      const held = replay(doc, window.key, { [ticker]: money });
      return {
        key: window.key,
        title: window.title,
        // What a card names it: this is always read mid-sentence.
        inSentence: window.inSentence,
        change: held.change,
        indexChange: held.indexChange,
      };
    })
    .filter((found) => found !== null);
}

/**
 * How a portfolio's fall compares with the index's, as the measure level 6 will
 * ask for: "fell less than half as much as the S&P 500".
 *
 * `share` is the portfolio's fall as a fraction of the index's. It is null when
 * the index did not fall at all, because a share of a rise is not a thing level 6
 * is asking about and 0.4 of a gain would read as if it were.
 */
export function fallAgainstIndex({ change, indexChange }) {
  if (!(indexChange < 0)) return { fell: change < 0, share: null, indexFell: false };
  return { fell: change < 0, share: change / indexChange, indexFell: true };
}

// --------------------------------------------------------------- the build

/**
 * A build for Crash replay: any number of a window's available holdings, split
 * evenly and nudged in $100 steps, same as js/round.js's round.
 *
 * It carries no `level`, no required holding and no floor - the PRD asks Crash
 * replay to build "a pretend portfolio" with no rule on what it holds, the way
 * Sandbox does. The shape is the one js/build.js's tickerPicker() and
 * allocator() already read - pool, picks, dollars, total, required, hasPick,
 * canAddPick, togglePick, adjustDollars, canLower, canRaise, buildComplete,
 * allocated - so the same build screen draws it.
 *
 * `pool` IS THE WHOLE GAME UNIVERSE, not just this window's own tickers. A
 * holding the window cannot replay - PLTR in the 2020 crash - still has to be
 * drawn, disabled, with a reason; a pool already narrowed to what is available
 * would make it vanish instead, which is a different thing from explaining it.
 * `isAvailable(ticker)` is the window's own rule, and togglePick() enforces it
 * the way js/round.js's round refuses to drop a required holding - at the build
 * layer, not only by the picker disabling a button. A bypassed disabled button
 * still cannot add an unavailable holding; a disabled button can only ever stop
 * a click, never a caller.
 */
export function createBuild(pool, {
  total = STARTING_DOLLARS, step = DOLLAR_STEP, isAvailable = () => true,
} = {}) {
  const build = {
    pool: [...pool],
    total,
    picks: [],
    dollars: {},
    // No holding is required and none carries a floor: every holding's least
    // share is the plain $100 step every build respects.
    required: [],
  };

  build.hasPick = (ticker) => build.picks.includes(ticker);
  build.canAddPick = () => true;

  build.togglePick = (ticker) => {
    if (!build.pool.includes(ticker)) throw new Error(`${ticker} is not in this game's universe`);
    if (!build.hasPick(ticker) && !isAvailable(ticker)) {
      throw new Error(`${ticker} is not available for this build`);
    }
    build.picks = build.hasPick(ticker)
      ? build.picks.filter((t) => t !== ticker)
      : [...build.picks, ticker];
    if (build.picks.length === 0) build.dollars = {};
    else build.evenSplit();
    return build;
  };

  build.allocated = () => build.picks.reduce((sum, t) => sum + (build.dollars[t] ?? 0), 0);

  build.buildComplete = () => build.picks.length > 0
    && build.allocated() === total
    && build.picks.every((t) => build.dollars[t] > 0);

  /** Every holding's floor is the plain $100 step - there are no required holdings to carry one of their own. */
  build.floorOf = () => step;

  /**
   * ONE SLIDER MOVES ONE HOLDING, exactly as js/round.js does it.
   *
   * The two allocators have to behave identically, because js/build.js draws one
   * screen for both and a player moving money in Sandbox should not find it
   * behaves differently from the same screen in a level. See the long note on
   * js/round.js's setDollars() for why the money is allocated rather than
   * divided, and what that did to the floor on a kind.
   *
   * There are no floors here beyond the plain step and no kind to protect, so
   * this is the same rule with the level-specific parts left out.
   */

  /** What has not been allocated yet. Zero when the build adds up. */
  build.moneyLeft = () => total - build.allocated();

  /** The most this holding could take: what it holds now plus what is unspent. */
  build.ceilingFor = (ticker) => (build.dollars[ticker] ?? 0) + build.moneyLeft();

  build.setDollars = (ticker, dollars, s = step) => {
    if (!build.hasPick(ticker)) throw new Error(`${ticker} is not in this portfolio`);
    if (!Number.isFinite(dollars)) throw new Error('setDollars: expected a number of dollars');
    const snapped = Math.round(dollars / s) * s;
    const next = Math.min(Math.max(snapped, build.floorOf(ticker)), build.ceilingFor(ticker));
    build.dollars[ticker] = next;
    return next;
  };

  build.canLower = (ticker, s = step) => build.hasPick(ticker)
    && (build.dollars[ticker] ?? 0) - s >= build.floorOf(ticker);

  build.canRaise = (ticker, s = step) => build.hasPick(ticker)
    && build.moneyLeft() >= s;

  /**
   * Move one holding by whole steps, within its own range. Returns how many
   * steps it actually moved, which is fewer than asked for when the money runs
   * out or the floor is reached.
   */
  build.adjustDollars = (ticker, steps, s = step) => {
    if (!Number.isInteger(steps)) throw new Error('adjustDollars: steps must be a whole number');
    const before = build.dollars[ticker] ?? 0;
    const after = build.setDollars(ticker, before + steps * s, s);
    return Math.abs(after - before) / s;
  };

  /** The split the build opens in, and the way back from an unhelpful one. */
  build.evenSplit = () => {
    if (build.picks.length > 0) build.dollars = evenSplit(build.picks, total, step);
    return build;
  };

  return build;
}

// ------------------------------------------------------------------ dates

// formatShortDate() now lives in js/format.js, the one place that formats a
// date for a player; re-exported here so every existing `from './crash.js'`
// import keeps working unchanged.
export { formatShortDate } from './format.js';

/** Read data/crashes.json. The caller handles the failure, as with game.json. */
export async function loadCrashes(url = CRASHES_URL) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return validateCrashes(await response.json());
}
