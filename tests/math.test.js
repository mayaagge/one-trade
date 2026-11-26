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
  betaContributions,
  portfolioReturns,
  equalWeightBasket,
  maxRiskShare,
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

// --- beta to the equal-weight basket, the whole chain ----------------------
//
// Level 4's measure is three steps - average the basket's members, weight the
// holdings into one return series, divide the covariance by the basket's
// variance - and the cases above check only the last one, against a basket
// series handed to them. These check the chain end to end, and the per-holding
// decomposition the "Why?" card reads. tests/make_fixtures.py computes all of it
// with numpy.

for (const c of fixtures.beta_cases) {
  const label = `${c.name} (${c.members[0].length} members, ${c.weights.length} holdings)`;

  test(`${label}: the equal-weight basket matches numpy`, () => {
    const members = c.members[0].map((_, i) => `m${i}`);
    const byTicker = Object.fromEntries(
      members.map((name, i) => [name, c.members.map((day) => day[i])]),
    );
    assertVectorClose(equalWeightBasket(byTicker, members), c.expected.basket_returns, 'basket');
  });

  test(`${label}: beta to the basket matches numpy`, () => {
    const portfolio = portfolioReturns(c.holdings, c.weights);
    assertClose(betaTo(portfolio, c.expected.basket_returns), c.expected.portfolio_beta, 'betaTo');
  });

  test(`${label}: each holding's beta and contribution match numpy`, () => {
    const found = betaContributions(c.holdings, c.weights, c.expected.basket_returns);
    assertVectorClose(found.betas, c.expected.holding_betas, 'holding betas');
    assertVectorClose(found.contributions, c.expected.beta_contributions, 'beta contributions');
  });

  // The reason the card can name a holding's share of the AI exposure at all:
  // beta is linear in the weights, so the parts add up to the whole.
  test(`${label}: the contributions add up to the portfolio's beta`, () => {
    const found = betaContributions(c.holdings, c.weights, c.expected.basket_returns);
    const total = found.contributions.reduce((sum, value) => sum + value, 0);
    assertClose(total, found.beta, 'sum of contributions');
    assertClose(found.beta, c.expected.portfolio_beta, 'beta from betaContributions');
  });

  if (c.expected_exact) {
    test(`${label}: beta is exactly ${c.expected_exact.portfolio_beta}, by hand`, () => {
      const portfolio = portfolioReturns(c.holdings, c.weights);
      assertClose(betaTo(portfolio, c.expected.basket_returns),
        c.expected_exact.portfolio_beta, 'exact beta');
    });
  }
}

// --- the biggest share of risk, which is level 5's measure ------------------

for (const c of fixtures.cases) {
  test(`${c.name}: the biggest share of risk matches numpy`, () => {
    const cov = c.covariance_input ?? covariance(c.returns);
    assertClose(maxRiskShare(c.weights, cov), c.expected.max_risk_share, 'maxRiskShare');
  });
}
