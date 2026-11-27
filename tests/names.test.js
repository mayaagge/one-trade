// tests/names.test.js - names.json against the two files it has to agree with.
//
// WHAT CAN GO WRONG HERE, in order of how badly. A ticker with no entry shows
// a player a bare symbol on a screen built to explain symbols. An entry for a
// ticker that does not exist is dead weight nobody notices. And a `kind` that
// disagrees with levels.json's own stocks/notStocks lists would have the game
// telling a player GLD is a stock on one screen while level 6 refuses to count
// it as one on the next - the same class of bug as a displayed number
// disagreeing with a pass check.
//
// THE FOUR KINDS ARE FINER THAN LEVEL 6'S TWO, on purpose: a stock fund is a
// stock for the 60%-in-stocks rule, because a share of a fund of shares is
// still shares. So the check is a mapping, not an equality.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const read = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));

const NAMES = read('names.json');
const TICKERS = read('tickers.json');
const LEVELS = read('levels.json');

const UNIVERSE = TICKERS.groups
  .flatMap((group) => group.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));

/** Which of level 6's two lists a kind belongs in. */
const COUNTS_AS_STOCK = {
  stock: true,
  'stock fund': true,
  'bond fund': false,
  gold: false,
};

test('every playable ticker has a name, and nothing else does', () => {
  const described = Object.keys(NAMES.tickers).sort();
  assert.deepEqual(described, [...UNIVERSE].sort(),
    'names.json and tickers.json disagree about what a player can pick');
  assert.equal(described.length, 40);
});

test('no benchmark is described, because none can be held', () => {
  // ^GSPC and RSP are measured against, never picked. An entry for either
  // would be a promise this game does not keep.
  for (const ticker of Object.keys(TICKERS.benchmarks ?? {})) {
    assert.equal(NAMES.tickers[ticker], undefined, `${ticker} is a benchmark, not a holding`);
  }
  assert.equal(NAMES.tickers['^GSPC'], undefined);
  assert.equal(NAMES.tickers.RSP, undefined);
});

test('every name is a real string a player can read', () => {
  for (const [ticker, entry] of Object.entries(NAMES.tickers)) {
    assert.equal(typeof entry.name, 'string', `${ticker} has no name`);
    assert.ok(entry.name.length > 2, `${ticker}'s name is too short to be one: "${entry.name}"`);
    assert.ok(entry.name.trim() === entry.name, `${ticker}'s name has stray whitespace`);
    // The name must not just restate the symbol, which is what it is there to
    // replace.
    assert.notEqual(entry.name.toUpperCase(), ticker, `${ticker}'s name is the ticker again`);
  }
});

test('every kind is one of the four, and only those four are used', () => {
  const used = new Set(Object.values(NAMES.tickers).map((entry) => entry.kind));
  assert.deepEqual([...used].sort(), ['bond fund', 'gold', 'stock', 'stock fund'],
    'a kind outside the four appeared, or one of the four went unused');
});

test("a kind never disagrees with level 6's stocks and notStocks", () => {
  // THE BUG THIS EXISTS FOR: the game saying "GLD - gold" on the build screen
  // while level 6's 60%-in-stocks rule silently counts it one way or the
  // other. levels.json writes both lists out in full for the same reason.
  const stocks = new Set(LEVELS.kinds.stocks);
  const notStocks = new Set(LEVELS.kinds.notStocks);
  for (const [ticker, entry] of Object.entries(NAMES.tickers)) {
    const countsAsStock = COUNTS_AS_STOCK[entry.kind];
    assert.equal(typeof countsAsStock, 'boolean', `${ticker}: kind "${entry.kind}" maps to nothing`);
    assert.equal(stocks.has(ticker), countsAsStock,
      `${ticker} is a "${entry.kind}" here and ${stocks.has(ticker) ? 'is' : 'is not'} `
      + "in level 6's stocks list");
    assert.equal(notStocks.has(ticker), !countsAsStock,
      `${ticker} is a "${entry.kind}" here and ${notStocks.has(ticker) ? 'is' : 'is not'} `
      + "in level 6's notStocks list");
  }
});

test('the four tickers level 6 calls not-stocks are exactly the bond funds and the gold', () => {
  const notStock = Object.entries(NAMES.tickers)
    .filter(([, entry]) => !COUNTS_AS_STOCK[entry.kind])
    .map(([ticker]) => ticker)
    .sort();
  assert.deepEqual(notStock, [...LEVELS.kinds.notStocks].sort());
  assert.deepEqual(notStock, ['BND', 'GLD', 'LQD', 'TLT']);
});

test('no description names a sector, which level 1 hides on purpose', () => {
  // Level 1 drops the group headings because they say which holdings move
  // together. A "What are these?" list that said "NVDA - AI stock" beside the
  // picker would hand back exactly that. The four kinds say what a thing IS,
  // never what it moves with - and these words are what the groups are called.
  const leaks = TICKERS.groups.map((group) => group.label.toLowerCase())
    .concat(['ai', 'tech', 'bank', 'energy', 'health', 'staples', 'international']);
  for (const [ticker, entry] of Object.entries(NAMES.tickers)) {
    for (const word of leaks) {
      assert.ok(!entry.kind.toLowerCase().includes(word),
        `${ticker}'s kind "${entry.kind}" names the group it is in`);
    }
  }
});
