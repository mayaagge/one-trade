// js/gameView.js - the price data the GAME plays on, and only that.
//
// docs/PRD.md, "Two price files, and they are not interchangeable":
// data/prices.json is the frozen research snapshot that every published verdict
// was computed from, and data/game.json is the most recent 756 trading days of
// daily returns, rebuilt every weekday evening. The game reads game.json and
// never prices.json. Nothing in this file opens the snapshot or the results.
//
// WHY THIS FILE EXISTS AT ALL. game.json stores returns as one row per trading
// day - a date, then one value per ticker - because that diffs usefully in a
// daily commit. Every reader of it therefore needs the same three things: a
// ticker's column, the dates, and a window of days that a set of tickers all
// cover. Those live here once, so the game and the Research page's live chart
// tail read one layout rather than two.
//
// THE WINDOW IS THE SAME WINDOW THE VERDICTS USED. gameWindow() below is
// commonWindow() from js/returns.js, applied to this layout: walk back from the
// most recent day until one of the tickers runs out, then take at most the
// requested number of days. tests/gameView.test.js builds a game document from
// the frozen snapshot and slices it both ways, so this is checked against the
// original rather than described as matching it.
//
// The file is js/gameView.js and not js/gameData.js because macOS filesystems
// are case-insensitive: tests/gameData.test.js and the existing
// tests/gamedata.test.js, which tests the build pipeline, would be one file.
//
// Educational, not investment advice.

export const GAME_URL = 'data/game.json';
export const DISCLAIMER = 'Educational, not investment advice.';

/** One ticker's column out of game.json's row-per-day layout. */
export function tickerSeries(game, ticker) {
  if (!game || !Array.isArray(game.tickers) || !Array.isArray(game.rows)) {
    throw new Error('data/game.json is not a document with tickers and rows');
  }
  const column = game.tickers.indexOf(ticker);
  if (column === -1) {
    throw new Error(`data/game.json does not carry ${ticker}`);
  }
  // Column 0 is the date, so a ticker's values sit one to the right of its index.
  return game.rows.map((row) => row[column + 1]);
}

/** The trading dates in game.json, oldest first. */
export function gameDates(game) {
  if (!game || !Array.isArray(game.rows)) {
    throw new Error('data/game.json has no rows');
  }
  return game.rows.map((row) => row[0]);
}

/**
 * Check a game document over far enough that the round cannot discover a fault
 * halfway through. The thorough check is checkGameData() in
 * scripts/build_game_data.mjs, which runs before the file is ever committed;
 * this is the browser's own guard against a file that is missing or truncated.
 */
export function validateGameDoc(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('game.json: expected an object');
  if (!Array.isArray(doc.tickers) || doc.tickers.length === 0) {
    throw new Error('game.json: a non-empty tickers list is missing');
  }
  if (!Array.isArray(doc.rows) || doc.rows.length === 0) {
    throw new Error('game.json: a non-empty rows list is missing');
  }
  const width = doc.tickers.length + 1;
  for (const [i, row] of doc.rows.entries()) {
    if (!Array.isArray(row) || row.length !== width) {
      throw new Error(
        `game.json row ${i} does not have a date and one value for each of the `
        + `${doc.tickers.length} tickers`,
      );
    }
  }
  if (!doc.meta || typeof doc.meta.liveThrough !== 'string') {
    throw new Error('game.json: meta.liveThrough is missing, so no screen could say how fresh the prices are');
  }
  if (doc.meta.liveThrough !== doc.rows[doc.rows.length - 1][0]) {
    throw new Error(
      `game.json: meta.liveThrough says ${doc.meta.liveThrough} but the last row is `
      + `${doc.rows[doc.rows.length - 1][0]}`,
    );
  }
  return doc;
}

/**
 * ONE window, ending on the most recent day in the file, that every listed
 * ticker covers in full - at most `requestedDays` long.
 *
 * This is commonWindow() from js/returns.js over game.json's layout. A ticker
 * that listed partway through the window has leading nulls (VRT and PLTR are the
 * registered late listings), and a late listing shortens the window for every
 * holding in the portfolio rather than being dropped or counted as a zero
 * return. docs/PRD.md: "In the game, where a single portfolio is the whole
 * calculation, the overlap is that portfolio's own."
 *
 * How short is too short is NOT decided here - levels.json carries the minimum
 * (252 days) and js/round.js applies it, because it is a rule a reviewer should
 * be able to read without reading code.
 *
 * @param {object} doc data/game.json, parsed
 * @param {string[]} wanted the portfolio's tickers
 * @param {number} requestedDays the window length asked for, in trading days
 */
export function gameWindow(doc, wanted, requestedDays) {
  if (!Array.isArray(wanted) || wanted.length === 0) {
    throw new Error('gameWindow: expected at least one ticker');
  }
  if (!Number.isInteger(requestedDays) || requestedDays <= 0) {
    throw new Error('gameWindow: requestedDays must be a whole number of days');
  }
  const dates = gameDates(doc);
  const byTicker = {};
  for (const ticker of wanted) byTicker[ticker] = tickerSeries(doc, ticker);

  // Walk back from the most recent day until one of the tickers runs out.
  let from = dates.length;
  while (from > 0 && wanted.every((ticker) => byTicker[ticker][from - 1] !== null)) from -= 1;
  const available = dates.length - from;
  const days = Math.min(requestedDays, available);
  const start = dates.length - days;

  const out = {};
  for (const ticker of wanted) out[ticker] = byTicker[ticker].slice(start);
  return {
    startDate: dates[start] ?? null,
    endDate: dates[dates.length - 1] ?? null,
    dates: dates.slice(start),
    days,
    requestedDays,
    availableDays: available,
    byTicker: out,
  };
}

/**
 * A window as a matrix of rows = days, columns = holdings, which is the shape
 * covariance() and correlation() in js/math.js want.
 */
export function windowMatrix(window, tickers) {
  return Array.from(
    { length: window.days },
    (_, day) => tickers.map((ticker) => window.byTicker[ticker][day]),
  );
}

/**
 * Read data/game.json. The caller handles the failure: a round that cannot get
 * prices has to say so on the screen, not play on stale numbers.
 */
export async function loadGameData(url = GAME_URL) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return validateGameDoc(await response.json());
}
