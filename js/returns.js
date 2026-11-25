// One Trade - the price snapshot turned into daily returns.
//
// WHAT THIS IS FOR. data/prices.json holds one list of dates and closes per
// ticker. Every measure in this project is computed from daily returns over a
// registered window, and three things can go quietly wrong between those two
// facts:
//
//   1. Two tickers can be lined up by POSITION rather than by DATE. Position
//      lines up only as long as every ticker traded on exactly the same days.
//      Here everything is lined up by date, and a date is never assumed.
//   2. A missing day in the middle of a series turns one day's return into two
//      days' worth, which inflates that day's move and dents the correlation
//      around it. A gap like that is refused, loudly, naming the ticker and the
//      date, rather than averaged over.
//   3. A window's FIRST day has no return unless the close before it is on hand.
//      The registered earliest window starts on the first trading day on or
//      after 24 November 2016, so computing a return for that day needs the
//      close from the trading day before - a day that is deliberately outside
//      the window. scripts/fetch_data.py therefore reaches back a few days
//      before the window, and the window is sliced HERE, from dates, so the
//      registered boundaries stay exactly as PREREG_AMENDMENT.md states them.
//
// Nothing here fetches anything, and nothing here knows what a hypothesis is.
//
// Educational, not investment advice.

/**
 * The ticker whose trading days define the calendar.
 *
 * The S&P 500 index, which trades whenever the US market is open. Using one
 * ticker's days as the calendar - rather than the union of every ticker's days -
 * means a single ticker with a stray date cannot invent a market holiday for
 * everybody else; it is reported as a fault in that ticker instead.
 */
export const CALENDAR_TICKER = '^GSPC';

/**
 * Daily simple returns: close-to-close percent change, one fewer value than
 * closes.
 *
 * PRD, "How the numbers work": "Daily returns are simple returns (close-to-close
 * percent change), used consistently everywhere a return appears." After the
 * first real-data run the same verdicts were recomputed from log returns and
 * came out the same; simple returns are kept because they are what a dollar
 * amount in the game actually does.
 */
export function simpleReturns(closes) {
  if (!Array.isArray(closes) || closes.length < 2) {
    throw new Error('simpleReturns: need at least 2 closes to get one return');
  }
  for (const [i, close] of closes.entries()) {
    if (typeof close !== 'number' || !Number.isFinite(close) || close <= 0) {
      throw new Error(`simpleReturns: ${close} at position ${i} is not a usable price`);
    }
  }
  const out = new Array(closes.length - 1);
  for (let i = 1; i < closes.length; i += 1) out[i - 1] = closes[i] / closes[i - 1] - 1;
  return out;
}

/** Check one ticker's own series before it is compared with anything else. */
function validateSeries(ticker, series) {
  if (!series || !Array.isArray(series.dates) || !Array.isArray(series.close)) {
    throw new Error(`buildReturns: ${ticker} needs a dates array and a close array`);
  }
  if (series.dates.length !== series.close.length) {
    throw new Error(
      `buildReturns: ${ticker} has ${series.dates.length} dates and ${series.close.length} closes; `
      + 'they must be the same length',
    );
  }
  if (series.dates.length === 0) {
    throw new Error(`buildReturns: ${ticker} has no prices at all`);
  }
  for (let i = 1; i < series.dates.length; i += 1) {
    if (!(series.dates[i] > series.dates[i - 1])) {
      throw new Error(
        `buildReturns: ${ticker}'s dates are out of order or repeat: `
        + `${series.dates[i - 1]} then ${series.dates[i]}. They must be strictly increasing.`,
      );
    }
  }
}

/**
 * Every date in the calendar from a ticker's own first date to its own last date
 * must be present in that ticker. A day before its first date is registered
 * history, not a gap; a day after its last date is reported as a shortfall by
 * the coverage report, not refused here.
 *
 * THE RULE APPLIES TO ALL 42 TICKERS, including VRT and PLTR, whose late starts
 * are registered: a hole in the middle of a short history is still a hole.
 */
function checkInteriorDays(ticker, dates, calendar, calendarIndex) {
  const own = new Set(dates);
  for (const date of dates) {
    if (!calendarIndex.has(date)) {
      throw new Error(
        `buildReturns: ${ticker} has a price on ${date}, which is not a trading day on `
        + `${CALENDAR_TICKER}'s calendar. One of the two series is wrong; no returns were built.`,
      );
    }
  }
  const from = calendarIndex.get(dates[0]);
  const to = calendarIndex.get(dates[dates.length - 1]);
  const missing = [];
  for (let i = from; i <= to; i += 1) {
    if (!own.has(calendar[i])) missing.push(calendar[i]);
  }
  if (missing.length > 0) {
    throw new Error(
      `buildReturns: ${ticker} is missing ${missing.length} trading day`
      + `${missing.length === 1 ? '' : 's'} inside its own history, starting at ${missing[0]}`
      + `${missing.length > 1 ? ` (and ${missing.length - 1} more)` : ''}. `
      + 'A missing interior day would turn one day\'s return into two days\' worth, so no '
      + 'returns were built. Refetch the snapshot or trim the ticker to a clean start.',
    );
  }
}

/** Both ends inclusive, and a bound on a non-trading day falls inside the window. */
function sliceIndices(dates, startDate, endDate) {
  const from = dates.findIndex((date) => date >= startDate);
  if (from === -1) return { from: 0, to: -1 };
  let to = -1;
  for (let i = dates.length - 1; i >= 0; i -= 1) {
    if (dates[i] <= endDate) { to = i; break; }
  }
  return { from, to };
}

/**
 * Turn a price snapshot into date-aligned daily returns.
 *
 * Every ticker comes back as an array of the SAME length, one value per return
 * date, holding null on any day before that ticker's first return. Day t
 * therefore means the same calendar date in every series, which is what lets the
 * windows below hand out dense matrices without ever lining prices up by
 * position.
 *
 * @param {object} snapshot data/prices.json, parsed
 * @param {string} options.calendarTicker whose trading days define the calendar
 * @returns {object} the series, with window(), windowAllowingGaps() and
 *                   commonWindow() to slice it
 */
export function buildReturns(snapshot, { calendarTicker = CALENDAR_TICKER } = {}) {
  const prices = snapshot?.prices;
  if (!prices || typeof prices !== 'object') {
    throw new Error('buildReturns: the snapshot has no prices object');
  }
  if (!prices[calendarTicker]) {
    throw new Error(
      `buildReturns: the snapshot has no ${calendarTicker}, whose trading days define the calendar`,
    );
  }

  const tickers = Object.keys(prices);
  for (const ticker of tickers) validateSeries(ticker, prices[ticker]);

  const calendar = prices[calendarTicker].dates;
  const calendarIndex = new Map(calendar.map((date, i) => [date, i]));
  for (const ticker of tickers) {
    checkInteriorDays(ticker, prices[ticker].dates, calendar, calendarIndex);
  }

  // A return needs the day before it, so the return dates are the calendar
  // without its first day. Nothing is lost: the close on that first day is the
  // lead-in that gives the second day its return.
  const dates = calendar.slice(1);
  const byTicker = {};
  const firstReturnDate = {};
  const coverage = {};

  for (const ticker of tickers) {
    const own = prices[ticker];
    const values = new Array(dates.length).fill(null);
    const ownReturns = simpleReturns(own.close);
    // own.dates[i] gets the return computed from own.close[i-1] to own.close[i].
    // Interior days are complete, so own.dates[i-1] is the trading day before
    // own.dates[i] and this is a genuine one-day return.
    for (let i = 1; i < own.dates.length; i += 1) {
      values[calendarIndex.get(own.dates[i]) - 1] = ownReturns[i - 1];
    }
    const present = values.reduce((count, value) => count + (value === null ? 0 : 1), 0);
    byTicker[ticker] = values;
    firstReturnDate[ticker] = own.dates.length > 1 ? own.dates[1] : null;
    coverage[ticker] = {
      days: present,
      firstDate: firstReturnDate[ticker],
      lastDate: own.dates[own.dates.length - 1],
      complete: present === dates.length,
    };
  }

  /** The dense part of a window: only the tickers that cover every day of it. */
  function window(startDate, endDate, { tickers: wanted = tickers } = {}) {
    const { from, to } = sliceIndices(dates, startDate, endDate);
    const windowDates = to < from ? [] : dates.slice(from, to + 1);
    const out = {};
    const incomplete = [];
    for (const ticker of wanted) {
      if (!byTicker[ticker]) throw new Error(`window: no returns for ${ticker}`);
      const values = byTicker[ticker].slice(from, to + 1);
      const present = values.filter((value) => value !== null);
      if (present.length === values.length) out[ticker] = values;
      else incomplete.push({ ticker, days: present.length, of: values.length });
    }
    return {
      startDate,
      endDate,
      dates: windowDates,
      days: windowDates.length,
      byTicker: out,
      incomplete,
    };
  }

  /**
   * The same window with the holes left in, as null.
   *
   * The growing AI basket needs this: PREREG.md asks for "a second version that
   * adds names as they list", so a member that has not listed yet has to be
   * present and skippable, rather than silently dropped or counted as a zero
   * return.
   */
  function windowAllowingGaps(startDate, endDate, { tickers: wanted = tickers } = {}) {
    const { from, to } = sliceIndices(dates, startDate, endDate);
    const windowDates = to < from ? [] : dates.slice(from, to + 1);
    const out = {};
    for (const ticker of wanted) {
      if (!byTicker[ticker]) throw new Error(`windowAllowingGaps: no returns for ${ticker}`);
      out[ticker] = byTicker[ticker].slice(from, to + 1);
    }
    return { startDate, endDate, dates: windowDates, days: windowDates.length, byTicker: out };
  }

  /**
   * ONE window, ending on the last day of the snapshot, that every listed ticker
   * covers in full - at most `requestedDays` long.
   *
   * WHY ONE WINDOW. Hypothesis 1 scores 500 portfolios and compares their median
   * against a threshold. If each portfolio used its own overlap, a portfolio
   * holding a short-history name would be measured over a different stretch of
   * market history from the portfolio beside it, and the median would mix
   * periods. The overlap is therefore taken once, across every name the run can
   * draw, and every portfolio is scored on those same days.
   */
  function commonWindow(wanted, requestedDays) {
    if (!Array.isArray(wanted) || wanted.length === 0) {
      throw new Error('commonWindow: expected at least one ticker');
    }
    for (const ticker of wanted) {
      if (!byTicker[ticker]) throw new Error(`commonWindow: no returns for ${ticker}`);
    }
    // Walk back from the most recent day until one of the tickers runs out.
    let from = dates.length;
    while (from > 0 && wanted.every((ticker) => byTicker[ticker][from - 1] !== null)) from -= 1;
    const available = dates.length - from;
    const days = Math.min(requestedDays, available);
    const start = dates.length - days;
    const out = {};
    for (const ticker of wanted) out[ticker] = byTicker[ticker].slice(start);
    return {
      startDate: dates[start],
      endDate: dates[dates.length - 1],
      dates: dates.slice(start),
      days,
      requestedDays,
      availableDays: available,
      byTicker: out,
      incomplete: [],
    };
  }

  return {
    calendarTicker,
    calendar,
    dates,
    tickers,
    byTicker,
    firstReturnDate,
    coverage,
    freezeDate: snapshot.freeze_date ?? null,
    windowStartRequested: snapshot.window_start_requested ?? null,
    fetchStart: snapshot.fetch_start ?? null,
    trimmed: snapshot.trimmed ?? {},
    window,
    windowAllowingGaps,
    commonWindow,
    disclaimer: 'Educational, not investment advice.',
  };
}
