// tests/holdings.test.js - the dollar entry behind My real portfolio.
//
// This is the only screen in the game a player TYPES into. Every other mode is
// taps on chips and buttons, where the only inputs possible are the ones the
// screen offered; here someone types a ticker and an amount, and both can be
// anything at all. So the rules about what happens to a line that cannot be used
// are the whole subject of this file.
//
// NOTHING IS EVER DROPPED QUIETLY. A ticker that is not in tickers.json, an
// amount that is not a number, a holding entered twice: each comes back as a
// plain message naming the box it belongs to, and the row is not added. A silent
// catch here would mean a player's $4,000 in a misspelled ticker simply vanishing
// from a total they are reading as their own portfolio.
//
// WHOLE DOLLARS, AND THE CENTS QUESTION. "$12,500.00" is what a brokerage page
// gives you, so zero cents are accepted and dropped; "$12,500.37" is refused with
// a message rather than rounded, because rounding would change a number the
// player typed and then show them the result as theirs.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  LEAST_HOLDINGS,
  MOST_HOLDINGS,
  createHoldings,
  parseDollars,
  readTicker,
} from '../js/holdings.js';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));
const TICKERS = readJson('tickers.json');
const GAME = readJson('data/game.json');

const UNIVERSE = TICKERS.groups
  .flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
const PRICED = new Set(GAME.tickers);

const fresh = () => createHoldings({ universe: UNIVERSE, priced: PRICED });

// --- the dollar box ---------------------------------------------------------

test('plain whole dollars are read as typed', () => {
  for (const [text, expected] of [['5000', 5000], ['100', 100], ['1', 1], ['250000', 250000]]) {
    assert.deepEqual(parseDollars(text), { dollars: expected }, text);
  }
});

test('commas are allowed where a reader would put them', () => {
  for (const [text, expected] of [['5,000', 5000], ['12,500', 12500], ['1,250,000', 1250000]]) {
    assert.deepEqual(parseDollars(text), { dollars: expected }, text);
  }
});

test('a misgrouped comma is a typo, not a number', () => {
  // "1,25" is almost certainly a slip for 125 or 1,250, and guessing which one
  // would put a number on the screen the player never typed.
  for (const text of ['1,25', '12,34', '1,2345', '1,,000', ',500', '5,000,']) {
    const read = parseDollars(text);
    assert.equal(read.dollars, undefined, `${text} was read as a number`);
    assert.match(read.problem, /commas/i, `${text}: ${read.problem}`);
  }
});

test('a dollar sign and spaces are allowed, because people paste them', () => {
  for (const [text, expected] of [['$5,000', 5000], [' 5000 ', 5000], ['$ 12,500', 12500]]) {
    assert.deepEqual(parseDollars(text), { dollars: expected }, text);
  }
});

test('cents are rounded to the nearest dollar, because real balances have them', () => {
  assert.deepEqual(parseDollars('12,500.00'), { dollars: 12500 });
  assert.deepEqual(parseDollars('5000.0'), { dollars: 5000 });
  assert.deepEqual(parseDollars('12,500.37'), { dollars: 12500 }, 'rounded the wrong way');
  assert.deepEqual(parseDollars('12,500.67'), { dollars: 12501 }, 'rounded the wrong way');
  assert.deepEqual(parseDollars('$4,212.50'), { dollars: 4213 }, 'a half-dollar should round up');
  assert.deepEqual(parseDollars('1.4'), { dollars: 1 });
  assert.deepEqual(parseDollars('1.5'), { dollars: 2 });
  // Three decimals is not a balance anybody has, but there is nothing to gain
  // from refusing it.
  assert.deepEqual(parseDollars('100.375'), { dollars: 100 });
});

test('an amount that rounds to nothing is refused, naming both numbers', () => {
  // More than $0 and yet $0 once rounded: a row that could carry no weight and
  // no risk, so it is refused rather than added as a holding of nothing.
  for (const text of ['0.37', '0.4', '$0.49']) {
    const read = parseDollars(text);
    assert.equal(read.dollars, undefined, `${text} became a holding`);
    assert.match(read.problem, /rounds to \$0/, read.problem);
    assert.match(read.problem, /at least \$1/, read.problem);
  }
  // And one that rounds UP to a dollar is fine.
  assert.deepEqual(parseDollars('0.5'), { dollars: 1 });
});

test('a decimal point with nothing usable after it is still not a number', () => {
  for (const text of ['5000.', '5000.x', '12,500.3x', '.']) {
    const read = parseDollars(text);
    assert.equal(read.dollars, undefined, `${text} was read as a number`);
    assert.match(read.problem, /not a number/i, `${text}: ${read.problem}`);
  }
});

test('nothing, or not a number, says so plainly', () => {
  for (const text of ['', '   ', 'abc', '5k', 'five thousand', '-', '1e5']) {
    const read = parseDollars(text);
    assert.equal(read.dollars, undefined, `${text} was read as a number`);
    assert.equal(typeof read.problem, 'string');
    assert.ok(read.problem.length > 0);
  }
});

test('$0 and less are refused: a holding of nothing is not a holding', () => {
  for (const text of ['0', '0.00', '$0', '-100', '-5,000']) {
    const read = parseDollars(text);
    assert.equal(read.dollars, undefined, `${text} was accepted`);
    assert.match(read.problem, /more than \$0|not a number|minus/i, `${text}: ${read.problem}`);
  }
});

// --- the ticker box ---------------------------------------------------------

test('a ticker is read however it is typed', () => {
  for (const text of ['voo', 'VOO', ' voo ', 'Voo']) {
    assert.deepEqual(readTicker(text, { universe: UNIVERSE, priced: PRICED }), { ticker: 'VOO' }, text);
  }
});

test('a ticker not in tickers.json gets a plain message, not an error', () => {
  for (const text of ['TSLA', 'NVDAA', 'ZZZZ', 'APPL']) {
    const read = readTicker(text, { universe: UNIVERSE, priced: PRICED });
    assert.equal(read.ticker, undefined, `${text} was accepted`);
    // Plain: it names the ticker, says where the list is, and does not scold.
    assert.match(read.problem, new RegExp(text.toUpperCase()));
    assert.match(read.problem, /not .*(list|one of)/i, read.problem);
    assert.ok(!/error|invalid|illegal/i.test(read.problem), `reads as an error: ${read.problem}`);
  }
});

test('an empty ticker box says so without naming anything', () => {
  const read = readTicker('   ', { universe: UNIVERSE, priced: PRICED });
  assert.equal(read.ticker, undefined);
  assert.match(read.problem, /ticker/i);
});

test('a ticker in the list but with no prices yet is explained, not accepted', () => {
  const read = readTicker('NEWCO', { universe: [...UNIVERSE, 'NEWCO'], priced: PRICED });
  assert.equal(read.ticker, undefined);
  assert.match(read.problem, /NEWCO/);
  assert.match(read.problem, /prices/i);
});

// --- the list ---------------------------------------------------------------

test('a row is added with its ticker and its dollars', () => {
  const list = fresh();
  assert.deepEqual(list.add('voo', '5,000'), { ok: true, ticker: 'VOO' });
  assert.deepEqual(list.rows, [{ ticker: 'VOO', dollars: 5000 }]);
  assert.equal(list.total(), 5000);
});

test('a bad row is not added, and the problem names the box it belongs to', () => {
  const list = fresh();
  const bad = list.add('TSLA', '5000');
  assert.equal(bad.ok, false);
  assert.equal(bad.field, 'ticker');
  assert.match(bad.problem, /TSLA/);
  assert.deepEqual(list.rows, [], 'a refused row was added anyway');

  const alsoBad = list.add('VOO', 'lots');
  assert.equal(alsoBad.ok, false);
  assert.equal(alsoBad.field, 'dollars');
  assert.deepEqual(list.rows, []);
});

test('the ticker box is checked first, so one bad row reports one problem', () => {
  // Both boxes wrong: the message is about the ticker, because that is the box a
  // player fills in first and two messages at once is two things to fix.
  const list = fresh();
  const read = list.add('TSLA', 'lots');
  assert.equal(read.field, 'ticker');
});

test('the same holding twice is refused, and says it is already there', () => {
  const list = fresh();
  list.add('VOO', '5000');
  const again = list.add('voo', '2000');
  assert.equal(again.ok, false);
  assert.equal(again.field, 'ticker');
  assert.match(again.problem, /already/i);
  assert.equal(list.rows.length, 1, 'the holding was added twice');
  assert.equal(list.total(), 5000, 'the second amount changed the total');
});

test('a row is removed by name, and the total follows', () => {
  const list = fresh();
  list.add('VOO', '5000');
  list.add('BND', '3000');
  assert.equal(list.total(), 8000);
  list.remove('VOO');
  assert.deepEqual(list.rows, [{ ticker: 'BND', dollars: 3000 }]);
  assert.equal(list.total(), 3000);
  // Removing something that is not there changes nothing and does not throw.
  list.remove('GLD');
  assert.equal(list.rows.length, 1);
});

test('each holding\'s share is of the real total, and the shares sum to 1', () => {
  const list = fresh();
  list.add('VOO', '5000');
  list.add('NVDA', '2000');
  list.add('BND', '3000');
  assert.equal(list.total(), 10000);
  assert.equal(list.shareOf('VOO'), 0.5);
  assert.equal(list.shareOf('NVDA'), 0.2);
  assert.equal(list.shareOf('BND'), 0.3);
  const sum = list.rows.reduce((at, row) => at + list.shareOf(row.ticker), 0);
  assert.equal(sum, 1);
});

test('the shares move when a row is added or taken away', () => {
  const list = fresh();
  list.add('VOO', '5000');
  list.add('BND', '5000');
  assert.equal(list.shareOf('VOO'), 0.5);
  list.add('GLD', '10000');
  assert.equal(list.shareOf('VOO'), 0.25, 'the share did not follow the new total');
  list.remove('GLD');
  assert.equal(list.shareOf('VOO'), 0.5, 'the share did not follow the removal');
});

test('the shares of an odd total are not rounded on the way in', () => {
  // $3,333 and $6,667 are 33.33% and 66.67%; the screen rounds for display, but
  // the weights handed to the measures are exact.
  const list = fresh();
  list.add('VOO', '3,333');
  list.add('BND', '6,667');
  assert.equal(list.total(), 10000);
  assert.equal(list.shareOf('VOO'), 0.3333);
  assert.equal(list.dollarsFor().VOO, 3333, 'the dollars were rounded');
});

// --- how many ---------------------------------------------------------------

test('two is the fewest, because a correlation needs a pair', () => {
  assert.equal(LEAST_HOLDINGS, 2);
  const list = fresh();
  assert.equal(list.canMeasure(), false);
  list.add('VOO', '5000');
  assert.equal(list.canMeasure(), false);
  // It says what to do and how many are needed, not just that something is wrong.
  assert.match(list.whyNot(), /Add one more holding/i);
  assert.match(list.whyNot(), /at least 2/);
  list.add('BND', '5000');
  assert.equal(list.canMeasure(), true);
  assert.equal(list.whyNot(), null);
});

test('fifteen is the most, and the sixteenth is refused with a reason', () => {
  assert.equal(MOST_HOLDINGS, 15);
  const list = fresh();
  const names = UNIVERSE.slice(0, MOST_HOLDINGS);
  for (const ticker of names) assert.equal(list.add(ticker, '1000').ok, true, ticker);
  assert.equal(list.rows.length, MOST_HOLDINGS);
  assert.equal(list.canMeasure(), true);
  assert.equal(list.isFull(), true);

  const extra = list.add(UNIVERSE[MOST_HOLDINGS], '1000');
  assert.equal(extra.ok, false);
  assert.match(extra.problem, /15/);
  assert.equal(list.rows.length, MOST_HOLDINGS, 'a sixteenth holding was added');
});

test('what the measures are given is a plain ticker-to-dollars object', () => {
  const list = fresh();
  list.add('QQQ', '4,000');
  list.add('NVDA', '3000');
  list.add('GLD', '2,000');
  list.add('BND', '1000');
  assert.deepEqual(list.dollarsFor(), { QQQ: 4000, NVDA: 3000, GLD: 2000, BND: 1000 });
});

// --- nothing is kept --------------------------------------------------------

test('the list holds nothing but its rows: no storage, no history, no copy', () => {
  const list = fresh();
  list.add('VOO', '5000');
  list.add('NVDA', '5000');
  list.remove('NVDA');
  // A removed holding leaves no trace to be read back later.
  assert.deepEqual(list.rows, [{ ticker: 'VOO', dollars: 5000 }]);
  assert.deepEqual(list.dollarsFor(), { VOO: 5000 });
  const keys = Object.keys(list).filter((key) => typeof list[key] !== 'function');
  assert.deepEqual(keys, ['rows'], `the list keeps more than its rows: ${keys.join(', ')}`);
});

test('clearing the list leaves nothing behind', () => {
  const list = fresh();
  list.add('VOO', '5000');
  list.add('BND', '5000');
  list.clear();
  assert.deepEqual(list.rows, []);
  assert.equal(list.total(), 0);
  assert.equal(list.canMeasure(), false);
});
