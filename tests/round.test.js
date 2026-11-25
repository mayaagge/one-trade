// tests/round.test.js - one round of levels 1 to 3: build, guess, reveal.
//
// WHAT IS BEING CHECKED HERE, in order of how much it would cost to get wrong:
//
//   1. THE NUMBER. The effective bets the round computes for one of the 20 pool
//      portfolios matches the expectedBets committed in levels.json to 1e-9
//      (CLAUDE.md rule 3), for all 20. That value was produced by
//      scripts/make_pool.mjs from the same prices, so this checks the round's
//      whole chain - dollars to weights, window, matrix orientation, covariance,
//      effective bets - against a number computed by other code.
//   2. THE STARS. Each level's bands, including level 1's bucket band, awarded
//      on hand-worked cases.
//   3. WHAT THE ROUND REFUSES. A reveal before a guess, a build the level did not
//      ask for, a guess outside the range, a window too short to trust. Each of
//      these is a thing a player or a caller can actually do.
//
// The prices here are a game document BUILT FROM THE FROZEN SNAPSHOT, not the
// committed data/game.json. The snapshot never moves, so the expected numbers in
// this file stay true; the live file is rebuilt every weekday evening and would
// make every assertion a moving target. tests/gameView.test.js is where the two
// are held to each other.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildReturns } from '../js/returns.js';
import { GAME_DAYS } from '../scripts/build_game_data.mjs';
import { validateLevels, levelById, DISCLAIMER } from '../js/levels.js';
import {
  BUILD,
  GUESS,
  REVEAL,
  createRound,
  drawFromPool,
  evenSplit,
  holdingsWanted,
  measureFor,
  poolFor,
  usesMoney,
} from '../js/round.js';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));

const LEVELS = validateLevels(readJson('levels.json'));
const TICKERS = readJson('tickers.json');
const UNIVERSE = TICKERS.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));

// A game document at full precision, built from the frozen snapshot. Full
// precision so that a disagreement with levels.json is a fault in this code and
// not the file format's 10-decimal rounding, which tests/gameView.test.js owns.
const GAME = (() => {
  const built = buildReturns(readJson('data/prices.json'));
  const tickers = built.tickers.slice().sort();
  const from = built.dates.length - GAME_DAYS;
  const dates = built.dates.slice(from);
  return {
    meta: { liveThrough: dates[dates.length - 1], firstDate: dates[0], days: GAME_DAYS },
    tickers,
    rows: dates.map((date, i) => [date, ...tickers.map((t) => built.byTicker[t][from + i])]),
  };
})();

/** A round on a level, with the draw pinned when it matters. */
function round(levelId, { random = () => 0 } = {}) {
  return createRound({ levels: LEVELS, levelId, game: GAME, universe: UNIVERSE, random });
}

/** Play a whole round: pick these tickers, guess this, reveal. */
function play(levelId, picks, guess, options = {}) {
  const r = round(levelId, options);
  for (const ticker of picks) r.togglePick(ticker);
  r.toGuess();
  r.setGuess(guess);
  return { round: r, result: r.reveal() };
}

// ------------------------------------------------------------ the money

test('evenSplit divides $10,000 evenly between 5 holdings', () => {
  const split = evenSplit(['A', 'B', 'C', 'D', 'E'], 10000);
  assert.deepEqual(split, { A: 2000, B: 2000, C: 2000, D: 2000, E: 2000 });
});

test('evenSplit puts the odd $100 steps on the first holdings, and still sums to $10,000', () => {
  // 10,000 does not divide into 3 whole hundreds, and 3,400/3,300/3,300 is what
  // a player would type.
  const split = evenSplit(['A', 'B', 'C'], 10000);
  assert.deepEqual(split, { A: 3400, B: 3300, C: 3300 });
  assert.equal(Object.values(split).reduce((s, d) => s + d, 0), 10000);
});

test('evenSplit always sums to exactly the total, for every size a level can ask for', () => {
  for (let n = 1; n <= 8; n += 1) {
    const tickers = Array.from({ length: n }, (_, i) => `T${i}`);
    const split = evenSplit(tickers, 10000);
    assert.equal(Object.values(split).reduce((s, d) => s + d, 0), 10000, `${n} holdings`);
    for (const d of Object.values(split)) assert.equal(d % 100, 0, 'every share is a whole $100 step');
  }
});

test('evenSplit refuses a split finer than the step allows', () => {
  const tickers = Array.from({ length: 101 }, (_, i) => `T${i}`);
  assert.throws(() => evenSplit(tickers, 10000), /does not divide into 101 steps/);
  assert.throws(() => evenSplit([], 10000), /nothing to split between/);
});

// -------------------------------------------------------------- the draw

test('drawFromPool is uniform over the 20, and takes the first and the last', () => {
  assert.equal(drawFromPool(LEVELS.guessPool, () => 0).id, 'p01');
  assert.equal(drawFromPool(LEVELS.guessPool, () => 0.999999).id, 'p20');
  assert.equal(drawFromPool(LEVELS.guessPool, () => 0.5).id, 'p11');
  // A random() that returns exactly 1, which the spec forbids but a bad shim
  // might, must not fall off the end of the pool.
  assert.equal(drawFromPool(LEVELS.guessPool, () => 1).id, 'p20');
});

test('drawFromPool hands back a copy, so a round cannot edit the pool', () => {
  const drawn = drawFromPool(LEVELS.guessPool, () => 0);
  const ticker = Object.keys(drawn.dollars)[0];
  drawn.dollars[ticker] = 1;
  assert.notEqual(LEVELS.guessPool.portfolios[0].dollars[ticker], 1);
});

test('a level-2 round records which pool portfolio was drawn, so level 7 can exclude it', () => {
  const r = round(2, { random: () => 0.5 });
  assert.equal(r.drawnId, 'p11');
  r.toGuess();
  r.setGuess(2);
  assert.equal(r.reveal().drawnId, 'p11', 'the id survives into the result');
});

test('only the fixed level draws: levels 1 and 3 have no drawn portfolio', () => {
  assert.equal(round(1).drawnId, null);
  assert.equal(round(3).drawnId, null);
  assert.equal(round(2).drawnId, 'p01');
});

// ------------------------------------------------------ the level's shape

test('each level reads its shape out of levels.json', () => {
  assert.equal(usesMoney(levelById(LEVELS, 1)), false, 'level 1 is a correlation, so no money step');
  assert.equal(usesMoney(levelById(LEVELS, 2)), true);
  assert.equal(usesMoney(levelById(LEVELS, 3)), true);
  assert.equal(holdingsWanted(levelById(LEVELS, 1)), 2);
  assert.equal(holdingsWanted(levelById(LEVELS, 3)), 5);
  assert.equal(poolFor(levelById(LEVELS, 1), UNIVERSE).length, 14);
  assert.equal(poolFor(levelById(LEVELS, 3), UNIVERSE).length, UNIVERSE.length);
});

test('a round starts on the build screen with nothing picked and nothing guessed', () => {
  const r = round(1);
  assert.equal(r.state, BUILD);
  assert.deepEqual(r.picks, []);
  assert.equal(r.guess, null);
  assert.equal(r.hasGuessed(), false);
  assert.equal(r.buildComplete(), false);
});

test('level 2 starts with its drawn portfolio already built', () => {
  const r = round(2);
  assert.equal(r.fixed, true);
  assert.equal(r.buildComplete(), true);
  assert.equal(Object.values(r.dollars).reduce((s, d) => s + d, 0), 10000);
});

// ------------------------------------------------------------- the build

test('picking and unpicking holdings', () => {
  const r = round(1);
  r.togglePick('VOO');
  assert.deepEqual(r.picks, ['VOO']);
  r.togglePick('VTI');
  assert.deepEqual(r.picks, ['VOO', 'VTI']);
  r.togglePick('VOO');
  assert.deepEqual(r.picks, ['VTI'], 'picking a held name again removes it');
});

test('a level takes no more holdings than it asked for', () => {
  const r = round(1);
  r.togglePick('VOO');
  r.togglePick('VTI');
  assert.equal(r.canAddPick(), false);
  r.togglePick('QQQ');
  assert.deepEqual(r.picks, ['VOO', 'VTI'], 'the third pick is ignored, not swapped in');
});

test('a ticker outside the level pool is a caller bug and throws', () => {
  const r = round(1);
  assert.throws(() => r.togglePick('NFLX'), /not in this level's pool/);
  // Level 1's pool is 14 curated names: a real ticker outside it is still out.
  assert.throws(() => r.togglePick('PLTR'), /not in this level's pool/);
});

test('the fixed portfolio cannot be edited', () => {
  const r = round(2);
  assert.throws(() => r.togglePick(r.picks[0]), /fixed and cannot be changed/);
  assert.throws(() => r.adjustDollars(r.picks[0], 1), /fixed and cannot be changed/);
});

test('level 3 starts the money split evenly across the chosen holdings', () => {
  const r = round(3);
  for (const t of ['VOO', 'BND', 'GLD', 'XOM', 'JNJ']) r.togglePick(t);
  assert.deepEqual(r.dollars, { VOO: 2000, BND: 2000, GLD: 2000, XOM: 2000, JNJ: 2000 });
  assert.equal(r.allocated(), 10000);
});

test('changing the line-up splits the money evenly again', () => {
  const r = round(3);
  for (const t of ['VOO', 'BND', 'GLD']) r.togglePick(t);
  assert.deepEqual(r.dollars, { VOO: 3400, BND: 3300, GLD: 3300 });
  r.togglePick('XOM');
  assert.deepEqual(r.dollars, { VOO: 2500, BND: 2500, GLD: 2500, XOM: 2500 });
  r.togglePick('GLD');
  assert.deepEqual(r.dollars, { VOO: 3400, BND: 3300, XOM: 3300 });
});

test('adjusting the money moves it in $100 steps and keeps the total at $10,000', () => {
  const r = round(3);
  for (const t of ['VOO', 'BND', 'GLD', 'XOM', 'JNJ']) r.togglePick(t);
  assert.equal(r.adjustDollars('VOO', 5), 5);
  assert.equal(r.dollars.VOO, 2500);
  assert.equal(r.allocated(), 10000);
  assert.equal(r.adjustDollars('VOO', -3), 3);
  assert.equal(r.dollars.VOO, 2200);
  assert.equal(r.allocated(), 10000);
});

test('no holding is ever taken below $100, so a 5-holding portfolio stays 5 holdings', () => {
  const r = round(3);
  for (const t of ['VOO', 'BND', 'GLD', 'XOM', 'JNJ']) r.togglePick(t);
  // Ask for far more than the others can give.
  r.adjustDollars('VOO', 500);
  assert.equal(r.allocated(), 10000);
  for (const t of r.picks) assert.ok(r.dollars[t] >= 100, `${t} is ${r.dollars[t]}`);
  assert.equal(r.dollars.VOO, 10000 - 4 * 100);
  // And the other way: VOO cannot be emptied either.
  r.adjustDollars('VOO', -1000);
  assert.equal(r.dollars.VOO, 100);
  assert.equal(r.allocated(), 10000);
});

test('adjustDollars refuses holdings and levels it does not apply to', () => {
  const r = round(3);
  for (const t of ['VOO', 'BND', 'GLD', 'XOM', 'JNJ']) r.togglePick(t);
  assert.throws(() => r.adjustDollars('QQQ', 1), /not in this portfolio/);
  assert.throws(() => r.adjustDollars('VOO', 1.5), /whole number/);
  const one = round(1);
  one.togglePick('VOO');
  assert.throws(() => one.adjustDollars('VOO', 1), /allocates no money/);
});

test('the build has to match the level before the guess screen opens', () => {
  const r = round(3);
  assert.throws(() => r.toGuess(), /wants exactly 5 holdings; this has 0/);
  for (const t of ['VOO', 'BND', 'GLD']) r.togglePick(t);
  assert.throws(() => r.toGuess(), /wants exactly 5 holdings; this has 3/);
  for (const t of ['XOM', 'JNJ']) r.togglePick(t);
  assert.equal(r.toGuess().state, GUESS);
});

// ------------------------------------------------------------- the guess

test('the guess is null until the player moves the slider, and the reveal waits for it', () => {
  // docs/PRD.md: "The guess comes first." The screen shows no number to anchor
  // on, so there is nothing to confirm by accident.
  const r = round(1);
  r.togglePick('VOO');
  r.togglePick('VTI');
  r.toGuess();
  assert.equal(r.guess, null);
  assert.equal(r.hasGuessed(), false);
  assert.equal(r.canReveal(), false, 'the Reveal button stays disabled');
  assert.throws(() => r.reveal(), /no guess has been made/);

  r.setGuess(0.9);
  assert.equal(r.hasGuessed(), true);
  assert.equal(r.canReveal(), true);
});

test('a guess of zero counts as a guess, and is not mistaken for no guess at all', () => {
  const r = round(1);
  r.togglePick('VOO');
  r.togglePick('VTI');
  r.toGuess();
  r.setGuess(0);
  assert.equal(r.guess, 0);
  assert.equal(r.hasGuessed(), true);
  assert.equal(r.canReveal(), true);
});

test('a guess outside the level range is refused', () => {
  const r = round(1);
  r.togglePick('VOO');
  r.togglePick('VTI');
  r.toGuess();
  assert.throws(() => r.setGuess(1.5), /outside this level's range of -1 to 1/);
  assert.throws(() => r.setGuess(-1.01), /outside this level's range/);
  assert.throws(() => r.setGuess(Number.NaN), /has to be a number/);
  // The ends of the range are inside it.
  r.setGuess(-1);
  r.setGuess(1);
  assert.equal(r.guess, 1);
});

test('levels 2 and 3 take a guess between 1 and 5 bets', () => {
  const r = round(2);
  r.toGuess();
  assert.deepEqual(r.guessRange(), { min: 1, max: 5 });
  assert.throws(() => r.setGuess(0.5), /outside this level's range of 1 to 5/);
  assert.throws(() => r.setGuess(6), /outside this level's range of 1 to 5/);
});

test('going back to the build throws the guess away rather than carrying it over', () => {
  const r = round(1);
  r.togglePick('VOO');
  r.togglePick('VTI');
  r.toGuess();
  r.setGuess(0.9);
  r.toBuild();
  assert.equal(r.state, BUILD);
  assert.equal(r.guess, null, 'a changed portfolio deserves a fresh guess');
  assert.equal(r.canReveal(), false);
});

// ------------------------------------------------------- the number itself

test('all 20 pool portfolios reveal the effective bets committed in levels.json, to 1e-9', () => {
  // The known-answer check. scripts/make_pool.mjs computed expectedBets from the
  // same prices through a different path; the round has to agree.
  for (const [i, portfolio] of LEVELS.guessPool.portfolios.entries()) {
    const r = round(2, { random: () => i / LEVELS.guessPool.portfolios.length });
    assert.equal(r.drawnId, portfolio.id);
    r.toGuess();
    r.setGuess(2);
    const result = r.reveal();
    assert.ok(
      Math.abs(result.value - portfolio.expectedBets) < 1e-9,
      `${portfolio.id}: the round says ${result.value}, levels.json says ${portfolio.expectedBets}`,
    );
    assert.equal(result.measure, 'effectiveBets');
    assert.equal(result.days, 756);
  }
});

test('the window is the 756 days levels.json asks for, ending on the last day of the data', () => {
  const { result } = play(3, ['VOO', 'BND', 'GLD', 'XOM', 'JNJ'], 3);
  assert.equal(result.days, LEVELS.window.days);
  assert.equal(result.endDate, GAME.meta.liveThrough);
});

test('a correlation reveal reads the pair, and VOO with VTI is one bet in two names', () => {
  const { result } = play(1, ['VOO', 'VTI'], 0.95);
  assert.equal(result.measure, 'correlation');
  assert.ok(result.value > 0.99, `VOO/VTI correlate at ${result.value}`);
  assert.equal(result.passed, true);
});

test('the dollars a level does not use become equal weights, and are not invented', () => {
  const { round: r, result } = play(1, ['VOO', 'VTI'], 0.95);
  assert.deepEqual(r.dollars, {});
  assert.deepEqual(result.weights, [0.5, 0.5]);
  assert.deepEqual(result.dollars, {});
});

test('the weights a reveal uses are the dollars the player allocated', () => {
  const r = round(3);
  for (const t of ['VOO', 'BND', 'GLD', 'XOM', 'JNJ']) r.togglePick(t);
  r.adjustDollars('VOO', 10);                   // VOO to 3,000, taken from the others
  r.toGuess();
  r.setGuess(3);
  const result = r.reveal();
  assert.equal(result.dollars.VOO, 3000);
  assert.ok(Math.abs(result.weights[result.tickers.indexOf('VOO')] - 0.3) < 1e-12);
  assert.ok(Math.abs(result.weights.reduce((s, w) => s + w, 0) - 1) < 1e-12);
});

test('a measure over too few trading days is refused rather than shown', () => {
  // A newly listed ticker: 10 days of overlap against a 252-day minimum.
  const doc = {
    meta: { liveThrough: '2026-11-25' },
    tickers: ['AAA', 'BBB'],
    rows: Array.from({ length: 300 }, (_, i) => [
      `2026-01-${String((i % 28) + 1).padStart(2, '0')}`.replace(/^2026-01/, `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}`),
      0.001 * ((i % 7) - 3),
      i < 290 ? null : 0.002 * ((i % 5) - 2),
    ]),
  };
  const level = levelById(LEVELS, 3);
  assert.throws(
    () => measureFor(level, doc, { tickers: ['AAA', 'BBB'], weights: [0.5, 0.5] }, LEVELS.window),
    /overlap on only 10 trading days, fewer than the 252/,
  );
});

// ------------------------------------------------------------- the stars

test('level 3: passing with a guess within half a bet is 3 stars', () => {
  // JNJ + TLT + GOOGL + LQD + COP is the best design the level check found.
  const { result } = play(3, ['JNJ', 'TLT', 'GOOGL', 'LQD', 'COP'], 3.5);
  assert.equal(result.passed, true);
  assert.ok(result.value >= 3, `${result.value} bets`);
  assert.equal(Math.abs(result.guess - result.value) <= 0.5, true);
  assert.equal(result.stars, 3);
});

test('level 3: passing with a wild guess is 1 star, and failing is none', () => {
  const far = play(3, ['JNJ', 'TLT', 'GOOGL', 'LQD', 'COP'], 1).result;
  assert.equal(far.passed, true);
  assert.equal(far.stars, 1);

  // Five AI names are nearly one bet, which is the lesson and a failed level.
  const failed = play(3, ['NVDA', 'AMD', 'AVGO', 'MU', 'ANET'], 1.2).result;
  assert.equal(failed.passed, false);
  assert.ok(failed.value < 3, `${failed.value} bets`);
  assert.equal(failed.stars, 0, 'a failed level scores nothing, however good the guess');
});

test('level 1: the second star is the right bucket, the third is within 0.10', () => {
  const close = play(1, ['VOO', 'VTI'], 0.95).result;      // actual ~1.00
  assert.equal(close.stars, 3);
  assert.equal(close.buckets.actual, 'same');
  assert.equal(close.buckets.guess, 'same');

  const bucketOnly = play(1, ['VOO', 'VTI'], 0.75).result; // same bucket, > 0.10 off
  assert.equal(bucketOnly.stars, 2);
  assert.equal(bucketOnly.buckets.guess, 'same');

  const wrongBucket = play(1, ['VOO', 'VTI'], 0.4).result;  // "partly", and far off
  assert.equal(wrongBucket.stars, 1);
  assert.equal(wrongBucket.buckets.guess, 'partly');
  assert.equal(wrongBucket.buckets.labels.partly, 'partly the same bet');
});

test('level 2 passes on making a guess, and the stars are the accuracy', () => {
  const pool = LEVELS.guessPool.portfolios;
  const i = pool.findIndex((p) => p.id === 'p11');
  const r = round(2, { random: () => i / pool.length });
  r.toGuess();
  r.setGuess(pool[i].expectedBets + 0.7);
  const result = r.reveal();
  assert.equal(result.passed, true, 'every guess passes level 2, as registered');
  assert.equal(result.stars, 2, 'within 1 bet but not within half a bet');
});

// ------------------------------------------------------ what the reveal says

test('the reveal formats the number so it cannot contradict the pass check', () => {
  // VTI + VXUS is the near miss: 0.7997 against a 0.80 threshold. Rounded to 2
  // decimals it would read "0.80" and fail, so it is shown to 4.
  const { result } = play(1, ['VTI', 'VXUS'], 0.8);
  assert.equal(result.passed, false);
  assert.equal(result.shown.split('.')[1].length, 4, `shown as ${result.shown}`);
  assert.ok(Number(result.shown) < 0.8, 'what the screen shows still fails the check');
  assert.match(result.line, /misses the 0\.8000 needed/);
});

test('a clear pass reads as a pass, in the same words', () => {
  const { result } = play(1, ['VOO', 'VTI'], 0.95);
  assert.match(result.line, /clears the 0\.80 needed/);
});

test('level 2 has no pass line, because there is nothing to clear', () => {
  const r = round(2);
  r.toGuess();
  r.setGuess(2);
  assert.equal(r.reveal().line, null);
});

// ------------------------------------------------------- the round is over

test('the reveal freezes the round', () => {
  const r = round(3);
  for (const t of ['VOO', 'BND', 'GLD', 'XOM', 'JNJ']) r.togglePick(t);
  r.toGuess();
  r.setGuess(3);
  const first = r.reveal();
  assert.equal(r.state, REVEAL);
  assert.throws(() => r.togglePick('VOO'), /the round is over/);
  assert.throws(() => r.adjustDollars('VOO', 1), /the round is over/);
  assert.throws(() => r.setGuess(2), /the round is over/);
  assert.throws(() => r.toBuild(), /the round is over/);
  assert.equal(r.reveal(), first, 'revealing twice gives the same answer, not a fresh one');
});

test('every level in the file can be played end to end', () => {
  // A guard against a level added to levels.json that the round cannot run.
  const picks = { 1: ['VOO', 'VTI'], 3: ['VOO', 'BND', 'GLD', 'XOM', 'JNJ'] };
  for (const level of LEVELS.levels) {
    const r = round(level.id);
    for (const ticker of picks[level.id] ?? []) r.togglePick(ticker);
    r.toGuess();
    r.setGuess(level.guess.min);
    const result = r.reveal();
    assert.ok(Number.isFinite(result.value), `level ${level.id} produced no number`);
    assert.ok(result.stars >= 0 && result.stars <= 3);
  }
});

test('the disclaimer every screen has to carry is one string, shared', () => {
  assert.equal(DISCLAIMER, 'Educational, not investment advice.');
  assert.equal(LEVELS.disclaimer, DISCLAIMER);
});
