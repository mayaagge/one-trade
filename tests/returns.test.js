// Tests for js/returns.js: a price snapshot turned into daily simple returns,
// aligned by date, and sliced to the registered windows.
//
// Written before js/returns.js existed. Synthetic snapshots only - a known-answer
// test must not change when the market does - except for the known answers in
// tests/fixtures/known_answers.json, which numpy computed.
//
// Run: node --test "tests/**/*.test.js"
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CALENDAR_TICKER,
  simpleReturns,
  buildReturns,
} from '../js/returns.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(here, 'fixtures', 'known_answers.json'), 'utf8'));
const REL = fixtures.tolerance.relative;   // 1e-9, CLAUDE.md rule 3
const ABS = fixtures.tolerance.absolute;   // 1e-12

function seriesCase(name) {
  const found = fixtures.series_cases.find((c) => c.name === name);
  assert.ok(found, `fixture ${name} is missing; rerun tests/make_fixtures.py`);
  return found;
}

function assertClose(actual, expected, what) {
  assert.equal(Number.isFinite(actual), true, `${what}: expected a finite number, got ${actual}`);
  const diff = Math.abs(actual - expected);
  const scale = Math.max(Math.abs(expected), Math.abs(actual));
  const ok = scale < 1 ? diff <= Math.max(ABS, scale * REL) : diff / scale <= REL;
  assert.equal(ok, true, `${what}: expected ${expected}, got ${actual} (difference ${diff})`);
}

function assertVectorClose(actual, expected, what) {
  assert.equal(actual.length, expected.length, `${what}: expected ${expected.length} values, got ${actual.length}`);
  for (let i = 0; i < expected.length; i += 1) assertClose(actual[i], expected[i], `${what}[${i}]`);
}

// --- synthetic snapshots -----------------------------------------------------

// A plain weekday calendar, so the test dates are easy to read and to reason
// about. Real trading calendars have holidays; the builder never assumes they do
// not, because it only ever compares a ticker's dates with the calendar ticker's.
function weekdays(from, count) {
  const dates = [];
  const day = new Date(`${from}T00:00:00Z`);
  while (dates.length < count) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) dates.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return dates;
}

// Closes that rise 1% a day from 100, so every return is exactly 0.01 and any
// misalignment shows up as a wrong date rather than as a wrong number.
function risingCloses(count, start = 100) {
  return Array.from({ length: count }, (_, i) => start * 1.01 ** i);
}

function snapshotOf(prices, extra = {}) {
  return {
    fetched_at: '2026-11-25T20:27:33+00:00',
    window_start_requested: '2016-11-24',
    freeze_date: '2026-11-24',
    prices,
    ...extra,
  };
}

// Weekdays from 2016-11-14, which covers the lead-in days before the registered
// window start of 24 November 2016 as well as the window's own first days.
//
// 2016-11-24 is taken out because it was Thanksgiving and the US market was
// closed, which is the fact PREREG_AMENDMENT.md calls out: "the window therefore
// begins at the first trading day on or after 24 November 2016". A synthetic
// calendar of plain weekdays would never exercise that.
const HOLIDAY = '2016-11-24';
const CALENDAR_20 = weekdays('2016-11-14', 21).filter((date) => date !== HOLIDAY);

function simpleSnapshot({ lateStart = 0, drop = null, dropFrom = null } = {}) {
  const closes = risingCloses(CALENDAR_20.length);
  const prices = {
    [CALENDAR_TICKER]: { dates: CALENDAR_20, close: closes },
    FULL: { dates: CALENDAR_20, close: closes },
    LATE: {
      dates: CALENDAR_20.slice(lateStart),
      close: risingCloses(CALENDAR_20.length - lateStart),
    },
  };
  if (drop !== null) {
    const target = dropFrom ?? 'FULL';
    const keep = prices[target].dates
      .map((d, i) => [d, prices[target].close[i]])
      .filter(([d]) => d !== drop);
    prices[target] = { dates: keep.map(([d]) => d), close: keep.map(([, c]) => c) };
  }
  return snapshotOf(prices);
}

// --- simpleReturns -----------------------------------------------------------

test('simpleReturns matches the hand-derivable known answer exactly', () => {
  const fixture = seriesCase('returns_hand_derivable');
  const actual = simpleReturns(fixture.closes);
  assert.equal(actual.length, fixture.closes.length - 1);
  // +10%, -10%, flat, +25%. The flat day must be exactly 0, not 1e-17.
  assertVectorClose(actual, fixture.expected, 'hand-derivable returns');
  assert.equal(actual[2], 0, 'a day with no price change is exactly zero');
});

test('simpleReturns matches numpy over 300 sampled closes to 1e-9', () => {
  const fixture = seriesCase('returns_sampled_300');
  assertVectorClose(simpleReturns(fixture.closes), fixture.expected, 'sampled returns');
});

test('simpleReturns gives one fewer value than closes: the first day has no day before it', () => {
  assert.equal(simpleReturns([1, 2, 3, 4]).length, 3);
  assert.deepEqual(simpleReturns([100, 100]), [0]);
});

test('simpleReturns refuses what it cannot divide', () => {
  assert.throws(() => simpleReturns([100]), /at least 2/);
  assert.throws(() => simpleReturns([]), /at least 2/);
  assert.throws(() => simpleReturns([100, 0, 100]), /not a usable price/);
  assert.throws(() => simpleReturns([100, -5]), /not a usable price/);
  assert.throws(() => simpleReturns([100, null]), /not a usable price/);
  assert.throws(() => simpleReturns([100, NaN]), /not a usable price/);
});

// --- buildReturns: alignment -------------------------------------------------

test('buildReturns lines every ticker up on the calendar ticker\'s own trading days', () => {
  const series = buildReturns(simpleSnapshot({ lateStart: 5 }));

  // A return needs the day before it, so the return dates are the calendar
  // without its first day.
  assert.deepEqual(series.dates, CALENDAR_20.slice(1));
  assert.deepEqual(series.calendar, CALENDAR_20);

  // Every series is the same length, whatever its history: short ones are
  // null-padded rather than shifted, so day t means the same date for all.
  for (const ticker of ['FULL', 'LATE', CALENDAR_TICKER]) {
    assert.equal(series.byTicker[ticker].length, series.dates.length, ticker);
  }
});

test('a ticker that lists late has its first return on the day AFTER its first close', () => {
  const lateStart = 5;
  const series = buildReturns(simpleSnapshot({ lateStart }));
  const late = series.byTicker.LATE;

  // Its first close is CALENDAR_20[5]; the first return it can have is on
  // CALENDAR_20[6], which is series.dates[5].
  const firstDate = CALENDAR_20[lateStart + 1];
  assert.equal(series.dates[lateStart], firstDate);
  assert.equal(series.firstReturnDate.LATE, firstDate);

  for (let t = 0; t < lateStart; t += 1) {
    assert.equal(late[t], null, `LATE must be null on ${series.dates[t]}, before it listed`);
  }
  assertClose(late[lateStart], 0.01, 'LATE\'s first return');

  // And the trimmed/late ticker never reaches back across its own first close:
  // no return of its own is computed from a price it does not have.
  assert.equal(series.byTicker.LATE.filter((v) => v !== null).length,
    CALENDAR_20.length - lateStart - 1);
});

test('buildReturns reports coverage per ticker', () => {
  const series = buildReturns(simpleSnapshot({ lateStart: 5 }));
  assert.equal(series.coverage.FULL.days, series.dates.length);
  assert.equal(series.coverage.LATE.days, series.dates.length - 5);
  assert.equal(series.coverage.LATE.firstDate, CALENDAR_20[6]);
  assert.equal(series.coverage.FULL.complete, true);
  assert.equal(series.coverage.LATE.complete, false);
});

// --- buildReturns: the refusals ----------------------------------------------

test('buildReturns REFUSES a missing interior day, naming the ticker and the date', () => {
  const missing = CALENDAR_20[10];
  assert.throws(
    () => buildReturns(simpleSnapshot({ drop: missing, dropFrom: 'FULL' })),
    (error) => error.message.includes('FULL') && error.message.includes(missing),
    'a gap inside a full-history ticker must stop the run',
  );
});

test('the interior-day refusal covers late-listing tickers too, after their own first date', () => {
  // The rule applies to all 42 tickers: no missing interior day after each
  // ticker's own first date. VRT and PLTR are not exempt just because their
  // late start is registered - a hole in the middle of their history is still a
  // hole, and would silently turn one day's return into two days' worth.
  const missing = CALENDAR_20[12];
  assert.throws(
    () => buildReturns(simpleSnapshot({ lateStart: 5, drop: missing, dropFrom: 'LATE' })),
    (error) => error.message.includes('LATE') && error.message.includes(missing),
  );
});

test('a day BEFORE a ticker\'s own first date is not a gap', () => {
  // This is the whole point of "interior": LATE is missing the first five days
  // of the calendar, and that is registered history, not a fault.
  assert.doesNotThrow(() => buildReturns(simpleSnapshot({ lateStart: 5 })));
});

test('buildReturns refuses a date the calendar ticker does not have', () => {
  const snapshot = simpleSnapshot();
  snapshot.prices.FULL.dates = [...snapshot.prices.FULL.dates, '2016-12-25'];
  snapshot.prices.FULL.close = [...snapshot.prices.FULL.close, 123];
  assert.throws(() => buildReturns(snapshot), /not a trading day|FULL/);
});

test('buildReturns refuses a malformed snapshot', () => {
  assert.throws(() => buildReturns(snapshotOf({})), /\^GSPC/);
  assert.throws(
    () => buildReturns(snapshotOf({ [CALENDAR_TICKER]: { dates: ['2016-11-14'], close: [1, 2] } })),
    /dates and 2 closes|same length/,
  );
  const unsorted = simpleSnapshot();
  unsorted.prices.FULL.dates = [...unsorted.prices.FULL.dates];
  [unsorted.prices.FULL.dates[3], unsorted.prices.FULL.dates[4]] = [unsorted.prices.FULL.dates[4], unsorted.prices.FULL.dates[3]];
  assert.throws(() => buildReturns(unsorted), /order|increasing/);
});

// --- window(): the registered windows ----------------------------------------

test('window() slices by date, both ends inclusive', () => {
  const series = buildReturns(simpleSnapshot());
  const window = series.window(CALENDAR_20[3], CALENDAR_20[6]);
  assert.deepEqual(window.dates, CALENDAR_20.slice(3, 7));
  assert.equal(window.days, 4);
  assert.equal(window.byTicker.FULL.length, 4);
});

test('THE EARLY-WINDOW FIX: the window\'s first day has a return, taken from the lead-in close', () => {
  // The registered earliest window starts on the first trading day on or after
  // 24 November 2016. A return on that day needs the close BEFORE it, which sits
  // outside the window - that is why the fetch now reaches back a few days.
  // Without the lead-in the window silently loses its first day.
  const series = buildReturns(simpleSnapshot());
  const windowStart = '2016-11-24';          // Thanksgiving: no trading
  const firstTradingDay = '2016-11-25';
  const window = series.window(windowStart, CALENDAR_20[12]);

  assert.equal(window.dates[0], firstTradingDay,
    'the window must begin at the first trading day on or after its start date');
  assert.equal(window.byTicker.FULL[0] !== null, true,
    'the first day in the window must carry a return, not a hole');
  assertClose(window.byTicker.FULL[0], 0.01, 'the first in-window return');
});

test('window() bounds that are not trading days fall inside the window, never outside it', () => {
  const series = buildReturns(simpleSnapshot());
  // 2016-11-19 and 2016-11-20 are a Saturday and a Sunday.
  const window = series.window('2016-11-19', '2016-11-20');
  assert.equal(window.days, 0);
  const spanning = series.window('2016-11-19', '2016-11-23');
  assert.deepEqual(spanning.dates, ['2016-11-21', '2016-11-22', '2016-11-23']);
});

test('window() leaves out a ticker that does not cover the whole window, and names it', () => {
  const series = buildReturns(simpleSnapshot({ lateStart: 5 }));
  const window = series.window(CALENDAR_20[1], CALENDAR_20[10]);
  assert.equal(window.byTicker.LATE, undefined, 'a partly covered ticker is not handed out dense');
  assert.deepEqual(window.incomplete.map((m) => m.ticker), ['LATE']);
  assert.equal(window.incomplete[0].days < window.days, true);
  // Everything it does hand out is dense and the same length.
  for (const values of Object.values(window.byTicker)) {
    assert.equal(values.length, window.days);
    assert.equal(values.every((v) => v !== null && Number.isFinite(v)), true);
  }
});

test('windowAllowingGaps() keeps the partly covered ticker, nulls and all', () => {
  // The growing basket needs exactly this: members that have not listed yet are
  // present as null and left out of that day's average.
  const series = buildReturns(simpleSnapshot({ lateStart: 5 }));
  const window = series.windowAllowingGaps(CALENDAR_20[1], CALENDAR_20[10]);
  assert.equal(window.byTicker.LATE.length, window.days);
  assert.equal(window.byTicker.LATE[0], null);
  assert.equal(window.byTicker.LATE.at(-1) !== null, true);
});

// --- commonWindow(): one window for the whole run -----------------------------

test('commonWindow() gives ONE window that every listed ticker covers in full', () => {
  const series = buildReturns(simpleSnapshot({ lateStart: 5 }));
  const window = series.commonWindow(['FULL', 'LATE', CALENDAR_TICKER], 756);

  // LATE's history is the binding constraint, so the window is as long as LATE,
  // and it ends on the freeze date like every other window here.
  assert.equal(window.days, series.coverage.LATE.days);
  assert.equal(window.dates.at(-1), series.dates.at(-1));
  assert.equal(window.startDate, series.coverage.LATE.firstDate);

  // Every holding is handed the same days. This is what stops two portfolios in
  // the same run being scored on different stretches of market history.
  for (const ticker of ['FULL', 'LATE', CALENDAR_TICKER]) {
    assert.equal(window.byTicker[ticker].length, window.days, ticker);
    assert.equal(window.byTicker[ticker].every((v) => v !== null), true, ticker);
  }
});

test('commonWindow() is capped at the days asked for, taken from the most recent end', () => {
  const series = buildReturns(simpleSnapshot());
  const window = series.commonWindow(['FULL', CALENDAR_TICKER], 4);
  assert.equal(window.days, 4);
  assert.deepEqual(window.dates, series.dates.slice(-4));
});

test('commonWindow() refuses a ticker it has never heard of', () => {
  const series = buildReturns(simpleSnapshot());
  assert.throws(() => series.commonWindow(['FULL', 'NOPE'], 10), /NOPE/);
});

test('commonWindow() reports how many days it found, so the caller can call it short', () => {
  // js/hypothesis1.js decides "not enough data" below 252 days; the window itself
  // never makes that call, it only reports what it has.
  const series = buildReturns(simpleSnapshot({ lateStart: 17 }));
  const window = series.commonWindow(['FULL', 'LATE'], 756);
  assert.equal(window.days, 2);
  assert.equal(window.requestedDays, 756);
});

// Educational, not investment advice.
