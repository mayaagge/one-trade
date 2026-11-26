// tests/gamedata.test.js - data/game.json: the live returns the game plays on.
//
// WHAT IS BEING CHECKED HERE. data/game.json is rebuilt every weekday evening by
// a workflow nobody is watching, and the game reads it instead of the frozen
// snapshot. Three things therefore have to be true, and each has tests below:
//
//   1. The returns in it are the SAME returns js/returns.js builds. The game and
//      the research code must apply one rule, so game.json is built by calling
//      buildReturns(), not by a second implementation of the same arithmetic.
//   2. Storing them to 12 decimal places does not move a result by as much as
//      1e-9, which is the agreement this project holds its maths to (CLAUDE.md
//      rule 3). The drift is measured here, not assumed, over a WIDE sample of
//      portfolios, and 10 decimals is shown to be too few so the figure cannot
//      be quietly shortened later. Session 2.3c is why the sample is wide: the
//      narrow one this file started with passed at 10 decimals, and 400 random
//      portfolios at random weights did not.
//   3. A broken or stale file is refused rather than committed. The checks are
//      pure functions so they can be exercised on hand-made faults, which is the
//      only way to see them fire - a real fault appears on a random Tuesday.
//
// The frozen research data is checked at the end: nothing in the live pipeline
// is allowed to touch data/prices.json or data/results.json.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { buildReturns } from '../js/returns.js';
import { covariance, correlation, effectiveBets } from '../js/math.js';
import { WINDOW_DAYS } from '../scripts/make_pool.mjs';
import { makeRng } from '../js/rng.js';
import {
  GAME_DAYS,
  FILE_DAYS,
  DECIMALS,
  MAX_DAILY_MOVE,
  STALE_WEEKDAYS,
  DISCLAIMER,
  roundReturn,
  expectedTickers,
  buildGameData,
  formatGameJson,
  checkGameData,
  weekdaysBetween,
  stalenessReport,
  trimIncompleteTail,
  MAX_TRIMMED_DAYS,
} from '../scripts/build_game_data.mjs';

const root = new URL('..', import.meta.url);
const path = (name) => fileURLToPath(new URL(name, root));
const read = (name) => readFileSync(path(name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

// The frozen snapshot is the only committed price file, so it is what the
// builder is tested against: it is deterministic, and every number it produces
// can be checked against js/returns.js directly.
const SNAPSHOT = readJson('data/prices.json');
const BUILT = buildReturns(SNAPSHOT);
const TICKERS = expectedTickers(readJson('tickers.json'));

/** A good document, built from the frozen snapshot. Rebuilt per test that mutates. */
function goodDoc() {
  return buildGameData(SNAPSHOT, { source: 'data/prices.json' });
}

/** Deep copy, so a test can break one field without affecting the next test. */
const copy = (doc) => JSON.parse(JSON.stringify(doc));

// --- 1. the window and the format are the registered ones --------------------

test('the game window is 756 days, the same window the pool and the levels use', () => {
  assert.equal(GAME_DAYS, 756, 'docs/PRD.md: the covariance matrix uses the most recent 756 trading days');
  assert.equal(GAME_DAYS, WINDOW_DAYS, 'the game must score on the same window length as scripts/make_pool.mjs');
});

test('the file keeps a spare week, so a week-long anchored window never shortens', () => {
  // The weekly challenge measures to the Friday before its Monday. The file is
  // rebuilt every weekday evening, so without the spare days that window loses
  // one trading day per rebuild and the answer moves under the players.
  assert.equal(FILE_DAYS, GAME_DAYS + 10);
  assert.ok(FILE_DAYS - GAME_DAYS >= 5, 'a week has five trading days, and the anchor is five back by Friday');
});

test('returns are stored to 12 decimal places', () => {
  assert.equal(DECIMALS, 12);
  assert.equal(roundReturn(0.012345678901234567), 0.012345678901);
  assert.equal(roundReturn(-0.0123456789014999), -0.012345678901);
  assert.equal(roundReturn(0), 0);
  assert.equal(roundReturn(null), null, 'a day before a ticker listed stays null, not 0');
});

// --- 2. the precision is enough, measured rather than assumed -----------------
//
// CLAUDE.md rule 3: browser math must match the numpy known-answer tests to
// 1e-9. Those tests feed fixtures, not game.json, so rounding here cannot break
// them directly - but a game.json coarse enough to move a correlation by more
// than 1e-9 would make the game disagree with the research code on the same
// window, which is the thing this project does not allow.

/**
 * The portfolios the drift is measured over.
 *
 * WHY RANDOM WEIGHTS AND RANDOM LINE-UPS. Equal weights are the kind case: the
 * narrow sample below (hand-picked sets, equal weights) is inside 1e-9 even at
 * 10 decimals, which is what session 2.3a measured and what sent 10 decimals
 * into the file format. A player splits the money however they like, so the
 * sample has to as well. Seeded, so the measurement is the same every run.
 */
const DRIFT_SEED = 99;
const DRIFT_PORTFOLIOS = 400;

const UNIVERSE = (() => {
  const spec = readJson('tickers.json');
  return spec.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
})();

/** The line-ups and weights, drawn once and reused at every rounding. */
const DRIFT_SAMPLE = (() => {
  const rng = makeRng(DRIFT_SEED);
  const sample = [];
  for (let i = 0; i < DRIFT_PORTFOLIOS; i += 1) {
    const pool = [...UNIVERSE];
    const size = 2 + Math.floor(rng.uniform() * 4);          // 2 to 5 holdings
    const names = [];
    while (names.length < size) {
      names.push(...pool.splice(Math.floor(rng.uniform() * pool.length), 1));
    }
    const raw = names.map(() => rng.uniform());
    const sum = raw.reduce((a, b) => a + b, 0);
    sample.push({ names, weights: raw.map((x) => x / sum) });
  }
  return sample;
})();

/** Correlations and effective bets at a given rounding, over both samples. */
function measuresAt(decimals) {
  const round = decimals === null
    ? (v) => v
    : (v) => Number(v.toFixed(decimals));
  const out = { correlations: [], bets: [] };
  // VTI/VXUS is the level-1 near miss at 0.7997 against a 0.80 threshold, so it
  // is the pair where a rounding error would do the most damage.
  for (const pair of [['VTI', 'VXUS'], ['VOO', 'QQQ'], ['BND', 'LQD'], ['VOO', 'VTI'], ['XOM', 'CVX']]) {
    const w = BUILT.commonWindow(pair, GAME_DAYS);
    const rows = Array.from({ length: w.days }, (_, t) => [round(w.byTicker[pair[0]][t]), round(w.byTicker[pair[1]][t])]);
    out.correlations.push(correlation(rows)[0][1]);
  }
  // The narrow sample session 2.3a measured, kept so the two are comparable.
  for (const names of [['JNJ', 'TLT', 'GOOGL', 'LQD', 'COP'], ['VOO', 'QQQ', 'NVDA', 'MSFT', 'META']]) {
    const w = BUILT.commonWindow(names, GAME_DAYS);
    const rows = Array.from({ length: w.days }, (_, t) => names.map((n) => round(w.byTicker[n][t])));
    out.bets.push(effectiveBets(names.map(() => 1 / names.length), covariance(rows)));
  }
  // The wide sample: random line-ups at random weights.
  for (const { names, weights } of DRIFT_SAMPLE) {
    const w = BUILT.commonWindow(names, GAME_DAYS);
    const rows = Array.from({ length: w.days }, (_, t) => names.map((n) => round(w.byTicker[n][t])));
    out.bets.push(effectiveBets(weights, covariance(rows)));
  }
  return out;
}

const EXACT = measuresAt(null);

/** The biggest gap between a rounded result and the full-precision one. */
function worstDrift(decimals) {
  const got = measuresAt(decimals);
  let worst = 0;
  for (const key of ['correlations', 'bets']) {
    for (const [i, value] of got[key].entries()) {
      worst = Math.max(worst, Math.abs(value - EXACT[key][i]));
    }
  }
  return worst;
}

test(`${DECIMALS} decimals moves no correlation or bets count by as much as 1e-9`, () => {
  const drift = worstDrift(DECIMALS);
  assert.ok(
    drift < 1e-9,
    `rounding to ${DECIMALS} decimals moved a result by ${drift.toExponential(2)}, which is not inside 1e-9`,
  );
});

test('10 decimals would NOT be inside 1e-9, which is why the format is not shorter', () => {
  // This test documents the measurement that chose 12 decimals (BUILD_LOG 2.3c),
  // and replaces the 8-decimal version of it: 10 decimals is what the file used
  // to hold, and what a future change to save bytes would most likely reach for.
  // Over 400 random portfolios at random weights it moves a bets count by about
  // 2.0e-9. If this ever stops failing, the sample or the data changed, and the
  // format decision has to be re-measured rather than assumed.
  assert.ok(
    worstDrift(10) > 1e-9,
    'if 10 decimals now holds to 1e-9 on this sample, re-measure and update the format decision in BUILD_LOG.md',
  );
});

// --- 3. the builder calls js/returns.js, and agrees with it exactly ----------

test('buildGameData takes the last FILE_DAYS return dates from js/returns.js', () => {
  const doc = goodDoc();
  const expected = BUILT.dates.slice(-FILE_DAYS);
  assert.equal(doc.rows.length, FILE_DAYS);
  assert.deepEqual(doc.rows.map((row) => row[0]), expected);
  assert.equal(doc.meta.firstDate, expected[0]);
  assert.equal(doc.meta.liveThrough, expected[expected.length - 1]);
  assert.equal(doc.meta.days, FILE_DAYS);
  // And the game's own window is still the most recent 756 of them.
  assert.deepEqual(doc.rows.slice(-GAME_DAYS).map((row) => row[0]), BUILT.dates.slice(-GAME_DAYS));
});

test('every value in every row is js/returns.js\'s own value, rounded - no second implementation', () => {
  const doc = goodDoc();
  const from = BUILT.dates.length - FILE_DAYS;
  let checked = 0;
  for (const [t, ticker] of doc.tickers.entries()) {
    const mine = BUILT.byTicker[ticker];
    assert.ok(mine, `${ticker} is in game.json but not in the snapshot`);
    for (let i = 0; i < FILE_DAYS; i += 1) {
      assert.equal(
        doc.rows[i][t + 1],
        roundReturn(mine[from + i]),
        `${ticker} on ${doc.rows[i][0]} does not match buildReturns()`,
      );
      checked += 1;
    }
  }
  assert.equal(checked, FILE_DAYS * doc.tickers.length);
});

test('game.json carries every ticker in tickers.json, including both benchmarks', () => {
  const doc = goodDoc();
  assert.deepEqual(doc.tickers, [...TICKERS.all].sort(), 'the columns are the full ticker list, sorted');
  assert.equal(doc.tickers.length, 42);
  assert.ok(doc.tickers.includes('^GSPC'), 'level 6 draws the portfolio next to the S&P 500');
  assert.ok(doc.tickers.includes('RSP'), 'RSP is in the list, so the game and the research read one file shape');
});

test('the returns are simple returns over the window, not prices', () => {
  const doc = goodDoc();
  for (const row of doc.rows) {
    for (const value of row.slice(1)) {
      if (value === null) continue;
      assert.ok(Math.abs(value) < MAX_DAILY_MOVE, `${value} on ${row[0]} is not a daily return`);
    }
  }
});

test('the live label the page shows names the last day of real data', () => {
  const doc = goodDoc();
  // docs/PRD.md, "Launch is done when": the status chip reads "Live prices
  // through [date]". The string is built here so the page cannot word it
  // differently from the data it came from.
  assert.match(doc.meta.liveLabel, /^Live prices through \d{1,2} [A-Z][a-z]{2} \d{4}$/);
  assert.equal(doc.meta.liveLabel, 'Live prices through 24 Nov 2026');
  assert.equal(doc.meta.disclaimer, DISCLAIMER);
});

// --- 4. the layout, which is a decision git has to live with -----------------

test('the file is one line per trading day, so a daily rebuild is a two-line diff', () => {
  const doc = goodDoc();
  const text = formatGameJson(doc);
  const rowLines = text.split('\n').filter((line) => /^\s*\["\d{4}-\d{2}-\d{2}"/.test(line));
  assert.equal(
    rowLines.length,
    FILE_DAYS,
    'every trading day must be on its own line: a ticker-major layout rewrites every line every day',
  );
});

test('the text round-trips to the same document, exactly', () => {
  const doc = goodDoc();
  const back = JSON.parse(formatGameJson(doc));
  assert.deepEqual(back, doc);
});

test('rebuilding from the same prices gives byte-identical text, so an unchanged day commits nothing', () => {
  const a = formatGameJson(buildGameData(SNAPSHOT, { source: 'data/prices.json' }));
  const b = formatGameJson(buildGameData(SNAPSHOT, { source: 'data/prices.json' }));
  assert.equal(a, b);
});

test('the document carries no timestamp, or every market holiday would look like fresh data', () => {
  // The workflow commits only when the file changed. A generated-at field would
  // change on every run, so the commit date is what dates this file.
  const doc = goodDoc();
  const text = JSON.stringify(doc.meta);
  for (const banned of ['generated_at', 'generatedAt', 'fetched_at', 'fetchedAt', 'timestamp']) {
    assert.ok(!(banned in doc.meta), `meta.${banned} would change on every run`);
  }
  assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'meta carries a wall-clock time');
});

// --- 5. a broken file is refused ---------------------------------------------

test('checkGameData passes a good document', () => {
  assert.doesNotThrow(() => checkGameData(goodDoc(), { tickers: TICKERS }));
});

test('checkGameData refuses a missing ticker', () => {
  const doc = copy(goodDoc());
  const dropped = doc.tickers.indexOf('NVDA');
  doc.tickers.splice(dropped, 1);
  for (const row of doc.rows) row.splice(dropped + 1, 1);
  assert.throws(() => checkGameData(doc, { tickers: TICKERS }), /NVDA/);
});

test('checkGameData refuses a file too short for the game window', () => {
  const doc = copy(goodDoc());
  doc.rows = doc.rows.slice(FILE_DAYS - GAME_DAYS + 1);        // one day under the window
  doc.meta.days = doc.rows.length;
  doc.meta.firstDate = doc.rows[0][0];
  assert.throws(() => checkGameData(doc, { tickers: TICKERS }), /755|fewer than/);
});

test('checkGameData refuses a file that has stopped being trimmed', () => {
  // The other end of the range: a builder that kept appending would grow the
  // download every day, which is a slow leak rather than a broken file.
  const doc = copy(goodDoc());
  doc.rows.unshift([...doc.rows[0]]);
  doc.rows[0][0] = '2000-01-03';
  doc.meta.days = doc.rows.length;
  doc.meta.firstDate = doc.rows[0][0];
  assert.throws(() => checkGameData(doc, { tickers: TICKERS }), /more than/);
});

test('checkGameData refuses dates out of order or repeated', () => {
  const outOfOrder = copy(goodDoc());
  [outOfOrder.rows[10][0], outOfOrder.rows[11][0]] = [outOfOrder.rows[11][0], outOfOrder.rows[10][0]];
  assert.throws(() => checkGameData(outOfOrder, { tickers: TICKERS }), /order|repeat/i);

  const repeated = copy(goodDoc());
  repeated.rows[11][0] = repeated.rows[10][0];
  assert.throws(() => checkGameData(repeated, { tickers: TICKERS }), /order|repeat/i);
});

test('checkGameData refuses a hole in a ticker that should have full history', () => {
  const doc = copy(goodDoc());
  doc.rows[400][doc.tickers.indexOf('VOO') + 1] = null;
  assert.throws(() => checkGameData(doc, { tickers: TICKERS }), /VOO/);
});

test('checkGameData refuses a value that is not a finite number', () => {
  for (const bad of [null, 'nope', true]) {
    const doc = copy(goodDoc());
    const column = doc.tickers.indexOf('MSFT') + 1;
    doc.rows[5][column] = bad;
    // null is a legitimate value only before a ticker's first return, and MSFT
    // has the full window, so every one of these is a fault.
    assert.throws(() => checkGameData(doc, { tickers: TICKERS }), /MSFT/, `${bad} was accepted`);
  }
});

test('checkGameData refuses an impossible daily move', () => {
  const doc = copy(goodDoc());
  doc.rows[3][doc.tickers.indexOf('AMD') + 1] = 0.9;
  assert.throws(() => checkGameData(doc, { tickers: TICKERS }), /AMD/);
});

test('checkGameData refuses a liveThrough that disagrees with the rows', () => {
  const doc = copy(goodDoc());
  doc.meta.liveThrough = '2026-11-25';
  assert.throws(() => checkGameData(doc, { tickers: TICKERS }), /liveThrough/);
});

test('checkGameData refuses a row whose width does not match the tickers', () => {
  const doc = copy(goodDoc());
  doc.rows[7].push(0.001);
  assert.throws(() => checkGameData(doc, { tickers: TICKERS }), /width|values/i);
});

// --- 5b. an evening where Yahoo published late --------------------------------
//
// THE CASE THIS IS FOR. The scheduled refresh of 26 November 2026 went red with
// "AAPL has no value on 2026-11-25, inside its own history". AAPL's bar for that
// day simply was not published yet - the same fetch run the next morning had it
// - and the run threw away a complete evening of prices over one ticker lagging
// by a few hours.
//
// It is also a MISDIAGNOSIS, and that is fixed here too. checkInteriorDays() in
// js/returns.js only looks between a ticker's OWN first and last date, so a
// ticker whose history simply stops early is not an interior gap at all; it
// arrives as a trailing null and checkGameData then calls it a hole "inside its
// own history". A tail that is short and a hole in the middle are different
// faults with different answers: trim the first, refuse the second.

/** A tiny snapshot in data/live_prices.json's shape. */
function snapshotOf(series) {
  return {
    mode: 'live',
    prices: Object.fromEntries(Object.entries(series).map(([ticker, dates]) => [
      ticker,
      {
        dates: Object.keys(dates),
        close: Object.values(dates),
      },
    ])),
  };
}

/** Closes for a run of dates, so a fixture reads as dates rather than numbers. */
function closes(dates, start = 100) {
  return Object.fromEntries(dates.map((date, i) => [date, start + i]));
}

const TRADING = [
  '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
  '2026-11-23', '2026-11-24', '2026-11-25',
];

test('one incomplete newest date is trimmed, and the build goes on', () => {
  // AAPL stops a day early; everyone else has 2026-11-25.
  const snapshot = snapshotOf({
    '^GSPC': closes(TRADING),
    AAPL: closes(TRADING.slice(0, -1)),
    VOO: closes(TRADING),
  });
  const trimmed = trimIncompleteTail(snapshot);

  assert.equal(trimmed.cutDate, '2026-11-24');
  assert.deepEqual(trimmed.dropped.map((d) => d.date), ['2026-11-25']);
  assert.deepEqual(trimmed.dropped[0].missing, ['AAPL']);
  for (const ticker of ['^GSPC', 'AAPL', 'VOO']) {
    assert.equal(
      trimmed.snapshot.prices[ticker].dates.at(-1), '2026-11-24',
      `${ticker} was not trimmed back to the date every ticker has`,
    );
    assert.equal(
      trimmed.snapshot.prices[ticker].dates.length,
      trimmed.snapshot.prices[ticker].close.length,
      `${ticker}: dates and closes came out of step`,
    );
  }
  // And what is left builds, which is the whole point of trimming.
  assert.doesNotThrow(() => buildReturns(trimmed.snapshot));
});

test('two incomplete newest dates are still trimmed; three are refused', () => {
  const two = snapshotOf({
    '^GSPC': closes(TRADING),
    AAPL: closes(TRADING.slice(0, -2)),
    VOO: closes(TRADING),
  });
  assert.equal(trimIncompleteTail(two).dropped.length, 2, 'two days is the documented allowance');
  assert.equal(trimIncompleteTail(two).cutDate, '2026-11-23');

  const three = snapshotOf({
    '^GSPC': closes(TRADING),
    AAPL: closes(TRADING.slice(0, -3)),
    VOO: closes(TRADING),
  });
  assert.throws(() => trimIncompleteTail(three), (error) => {
    assert.match(error.message, /3 newest trading day/);
    assert.match(error.message, /AAPL/, 'the ticker holding everyone back is not named');
    assert.match(error.message, /2026-11-23/, 'the dropped dates are not named');
    assert.match(error.message, new RegExp(String(MAX_TRIMMED_DAYS)));
    return true;
  });
});

test('the allowance is a boundary, not a suggestion', () => {
  assert.equal(MAX_TRIMMED_DAYS, 2);
});

test('a gap in the middle is still refused, trimming or not', () => {
  // AAPL has the newest day and is missing one in the middle. Nothing to trim,
  // and the gap must still stop the run.
  const middle = [...TRADING.slice(0, 3), ...TRADING.slice(4)];
  const snapshot = snapshotOf({
    '^GSPC': closes(TRADING),
    AAPL: closes(middle),
    VOO: closes(TRADING),
  });
  const trimmed = trimIncompleteTail(snapshot);
  assert.equal(trimmed.dropped.length, 0, 'nothing should be trimmed: the newest date is complete');
  assert.throws(() => buildReturns(trimmed.snapshot), /missing 1 trading day inside its own history/);
});

test('a short tail does not hide a gap in the middle of the same ticker', () => {
  // Both faults at once on AAPL: stops a day early AND missing 2026-11-19.
  // Trimming the tail must not excuse the hole.
  const broken = [...TRADING.slice(0, 3), ...TRADING.slice(4, -1)];
  const snapshot = snapshotOf({
    '^GSPC': closes(TRADING),
    AAPL: closes(broken),
    VOO: closes(TRADING),
  });
  const trimmed = trimIncompleteTail(snapshot);
  assert.deepEqual(trimmed.dropped.map((d) => d.date), ['2026-11-25']);
  assert.throws(() => buildReturns(trimmed.snapshot), /inside its own history/);
});

test('the calendar ticker lagging is trimmed like any other ticker', () => {
  // ^GSPC defines the calendar, so when IT is the one that has not published,
  // every other ticker holds a date the calendar does not have. Left alone that
  // is refused outright by js/returns.js - "not in ^GSPC's calendar" - which is
  // the same complete evening thrown away for the same reason. It is a lagging
  // tail whichever ticker lags.
  const snapshot = snapshotOf({
    '^GSPC': closes(TRADING.slice(0, -1)),
    AAPL: closes(TRADING),
    VOO: closes(TRADING),
  });

  // Without the trim this is what happens, and it is why the case is covered.
  assert.throws(() => buildReturns(snapshot), /not a trading day on \^GSPC's calendar/);

  const trimmed = trimIncompleteTail(snapshot);
  assert.equal(trimmed.cutDate, '2026-11-24');
  assert.deepEqual(trimmed.dropped.map((d) => d.date), ['2026-11-25']);
  assert.deepEqual(trimmed.dropped[0].missing, ['^GSPC']);
  assert.doesNotThrow(() => buildReturns(trimmed.snapshot));
});

test('a complete snapshot is handed back untouched', () => {
  const snapshot = snapshotOf({
    '^GSPC': closes(TRADING),
    AAPL: closes(TRADING),
    VOO: closes(TRADING),
  });
  const trimmed = trimIncompleteTail(snapshot);
  assert.deepEqual(trimmed.dropped, []);
  assert.equal(trimmed.cutDate, '2026-11-25');
  assert.equal(trimmed.snapshot, snapshot, 'an untouched snapshot should not be copied for nothing');
});

test('a ticker that stopped reporting long ago is named, not quietly trimmed to', () => {
  // The failure mode the allowance exists to catch: one ticker delisted or
  // dropped by the feed would otherwise drag the cut date back for everyone.
  const snapshot = snapshotOf({
    '^GSPC': closes(TRADING),
    AAPL: closes(TRADING),
    DEAD: closes(TRADING.slice(0, 2)),
  });
  assert.throws(() => trimIncompleteTail(snapshot), /DEAD/);
});

test('today\'s live prices need no trimming', (t) => {
  // A canary on the real file, when there is one: if the evening's fetch did
  // come in complete, nothing above should fire.
  if (!existsSync(path('data/live_prices.json'))) {
    return t.skip('data/live_prices.json is not present; it is gitignored and written by the fetch');
  }
  const trimmed = trimIncompleteTail(readJson('data/live_prices.json'));
  for (const day of trimmed.dropped) {
    t.diagnostic(`${day.date} was incomplete: ${day.missing.join(', ')}`);
  }
  assert.ok(trimmed.dropped.length <= MAX_TRIMMED_DAYS);
});

// --- 6. staleness: a quiet outage has to go red ------------------------------
//
// The workflow keeps the previous game.json when a fetch fails, which is the
// right thing for one bad evening and the wrong thing for a fortnight. More
// than STALE_WEEKDAYS weekdays without fresh data fails the job.

test('weekdaysBetween counts weekdays, not calendar days', () => {
  // 2026-11-24 is a Tuesday.
  assert.equal(weekdaysBetween('2026-11-24', '2026-11-24'), 0);
  assert.equal(weekdaysBetween('2026-11-24', '2026-11-25'), 1);
  assert.equal(weekdaysBetween('2026-11-27', '2026-11-30'), 1, 'Friday to Monday is one weekday');
  assert.equal(weekdaysBetween('2026-11-27', '2026-12-04'), 5, 'a full week on is five weekdays');
  assert.equal(weekdaysBetween('2026-11-24', '2026-11-23'), 0, 'a date in the future is never stale');
});

test('stalenessReport goes stale after more than 5 weekdays', () => {
  assert.equal(STALE_WEEKDAYS, 5);
  const doc = { meta: { liveThrough: '2026-11-24' } };
  assert.equal(stalenessReport(doc, '2026-11-25').stale, false);
  assert.equal(stalenessReport(doc, '2026-12-01').weekdays, 5);
  assert.equal(stalenessReport(doc, '2026-12-01').stale, false, '5 weekdays is inside the allowance');
  assert.equal(stalenessReport(doc, '2026-12-02').weekdays, 6);
  assert.equal(stalenessReport(doc, '2026-12-02').stale, true);
  assert.match(stalenessReport(doc, '2026-12-02').message, /2026-11-24/);
});

test('stalenessReport says so plainly when there is no file at all', () => {
  const report = stalenessReport(null, '2026-12-02');
  assert.equal(report.stale, true);
  assert.match(report.message, /no data\/game\.json/i);
});

// --- 7. the committed file, once the workflow has written one ----------------

test('the committed data/game.json passes every check', (t) => {
  if (!existsSync(path('data/game.json'))) {
    t.skip('data/game.json has not been generated yet; the refresh workflow writes it');
    return;
  }
  const doc = readJson('data/game.json');
  checkGameData(doc, { tickers: TICKERS });
  assert.equal(doc.meta.disclaimer, DISCLAIMER);
  assert.equal(doc.rows.at(-1)[0], doc.meta.liveThrough);
});

// --- 8. the frozen research data is untouched --------------------------------
//
// Nothing in the live pipeline may write data/prices.json or data/results.json.
// These are the exact bytes the published verdicts came from.

test('data/prices.json is still the snapshot the verdicts were computed from', () => {
  const sha = createHash('sha256').update(readFileSync(path('data/prices.json'))).digest('hex');
  const results = readJson('data/results.json');
  assert.equal(
    sha,
    results.snapshot.sha256,
    'data/prices.json no longer matches the SHA-256 recorded in data/results.json. '
    + 'The live pipeline must never write the frozen snapshot.',
  );
  assert.equal(sha, 'ec4a34cc67ae086325e0c782ea8e4fd9fcc77705ed048c48dd9f795d163e1605');
});

test('the frozen snapshot and the published rolling series still end on the freeze date', () => {
  const results = readJson('data/results.json');
  assert.equal(SNAPSHOT.freeze_date, '2026-11-24');
  assert.equal(results.snapshot.freeze_date, '2026-11-24');
  assert.equal(results.snapshot.lastReturnDate, '2026-11-24');
  const rolling = results.hypothesis2.registered.rolling;
  assert.equal(rolling.values.length, 2388, 'the published rolling series changed length');
  assert.equal(rolling.dates.at(-1), '2026-11-24', 'the published rolling series now runs past the freeze date');
});
