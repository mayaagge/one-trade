// tests/gamedata.test.js - data/game.json: the live returns the game plays on.
//
// WHAT IS BEING CHECKED HERE. data/game.json is rebuilt every weekday evening by
// a workflow nobody is watching, and the game reads it instead of the frozen
// snapshot. Three things therefore have to be true, and each has tests below:
//
//   1. The returns in it are the SAME returns js/returns.js builds. The game and
//      the research code must apply one rule, so game.json is built by calling
//      buildReturns(), not by a second implementation of the same arithmetic.
//   2. Storing them to 10 decimal places does not move a result by as much as
//      1e-9, which is the agreement this project holds its maths to (CLAUDE.md
//      rule 3). The drift is measured here, not assumed, and 8 decimals is shown
//      to be too few so the figure cannot be quietly shortened later.
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
import {
  GAME_DAYS,
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

test('returns are stored to 10 decimal places', () => {
  assert.equal(DECIMALS, 10);
  assert.equal(roundReturn(0.012345678901234567), 0.0123456789);
  assert.equal(roundReturn(-0.012345678949), -0.0123456789);
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

/** Correlations and effective bets for a few real ticker sets, at a given rounding. */
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
  for (const names of [['JNJ', 'TLT', 'GOOGL', 'LQD', 'COP'], ['VOO', 'QQQ', 'NVDA', 'MSFT', 'META']]) {
    const w = BUILT.commonWindow(names, GAME_DAYS);
    const rows = Array.from({ length: w.days }, (_, t) => names.map((n) => round(w.byTicker[n][t])));
    out.bets.push(effectiveBets(names.map(() => 1 / names.length), covariance(rows)));
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

test('8 decimals would NOT be inside 1e-9, which is why the format is not shorter', () => {
  // This test documents the measurement that chose 10 decimals (BUILD_LOG 2.3a).
  // If a future change shortens the format to save bytes, this is the number it
  // has to answer for.
  assert.ok(
    worstDrift(8) > 1e-9,
    'if 8 decimals now holds to 1e-9, re-measure and update the format decision in BUILD_LOG.md',
  );
});

// --- 3. the builder calls js/returns.js, and agrees with it exactly ----------

test('buildGameData takes the last 756 return dates from js/returns.js', () => {
  const doc = goodDoc();
  const expected = BUILT.dates.slice(-GAME_DAYS);
  assert.equal(doc.rows.length, GAME_DAYS);
  assert.deepEqual(doc.rows.map((row) => row[0]), expected);
  assert.equal(doc.meta.firstDate, expected[0]);
  assert.equal(doc.meta.liveThrough, expected[expected.length - 1]);
  assert.equal(doc.meta.days, GAME_DAYS);
});

test('every value in every row is js/returns.js\'s own value, rounded - no second implementation', () => {
  const doc = goodDoc();
  const from = BUILT.dates.length - GAME_DAYS;
  let checked = 0;
  for (const [t, ticker] of doc.tickers.entries()) {
    const mine = BUILT.byTicker[ticker];
    assert.ok(mine, `${ticker} is in game.json but not in the snapshot`);
    for (let i = 0; i < GAME_DAYS; i += 1) {
      assert.equal(
        doc.rows[i][t + 1],
        roundReturn(mine[from + i]),
        `${ticker} on ${doc.rows[i][0]} does not match buildReturns()`,
      );
      checked += 1;
    }
  }
  assert.equal(checked, GAME_DAYS * doc.tickers.length);
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
  assert.match(doc.meta.liveLabel, /^Live prices through \d{1,2} [A-Z][a-z]+ \d{4}$/);
  assert.equal(doc.meta.liveLabel, 'Live prices through 24 November 2026');
  assert.equal(doc.meta.disclaimer, DISCLAIMER);
});

// --- 4. the layout, which is a decision git has to live with -----------------

test('the file is one line per trading day, so a daily rebuild is a two-line diff', () => {
  const doc = goodDoc();
  const text = formatGameJson(doc);
  const rowLines = text.split('\n').filter((line) => /^\s*\["\d{4}-\d{2}-\d{2}"/.test(line));
  assert.equal(
    rowLines.length,
    GAME_DAYS,
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

test('checkGameData refuses a short window', () => {
  const doc = copy(goodDoc());
  doc.rows.pop();
  doc.meta.days = doc.rows.length;
  assert.throws(() => checkGameData(doc, { tickers: TICKERS }), /755/);
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
