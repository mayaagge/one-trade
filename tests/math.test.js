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
  buyAndHoldPath,
  deepestFall,
  fallAgainstIndex,
  totalChange,
  valuePath,
} from '../js/crash.js';
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

// --- what a replay draws, and the falls under it ---------------------------
//
// Crash replay holds a portfolio through a window: each holding's dollars grow
// on their own and the portfolio is their sum. The path has one more point than
// there are returns, because a replay starts at a CLOSE and applies the returns
// after it. tests/make_fixtures.py computes all of it with numpy, and three of
// the four cases are hand-derivable.

for (const c of fixtures.replay_cases) {
  const label = `${c.name} (${c.dollars.length} holdings, ${c.returns.length} days)`;

  test(`${label}: the held path matches numpy`, () => {
    assertVectorClose(buyAndHoldPath(c.dollars, c.returns), c.expected.path, 'buyAndHoldPath');
  });

  test(`${label}: the fall and the lowest point match numpy`, () => {
    const path = buyAndHoldPath(c.dollars, c.returns);
    assertClose(totalChange(path), c.expected.total_change, 'totalChange');
    assertClose(deepestFall(path), c.expected.deepest_fall, 'deepestFall');
  });

  test(`${label}: one holding on its own is the same path`, () => {
    // The S&P 500 line is one series, drawn by the same code as a portfolio of
    // one holding - so the two must agree, or the chart would draw its two lines
    // through different arithmetic.
    const alone = valuePath(c.dollars[0], c.returns.map((day) => day[0]));
    assertVectorClose(alone, c.expected.first_holding_path, 'valuePath');
    assertVectorClose(buyAndHoldPath([c.dollars[0]], c.returns.map((day) => [day[0]])),
      c.expected.first_holding_path, 'buyAndHoldPath of one holding');
  });

  test(`${label}: the path has one more point than there are returns`, () => {
    assert.equal(buyAndHoldPath(c.dollars, c.returns).length, c.returns.length + 1);
  });

  if (c.expected_exact) {
    test(`${label}: the hand-worked answer, exactly`, () => {
      const path = buyAndHoldPath(c.dollars, c.returns);
      c.expected_exact.path.forEach((value, i) => assertClose(path[i], value, `point ${i}`));
      assertClose(totalChange(path), c.expected_exact.total_change, 'total change by hand');
      assertClose(deepestFall(path), c.expected_exact.deepest_fall, 'deepest fall by hand');
    });
  }
}

test('holding a portfolio is not rebalancing it, and the fixtures carry both', () => {
  // The case that shows the two apart: one holding doubles twice while the other
  // halves twice. Held ends at $21,250; rebalanced daily, at $15,625.
  const c = fixtures.replay_cases.find((x) => x.name === 'replay_hold_or_rebalance');
  assertVectorClose(buyAndHoldPath(c.dollars, c.returns), c.expected.path, 'held');
  assert.notDeepEqual(c.expected.path, c.expected.rebalanced_path);
  assertClose(c.expected.path[c.expected.path.length - 1], 21250, 'held, by hand');
  assertClose(c.expected.rebalanced_path[c.expected.rebalanced_path.length - 1], 15625,
    'rebalanced, by hand');
});

test('the lowest point is not always the last day', () => {
  const c = fixtures.replay_cases.find((x) => x.name === 'replay_dips_and_recovers');
  const path = buyAndHoldPath(c.dollars, c.returns);
  assertClose(deepestFall(path), -0.30, 'it fell 30% at the bottom');
  assertClose(totalChange(path), -0.076, 'and ended 7.6% down');
});

// --- level 6's measure: the portfolio's fall against the index's -------------
//
// "Fell less than half as much as the S&P 500" is a ratio of two total changes,
// and these cases carry an index line of their own rather than reading it off
// the portfolio's first holding, which is what a level 6 round has.

for (const c of fixtures.fall_share_cases) {
  const label = `${c.name} (${c.dollars.length} holdings, ${c.returns.length} days)`;

  test(`${label}: the two paths and the share match numpy`, () => {
    const path = buyAndHoldPath(c.dollars, c.returns);
    const indexPath = buyAndHoldPath([path[0]], c.index_returns.map((r) => [r]));
    assertVectorClose(path, c.expected.path, 'the portfolio path');
    assertVectorClose(indexPath, c.expected.index_path, 'the index path');

    const change = totalChange(path);
    const indexChange = totalChange(indexPath);
    assertClose(change, c.expected.total_change, 'the portfolio change');
    assertClose(indexChange, c.expected.index_change, 'the index change');

    const against = fallAgainstIndex({ change, indexChange });
    if (c.expected.fall_share === null) {
      // An index that did not fall has no fall to take a share of, and
      // fallAgainstIndex() says so with null rather than with a number.
      assert.equal(against.share, null, 'the share on an index that rose');
      assert.equal(against.indexFell, false);
    } else {
      assertClose(against.share, c.expected.fall_share, 'the fall share');
      assert.equal(against.indexFell, true);
    }
  });

  test(`${label}: the share does not depend on the money the index line started with`, () => {
    // A ratio of changes cancels the starting dollars, so the index line drawn
    // from $1 gives the same answer as the one drawn from the player's $10,000.
    const path = buyAndHoldPath(c.dollars, c.returns);
    const unit = buyAndHoldPath([1], c.index_returns.map((r) => [r]));
    const against = fallAgainstIndex({ change: totalChange(path), indexChange: totalChange(unit) });
    if (c.expected.fall_share_unit_index === null) assert.equal(against.share, null);
    else assertClose(against.share, c.expected.fall_share_unit_index, 'the share off a $1 index');
  });

  if (c.expected_exact) {
    test(`${label}: the hand-worked share, exactly`, () => {
      const path = buyAndHoldPath(c.dollars, c.returns);
      const indexPath = buyAndHoldPath([path[0]], c.index_returns.map((r) => [r]));
      assertClose(totalChange(path), c.expected_exact.total_change, 'the portfolio change by hand');
      assertClose(totalChange(indexPath), c.expected_exact.index_change, 'the index change by hand');
      const share = fallAgainstIndex({
        change: totalChange(path), indexChange: totalChange(indexPath),
      }).share;
      if (c.expected_exact.fall_share === null) assert.equal(share, null);
      else assertClose(share, c.expected_exact.fall_share, 'the share by hand');
    });
  }
}

/** The share a fixture case works out to, through the same code a replay uses. */
function shareOf(c) {
  const path = buyAndHoldPath(c.dollars, c.returns);
  const indexPath = buyAndHoldPath([path[0]], c.index_returns.map((r) => [r]));
  return fallAgainstIndex({
    change: totalChange(path), indexChange: totalChange(indexPath),
  }).share;
}

test("level 6's threshold sits on a real build, not on a limit", () => {
  // A share of exactly 0.5 is reachable - 25% against the index's 50% - and the
  // level's rule is "<", so that build misses. The fixture carries the case so
  // the boundary is a tested number rather than a claim.
  const c = fixtures.fall_share_cases.find((x) => x.name === 'fall_share_at_the_threshold');
  assert.equal(shareOf(c), 0.5);
  assert.equal(shareOf(c) < 0.5, false, 'exactly half as much is not less than half as much');
});

test('the threshold is one ulp wide, and both languages land on the same bit', () => {
  // 20% against 40% is half as much in arithmetic but not in binary floating
  // point: it comes out at 0.4999999999999999 and PASSES. Nothing is rounded to
  // hide that - the number is what it is, and the display rule is what keeps the
  // screen from reading "0.50 clears the 0.50 needed" (see js/levels.js).
  const c = fixtures.fall_share_cases.find((x) => x.name === 'fall_share_one_ulp_under_the_threshold');
  const share = shareOf(c);
  assert.equal(share, 0.4999999999999999);
  assert.equal(share, c.expected.fall_share, 'numpy produced the same bit');
  assert.ok(share < 0.5, 'so this build clears a "<" check');
  assert.notEqual(share, 0.5);
});
