// Tests for Hypothesis 2: a tightening market.
//
// PREREG.md's claim: "AI stocks move more closely with the broad market now than
// they did before the AI trade." Supported if the recent 12 months' correlation
// is more than 0.10 above the earliest 12 months', AND the lower end of a 90%
// interval for that difference is above 0. The interval comes from a block
// bootstrap with 20-day blocks and 2,000 resamples, seeded at 2026.
//
// What these tests check, in order:
//   1. The frozen inputs - 20-day blocks, 2,000 resamples, 90%, the 0.10 rise.
//   2. The equal-weight basket, which is the average of its members' daily
//      returns, rebalanced daily.
//   3. The block bootstrap - full 20-day blocks, contiguous, reproducible.
//   4. The percentile interval, against hand-checkable numbers.
//   5. The verdict rules, at each side of 0.10 and of zero.
//
// ALL DATA HERE IS SYNTHETIC.
//
// Run: node --test "tests/**/*.test.js"
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';

import { makeRng, SEED } from '../js/rng.js';
import {
  BLOCK_DAYS,
  RESAMPLES,
  INTERVAL_LEVEL,
  CORRELATION_RISE,
  MIN_WINDOW_DAYS,
  MIN_FULL_HISTORY_NAMES,
  equalWeightBasket,
  pairCorrelation,
  blockIndices,
  bootstrapDifferences,
  percentile,
  percentileInterval,
  verdictFor,
  hypothesis2,
} from '../js/hypothesis2.js';

// --- synthetic fixtures -----------------------------------------------------

/**
 * Two series of the requested length whose correlation is a known value. Built
 * from a seeded generator: b is a blend of a and an independent series, mixed
 * so that the population correlation is exactly rho.
 */
function pairWithCorrelation(rho, days, seed = 7) {
  const rng = makeRng(seed);
  const normal = () => {
    // Box-Muller, so the fixture does not depend on anything being tested.
    const u = rng.uniformOpen();
    const v = rng.uniformOpen();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const a = [];
  const b = [];
  for (let t = 0; t < days; t += 1) {
    const x = normal();
    const y = normal();
    a.push(0.01 * x);
    b.push(0.01 * (rho * x + Math.sqrt(1 - rho * rho) * y));
  }
  return { a, b };
}

/** A window object as hypothesis2 expects it. */
function windowOf(pair) {
  return { basket: pair.a, benchmark: pair.b };
}

// --- 1. the frozen inputs ---------------------------------------------------

test('the registered constants match PREREG.md', () => {
  assert.equal(BLOCK_DAYS, 20, 'PREREG fixes 20-day blocks');
  assert.equal(RESAMPLES, 2000, 'PREREG fixes 2,000 resamples');
  assert.equal(INTERVAL_LEVEL, 0.90, 'PREREG fixes a 90% interval');
  assert.equal(CORRELATION_RISE, 0.10, 'supported needs a rise of more than 0.10');
  assert.equal(MIN_WINDOW_DAYS, 200);
  assert.equal(MIN_FULL_HISTORY_NAMES, 2);
});

// --- 2. the equal-weight basket ---------------------------------------------

test('the equal-weight basket is the average of its members, day by day', () => {
  // Daily rebalanced: each day is the plain mean of that day's returns, with no
  // drift in the weights from one day to the next.
  const returnsByTicker = {
    NVDA: [0.02, -0.01, 0.00],
    AMD: [0.04, 0.03, 0.06],
    MU: [0.06, 0.01, 0.03],
  };
  assert.deepEqual(
    equalWeightBasket(returnsByTicker, ['NVDA', 'AMD', 'MU']),
    [0.04, 0.01, 0.03],
  );
});

test('a one-name basket is that name itself', () => {
  assert.deepEqual(equalWeightBasket({ NVDA: [0.1, -0.2] }, ['NVDA']), [0.1, -0.2]);
});

test('the basket follows the list of names it is given, not the whole object', () => {
  const returnsByTicker = { A: [1, 1], B: [3, 3], C: [100, 100] };
  assert.deepEqual(equalWeightBasket(returnsByTicker, ['A', 'B']), [2, 2]);
});

test('the basket refuses ragged or missing history', () => {
  assert.throws(() => equalWeightBasket({ A: [1, 2], B: [1] }, ['A', 'B']), /same number of days/);
  assert.throws(() => equalWeightBasket({ A: [1, 2] }, ['A', 'MISSING']), /MISSING/);
  assert.throws(() => equalWeightBasket({ A: [1, 2] }, []), /at least one/);
});

// --- 3. the block bootstrap -------------------------------------------------

test('blockIndices returns exactly as many days as the window has', () => {
  const rng = makeRng(SEED);
  for (const days of [100, 105, 252, 253, 20]) {
    assert.equal(blockIndices(rng, days, BLOCK_DAYS).length, days, `window of ${days} days`);
  }
});

test('every block is a full 20 days, taken from inside the window', () => {
  // Your clarification 2: block starts run from 0 to n - 20, so no block can
  // run off the end and none is short.
  const rng = makeRng(SEED);
  const days = 252;
  for (let trial = 0; trial < 200; trial += 1) {
    const indices = blockIndices(rng, days, BLOCK_DAYS);
    for (const index of indices) {
      assert.equal(Number.isInteger(index) && index >= 0 && index < days, true,
        `index ${index} is outside the window`);
    }
    // Walk the result in chunks of 20 and check each chunk is consecutive days.
    for (let start = 0; start + BLOCK_DAYS <= indices.length; start += BLOCK_DAYS) {
      const block = indices.slice(start, start + BLOCK_DAYS);
      for (let i = 1; i < block.length; i += 1) {
        assert.equal(block[i], block[i - 1] + 1,
          `block starting at ${start} is not consecutive: ${block}`);
      }
      assert.equal(block[0] <= days - BLOCK_DAYS, true,
        `a block started at day ${block[0]}, past the last full-block start ${days - BLOCK_DAYS}`);
    }
  }
});

test('blocks overlap: every start from 0 to n-20 can come up', () => {
  const rng = makeRng(SEED);
  const days = 40;                     // starts 0 to 20, so 21 possible blocks
  const starts = new Set();
  for (let trial = 0; trial < 4000; trial += 1) {
    const indices = blockIndices(rng, days, BLOCK_DAYS);
    for (let start = 0; start + BLOCK_DAYS <= indices.length; start += BLOCK_DAYS) {
      starts.add(indices[start]);
    }
  }
  assert.equal(starts.size, days - BLOCK_DAYS + 1,
    `saw ${starts.size} distinct block starts, expected ${days - BLOCK_DAYS + 1}`);
});

test('blockIndices refuses a window shorter than one block', () => {
  const rng = makeRng(SEED);
  assert.throws(() => blockIndices(rng, 19, BLOCK_DAYS), /blockIndices/);
});

test('blockIndices is reproducible from the seed', () => {
  assert.deepEqual(
    blockIndices(makeRng(SEED), 252, BLOCK_DAYS),
    blockIndices(makeRng(SEED), 252, BLOCK_DAYS),
  );
});

test('the bootstrap returns 2,000 differences, all finite correlation gaps', () => {
  const early = windowOf(pairWithCorrelation(0.2, 252, 11));
  const recent = windowOf(pairWithCorrelation(0.8, 252, 12));
  const differences = bootstrapDifferences({ early, recent, rng: makeRng(SEED) });

  assert.equal(differences.length, RESAMPLES);
  for (const value of differences) {
    assert.equal(Number.isFinite(value), true, `a resample gave ${value}`);
    assert.equal(value >= -2 && value <= 2, true, `a difference of ${value} is impossible`);
  }
});

test('the bootstrap resamples basket and benchmark on the SAME days', () => {
  // If the two series were resampled on different days, the correlation between
  // them would be destroyed and every resample would sit near zero. Here the two
  // windows are identical series, so a day-paired resample must give a
  // correlation of exactly 1 in each window and a difference of exactly 0.
  const series = pairWithCorrelation(0.5, 252, 13).a;
  const sameWindow = { basket: series, benchmark: series };
  const differences = bootstrapDifferences({
    early: sameWindow,
    recent: sameWindow,
    rng: makeRng(SEED),
    resamples: 50,
  });
  for (const value of differences) {
    assert.equal(Math.abs(value) < 1e-9, true,
      `paired resampling should give a difference of 0, got ${value}`);
  }
});

test('the bootstrap centres on the difference it is given', () => {
  const early = windowOf(pairWithCorrelation(0.2, 252, 11));
  const recent = windowOf(pairWithCorrelation(0.8, 252, 12));
  const observed = pairCorrelation(recent.basket, recent.benchmark)
    - pairCorrelation(early.basket, early.benchmark);
  const differences = bootstrapDifferences({ early, recent, rng: makeRng(SEED) });
  const mean = differences.reduce((sum, x) => sum + x, 0) / differences.length;
  assert.equal(Math.abs(mean - observed) < 0.05, true,
    `the resamples averaged ${mean}, the observed difference is ${observed}`);
});

test('the bootstrap is reproducible from the seed', () => {
  const early = windowOf(pairWithCorrelation(0.2, 252, 11));
  const recent = windowOf(pairWithCorrelation(0.8, 252, 12));
  const run = () => bootstrapDifferences({ early, recent, rng: makeRng(SEED), resamples: 100 });
  assert.deepEqual(run(), run());
});

// --- 4. correlation and the interval ----------------------------------------

test('pairCorrelation recovers a known correlation', () => {
  for (const rho of [0, 0.3, 0.6, 0.9]) {
    const { a, b } = pairWithCorrelation(rho, 4000, 21);
    const seen = pairCorrelation(a, b);
    assert.equal(Math.abs(seen - rho) < 0.04, true, `expected about ${rho}, got ${seen}`);
  }
});

test('pairCorrelation is exactly 1 for a series against itself, -1 against its negative', () => {
  const { a } = pairWithCorrelation(0.5, 300, 22);
  assert.equal(Math.abs(pairCorrelation(a, a) - 1) < 1e-12, true);
  assert.equal(Math.abs(pairCorrelation(a, a.map((x) => -x)) + 1) < 1e-12, true);
});

test('pairCorrelation refuses mismatched lengths', () => {
  assert.throws(() => pairCorrelation([1, 2, 3], [1, 2]), /pairCorrelation/);
});

test('percentile interpolates between neighbours, as numpy does', () => {
  // 0 to 100 inclusive is 101 values, so the 5th percentile sits exactly on 5.
  const values = Array.from({ length: 101 }, (_, i) => i);
  assert.equal(percentile(values, 0.05), 5);
  assert.equal(percentile(values, 0.95), 95);
  assert.equal(percentile(values, 0.5), 50);
  assert.equal(percentile(values, 0), 0);
  assert.equal(percentile(values, 1), 100);
  // Four values: the halfway point falls between the second and third.
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  // Two values: a quarter of the way along is a quarter of the way between them.
  assert.equal(percentile([0, 4], 0.25), 1);
});

test('percentile does not care what order it is given', () => {
  assert.equal(percentile([4, 1, 3, 2], 0.5), percentile([1, 2, 3, 4], 0.5));
  const values = [3, 1, 2];
  percentile(values, 0.5);
  assert.deepEqual(values, [3, 1, 2], 'the caller\'s list must not be reordered');
});

test('percentile refuses an empty list or a level outside 0 to 1', () => {
  assert.throws(() => percentile([], 0.5), /percentile/);
  assert.throws(() => percentile([1, 2], 1.5), /percentile/);
  assert.throws(() => percentile([1, 2], -0.1), /percentile/);
});

test('a 90% interval is the 5th and 95th percentiles', () => {
  const values = Array.from({ length: 101 }, (_, i) => i / 100);
  const { lower, upper } = percentileInterval(values, 0.90);
  assert.equal(Math.abs(lower - 0.05) < 1e-12, true, `lower was ${lower}`);
  assert.equal(Math.abs(upper - 0.95) < 1e-12, true, `upper was ${upper}`);
  assert.equal(lower < upper, true);
});

test('an interval on a real difference sits around it and excludes zero when it should', () => {
  const early = windowOf(pairWithCorrelation(0.1, 252, 31));
  const recent = windowOf(pairWithCorrelation(0.85, 252, 32));
  const differences = bootstrapDifferences({ early, recent, rng: makeRng(SEED) });
  const { lower, upper } = percentileInterval(differences, INTERVAL_LEVEL);
  assert.equal(lower > 0, true, `a 0.75 rise should give a lower end above 0, got ${lower}`);
  assert.equal(lower < upper, true);
  assert.equal(upper < 1.5, true);
});

test('an interval on no change at all straddles zero', () => {
  // One window used as BOTH periods, so the observed difference is exactly zero
  // while the two periods are still resampled independently.
  //
  // Note on why the fixture is built this way: a percentile interval sits around
  // the difference actually observed, not around zero. Two separate 252-day
  // draws from the same underlying correlation of 0.5 came out at 0.586 and
  // 0.441 - a gap of 0.145, three standard errors apart - and the interval
  // correctly excluded zero for them. A 252-day correlation carries a standard
  // error of about 0.047, so "the same correlation" in two separate samples is
  // not the same number.
  const window = windowOf(pairWithCorrelation(0.5, 252, 41));
  const differences = bootstrapDifferences({
    early: window,
    recent: window,
    rng: makeRng(SEED),
  });
  const { lower, upper } = percentileInterval(differences, INTERVAL_LEVEL);
  assert.equal(lower < 0 && upper > 0, true,
    `no change at all should straddle zero, got ${lower} to ${upper}`);
  assert.equal(Math.abs(lower + upper) < 0.05, true,
    `the interval should sit roughly evenly around zero, got ${lower} to ${upper}`);
});

// --- 5. the verdict rules ----------------------------------------------------

test('supported needs BOTH a rise above 0.10 and a lower end above 0', () => {
  const enough = { earlyDays: 252, recentDays: 252, fullHistoryNames: 11 };
  const call = (difference, lower) => verdictFor({ difference, lower, ...enough });

  assert.equal(call(0.30, 0.05), 'supported');
  assert.equal(call(0.1001, 0.0001), 'supported');

  assert.equal(call(0.10, 0.05), 'not supported', 'exactly 0.10 is not more than 0.10');
  assert.equal(call(0.09, 0.05), 'not supported', 'the rise is too small');
  assert.equal(call(0.30, 0), 'not supported', 'a lower end of exactly 0 is not above 0');
  assert.equal(call(0.30, -0.02), 'not supported', 'the interval includes no change');
  assert.equal(call(-0.40, -0.60), 'not supported', 'correlation fell');
});

test('not enough data outranks the rise and the interval', () => {
  const call = (extra) => verdictFor({
    difference: 0.5, lower: 0.2, earlyDays: 252, recentDays: 252, fullHistoryNames: 11, ...extra,
  });
  assert.equal(call({}), 'supported');
  assert.equal(call({ earlyDays: 199 }), 'not enough data');
  assert.equal(call({ recentDays: 199 }), 'not enough data');
  assert.equal(call({ earlyDays: 200, recentDays: 200 }), 'supported', '200 days is the floor');
  assert.equal(call({ fullHistoryNames: 1 }), 'not enough data',
    'one name is not an equal-weight basket');
  assert.equal(call({ fullHistoryNames: 2 }), 'supported');
});

// --- the whole hypothesis -----------------------------------------------------

test('hypothesis2 reports both correlations, the difference, the interval and a verdict', () => {
  const early = windowOf(pairWithCorrelation(0.15, 252, 51));
  const recent = windowOf(pairWithCorrelation(0.85, 252, 52));
  const result = hypothesis2({ early, recent, fullHistoryNames: 11, seed: SEED });

  assert.equal(result.verdict, 'supported');
  assert.equal(Math.abs(result.earlyCorrelation - pairCorrelation(early.basket, early.benchmark)) < 1e-12, true);
  assert.equal(Math.abs(result.recentCorrelation - pairCorrelation(recent.basket, recent.benchmark)) < 1e-12, true);
  assert.equal(Math.abs(result.difference - (result.recentCorrelation - result.earlyCorrelation)) < 1e-12, true);
  assert.equal(result.interval.lower < result.interval.upper, true);
  assert.equal(result.resamples, RESAMPLES);
  assert.equal(result.blockDays, BLOCK_DAYS);
  assert.equal(result.seed, SEED);
  assert.equal(result.disclaimer, 'Educational, not investment advice.');
});

test('hypothesis2 says not supported when the correlation barely moves', () => {
  const early = windowOf(pairWithCorrelation(0.50, 252, 61));
  const recent = windowOf(pairWithCorrelation(0.52, 252, 62));
  const result = hypothesis2({ early, recent, fullHistoryNames: 11, seed: SEED });
  assert.equal(result.verdict, 'not supported');
  assert.equal(result.difference < CORRELATION_RISE, true, `difference was ${result.difference}`);
});

test('hypothesis2 says not enough data on a short window', () => {
  const early = windowOf(pairWithCorrelation(0.15, 199, 71));
  const recent = windowOf(pairWithCorrelation(0.85, 252, 72));
  const result = hypothesis2({ early, recent, fullHistoryNames: 11, seed: SEED });
  assert.equal(result.verdict, 'not enough data');
  assert.equal(result.earlyDays, 199);
  assert.equal(result.recentDays, 252);
});

test('hypothesis2 is reproducible from the seed', () => {
  const early = windowOf(pairWithCorrelation(0.15, 252, 81));
  const recent = windowOf(pairWithCorrelation(0.85, 252, 82));
  const run = () => hypothesis2({ early, recent, fullHistoryNames: 11, seed: SEED });
  assert.deepEqual(run(), run());
});

test('hypothesis2 gives a different answer under a different seed, but the same verdict', () => {
  // The bootstrap interval is a random quantity; the correlations are not.
  const early = windowOf(pairWithCorrelation(0.15, 252, 91));
  const recent = windowOf(pairWithCorrelation(0.85, 252, 92));
  const a = hypothesis2({ early, recent, fullHistoryNames: 11, seed: SEED });
  const b = hypothesis2({ early, recent, fullHistoryNames: 11, seed: SEED + 1 });
  assert.equal(a.earlyCorrelation, b.earlyCorrelation, 'the data does not depend on the seed');
  assert.notEqual(a.interval.lower, b.interval.lower, 'the interval does');
  assert.equal(a.verdict, b.verdict, 'a 0.70 rise is far too clear for the seed to matter');
});
