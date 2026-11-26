// tests/crash.test.js - Crash replay's windows and the file they come from.
//
// The arithmetic is checked against numpy in tests/math.test.js, over the replay
// cases in tests/fixtures/known_answers.json. What is checked HERE is everything
// that is about real data and real windows:
//
//   1. THE FILE. data/crashes.json carries the three windows docs/PRD.md fixes,
//      starting and ending on the days it names, and no window draws a holding
//      that had not listed yet.
//   2. THE CONVENTION. A replay starts at a close: the rows are the returns
//      AFTER the window's first date, and a path has one more point than rows.
//   3. THE SOURCE. The returns are the committed snapshot's own, and where a
//      window overlaps data/game.json, both files agree - the 2025 selloff sits
//      inside the game's 756 days, so it is read twice from two files and must
//      come out the same.
//   4. WHAT IT REFUSES. A ticker with no prices in a window, and a file whose
//      dates do not describe its own rows.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildReturns } from '../js/returns.js';
import { tickerSeries, gameDates } from '../js/gameView.js';
import {
  STARTING_DOLLARS,
  availableIn,
  buyAndHoldPath,
  createBuild,
  deepestFall,
  elsewhereFor,
  fallAgainstIndex,
  formatShortDate,
  readWindow,
  replay,
  totalChange,
  unavailableIn,
  validateCrashes,
  windowByKey,
} from '../js/crash.js';
import { WINDOWS, INDEX_TICKER, INDEX_LABEL, buildCrashData } from '../scripts/build_crash_data.mjs';

// DEFERRED IN THE REFRESH WORKFLOW. The tests marked CROSS_FETCH below compare
// numbers that came from TWO DIFFERENT DOWNLOADS of the same prices. Yahoo's
// adjusted closes move between fetches - docs/PRD.md measures it at up to
// 1.2e-6 relative - so these can fail for a reason no commit caused, and the
// scheduled refresh of 26 November 2026 did exactly that: a re-adjustment went
// red in the step that runs BEFORE the commit, and kept a good evening of
// prices out of the game. The refresh workflow now sets
// ONE_TRADE_SKIP_CROSS_FETCH=1 for its pre-commit run and runs these after it
// has committed, beside `build_puzzles.mjs --check`. Ordinary pushes run them
// normally, where game.json is the committed file and does not move.
const CROSS_FETCH = process.env.ONE_TRADE_SKIP_CROSS_FETCH === '1'
  ? { skip: 'compares two fetches; the refresh workflow runs this after the commit' }
  : {};


const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));

const CRASHES = validateCrashes(readJson('data/crashes.json'));
const TICKERS = readJson('tickers.json');
const UNIVERSE = TICKERS.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
const GAME = readJson('data/game.json');

/** An even split of the pretend money, which is what a replay starts from. */
function evenDollars(tickers, total = STARTING_DOLLARS) {
  const each = total / tickers.length;
  return Object.fromEntries(tickers.map((t) => [t, each]));
}

// -------------------------------------------------------------- the file

test('data/crashes.json carries the three windows the PRD fixes, to the day', () => {
  assert.deepEqual(CRASHES.windows.map((w) => w.key), ['crash2020', 'bear2022', 'ai2025']);
  const byKey = Object.fromEntries(CRASHES.windows.map((w) => [w.key, w]));
  assert.equal(byKey.crash2020.from, '2020-02-19');
  assert.equal(byKey.crash2020.to, '2020-03-23');
  assert.equal(byKey.bear2022.from, '2022-01-03');
  assert.equal(byKey.bear2022.to, '2022-10-12');
  assert.equal(byKey.ai2025.from, '2025-01-24');
  assert.equal(byKey.ai2025.to, '2025-02-28');
  // And the script that wrote it asks for exactly those.
  assert.deepEqual(WINDOWS.map((w) => [w.from, w.to]),
    CRASHES.windows.map((w) => [w.from, w.to]));
});

test('every window has a heading name and an in-sentence name, and they are the same words', () => {
  // A name that reads right as a heading reads wrong inside a sentence: level 6's
  // card said "in The 2022 bear market" until the second form existed. The two
  // are written out separately in build_crash_data.mjs, because lowercasing the
  // first word would turn a window named "Black Monday" into "black Monday" - so
  // what holds them together is this test, not a rule in the code.
  for (const window of CRASHES.windows) {
    assert.equal(typeof window.inSentence, 'string');
    assert.ok(window.inSentence.length > 0, `${window.key} has no in-sentence name`);
    // The same words, differing in case and in nothing else.
    assert.equal(window.inSentence.toLowerCase(), window.title.toLowerCase(),
      `${window.key}: the two names are not the same words`);
    // The heading form is capitalised and the in-sentence form is not, which is
    // the whole difference between them.
    assert.match(window.title, /^[A-Z]/, `${window.key}'s title should open a heading`);
    assert.match(window.inSentence, /^[a-z]/, `${window.key}'s in-sentence name should not`);
    // Only the first word changes: "the January 2025 AI selloff" keeps January
    // and AI, because they are a month and a thing rather than a sentence start.
    assert.equal(window.inSentence.split(' ').slice(1).join(' '),
      window.title.split(' ').slice(1).join(' '),
      `${window.key}: only the leading word may differ in case`);
  }
  // The file and the script that writes it agree on both forms.
  assert.deepEqual(WINDOWS.map((w) => [w.title, w.inSentence]),
    CRASHES.windows.map((w) => [w.title, w.inSentence]));
});

test('a window without an in-sentence name is refused, not quietly headed instead', () => {
  const doc = structuredClone(CRASHES);
  delete doc.windows[1].inSentence;
  assert.throws(() => validateCrashes(doc), /inSentence is missing/);
});

test('the card for a replay names the other window mid-sentence', () => {
  // The end to end of it: the lesson portfolio's card, with the name as it
  // actually reads inside the sentence.
  const result = replay(CRASHES, 'crash2020', { WMT: 3000, PG: 3000, TLT: 2000, BND: 2000 });
  assert.equal(result.window.inSentence, 'the 2020 crash');
  const other = elsewhereFor(CRASHES, 'crash2020', 'TLT').find((w) => w.key === 'bear2022');
  assert.equal(other.inSentence, 'the 2022 bear market');
  assert.equal(other.title, 'The 2022 bear market', 'and the heading form is still there');
});

test('both lines include dividends, because the index line is a fund', () => {
  assert.equal(CRASHES.meta.indexTicker, 'VOO');
  assert.equal(CRASHES.meta.indexLabel, 'S&P 500 (VOO, with dividends)');
  assert.equal(INDEX_TICKER, CRASHES.meta.indexTicker);
  assert.equal(INDEX_LABEL, CRASHES.meta.indexLabel);
  // Every window has to carry it, or a replay would have nothing to draw against.
  for (const window of CRASHES.windows) {
    assert.ok(window.tickers.includes('VOO'), `${window.key} does not carry VOO`);
  }
});

test('the file records the exact snapshot bytes it came from', () => {
  assert.match(CRASHES.meta.pricesSha256, /^[0-9a-f]{64}$/);
  assert.equal(CRASHES.meta.pricesFrom, 'data/prices.json');
});

// --------------------------------------------------- a replay starts at a close

test('the rows are the returns after the opening close, not including it', () => {
  for (const window of CRASHES.windows) {
    assert.equal(window.startDate, window.from);
    assert.ok(window.rows[0][0] > window.startDate,
      `${window.key}: its first return is dated ${window.rows[0][0]}, not after ${window.startDate}`);
    assert.equal(window.rows[window.rows.length - 1][0], window.to);
  }
});

test('a path has one more point than the window has returns', () => {
  const window = windowByKey(CRASHES, 'crash2020');
  const { matrix, dates } = readWindow(window, ['VOO', 'BND']);
  assert.equal(matrix.length, window.rows.length);
  assert.equal(dates.length, window.rows.length + 1);
  assert.equal(dates[0], window.startDate, 'the first point is the money as it went in');
  assert.equal(dates[dates.length - 1], window.to);
  assert.equal(buyAndHoldPath([5000, 5000], matrix).length, dates.length);
});

test('the 2020 crash is the published fall, which is what the convention buys', () => {
  // Starting at the 19 February close gives -33.99% for VOO. Counting that day's
  // own move as well would read about -34.0 against a different number entirely;
  // the point of the convention is that this one matches what is published.
  const result = replay(CRASHES, 'crash2020', { VOO: STARTING_DOLLARS });
  assert.ok(Math.abs(result.change - (-0.3399)) < 0.0001, `VOO fell ${result.change}`);
  assert.equal(result.change, result.indexChange, 'a portfolio of VOO alone IS the index line');
  assert.equal(result.dates[0], '2020-02-19');
  assert.equal(result.window.days, 23);
});

// ------------------------------------------------------------- the source

test('the returns are the committed snapshot’s own, to the stored precision', () => {
  // Rebuilt from data/prices.json by the same code the research uses, then
  // compared with what the file carries.
  const built = buildReturns(readJson('data/prices.json'));
  for (const window of CRASHES.windows) {
    const dates = gameDates(window);
    for (const ticker of ['VOO', 'QQQ', 'NVDA', 'BND']) {
      const fromFile = tickerSeries(window, ticker);
      for (const [i, date] of dates.entries()) {
        const at = built.dates.indexOf(date);
        assert.ok(at >= 0, `${date} is not a trading day in the snapshot`);
        const expected = Number(built.byTicker[ticker][at].toFixed(CRASHES.meta.decimals));
        assert.equal(fromFile[i], expected,
          `${window.key} ${ticker} on ${date}: file ${fromFile[i]}, snapshot ${expected}`);
      }
    }
  }
});

test('where a window overlaps data/game.json, the two files agree', CROSS_FETCH, () => {
  // The 2025 selloff sits inside the game's 756-day window, so the same returns
  // exist in both files, built from two different fetches of the same prices.
  // docs/PRD.md records what that costs: up to 1.2e-6 relative for a dividend
  // payer. A disagreement bigger than that would mean one of the files was built
  // against the wrong calendar.
  const window = windowByKey(CRASHES, 'ai2025');
  const gameDays = gameDates(GAME);
  const dates = gameDates(window);
  let compared = 0;
  let worst = 0;
  for (const ticker of ['VOO', 'QQQ', 'NVDA', 'KO']) {
    const fromCrashes = tickerSeries(window, ticker);
    const fromGame = tickerSeries(GAME, ticker);
    for (const [i, date] of dates.entries()) {
      const at = gameDays.indexOf(date);
      if (at === -1) continue;
      const gap = Math.abs(fromCrashes[i] - fromGame[at]);
      worst = Math.max(worst, gap);
      compared += 1;
    }
  }
  assert.ok(compared > 50, `only ${compared} days overlapped, which is too few to check`);
  assert.ok(worst <= 1e-5, `the two files differ by ${worst} on a day they share`);
  console.log(`    the two files agree on ${compared} shared days, worst gap ${worst.toExponential(2)}`);
});

test('the builder refuses a window that does not open on a trading day', () => {
  const built = buildReturns(readJson('data/prices.json'));
  const tickers = ['VOO', 'BND'];
  // 4 July 2022 was a holiday, and a window has to open on a day with a close.
  assert.throws(
    () => buildCrashData(built, tickers, 'x', [{ key: 'holiday', title: 'x', from: '2022-07-04', to: '2022-07-29' }]),
    /not a trading day/,
  );
});

// ------------------------------------------------------- what it refuses

test('a holding with no prices in a window cannot be replayed through it', () => {
  const window = windowByKey(CRASHES, 'crash2020');
  const missing = unavailableIn(window, 'PLTR');
  assert.ok(missing, 'PLTR listed in September 2020, so it is not in the 2020 crash');
  assert.equal(missing.firstDate, '2020-10-01');
  assert.equal(window.tickers.includes('PLTR'), false);

  // It is refused rather than drawn as a flat line or counted as a zero return.
  assert.throws(() => readWindow(window, ['VOO', 'PLTR']), /PLTR has no prices/);
  assert.throws(() => replay(CRASHES, 'crash2020', { VOO: 5000, PLTR: 5000 }), /PLTR has no prices/);

  // And the picker is told which names it may offer.
  const available = availableIn(window, UNIVERSE);
  assert.equal(available.includes('PLTR'), false);
  assert.equal(available.length, UNIVERSE.length - 1);
  // The other two windows can hold everything.
  for (const key of ['bear2022', 'ai2025']) {
    assert.equal(availableIn(windowByKey(CRASHES, key), UNIVERSE).length, UNIVERSE.length);
  }
});

test('validateCrashes refuses a file that does not describe its own rows', () => {
  const broken = (change) => {
    const copy = structuredClone(CRASHES);
    change(copy);
    return copy;
  };
  assert.throws(() => validateCrashes(broken((d) => { d.windows[0].startDate = '2020-02-18'; })),
    /is not the window's own first date/);
  assert.throws(() => validateCrashes(broken((d) => { d.windows[0].rows[0][0] = '2020-02-19'; })),
    /not after the opening close/);
  assert.throws(() => validateCrashes(broken((d) => { d.windows[0].rows.pop(); })),
    /its last return is dated/);
  assert.throws(() => validateCrashes(broken((d) => { d.meta.indexTicker = 'SPY'; })),
    /does not carry SPY/);
  assert.throws(() => validateCrashes(broken((d) => { d.windows[0].rows[3] = ['2020-02-25']; })),
    /does not have a date and one return/);
  assert.throws(() => validateCrashes({ meta: CRASHES.meta, windows: [] }), /non-empty windows/);
});

test('windowByKey names what was asked for when it is not there', () => {
  assert.throws(() => windowByKey(CRASHES, 'crash1987'), /no window "crash1987"/);
});

// ------------------------------------------------------------ the replay

test('a replay draws both lines from the same money and the same arithmetic', () => {
  const dollars = evenDollars(['VOO', 'BND', 'GLD', 'XOM']);
  const result = replay(CRASHES, 'crash2020', dollars);

  assert.equal(result.start, STARTING_DOLLARS);
  assert.equal(result.path[0], STARTING_DOLLARS);
  assert.equal(result.indexPath[0], STARTING_DOLLARS, 'the index starts at the same money');
  assert.equal(result.path.length, result.dates.length);
  assert.equal(result.indexPath.length, result.dates.length);
  assert.equal(result.indexLabel, 'S&P 500 (VOO, with dividends)');

  // The numbers under the chart are the paths' own ends and lows.
  assert.equal(result.change, totalChange(result.path));
  assert.equal(result.indexChange, totalChange(result.indexPath));
  assert.equal(result.deepest, deepestFall(result.path));
  assert.equal(result.end, result.path[result.path.length - 1]);
});

test('a replay is bought and held: the weights drift as prices move', () => {
  // Held, 60% VOO and 40% TLT through the 2020 crash falls about 14.7%.
  // Rebalanced every close it falls about 16.4%, and that is a different
  // portfolio - see the note at the top of js/crash.js.
  const result = replay(CRASHES, 'crash2020', { VOO: 6000, TLT: 4000 });
  assert.ok(Math.abs(result.change - (-0.147)) < 0.002, `it fell ${result.change}`);
  assert.ok(result.change > result.indexChange, 'it fell less than the index');
});

test('the comparison level 6 will ask for: less than half the index’s fall', () => {
  const held = replay(CRASHES, 'crash2020', { VOO: 6000, TLT: 4000 });
  const against = fallAgainstIndex(held);
  assert.equal(against.indexFell, true);
  assert.ok(against.share < 0.5, `it fell ${against.share} of the index's fall`);

  // All in the fund, which is the index: exactly 1, never less than half of it.
  const allIn = fallAgainstIndex(replay(CRASHES, 'crash2020', { VOO: STARTING_DOLLARS }));
  assert.ok(Math.abs(allIn.share - 1) < 1e-12);

  // A window the index ended up in gets no share at all, rather than a share of
  // a rise reading as if it were a share of a fall.
  const rise = fallAgainstIndex({ change: -0.02, indexChange: 0.05 });
  assert.equal(rise.share, null);
  assert.equal(rise.indexFell, false);
});

test('every window can be replayed by a portfolio of any one holding it carries', () => {
  // A guard against a window that is unplayable for some ticker: every name the
  // file says it carries has to produce a finite line.
  for (const window of CRASHES.windows) {
    for (const ticker of availableIn(window, UNIVERSE)) {
      const result = replay(CRASHES, window.key, { [ticker]: STARTING_DOLLARS });
      assert.ok(Number.isFinite(result.change),
        `${ticker} produced no line in ${window.key}`);
      assert.ok(result.path.every((value) => Number.isFinite(value) && value > 0),
        `${ticker}'s line in ${window.key} is not a line`);
    }
  }
});

test('the three windows tell the story the PRD says they do', () => {
  const index = (key) => replay(CRASHES, key, { VOO: STARTING_DOLLARS }).change;
  assert.ok(Math.abs(index('crash2020') - (-0.3399)) < 0.0001);
  assert.ok(Math.abs(index('bear2022') - (-0.2452)) < 0.0001);
  assert.ok(Math.abs(index('ai2025') - (-0.0227)) < 0.0001);

  // Nvidia's one-day fall of about 17% is the first move the AI selloff draws,
  // which is why that window starts on the Friday before it.
  const window = windowByKey(CRASHES, 'ai2025');
  const nvda = tickerSeries(window, 'NVDA');
  assert.equal(gameDates(window)[0], '2025-01-27');
  assert.ok(Math.abs(nvda[0] - (-0.17)) < 0.005, `NVDA's first drawn day is ${nvda[0]}`);
});

// -------------------------------------------------------------- the build

test('createBuild() accepts any number of holdings, split evenly', () => {
  const window = windowByKey(CRASHES, 'bear2022');
  const build = createBuild(availableIn(window, UNIVERSE));
  assert.equal(build.total, STARTING_DOLLARS);
  assert.equal(build.required.length, 0, 'Crash replay deals nothing and requires nothing');

  build.togglePick('VOO');
  build.togglePick('BND');
  build.togglePick('GLD');
  assert.deepEqual(build.picks, ['VOO', 'BND', 'GLD']);
  assert.equal(build.allocated(), STARTING_DOLLARS);
  assert.equal(build.buildComplete(), true);
  for (const ticker of build.picks) assert.ok(build.dollars[ticker] > 0);

  // No cap: a fourth, a fifth, however many the player wants to pick.
  build.togglePick('XOM');
  build.togglePick('JNJ');
  assert.equal(build.picks.length, 5);
  assert.equal(build.allocated(), STARTING_DOLLARS);
});

test('createBuild() refuses a ticker outside its own pool', () => {
  const window = windowByKey(CRASHES, 'crash2020');
  const build = createBuild(availableIn(window, UNIVERSE));
  assert.throws(() => build.togglePick('PLTR'), /not in this game's universe/);
});

test('createBuild() refuses a ticker its own isAvailable rule rejects - the build layer, not only the picker', () => {
  // This is how js/crashReplay.js actually uses it: the pool is the WHOLE
  // universe, so an unavailable ticker still appears (disabled) in the picker,
  // and isAvailable is what stops it being added even if a click reached
  // togglePick() anyway - the same defense-in-depth js/round.js uses for a
  // required holding it will not let go.
  const window = windowByKey(CRASHES, 'crash2020');
  const build = createBuild(UNIVERSE, { isAvailable: (ticker) => !unavailableIn(window, ticker) });
  assert.ok(build.pool.includes('PLTR'), 'PLTR is still in the pool, so the picker can show and explain it');
  assert.throws(() => build.togglePick('PLTR'), /not available for this build/);
  // An available ticker is unaffected.
  build.togglePick('VOO');
  assert.deepEqual(build.picks, ['VOO']);
  // Removing a HELD ticker never consults isAvailable - only adding does.
  assert.doesNotThrow(() => build.togglePick('VOO'));
});

test('createBuild() moves money in $100 steps and never empties a holding', () => {
  const window = windowByKey(CRASHES, 'ai2025');
  const build = createBuild(availableIn(window, UNIVERSE));
  build.togglePick('VOO');
  build.togglePick('BND');
  assert.equal(build.dollars.VOO, 5000);

  const moved = build.adjustDollars('VOO', 3);
  assert.equal(moved, 3);
  assert.equal(build.dollars.VOO, 5300);
  assert.equal(build.dollars.BND, 4700);
  assert.equal(build.allocated(), STARTING_DOLLARS);

  // Cannot take BND below its own $100.
  const toZero = build.adjustDollars('VOO', 100);
  assert.ok(build.dollars.BND >= 100, `BND went to ${build.dollars.BND}`);
  assert.ok(toZero < 100, 'adjustDollars stopped short rather than emptying BND');
  assert.equal(build.allocated(), STARTING_DOLLARS);

  // A single holding cannot be adjusted - there is nowhere for the money to go.
  const alone = createBuild(availableIn(window, UNIVERSE));
  alone.togglePick('VOO');
  assert.equal(alone.adjustDollars('VOO', 5), 0);
  assert.equal(alone.canLower('VOO'), false);
  assert.equal(alone.canRaise('VOO'), false);
});

test('createBuild()’s canLower and canRaise match what adjustDollars will actually do', () => {
  const window = windowByKey(CRASHES, 'bear2022');
  const build = createBuild(availableIn(window, UNIVERSE));
  for (const ticker of ['VOO', 'BND', 'GLD', 'XOM']) build.togglePick(ticker);
  for (const ticker of build.picks) {
    assert.equal(build.canLower(ticker), build.adjustDollars(ticker, -1) === 1);
    if (build.canLower(ticker)) build.adjustDollars(ticker, 1);   // put it back
  }
});

// -------------------------------------------------------------- the dates

test('formatShortDate() reads "Mon D" straight off the ISO string', () => {
  assert.equal(formatShortDate('2020-02-19'), 'Feb 19');
  assert.equal(formatShortDate('2022-01-03'), 'Jan 3');
  assert.equal(formatShortDate('2025-12-01'), 'Dec 1');
  assert.throws(() => formatShortDate('not-a-date'), /is not an ISO date/);
});

test('every window’s dates format without throwing, end to end', () => {
  for (const window of CRASHES.windows) {
    for (const date of [window.startDate, ...gameDates(window)]) {
      assert.doesNotThrow(() => formatShortDate(date), `${window.key}: ${date}`);
    }
  }
});

// --- the windows against docs/PRD.md's own table ----------------------------

/**
 * The PRD's crash table, parsed out of the document rather than retyped here.
 *
 * WHY READ THE SPEC INSTEAD OF COPYING IT. These three windows are registered:
 * "a window chosen after seeing a result is a window chosen to flatter it", as
 * the PRD puts it. A test carrying its own copy of the numbers agrees with
 * whatever it was last edited to agree with, and the thing worth catching is the
 * data and the spec drifting apart. Reading the table means an edit to either
 * side has to be matched on the other.
 *
 * This is the check that was missing when a screen printed "23 trading days" for
 * a window the PRD records as 24: nothing in the suite compared the two.
 */
function prdWindows() {
  const prd = readFileSync(fileURLToPath(new URL('../docs/PRD.md', import.meta.url)), 'utf8');
  const rows = [...prd.matchAll(
    /^\| (The [^|]+?) \| (\d+ \w+ \d{4}) \| (\d+ \w+ \d{4}) \| (\d+) \| (−[\d.]+)% \|$/gm,
  )];
  assert.equal(rows.length, 3, 'the PRD crash table was not found, or has changed shape');
  return rows.map(([, title, from, to, tradingDays, fall]) => ({
    title: title.trim(),
    from,
    to,
    tradingDays: Number(tradingDays),
    fall: Number(fall.replace('−', '-')) / 100,
  }));
}

test('every crash window matches the trading days docs/PRD.md registers', () => {
  const registered = prdWindows();
  assert.equal(CRASHES.windows.length, registered.length);
  for (const expected of registered) {
    const window = CRASHES.windows.find((w) => w.title === expected.title);
    assert.ok(window, `data/crashes.json has no window titled "${expected.title}"`);
    assert.equal(window.tradingDays, expected.tradingDays,
      `${expected.title}: the PRD counts ${expected.tradingDays} trading days`);
    // And the moves are one fewer, because a replay is a line between closes.
    assert.equal(window.days, expected.tradingDays - 1,
      `${expected.title}: ${window.days} moves is not one fewer than its closes`);
    assert.equal(window.rows.length, window.days, 'a row is a move, so there is one per move');
  }
});

test("every crash window reproduces the index fall docs/PRD.md publishes", () => {
  for (const expected of prdWindows()) {
    const window = CRASHES.windows.find((w) => w.title === expected.title);
    const result = replay(CRASHES, window.key, { VOO: STARTING_DOLLARS });
    // To the hundredth of a percent the PRD states it to, compared with a
    // tolerance rather than for equality: -33.99/100 is not exactly -0.3399 in
    // binary, and this test is about a published figure, not about floats.
    // This is the check that the trading-day count changed no arithmetic - the
    // fall comes from the same closes it always did.
    assert.ok(Math.abs(result.indexChange - expected.fall) < 5e-5,
      `${expected.title}: the index fell ${result.indexChange}, not ${expected.fall}`);
  }
});

test('the screen says trading days and means closes', () => {
  // The line Crash replay and level 6 both print. A window of 24 closes reads
  // "24 trading days", never 23 - which is what it read before.
  const window = CRASHES.windows.find((w) => w.key === 'crash2020');
  assert.equal(window.tradingDays, 24);
  assert.equal(`${window.tradingDays} trading days, ${window.from} to ${window.to}`,
    '24 trading days, 2020-02-19 to 2020-03-23');
});

test("a replay's own window carries the count, because that is what the screens read", () => {
  // THE FIRST VERSION OF THIS FIX MISSED THIS. The count was added to the stored
  // windows and asserted there, but every screen reads replay()'s summary of the
  // window rather than the file, and that summary did not carry it - so the line
  // read "undefined trading days" while the test above passed. Checking the data
  // is not checking the screen.
  for (const expected of prdWindows()) {
    const stored = CRASHES.windows.find((w) => w.title === expected.title);
    const result = replay(CRASHES, stored.key, { VOO: STARTING_DOLLARS });
    assert.equal(result.window.tradingDays, expected.tradingDays,
      `${expected.title}: the replay's window does not carry its trading days`);
    // The path has one point per close, so it is the same count by construction.
    assert.equal(result.path.length, expected.tradingDays,
      `${expected.title}: the line drawn has ${result.path.length} points`);
    assert.equal(result.dates.length, expected.tradingDays, 'one date per point');
  }
});
