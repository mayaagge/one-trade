// Tests for One Trade's seeded random number generator.
//
// The generator exists because JavaScript has none: Math.random cannot be
// seeded, so it could never reproduce a result. PREREG.md fixes the seed at
// 2026, which is only meaningful if the same seed always gives the same draws.
//
// These tests check two separate things:
//   1. REPRODUCIBILITY - the same seed gives identical draws, every time.
//   2. FAIRNESS - the draws are actually uniform, so the sampler is not biased.
//
// Tolerances are derived from sampling theory, not from running the code: for
// n draws of a uniform, the standard error of the mean is 1/sqrt(12n), and each
// tolerance below is at least 5 standard errors. They were written before the
// generator existed.
//
// Synthetic only. No prices, no market data.
//
// Run: node --test "tests/**/*.test.js"
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';

import { makeRng, SEED } from '../js/rng.js';

// --- the seed itself --------------------------------------------------------

test('the published seed is 2026, as fixed in PREREG.md', () => {
  assert.equal(SEED, 2026);
});

// --- reproducibility --------------------------------------------------------

test('the same seed gives an identical stream of uniforms', () => {
  const a = makeRng(SEED);
  const b = makeRng(SEED);
  const first = Array.from({ length: 50 }, () => a.uniform());
  const second = Array.from({ length: 50 }, () => b.uniform());
  assert.deepEqual(second, first);
});

test('a different seed gives a different stream', () => {
  const a = makeRng(SEED);
  const b = makeRng(SEED + 1);
  const first = Array.from({ length: 50 }, () => a.uniform());
  const second = Array.from({ length: 50 }, () => b.uniform());
  assert.notDeepEqual(second, first);
});

test('the same seed reproduces integers, picks and Dirichlet weights too', () => {
  const draw = (rng) => ({
    ints: Array.from({ length: 20 }, () => rng.int(7)),
    pick: rng.pick(['a', 'b', 'c', 'd', 'e'], 3),
    weights: rng.dirichletFlat(4),
  });
  assert.deepEqual(draw(makeRng(SEED)), draw(makeRng(SEED)));
});

test('two generators do not share state', () => {
  const a = makeRng(SEED);
  const b = makeRng(SEED);
  const fresh = makeRng(SEED).uniform();     // what the stream's first draw looks like

  a.uniform();                               // advance a only
  const second = a.uniform();
  const bFirst = b.uniform();

  assert.equal(bFirst, fresh, 'b should still be at the start of its own stream');
  assert.notEqual(second, bFirst, 'a should have moved past where b is');
});

// --- uniform() --------------------------------------------------------------

test('uniform() stays inside [0, 1)', () => {
  const rng = makeRng(SEED);
  for (let i = 0; i < 20000; i += 1) {
    const u = rng.uniform();
    assert.equal(Number.isFinite(u), true, `draw ${i} was not finite: ${u}`);
    assert.equal(u >= 0 && u < 1, true, `draw ${i} was outside [0, 1): ${u}`);
  }
});

test('uniform() has a mean of about 0.5', () => {
  const rng = makeRng(SEED);
  const n = 100000;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += rng.uniform();
  // standard error is 1/sqrt(12n) = 0.00091; 0.005 is about 5.5 of those.
  assert.equal(Math.abs(sum / n - 0.5) < 0.005, true, `mean was ${sum / n}`);
});

test('uniform() fills all ten tenths of the interval evenly', () => {
  const rng = makeRng(SEED);
  const n = 100000;
  const bins = new Array(10).fill(0);
  for (let i = 0; i < n; i += 1) bins[Math.floor(rng.uniform() * 10)] += 1;
  for (const [i, count] of bins.entries()) {
    // Each bin expects n/10 = 10000, standard deviation about 95. Allow 5%.
    assert.equal(Math.abs(count - n / 10) < n / 200, true,
      `tenth ${i} got ${count} draws, expected about ${n / 10}`);
  }
});

test('uniform() has more than 32 bits of resolution', () => {
  // A single 32-bit word can only produce multiples of 2^-32, so u * 2^32 would
  // always be a whole number. The Dirichlet draw needs finer than that.
  const rng = makeRng(SEED);
  let fractional = 0;
  for (let i = 0; i < 100; i += 1) {
    if (!Number.isInteger(rng.uniform() * 2 ** 32)) fractional += 1;
  }
  assert.equal(fractional > 90, true, `only ${fractional} of 100 draws had sub-2^-32 detail`);
});

// --- uniformOpen() ----------------------------------------------------------

test('uniformOpen() never returns exactly 0 or 1', () => {
  // The Dirichlet draw takes -ln(u), which is Infinity at u = 0. This guard is
  // the reason the open version exists.
  const rng = makeRng(SEED);
  for (let i = 0; i < 200000; i += 1) {
    const u = rng.uniformOpen();
    assert.equal(u > 0 && u < 1, true, `draw ${i} was ${u}, which is not strictly inside (0, 1)`);
  }
});

// --- int() ------------------------------------------------------------------

test('int(n) returns whole numbers from 0 to n-1', () => {
  const rng = makeRng(SEED);
  for (let i = 0; i < 20000; i += 1) {
    const value = rng.int(6);
    assert.equal(Number.isInteger(value), true, `got ${value}, which is not an integer`);
    assert.equal(value >= 0 && value <= 5, true, `got ${value}, outside 0 to 5`);
  }
});

test('int(1) is always 0', () => {
  const rng = makeRng(SEED);
  for (let i = 0; i < 100; i += 1) assert.equal(rng.int(1), 0);
});

test('int(n) hits every value about equally often', () => {
  const rng = makeRng(SEED);
  const n = 60000;
  const counts = new Array(6).fill(0);
  for (let i = 0; i < n; i += 1) counts[rng.int(6)] += 1;
  for (const [value, count] of counts.entries()) {
    // Expect 10000 each, standard deviation about 91. Allow 5%.
    assert.equal(Math.abs(count - n / 6) < n / 120, true,
      `value ${value} came up ${count} times, expected about ${n / 6}`);
  }
});

test('int() rejects sizes it cannot draw from', () => {
  const rng = makeRng(SEED);
  assert.throws(() => rng.int(0), /int/);
  assert.throws(() => rng.int(-3), /int/);
  assert.throws(() => rng.int(2.5), /int/);
});

// --- pick() -----------------------------------------------------------------

test('pick() returns the asked-for number of distinct members of the pool', () => {
  const rng = makeRng(SEED);
  const pool = ['VOO', 'QQQ', 'VTI', 'VXUS', 'BND', 'GLD', 'JPM'];
  for (let i = 0; i < 2000; i += 1) {
    const k = 3 + rng.int(5);
    const chosen = rng.pick(pool, k);
    assert.equal(chosen.length, k);
    assert.equal(new Set(chosen).size, k, `pick returned a duplicate: ${chosen}`);
    for (const ticker of chosen) {
      assert.equal(pool.includes(ticker), true, `${ticker} is not in the pool`);
    }
  }
});

test('pick() does not modify the pool it was given', () => {
  const rng = makeRng(SEED);
  const pool = ['a', 'b', 'c', 'd', 'e'];
  const before = [...pool];
  for (let i = 0; i < 100; i += 1) rng.pick(pool, 3);
  assert.deepEqual(pool, before);
});

test('pick() of the whole pool is a permutation of it', () => {
  const rng = makeRng(SEED);
  const pool = ['a', 'b', 'c', 'd', 'e'];
  const chosen = rng.pick(pool, pool.length);
  assert.deepEqual([...chosen].sort(), [...pool].sort());
});

test('pick() of nothing is an empty list', () => {
  assert.deepEqual(makeRng(SEED).pick(['a', 'b'], 0), []);
});

test('pick() refuses to draw more names than the pool holds', () => {
  const rng = makeRng(SEED);
  assert.throws(() => rng.pick(['a', 'b'], 3), /pick/);
  assert.throws(() => rng.pick(['a', 'b'], -1), /pick/);
});

test('pick() gives every combination roughly the same chance', () => {
  // 5 names taken 2 at a time is 10 combinations; each should get about a tenth.
  const rng = makeRng(SEED);
  const pool = ['a', 'b', 'c', 'd', 'e'];
  const n = 60000;
  const counts = new Map();
  for (let i = 0; i < n; i += 1) {
    const key = rng.pick(pool, 2).sort().join('');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.equal(counts.size, 10, `expected 10 distinct pairs, saw ${counts.size}`);
  for (const [pair, count] of counts) {
    // Expect 6000 each, standard deviation about 73. Allow 6%.
    assert.equal(Math.abs(count - n / 10) < n / 170, true,
      `pair ${pair} came up ${count} times, expected about ${n / 10}`);
  }
});

// --- dirichletFlat() --------------------------------------------------------

test('dirichletFlat(k) returns k positive weights that sum to 1', () => {
  const rng = makeRng(SEED);
  for (let i = 0; i < 5000; i += 1) {
    const k = 3 + rng.int(6);
    const weights = rng.dirichletFlat(k);
    assert.equal(weights.length, k);
    const sum = weights.reduce((total, w) => total + w, 0);
    assert.equal(Math.abs(sum - 1) < 1e-12, true, `weights summed to ${sum}`);
    for (const w of weights) {
      assert.equal(w > 0, true, `a weight was ${w}, which is not positive`);
      assert.equal(Number.isFinite(w), true, `a weight was ${w}`);
    }
  }
});

test('dirichletFlat(1) is a single weight of exactly 1', () => {
  assert.deepEqual(makeRng(SEED).dirichletFlat(1), [1]);
});

test('dirichletFlat() rejects sizes it cannot draw', () => {
  const rng = makeRng(SEED);
  assert.throws(() => rng.dirichletFlat(0), /dirichletFlat/);
  assert.throws(() => rng.dirichletFlat(-2), /dirichletFlat/);
  assert.throws(() => rng.dirichletFlat(3.5), /dirichletFlat/);
});

test('dirichletFlat() weights average 1/k, so no position is favoured', () => {
  const rng = makeRng(SEED);
  const k = 4;
  const draws = 40000;
  const sums = new Array(k).fill(0);
  for (let i = 0; i < draws; i += 1) {
    const weights = rng.dirichletFlat(k);
    for (let j = 0; j < k; j += 1) sums[j] += weights[j];
  }
  for (let j = 0; j < k; j += 1) {
    // Each weight has mean 1/k = 0.25 and variance (k-1)/(k^2 (k+1)) = 0.0375,
    // so the standard error over 40000 draws is 0.00097. Allow 0.006.
    assert.equal(Math.abs(sums[j] / draws - 1 / k) < 0.006, true,
      `position ${j} averaged ${sums[j] / draws}, expected ${1 / k}`);
  }
});

test('dirichletFlat() is flat: one weight follows Beta(1, k-1)', () => {
  // A flat Dirichlet is the uniform distribution over weights that sum to 1.
  // Its single-weight marginal is Beta(1, k-1), whose chance of landing below x
  // is 1 - (1 - x)^(k-1). That identity is what "flat" means, so checking it
  // checks the distribution and not just the mean.
  const rng = makeRng(SEED);
  const k = 5;
  const draws = 40000;
  const firsts = [];
  for (let i = 0; i < draws; i += 1) firsts.push(rng.dirichletFlat(k)[0]);

  for (const x of [0.05, 0.1, 0.2, 0.35, 0.5]) {
    const expected = 1 - (1 - x) ** (k - 1);
    const seen = firsts.filter((w) => w <= x).length / draws;
    // Binomial standard error is at most 0.0025 here; allow 0.012, about 5 of those.
    assert.equal(Math.abs(seen - expected) < 0.012, true,
      `P(weight <= ${x}) was ${seen}, expected about ${expected}`);
  }
});

test('dirichletFlat() spreads weight unevenly, as a flat draw should', () => {
  // A flat draw is not an equal-weight draw: the largest of 4 weights averages
  // well above 1/4. If someone replaced the draw with equal weights, or with
  // something far too concentrated, this catches it.
  const rng = makeRng(SEED);
  const draws = 20000;
  let largest = 0;
  for (let i = 0; i < draws; i += 1) largest += Math.max(...rng.dirichletFlat(4));
  const mean = largest / draws;
  // For a flat Dirichlet with k = 4 the largest weight averages 25/48 = 0.5208.
  assert.equal(Math.abs(mean - 25 / 48) < 0.01, true,
    `the largest of 4 weights averaged ${mean}, expected about ${25 / 48}`);
});

// --- the frozen stream ------------------------------------------------------
//
// HONEST LABEL: unlike every test above, the numbers here were RECORDED from
// js/rng.js after it was written. They are not a known answer derived from
// anywhere else, and they prove nothing about correctness - the tests above do
// that. Their job is to freeze the stream: if anyone ever edits the generator,
// or swaps it for a different one, every published figure in Hypotheses 1 and 2
// would silently change. This test fails loudly instead.

test('seed 2026 produces its published first draws (regression lock)', () => {
  const uniforms = Array.from({ length: 5 }, () => makeRng(SEED).uniform());
  assert.equal(uniforms.every((u) => u === uniforms[0]), true, 'a fresh generator should restart');

  const rng = makeRng(SEED);
  assert.deepEqual(Array.from({ length: 5 }, () => rng.uniform()), [
    0.17210804602121343,
    0.12454267537089636,
    0.5156590064802732,
    0.41664254477627904,
    0.8115186595977285,
  ]);

  assert.deepEqual(makeRng(SEED).dirichletFlat(4), [
    0.3270342924829948,
    0.38715314041684185,
    0.1230926925550186,
    0.16271987454514478,
  ]);

  const ints = makeRng(SEED);
  assert.deepEqual(Array.from({ length: 8 }, () => ints.int(6)), [0, 0, 1, 4, 2, 2, 2, 0]);
});
