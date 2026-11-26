// tests/gameView.test.js - the game's view of data/game.json.
//
// WHAT IS BEING CHECKED HERE. js/gameView.js reads game.json's row-per-day
// layout and slices a window out of it. That window decides every number the
// game shows, so the thing that matters is that it is the SAME window
// js/returns.js takes - the code the published verdicts were computed with.
// It is checked by slicing one set of returns both ways and comparing, rather
// than by reading the two functions side by side and calling them alike.
//
// TWO COMPARISONS, AND THEY ARE DIFFERENT QUESTIONS.
//
//   1. Does gameView slice the same days, in the same order? Tested against a
//      game document built at FULL PRECISION, so the answer is exact: any
//      difference at all is a slicing fault in this file.
//   2. What does storing returns to 12 decimal places cost? Tested on the real
//      rounded document. It is a property of the file format, not of this file:
//      tests/gamedata.test.js measures it across 400 portfolios and owns the
//      decision; this file checks the same bound from the game's side.
//
// The late-listing case matters more than it looks. VRT and PLTR are the
// registered late listings, and today's 756-day file happens to start after both
// of them, so no column in the committed file has a leading null. A file that
// never exercises the case cannot test it, so the late-listing tests build
// documents with holes by hand.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildReturns } from '../js/returns.js';
import { covariance, correlation, effectiveBets } from '../js/math.js';
import { buildGameData, GAME_DAYS, FILE_DAYS } from '../scripts/build_game_data.mjs';
import {
  DISCLAIMER,
  gameDates,
  gameWindow,
  tickerSeries,
  validateGameDoc,
  windowMatrix,
} from '../js/gameView.js';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));

// The frozen snapshot is used as the BUILDER'S INPUT, not as the game's data:
// it is deterministic, so every number here can be checked against
// js/returns.js directly. The game itself never opens it.
const SNAPSHOT = readJson('data/prices.json');
const BUILT = buildReturns(SNAPSHOT);
const ROUNDED = buildGameData(SNAPSHOT);          // as committed: 10 decimals
const COMMITTED = readJson('data/game.json');

/**
 * The same document at full precision, so a slicing fault cannot hide behind
 * the file format's rounding. Built from BUILT the way buildGameData() builds
 * ROUNDED, minus the rounding.
 */
const EXACT = (() => {
  const tickers = BUILT.tickers.slice().sort();
  const from = BUILT.dates.length - GAME_DAYS;
  const dates = BUILT.dates.slice(from);
  return {
    meta: { liveThrough: dates[dates.length - 1], firstDate: dates[0] },
    tickers,
    rows: dates.map((date, i) => [date, ...tickers.map((t) => BUILT.byTicker[t][from + i])]),
  };
})();

/** A small hand-made document, so faults can be put in on purpose. */
function miniDoc(tickers, rows, meta = {}) {
  return { meta: { liveThrough: rows[rows.length - 1][0], ...meta }, tickers, rows };
}

/** Effective bets for a portfolio over a gameView window. */
function betsFromView(doc, tickers, weights, days = GAME_DAYS) {
  const window = gameWindow(doc, tickers, days);
  return effectiveBets(weights, covariance(windowMatrix(window, tickers)));
}

/** Effective bets for the same portfolio over a js/returns.js window. */
function betsFromReturns(tickers, weights, days = GAME_DAYS) {
  const window = BUILT.commonWindow(tickers, days);
  const rows = Array.from({ length: window.days }, (_, t) => tickers.map((k) => window.byTicker[k][t]));
  return effectiveBets(weights, covariance(rows));
}

const PORTFOLIOS = [
  ['VOO', 'QQQ'],
  ['VTI', 'VXUS'],
  ['NVDA', 'AMD', 'AVGO', 'MU', 'ANET'],
  ['JNJ', 'TLT', 'GOOGL', 'LQD', 'COP'],
  ['BND', 'GLD'],
  ['VOO', 'BND', 'GLD', 'XOM', 'JNJ'],
];

// ----------------------------------------------------------------- layout

test('tickerSeries reads the column belonging to the ticker, not the one beside it', () => {
  const doc = miniDoc(['AAA', 'BBB', 'CCC'], [
    ['2026-11-23', 0.01, 0.02, 0.03],
    ['2026-11-24', 0.04, 0.05, 0.06],
  ]);
  assert.deepEqual(tickerSeries(doc, 'AAA'), [0.01, 0.04]);
  assert.deepEqual(tickerSeries(doc, 'BBB'), [0.02, 0.05]);
  assert.deepEqual(tickerSeries(doc, 'CCC'), [0.03, 0.06]);
});

test('tickerSeries names a ticker the file does not carry', () => {
  assert.throws(() => tickerSeries(COMMITTED, 'TSLA'), /does not carry TSLA/);
});

test('tickerSeries pulls a whole column unchanged out of the full-precision document', () => {
  const from = BUILT.dates.length - GAME_DAYS;
  for (const ticker of ['NVDA', 'BND', 'GLD', '^GSPC']) {
    const series = tickerSeries(EXACT, ticker);
    assert.equal(series.length, GAME_DAYS);
    for (let i = 0; i < series.length; i += 1) {
      assert.equal(series[i], BUILT.byTicker[ticker][from + i], `${ticker} on ${EXACT.rows[i][0]}`);
    }
  }
});

test('gameDates gives the trading days, oldest first', () => {
  const dates = gameDates(COMMITTED);
  assert.equal(dates.length, COMMITTED.rows.length);
  assert.equal(dates[0], COMMITTED.meta.firstDate);
  assert.equal(dates[dates.length - 1], COMMITTED.meta.liveThrough);
  for (let i = 1; i < dates.length; i += 1) assert.ok(dates[i] > dates[i - 1]);
});

// ------------------------------------------------------------- validation

test('validateGameDoc accepts the committed file', () => {
  assert.equal(validateGameDoc(COMMITTED), COMMITTED);
});

test('validateGameDoc refuses a row that is missing a ticker value', () => {
  const doc = miniDoc(['AAA', 'BBB'], [['2026-11-24', 0.01, 0.02], ['2026-11-25', 0.03]]);
  assert.throws(() => validateGameDoc(doc), /row 1 does not have a date and one value/);
});

test('validateGameDoc refuses a file whose meta does not describe its last row', () => {
  const doc = miniDoc(['AAA'], [['2026-11-24', 0.01]], { liveThrough: '2026-11-25' });
  assert.throws(() => validateGameDoc(doc), /liveThrough says 2026-11-25 but the last row is 2026-11-24/);
});

test('validateGameDoc refuses an empty or missing document', () => {
  assert.throws(() => validateGameDoc(null), /expected an object/);
  assert.throws(() => validateGameDoc({ tickers: [], rows: [] }), /tickers list is missing/);
  assert.throws(() => validateGameDoc({ tickers: ['AAA'], rows: [] }), /rows list is missing/);
});

// ------------------------------------- 1. the slice, exactly, against returns.js

test('gameWindow is commonWindow: the same days, the same values, exactly', () => {
  for (const days of [756, 252, 60]) {
    for (const tickers of PORTFOLIOS) {
      const mine = gameWindow(EXACT, tickers, days);
      const theirs = BUILT.commonWindow(tickers, days);
      assert.equal(mine.days, theirs.days, `${tickers.join('/')} over ${days} days: different lengths`);
      assert.equal(mine.startDate, theirs.startDate);
      assert.equal(mine.endDate, theirs.endDate);
      assert.deepEqual(mine.dates, theirs.dates);
      for (const ticker of tickers) {
        assert.deepEqual(
          mine.byTicker[ticker],
          theirs.byTicker[ticker],
          `${ticker} differs between gameWindow and commonWindow`,
        );
      }
    }
  }
});

test('effective bets over a gameWindow matches the same portfolio over a commonWindow exactly', () => {
  // The measure, not just the slice: a window that agreed day for day but was
  // read into the matrix the wrong way round would still fail here.
  const weights = [0.3, 0.25, 0.2, 0.15, 0.1];
  const tickers = ['VOO', 'BND', 'GLD', 'XOM', 'JNJ'];
  assert.equal(betsFromView(EXACT, tickers, weights), betsFromReturns(tickers, weights));
});

test('correlation over a gameWindow matches js/returns.js exactly, including the level-1 near miss', () => {
  for (const pair of [['VTI', 'VXUS'], ['VOO', 'VTI'], ['XOM', 'CVX'], ['BND', 'CVX']]) {
    const mine = correlation(windowMatrix(gameWindow(EXACT, pair, GAME_DAYS), pair))[0][1];
    const w = BUILT.commonWindow(pair, GAME_DAYS);
    const theirs = correlation(Array.from({ length: w.days }, (_, t) => [w.byTicker[pair[0]][t], w.byTicker[pair[1]][t]]))[0][1];
    assert.equal(mine, theirs, pair.join('/'));
  }
});

// -------------------------- 2. what the 10-decimal file format costs, measured

test('the committed file format moves a bets count by less than 1e-9', () => {
  // The file stores returns to 12 decimal places, which session 2.3c measured at
  // 1.8e-11 over 400 random portfolios - inside the 1e-9 this project holds its
  // maths to (CLAUDE.md rule 3). The wide measurement itself lives in
  // tests/gamedata.test.js, which owns the format; this is the same bound seen
  // from the game's side, on the window a round actually uses.
  const weights = [0.3, 0.25, 0.2, 0.15, 0.1];
  const tickers = ['VOO', 'BND', 'GLD', 'XOM', 'JNJ'];
  const drift = Math.abs(betsFromView(ROUNDED, tickers, weights) - betsFromReturns(tickers, weights));
  assert.ok(drift < 1e-9, `rounding moved the bets count by ${drift.toExponential(2)}`);
  assert.ok(drift > 0, 'if the rounding now costs nothing at all, the format or the builder changed');
});

test('the committed file and a freshly built one agree, so the game plays on what was built', () => {
  // Not a maths check: it catches a game.json edited by hand or left behind by a
  // failed refresh. The committed file is built from the live prices, so only its
  // shape and ticker list are compared, not its values.
  assert.deepEqual(COMMITTED.tickers, ROUNDED.tickers);
  // The LENGTH is a range, not a match. The file keeps FILE_DAYS, which is the
  // game's window plus a spare week so that the weekly challenge's anchored
  // window is the same length every day of a week. Between the day that
  // retention was raised and the next weekday rebuild, the committed file is
  // still the old length and every screen works - so what is checked is that
  // it carries the window the game needs and no more than the file keeps.
  assert.ok(COMMITTED.rows.length >= GAME_DAYS,
    `the committed game.json has ${COMMITTED.rows.length} days, fewer than the window's ${GAME_DAYS}`);
  assert.ok(COMMITTED.rows.length <= FILE_DAYS,
    `the committed game.json has ${COMMITTED.rows.length} days, more than the ${FILE_DAYS} it keeps`);
  assert.equal(ROUNDED.rows.length, FILE_DAYS);
});

// ------------------------------------------------------------ late listings

test('a late listing shortens the window for the whole portfolio', () => {
  // BBB lists on the third day. The overlap is therefore 3 days, and AAA's
  // first two returns are outside it even though AAA has them.
  const doc = miniDoc(['AAA', 'BBB'], [
    ['2026-11-19', 0.01, null],
    ['2026-11-20', 0.02, null],
    ['2026-11-21', 0.03, 0.30],
    ['2026-11-24', 0.04, 0.40],
    ['2026-11-25', 0.05, 0.50],
  ]);
  const window = gameWindow(doc, ['AAA', 'BBB'], 756);
  assert.equal(window.days, 3);
  assert.equal(window.availableDays, 3);
  assert.equal(window.startDate, '2026-11-21');
  assert.deepEqual(window.byTicker.AAA, [0.03, 0.04, 0.05]);
  assert.deepEqual(window.byTicker.BBB, [0.30, 0.40, 0.50]);
});

test('a portfolio without the late lister keeps the full window', () => {
  const doc = miniDoc(['AAA', 'BBB'], [
    ['2026-11-19', 0.01, null],
    ['2026-11-20', 0.02, null],
    ['2026-11-21', 0.03, 0.30],
  ]);
  const window = gameWindow(doc, ['AAA'], 756);
  assert.equal(window.days, 3);
  assert.deepEqual(window.byTicker.AAA, [0.01, 0.02, 0.03]);
});

test('a late listing on the last day leaves one day, and the round decides that is too few', () => {
  // gameWindow reports what there is; the 252-day minimum is levels.json's rule
  // and js/round.js applies it. This asserts the reporting, not the rule.
  const doc = miniDoc(['AAA', 'BBB'], [
    ['2026-11-24', 0.01, null],
    ['2026-11-25', 0.02, 0.20],
  ]);
  const window = gameWindow(doc, ['AAA', 'BBB'], 756);
  assert.equal(window.days, 1);
  assert.equal(window.availableDays, 1);
});

// ------------------------------------------------------------------ edges

test('gameWindow takes the most recent days, ending on the last row', () => {
  const window = gameWindow(COMMITTED, ['VOO', 'QQQ'], 30);
  assert.equal(window.days, 30);
  assert.equal(window.endDate, COMMITTED.meta.liveThrough);
  assert.equal(window.startDate, COMMITTED.rows[COMMITTED.rows.length - 30][0]);
});

test('gameWindow asking for more days than the file holds gives the whole file', () => {
  const window = gameWindow(COMMITTED, ['VOO'], 5000);
  assert.equal(window.days, COMMITTED.rows.length);
  assert.equal(window.requestedDays, 5000);
  assert.equal(window.availableDays, COMMITTED.rows.length);
  assert.equal(window.startDate, COMMITTED.meta.firstDate);
});

test('gameWindow refuses an empty ticker list or a nonsense length', () => {
  assert.throws(() => gameWindow(COMMITTED, [], 756), /at least one ticker/);
  assert.throws(() => gameWindow(COMMITTED, ['VOO'], 0), /whole number of days/);
  assert.throws(() => gameWindow(COMMITTED, ['VOO'], 12.5), /whole number of days/);
});

test('windowMatrix is rows = days, columns = holdings', () => {
  const doc = miniDoc(['AAA', 'BBB'], [
    ['2026-11-24', 0.01, 0.02],
    ['2026-11-25', 0.03, 0.04],
  ]);
  const window = gameWindow(doc, ['AAA', 'BBB'], 756);
  assert.deepEqual(windowMatrix(window, ['AAA', 'BBB']), [[0.01, 0.02], [0.03, 0.04]]);
  // Column order follows the tickers asked for, not the file's order.
  assert.deepEqual(windowMatrix(window, ['BBB', 'AAA']), [[0.02, 0.01], [0.04, 0.03]]);
});

test('the committed game file carries the disclaimer', () => {
  assert.equal(COMMITTED.meta.disclaimer, DISCLAIMER);
});
