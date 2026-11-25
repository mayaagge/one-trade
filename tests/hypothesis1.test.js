// Tests for Hypothesis 1: hidden concentration.
//
// PREREG.md's claim: "a beginner who combines a broad index fund, a tech fund
// and individual AI stocks has far fewer independent sources of risk than
// holdings." Supported if the beginner set's median ratio of effective risk
// sources to holdings is below 0.60.
//
// What these tests check, in order:
//   1. The frozen inputs - the universe, the pools, 500 portfolios, sizes 3-8.
//   2. The sampler's rules - both beginner conditions, control names only.
//   3. The ratio - against the two hand-derivable cases already in the repo.
//   4. The median, the share below the threshold, and the verdict rules.
//
// ALL DATA HERE IS SYNTHETIC. Real prices would make a test that changes when
// the market does, which is not a test.
//
// Run: node --test "tests/**/*.test.js"
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { makeRng, SEED } from '../js/rng.js';
import { covariance } from '../js/math.js';
import {
  PORTFOLIO_COUNT,
  MIN_HOLDINGS,
  MAX_HOLDINGS,
  MEDIAN_THRESHOLD,
  MIN_DAYS,
  BROAD_FUNDS,
  PRESET_FUNDS,
  NON_AI_STOCKS,
  CONTROL_POOL,
  beginnerPool,
  isBeginnerPortfolio,
  samplePortfolio,
  sampleSet,
  portfolioRatio,
  median,
  summarise,
  verdictFor,
  hypothesis1,
  correlationOnlyRatio,
  portfolioCorrelationOnlyRatio,
  registeredSets,
} from '../js/hypothesis1.js';

// --- synthetic fixtures -----------------------------------------------------

const BASKET = ['NVDA', 'AMD', 'AVGO', 'MRVL', 'MU', 'ANET', 'VRT', 'MSFT',
  'GOOGL', 'AMZN', 'META', 'ORCL', 'PLTR'];

// The numpy known answers, for the correlation-only ratio tests at the end.
const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(here, 'fixtures', 'known_answers.json'), 'utf8'));

/** A tiny deterministic wave, so every ticker gets a different, non-flat series. */
function wave(offset, days) {
  return Array.from({ length: days }, (_, t) => 0.01 * Math.sin((t + offset) * 0.7) + 0.0001 * offset);
}

/** Independent-looking synthetic returns for a list of tickers. */
function syntheticReturns(tickers, days = MIN_DAYS) {
  const out = {};
  tickers.forEach((ticker, i) => { out[ticker] = wave(i * 11 + 1, days); });
  return out;
}

/** Two holdings with identical returns: effective bets is exactly 1, so the ratio is 1/2. */
const IDENTICAL = {
  tickers: ['A', 'B'],
  returnsByTicker: { A: wave(1, 300), B: wave(1, 300) },
};

/**
 * Four holdings whose returns are exactly uncorrelated and equally volatile,
 * built the same way as Case 2 of tests/fixtures/known_answers.json: effective
 * bets is exactly 4, so the ratio is exactly 1. See the tied-eigenvalue note in
 * js/math.js for why this needs constructed rather than sampled returns.
 */
function orthogonalFour() {
  const a = 0.01;
  const signs = [
    [+1, +1, +1, +1], [+1, +1, -1, -1], [+1, -1, +1, -1], [+1, -1, -1, +1],
    [-1, -1, -1, -1], [-1, -1, +1, +1], [-1, +1, -1, +1], [-1, +1, +1, -1],
  ];
  const tickers = ['W', 'X', 'Y', 'Z'];
  const returnsByTicker = Object.fromEntries(
    tickers.map((ticker, i) => [ticker, signs.map((row) => row[i] * a)]),
  );
  return { tickers, returnsByTicker };
}

// --- 1. the frozen inputs ---------------------------------------------------

test('the registered constants match PREREG.md', () => {
  assert.equal(PORTFOLIO_COUNT, 500, 'PREREG fixes 500 portfolios in each set');
  assert.equal(MIN_HOLDINGS, 3);
  assert.equal(MAX_HOLDINGS, 8);
  assert.equal(MEDIAN_THRESHOLD, 0.60, 'supported if the beginner median is below 0.60');
  assert.equal(MIN_DAYS, 252, "the PRD's floor for a covariance window");
});

test('the preset funds, broad funds and non-AI stocks are the registered ones', () => {
  assert.deepEqual(PRESET_FUNDS, ['VOO', 'QQQ', 'VTI', 'VXUS', 'BND', 'GLD']);
  assert.deepEqual(BROAD_FUNDS, ['VOO', 'VTI']);
  assert.deepEqual(NON_AI_STOCKS, ['JPM', 'JNJ', 'PG']);
});

test('the control pool is the registered seven names, and holds no AI stock', () => {
  assert.deepEqual(CONTROL_POOL, ['VTI', 'VXUS', 'BND', 'GLD', 'JPM', 'JNJ', 'PG']);
  for (const ticker of BASKET) {
    assert.equal(CONTROL_POOL.includes(ticker), false, `${ticker} must not be in the control pool`);
  }
  assert.equal(CONTROL_POOL.includes('QQQ'), false, 'QQQ must not be in the control pool');
  assert.equal(CONTROL_POOL.includes('VOO'), false, 'VOO is not in the registered control pool');
});

test('the beginner universe is the 22 registered names', () => {
  const pool = beginnerPool(BASKET);
  assert.equal(pool.length, 22, '6 preset funds + 13 AI stocks + 3 non-AI stocks');
  assert.equal(new Set(pool).size, 22, 'no name appears twice');
  for (const ticker of [...PRESET_FUNDS, ...BASKET, ...NON_AI_STOCKS]) {
    assert.equal(pool.includes(ticker), true, `${ticker} is missing from the universe`);
  }
});

test('the beginner universe drops a name when the basket does', () => {
  const pool = beginnerPool(BASKET.filter((t) => t !== 'MU'));
  assert.equal(pool.length, 21);
  assert.equal(pool.includes('MU'), false);
});

// --- 2. the sampler's rules -------------------------------------------------

test("isBeginnerPortfolio needs a broad fund AND a tech-or-AI holding", () => {
  const ok = (tickers) => isBeginnerPortfolio(tickers, BASKET);
  assert.equal(ok(['VOO', 'NVDA', 'JPM']), true, 'broad fund and an AI stock');
  assert.equal(ok(['VTI', 'QQQ', 'BND']), true, 'broad fund and QQQ');
  assert.equal(ok(['VOO', 'QQQ', 'NVDA']), true, 'both conditions twice over');
  assert.equal(ok(['QQQ', 'NVDA', 'JPM']), false, 'no broad fund');
  assert.equal(ok(['VOO', 'VTI', 'BND']), false, 'no QQQ and no AI stock');
  assert.equal(ok(['VOO', 'BND', 'JPM', 'JNJ']), false, 'no QQQ and no AI stock');
  assert.equal(ok(['BND', 'GLD', 'PG']), false, 'neither condition');
});

test('isBeginnerPortfolio follows the basket it is given', () => {
  // With MU dropped by the leave-one-out loop, MU no longer satisfies the
  // tech-or-AI condition.
  assert.equal(isBeginnerPortfolio(['VOO', 'MU', 'JPM'], BASKET), true);
  assert.equal(isBeginnerPortfolio(['VOO', 'MU', 'JPM'], BASKET.filter((t) => t !== 'MU')), false);
});

test('samplePortfolio keeps the size it was given and redraws only the names', () => {
  // Your clarification 1: the size is drawn once and fixed, so sizes stay
  // uniform across 3 to 8 however many redraws the conditions force.
  const rng = makeRng(SEED);
  const pool = beginnerPool(BASKET);
  for (let i = 0; i < 300; i += 1) {
    const tickers = samplePortfolio(rng, pool, 3, (names) => isBeginnerPortfolio(names, BASKET));
    assert.equal(tickers.length, 3, 'the size must not change when a draw is rejected');
    assert.equal(isBeginnerPortfolio(tickers, BASKET), true);
  }
});

test('samplePortfolio gives up rather than looping forever on an impossible rule', () => {
  const rng = makeRng(SEED);
  assert.throws(
    () => samplePortfolio(rng, ['a', 'b', 'c', 'd'], 3, () => false),
    /samplePortfolio/,
  );
});

test('the beginner set is 500 portfolios, each obeying both conditions', () => {
  const set = sampleSet({
    rng: makeRng(SEED),
    pool: beginnerPool(BASKET),
    count: PORTFOLIO_COUNT,
    isValid: (names) => isBeginnerPortfolio(names, BASKET),
  });
  assert.equal(set.length, 500);
  for (const portfolio of set) {
    assert.equal(isBeginnerPortfolio(portfolio.tickers, BASKET), true,
      `${portfolio.tickers} breaks a condition`);
    assert.equal(new Set(portfolio.tickers).size, portfolio.tickers.length, 'a name was repeated');
    assert.equal(portfolio.tickers.length >= MIN_HOLDINGS, true);
    assert.equal(portfolio.tickers.length <= MAX_HOLDINGS, true);
    assert.equal(portfolio.weights.length, portfolio.tickers.length);
    const sum = portfolio.weights.reduce((total, w) => total + w, 0);
    assert.equal(Math.abs(sum - 1) < 1e-12, true, `weights summed to ${sum}`);
    for (const w of portfolio.weights) assert.equal(w > 0, true, `a weight was ${w}`);
  }
});

test('beginner sizes are spread over all six allowed sizes', () => {
  // Sizes are drawn before the names, so rejecting a draw must not distort them.
  const set = sampleSet({
    rng: makeRng(SEED),
    pool: beginnerPool(BASKET),
    count: PORTFOLIO_COUNT,
    isValid: (names) => isBeginnerPortfolio(names, BASKET),
  });
  const counts = new Map();
  for (const p of set) counts.set(p.tickers.length, (counts.get(p.tickers.length) ?? 0) + 1);
  for (let size = MIN_HOLDINGS; size <= MAX_HOLDINGS; size += 1) {
    const count = counts.get(size) ?? 0;
    // Expect about 500/6 = 83 of each. Binomial standard deviation is 8.3, so
    // allow 40 to 130 - wide enough never to flake, tight enough to catch a
    // sampler that redraws the size and so favours the easier sizes.
    assert.equal(count >= 40 && count <= 130, true,
      `size ${size} appeared ${count} times, expected about 83`);
  }
});

test('the control set is 500 portfolios drawn only from the control pool', () => {
  const set = sampleSet({
    rng: makeRng(SEED),
    pool: CONTROL_POOL,
    count: PORTFOLIO_COUNT,
  });
  assert.equal(set.length, 500);
  for (const portfolio of set) {
    for (const ticker of portfolio.tickers) {
      assert.equal(CONTROL_POOL.includes(ticker), true, `${ticker} is not a control name`);
    }
    assert.equal(new Set(portfolio.tickers).size, portfolio.tickers.length);
  }
});

test('control sizes are capped at the 7 names the pool holds', () => {
  // PREREG says 3 to 8, but the control pool has only 7 names, so 8 is
  // impossible. The draw stays 3 to 8 and the result is capped at 7, which
  // makes 7 about twice as likely as the other sizes.
  const set = sampleSet({
    rng: makeRng(SEED),
    pool: CONTROL_POOL,
    count: PORTFOLIO_COUNT,
  });
  const counts = new Map();
  for (const p of set) counts.set(p.tickers.length, (counts.get(p.tickers.length) ?? 0) + 1);

  assert.equal(Math.max(...counts.keys()), 7, 'no control portfolio can hold 8 of 7 names');
  assert.equal(Math.min(...counts.keys()), MIN_HOLDINGS);
  const sevens = counts.get(7) ?? 0;
  const fives = counts.get(5) ?? 0;
  assert.equal(sevens > fives, true,
    `size 7 absorbs the 8s, so it should beat size 5: got ${sevens} and ${fives}`);
});

test('the same seed reproduces both sets exactly', () => {
  const draw = () => sampleSet({
    rng: makeRng(SEED),
    pool: beginnerPool(BASKET),
    count: 50,
    isValid: (names) => isBeginnerPortfolio(names, BASKET),
  });
  assert.deepEqual(draw(), draw());
});

// --- 3. the ratio -----------------------------------------------------------

test('identical holdings give a ratio of 1/N: one risk source, two holdings', () => {
  const ratio = portfolioRatio(
    { tickers: IDENTICAL.tickers, weights: [0.5, 0.5] },
    IDENTICAL.returnsByTicker,
  );
  assert.equal(Math.abs(ratio - 0.5) < 1e-9, true, `ratio was ${ratio}, expected 0.5`);
});

test('four independent, equally volatile holdings give a ratio of exactly 1', () => {
  const { tickers, returnsByTicker } = orthogonalFour();
  const ratio = portfolioRatio({ tickers, weights: [0.25, 0.25, 0.25, 0.25] }, returnsByTicker);
  assert.equal(Math.abs(ratio - 1) < 1e-9, true, `ratio was ${ratio}, expected 1`);
});

test('the ratio always lands between 1/N and 1', () => {
  const returnsByTicker = syntheticReturns(beginnerPool(BASKET), 300);
  const set = sampleSet({
    rng: makeRng(SEED),
    pool: beginnerPool(BASKET),
    count: 100,
    isValid: (names) => isBeginnerPortfolio(names, BASKET),
  });
  for (const portfolio of set) {
    const n = portfolio.tickers.length;
    const ratio = portfolioRatio(portfolio, returnsByTicker);
    assert.equal(Number.isFinite(ratio), true, `ratio was ${ratio}`);
    assert.equal(ratio >= 1 / n - 1e-9 && ratio <= 1 + 1e-9, true,
      `ratio ${ratio} is outside 1/${n} to 1`);
  }
});

test('portfolioRatio uses only the overlapping days of its holdings', () => {
  const returnsByTicker = {
    A: wave(1, 300),
    B: wave(5, 260),          // 40 fewer days of history
  };
  const ratio = portfolioRatio({ tickers: ['A', 'B'], weights: [0.5, 0.5] }, returnsByTicker);
  assert.equal(Number.isFinite(ratio), true, `ratio was ${ratio}`);
  assert.equal(ratio > 0 && ratio <= 1 + 1e-9, true);
});

test('portfolioRatio refuses a holding it has no returns for', () => {
  assert.throws(
    () => portfolioRatio({ tickers: ['A', 'MISSING'], weights: [0.5, 0.5] }, IDENTICAL.returnsByTicker),
    /MISSING/,
  );
});

// --- 4. the median, the share and the verdict -------------------------------

test('median averages the two middle values of an even-length list', () => {
  assert.equal(median([3, 1, 2, 4]), 2.5);
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([7]), 7);
  assert.equal(median([0.5, 0.5, 0.5, 0.5]), 0.5);
  assert.throws(() => median([]), /median/);
});

test('median does not reorder the list it was given', () => {
  const values = [3, 1, 2];
  median(values);
  assert.deepEqual(values, [3, 1, 2]);
});

test('summarise reports the median, the share below the threshold and the count', () => {
  const summary = summarise([0.1, 0.2, 0.8, 0.9], MEDIAN_THRESHOLD);
  assert.equal(summary.count, 4);
  assert.equal(summary.median, 0.5);
  assert.equal(summary.shareBelowThreshold, 0.5);
  assert.deepEqual(summary.ratios, [0.1, 0.2, 0.8, 0.9], 'the full distribution is reported too');
});

test('a ratio exactly on the threshold does not count as below it', () => {
  const summary = summarise([0.6, 0.6, 0.6, 0.6], 0.6);
  assert.equal(summary.shareBelowThreshold, 0);
});

test('hypothesis1 says supported when the beginner median is below 0.60', () => {
  // Identical returns for every name, so every portfolio scores 1/N, and with
  // 3 to 8 holdings every ratio is at most 1/3 - comfortably below 0.60.
  const pool = beginnerPool(BASKET);
  const shared = wave(3, 300);
  const returnsByTicker = Object.fromEntries(pool.map((t) => [t, shared]));
  const result = hypothesis1({ returnsByTicker, basket: BASKET, seed: SEED });

  assert.equal(result.verdict, 'supported');
  assert.equal(result.beginner.median < MEDIAN_THRESHOLD, true);
  assert.equal(result.beginner.count, 500);
  assert.equal(result.control.count, 500, "the control's median is reported beside it");
  assert.equal(typeof result.control.median, 'number');
  assert.equal(result.threshold, MEDIAN_THRESHOLD);
});

test('the verdict rule: supported only when the median is strictly below 0.60', () => {
  // Tested as a rule on its own, because no honest return fixture can drive the
  // real sampler to "not supported" - see the finding test below for why.
  assert.equal(verdictFor({ median: 0.0, days: 756, minDays: MIN_DAYS }), 'supported');
  assert.equal(verdictFor({ median: 0.5999, days: 756, minDays: MIN_DAYS }), 'supported');
  assert.equal(verdictFor({ median: 0.6, days: 756, minDays: MIN_DAYS }), 'not supported',
    'exactly 0.60 is not below 0.60');
  assert.equal(verdictFor({ median: 0.6001, days: 756, minDays: MIN_DAYS }), 'not supported');
  assert.equal(verdictFor({ median: 1.0, days: 756, minDays: MIN_DAYS }), 'not supported');
  // Too little history outranks the median, whatever the median says.
  assert.equal(verdictFor({ median: 0.1, days: 251, minDays: MIN_DAYS }), 'not enough data');
  assert.equal(verdictFor({ median: 0.1, days: 252, minDays: MIN_DAYS }), 'supported');
  assert.throws(() => verdictFor({ median: Number.NaN, days: 756, minDays: MIN_DAYS }), /verdictFor/);
});

test('FINDING: flat-Dirichlet weights alone put the median below 0.60', () => {
  // This test records a property of the pre-registered design, found before any
  // price existed. See BUILD_LOG.md, "What the 0.60 threshold actually measures".
  //
  // The fixture is the friendliest case diversification can have: 22 holdings
  // that are exactly uncorrelated and exactly equally volatile. Each ticker
  // moves on its own two days of a 44-day cycle and is flat otherwise, so every
  // cross-product is exactly 0 and the covariance matrix arrives diagonal - the
  // case js/math.js returns unrotated, so effective bets is not disturbed by
  // tied eigenvalues.
  //
  // With perfectly independent holdings the variance shares reduce to
  // w^2 / sum(w^2), so the ratio depends on the WEIGHTS ALONE. Flat Dirichlet
  // weights are uneven enough on their own to drag the median to about 0.51,
  // which is already below the registered 0.60. So the verdict comes out
  // "supported" even where there is no hidden concentration whatsoever.
  const pool = beginnerPool(BASKET);
  const cycle = 2 * pool.length;                 // 44 days, two per ticker
  const days = cycle * 6;                        // 264 days, past the 252 floor
  const returnsByTicker = Object.fromEntries(pool.map((ticker, i) => [
    ticker,
    Array.from({ length: days }, (_, t) => {
      const slot = t % cycle;
      if (slot === 2 * i) return 0.01;
      if (slot === 2 * i + 1) return -0.01;
      return 0;
    }),
  ]));

  const result = hypothesis1({ returnsByTicker, basket: BASKET, seed: SEED });
  assert.equal(result.verdict, 'supported',
    'perfectly independent holdings still clear the threshold');
  assert.equal(result.beginner.median < MEDIAN_THRESHOLD, true,
    `median was ${result.beginner.median}, expected below ${MEDIAN_THRESHOLD}`);
  assert.equal(result.beginner.median > 0.40 && result.beginner.median < 0.58, true,
    `median was ${result.beginner.median}, expected about 0.51`);
  assert.equal(result.control.median < MEDIAN_THRESHOLD, true,
    `the control median was ${result.control.median}: the threshold cannot separate the two sets`);
});

test('hypothesis1 says not enough data below 252 overlapping days', () => {
  const pool = beginnerPool(BASKET);
  const returnsByTicker = Object.fromEntries(pool.map((t, i) => [t, wave(i, 251)]));
  const result = hypothesis1({ returnsByTicker, basket: BASKET, seed: SEED });
  assert.equal(result.verdict, 'not enough data');
  assert.equal(result.days, 251);
  assert.equal(result.minDays, 252);
});

test('hypothesis1 runs at exactly 252 days', () => {
  const pool = beginnerPool(BASKET);
  const returnsByTicker = Object.fromEntries(pool.map((t, i) => [t, wave(i * 11 + 1, 252)]));
  const result = hypothesis1({ returnsByTicker, basket: BASKET, seed: SEED });
  assert.notEqual(result.verdict, 'not enough data');
});

test('hypothesis1 is reproducible and never mentions investment advice as fact', () => {
  const pool = beginnerPool(BASKET);
  const returnsByTicker = syntheticReturns(pool, 300);
  const first = hypothesis1({ returnsByTicker, basket: BASKET, seed: SEED });
  const second = hypothesis1({ returnsByTicker, basket: BASKET, seed: SEED });
  assert.deepEqual(second, first);
  assert.equal(first.seed, SEED);
  assert.equal(first.disclaimer, 'Educational, not investment advice.');
});

// --- the correlation-only ratio R -------------------------------------------
//
// PREREG_AMENDMENT_2.md section 3. R is effective bets with the real covariance
// matrix, divided by effective bets with the SAME weights and the SAME
// volatilities but every correlation switched off:
//
//   R = ENB(w, Sigma) / ENB(w, diag Sigma)
//
// R = 1 means correlation cost the portfolio nothing and the whole shortfall was
// uneven weights. R = 0.5 means correlation halved the risk sources the weights
// would otherwise have allowed. Because weights and volatilities are identical
// above and below the line, nothing but the correlations differs between them.

test('R is exactly 1 when nothing is correlated, whatever the weights', () => {
  // THE test for this measure: if R did not isolate correlation, uneven weights
  // would drag it below 1 here, exactly as they drag the registered ratio to 0.52.
  const diagonal = [
    [4e-4, 0, 0],
    [0, 1e-4, 0],
    [0, 0, 9e-4],
  ];
  for (const weights of [[1 / 3, 1 / 3, 1 / 3], [0.8, 0.1, 0.1], [0.02, 0.9, 0.08]]) {
    const r = correlationOnlyRatio(weights, diagonal);
    assert.equal(Math.abs(r - 1) < 1e-12, true, `weights ${weights} gave R = ${r}`);
  }
});

test('R is exactly 0.5 for two identical assets held 50/50', () => {
  // Hand-derivable: identical assets give 1 effective bet, and switching off
  // their correlation gives 2, so R is one half.
  const v = 1e-4;
  const r = correlationOnlyRatio([0.5, 0.5], [[v, v], [v, v]]);
  assert.equal(Math.abs(r - 0.5) < 1e-12, true, `R was ${r}`);
});

test('R ignores the scale of volatility, because it is a correlation measure', () => {
  const cov = [[4e-4, 1.2e-4, 0.5e-4], [1.2e-4, 9e-4, 2e-4], [0.5e-4, 2e-4, 1e-4]];
  const weights = [0.5, 0.3, 0.2];
  const base = correlationOnlyRatio(weights, cov);
  for (const factor of [4, 100, 0.01]) {
    const scaled = cov.map((row) => row.map((value) => value * factor));
    assert.equal(Math.abs(correlationOnlyRatio(weights, scaled) - base) < 1e-12, true,
      `scaling every variance by ${factor} changed R`);
  }
});

test('R falls as correlation rises', () => {
  const weights = [0.4, 0.35, 0.25];
  const v = 1e-4;
  const ratios = [0, 0.3, 0.5, 0.7, 0.9].map((rho) => {
    const cov = [
      [v, rho * v, rho * v],
      [rho * v, v, rho * v],
      [rho * v, rho * v, v],
    ];
    return correlationOnlyRatio(weights, cov);
  });
  assert.equal(Math.abs(ratios[0] - 1) < 1e-12, true, 'zero correlation must give exactly 1');
  for (let i = 1; i < ratios.length; i += 1) {
    assert.equal(ratios[i] < ratios[i - 1], true,
      `R did not fall: ${ratios[i - 1]} then ${ratios[i]}`);
  }
});

test('R above 1 is allowed and is not clamped', () => {
  // Negative correlation can spread risk more evenly than the weights alone
  // would, so R goes above 1. That is a real reading, not an error: it says
  // correlation HELPED. Nothing may quietly clip it to 1.
  const v = 1e-4;
  const r = correlationOnlyRatio([0.7, 0.3], [[v, -0.6 * v], [-0.6 * v, v]]);
  assert.equal(r > 1, true, `negative correlation should lift R above 1, got ${r}`);
});

test('R matches numpy on all five known-answer cases, to 1e-9', () => {
  // The same relative 1e-9 rule the rest of the browser math lives by
  // (CLAUDE.md rule 3). Expected values come from tests/make_fixtures.py.
  for (const testCase of fixtures.cases) {
    const cov = testCase.covariance_input ?? covariance(testCase.returns);
    const actual = correlationOnlyRatio(testCase.weights, cov);
    const expected = testCase.expected.correlation_only_ratio;
    const diff = Math.abs(actual - expected);
    const scale = Math.max(Math.abs(expected), Math.abs(actual));
    assert.equal(diff <= Math.max(1e-12, scale * 1e-9), true,
      `${testCase.name}: expected ${expected}, got ${actual}`);
  }
});

test('the two hand-derivable cases carry their exact R in the fixtures', () => {
  const exact = {
    two_identical_assets: 0.5,
    two_independent_equal_vol: 1.0,
  };
  for (const [name, expected] of Object.entries(exact)) {
    const testCase = fixtures.cases.find((c) => c.name === name);
    assert.equal(testCase.expected_exact.correlation_only_ratio, expected,
      `${name} should record an exact R of ${expected}`);
    assert.equal(
      Math.abs(correlationOnlyRatio(testCase.weights, testCase.covariance_input) - expected) < 1e-12,
      true,
      `${name}: the browser does not reproduce the exact R`,
    );
  }
});

test('portfolioCorrelationOnlyRatio works from returns, like the registered ratio', () => {
  // Two holdings with identical returns: R must be 0.5, as above.
  const r = portfolioCorrelationOnlyRatio(
    { tickers: IDENTICAL.tickers, weights: [0.5, 0.5] },
    IDENTICAL.returnsByTicker,
  );
  assert.equal(Math.abs(r - 0.5) < 1e-9, true, `R was ${r}`);
});

test('portfolioCorrelationOnlyRatio is 1 on exactly uncorrelated returns', () => {
  const { tickers, returnsByTicker } = orthogonalFour();
  const r = portfolioCorrelationOnlyRatio({ tickers, weights: [0.4, 0.3, 0.2, 0.1] }, returnsByTicker);
  assert.equal(Math.abs(r - 1) < 1e-9, true, `R was ${r}, expected exactly 1`);
});

test('portfolioCorrelationOnlyRatio refuses a holding it has no returns for', () => {
  assert.throws(
    () => portfolioCorrelationOnlyRatio(
      { tickers: ['A', 'MISSING'], weights: [0.5, 0.5] }, IDENTICAL.returnsByTicker,
    ),
    /MISSING/,
  );
});

// --- the registered sets, shared with the calibration ------------------------

test('registeredSets returns the 500 beginner and 500 control portfolios', () => {
  const sets = registeredSets({ basket: BASKET, seed: SEED });
  assert.equal(sets.beginner.length, 500);
  assert.equal(sets.control.length, 500);
  for (const portfolio of sets.beginner) {
    assert.equal(isBeginnerPortfolio(portfolio.tickers, BASKET), true);
  }
  for (const portfolio of sets.control) {
    for (const ticker of portfolio.tickers) {
      assert.equal(CONTROL_POOL.includes(ticker), true, `${ticker} is not a control name`);
    }
  }
});

test('registeredSets is reproducible and is one stream, beginner first', () => {
  assert.deepEqual(
    registeredSets({ basket: BASKET, seed: SEED }),
    registeredSets({ basket: BASKET, seed: SEED }),
  );
  // The beginner set must be the FIRST thing drawn from the stream, so that the
  // calibration in PREREG_AMENDMENT_2.md section 4 scores the same 500
  // portfolios hypothesis1 scores.
  const expectedBeginner = sampleSet({
    rng: makeRng(SEED),
    pool: beginnerPool(BASKET),
    count: PORTFOLIO_COUNT,
    isValid: (names) => isBeginnerPortfolio(names, BASKET),
  });
  assert.deepEqual(registeredSets({ basket: BASKET, seed: SEED }).beginner, expectedBeginner);
});

test('hypothesis1 scores exactly the portfolios registeredSets draws', () => {
  // Guards against the script and the page ever drifting apart.
  const pool = beginnerPool(BASKET);
  const returnsByTicker = syntheticReturns(pool, 300);
  const result = hypothesis1({ returnsByTicker, basket: BASKET, seed: SEED });
  const sets = registeredSets({ basket: BASKET, seed: SEED });

  const expectedBeginner = sets.beginner.map((p) => portfolioRatio(p, returnsByTicker));
  const expectedControl = sets.control.map((p) => portfolioRatio(p, returnsByTicker));
  assert.deepEqual(result.beginner.ratios, expectedBeginner);
  assert.deepEqual(result.control.ratios, expectedControl);
});
