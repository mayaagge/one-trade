// Tests for the leave-one-out reruns.
//
// PREREG.md, "The AI basket": "The 13 names from v1 are frozen in basket.json...
// Both hypotheses are rerun 13 times, dropping one name each time. If any single
// drop flips a verdict, the page says so."
//
// This is the robustness check on the basket: if the answer depends on NVDA
// being in it, the answer is about NVDA, not about AI stocks.
//
// What these tests check:
//   1. Thirteen reruns, each missing exactly one name, in the frozen order.
//   2. A flipped verdict is spotted and named.
//   3. The loop carries the drop through to both hypotheses properly.
//   4. Hypothesis 1 has TWO verdicts to watch, and a drop that flips either one
//      is named - PREREG_AMENDMENT_2.md section 6.
//
// ALL DATA HERE IS SYNTHETIC.
//
// Run: node --test "tests/**/*.test.js"
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SEED } from '../js/rng.js';
import { beginnerPool, hypothesis1 } from '../js/hypothesis1.js';
import { leaveOneOut, flippedVerdicts, leaveOneOutReport } from '../js/leaveOneOut.js';

const here = dirname(fileURLToPath(import.meta.url));
const BASKET = JSON.parse(readFileSync(join(here, '..', 'basket.json'), 'utf8'))
  .stocks.map((stock) => stock.ticker);

// --- 1. the reruns ----------------------------------------------------------

test('basket.json still holds the 13 frozen names', () => {
  // Not a test of this module, but of the rule it depends on: PREREG.md says the
  // basket "is frozen and is never edited". If it changed, 13 reruns is wrong.
  assert.equal(BASKET.length, 13);
  assert.equal(new Set(BASKET).size, 13, 'no name appears twice');
});

test('leaveOneOut runs once per basket name, dropping exactly that one', () => {
  const runs = leaveOneOut(BASKET, (basket, dropped) => ({ basket, dropped }));
  assert.equal(runs.length, 13);
  runs.forEach((run, i) => {
    assert.equal(run.dropped, BASKET[i], 'the runs keep the basket order');
    assert.equal(run.result.dropped, BASKET[i], 'the dropped name reaches the hypothesis too');
    assert.equal(run.result.basket.length, 12);
    assert.equal(run.result.basket.includes(BASKET[i]), false, `${BASKET[i]} should be gone`);
    for (const ticker of BASKET) {
      if (ticker !== BASKET[i]) {
        assert.equal(run.result.basket.includes(ticker), true, `${ticker} should still be there`);
      }
    }
  });
});

test('leaveOneOut keeps the remaining names in their frozen order', () => {
  const runs = leaveOneOut(['a', 'b', 'c', 'd'], (basket) => basket);
  assert.deepEqual(runs[0].result, ['b', 'c', 'd']);
  assert.deepEqual(runs[1].result, ['a', 'c', 'd']);
  assert.deepEqual(runs[3].result, ['a', 'b', 'c']);
});

test('leaveOneOut never modifies the frozen basket it was given', () => {
  const basket = [...BASKET];
  leaveOneOut(basket, (dropped) => dropped);
  assert.deepEqual(basket, BASKET);
});

test('leaveOneOut refuses a basket too small to drop from', () => {
  assert.throws(() => leaveOneOut([], () => null), /leaveOneOut/);
  assert.throws(() => leaveOneOut(['only'], () => null), /leaveOneOut/);
  assert.throws(() => leaveOneOut(BASKET, 'not a function'), /leaveOneOut/);
});

test('the drop reaches Hypothesis 1: the universe shrinks by one name', () => {
  const runs = leaveOneOut(BASKET, (basket) => beginnerPool(basket));
  for (const run of runs) {
    assert.equal(run.result.length, 21, '22 names less the dropped one');
    assert.equal(run.result.includes(run.dropped), false);
  }
});

// --- 2. spotting a flip -------------------------------------------------------

test('flippedVerdicts reports nothing when every rerun agrees', () => {
  const runs = [
    { dropped: 'NVDA', result: { verdict: 'supported' } },
    { dropped: 'AMD', result: { verdict: 'supported' } },
  ];
  const flipped = flippedVerdicts('supported', runs);
  assert.equal(flipped.anyFlipped, false);
  assert.deepEqual(flipped.flippedBy, []);
  assert.equal(flipped.baselineVerdict, 'supported');
});

test('flippedVerdicts names the drop that changed the answer', () => {
  const runs = [
    { dropped: 'NVDA', result: { verdict: 'supported' } },
    { dropped: 'AMD', result: { verdict: 'not supported' } },
    { dropped: 'MU', result: { verdict: 'supported' } },
    { dropped: 'ORCL', result: { verdict: 'not enough data' } },
  ];
  const flipped = flippedVerdicts('supported', runs);
  assert.equal(flipped.anyFlipped, true);
  assert.deepEqual(flipped.flippedBy, [
    { dropped: 'AMD', verdict: 'not supported' },
    { dropped: 'ORCL', verdict: 'not enough data' },
  ]);
});

test('"not enough data" counts as a different verdict, not as a missing one', () => {
  const runs = [{ dropped: 'VRT', result: { verdict: 'supported' } }];
  assert.equal(flippedVerdicts('not enough data', runs).anyFlipped, true);
});

// --- 3. a verdict read from somewhere other than result.verdict -------------

test('flippedVerdicts can watch a verdict nested inside the result', () => {
  // Hypothesis 1 carries two: the headline correlation-only verdict at
  // result.verdict, and the registered one at result.registered.verdict.
  const runs = [
    { dropped: 'NVDA', result: { verdict: 'supported', registered: { verdict: 'supported' } } },
    { dropped: 'AMD', result: { verdict: 'supported', registered: { verdict: 'not supported' } } },
  ];
  const headline = flippedVerdicts('supported', runs);
  const registered = flippedVerdicts('supported', runs, (result) => result.registered.verdict);

  assert.equal(headline.anyFlipped, false, 'the headline verdict held');
  assert.equal(registered.anyFlipped, true, 'the registered one did not');
  assert.deepEqual(registered.flippedBy, [{ dropped: 'AMD', verdict: 'not supported' }]);
});

// --- 4. the whole report ----------------------------------------------------

/** A Hypothesis 1 stand-in: both verdicts, as hypothesis1() returns them. */
function h1(verdict, registeredVerdict = verdict) {
  return { verdict, registered: { verdict: registeredVerdict } };
}

const BASELINE = {
  hypothesis1: h1('supported'),
  hypothesis2: { verdict: 'supported' },
};

test('leaveOneOutReport covers both hypotheses and says plainly whether anything flipped', () => {
  // A stand-in for each hypothesis: H1's headline flips if MU is dropped, H2 never flips.
  const runH1 = (basket) => h1(basket.includes('MU') ? 'supported' : 'not supported');
  const runH2 = () => ({ verdict: 'supported' });

  const report = leaveOneOutReport({ basket: BASKET, baseline: BASELINE, runH1, runH2 });

  assert.equal(report.hypothesis1.runs.length, 13);
  assert.equal(report.hypothesis2.runs.length, 13);
  assert.equal(report.hypothesis1.anyFlipped, true);
  assert.deepEqual(report.hypothesis1.headline.flippedBy, [
    { dropped: 'MU', verdict: 'not supported' },
  ]);
  assert.deepEqual(report.hypothesis1.registered.flippedBy, [
    { dropped: 'MU', verdict: 'not supported' },
  ], 'this stand-in moves both verdicts together');
  assert.equal(report.hypothesis2.anyFlipped, false);
  assert.equal(report.anyFlipped, true, 'either hypothesis flipping counts');
  assert.equal(
    report.statement,
    'Dropping one basket stock changes a verdict: Hypothesis 1 becomes '
    + '"not supported" without MU; Hypothesis 1\'s registered test becomes '
    + '"not supported" without MU.',
  );
  assert.equal(report.disclaimer, 'Educational, not investment advice.');
});

test('a drop that flips ONLY the registered verdict is still named', () => {
  // The headline verdict holds all 13 times; the registered one does not. The
  // amendment's section 6 says either flip is reported, so this must not pass
  // silently just because the headline survived.
  const report = leaveOneOutReport({
    basket: BASKET,
    baseline: BASELINE,
    runH1: (basket) => h1('supported', basket.includes('NVDA') ? 'supported' : 'not supported'),
    runH2: () => ({ verdict: 'supported' }),
  });

  assert.equal(report.hypothesis1.headline.anyFlipped, false);
  assert.equal(report.hypothesis1.registered.anyFlipped, true);
  assert.equal(report.hypothesis1.anyFlipped, true, 'either of H1\'s two verdicts counts');
  assert.equal(report.anyFlipped, true);
  assert.equal(
    report.statement,
    'Dropping one basket stock changes a verdict: Hypothesis 1\'s registered test '
    + 'becomes "not supported" without NVDA.',
  );
});

test('a drop that flips ONLY the headline verdict is named too', () => {
  const report = leaveOneOutReport({
    basket: BASKET,
    baseline: BASELINE,
    runH1: (basket) => h1(basket.includes('PLTR') ? 'supported' : 'not enough data', 'supported'),
    runH2: () => ({ verdict: 'supported' }),
  });
  assert.equal(report.hypothesis1.registered.anyFlipped, false);
  assert.deepEqual(report.hypothesis1.headline.flippedBy, [
    { dropped: 'PLTR', verdict: 'not enough data' },
  ]);
  assert.equal(
    report.statement,
    'Dropping one basket stock changes a verdict: Hypothesis 1 becomes '
    + '"not enough data" without PLTR.',
  );
});

test('Hypothesis 1 is rerun 13 times in all, not 13 times per verdict', () => {
  // Both verdicts come out of ONE rerun each. Running the hypothesis twice per
  // drop would double the work and, worse, invite the two to drift apart.
  let calls = 0;
  leaveOneOutReport({
    basket: BASKET,
    baseline: BASELINE,
    runH1: () => { calls += 1; return h1('supported'); },
    runH2: () => ({ verdict: 'supported' }),
  });
  assert.equal(calls, 13);
});

test('leaveOneOutReport refuses a Hypothesis 1 baseline with no registered verdict', () => {
  assert.throws(
    () => leaveOneOutReport({
      basket: BASKET,
      baseline: { hypothesis1: { verdict: 'supported' }, hypothesis2: { verdict: 'supported' } },
      runH1: () => h1('supported'),
      runH2: () => ({ verdict: 'supported' }),
    }),
    /registered/,
    'both of Hypothesis 1\'s verdicts must be watched, so both must be supplied',
  );
});

test('leaveOneOutReport says so plainly when nothing flips', () => {
  const report = leaveOneOutReport({
    basket: BASKET,
    baseline: { hypothesis1: h1('supported'), hypothesis2: { verdict: 'not supported' } },
    runH1: () => h1('supported'),
    runH2: () => ({ verdict: 'not supported' }),
  });
  assert.equal(report.anyFlipped, false);
  assert.equal(
    report.statement,
    'No single basket stock changes a verdict: all 13 reruns agree with the headline.',
  );
});

test('leaveOneOutReport lists every drop that flips, across both hypotheses', () => {
  const report = leaveOneOutReport({
    basket: BASKET,
    baseline: BASELINE,
    runH1: (basket) => h1(basket.includes('NVDA') ? 'supported' : 'not supported'),
    runH2: (basket) => ({ verdict: basket.includes('NVDA') ? 'supported' : 'not supported' }),
  });
  assert.equal(report.anyFlipped, true);
  assert.deepEqual(report.hypothesis1.headline.flippedBy, [
    { dropped: 'NVDA', verdict: 'not supported' },
  ]);
  assert.deepEqual(report.hypothesis2.flippedBy, [{ dropped: 'NVDA', verdict: 'not supported' }]);
  assert.equal(
    report.statement,
    'Dropping one basket stock changes a verdict: Hypothesis 1 becomes '
    + '"not supported" without NVDA; Hypothesis 1\'s registered test becomes '
    + '"not supported" without NVDA; Hypothesis 2 becomes "not supported" without NVDA.',
  );
});

test('every rerun uses the published seed, so a rerun is not a reroll', () => {
  const seeds = [];
  leaveOneOutReport({
    basket: BASKET,
    baseline: BASELINE,
    runH1: (basket, dropped, seed) => { seeds.push(seed); return h1('supported'); },
    runH2: (basket, dropped, seed) => { seeds.push(seed); return { verdict: 'supported' }; },
    seed: SEED,
  });
  assert.equal(seeds.length, 26, '13 reruns of each hypothesis');
  assert.equal(seeds.every((seed) => seed === SEED), true, 'every rerun uses seed 2026');
});

// --- 5. the real hypothesis through the real loop ----------------------------

test('13 real reruns of Hypothesis 1 carry BOTH verdicts, on synthetic returns', () => {
  // Not a stand-in: the actual hypothesis1(), run 13 times on the independence
  // fixture - every universe member exactly uncorrelated with every other, so
  // the claim is false by construction. R is 1 throughout, so the headline
  // verdict is "not supported" every time, while the registered test says
  // "supported" every time. Neither moves when a basket name is dropped, so
  // nothing flips, and the page may say the result is about the basket rather
  // than about any one name in it.
  const pool = beginnerPool(BASKET);
  const cycle = 2 * pool.length;
  const days = cycle * 6;                       // 264 days, past the 252 floor
  const returnsByTicker = Object.fromEntries(pool.map((ticker, i) => [
    ticker,
    Array.from({ length: days }, (_, t) => {
      const slot = t % cycle;
      if (slot === 2 * i) return 0.01;
      if (slot === 2 * i + 1) return -0.01;
      return 0;
    }),
  ]));

  const runH1 = (basket, dropped, seed) => hypothesis1({ returnsByTicker, basket, seed });
  const baseline = {
    hypothesis1: hypothesis1({ returnsByTicker, basket: BASKET, seed: SEED }),
    hypothesis2: { verdict: 'supported' },
  };
  assert.equal(baseline.hypothesis1.verdict, 'not supported', 'the headline reading');
  assert.equal(baseline.hypothesis1.registered.verdict, 'supported', 'the registered one');

  const report = leaveOneOutReport({
    basket: BASKET,
    baseline,
    runH1,
    runH2: () => ({ verdict: 'supported' }),
    seed: SEED,
  });

  assert.equal(report.hypothesis1.runs.length, 13);
  for (const run of report.hypothesis1.runs) {
    assert.equal(run.result.verdict, 'not supported', `dropping ${run.dropped} changed R`);
    assert.equal(run.result.registered.verdict, 'supported');
    assert.equal(Math.abs(run.result.headline.beginner.median - 1) < 1e-9, true,
      `dropping ${run.dropped} should still leave every R at 1`);
  }
  assert.equal(report.hypothesis1.headline.anyFlipped, false);
  assert.equal(report.hypothesis1.registered.anyFlipped, false);
  assert.equal(report.anyFlipped, false);
  assert.equal(
    report.statement,
    'No single basket stock changes a verdict: all 13 reruns agree with the headline.',
  );
});
