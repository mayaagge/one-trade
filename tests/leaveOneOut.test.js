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
import { beginnerPool } from '../js/hypothesis1.js';
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

// --- 3. the whole report --------------------------------------------------------

test('leaveOneOutReport covers both hypotheses and says plainly whether anything flipped', () => {
  // A stand-in for each hypothesis: H1 flips if MU is dropped, H2 never flips.
  const runH1 = (basket) => ({ verdict: basket.includes('MU') ? 'supported' : 'not supported' });
  const runH2 = () => ({ verdict: 'supported' });

  const report = leaveOneOutReport({
    basket: BASKET,
    baseline: { hypothesis1: { verdict: 'supported' }, hypothesis2: { verdict: 'supported' } },
    runH1,
    runH2,
  });

  assert.equal(report.hypothesis1.runs.length, 13);
  assert.equal(report.hypothesis2.runs.length, 13);
  assert.equal(report.hypothesis1.anyFlipped, true);
  assert.deepEqual(report.hypothesis1.flippedBy, [{ dropped: 'MU', verdict: 'not supported' }]);
  assert.equal(report.hypothesis2.anyFlipped, false);
  assert.equal(report.anyFlipped, true, 'either hypothesis flipping counts');
  assert.equal(
    report.statement,
    'Dropping one basket stock changes a verdict: Hypothesis 1 becomes '
    + '"not supported" without MU.',
  );
  assert.equal(report.disclaimer, 'Educational, not investment advice.');
});

test('leaveOneOutReport says so plainly when nothing flips', () => {
  const report = leaveOneOutReport({
    basket: BASKET,
    baseline: { hypothesis1: { verdict: 'supported' }, hypothesis2: { verdict: 'not supported' } },
    runH1: () => ({ verdict: 'supported' }),
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
    baseline: { hypothesis1: { verdict: 'supported' }, hypothesis2: { verdict: 'supported' } },
    runH1: (basket) => ({ verdict: basket.includes('NVDA') ? 'supported' : 'not supported' }),
    runH2: (basket) => ({ verdict: basket.includes('NVDA') ? 'supported' : 'not supported' }),
  });
  assert.equal(report.anyFlipped, true);
  assert.deepEqual(report.hypothesis1.flippedBy, [{ dropped: 'NVDA', verdict: 'not supported' }]);
  assert.deepEqual(report.hypothesis2.flippedBy, [{ dropped: 'NVDA', verdict: 'not supported' }]);
  assert.equal(
    report.statement,
    'Dropping one basket stock changes a verdict: Hypothesis 1 becomes '
    + '"not supported" without NVDA; Hypothesis 2 becomes "not supported" without NVDA.',
  );
});

test('every rerun uses the published seed, so a rerun is not a reroll', () => {
  const seeds = [];
  leaveOneOutReport({
    basket: BASKET,
    baseline: { hypothesis1: { verdict: 'supported' }, hypothesis2: { verdict: 'supported' } },
    runH1: (basket, dropped, seed) => { seeds.push(seed); return { verdict: 'supported' }; },
    runH2: (basket, dropped, seed) => { seeds.push(seed); return { verdict: 'supported' }; },
    seed: SEED,
  });
  assert.equal(seeds.length, 26, '13 reruns of each hypothesis');
  assert.equal(seeds.every((seed) => seed === SEED), true, 'every rerun uses seed 2026');
});
