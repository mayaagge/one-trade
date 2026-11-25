// One Trade - the leave-one-out reruns.
//
// PREREG.md, "The AI basket": "The 13 names from v1 are frozen in basket.json,
// each with a one-line reason it counts as AI-driven. Both hypotheses are rerun
// 13 times, dropping one name each time. If any single drop flips a verdict, the
// page says so."
//
// WHY THIS EXISTS, in plain language: the basket was chosen by hand, so a reader
// is entitled to ask whether the answer is really about AI stocks or just about
// NVDA. Dropping each name in turn and rerunning answers that. A verdict that
// survives all 13 drops is a verdict about the basket. One that does not is a
// verdict about whichever name it needed, and the page has to say so.
//
// This file does not know what a hypothesis is. It is handed functions to run,
// which keeps it testable with stand-ins and keeps the hypotheses independent of
// each other.
//
// Educational, not investment advice.

import { SEED } from './rng.js';

/**
 * Run something once per basket name, each time with that name removed.
 *
 * The remaining names keep their frozen order, and the basket handed in is never
 * modified - PREREG.md says the basket "is frozen and is never edited".
 *
 * @param {string[]} basket the frozen basket
 * @param {Function} run called as run(remainingBasket, droppedTicker, seed)
 * @param {number} seed 2026 for any published run
 */
export function leaveOneOut(basket, run, seed = SEED) {
  if (!Array.isArray(basket) || basket.length < 2) {
    throw new Error('leaveOneOut: need a basket of at least 2 names to drop one from');
  }
  if (typeof run !== 'function') {
    throw new Error('leaveOneOut: expected a function to run for each drop');
  }
  return basket.map((dropped) => ({
    dropped,
    result: run(basket.filter((ticker) => ticker !== dropped), dropped, seed),
  }));
}

/**
 * Compare every rerun's verdict with the headline one and report any that
 * differ. "not enough data" is a verdict like the others here: if dropping one
 * name leaves too little history to answer, that is itself a flip worth saying.
 *
 * verdictOf says where to find the verdict in a result. Hypothesis 1 carries two
 * since PREREG_AMENDMENT_2.md: the headline correlation-only verdict at
 * result.verdict, and the registered one at result.registered.verdict. Both are
 * read out of the SAME 13 reruns, so a rerun is never run twice.
 */
export function flippedVerdicts(baselineVerdict, runs, verdictOf = (result) => result.verdict) {
  const flippedBy = runs
    .filter((run) => verdictOf(run.result) !== baselineVerdict)
    .map((run) => ({ dropped: run.dropped, verdict: verdictOf(run.result) }));
  return {
    baselineVerdict,
    anyFlipped: flippedBy.length > 0,
    flippedBy,
    runs,
  };
}

/** "Hypothesis 1 becomes "not supported" without MU" */
function describe(label, flipped) {
  return flipped.flippedBy
    .map((flip) => `${label} becomes "${flip.verdict}" without ${flip.dropped}`)
    .join('; ');
}

/** Where the registered verdict sits inside a Hypothesis 1 result. */
const registeredVerdictOf = (result) => result.registered.verdict;

/**
 * The whole robustness check: both hypotheses, 13 reruns each, and one plain
 * sentence the Research page can print as it stands.
 *
 * HYPOTHESIS 1 HAS TWO VERDICTS TO WATCH, since PREREG_AMENDMENT_2.md section 6:
 * "That applies to the new primary test exactly as it applies to the registered
 * one: 13 reruns at seed 2026, and any drop that flips either verdict is named."
 * So a drop that moves only the registered verdict is reported too, even when the
 * headline verdict survives all 13 - the robustness check is not a check on the
 * headline alone.
 *
 * Both verdicts come out of ONE set of 13 reruns. Running the hypothesis twice
 * per drop would double the work and let the two readings drift apart.
 *
 * @param {object} options
 * @param {string[]} options.basket the frozen 13 names
 * @param {{hypothesis1: {verdict: string, registered: {verdict: string}},
 *          hypothesis2: {verdict: string}}} options.baseline
 *        the verdicts from the full basket
 * @param {Function} options.runH1 called as runH1(basket, dropped, seed)
 * @param {Function} options.runH2 called as runH2(basket, dropped, seed)
 */
export function leaveOneOutReport({ basket, baseline, runH1, runH2, seed = SEED }) {
  if (typeof baseline?.hypothesis1?.registered?.verdict !== 'string') {
    throw new Error(
      'leaveOneOutReport: the Hypothesis 1 baseline needs both verdicts - the headline one '
      + 'at verdict and the registered one at registered.verdict - because a drop that flips '
      + 'either of them has to be named',
    );
  }

  const h1Runs = leaveOneOut(basket, runH1, seed);
  const headline = flippedVerdicts(baseline.hypothesis1.verdict, h1Runs);
  const registered = flippedVerdicts(
    baseline.hypothesis1.registered.verdict, h1Runs, registeredVerdictOf,
  );
  const hypothesis1 = {
    runs: h1Runs,
    headline,
    registered,
    anyFlipped: headline.anyFlipped || registered.anyFlipped,
  };

  const hypothesis2 = flippedVerdicts(
    baseline.hypothesis2.verdict,
    leaveOneOut(basket, runH2, seed),
  );

  const anyFlipped = hypothesis1.anyFlipped || hypothesis2.anyFlipped;
  const parts = [
    describe('Hypothesis 1', headline),
    describe("Hypothesis 1's registered test", registered),
    describe('Hypothesis 2', hypothesis2),
  ].filter((part) => part !== '');

  return {
    seed,
    droppedCount: basket.length,
    hypothesis1,
    hypothesis2,
    anyFlipped,
    statement: anyFlipped
      ? `Dropping one basket stock changes a verdict: ${parts.join('; ')}.`
      : `No single basket stock changes a verdict: all ${basket.length} reruns agree with the headline.`,
    disclaimer: 'Educational, not investment advice.',
  };
}
