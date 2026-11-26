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
  formatGuess,
  displayFor,
  DISPLAYS,
  resultLine,
  weightsFromDollars,
  totalDollars,
  CLOSE_TO_THRESHOLD,
  BAND_TOLERANCE,
  STARTING_DOLLARS,
  DISCLAIMER,
  validateKinds,
  kindTickers,
  kindFloorFor,
  CRASH_MEASURES,
} from '../js/levels.js';

import { buildReturns } from '../js/returns.js';
import { betsFor, FUNDS, MIN_HOLDINGS, MAX_HOLDINGS } from '../scripts/make_pool.mjs';
import {
  checkLevel4, checkLevel5, checkLevel6, checkLevel6Builds, LEVEL6_BUILDS, REQUIRED_DESIGNS,
} from '../scripts/check_levels.mjs';
import { validateCrashes } from '../js/crash.js';

const read = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8'));
const LEVELS = read('../levels.json');
const TICKERS = read('../tickers.json');

const KNOWN_TICKERS = new Set(
  TICKERS.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker))),
);

const level1 = levelById(LEVELS, 1);
const level2 = levelById(LEVELS, 2);
const level3 = levelById(LEVELS, 3);
const level6 = levelById(LEVELS, 6);

/** A deep copy, so a test that breaks the file on purpose breaks only its copy. */
const copy = () => JSON.parse(JSON.stringify(LEVELS));

// ------------------------------------------------------------------ the file

test('levels.json is valid, and holds levels 1 to 6', () => {
  assert.equal(validateLevels(LEVELS), LEVELS);
  assert.deepEqual(LEVELS.levels.map((l) => l.id), [1, 2, 3, 4, 5, 6]);
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

// ------------------------------------------------- levels 4 and 5, the rules

const level4 = levelById(LEVELS, 4);
const level5 = levelById(LEVELS, 5);

test('levels 4 and 5 carry the thresholds in the PRD levels table', () => {
  assert.equal(level4.pass.measure, 'beta');
  assert.equal(level4.pass.comparison, '<');
  assert.equal(level4.pass.threshold, 0.5);
  assert.equal(level4.holdings.minShare.QQQ, 0.3, 'the PRD asks for at least 30% in QQQ');
  assert.deepEqual(level4.holdings.required, ['QQQ']);

  assert.equal(level5.pass.measure, 'maxRiskShare');
  assert.equal(level5.pass.comparison, '<=');
  assert.equal(level5.pass.threshold, 0.35, 'no holding carries MORE than 35%, so 35% itself passes');
  assert.equal(level5.holdings.exactly, 4);
});

test('level 4 measures the basket frozen in basket.json, not a list of its own', () => {
  const basket = read('../basket.json');
  assert.equal(level4.basket.source, 'basket.json');
  assert.equal(level4.basket.weighting, 'equal');
  assert.equal(basket.stocks.length, 13);
  // Every member has to be a ticker the game carries, or a level 4 round could
  // not be measured at all.
  for (const stock of basket.stocks) {
    assert.ok(KNOWN_TICKERS.has(stock.ticker), `${stock.ticker} is in no group in tickers.json`);
  }
});

test('the star bands for levels 4 and 5 are the ones the PRD scoring table fixes', () => {
  for (const level of [level4, level5]) {
    assert.equal(level.stars.pass, 1);
    assert.equal(level.stars.two.test, 'bucket');
    assert.equal(level.stars.three.test, 'within');
  }
  assert.equal(level4.stars.three.of, 0.1, 'the 0.10 band level 1 already uses');
  assert.equal(level5.stars.three.of, 0.05, '5 points of the real share');
});

test('the bucket edges are each level’s own threshold and one plain anchor', () => {
  assert.deepEqual(level4.buckets.map((b) => b.min), [1, 0.5, null]);
  assert.deepEqual(level5.buckets.map((b) => b.min), [0.5, 0.35, null]);
  assert.equal(level4.buckets[1].min, level4.pass.threshold);
  assert.equal(level5.buckets[1].min, level5.pass.threshold);
});

test('bucketOf() puts a beta and a risk share in the right band, floor and all', () => {
  assert.equal(bucketOf(level4, 1.2), 'aiBet');
  assert.equal(bucketOf(level4, 1), 'aiBet', 'the edge belongs to the bucket above');
  assert.equal(bucketOf(level4, 0.6), 'partly');
  assert.equal(bucketOf(level4, 0.5), 'partly');
  assert.equal(bucketOf(level4, 0.49), 'barely');
  // A beta has no floor: a portfolio of staples can move against the basket.
  assert.equal(bucketOf(level4, -0.11), 'barely');

  assert.equal(bucketOf(level5, 0.82), 'oneHolding');
  assert.equal(bucketOf(level5, 0.35), 'leaning');
  assert.equal(bucketOf(level5, 0.26), 'spread');
});

test('level 4 scores 2 for the right bucket and 3 within 0.10 of the beta', () => {
  const stars = (guess, actual) => starsFor(level4, { guess, actual, passed: passes(level4, actual) });
  assert.equal(stars(0.30, 0.29), 3, 'right bucket and within 0.10');
  assert.equal(stars(0.45, 0.29), 2, 'same bucket, 0.16 out');
  assert.equal(stars(0.80, 0.29), 1, 'passed, but called it partly an AI bet');
  assert.equal(stars(0.75, 0.79), 0, 'a beta of 0.79 fails the level, so no stars');
});

test('level 5 scores 2 for the right bucket and 3 within 5 points', () => {
  const stars = (guess, actual) => starsFor(level5, { guess, actual, passed: passes(level5, actual) });
  assert.equal(stars(0.30, 0.27), 3);
  assert.equal(stars(0.25, 0.33), 2, 'both spread, 8 points out');
  assert.equal(stars(0.60, 0.27), 1, 'passed, but called it one holding carrying the portfolio');
  assert.equal(stars(0.40, 0.42), 0, 'over 35% of the risk is a fail, however good the guess');
});

test('a share of risk shown as a percent cannot contradict the pass check', () => {
  const show = (value) => formatMeasure(value, { threshold: 0.35, display: 'percent' });
  assert.equal(show(0.27), '27%');
  assert.equal(show(0.42), '42%');
  // Within half a point of the line, where a whole percent could read as the
  // other side of it: shown to 2 decimals, and the pass check is unchanged.
  assert.equal(show(0.3549), '35.49%');
  assert.equal(passes(level5, 0.3549), false);
  assert.equal(show(0.3451), '34.51%');
  assert.equal(passes(level5, 0.3451), true);
  // The threshold itself sits within 0.005 of itself, so it is shown to the extra
  // places too - the same thing level 1 does with a correlation of exactly 0.80,
  // and the reason is the same: nothing about the display decides the pass.
  assert.equal(show(0.35), '35.00%');
  assert.equal(passes(level5, 0.35), true);
});

test('resultLine() speaks each level’s own display', () => {
  assert.equal(resultLine(level5, 0.27), '27% clears the 35% needed');
  assert.equal(resultLine(level5, 0.3549), '35.49% misses the 35.00% needed');
  assert.equal(resultLine(level4, 0.29), '0.29 clears the 0.50 needed');
  assert.equal(resultLine(level4, 0.5004), '0.5004 misses the 0.5000 needed');
});

test('formatGuess() writes a guess in the units its slider shows', () => {
  assert.equal(formatGuess(level1, 0.85), '0.85');
  assert.equal(formatGuess(level3, 3.1), '3.1');
  assert.equal(formatGuess(level4, 0.55), '0.55');
  assert.equal(formatGuess(level5, 0.38), '38%');
  assert.equal(formatGuess(level5, null), '—');
});

test('every level says how its slider moves and what its reveal panel is called', () => {
  for (const level of LEVELS.levels) {
    const shape = displayFor(level);
    assert.ok(shape.step > 0, `level ${level.id} has no step`);
    assert.ok(DISPLAYS.includes(shape.display), `level ${level.id} has no display`);
    assert.ok(level.revealLabel.length > 10, `level ${level.id} has no reveal label`);
    if (level.stars.three.test === 'within') {
      assert.ok(shape.step <= level.stars.three.of,
        `level ${level.id}: a step of ${shape.step} cannot reach a band of ${level.stars.three.of}`);
    }
  }
});

test('validateLevels() refuses the build rules a level 4 could get wrong', () => {
  const required = (fn) => {
    const file = copy();
    fn(levelById(file, 4));
    return file;
  };

  assert.throws(() => validateLevels(required((l) => { l.holdings.required = ['ZZZZ']; l.pool = ['QQQ', 'BND']; })),
    /required but is not in this level's pool/);
  assert.throws(() => validateLevels(required((l) => { l.holdings.minShare = { BND: 0.3 }; })),
    /not a required holding/);
  assert.throws(() => validateLevels(required((l) => { l.holdings.minShare = { QQQ: 0.98 }; })),
    /cannot be built/);
  assert.throws(() => validateLevels(required((l) => { l.holdings.minShare = { QQQ: 0 }; })),
    /must be above 0/);
  assert.throws(() => validateLevels(required((l) => { l.holdings.required = ['QQQ', 'VOO', 'VTI', 'BND', 'GLD']; })),
    /will not fit/);
  assert.throws(() => validateLevels(required((l) => { l.pass.measure = 'sharpeRatio'; })),
    /is not one this game computes/);
  assert.throws(() => validateLevels(required((l) => { delete l.guess.step; })),
    /guess.step must be a positive number/);
  assert.throws(() => validateLevels(required((l) => { l.guess.display = 'basis points'; })),
    /guess.display must be one of/);
  assert.throws(() => validateLevels(required((l) => { delete l.revealLabel; })),
    /revealLabel is missing/);
  assert.throws(() => validateLevels(required((l) => { l.buckets[0].min = null; })),
    /only the lowest bucket may have no floor/);
  assert.throws(() => validateLevels(required((l) => { l.buckets[1].min = 1.5; })),
    /must run from the top down/);
});

test('every level still has at least 3 winning designs on the frozen snapshot', () => {
  // The same check scripts/check_levels.mjs runs, over the levels whose rules are
  // new here. It is seeded and takes under a second, so the frozen-snapshot
  // version runs on every push; the refresh workflow runs the script again on the
  // live prices the game is actually played on.
  const built = buildReturns(read('../data/prices.json'));
  const universe = [...KNOWN_TICKERS];
  const basket = read('../basket.json').stocks.map((s) => s.ticker);

  const four = checkLevel4(built, level4, universe, basket);
  assert.ok(four.winners.length >= REQUIRED_DESIGNS,
    `level 4 has ${four.winners.length} winning designs, fewer than ${REQUIRED_DESIGNS}`);
  assert.ok(four.all.some((r) => !r.passed), 'level 4 would be no challenge if nothing failed it');

  const five = checkLevel5(built, level5, universe);
  assert.ok(five.winners.length >= REQUIRED_DESIGNS,
    `level 5 has ${five.winners.length} winning designs, fewer than ${REQUIRED_DESIGNS}`);
  assert.ok(five.all.some((r) => !r.passed), 'level 5 would be no challenge if nothing failed it');
});

// ------------------------------------------------- level 6: what is a stock

test('the kinds in levels.json cover the ticker list exactly once', () => {
  // THE TEST THAT MAKES THE REDUNDANCY WORTH IT. levels.json writes out both
  // lists, 36 stocks and 4 that are not, and the only thing that can hold them
  // to the real ticker list is a test that reads both files. A ticker added to
  // tickers.json and classified nowhere fails here, rather than counting as a
  // stock - or not - by accident at the next level 6 round.
  const stocks = kindTickers(LEVELS, 'stocks');
  const notStocks = kindTickers(LEVELS, 'notStocks');
  const classified = [...stocks, ...notStocks];

  assert.equal(new Set(classified).size, classified.length, 'a ticker is classified twice');
  for (const ticker of classified) {
    assert.ok(KNOWN_TICKERS.has(ticker), `kinds has ${ticker}, which tickers.json does not`);
  }
  for (const ticker of KNOWN_TICKERS) {
    assert.ok(classified.includes(ticker),
      `${ticker} is in tickers.json but in no kind, so level 6 could not say whether it is a stock`);
  }
  assert.deepEqual([...notStocks].sort(), ['BND', 'GLD', 'LQD', 'TLT'],
    'the holdings that are not stocks are the three bond funds and gold');
});

test('PLTR is classified as the stock it is, whatever level 6 can replay', () => {
  // Two different reasons not to count: PLTR is a stock, and it had not listed in
  // February 2020. Mixing them up would be a way to get the wrong answer later -
  // in the 2022 window, which it can be held through.
  assert.ok(kindTickers(LEVELS, 'stocks').includes('PLTR'));
});

test('a ticker in two kinds is refused, because reading order would decide it', () => {
  assert.throws(() => validateKinds(((d) => { d.kinds.notStocks.push('VOO'); return d; })(copy())),
    /VOO is in two kinds/);
  assert.throws(() => validateKinds(((d) => { d.kinds.stocks.push(''); return d; })(copy())),
    /has an entry that is not a ticker/);
  assert.throws(() => validateKinds(((d) => { d.kinds.notStocks = []; return d; })(copy())),
    /kind "notStocks" is empty/);
});

// --------------------------------------------- level 6: the rule and the stars

test('level 6 asks what docs/PRD.md says it asks', () => {
  assert.equal(level6.pass.measure, 'fallShare');
  assert.equal(level6.pass.comparison, '<');
  assert.equal(level6.pass.threshold, 0.5, 'fell less than HALF as much as the S&P 500');
  assert.equal(level6.holdings.exactly, 4);
  assert.equal(level6.holdings.minShareIn.kind, 'stocks');
  assert.equal(level6.holdings.minShareIn.share, 0.6, 'at least 60% in stocks');
  // The window is the one the PRD fixes, and it is read from the crash file
  // rather than described here.
  assert.equal(level6.window.key, 'crash2020');
  assert.equal(level6.window.source, 'data/crashes.json');
  assert.ok(CRASH_MEASURES.includes('fallShare'));
});

test("level 6's buckets are its own threshold and the index itself, nothing new", () => {
  const edges = level6.buckets.map((b) => b.min);
  assert.deepEqual(edges, [1, 0.5, null]);
  assert.equal(edges[1], level6.pass.threshold, 'the middle edge is the level\'s own pass threshold');
  assert.equal(edges[0], 1, 'the top edge is falling one for one with the index');
  // A portfolio can rise while the index falls, which puts the answer below zero,
  // so the lowest bucket cannot have a floor to name.
  assert.equal(level6.buckets[level6.buckets.length - 1].min, null);
  assert.equal(bucketOf(level6, -0.117), 'heldUp');
  assert.equal(bucketOf(level6, 0.4999), 'heldUp');
  assert.equal(bucketOf(level6, 0.5), 'withIt');
  assert.equal(bucketOf(level6, 0.9999), 'withIt');
  assert.equal(bucketOf(level6, 1), 'harder');
  assert.equal(bucketOf(level6, 1.714), 'harder');
});

test("level 6's three-star band is the 0.10 levels 1 and 4 already use", () => {
  assert.equal(level6.stars.three.of, 0.1);
  assert.equal(level6.stars.three.of, levelById(LEVELS, 4).stars.three.of);
  assert.equal(level6.stars.two.test, 'bucket');
  // A passing build with a guess in the right bucket but 0.3 out: 2 stars.
  assert.equal(starsFor(level6, { guess: 0.1, actual: 0.4, passed: true }), 2);
  assert.equal(starsFor(level6, { guess: 0.35, actual: 0.4, passed: true }), 3);
  // And a miss scores nothing, however good the guess was.
  assert.equal(starsFor(level6, { guess: 0.72, actual: 0.72, passed: false }), 0);
});

test("level 6's slider puts the index in the middle and reaches both buckets", () => {
  assert.equal(level6.guess.min, 0);
  assert.equal(level6.guess.max, 2);
  assert.equal(level6.guess.step, 0.05);
  assert.equal((level6.guess.min + level6.guess.max) / 2, 1,
    'falling one for one with the index sits at the middle of the slider');
  // Every bucket has guesses in range that land in it, or a star would be
  // unreachable by construction.
  const reachable = new Set();
  for (let g = level6.guess.min; g <= level6.guess.max + 1e-9; g += level6.guess.step) {
    reachable.add(bucketOf(level6, Number(g.toFixed(2))));
  }
  assert.deepEqual([...reachable].sort(), ['harder', 'heldUp', 'withIt']);
});

test('a fall share on the threshold is shown to 4 decimals, not rounded onto it', () => {
  // docs/PRD.md: "A displayed number never disagrees with the pass check." The
  // boundary here is one ulp wide - 20% against 40% comes out at
  // 0.4999999999999999 and passes - so the screen has to show the digits that
  // say which side of 0.50 it is on.
  assert.equal(formatMeasure(0.4999999999999999, { threshold: 0.5 }), '0.5000');
  assert.equal(formatMeasure(0.5, { threshold: 0.5 }), '0.5000');
  assert.equal(formatMeasure(0.4325032943352791, { threshold: 0.5 }), '0.43');
  assert.equal(passes(level6, 0.4999999999999999), true);
  assert.equal(passes(level6, 0.5), false, 'exactly half as much is not less than half as much');
});

test('a level that replays a crash has to name its window and its file', () => {
  const sixth = (change) => {
    const d = copy();
    change(d.levels.find((l) => l.id === 6));
    return d;
  };
  assert.throws(() => validateLevels(sixth((l) => { delete l.window; })),
    /needs window.source and window.key/);
  assert.throws(() => validateLevels(sixth((l) => { delete l.window.key; })),
    /needs window.source and window.key/);
  assert.throws(() => validateLevels(sixth((l) => { l.holdings.minShareIn.kind = 'bonds'; })),
    /kinds block does not list/);
  assert.throws(() => validateLevels(sixth((l) => { l.holdings.minShareIn.share = 1.2; })),
    /share must be above 0 and at most 1/);
  // A floor that leaves the other three holdings less than $100 each cannot be
  // built at all, so the file is refused rather than the round failing later.
  assert.throws(() => validateLevels(sixth((l) => { l.holdings.minShareIn.share = 0.98; })),
    /leaves nothing for the other 3 holdings/);
  // 0.97 is the most a 4-holding level can ask for: $9,700 and $100 each.
  assert.equal(validateLevels(sixth((l) => { l.holdings.minShareIn.share = 0.97; })).version, LEVELS.version);
});

test("level 6's kind floor resolves to the tickers it counts", () => {
  const rule = kindFloorFor(level6, LEVELS);
  assert.equal(rule.kind, 'stocks');
  assert.equal(rule.share, 0.6);
  assert.equal(rule.tickers.length, 36);
  assert.ok(rule.tickers.includes('VOO') && rule.tickers.includes('NVDA'));
  assert.ok(!rule.tickers.includes('BND') && !rule.tickers.includes('GLD'));
  // Every other level has no such rule, and must not grow one by accident.
  for (const level of LEVELS.levels.filter((l) => l.id !== 6)) {
    assert.equal(kindFloorFor(level, LEVELS), null, `level ${level.id} grew a floor on a kind`);
  }
});

test('level 6 has at least 3 winning designs, and is not a walkover either', () => {
  // The same check scripts/check_levels.mjs runs. The prices are
  // data/crashes.json, which is history and never refreshed, so this one cannot
  // go stale as the market moves - unlike levels 1 to 5, which the weekly job
  // re-checks on live prices.
  const crashes = validateCrashes(read('../data/crashes.json'));
  const six = checkLevel6(crashes, level6, LEVELS, [...KNOWN_TICKERS]);
  assert.ok(six.winners.length >= REQUIRED_DESIGNS,
    `level 6 has ${six.winners.length} winning designs, fewer than ${REQUIRED_DESIGNS}`);
  assert.ok(six.all.some((r) => !r.passed), 'level 6 would be no challenge if nothing failed it');
  // Every draw that was not scored was counted, and counted draws are the ones
  // the numbers above are out of.
  assert.equal(six.skipped.noStock + six.skipped.shortOfFloor, 0,
    'a 4-holding draw with no stock in it should be impossible from 36 stocks of 40');
  assert.ok(six.skipped.unavailable > 0, 'PLTR draws exist and are skipped, not scored');
});

test('the named level 6 builds still give the answers written down beside them', () => {
  // Named cases rather than a sample: the pair that carries the lesson - the same
  // 60/40 shape with different stocks in it - is not something 1,000 random draws
  // would ever have put side by side.
  const crashes = validateCrashes(read('../data/crashes.json'));
  for (const result of checkLevel6Builds(crashes, level6)) {
    assert.ok(result.ok, `${result.build.key}: got ${result.value}, wanted ${result.build.expect.share}`);
    assert.equal(passes(level6, result.value), result.build.expect.passes, result.build.key);
  }
  // The pair is the lesson, so it is asserted as a pair rather than as two rows.
  const byKey = Object.fromEntries(
    checkLevel6Builds(crashes, level6).map((r) => [r.build.key, r]),
  );
  const defensive = byKey['defensive-stocks-and-bonds'];
  const banks = byKey['banks-and-oil-same-cushion'];
  assert.ok(defensive.passed && !banks.passed);
  assert.ok(banks.value > 4 * defensive.value,
    'the same shape with different stocks in it should be several times apart');
  assert.equal(LEVEL6_BUILDS.length, 6);
});
