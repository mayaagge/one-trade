// tests/levels.test.js - the level rules for levels 1 to 3.
//
// The file under test is levels.json, so these tests are as much about the data
// as the code: a threshold that drifts from docs/PRD.md, a pool portfolio that
// does not add up to the pretend money, or a ticker the snapshot has never heard
// of all fail here rather than halfway through a round.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  validateLevels,
  levelById,
  passes,
  bucketOf,
  starsFor,
  formatMeasure,
  resultLine,
  weightsFromDollars,
  totalDollars,
  CLOSE_TO_THRESHOLD,
  BAND_TOLERANCE,
  STARTING_DOLLARS,
  DISCLAIMER,
} from '../js/levels.js';

import { buildReturns } from '../js/returns.js';
import { betsFor, FUNDS, MIN_HOLDINGS, MAX_HOLDINGS } from '../scripts/make_pool.mjs';

const read = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8'));
const LEVELS = read('../levels.json');
const TICKERS = read('../tickers.json');

const KNOWN_TICKERS = new Set(
  TICKERS.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker))),
);

const level1 = levelById(LEVELS, 1);
const level2 = levelById(LEVELS, 2);
const level3 = levelById(LEVELS, 3);

/** A deep copy, so a test that breaks the file on purpose breaks only its copy. */
const copy = () => JSON.parse(JSON.stringify(LEVELS));

// ------------------------------------------------------------------ the file

test('levels.json is valid, and holds levels 1 to 3', () => {
  assert.equal(validateLevels(LEVELS), LEVELS);
  assert.deepEqual(LEVELS.levels.map((l) => l.id), [1, 2, 3]);
  assert.equal(LEVELS.startingDollars, STARTING_DOLLARS);
  assert.equal(LEVELS.disclaimer, DISCLAIMER);
});

test('every level asks for a guess before the reveal, and explains itself', () => {
  for (const level of LEVELS.levels) {
    assert.ok(level.guess.measure, `level ${level.id} asks for no guess`);
    assert.ok(level.guess.prompt.length > 10, `level ${level.id} has no prompt`);
    assert.ok(level.explain.length > 40, `level ${level.id} explains nothing`);
    assert.ok(level.why.length > 40, `level ${level.id} has no "why"`);
  }
});

test('the thresholds are the ones in the PRD levels table', () => {
  assert.equal(level1.pass.measure, 'correlation');
  assert.equal(level1.pass.comparison, '>=');
  assert.equal(level1.pass.threshold, 0.8);
  assert.deepEqual(level1.holdings, { exactly: 2 });

  assert.equal(level2.pass.measure, 'guess');

  assert.equal(level3.pass.measure, 'effectiveBets');
  assert.equal(level3.pass.comparison, '>=');
  assert.equal(level3.pass.threshold, 3);
  assert.deepEqual(level3.holdings, { exactly: 5 });
});

test('the window is the PRD’s 756 days with a 252-day floor', () => {
  assert.equal(LEVELS.window.days, 756);
  assert.equal(LEVELS.window.minDays, 252);
});

test('level 1’s pool is real tickers, and level 3 draws from the whole list', () => {
  assert.ok(level1.pool.length >= 10);
  for (const ticker of level1.pool) {
    assert.ok(KNOWN_TICKERS.has(ticker), `level 1 pool has ${ticker}, which tickers.json does not`);
  }
  assert.equal(new Set(level1.pool).size, level1.pool.length, 'no ticker twice');
  assert.equal(level3.pool, 'all');
});

test('validateLevels() refuses a file the game would choke on', () => {
  const noPass = copy();
  delete noPass.levels[0].pass;
  assert.throws(() => validateLevels(noPass), /pass rule/);

  const badComparison = copy();
  badComparison.levels[0].pass.comparison = '=~';
  assert.throws(() => validateLevels(badComparison), /pass.comparison/);

  const duplicateId = copy();
  duplicateId.levels[1].id = 1;
  assert.throws(() => validateLevels(duplicateId), /duplicate id 1/);

  const noGuess = copy();
  delete noGuess.levels[2].guess;
  assert.throws(() => validateLevels(noGuess), /every level asks for one/);

  const badStars = copy();
  badStars.levels[0].stars.pass = 2;
  assert.throws(() => validateLevels(badStars), /stars.pass must be 1/);

  const badBand = copy();
  badBand.levels[1].stars.two = { test: 'vibes' };
  assert.throws(() => validateLevels(badBand), /must be "within" or "bucket"/);

  const shortPool = copy();
  shortPool.guessPool.portfolios.pop();
  assert.throws(() => validateLevels(shortPool), /19 portfolios, not 20/);

  const badMoney = copy();
  badMoney.guessPool.portfolios[0].dollars.QQQ += 100;
  assert.throws(() => validateLevels(badMoney), /not 10000/);
});

test('levelById() names what was asked for when it is not there', () => {
  assert.equal(levelById(LEVELS, 2), level2);
  assert.throws(() => levelById(LEVELS, 7), /no level 7/);
});

// ------------------------------------------------------------------ the pool

test('the guess pool is 20 beginner portfolios of 3 to 5 holdings', () => {
  const pool = LEVELS.guessPool.portfolios;
  assert.equal(pool.length, 20);
  assert.notEqual(LEVELS.guessPool.seed, 2026, 'the game pool must not borrow the registered seed');

  for (const portfolio of pool) {
    const tickers = Object.keys(portfolio.dollars);
    assert.ok(tickers.length >= MIN_HOLDINGS && tickers.length <= MAX_HOLDINGS,
      `${portfolio.id} holds ${tickers.length}`);
    assert.equal(totalDollars(portfolio), STARTING_DOLLARS, `${portfolio.id} does not add up`);
    assert.ok(tickers.some((t) => FUNDS.includes(t)), `${portfolio.id} holds no fund`);
    for (const ticker of tickers) {
      assert.ok(KNOWN_TICKERS.has(ticker), `${portfolio.id} holds ${ticker}, which tickers.json does not`);
    }
    for (const dollars of Object.values(portfolio.dollars)) {
      assert.ok(Number.isInteger(dollars) && dollars > 0, `${portfolio.id} has a bad amount`);
    }
  }
});

test('the pool spans a range of answers, so a good guess beats a lucky one', () => {
  const bets = LEVELS.guessPool.portfolios.map((p) => p.expectedBets);
  assert.ok(Math.min(...bets) < 1.5, 'the pool has portfolios that are nearly one bet');
  assert.ok(Math.max(...bets) > 2.5, 'and portfolios that are clearly several');
  const sorted = [...bets].sort((a, b) => a - b);
  assert.deepEqual(bets, sorted, 'the pool is stored in order of its answers');
});

test('every pool portfolio recomputes to its stored answer, to 1e-9', () => {
  const snapshot = read('../data/prices.json');
  const built = buildReturns(snapshot);
  for (const portfolio of LEVELS.guessPool.portfolios) {
    const { tickers, weights } = weightsFromDollars(portfolio.dollars);
    const { bets, days } = betsFor(built, tickers, weights);
    assert.ok(Math.abs(bets - portfolio.expectedBets) < 1e-9,
      `${portfolio.id}: stored ${portfolio.expectedBets}, recomputed ${bets}`);
    assert.ok(days >= LEVELS.window.minDays, `${portfolio.id} is scored on only ${days} days`);
  }
});

// ------------------------------------------------------------------ money

test('weightsFromDollars() turns the pretend money into weights that sum to 1', () => {
  const { tickers, weights } = weightsFromDollars({ VOO: 5000, BND: 2500, GLD: 2500 });
  assert.deepEqual(tickers, ['VOO', 'BND', 'GLD']);
  assert.deepEqual(weights, [0.5, 0.25, 0.25]);
  assert.equal(weights.reduce((a, b) => a + b, 0), 1);
  assert.throws(() => weightsFromDollars({ VOO: 0 }), /nothing is allocated/);
});

// ------------------------------------------------------------------ passing

test('passes() compares the unrounded measure, and the threshold itself passes', () => {
  assert.equal(passes(level1, 0.8), true, 'exactly the threshold is a pass');
  assert.equal(passes(level1, 0.7999999999), false);
  assert.equal(passes(level1, 0.95), true);
  assert.equal(passes(level3, 3), true);
  assert.equal(passes(level3, 2.9999999999), false);
  assert.equal(passes(level1, Number.NaN), false);
  assert.equal(passes(level2, undefined), true, 'level 2 passes on making a guess');
});

test('bucketOf() uses the daily puzzle’s three buckets', () => {
  assert.equal(bucketOf(level1, 1), 'same');
  assert.equal(bucketOf(level1, 0.7), 'same');
  assert.equal(bucketOf(level1, 0.6999), 'partly');
  assert.equal(bucketOf(level1, 0.3), 'partly');
  assert.equal(bucketOf(level1, 0.2999), 'different');
  assert.equal(bucketOf(level1, -1), 'different');
  assert.equal(bucketOf(level1, Number.NaN), null);
});

// ------------------------------------------------------------------ stars

test('a failed level scores no stars, however good the guess was', () => {
  assert.equal(starsFor(level1, { guess: 0.5, actual: 0.5, passed: false }), 0);
  assert.equal(starsFor(level3, { guess: 2.4, actual: 2.4, passed: false }), 0);
});

test('level 1 scores 1 for passing, 2 for the right bucket, 3 for within 0.10', () => {
  const actual = 0.92;                                   // the "same bet" bucket
  assert.equal(starsFor(level1, { guess: 0.1, actual, passed: true }), 1, 'wrong bucket, still a pass');
  assert.equal(starsFor(level1, { guess: 0.75, actual, passed: true }), 2, 'right bucket, not close');
  assert.equal(starsFor(level1, { guess: 0.85, actual, passed: true }), 3, 'within 0.10');
  assert.equal(starsFor(level1, { guess: 0.82, actual, passed: true }), 3, 'exactly 0.10 away counts');
  assert.equal(starsFor(level1, { guess: 0.8189, actual, passed: true }), 2, 'a hair over 0.10 does not');
});

test('a band boundary is not decided by binary floating point', () => {
  // 0.92 - 0.82 is 0.10000000000000009, so a bare <= 0.10 would score this 2.
  assert.ok(Math.abs(0.92 - 0.82) > 0.1, 'the subtraction really does overshoot');
  assert.equal(starsFor(level1, { guess: 0.82, actual: 0.92, passed: true }), 3);
  // The same shape on a bets band: 3.4 - 2.4 and 3.3 - 2.8.
  assert.equal(starsFor(level3, { guess: 2.4, actual: 3.4, passed: true }), 2);
  assert.equal(starsFor(level3, { guess: 2.8, actual: 3.3, passed: true }), 3);
});

test('levels 2 and 3 keep the registered bands of 1 bet and half a bet', () => {
  for (const level of [level2, level3]) {
    const actual = 3.4;
    assert.equal(starsFor(level, { guess: 1.0, actual, passed: true }), 1);
    assert.equal(starsFor(level, { guess: 2.4, actual, passed: true }), 2, 'exactly 1 away counts');
    assert.equal(starsFor(level, { guess: 2.3999, actual, passed: true }), 1);
    assert.equal(starsFor(level, { guess: 2.9, actual, passed: true }), 3, 'exactly 0.5 away counts');
    assert.equal(starsFor(level, { guess: 3.4, actual, passed: true }), 3);
  }
});

test('a guess that is not a number scores the pass alone', () => {
  assert.equal(starsFor(level3, { guess: Number.NaN, actual: 3.2, passed: true }), 1);
  assert.equal(starsFor(level3, { guess: 3.2, actual: Number.NaN, passed: true }), 1);
});

// ------------------------------------- the displayed number and the pass check

test('formatMeasure() shows 4 decimals for a result that is close to its threshold', () => {
  // The case this rule exists for: VTI and VXUS sit just under level 1's 0.8.
  assert.equal(formatMeasure(0.7996, { threshold: 0.8 }), '0.7996');
  assert.equal(formatMeasure(0.7997, { threshold: 0.8 }), '0.7997');
  assert.equal(formatMeasure(0.8004, { threshold: 0.8 }), '0.8004');
  assert.equal(formatMeasure(0.8, { threshold: 0.8 }), '0.8000');
});

test('formatMeasure() shows 2 decimals for a result that is nowhere near', () => {
  assert.equal(formatMeasure(0.95, { threshold: 0.8 }), '0.95');
  assert.equal(formatMeasure(0.9962, { threshold: 0.8 }), '1.00');
  assert.equal(formatMeasure(0.42, { threshold: 0.8 }), '0.42');
  assert.equal(formatMeasure(3.616, { threshold: 3 }), '3.62');
});

test('formatMeasure() handles a missing number and a missing threshold', () => {
  assert.equal(formatMeasure(Number.NaN, { threshold: 0.8 }), '—');
  assert.equal(formatMeasure(null, { threshold: 0.8 }), '—');
  assert.equal(formatMeasure(0.7996), '0.80', 'with no threshold there is nothing to contradict');
});

test('a displayed number never contradicts the pass check - level 1, 0.78 to 0.82', () => {
  for (let step = 0; step <= 400; step += 1) {
    const value = 0.78 + step * 0.0001;
    const shown = formatMeasure(value, { threshold: level1.pass.threshold });
    const readsAsPass = Number.parseFloat(shown) >= level1.pass.threshold;
    assert.equal(readsAsPass, passes(level1, value),
      `${value} is shown as ${shown}, which reads the wrong way`);
  }
});

test('a displayed number never contradicts the pass check - level 3, 2.8 to 3.2 bets', () => {
  for (let step = 0; step <= 400; step += 1) {
    const value = 2.8 + step * 0.001;
    const shown = formatMeasure(value, { threshold: level3.pass.threshold });
    const readsAsPass = Number.parseFloat(shown) >= level3.pass.threshold;
    assert.equal(readsAsPass, passes(level3, value),
      `${value} bets is shown as ${shown}, which reads the wrong way`);
  }
});

test('the band tolerance is small enough to change no real answer', () => {
  assert.ok(BAND_TOLERANCE > 0 && BAND_TOLERANCE <= 1e-9);
});

test('the close-to-threshold window is wide enough to cover 2-decimal rounding', () => {
  // Anything within half of the last displayed digit could round to the
  // threshold's own text, so the window must be at least 0.005.
  assert.ok(CLOSE_TO_THRESHOLD >= 0.005);
});

test('resultLine() prints the measure and the threshold to the same precision', () => {
  assert.equal(resultLine(level1, 0.7997), '0.7997 misses the 0.8000 needed');
  assert.equal(resultLine(level1, 0.95), '0.95 clears the 0.80 needed');
  assert.equal(resultLine(level3, 3.07), '3.07 clears the 3.00 needed');
  assert.equal(resultLine(level3, 2.9996), '2.9996 misses the 3.0000 needed');
  assert.equal(resultLine(level2, 2.1), null, 'level 2 has no threshold to print');
});
