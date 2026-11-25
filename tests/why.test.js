// tests/why.test.js - the "Why?" cards: the rules that pick one, and the
// templates that word it.
//
// WHAT IS BEING CHECKED HERE, in order of how much it would cost to get wrong:
//
//   1. THE NUMBERS THE CARD NAMES. The correlation of the closest pair, every
//      holding's share of risk, and the gap between risk share and dollar share
//      match tests/fixtures/known_answers.json - numpy, through
//      tests/make_fixtures.py - to 1e-9 (CLAUDE.md rule 3). The card states
//      these numbers to a player, so they are held to the same bar as the
//      measures themselves.
//   2. NO GENERATED PROSE. Every sentence a player can read is a template in
//      why.json with named placeholders filled in. The test for this is
//      mechanical: the text that comes out must equal the template that went in
//      with its placeholders substituted, and nothing else.
//   3. WHICH CARD IS CHOSEN. Each rule fires on a case built for it, the order
//      in why.json settles the cases where more than one fires, and the fallback
//      covers the case where none do.
//   4. LEVEL 1 IS DIFFERENT. It asks for two holdings and no money split, so it
//      gets a correlation card keyed by the "Same bet?" bucket, and never a
//      risk-share card that would describe a split the player never chose. All
//      three buckets are covered.
//
// The prices here are a game document BUILT FROM THE FROZEN SNAPSHOT, as in
// tests/round.test.js: data/game.json is rebuilt every weekday evening and would
// make every assertion a moving target.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildReturns } from '../js/returns.js';
import { GAME_DAYS } from '../scripts/build_game_data.mjs';
import { validateLevels, levelById, bucketOf } from '../js/levels.js';
import { createRound } from '../js/round.js';
import {
  PLACEHOLDERS,
  fillTemplate,
  groupIndex,
  pickWhy,
  ruleCandidate,
  validateWhy,
  whyFacts,
} from '../js/why.js';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));

const WHY = validateWhy(readJson('why.json'));
const LEVELS = validateLevels(readJson('levels.json'));
const TICKERS = readJson('tickers.json');
const UNIVERSE = TICKERS.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
const GROUPS = groupIndex(TICKERS);

const fixtures = readJson('tests/fixtures/known_answers.json');
const REL = fixtures.tolerance.relative;     // 1e-9
const ABS = fixtures.tolerance.absolute;     // 1e-12
const caseNamed = (name) => fixtures.cases.find((c) => c.name === name);

function assertClose(actual, expected, what) {
  assert.equal(Number.isFinite(actual), true, `${what}: expected a finite number, got ${actual}`);
  const diff = Math.abs(actual - expected);
  const scale = Math.max(Math.abs(expected), Math.abs(actual));
  const ok = scale < 1 ? diff <= Math.max(ABS, scale * REL) : diff / scale <= REL;
  assert.equal(ok, true, `${what}: expected ${expected}, got ${actual} (difference ${diff})`);
}

/** The facts for one fixture case, whose holdings are named A0, A1, ... */
function factsFor(name, { groups = null } = {}) {
  const c = caseNamed(name);
  const tickers = c.weights.map((_, i) => `A${i}`);
  return {
    case: c,
    facts: whyFacts({ tickers, weights: c.weights, matrix: c.returns, groups }),
  };
}

// A game document at full precision, built from the frozen snapshot.
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

/** Play a whole round on the frozen document, and hand back its result. */
function play(levelId, picks, guess, { random = () => 0 } = {}) {
  const round = createRound({
    levels: LEVELS, levelId, game: GAME, universe: UNIVERSE, groups: GROUPS, why: WHY, random,
  });
  for (const ticker of picks) round.togglePick(ticker);
  round.toGuess();
  round.setGuess(guess);
  return { round, result: round.reveal() };
}

// --- 1. the numbers the card names, against numpy -------------------------

test('the closest pair and its correlation match numpy to 1e-9', () => {
  // three_with_near_duplicate: holdings 0 and 2 nearly duplicate each other, so
  // they are the closest pair, and numpy puts their correlation at 0.98507...
  const { case: c, facts } = factsFor('three_with_near_duplicate');
  assert.equal(facts.pair.a, 'A0');
  assert.equal(facts.pair.b, 'A2');
  assertClose(facts.pair.r, c.expected.correlation[0][2], 'closest pair correlation');
  // It is the largest off-diagonal entry, not just a large one.
  const offDiagonal = [c.expected.correlation[0][1], c.expected.correlation[0][2], c.expected.correlation[1][2]];
  assertClose(facts.pair.r, Math.max(...offDiagonal), 'the largest off-diagonal correlation');
});

test('every holding share of risk matches numpy to 1e-9', () => {
  for (const name of ['three_with_near_duplicate', 'five_mixed', 'pair_correlated_unequal_vol']) {
    const { case: c, facts } = factsFor(name);
    c.expected.risk_shares.forEach((expected, i) => {
      assertClose(facts.holdings[i].riskShare, expected, `${name} risk share ${i}`);
    });
  }
});

test('the gap between risk share and dollar share matches numpy to 1e-9', () => {
  const { case: c, facts } = factsFor('five_mixed');
  c.weights.forEach((weight, i) => {
    assertClose(facts.holdings[i].dollarShare, weight, `five_mixed dollar share ${i}`);
    assertClose(facts.holdings[i].gap, c.expected.risk_shares[i] - weight, `five_mixed gap ${i}`);
  });
  // The shares sum to 1, so the gaps sum to 0: a point of risk one holding gains
  // is a point another loses.
  const sum = facts.holdings.reduce((total, holding) => total + holding.gap, 0);
  assertClose(sum + 1, 1, 'the gaps sum to zero');
});

// --- 2. no generated prose -------------------------------------------------

test('every template in why.json uses only placeholders the code can fill', () => {
  // validateWhy already throws on an unknown placeholder; this states the list
  // the files agree on, so a new placeholder cannot be added to why.json alone.
  assert.deepEqual(Object.keys(PLACEHOLDERS).sort(),
    ['bucketCard', 'fallback', 'groupRisk', 'pair', 'riskGapOver', 'riskGapUnder'].sort());
});

test('validateWhy rejects a template with a placeholder the code cannot fill', () => {
  const broken = structuredClone(WHY);
  broken.rules[1].template = 'The closest pair is {a} and {b}, at {volatility}.';
  assert.throws(() => validateWhy(broken), /volatility/);
});

test('fillTemplate refuses a missing value rather than printing a placeholder', () => {
  assert.throws(() => fillTemplate('{a} and {b}', { a: 'VOO' }), /\{b\}/);
  assert.throws(() => fillTemplate('{a}', { a: 'VOO', b: 'VTI' }), /\bb\b/);
  assert.equal(fillTemplate('{a} and {b}', { a: 'VOO', b: 'VTI' }), 'VOO and VTI');
});

test('a card text is always its own template with the values put in', () => {
  // The mechanical version of "no generated prose": nothing is concatenated,
  // reworded or appended anywhere in the pipeline.
  const portfolios = LEVELS.guessPool.portfolios;
  for (let i = 0; i < portfolios.length; i += 1) {
    const portfolio = portfolios[i];
    const { result } = play(2, [], 2, { random: () => i / portfolios.length });
    assert.equal(result.drawnId, portfolio.id);
    const card = result.whyCard;
    assert.equal(card.text, fillTemplate(card.template, card.values),
      `${portfolio.id}: the card text is not its template filled in`);
    assert.equal(/\{[a-zA-Z]+\}/.test(card.text), false, `${portfolio.id}: a placeholder survived`);
    assert.equal(card.text.length > 0, true, `${portfolio.id}: an empty card`);
  }
});

// --- 3. which card is chosen -----------------------------------------------

test('the pair rule fires on a near-duplicate pair and names it', () => {
  const { facts } = factsFor('three_with_near_duplicate');
  const rule = WHY.rules.find((r) => r.key === 'pair');
  const candidate = ruleCandidate(facts, rule, {});
  assert.equal(candidate.fires, true);
  assert.equal(candidate.values.a, 'A0');
  assert.equal(candidate.values.b, 'A2');
  assert.equal(candidate.values.r, '0.99');
});

test('the pair rule does not fire when nothing is correlated', () => {
  const { facts } = factsFor('five_mixed');
  const rule = WHY.rules.find((r) => r.key === 'pair');
  assert.equal(ruleCandidate(facts, rule, {}).fires, false);
});

test('the over-gap rule names the holding whose risk outruns its money', () => {
  // pair_correlated_unequal_vol, from numpy: holding 1 is 70% of the money and
  // 90.03% of the risk, a gap of 20.0 points, and it is twice as volatile as the
  // holding beside it. That is the PRD's fifth learning goal in one sentence.
  const { facts } = factsFor('pair_correlated_unequal_vol');
  const over = ruleCandidate(facts, WHY.rules.find((r) => r.key === 'riskGapOver'), {});
  assert.equal(over.fires, true);
  assert.deepEqual(over.values, { ticker: 'A1', dollarPct: '70%', riskPct: '90%' });
});

test('the under-gap rule reaches a gap the over-gap rule is set not to', () => {
  // The two thresholds differ on purpose - 20 points over, 15 under - because
  // the shares sum to 1, so the gaps sum to 0: a holding far under its dollar
  // share puts other holdings over, and riskGapOver takes them first. Held to
  // the same 20, the under card never appeared at all in 420 test portfolios.
  //
  // five_mixed is that case exactly. From numpy: holding 0 is 35% of the money
  // and 19.37% of the risk, 15.6 points under, while the largest gap the other
  // way is holding 2's 15.1 points - under the 20 the over rule asks for.
  const { facts } = factsFor('five_mixed');
  const over = ruleCandidate(facts, WHY.rules.find((r) => r.key === 'riskGapOver'), {});
  assert.equal(over.fires, false);
  assert.deepEqual(over.values, { ticker: 'A2', dollarPct: '20%', riskPct: '35%' });

  const under = ruleCandidate(facts, WHY.rules.find((r) => r.key === 'riskGapUnder'), {});
  assert.equal(under.fires, true);
  assert.deepEqual(under.values, { ticker: 'A0', dollarPct: '35%', riskPct: '19%' });
});

test('the thresholds in why.json are the ones the real-data check settled on', () => {
  // The numbers themselves, so a change to them has to be deliberate and shows
  // up in a diff next to the table in BUILD_LOG.md that justified them.
  const when = (key) => WHY.rules.find((r) => r.key === key).when;
  assert.equal(when('groupRisk').groupRiskAtLeast, 0.7);
  assert.equal(when('pair').correlationAtLeast, 0.7);
  assert.equal(when('riskGapOver').gapAtLeast, 0.2);
  assert.equal(when('riskGapUnder').gapAtLeast, 0.15);
  // The pair threshold is the same 0.70 that levels.json's "same bet" bucket
  // uses, so one number means one thing across the whole game.
  const sameBucket = levelById(LEVELS, 1).buckets.find((b) => b.key === 'same');
  assert.equal(when('pair').correlationAtLeast, sameBucket.min);
});

test('a gap under the threshold does not fire either risk-gap rule', () => {
  // three_with_near_duplicate's largest gap is holding 1 at -14.3 points, which
  // is under the 15 the rule asks for.
  const { facts } = factsFor('three_with_near_duplicate');
  for (const key of ['riskGapOver', 'riskGapUnder']) {
    const candidate = ruleCandidate(facts, WHY.rules.find((r) => r.key === key), {});
    assert.equal(candidate.fires, false, `${key} should not fire on a 14.3-point gap`);
  }
});

test('the group rule needs three holdings before it will fire', () => {
  const groups = new Map([['A0', { key: 'g1', label: 'Group one' }], ['A1', { key: 'g1', label: 'Group one' }]]);
  const { facts } = factsFor('two_identical_assets', { groups });
  const rule = WHY.rules.find((r) => r.key === 'groupRisk');
  // Two holdings in one group hold 100% of their own risk, which is arithmetic,
  // not a lesson.
  assert.equal(ruleCandidate(facts, rule, {}).fires, false);
});

test('a portfolio that is ALL one group gets the group card, not the fallback', () => {
  // Five AI stocks make about one bet, which is the lesson the whole game is
  // named after. An earlier draft required two groups before this card could
  // fire, so this portfolio - the most concentrated one a player can build -
  // read "nothing stands out here". A browser check caught it.
  const { result } = play(3, ['NVDA', 'AMD', 'AVGO', 'MU', 'ANET'], 2);
  assert.equal(result.value < 1.5, true, `five AI stocks should be near one bet, not ${result.value}`);
  assert.equal(result.passed, false);
  assert.equal(result.whyCard.key, 'groupRisk');
  assert.deepEqual(result.whyCard.values, {
    group: 'AI stocks', count: '5', total: '5', dollarPct: '100%', riskPct: '100%',
  });
  // The one thing the card must not say about this portfolio.
  assert.equal(result.whyCard.text.includes('Nothing stands out'), false);
  // And the sentence has to read at 100%, not just at 71%.
  assert.equal(result.whyCard.text.includes('most of the work'), false);
});

test('the group rule fires when one group holds most of the risk', () => {
  // QQQ and VOO are Core US funds and hold 90% of p01's money; VEA is the
  // international fund holding the other 10%.
  const { result } = play(2, [], 2, { random: () => 0 });
  assert.equal(result.drawnId, 'p01');
  assert.equal(result.whyCard.key, 'groupRisk');
  assert.equal(result.whyCard.values.group, 'Core US funds');
  assert.equal(result.whyCard.values.count, '2');
  assert.equal(result.whyCard.values.total, '3');
});

test('the order in why.json settles a portfolio where several rules fire', () => {
  const rule = WHY.order;
  assert.deepEqual(rule, ['groupRisk', 'pair', 'riskGapOver', 'riskGapUnder']);
  // p01 fires the group rule and the pair rule (QQQ and VOO correlate at 0.95);
  // the group card is the one shown.
  const { result } = play(2, [], 2, { random: () => 0 });
  const facts = result.whyFacts;
  assert.equal(ruleCandidate(facts, WHY.rules.find((r) => r.key === 'pair'), {}).fires, true);
  assert.equal(result.whyCard.key, 'groupRisk');
});

test('the fallback covers a portfolio where nothing stands out', () => {
  // two independent, equally volatile holdings held 50/50: no correlation, no
  // gap, and no group information.
  const { facts } = factsFor('two_independent_equal_vol');
  const card = pickWhy(facts, WHY, {});
  assert.equal(card.key, 'fallback');
  assert.deepEqual(card.values, {});
  assert.equal(card.text, WHY.fallback.template);
});

// --- 4. level 1: one card per "Same bet?" bucket ---------------------------

test('why.json carries a card for every bucket levels.json defines', () => {
  const buckets = levelById(LEVELS, 1).buckets.map((b) => b.key);
  assert.deepEqual(buckets.slice().sort(), Object.keys(WHY.bucketCards).sort());
});

test('level 1 gets the card for the bucket its pair landed in', () => {
  const cases = [
    { picks: ['VOO', 'VTI'], bucket: 'same', r: 0.9961858954977388 },
    { picks: ['VTI', 'JPM'], bucket: 'partly', r: 0.5934556678676923 },
    { picks: ['TLT', 'XOM'], bucket: 'different', r: -0.11804226206177405 },
  ];
  for (const { picks, bucket, r } of cases) {
    const { result } = play(1, picks, 0.5);
    assertClose(result.value, r, `${picks.join('+')} correlation`);
    assert.equal(bucketOf(levelById(LEVELS, 1), result.value), bucket);
    assert.equal(result.whyCard.key, bucket, `${picks.join('+')} should get the ${bucket} card`);
    assert.equal(result.whyCard.values.a, picks[0]);
    assert.equal(result.whyCard.values.b, picks[1]);
    assert.equal(result.whyCard.text, fillTemplate(WHY.bucketCards[bucket].template, result.whyCard.values));
  }
});

test('level 1 never gets a risk-share card', () => {
  // The money is not split on level 1, so a card about the split would describe
  // a choice the player never made.
  const keys = new Set();
  for (const a of ['VOO', 'BND', 'NVDA', 'GLD']) {
    for (const b of ['VTI', 'TLT', 'JPM', 'XOM']) {
      if (a === b) continue;
      keys.add(play(1, [a, b], 0.5).result.whyCard.key);
    }
  }
  for (const key of keys) {
    assert.equal(['same', 'partly', 'different'].includes(key), true, `level 1 showed a ${key} card`);
  }
});

test('the card and the reveal panel show a near-miss correlation the same way', () => {
  // VTI and VXUS correlate just under level 1's 0.80 threshold over this window.
  // The panel shows 4 decimals so it cannot read as a pass; the card has to show
  // the same string, or the screen contradicts itself about whether the level
  // was passed. The number itself is not hard-coded here: it is a hair under 0.8
  // on the frozen snapshot and a hair under on the live file too, but not the
  // same hair, and what is being checked is that the two agree.
  const { result } = play(1, ['VTI', 'VXUS'], 0.8);
  assert.equal(result.passed, false);
  assert.equal(result.value > 0.79 && result.value < 0.8, true,
    `VTI and VXUS should be a near miss, not ${result.value}`);
  assert.match(result.shown, /^0\.\d{4}$/, 'the panel should show 4 decimals near the threshold');
  assert.equal(result.whyCard.values.r, result.shown);
  assert.equal(result.whyCard.text.includes(result.shown), true);
});

// --- 5. the lead-in -------------------------------------------------------

test('a level 3 build that passes gets the passed lead-in', () => {
  // JNJ, TLT, GOOGL, LQD and COP make 3.55 bets on the frozen snapshot, which
  // clears the 3 the level asks for.
  const { result } = play(3, ['JNJ', 'TLT', 'GOOGL', 'LQD', 'COP'], 3.5);
  assert.equal(result.passed, true);
  assert.equal(result.whyCard.leadIn, WHY.leadIn.passed);
  assert.equal(result.whyCard.leadIn, 'You passed. One thing to notice:');
});

test('a level 3 build that misses gets the missed lead-in', () => {
  // Five AI stocks are nearly one bet, which is the lesson the game is named
  // after and nowhere near the 3 the level asks for.
  const { result } = play(3, ['NVDA', 'AMD', 'AVGO', 'MU', 'ANET'], 2);
  assert.equal(result.passed, false);
  assert.equal(result.whyCard.leadIn, WHY.leadIn.missed);
  assert.equal(result.whyCard.leadIn, "Here's what held you back:");
});

test('level 2 always gets the passed lead-in, because its pass rule is the guess', () => {
  // levels.json gives level 2 pass.measure "guess", so every level 2 round
  // passes by design and the missed line cannot appear there. The stars panel
  // already words it the same way: "1 star for make a guess".
  assert.equal(levelById(LEVELS, 2).pass.measure, 'guess');
  const portfolios = LEVELS.guessPool.portfolios;
  for (let i = 0; i < portfolios.length; i += 1) {
    const { result } = play(2, [], 2, { random: () => i / portfolios.length });
    assert.equal(result.passed, true, `${result.drawnId} should pass`);
    assert.equal(result.whyCard.leadIn, WHY.leadIn.passed, `${result.drawnId} lead-in`);
  }
});

test('level 1 takes no lead-in at all', () => {
  // Its reveal panel says whether the pair cleared 0.80 and the bucket line says
  // which bucket the guess named, so a third verdict line is the same news again.
  for (const picks of [['VOO', 'VTI'], ['VTI', 'JPM'], ['TLT', 'XOM'], ['VTI', 'VXUS']]) {
    assert.equal(play(1, picks, 0.5).result.whyCard.leadIn, null, picks.join('+'));
  }
});

test('the lead-in is a line beside the card, never joined into it', () => {
  // The card here is the group card; what is being checked is the two strings.
  // Two templates on screen, still no generated prose: the card text has to
  // remain its own template filled in, with the lead-in nowhere inside it.
  const { result } = play(3, ['NVDA', 'AMD', 'AVGO', 'MU', 'ANET'], 2);
  const card = result.whyCard;
  assert.equal(card.text, fillTemplate(card.template, card.values));
  assert.equal(card.text.includes(card.leadIn), false);
  assert.equal(card.template.includes(card.leadIn), false);
});

test('validateWhy rejects a lead-in that tries to carry a placeholder', () => {
  const broken = structuredClone(WHY);
  broken.leadIn.missed = 'Here is what held you back, {ticker}:';
  assert.throws(() => validateWhy(broken), /leadIn\.missed/);
  const gone = structuredClone(WHY);
  delete gone.leadIn.passed;
  assert.throws(() => validateWhy(gone), /leadIn\.passed/);
});

// --- every level, every pool portfolio ------------------------------------

test('every pool portfolio and a level 3 build get a card that reads', () => {
  const seen = new Map();
  for (let i = 0; i < LEVELS.guessPool.portfolios.length; i += 1) {
    const random = () => i / LEVELS.guessPool.portfolios.length;
    const { result } = play(2, [], 2, { random });
    assert.equal(/\{[a-zA-Z]+\}/.test(result.whyCard.text), false, `${result.drawnId}: a placeholder survived`);
    seen.set(result.whyCard.key, (seen.get(result.whyCard.key) ?? 0) + 1);
  }
  assert.equal(seen.size > 0, true);

  const { result } = play(3, ['JNJ', 'TLT', 'GOOGL', 'LQD', 'COP'], 3.5);
  assert.equal(result.whyCard.text.length > 0, true);
  assert.equal(/\{[a-zA-Z]+\}/.test(result.whyCard.text), false);
});
