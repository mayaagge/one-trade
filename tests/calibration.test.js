// Tests for the threshold calibration of PREREG_AMENDMENT_2.md section 4.
//
// The amendment declares two synthetic correlation structures BEFORE the
// threshold is computed, and derives the threshold from them by a stated rule:
//
//   Tight        every pairwise correlation 0.70
//   Diversified  every pairwise correlation 0.30
//   Both spread volatility evenly from 0.8% to 2.0% a day across a portfolio's
//   holdings, using THE SAME ladder, so nothing but correlation moves between
//   them.
//
// The ladder is not decoration. An earlier draft gave every holding the same
// volatility, which makes all but one of the eigenvalues EXACTLY TIED - the one
// case where effective bets has no single right answer. Every one of the 500
// portfolios then changed its R when only the volatility scale changed, by up to
// 0.57, and the threshold came out at 0.55 or 0.54 depending on a number that is
// meant to be meaningless. numpy and the browser disagreed too. Distinct
// volatilities remove the ties, and both languages then agree to 12 digits.
//
//   Threshold = the midpoint of the median R under each structure, rounded to
//               two decimal places.
//
// The point of fixing it this way is that the number is DERIVED, not chosen: the
// only freedom is the two correlations, and they are published before the result
// is known. These tests check the procedure does what the amendment says.
//
// NO PRICES. The calibration needs no returns at all - only weights and a
// declared covariance matrix - so it cannot touch market data even by accident.
//
// Run: node --test "tests/**/*.test.js"
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SEED } from '../js/rng.js';
import { correlationOnlyRatio, registeredSets, median } from '../js/hypothesis1.js';
import { jacobiEigen } from '../js/math.js';
import {
  TIGHT_CORRELATION,
  DIVERSIFIED_CORRELATION,
  LADDER_LOW,
  LADDER_HIGH,
  volatilityLadder,
  declaredCovariance,
  medianRatioUnder,
  calibrateThreshold,
} from '../js/calibration.js';

const BASKET = ['NVDA', 'AMD', 'AVGO', 'MRVL', 'MU', 'ANET', 'VRT', 'MSFT',
  'GOOGL', 'AMZN', 'META', 'ORCL', 'PLTR'];

// --- the declared structures -------------------------------------------------

test('the two correlations are the ones declared in PREREG_AMENDMENT_2.md', () => {
  assert.equal(TIGHT_CORRELATION, 0.70, 'section 4 declares a tight structure of 0.70');
  assert.equal(DIVERSIFIED_CORRELATION, 0.30, 'section 4 declares a diversified structure of 0.30');
});

test('the volatility ladder is the one declared in the amendment', () => {
  assert.equal(LADDER_LOW, 0.008, 'section 4 declares 0.8% a day at the low end');
  assert.equal(LADDER_HIGH, 0.020, 'section 4 declares 2.0% a day at the high end');
});

test('volatilityLadder spreads volatility evenly across a portfolio holdings', () => {
  assert.deepEqual(volatilityLadder(3), [0.008, 0.014, 0.020]);
  assert.deepEqual(volatilityLadder(1), [0.008]);
  const eight = volatilityLadder(8);
  assert.equal(eight.length, 8);
  assert.equal(eight[0], LADDER_LOW);
  assert.equal(eight[7], LADDER_HIGH);
  for (let i = 1; i < eight.length; i += 1) {
    assert.equal(eight[i] > eight[i - 1], true, 'the ladder must rise');
  }
  // Evenly spaced: every step the same size.
  const steps = eight.slice(1).map((v, i) => v - eight[i]);
  for (const step of steps) {
    assert.equal(Math.abs(step - steps[0]) < 1e-15, true, 'the steps must be equal');
  }
});

test('volatilityLadder refuses a flat ladder, because flat means tied eigenvalues', () => {
  // This is the whole reason the ladder exists. A future edit that quietly made
  // the two endpoints equal would bring back an unreproducible threshold.
  assert.throws(() => volatilityLadder(4, 0.01, 0.01), /volatilityLadder/);
  assert.throws(() => volatilityLadder(4, 0.02, 0.01), /volatilityLadder/);
  assert.throws(() => volatilityLadder(0), /volatilityLadder/);
  assert.throws(() => volatilityLadder(2.5), /volatilityLadder/);
  assert.throws(() => volatilityLadder(3, 0, 0.02), /volatilityLadder/);
});

test('declaredCovariance builds the structure the amendment describes', () => {
  const cov = declaredCovariance(3, 0.7);
  const d = volatilityLadder(3);
  assert.equal(cov.length, 3);
  for (let i = 0; i < 3; i += 1) {
    assert.equal(Math.abs(cov[i][i] - d[i] * d[i]) < 1e-18, true,
      'the diagonal carries each holding own variance');
    for (let j = 0; j < 3; j += 1) {
      if (i !== j) {
        assert.equal(Math.abs(cov[i][j] - 0.7 * d[i] * d[j]) < 1e-18, true,
          'every pair shares one correlation');
      }
      assert.equal(cov[i][j], cov[j][i], 'the matrix must be exactly symmetric');
    }
  }
});

test('a correlation of zero gives an exactly diagonal matrix', () => {
  const cov = declaredCovariance(4, 0);
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      if (i !== j) assert.equal(cov[i][j], 0, 'off-diagonal entries must be exactly 0');
    }
  }
});

test('declaredCovariance refuses inputs that are not a covariance matrix', () => {
  assert.throws(() => declaredCovariance(0, 0.5), /volatilityLadder|declaredCovariance/);
  assert.throws(() => declaredCovariance(2.5, 0.5), /volatilityLadder|declaredCovariance/);
  assert.throws(() => declaredCovariance(3, 1.0), /declaredCovariance/);
  assert.throws(() => declaredCovariance(3, -0.9), /declaredCovariance/,
    'an equal correlation below -1/(n-1) is not a valid covariance matrix');
});

test('NO TIED EIGENVALUES: the declared structures have a well-defined answer', () => {
  // The guard on the whole fix. With equal volatilities, all but one eigenvalue
  // of these matrices are identical, and effective bets then depends on an
  // arbitrary choice of eigenvectors. The ladder must keep them apart at every
  // registered portfolio size, under both declared correlations.
  for (const rho of [TIGHT_CORRELATION, DIVERSIFIED_CORRELATION]) {
    for (let n = 3; n <= 8; n += 1) {
      const { values } = jacobiEigen(declaredCovariance(n, rho));
      const largest = Math.max(...values);
      for (let i = 1; i < values.length; i += 1) {
        const relativeGap = (values[i] - values[i - 1]) / largest;
        assert.equal(relativeGap > 1e-6, true,
          `rho ${rho}, ${n} holdings: eigenvalues ${values[i - 1]} and ${values[i]} are tied`);
      }
    }
  }
});

// --- the median R under a structure --------------------------------------------

test('medianRatioUnder gives exactly 1 when the declared correlation is zero', () => {
  // The sanity check on the whole method: with no correlation, R is 1 for every
  // portfolio whatever its weights, so the median is exactly 1.
  const { beginner } = registeredSets({ basket: BASKET, seed: SEED });
  const result = medianRatioUnder(beginner, 0);
  assert.equal(Math.abs(result.median - 1) < 1e-12, true, `median R was ${result.median}`);
  assert.equal(result.ratios.length, 500);
  for (const r of result.ratios) {
    assert.equal(Math.abs(r - 1) < 1e-12, true, `a portfolio gave R = ${r} at zero correlation`);
  }
});

test('medianRatioUnder matches working one portfolio out by hand', () => {
  const portfolios = [{ tickers: ['A', 'B', 'C'], weights: [0.5, 0.3, 0.2] }];
  const expected = correlationOnlyRatio([0.5, 0.3, 0.2], declaredCovariance(3, TIGHT_CORRELATION));
  assert.equal(medianRatioUnder(portfolios, TIGHT_CORRELATION).median, expected);
});

test('medianRatioUnder uses each portfolio own size', () => {
  const portfolios = [
    { tickers: ['A', 'B', 'C'], weights: [0.4, 0.35, 0.25] },
    { tickers: ['A', 'B', 'C', 'D', 'E'], weights: [0.3, 0.3, 0.2, 0.1, 0.1] },
  ];
  const result = medianRatioUnder(portfolios, TIGHT_CORRELATION);
  assert.equal(result.ratios.length, 2);
  assert.notEqual(result.ratios[0], result.ratios[1], 'different sizes should score differently');
});

test('a tighter market scores lower than a diversified one', () => {
  const { beginner } = registeredSets({ basket: BASKET, seed: SEED });
  const tight = medianRatioUnder(beginner, TIGHT_CORRELATION).median;
  const diversified = medianRatioUnder(beginner, DIVERSIFIED_CORRELATION).median;
  assert.equal(tight < diversified, true,
    `tight should score below diversified, got ${tight} and ${diversified}`);
  assert.equal(diversified < 1, true, 'any positive correlation must score below 1');
});

test('the median R does not depend on the scale of the ladder, only its shape', () => {
  // R is a ratio of two effective-bets figures on the same volatilities, so
  // multiplying every volatility by a constant must leave it untouched. With the
  // earlier equal-volatility structure this failed outright: all 500 portfolios
  // moved, one of them by 0.57. Here it holds to machine precision.
  const { beginner } = registeredSets({ basket: BASKET, seed: SEED });
  const base = medianRatioUnder(beginner, TIGHT_CORRELATION).median;
  const scaled = medianRatioUnder(beginner, TIGHT_CORRELATION, LADDER_LOW * 2.5, LADDER_HIGH * 2.5).median;
  assert.equal(Math.abs(base - scaled) < 1e-12, true,
    `the same ladder scaled by 2.5 changed the median from ${base} to ${scaled}`);
});

// --- the threshold ---------------------------------------------------------------

test('the threshold is the midpoint of the two medians, rounded to 2 decimals', () => {
  const portfolios = [{ tickers: ['A', 'B', 'C'], weights: [0.4, 0.35, 0.25] }];
  const result = calibrateThreshold({ portfolios });
  const midpoint = (result.tight.median + result.diversified.median) / 2;
  assert.equal(result.midpoint, midpoint);
  assert.equal(result.threshold, Math.round(midpoint * 100) / 100);
  assert.equal(Number.isInteger(result.threshold * 100), true, 'two decimal places');
});

test('the threshold sits strictly between the two medians', () => {
  const { beginner } = registeredSets({ basket: BASKET, seed: SEED });
  const result = calibrateThreshold({ portfolios: beginner });
  assert.equal(result.tight.median < result.threshold, true,
    `threshold ${result.threshold} is not above the tight median ${result.tight.median}`);
  assert.equal(result.threshold < result.diversified.median, true,
    `threshold ${result.threshold} is not below the diversified median ${result.diversified.median}`);
});

test('rounding to two decimals is plain arithmetic, not a bias', () => {
  // Checked on numbers that land exactly on a half, where rounding rules differ.
  assert.equal(Math.round(0.655 * 100) / 100, 0.66);
  assert.equal(Math.round(0.6549 * 100) / 100, 0.65);
});

test('calibrateThreshold reports the declared structures it used', () => {
  const { beginner } = registeredSets({ basket: BASKET, seed: SEED });
  const result = calibrateThreshold({ portfolios: beginner });
  assert.equal(result.tight.correlation, TIGHT_CORRELATION);
  assert.equal(result.diversified.correlation, DIVERSIFIED_CORRELATION);
  assert.equal(result.ladder.low, LADDER_LOW);
  assert.equal(result.ladder.high, LADDER_HIGH);
  assert.equal(result.portfolioCount, 500);
  assert.equal(result.disclaimer, 'Educational, not investment advice.');
});

test('the calibration is reproducible, and scores the registered beginner set', () => {
  const run = () => calibrateThreshold({
    portfolios: registeredSets({ basket: BASKET, seed: SEED }).beginner,
  });
  assert.deepEqual(run(), run());
});

test('the calibration needs no returns at all', () => {
  // If a future edit made it read prices, the portfolios here carry tickers that
  // exist in no price file, and nothing is passed in to look them up.
  const portfolios = [{ tickers: ['NOT_A_TICKER', 'ALSO_NOT', 'NOR_THIS'], weights: [0.5, 0.3, 0.2] }];
  const result = calibrateThreshold({ portfolios });
  assert.equal(Number.isFinite(result.threshold), true);
});

test('the median is the same one Hypothesis 1 uses', () => {
  assert.equal(medianRatioUnder(
    [
      { tickers: ['A', 'B', 'C'], weights: [0.5, 0.3, 0.2] },
      { tickers: ['A', 'B', 'C'], weights: [0.34, 0.33, 0.33] },
    ],
    TIGHT_CORRELATION,
  ).median, median([
    correlationOnlyRatio([0.5, 0.3, 0.2], declaredCovariance(3, TIGHT_CORRELATION)),
    correlationOnlyRatio([0.34, 0.33, 0.33], declaredCovariance(3, TIGHT_CORRELATION)),
  ]));
});
