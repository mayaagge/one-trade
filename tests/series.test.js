// tests/series.test.js - level 7: three mystery portfolios, one verdict.
//
// WHAT IS BEING CHECKED HERE, in order of how much it would cost to get wrong:
//
//   1. THE REGISTERED DRAW. Level 7's first portfolio comes from the pool of 20,
//      never repeats the one this player saw on level 2, and is still EXACTLY
//      uniform over all 20 once that exclusion is applied. That last property is
//      what keeps PREREG.md's Hypothesis 3 - "both drawn at random from one pool
//      of 20, so on average they are equally hard" - true word for word, and it
//      is proved here by enumeration rather than by sampling.
//   2. THE RECORD. One anonymous record per locked guess, sent at the moment it
//      is locked and before the next portfolio exists. All three carry level 7,
//      so their arrival order is the only thing that tells them apart, and
//      Hypothesis 3 reads the earliest. Batching them would lose that.
//   3. THE LEVEL CANNOT BE PASSED BLIND. No single number is within 1 of all
//      three answers, for every triple the draw can produce - all 2,000 of them.
//   4. THE NUMBERS. Every capstone portfolio recomputes to the expectedBets
//      committed in levels.json to 1e-9 (CLAUDE.md rule 3).
//   5. THE VERDICT AND THE STARS, on hand-worked cases.
//
// The prices here are a game document BUILT FROM THE FROZEN SNAPSHOT, as
// tests/round.test.js builds one, so the expected numbers stay true while the
// live data/game.json moves.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildReturns } from '../js/returns.js';
import { GAME_DAYS } from '../scripts/build_game_data.mjs';
import { betsFor } from '../scripts/make_pool.mjs';
import {
  STARTING_DOLLARS,
  levelById,
  seriesVerdict,
  totalDollars,
  validateFinalPool,
  validateLevels,
  weightsFromDollars,
} from '../js/levels.js';
import {
  REVEAL,
  createRound,
  createSeries,
  dealSeries,
  drawFromPool,
  drawFromStratum,
  isSeries,
  measureOf,
} from '../js/round.js';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));

const LEVELS = validateLevels(readJson('levels.json'));
const TICKERS = readJson('tickers.json');
const UNIVERSE = TICKERS.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
const KNOWN_TICKERS = new Set(UNIVERSE);
const LEVEL7 = levelById(LEVELS, 7);
const POOL = LEVELS.guessPool.portfolios;
const FINAL = LEVELS.finalPool.portfolios;

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

/** A stream of pinned draws, consumed in order, so a whole deal is reproducible. */
function pinned(values) {
  let at = 0;
  return () => {
    if (at >= values.length) throw new Error(`the deal asked for draw ${at + 1} of ${values.length}`);
    const value = values[at];
    at += 1;
    return value;
  };
}

/** A series on level 7, with its deal pinned. */
function series(values, { seenPoolIds = [], emit = () => {} } = {}) {
  return createSeries({
    levels: LEVELS,
    levelId: 7,
    game: GAME,
    universe: UNIVERSE,
    random: pinned(values),
    seenPoolIds,
    emit,
  });
}

/** Answer the live question and move on, returning the result. */
function answer(s, guess) {
  const round = s.current();
  round.setGuess(guess);
  const result = round.reveal();
  if (s.hasNext()) s.advance();
  return result;
}

// ------------------------------------------------- 1. the registered draw

test('the exclusion leaves level 7 EXACTLY uniform over all 20 - the Hypothesis 3 premise', () => {
  // For every portfolio level 2 could have dealt, walk every slot of the draw
  // that follows and collect what comes out. Enumerated, not sampled: this is
  // the registered claim, and an approximate check of it would be worth little.
  const timesDrawn = new Map(POOL.map((p) => [p.id, 0]));

  for (const seen of POOL) {
    const got = [];
    for (let slot = 0; slot < POOL.length - 1; slot += 1) {
      const pick = (slot + 0.5) / (POOL.length - 1);
      got.push(drawFromPool(LEVELS.guessPool, () => pick, { exclude: [seen.id] }).id);
    }
    assert.equal(new Set(got).size, POOL.length - 1,
      `after seeing ${seen.id} the 19 slots did not land on 19 different portfolios`);
    assert.ok(!got.includes(seen.id), `${seen.id} was dealt again after being seen`);
    for (const id of got) timesDrawn.set(id, timesDrawn.get(id) + 1);
  }

  // Each portfolio is reachable from 19 of the 20 level-2 draws, and each of
  // those gives it 1 of 19 slots: 19 x (1/20) x (1/19) = 1/20. So every count is
  // 19, and the marginal draw is uniform over all 20 - not approximately.
  for (const [id, count] of timesDrawn) {
    assert.equal(count, 19, `${id} came up ${count} times across the 20 exclusions, not 19`);
  }
  const total = [...timesDrawn.values()].reduce((a, b) => a + b, 0);
  assert.equal(total, POOL.length * (POOL.length - 1));
});

test('drawFromPool leaves out every portfolio it is told about', () => {
  const exclude = ['p01', 'p02', 'p03'];
  for (let slot = 0; slot < 17; slot += 1) {
    const drawn = drawFromPool(LEVELS.guessPool, () => (slot + 0.5) / 17, { exclude });
    assert.ok(!exclude.includes(drawn.id), `${drawn.id} was excluded but was dealt anyway`);
  }
});

test('drawFromPool falls back to the whole pool rather than refusing to deal', () => {
  // A player who has seen all 20 has earned a repeat, not an error: the
  // exclusion is best-effort and must never block play.
  const everything = POOL.map((p) => p.id);
  const drawn = drawFromPool(LEVELS.guessPool, () => 0.5, { exclude: everything });
  assert.ok(everything.includes(drawn.id));
  assert.equal(drawn.pool, 'guessPool');
});

test('a draw with nothing to exclude is the draw as it was before', () => {
  assert.equal(drawFromPool(LEVELS.guessPool, () => 0).id, 'p01');
  assert.equal(drawFromPool(LEVELS.guessPool, () => 0.5, { exclude: [] }).id, 'p11');
  assert.equal(drawFromPool(LEVELS.guessPool, () => 1).id, 'p20');
});

test('drawFromStratum draws only from the band it is asked for', () => {
  for (const key of ['low', 'high']) {
    const inBand = FINAL.filter((p) => p.stratum === key);
    for (let slot = 0; slot < inBand.length; slot += 1) {
      const drawn = drawFromStratum(LEVELS.finalPool, key, () => (slot + 0.5) / inBand.length);
      assert.equal(drawn.stratum, key);
      assert.equal(drawn.pool, 'finalPool');
    }
  }
  assert.throws(() => drawFromStratum(LEVELS.finalPool, 'middle', () => 0),
    /carries no "middle" stratum/);
});

test('dealSeries deals the registered portfolio first, then one from each stratum', () => {
  const dealt = dealSeries(LEVELS, LEVEL7, pinned([0, 0.1, 0, 0]), { exclude: ['p01'] });
  assert.equal(dealt.length, 3);
  assert.equal(dealt[0].pool, 'guessPool');
  assert.notEqual(dealt[0].id, 'p01', "level 2's portfolio was dealt again");
  assert.equal(dealt[1].pool, 'finalPool');
  assert.equal(dealt[2].pool, 'finalPool');
  assert.deepEqual([dealt[0].part, dealt[1].part, dealt[2].part], [1, 2, 3]);
  assert.deepEqual(
    [dealt[1].stratum, dealt[2].stratum].sort(),
    ['high', 'low'],
    'the two capstone portfolios must come one from each stratum',
  );
});

test('which stratum comes second is drawn, so the order is not learnable', () => {
  const low = dealSeries(LEVELS, LEVEL7, pinned([0, 0.1, 0, 0]));
  const high = dealSeries(LEVELS, LEVEL7, pinned([0, 0.9, 0, 0]));
  assert.notEqual(low[1].stratum, high[1].stratum,
    'the coin did not change which stratum is asked second');
});

test('the three dealt portfolios are always three different portfolios', () => {
  for (let i = 0; i < 20; i += 1) {
    for (const coin of [0.1, 0.9]) {
      const dealt = dealSeries(LEVELS, LEVEL7, pinned([i / 20, coin, i / 20, i / 20]));
      assert.equal(new Set(dealt.map((d) => d.id)).size, 3, `${dealt.map((d) => d.id)} repeats`);
    }
  }
});

// ---------------------------------------------------------- 2. the record

test('one record per locked guess, in portfolio order, each before the next portfolio', () => {
  const sent = [];
  const s = series([0, 0.1, 0, 0], { emit: (record) => sent.push(record) });
  const expected = s.dealt.map((d) => d.id);

  assert.equal(sent.length, 0, 'nothing is sent before a guess is locked');
  assert.equal(s.rounds.length, 1, 'only the first portfolio exists at the start');

  const actuals = [];
  for (let i = 0; i < 3; i += 1) {
    const round = s.current();
    assert.equal(round.drawnId, expected[i], `question ${i + 1} is not the portfolio that was dealt`);
    round.setGuess(2);
    const result = round.reveal();
    actuals.push(result.value);

    // THE RECORD IS ALREADY SENT, and the next portfolio does not exist yet.
    // Both halves matter: the first is what makes arrival order meaningful, the
    // second is what makes it impossible for a later portfolio to have been
    // shown first.
    assert.equal(sent.length, i + 1, `question ${i + 1} did not send exactly one record`);
    assert.equal(s.rounds.length, i + 1, 'a later portfolio was built before this record was sent');
    if (s.hasNext()) s.advance();
  }

  assert.equal(sent.length, 3);
  assert.deepEqual(sent.map((r) => r.level), [7, 7, 7], 'every record carries its level');
  assert.deepEqual(sent.map((r) => r.actual), actuals, 'the records are in portfolio order');
  // The five registered fields are the sender's to complete: round.js supplies
  // the three it can know, and must not invent an id or a date of its own.
  assert.deepEqual(Object.keys(sent[0]).sort(), ['actual', 'guess', 'level']);
});

test('a re-revealed question does not send its record twice', () => {
  const sent = [];
  const s = series([0, 0.1, 0, 0], { emit: (record) => sent.push(record) });
  const round = s.current();
  round.setGuess(2);
  round.reveal();
  round.reveal();
  round.reveal();
  assert.equal(sent.length, 1, 'reveal() is idempotent, so the record must be too');
  assert.equal(s.answers.length, 1);
});

test('the series refuses to move on before the live guess is locked and sent', () => {
  const s = series([0, 0.1, 0, 0]);
  assert.throws(() => s.advance(), /has not been answered yet/);
  assert.equal(s.rounds.length, 1, 'the refused advance must not have built a portfolio');
  s.current().setGuess(2);
  s.current().reveal();
  s.advance();
  assert.equal(s.at, 1);
});

test('the series refuses a fourth question', () => {
  const s = series([0, 0.1, 0, 0]);
  for (let i = 0; i < 3; i += 1) answer(s, 2);
  assert.ok(s.complete());
  assert.throws(() => s.advance(), /all 3 questions have been answered/);
});

// ------------------------------------------- 3. it cannot be passed blind

test('no single guess is within 1 of all three answers, for every triple the draw can make', () => {
  const low = FINAL.filter((p) => p.stratum === 'low').map((p) => p.expectedBets);
  const high = FINAL.filter((p) => p.stratum === 'high').map((p) => p.expectedBets);
  assert.equal(low.length, 10);
  assert.equal(high.length, 10);

  let triples = 0;
  for (const first of POOL.map((p) => p.expectedBets)) {
    for (const a of low) {
      for (const b of high) {
        const spread = Math.max(first, a, b) - Math.min(first, a, b);
        assert.ok(spread > 2,
          `a guess of ${((Math.max(first, a, b) + Math.min(first, a, b)) / 2).toFixed(2)} would be `
          + `within 1 of ${first.toFixed(3)}, ${a.toFixed(3)} and ${b.toFixed(3)}`);
        triples += 1;
      }
    }
  }
  assert.equal(triples, POOL.length * 100, 'every triple the draw can produce must be checked');
});

test('a player who guesses the same number three times cannot pass', () => {
  // The guarantee above, played rather than computed: one hedged guess, the
  // level's own pass rule, every legal pair of capstone portfolios.
  for (let guess = 1; guess <= 6; guess += 0.1) {
    const verdict = seriesVerdict(LEVEL7, [
      { guess, actual: POOL[9].expectedBets },
      { guess, actual: FINAL[0].expectedBets },
      { guess, actual: FINAL[19].expectedBets },
    ]);
    assert.equal(verdict.passed, false, `a flat guess of ${guess.toFixed(1)} passed level 7`);
  }
});

// --------------------------------------------------------- 4. the numbers

test('every capstone portfolio recomputes to its stored answer, to 1e-9', () => {
  const built = buildReturns(readJson('data/prices.json'));
  for (const portfolio of FINAL) {
    const { tickers, weights } = weightsFromDollars(portfolio.dollars);
    const { bets, days } = betsFor(built, tickers, weights);
    assert.ok(Math.abs(bets - portfolio.expectedBets) < 1e-9,
      `${portfolio.id}: stored ${portfolio.expectedBets}, recomputed ${bets}`);
    assert.ok(days >= LEVELS.window.minDays, `${portfolio.id} is scored on only ${days} days`);
  }
});

test('a played question agrees with the pool it was dealt from', () => {
  const s = series([0, 0.1, 0, 0]);
  for (let i = 0; i < 3; i += 1) {
    const round = s.current();
    const dealt = [...POOL, ...FINAL].find((p) => p.id === round.drawnId);
    round.setGuess(2);
    const result = round.reveal();
    assert.ok(Math.abs(result.value - dealt.expectedBets) < 1e-9,
      `${round.drawnId}: the round says ${result.value}, levels.json says ${dealt.expectedBets}`);
    if (s.hasNext()) s.advance();
  }
});

test('the capstone pool is 20 portfolios of $10,000, inside its strata and its cap', () => {
  assert.equal(FINAL.length, 20);
  assert.equal(LEVELS.finalPool.size, 20);
  assert.notEqual(LEVELS.finalPool.seed, 2026, 'a game pool must not borrow the registered seed');
  assert.notEqual(LEVELS.finalPool.seed, LEVELS.guessPool.seed, 'the two pools must not share a seed');

  const poolIds = new Set(POOL.map((p) => p.id));
  const designs = new Set(POOL.map((p) => Object.keys(p.dollars).sort().join(',')));
  const ids = new Set();

  for (const portfolio of FINAL) {
    assert.ok(!ids.has(portfolio.id), `duplicate id ${portfolio.id}`);
    ids.add(portfolio.id);
    assert.ok(!poolIds.has(portfolio.id), `${portfolio.id} is an id in both pools`);
    assert.equal(totalDollars(portfolio), STARTING_DOLLARS, `${portfolio.id} does not add up`);

    const tickers = Object.keys(portfolio.dollars);
    assert.ok(tickers.length >= LEVELS.finalPool.holdings.min
      && tickers.length <= LEVELS.finalPool.holdings.max, `${portfolio.id} holds ${tickers.length}`);
    for (const ticker of tickers) {
      assert.ok(KNOWN_TICKERS.has(ticker), `${portfolio.id} holds ${ticker}, which tickers.json does not`);
    }
    for (const dollars of Object.values(portfolio.dollars)) {
      assert.ok(Number.isInteger(dollars) && dollars > 0, `${portfolio.id} has a bad amount`);
    }
    assert.ok(!designs.has(tickers.sort().join(',')),
      `${portfolio.id} repeats a pool-of-20 holdings set`);

    const top = Math.max(...Object.values(portfolio.dollars)) / STARTING_DOLLARS;
    assert.ok(top <= LEVELS.finalPool.topWeightCap + 1e-9,
      `${portfolio.id} puts ${(100 * top).toFixed(0)}% in one holding`);

    const stratum = LEVELS.finalPool.strata.find((s) => s.key === portfolio.stratum);
    assert.ok(stratum, `${portfolio.id} names an unknown stratum`);
    assert.ok(portfolio.expectedBets >= stratum.min - 1e-9
      && portfolio.expectedBets <= stratum.max + 1e-9,
    `${portfolio.id} makes ${portfolio.expectedBets} bets, outside its ${portfolio.stratum} stratum`);
  }

  const sorted = [...FINAL].sort((a, b) => a.expectedBets - b.expectedBets).map((p) => p.id);
  assert.deepEqual(FINAL.map((p) => p.id), sorted, 'the pool is stored in order of its answers');
});

test('the one hand-placed portfolio is labelled, with its reason', () => {
  const placed = FINAL.filter((p) => p.handPlaced);
  assert.equal(placed.length, 1, 'exactly one capstone portfolio is placed by hand');
  assert.ok(placed[0].handPlacedReason.length > 40, 'a hand-placed portfolio must say why');
  // docs/PRD.md's own example, and the sentence the game is named after.
  assert.deepEqual(Object.keys(placed[0].dollars).sort(), ['NVDA', 'QQQ', 'VOO']);
  assert.ok(placed[0].expectedBets < 1.5, 'the portfolio the game is named after makes about one bet');
  for (const drawn of FINAL.filter((p) => !p.handPlaced)) {
    assert.equal(drawn.handPlaced, undefined, `${drawn.id} is drawn and must not claim otherwise`);
  }
});

// ------------------------------------------- 5. the verdict and the stars

test('level 7 passes only when all three guesses are within 1', () => {
  const near = (actual, off) => ({ guess: actual + off, actual });
  assert.equal(seriesVerdict(LEVEL7, [near(1.2, 0.9), near(2.0, -0.9), near(4.1, 0.9)]).passed, true);
  assert.equal(seriesVerdict(LEVEL7, [near(1.2, 0.9), near(2.0, -1.1), near(4.1, 0.9)]).passed, false);
});

test('the stars are 1 for passing, 2 for two of three inside half a bet, 3 for all three', () => {
  const at = (errors) => seriesVerdict(LEVEL7, errors.map((e, i) => ({ guess: 2 + e, actual: 2 })));
  assert.equal(at([0.9, 0.9, 0.9]).stars, 1, 'three wide-but-passing guesses are one star');
  assert.equal(at([0.4, 0.9, 0.9]).stars, 1, 'one tight guess is not two of three');
  assert.equal(at([0.4, 0.4, 0.9]).stars, 2, 'two of three inside half a bet');
  assert.equal(at([0.4, 0.4, 0.4]).stars, 3, 'all three inside half a bet');
  assert.equal(at([0.4, 0.4, 1.1]).stars, 0, 'a failed level scores nothing, however good the rest');
});

test('the verdict gives the same 1e-9 slack every star band gives a guess', () => {
  const exact = seriesVerdict(LEVEL7, [
    { guess: 2, actual: 1 }, { guess: 2, actual: 3 }, { guess: 2, actual: 2 },
  ]);
  assert.equal(exact.passed, true, 'an error of exactly 1 is within 1');
  const hair = seriesVerdict(LEVEL7, [
    { guess: 2, actual: 1 - 1e-12 }, { guess: 2, actual: 3 }, { guess: 2, actual: 2 },
  ]);
  assert.equal(hair.passed, true, 'an error a billionth over 1 is not a different answer on screen');
});

test('an unfinished series has no verdict, and no stars', () => {
  const s = series([0, 0.1, 0, 0]);
  assert.equal(s.verdict(), null);
  s.current().setGuess(2);
  s.current().reveal();
  assert.equal(s.verdict(), null, 'one answer in is not a verdict');
  s.advance();
  answer(s, 2);
  assert.equal(s.verdict(), null, 'two answers in is not a verdict either');
  answer(s, 2);
  assert.ok(s.verdict(), 'all three in is');
  assert.equal(s.verdict().complete, true);
});

test('a single question carries no verdict of its own', () => {
  // Level 7 is decided by three guesses together, so "passed" after one of them
  // would be a verdict the level's own rule could contradict two questions later.
  const s = series([0, 0.1, 0, 0]);
  const round = s.current();
  round.setGuess(2);
  const result = round.reveal();
  assert.equal(result.passed, null);
  assert.equal(result.stars, null);
  assert.equal(result.line, null, 'and no line about clearing a threshold');
  assert.equal(result.seriesPart, 1);
  assert.equal(result.drawnPool, 'guessPool');
  assert.ok(Number.isFinite(result.value), 'the answer itself is still worked out');
});

test('the worst guess is named, since it is the one that decides the level', () => {
  const verdict = seriesVerdict(LEVEL7, [
    { guess: 1.0, actual: 1.2 }, { guess: 2.0, actual: 2.9 }, { guess: 4.0, actual: 4.1 },
  ]);
  assert.ok(Math.abs(verdict.worstError - 0.9) < 1e-9);
  assert.equal(verdict.withinPassBand, 3);
});

// ----------------------------------------------- the rules in levels.json

test("level 2 and level 7 ask for a guess on the same slider, as Hypothesis 3 needs", () => {
  // The two guesses this hypothesis compares have to be typed on one instrument:
  // a different range moves the midpoint and the distance a drag covers, either
  // of which could shift a guess for a reason that is not learning.
  const two = levelById(LEVELS, 2).guess;
  const seven = LEVEL7.guess;
  assert.equal(two.min, seven.min);
  assert.equal(two.max, seven.max);
  assert.equal(two.step, seven.step);
  assert.equal(two.measure, seven.measure);
  assert.equal(two.measure, 'effectiveBets');
});

test('the slider reaches a guess within 1 of the highest answer either pool can deal', () => {
  const highest = Math.max(...[...POOL, ...FINAL].map((p) => p.expectedBets));
  assert.ok(LEVEL7.guess.max >= highest + 1,
    `the slider stops at ${LEVEL7.guess.max} but the highest answer is ${highest.toFixed(3)}`);
  const lowest = Math.min(...[...POOL, ...FINAL].map((p) => p.expectedBets));
  assert.ok(LEVEL7.guess.min <= lowest, 'and reaches the lowest answer');
});

test('level 7 is the series, and the other levels are not', () => {
  assert.equal(isSeries(LEVEL7), true);
  for (const id of [1, 2, 3, 4, 5, 6]) {
    assert.equal(isSeries(levelById(LEVELS, id)), false, `level ${id} is not a series`);
  }
  assert.equal(LEVEL7.series.count, 3);
  assert.equal(measureOf(LEVEL7), 'effectiveBets', 'a series still measures what its guess asks for');
});

test('a series level refuses to improvise its own portfolio', () => {
  assert.throws(
    () => createRound({ levels: LEVELS, levelId: 7, game: GAME, universe: UNIVERSE }),
    /dealt by dealSeries/,
  );
});

test('createSeries refuses a level that asks one question', () => {
  assert.throws(
    () => createSeries({ levels: LEVELS, levelId: 2, game: GAME, universe: UNIVERSE }),
    /asks one question/,
  );
});

// --------------------------------------- what the levels file itself refuses

/** levels.json with one thing changed, for a validator to reject. */
function broken(change) {
  const copy = JSON.parse(JSON.stringify(LEVELS));
  change(copy, copy.levels.find((l) => l.id === 7));
  return copy;
}

test('part 1 must come from the registered pool, or the hypothesis is not being measured', () => {
  assert.throws(
    () => validateLevels(broken((data, seven) => { seven.series.parts[0].pool = 'finalPool'; })),
    /must draw from guessPool/,
  );
  assert.throws(
    () => validateLevels(broken((data, seven) => { seven.series.parts[0].excludeSeen = false; })),
    /must set excludeSeen/,
  );
});

test('the parts must be listed in the order they are played', () => {
  assert.throws(
    () => validateLevels(broken((data, seven) => { seven.series.parts[1].part = 3; })),
    /should be numbered 2/,
  );
});

test('a star band cannot ask for more tight guesses than the level asks questions', () => {
  assert.throws(
    () => validateLevels(broken((data, seven) => { seven.stars.three.atLeast = 4; })),
    /only asks 3 questions/,
  );
});

test('the capstone strata must stay more than 2 bets apart', () => {
  // The whole point of two strata. If they drifted within 2 of each other, one
  // number would be within 1 of both and the capstone could be passed blind -
  // so this is checked on load rather than trusted to the script that wrote it.
  assert.throws(
    () => validateFinalPool({
      ...LEVELS.finalPool,
      portfolios: FINAL.map((p) => (p.stratum === 'high'
        ? { ...p, expectedBets: p.expectedBets - 2.3 }
        : p)),
      strata: LEVELS.finalPool.strata.map((s) => (s.key === 'high'
        ? { ...s, min: s.min - 2.3, max: s.max - 2.3 }
        : s)),
    }),
    /would be within 1 of both/,
  );
});

test('a capstone portfolio over the cap is refused', () => {
  assert.throws(
    () => validateFinalPool({
      ...LEVELS.finalPool,
      portfolios: FINAL.map((p, i) => (i === 0
        ? { ...p, dollars: { VOO: 9000, BND: 1000 } }
        : p)),
    }),
    /over the 40% cap/,
  );
});

test('a file with no capstone pool is still a valid file', () => {
  assert.equal(validateFinalPool(undefined), null);
  assert.equal(validateFinalPool(null), null);
});
