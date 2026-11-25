// tests/liveRolling.test.js - the rolling chart's live tail.
//
// WHAT IS BEING CHECKED HERE. docs/PRD.md allows exactly one chart to move after
// the freeze date: the rolling 126-day correlation of the AI basket with the
// equal-weight S&P 500, which enters no verdict. Everything else on the Research
// page is read from data/results.json and never changes. Four things therefore
// have to be true, and each has tests below:
//
//   1. The frozen half NEVER MOVES. Values through 2026-11-24 come out of
//      data/results.json unchanged, and no date on or before the freeze date is
//      ever appended from live prices.
//   2. The two halves are the SAME MEASURE: the same basket members, the same
//      benchmark and the same 126-day window, computed by the same
//      rollingCorrelation() the verdicts used. The join is checked at the freeze
//      date itself, where both halves have a value, and refuses a tail that
//      disagrees by more than 1e-4 (BUILD_LOG.md, session 2.3a: Yahoo's adjusted
//      closes drift by about 1e-6 between fetches for dividend payers, so the
//      tripwire is set well above that and well below anything meaningful).
//   3. The empty and one-day cases say so in a sentence instead of drawing a
//      band nobody can see. The freeze date was yesterday, so the one-day case
//      is the live one today.
//   4. A broken game.json loses the tail, not the page. Every refusal is a
//      status and a reason, never a wrong line.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeRng } from '../js/rng.js';
import { equalWeightBasket, rollingCorrelation } from '../js/hypothesis2.js';
import {
  JOIN_TOLERANCE,
  SHADE_LABEL,
  tickerSeries,
  gameDates,
  computeLiveRolling,
  appendLiveTail,
  liveTailState,
} from '../js/liveRolling.js';

const read = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8'));
const RESULTS = read('../data/results.json');
const GAME = read('../data/game.json');

const FREEZE = RESULTS.registered.freezeDate;
const FROZEN = RESULTS.hypothesis2.registered.rolling;
const MEMBERS = RESULTS.hypothesis2.registered.members;

// --- hand-made fixtures ------------------------------------------------------
//
// A small game file: 20 trading days, a window of 5, so a rolling value can be
// checked against rollingCorrelation() directly and counted by hand.

const SMALL_WINDOW = 5;

/** Trading dates as plain ISO strings; they only have to be ascending. */
function fixtureDates(count, { from = 1 } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const day = from + i;
    return `2026-11-${String(day).padStart(2, '0')}`;
  });
}

/**
 * A game.json-shaped document with pseudo-random returns.
 * `overrides` replaces whole columns, so a test can plant a null or a gap.
 */
function makeGame(tickers, dates, { seed = 7, overrides = {}, freezeDate = null } = {}) {
  const rng = makeRng(seed);
  const columns = new Map(tickers.map((ticker) => [
    ticker,
    overrides[ticker] ?? dates.map(() => (rng.uniform() - 0.5) / 50),
  ]));
  return {
    meta: {
      days: dates.length,
      firstDate: dates[0],
      liveThrough: dates[dates.length - 1],
      // Omitted unless a test is about the freeze date the file records.
      ...(freezeDate === null ? {} : { researchFreezeDate: freezeDate }),
      disclaimer: 'Educational, not investment advice.',
    },
    tickers: [...tickers],
    rows: dates.map((date, t) => [date, ...tickers.map((ticker) => columns.get(ticker)[t])]),
  };
}

/** The frozen half a fixture is joined to: the real measure, from the fixture. */
function frozenFor(game, { members, benchmark, window, upTo }) {
  const dates = gameDates(game);
  const basket = equalWeightBasket(
    Object.fromEntries(members.map((m) => [m, tickerSeries(game, m)])),
    members,
  );
  const series = rollingCorrelation(basket, tickerSeries(game, benchmark), { window, dates });
  const cut = series.dates.filter((d) => d <= upTo).length;
  return { window, dates: series.dates.slice(0, cut), values: series.values.slice(0, cut) };
}

// ------------------------------------------------------------ tickerSeries

test('tickerSeries() pulls one ticker’s column out of the rows', () => {
  const game = makeGame(['AAA', 'BBB'], fixtureDates(3));
  assert.deepEqual(tickerSeries(game, 'AAA'), game.rows.map((row) => row[1]));
  assert.deepEqual(tickerSeries(game, 'BBB'), game.rows.map((row) => row[2]));
});

test('tickerSeries() refuses a ticker the file does not carry', () => {
  const game = makeGame(['AAA'], fixtureDates(3));
  assert.throws(() => tickerSeries(game, 'RSP'), /RSP/);
});

test('gameDates() reads the date column, oldest first', () => {
  const dates = fixtureDates(4);
  assert.deepEqual(gameDates(makeGame(['AAA'], dates)), dates);
});

// ------------------------------------------------------- computeLiveRolling

test('computeLiveRolling() keeps only windows ending after the freeze date', () => {
  // 10 days, freeze on the 6th: windows end on days 5..10, so days 7..10 are live.
  const dates = fixtureDates(10);
  const game = makeGame(['AAA', 'BBB', 'RSP'], dates);
  const live = computeLiveRolling(game, {
    members: ['AAA', 'BBB'], benchmark: 'RSP', window: SMALL_WINDOW, freezeDate: dates[5],
  });
  assert.deepEqual(live.dates, dates.slice(6));
  assert.equal(live.values.length, 4);
});

test('computeLiveRolling() computes the same numbers as rollingCorrelation()', () => {
  const dates = fixtureDates(14);
  const members = ['AAA', 'BBB', 'CCC'];
  const game = makeGame([...members, 'RSP'], dates);
  const freezeDate = dates[9];

  const live = computeLiveRolling(game, {
    members, benchmark: 'RSP', window: SMALL_WINDOW, freezeDate,
  });
  const direct = frozenFor(game, { members, benchmark: 'RSP', window: SMALL_WINDOW, upTo: dates[13] });

  for (let i = 0; i < live.dates.length; i += 1) {
    const at = direct.dates.indexOf(live.dates[i]);
    assert.notEqual(at, -1, `${live.dates[i]} is not a window end`);
    assert.equal(live.values[i], direct.values[at]);
  }
});

test('computeLiveRolling() reports the value on the freeze date itself, for the join', () => {
  const dates = fixtureDates(12);
  const game = makeGame(['AAA', 'BBB', 'RSP'], dates);
  const freezeDate = dates[8];
  const live = computeLiveRolling(game, {
    members: ['AAA', 'BBB'], benchmark: 'RSP', window: SMALL_WINDOW, freezeDate,
  });
  const direct = frozenFor(game, {
    members: ['AAA', 'BBB'], benchmark: 'RSP', window: SMALL_WINDOW, upTo: freezeDate,
  });
  assert.equal(live.joinDate, freezeDate);
  assert.equal(live.joinValue, direct.values[direct.values.length - 1]);
});

test('computeLiveRolling() refuses a member with a hole inside the window', () => {
  const dates = fixtureDates(10);
  const holed = Array.from({ length: 10 }, (_, i) => (i === 7 ? null : 0.001 * (i + 1)));
  const game = makeGame(['AAA', 'BBB', 'RSP'], dates, { overrides: { BBB: holed } });
  assert.throws(() => computeLiveRolling(game, {
    members: ['AAA', 'BBB'], benchmark: 'RSP', window: SMALL_WINDOW, freezeDate: dates[5],
  }), /BBB/);
});

test('computeLiveRolling() refuses a file that records a different freeze date', () => {
  const dates = fixtureDates(10);
  const game = makeGame(['AAA', 'BBB', 'RSP'], dates, { freezeDate: '2026-11-30' });
  assert.throws(() => computeLiveRolling(game, {
    members: ['AAA', 'BBB'], benchmark: 'RSP', window: SMALL_WINDOW, freezeDate: dates[5],
  }), /2026-11-30/);
});

test('computeLiveRolling() refuses a file too short to fill one window', () => {
  const dates = fixtureDates(4);
  const game = makeGame(['AAA', 'BBB', 'RSP'], dates);
  assert.throws(() => computeLiveRolling(game, {
    members: ['AAA', 'BBB'], benchmark: 'RSP', window: SMALL_WINDOW, freezeDate: dates[2],
  }), /126|window/i);
});

// ----------------------------------------------------------- appendLiveTail

test('appendLiveTail() leaves every frozen value exactly as it was', () => {
  const frozen = { dates: ['2026-11-23', '2026-11-24'], values: [0.5, 0.6] };
  const joined = appendLiveTail(frozen, { dates: ['2026-11-25'], values: [0.7] }, FREEZE);
  assert.deepEqual(joined.dates, ['2026-11-23', '2026-11-24', '2026-11-25']);
  assert.deepEqual(joined.values, [0.5, 0.6, 0.7]);
  assert.equal(joined.freezeIndex, 1);
  assert.equal(joined.liveCount, 1);
  // The frozen arrays themselves are not touched.
  assert.deepEqual(frozen.dates, ['2026-11-23', '2026-11-24']);
  assert.deepEqual(frozen.values, [0.5, 0.6]);
});

test('appendLiveTail() drops any live date on or before the freeze date', () => {
  const frozen = { dates: ['2026-11-23', '2026-11-24'], values: [0.5, 0.6] };
  const live = { dates: ['2026-11-23', '2026-11-24', '2026-11-25'], values: [9, 9, 0.7] };
  const joined = appendLiveTail(frozen, live, FREEZE);
  assert.deepEqual(joined.dates, ['2026-11-23', '2026-11-24', '2026-11-25']);
  assert.deepEqual(joined.values, [0.5, 0.6, 0.7]);
  assert.equal(joined.liveCount, 1);
});

test('appendLiveTail() with nothing live returns the frozen series alone', () => {
  const frozen = { dates: ['2026-11-24'], values: [0.6] };
  const joined = appendLiveTail(frozen, { dates: [], values: [] }, FREEZE);
  assert.deepEqual(joined.dates, ['2026-11-24']);
  assert.equal(joined.liveCount, 0);
  assert.equal(joined.freezeIndex, 0);
});

test('appendLiveTail() refuses a frozen series that runs past the freeze date', () => {
  const frozen = { dates: ['2026-11-24', '2026-11-25'], values: [0.6, 0.7] };
  assert.throws(
    () => appendLiveTail(frozen, { dates: [], values: [] }, FREEZE),
    /freeze/i,
  );
});

// ------------------------------------------------------------ liveTailState

function stateFor(dayCount, { window = SMALL_WINDOW } = {}) {
  const dates = fixtureDates(dayCount);
  const members = ['AAA', 'BBB'];
  const game = makeGame([...members, 'RSP'], dates);
  // The freeze date is the 8th day, so the live tail is dayCount - 8 days long.
  const freezeDate = dates[7];
  const frozen = frozenFor(game, { members, benchmark: 'RSP', window, upTo: freezeDate });
  return liveTailState({ frozen, game, members, benchmark: 'RSP', freezeDate, window });
}

test('liveTailState() shades a band once two or more days have closed', () => {
  const state = stateFor(11);
  assert.equal(state.status, 'band');
  assert.equal(state.liveCount, 3);
  assert.deepEqual(state.shade, { fromIndex: state.freezeIndex + 1, label: SHADE_LABEL, band: true });
  assert.match(state.sentence, /3 trading days/);
  assert.match(state.sentence, /enters no verdict/);
});

test('liveTailState() names a single live day instead of drawing a band', () => {
  const state = stateFor(9);
  assert.equal(state.status, 'one-day');
  assert.equal(state.liveCount, 1);
  assert.equal(state.shade.band, false);
  assert.match(state.sentence, /One trading day/);
  assert.match(state.sentence, /2026-11-09/);
  assert.match(state.sentence, /enters no verdict/);
});

test('liveTailState() says so plainly when no day has closed after the freeze date', () => {
  const state = stateFor(8);
  assert.equal(state.status, 'none');
  assert.equal(state.liveCount, 0);
  assert.equal(state.shade, null);
  assert.match(state.sentence, /No trading day/);
  assert.match(state.sentence, /2026-11-08/);
});

test('liveTailState() keeps the frozen values in every case', () => {
  for (const days of [8, 9, 11]) {
    const state = stateFor(days);
    const frozen = state.frozen;
    for (let i = 0; i < frozen.values.length; i += 1) {
      assert.equal(state.values[i], frozen.values[i]);
      assert.equal(state.dates[i], frozen.dates[i]);
    }
    assert.equal(state.dates.length, frozen.dates.length + state.liveCount);
  }
});

test('liveTailState() refuses a tail that does not join the frozen half', () => {
  const dates = fixtureDates(11);
  const members = ['AAA', 'BBB'];
  const game = makeGame([...members, 'RSP'], dates);
  const freezeDate = dates[7];
  const frozen = frozenFor(game, { members, benchmark: 'RSP', window: SMALL_WINDOW, upTo: freezeDate });
  // Move the last frozen value by more than the tolerance: the two halves are
  // then not the same measure, whatever the live numbers say.
  frozen.values[frozen.values.length - 1] += 10 * JOIN_TOLERANCE;

  const state = liveTailState({
    frozen, game, members, benchmark: 'RSP', freezeDate, window: SMALL_WINDOW,
  });
  assert.equal(state.status, 'unavailable');
  assert.match(state.reason, /join/i);
  assert.equal(state.liveCount, 0);
  assert.deepEqual(state.values, frozen.values);
});

test('liveTailState() turns a broken game file into a status, not a throw', () => {
  const dates = fixtureDates(11);
  const members = ['AAA', 'BBB'];
  const good = makeGame([...members, 'RSP'], dates);
  const freezeDate = dates[7];
  const frozen = frozenFor(good, { members, benchmark: 'RSP', window: SMALL_WINDOW, upTo: freezeDate });
  const base = { frozen, members, benchmark: 'RSP', freezeDate, window: SMALL_WINDOW };

  const cases = [
    ['no file at all', null],
    ['no rows', { meta: {}, tickers: ['AAA'], rows: [] }],
    ['the benchmark missing', makeGame([...members], dates)],
    ['a member missing', makeGame(['AAA', 'RSP'], dates)],
    ['too few days', makeGame([...members, 'RSP'], fixtureDates(4))],
  ];
  for (const [what, game] of cases) {
    const state = liveTailState({ ...base, game });
    assert.equal(state.status, 'unavailable', what);
    assert.ok(state.reason.length > 0, `${what} has no reason`);
    assert.equal(state.shade, null, what);
    assert.deepEqual(state.values, frozen.values, what);
    assert.match(state.sentence, /frozen series only/i, what);
  }
});

// -------------------------------------------------- the real committed data

test('the live half joins the frozen half at the freeze date', () => {
  // BUILD_LOG.md, session 2.3a: Yahoo's adjusted closes move by about 1e-6
  // between fetches for dividend payers, and game.json stores returns to 10
  // decimals, so the halves will not join perfectly. Measured on the committed
  // files on 2026-11-25: 2.4e-10. Anything above 1e-4 is a real fault.
  const live = computeLiveRolling(GAME, {
    members: MEMBERS,
    benchmark: RESULTS.hypothesis2.registered.benchmark,
    window: FROZEN.window,
    freezeDate: FREEZE,
  });
  assert.equal(live.joinDate, FREEZE);
  const frozenLast = FROZEN.values[FROZEN.values.length - 1];
  const gap = Math.abs(live.joinValue - frozenLast);
  assert.ok(gap <= JOIN_TOLERANCE, `the halves differ by ${gap} at ${FREEZE}`);
  assert.ok(gap <= 1e-9, `drifted to ${gap}: above the 1e-9 this project holds its maths to`);
});

test('the committed files produce a tail that starts after the freeze date', () => {
  const state = liveTailState({
    frozen: FROZEN,
    game: GAME,
    members: MEMBERS,
    benchmark: RESULTS.hypothesis2.registered.benchmark,
    freezeDate: FREEZE,
    window: FROZEN.window,
  });
  assert.notEqual(state.status, 'unavailable', state.reason);

  // Every appended date is a trading day in game.json after the freeze date.
  const after = gameDates(GAME).filter((d) => d > FREEZE);
  assert.equal(state.liveCount, after.length);
  assert.deepEqual(state.dates.slice(FROZEN.dates.length), after);

  // And the published half is untouched, value for value.
  assert.deepEqual(state.dates.slice(0, FROZEN.dates.length), FROZEN.dates);
  assert.deepEqual(state.values.slice(0, FROZEN.dates.length), FROZEN.values);
  assert.equal(state.freezeIndex, FROZEN.dates.length - 1);
  assert.equal(state.dates[state.freezeIndex], FREEZE);
});

test('both committed files name the same freeze date', () => {
  assert.equal(GAME.meta.researchFreezeDate, FREEZE);
});

test('the frozen series still ends on the freeze date', () => {
  // If this ever fails, data/results.json was regenerated against live prices.
  assert.equal(FROZEN.dates[FROZEN.dates.length - 1], FREEZE);
  assert.equal(FROZEN.window, 126);
});
