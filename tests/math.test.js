// Known-answer tests for One Trade's browser math.
//
// The expected numbers come from tests/fixtures/known_answers.json, computed
// with numpy by tests/make_fixtures.py. Nothing is shared between the two
// languages except that file, so if they disagree, these tests fail.
//
// Run: node --test tests/
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SHARE_CUTOFF,
  jacobiEigen,
  covariance,
  correlation,
  effectiveBets,
  riskShares,
  betaTo,
  portfolioReturns,
} from '../js/math.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(here, 'fixtures', 'known_answers.json'), 'utf8'));
const REL = fixtures.tolerance.relative;   // 1e-9
const ABS = fixtures.tolerance.absolute;   // 1e-12

// Relative 1e-9, falling back to absolute 1e-12 near zero. Daily covariances are
// around 1e-4, so a plain absolute tolerance would be far too lenient on them.
function assertClose(actual, expected, what) {
  assert.equal(Number.isFinite(actual), true, `${what}: expected a finite number, got ${actual}`);
  const diff = Math.abs(actual - expected);
  const scale = Math.max(Math.abs(expected), Math.abs(actual));
  const ok = scale < 1 ? diff <= Math.max(ABS, scale * REL) : diff / scale <= REL;
  assert.equal(ok, true,
    `${what}: expected ${expected}, got ${actual} (absolute difference ${diff})`);
}

function assertVectorClose(actual, expected, what) {
  assert.equal(actual.length, expected.length, `${what}: wrong length`);
  expected.forEach((value, i) => assertClose(actual[i], value, `${what}[${i}]`));
}

function assertMatrixClose(actual, expected, what) {
  assert.equal(actual.length, expected.length, `${what}: wrong row count`);
  expected.forEach((row, i) => assertVectorClose(actual[i], row, `${what}[${i}]`));
}

// --- the two hand-derivable cases ------------------------------------------
// These need no numpy: the answers follow from the definition.

test('two identical assets score exactly 1 effective bet', () => {
  const c = fixtures.cases.find((x) => x.name === 'two_identical_assets');
  assertClose(effectiveBets(c.weights, c.covariance_input), 1.0, 'ENB for identical assets');
});

test('two independent, equally volatile assets score exactly 2 effective bets', () => {
  const c = fixtures.cases.find((x) => x.name === 'two_independent_equal_vol');
  assertClose(effectiveBets(c.weights, c.covariance_input), 2.0, 'ENB for independent assets');
});

test('an already-diagonal matrix is returned unrotated, as Case 2 requires', () => {
  const { values, vectors } = jacobiEigen([[4e-4, 0], [0, 4e-4]]);
  assertVectorClose(values, [4e-4, 4e-4], 'tied eigenvalues');
  assertMatrixClose(vectors, [[1, 0], [0, 1]], 'eigenvectors of a diagonal matrix');
});

// --- the three numpy-checked portfolios ------------------------------------

for (const c of fixtures.cases) {
  const label = `${c.name} (${c.weights.length} holdings)`;

  test(`${label}: covariance matches numpy`, () => {
    assertMatrixClose(covariance(c.returns), c.expected.covariance, 'covariance');
  });

  test(`${label}: correlation matches numpy`, () => {
    assertMatrixClose(correlation(c.returns), c.expected.correlation, 'correlation');
  });

  test(`${label}: effective bets matches numpy`, () => {
    const cov = c.covariance_input ?? covariance(c.returns);
    assertClose(effectiveBets(c.weights, cov), c.expected.effective_bets, 'effectiveBets');
  });

  test(`${label}: risk shares match numpy`, () => {
    const cov = c.covariance_input ?? covariance(c.returns);
    assertVectorClose(riskShares(c.weights, cov), c.expected.risk_shares, 'riskShares');
  });

  if (c.expected.beta_to_basket !== undefined) {
    test(`${label}: beta to the AI basket matches numpy`, () => {
      const port = portfolioReturns(c.returns, c.weights);
      assertClose(betaTo(port, fixtures.basket_returns), c.expected.beta_to_basket, 'betaTo');
    });
  }
}

// --- invariants that must hold for any input --------------------------------

for (const c of fixtures.cases) {
  const label = `${c.name} (${c.weights.length} holdings)`;

  test(`${label}: risk shares sum to 1`, () => {
    const cov = c.covariance_input ?? covariance(c.returns);
    const total = riskShares(c.weights, cov).reduce((a, b) => a + b, 0);
    assertClose(total, 1.0, 'sum of risk shares');
  });

  test(`${label}: effective bets lies between 1 and the holding count`, () => {
    const cov = c.covariance_input ?? covariance(c.returns);
    const enb = effectiveBets(c.weights, cov);
    assert.equal(enb >= 1 - 1e-9 && enb <= c.weights.length + 1e-9, true,
      `ENB ${enb} outside [1, ${c.weights.length}]`);
  });

  test(`${label}: the correlation diagonal is 1`, () => {
    const corr = correlation(c.returns);
    corr.forEach((row, i) => assertClose(row[i], 1.0, `correlation[${i}][${i}]`));
  });

  test(`${label}: reordering the holdings does not change effective bets`, () => {
    const cov = c.covariance_input ?? covariance(c.returns);
    const n = c.weights.length;
    const order = [...Array(n).keys()].reverse();
    const permutedCov = order.map((i) => order.map((j) => cov[i][j]));
    const permutedWeights = order.map((i) => c.weights[i]);
    assertClose(effectiveBets(permutedWeights, permutedCov),
      effectiveBets(c.weights, cov), 'ENB after reordering');
  });
}

test('the share cutoff matches the one used by make_fixtures.py', () => {
  assert.equal(SHARE_CUTOFF, fixtures.share_cutoff);
});
