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

import { validateLevels, levelById, bucketOf, weightsFromDollars } from '../js/levels.js';
import { covariance, effectiveBets, maxRiskShare } from '../js/math.js';
import { gameWindow, windowMatrix } from '../js/gameView.js';
import {
  CRASH_LESSONS,
  LESSON_PORTFOLIOS,
  cardFor,
  checkCrashLessons,
  checkLessonPortfolios,
  frozenGameDoc,
} from '../scripts/check_why_cards.mjs';
import {
  validateCrashes, replay, fallAgainstIndex, elsewhereFor,
} from '../js/crash.js';
import { createRound } from '../js/round.js';
import {
  PLACEHOLDERS,
  crashFacts,
  fillTemplate,
  groupIndex,
  leadingRules,
  pickWhy,
  ruleCandidate,
  signedPercent,
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

// A game document at full precision, built from the frozen snapshot. The builder
// is the one scripts/check_why_cards.mjs uses, so the tests and the check cannot
// disagree about which prices they are talking about.
const GAME = frozenGameDoc(readJson('data/prices.json'));

/** Play a whole round on the frozen document, and hand back its result. */
function play(levelId, picks, guess, { random = () => 0 } = {}) {
  const round = createRound({
    levels: LEVELS, levelId, game: GAME, universe: UNIVERSE, groups: GROUPS, why: WHY,
    basket: readJson('basket.json').stocks.map((stock) => stock.ticker), random,
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
    ['bucketCard', 'crashCushion', 'crashCushionElsewhere', 'crashDrag', 'fallback', 'fewBets',
      'groupRisk', 'hiddenAi', 'hiddenAiAll', 'overRiskLimit', 'pair', 'pairLowRisk',
      'riskGapOver', 'riskGapUnder'].sort());
});

test('validateWhy rejects a template with a placeholder the code cannot fill', () => {
  const broken = structuredClone(WHY);
  // Found by key, not by position: the rules list grows, and a test that edits
  // rules[1] quietly starts testing a different rule when it does.
  const pair = broken.rules.find((r) => r.key === 'pair');
  pair.template = 'The closest pair is {a} and {b}, at {volatility}.';
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

test('the two pair rules are exact complements, so no pair falls between them', () => {
  // pairRiskAtLeast on the pair rule and pairRiskBelow on pairLowRisk have to be
  // the same number, and the correlation thresholds have to match too. If they
  // drifted apart, a pair would satisfy neither rule and a card a player should
  // have seen would vanish into the fallback.
  const pair = WHY.rules.find((r) => r.key === 'pair').when;
  const low = WHY.rules.find((r) => r.key === 'pairLowRisk').when;
  assert.equal(pair.pairRiskAtLeast, low.pairRiskBelow);
  assert.equal(pair.correlationAtLeast, low.correlationAtLeast);

  // And in practice: over every pool portfolio, a pair correlated enough fires
  // exactly one of the two rules, never both and never neither.
  const portfolios = LEVELS.guessPool.portfolios;
  let checked = 0;
  for (let i = 0; i < portfolios.length; i += 1) {
    const { result } = play(2, [], 2, { random: () => i / portfolios.length });
    const facts = result.whyFacts;
    if (facts.pair.r < pair.correlationAtLeast) continue;
    const fires = ['pair', 'pairLowRisk']
      .filter((k) => ruleCandidate(facts, WHY.rules.find((r) => r.key === k), {}).fires);
    assert.equal(fires.length, 1,
      `${result.drawnId}: pair at ${facts.pair.r.toFixed(3)} carrying `
      + `${(facts.pair.riskShare * 100).toFixed(1)}% fired ${fires.length} of the two pair rules`);
    checked += 1;
  }
  assert.equal(checked > 0, true, 'no pool portfolio had a pair correlated enough to check');
});

test('pairLowRisk runs last, or it would undo the condition on the pair rule', () => {
  // If it ran before the risk-gap rules it would simply hand back every card
  // pairRiskAtLeast took away, and the condition would have been for nothing.
  assert.equal(WHY.order[WHY.order.length - 1], 'pairLowRisk');
});

test('a tight pair carrying little risk is demoted, not dropped', () => {
  // p17 from the level 2 pool: QQQ and VTI correlate at 0.94 but are 13% of the
  // risk, while ABBV is 45% of the money and 45% of the risk - so no gap rule and
  // no group rule fires, and before pairLowRisk existed this read "nothing stands
  // out here".
  const lesson = LESSON_PORTFOLIOS.find((l) => l.key === 'tight-pair-in-a-corner');
  const { card, facts } = cardFor(GAME, GROUPS, WHY, lesson.dollars);
  assert.equal(card.key, 'pairLowRisk');
  assert.equal(facts.pair.riskShare < 0.2, true);
  assert.equal(facts.pair.r >= 0.7, true);
  assert.equal(card.text.includes('only 13% of your risk'), true);
  assert.equal(card.text.includes('Nothing stands out'), false);
  // The plain pair rule is the one that steps aside, and it is the risk
  // condition that makes it - the correlation is well over the bar.
  const plain = ruleCandidate(facts, WHY.rules.find((r) => r.key === 'pair'), {});
  assert.equal(plain.fires, false);
});

test('the demoted-pair lesson is a portfolio the game actually deals', () => {
  // Built from p17 rather than invented for the rule, so the lesson is about a
  // round a player will really be given. If the pool ever changes, this fails
  // rather than quietly describing a portfolio that no longer exists.
  const lesson = LESSON_PORTFOLIOS.find((l) => l.key === 'tight-pair-in-a-corner');
  const pooled = LEVELS.guessPool.portfolios.find((p) => p.id === lesson.poolId);
  assert.notEqual(pooled, undefined, `the pool no longer carries ${lesson.poolId}`);
  assert.deepEqual(lesson.dollars, pooled.dollars);
});

test('a 0.99 pair keeps its card: this is what the 20% threshold protects', () => {
  // VEA and VXUS are nearly the same fund. In p20 they carry 30% of the risk,
  // which clears the pair rule's 20%. A threshold set high enough to reach the
  // mostly-bond lesson portfolio at 33.9% would have turned this into the
  // fallback, and this pair is the clearest statement of what the game teaches.
  const { result } = play(2, [], 3, { random: () => 19 / 20 });
  assert.equal(result.drawnId, 'p20');
  assert.equal(result.whyFacts.pair.a, 'VEA');
  assert.equal(result.whyFacts.pair.b, 'VXUS');
  assert.equal(result.whyFacts.pair.r > 0.98, true);
  assert.equal(result.whyCard.key, 'pair');
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
  assert.equal(when('pair').pairRiskAtLeast, 0.2);
  assert.equal(when('pairLowRisk').pairRiskBelow, 0.2);
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
  assert.deepEqual(WHY.order,
    ['hiddenAiAll', 'hiddenAi', 'groupRisk', 'fewBets', 'pair', 'riskGapOver', 'riskGapUnder',
      'pairLowRisk']);
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

test('level 2 speaks to the guess, not to passing: a close guess', () => {
  // levels.json gives level 2 pass.measure "guess", so every round passes and a
  // verdict on the portfolio would say nothing. p01 makes 1.10 bets; a guess of
  // 1.5 is within the level's two-star band of 1 bet.
  assert.equal(levelById(LEVELS, 2).pass.measure, 'guess');
  const { result } = play(2, [], 1.5, { random: () => 0 });
  assert.equal(result.drawnId, 'p01');
  assert.equal(result.passed, true);
  assert.equal(result.stars >= 2, true);
  assert.equal(result.whyCard.leadIn, WHY.leadIn.closeGuess);
  assert.equal(result.whyCard.leadIn, 'Close guess. One thing to notice:');
});

test('level 2 speaks to the guess, not to passing: a guess wide of it', () => {
  // The same portfolio at 1.10 bets, guessed at 4: more than a bet out, so the
  // line reports on the guess rather than congratulating a round nobody can fail.
  const { result } = play(2, [], 4, { random: () => 0 });
  assert.equal(result.passed, true);
  assert.equal(result.stars, 1);
  assert.equal(result.whyCard.leadIn, WHY.leadIn.wideGuess);
  assert.equal(result.whyCard.leadIn, "Here's what made this one tricky:");
  // The passed line never reaches a level whose pass rule is the guess.
  assert.notEqual(result.whyCard.leadIn, WHY.leadIn.passed);
});

test('level 2 lead-in and the stars above it can never disagree', () => {
  // "Close" is read as the level's own two-star band - stars >= 2 - and not
  // recomputed from a threshold of its own, so the line and the stars it sits
  // under always tell the same story. This walks the whole slider range over
  // every pool portfolio, including the exact boundary, where the band's
  // floating-point tolerance is what decides it.
  const portfolios = LEVELS.guessPool.portfolios;
  const seen = new Set();
  for (let i = 0; i < portfolios.length; i += 1) {
    const random = () => i / portfolios.length;
    const { result: first } = play(2, [], 1, { random });
    const guesses = [1, 1.5, 2, 2.5, 3, 4, 5];
    // The boundary itself: exactly one bet above the real answer, where a bare
    // <= would reject 1.0000000000000002 and cost a star the player earned.
    const edge = first.value + 1;
    if (edge >= 1 && edge <= 5) guesses.push(edge);
    for (const guess of guesses) {
      const { result } = play(2, [], guess, { random });
      const close = result.whyCard.leadIn === WHY.leadIn.closeGuess;
      assert.equal(close, result.stars >= 2,
        `${result.drawnId} at ${result.value.toFixed(3)} bets, guessed ${guess}: `
        + `${result.stars} stars but the lead-in says ${close ? 'close' : 'wide'}`);
      seen.add(close ? 'close' : 'wide');
    }
  }
  // Both lines really do occur over that sweep, so this is not vacuous.
  assert.deepEqual([...seen].sort(), ['close', 'wide']);
});

test('level 3 reports on the portfolio, because that is what it checks', () => {
  // The two pairs of lines are not interchangeable: a level with a real pass
  // check never shows the guess lines, whatever the guess was.
  const passing = play(3, ['JNJ', 'TLT', 'GOOGL', 'LQD', 'COP'], 1).result;
  assert.equal(passing.passed, true);
  assert.equal(passing.stars, 1, 'a wild guess on a passing build scores 1 star');
  assert.equal(passing.whyCard.leadIn, WHY.leadIn.passed);
  const missing = play(3, ['NVDA', 'AMD', 'AVGO', 'MU', 'ANET'], 1).result;
  assert.equal(missing.whyCard.leadIn, WHY.leadIn.missed);
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

// --- 6. the lesson portfolios ---------------------------------------------

test('every lesson portfolio gets the card written down beside it', () => {
  // The hand-picked set in scripts/check_why_cards.mjs: each portfolio exists to
  // teach one thing, with the card a player who builds it has to be shown. The
  // script checks the same list and exits non-zero on a mismatch; this is the
  // same check inside the test suite, so CI catches it on every push.
  // The basket goes in because two of the lessons are about AI exposure held
  // through a fund, and the card for that cannot be chosen without one.
  const basket = readJson('basket.json').stocks.map((stock) => stock.ticker);
  const results = checkLessonPortfolios(GAME, GROUPS, WHY, LESSON_PORTFOLIOS, basket);
  assert.equal(results.length, LESSON_PORTFOLIOS.length);
  for (const result of results) {
    assert.equal(result.ok, true,
      `${result.lesson.key} (${result.lesson.what}) wanted the ${result.lesson.expect.key} card `
      + `and got ${result.card.key}. ${result.wrongValues.join('; ')}\n`
      + `      fired: ${result.fired.join('+') || 'none'}\n      text: ${result.card.text}`);
  }
});

test('five AI stocks are caught by the group rule and nothing else', () => {
  // The portfolio the game is named after. The closest pair inside it correlates
  // at only 0.63, under the 0.70 the pair rule asks for, so if the group rule
  // ever stops firing on a single-group portfolio this reads "nothing stands
  // out here" again - which is exactly what it used to do.
  const { card, facts } = cardFor(GAME, GROUPS, WHY,
    LESSON_PORTFOLIOS.find((l) => l.key === 'all-ai-stocks').dollars);
  assert.equal(card.key, 'groupRisk');
  assert.equal(facts.pair.r < 0.7, true, `the closest pair is ${facts.pair.r}, no longer under 0.70`);
  assert.equal(facts.groups.length, 1);
  assert.equal(card.text.includes('Nothing stands out'), false);
});

test('an index fund and a tech fund read the same way on level 1 and by the rules', () => {
  // A player meets VOO + QQQ on level 1, which takes the bucket path, so this
  // pair is checked both ways: the bucket card a player actually sees, and the
  // pair rule it answers to when a level allocates money.
  const lesson = LESSON_PORTFOLIOS.find((l) => l.key === 'index-plus-tech');
  assert.equal(lesson.onLevel, 1);
  const byRule = cardFor(GAME, GROUPS, WHY, lesson.dollars);
  assert.equal(byRule.card.key, 'pair');

  const { result } = play(1, ['VOO', 'QQQ'], 0.95);
  assert.equal(result.whyCard.key, 'same', 'on level 1 it is the "same bet" bucket card');
  // Both paths name the same number for the same pair.
  assert.equal(result.whyCard.values.r, byRule.card.values.r);
});

test('the lesson set covers more than one rule, so it is not a single case', () => {
  const keys = new Set(LESSON_PORTFOLIOS.map((l) => l.expect.key));
  assert.equal(keys.has('groupRisk'), true);
  assert.equal(keys.has('pair'), true);
  assert.equal(keys.has('pairLowRisk'), true);
  assert.equal(keys.has('riskGapOver'), true);
  // Every lesson portfolio allocates the game's full $10,000, so the percents in
  // the cards are the ones a player would be looking at. cardFor() throws if not,
  // which is what makes this assertion true rather than hopeful.
  for (const lesson of LESSON_PORTFOLIOS) {
    const total = Object.values(lesson.dollars).reduce((sum, d) => sum + d, 0);
    assert.equal(total, 10000, `${lesson.key} allocates ${total}`);
  }
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

// ------------------------------------------------- the two cards for levels 4 and 5

const BASKET = readJson('basket.json').stocks.map((stock) => stock.ticker);

/** Facts for a portfolio, with the basket behind them, as a level 4 round has. */
function factsWithBasket(dollars) {
  const { facts } = cardFor(GAME, GROUPS, WHY, dollars, { basket: BASKET });
  return facts;
}

const hiddenAiRule = WHY.rules.find((r) => r.key === 'hiddenAi');
const fewBetsRule = WHY.rules.find((r) => r.key === 'fewBets');

test('hiddenAi names the fund, and states betas rather than shares of a beta', () => {
  const facts = factsWithBasket({ QQQ: 3000, VTI: 2300, GLD: 2300, BND: 2400 });
  const candidate = ruleCandidate(facts, hiddenAiRule, {});
  assert.equal(candidate.fires, true);
  assert.equal(candidate.values.ticker, 'QQQ');
  assert.equal(candidate.values.dollarPct, '30%');
  // Two betas: how far the portfolio moves, and how much of that is QQQ's.
  assert.match(candidate.values.portfolioBeta, /^\d\.\d\d$/);
  assert.match(candidate.values.contribution, /^\d\.\d\d$/);
  assert.ok(Number(candidate.values.contribution) < Number(candidate.values.portfolioBeta));
  // No percentage of a beta appears anywhere in the card.
  assert.equal(Object.keys(candidate.values).includes('betaPct'), false);
});

test('hiddenAi stands down when the AI is held in the open', () => {
  // QQQ beside three AI stocks: the biggest contributor is a basket member, so
  // the fund is not what is carrying this, and the group card says it better.
  const facts = factsWithBasket({ QQQ: 3000, NVDA: 2400, MSFT: 2300, AVGO: 2300 });
  assert.equal(ruleCandidate(facts, hiddenAiRule, {}).fires, false);
  const biggest = facts.basket.holdings.reduce((a, b) => (b.contribution > a.contribution ? b : a));
  assert.equal(biggest.isMember, true, 'a basket member is carrying it, not the fund');
});

test('hiddenAi will not call a chipmaker a fund', () => {
  // INTC is not in basket.json and carries a beta near 1 to it, so without the
  // fundGroups condition this card would name INTC and say "inside the fund".
  const facts = factsWithBasket({ QQQ: 3000, INTC: 2400, BND: 2300, PG: 2300 });
  const biggest = facts.basket.holdings.reduce((a, b) => (b.contribution > a.contribution ? b : a));
  assert.equal(biggest.ticker, 'INTC', 'INTC really is the biggest source of AI exposure here');
  assert.equal(biggest.isMember, false, 'and it is not a basket member either');
  assert.equal(ruleCandidate(facts, hiddenAiRule, {}).fires, false, 'but it is not a fund');
});

test('hiddenAi says nothing about a portfolio with no AI exposure to explain', () => {
  // A share of a beta near zero means nothing, so the card is held off below
  // portfolioBetaAtLeast rather than dividing by something tiny.
  const facts = factsWithBasket({ BND: 4000, TLT: 2000, JNJ: 2000, PG: 2000 });
  assert.ok(facts.basket.beta < hiddenAiRule.when.portfolioBetaAtLeast);
  assert.equal(ruleCandidate(facts, hiddenAiRule, {}).fires, false);
});

test('a level that measures no beta gets no basket facts, and no fund card', () => {
  const { facts, card } = cardFor(GAME, GROUPS, WHY, { QQQ: 3000, VTI: 2300, GLD: 2300, BND: 2400 });
  assert.equal(facts.basket, null);
  assert.equal(ruleCandidate(facts, hiddenAiRule, {}).fires, false);
  assert.notEqual(card.key, 'hiddenAi');
});

test('fewBets fires on risk spread evenly over holdings that are one bet', () => {
  const facts = factsWithBasket({ GLD: 2500, VEA: 2500, VXUS: 2500, VOO: 2500 });
  const candidate = ruleCandidate(facts, fewBetsRule, {});
  assert.equal(candidate.fires, true);
  assert.equal(candidate.values.total, '4');
  assert.ok(Number(candidate.values.bets) < 2);
  assert.match(candidate.values.maxRiskPct, /^\d+%$/);
  // The two numbers the card states are the two it was tested on.
  assert.ok(facts.maxRiskShare < fewBetsRule.when.maxRiskShareBelow);
  assert.ok(facts.bets < fewBetsRule.when.betsBelow);
});

test('fewBets is held off when one holding carries the risk', () => {
  // The exact case level 5 fails on: the risk is not spread, so "the risk is
  // spread evenly" would be false, and riskGapOver has the true card.
  const facts = factsWithBasket({ BND: 2500, TLT: 2500, LQD: 2500, NVDA: 2500 });
  assert.ok(facts.maxRiskShare > fewBetsRule.when.maxRiskShareBelow);
  assert.equal(ruleCandidate(facts, fewBetsRule, {}).fires, false);
});

test('fewBets is held off on a portfolio that really does make several bets', () => {
  const facts = factsWithBasket({ VOO: 2500, BND: 2500, GLD: 2500, XOM: 2500 });
  assert.ok(facts.bets >= fewBetsRule.when.betsBelow,
    `${facts.bets} bets should be at or above the card's ${fewBetsRule.when.betsBelow}`);
  assert.equal(ruleCandidate(facts, fewBetsRule, {}).fires, false);
});

test('fewBets needs three holdings, like the group rule and for the same reason', () => {
  assert.equal(fewBetsRule.when.minHoldings, 3);
  const facts = factsWithBasket({ VOO: 5000, VTI: 5000 });
  assert.ok(facts.bets < fewBetsRule.when.betsBelow, 'two near-identical funds are one bet');
  assert.equal(ruleCandidate(facts, fewBetsRule, {}).fires, false, 'but two holdings is arithmetic');
});

test('fewBets borrows level 5’s own threshold for "the risk is spread"', () => {
  assert.equal(fewBetsRule.when.maxRiskShareBelow, levelById(LEVELS, 5).pass.threshold);
  assert.equal(fewBetsRule.when.betsBelow, 2);
});

test('the group card will not call one holding a group', () => {
  // Three bond funds and NVDA: the AI "group" is one holding carrying 82% of the
  // risk, which is a holding, not a group, and reads as "1 of your 4 holdings
  // are AI stocks". It falls through to the risk-gap card instead.
  const facts = factsWithBasket({ BND: 2500, TLT: 2500, LQD: 2500, NVDA: 2500 });
  const groupRule = WHY.rules.find((r) => r.key === 'groupRisk');
  const top = facts.groups[0];
  assert.equal(top.count, 1);
  assert.ok(top.riskShare >= groupRule.when.groupRiskAtLeast, 'it would otherwise fire');
  assert.equal(ruleCandidate(facts, groupRule, {}).fires, false);
  assert.equal(pickWhy(facts, WHY, {}).key, 'riskGapOver');
});

test('the bets and the biggest risk share in the facts are the game’s own measures', () => {
  // The same two numbers levels 3 and 5 are scored on, computed over the same
  // window and the same covariance matrix the risk shares come from.
  const dollars = { GLD: 2500, VEA: 2500, VXUS: 2500, VOO: 2500 };
  const facts = factsWithBasket(dollars);
  const { tickers, weights } = weightsFromDollars(dollars);
  const window = gameWindow(GAME, tickers, LEVELS.window.days);
  const cov = covariance(windowMatrix(window, tickers));
  assert.equal(facts.bets, effectiveBets(weights, cov));
  assert.equal(facts.maxRiskShare, maxRiskShare(weights, cov));
});

test('the two fund cards are exact complements, so no portfolio falls between them', () => {
  const all = WHY.rules.find((r) => r.key === 'hiddenAiAll');
  // The same gate on both, so the pair of them covers every portfolio with a
  // fund carrying the exposure, and neither covers one the other does.
  assert.equal(all.when.portfolioBetaAtLeast, hiddenAiRule.when.portfolioBetaAtLeast);
  assert.deepEqual(all.when.fundGroups, hiddenAiRule.when.fundGroups);

  const cases = [
    { QQQ: 3000, BND: 2400, PG: 2300, JNJ: 2300 },   // staples offset: the fund is all of it
    { QQQ: 3000, VTI: 2300, GLD: 2300, BND: 2400 },  // gold and a broad fund add some
    { QQQ: 3000, NVDA: 2400, MSFT: 2300, AVGO: 2300 },
    { QQQ: 3000, INTC: 2400, BND: 2300, PG: 2300 },
    { BND: 4000, TLT: 2000, JNJ: 2000, PG: 2000 },
  ];
  for (const dollars of cases) {
    const facts = factsWithBasket(dollars);
    const fired = [all, hiddenAiRule].filter((r) => ruleCandidate(facts, r, {}).fires);
    assert.ok(fired.length <= 1,
      `${Object.keys(dollars).join('/')} fired both fund cards: ${fired.map((r) => r.key).join('+')}`);
  }
});

test('the fund card says "all of that" when the number it would print is the whole beta', () => {
  // The case playing level 4 in a browser turned up: QQQ beside bonds and
  // staples, where what the staples take off cancels what the rest adds, so the
  // fund's part and the whole beta print as the same number.
  const facts = factsWithBasket({ QQQ: 3000, BND: 2400, PG: 2300, JNJ: 2300 });
  const card = pickWhy(facts, WHY, {});
  assert.equal(card.key, 'hiddenAiAll');
  assert.match(card.text, /all of that comes from QQQ alone/);
  // And it never prints the same number twice, which is what it is here to stop.
  assert.equal(/(\d\.\d\d).*\1/.test(card.text), false, card.text);
});

test('the fund card still names its two numbers when they really differ', () => {
  const facts = factsWithBasket({ QQQ: 3000, VTI: 2300, GLD: 2300, BND: 2400 });
  const card = pickWhy(facts, WHY, {});
  assert.equal(card.key, 'hiddenAi');
  assert.notEqual(card.values.contribution, card.values.portfolioBeta);
});

// ------------------------------- the card that leads on a missed level 5

const overRiskRule = WHY.rules.find((r) => r.key === 'overRiskLimit');
const MISSED_FIVE = { measure: 'maxRiskShare', passed: false };
const LIMIT = levelById(LEVELS, 5).pass.threshold;

test('a leading rule is in no order, so it cannot answer a round it was not written for', () => {
  assert.deepEqual(overRiskRule.leads, { measure: 'maxRiskShare', passed: false });
  assert.equal(WHY.order.includes('overRiskLimit'), false);
  assert.deepEqual(leadingRules(WHY, MISSED_FIVE), ['overRiskLimit']);
  // Every other kind of round leads nothing at all, so the order is why.json's.
  assert.deepEqual(leadingRules(WHY, { measure: 'maxRiskShare', passed: true }), []);
  assert.deepEqual(leadingRules(WHY, { measure: 'effectiveBets', passed: false }), []);
  assert.deepEqual(leadingRules(WHY, { measure: 'beta', passed: false }), []);
  assert.deepEqual(leadingRules(WHY, null), []);
});

test('the missed-level-5 card names the holding that failed, and the limit it passed', () => {
  const dollars = { VOO: 2500, BND: 2500, GLD: 2500, XOM: 2500 };
  const { card } = cardFor(GAME, GROUPS, WHY, dollars, { outcome: MISSED_FIVE, limit: LIMIT });
  assert.equal(card.key, 'overRiskLimit');
  assert.equal(card.values.ticker, 'GLD');
  assert.equal(card.values.riskPct, '38%');
  assert.equal(card.values.dollarPct, '25%');
  assert.equal(card.values.limitPct, '35%');
  assert.match(card.text, /GLD carries 38% of your risk on 25% of your money/);
});

test('the limit on the card is the level’s own, not a number why.json keeps', () => {
  // why.json holds no threshold for this rule at all: the level's pass threshold
  // is handed in, so the card and the pass check cannot quote different limits.
  assert.deepEqual(overRiskRule.when, {});
  const dollars = { VOO: 2500, BND: 2500, GLD: 2500, XOM: 2500 };
  const { card } = cardFor(GAME, GROUPS, WHY, dollars, { outcome: MISSED_FIVE, limit: 0.3 });
  assert.equal(card.values.limitPct, '30%');
  // And with no limit to state, the rule says nothing rather than inventing one.
  const facts = cardFor(GAME, GROUPS, WHY, dollars).facts;
  assert.equal(ruleCandidate(facts, overRiskRule, { limit: null }).fires, false);
});

test('the same portfolio on any other round gets the card it got before', () => {
  const dollars = { VOO: 2500, BND: 2500, GLD: 2500, XOM: 2500 };
  // No outcome at all: this is what the portfolio answered with before the card
  // existed, and it must not have moved.
  assert.equal(cardFor(GAME, GROUPS, WHY, dollars).card.key, 'riskGapUnder');
  // A level 5 round that PASSED has nothing over the limit to name.
  const passed = cardFor(GAME, GROUPS, WHY, dollars, {
    outcome: { measure: 'maxRiskShare', passed: true }, limit: LIMIT,
  });
  assert.equal(passed.card.key, 'riskGapUnder');
  // A missed round on another measure does not lead it either.
  const missedBets = cardFor(GAME, GROUPS, WHY, dollars, {
    outcome: { measure: 'effectiveBets', passed: false }, limit: 3,
  });
  assert.equal(missedBets.card.key, 'riskGapUnder');
});

test('validateWhy holds a leading rule to leading only where it says it does', () => {
  const inOrder = structuredClone(WHY);
  inOrder.order.push('overRiskLimit');
  assert.throws(() => validateWhy(inOrder), /must not also be in the order/);

  const empty = structuredClone(WHY);
  empty.rules.find((r) => r.key === 'overRiskLimit').leads = {};
  assert.throws(() => validateWhy(empty), /would lead on every round/);

  const invented = structuredClone(WHY);
  invented.rules.find((r) => r.key === 'overRiskLimit').leads = { stars: 3 };
  assert.throws(() => validateWhy(invented), /not something a round reports/);
});

test('a missed level 5 names the holding that failed it, in the card', () => {
  const { result } = play(5, ['VOO', 'BND', 'GLD', 'XOM'], 0.3);
  assert.equal(result.passed, false);
  assert.equal(result.whyCard.key, 'overRiskLimit');
  // The card names the same holding the reveal panel does, and the same limit
  // the pass check used.
  assert.equal(result.whyCard.values.ticker, result.aboutTicker);
  assert.equal(result.whyCard.values.limitPct, '35%');
  assert.match(result.whyCard.text, new RegExp(`^${result.aboutTicker} carries`));
});

test('a passed level 5 is not told a holding went over the limit', () => {
  const { result } = play(5, ['GLD', 'VEA', 'VXUS', 'VOO'], 0.3);
  assert.equal(result.passed, true);
  assert.notEqual(result.whyCard.key, 'overRiskLimit');
  assert.equal(result.whyCard.key, 'fewBets', 'it gets the card for passing with one bet');
});

test('a missed round on another level is unchanged by the level 5 card', () => {
  // Level 3 with one holding over 35% of the risk: the card for that round is
  // whatever it was before, because nothing leads on a missed bets count.
  const { result } = play(3, ['BND', 'TLT', 'LQD', 'NVDA', 'JNJ'], 2);
  assert.equal(result.passed, false);
  assert.notEqual(result.whyCard.key, 'overRiskLimit');
  const { result: four } = play(4, ['NVDA', 'AVGO', 'MU'], 0.5);
  assert.equal(four.passed, false);
  assert.notEqual(four.whyCard.key, 'overRiskLimit');
});

// ------------------------------------------------- the cards for a replay
//
// Level 6's round has no covariance matrix in it, and these rules read the
// replay instead: which holding moved the money, and what that holding did in
// the file's other windows.

const CRASHES = validateCrashes(readJson('data/crashes.json'));
const LEVEL6 = levelById(LEVELS, 6);

/** The facts a level 6 round produces for these dollars. */
function crashRoundFacts(dollars) {
  const result = replay(CRASHES, LEVEL6.window.key, dollars);
  return {
    result,
    facts: crashFacts(result, {
      elsewhere: Object.fromEntries(result.tickers.map(
        (ticker) => [ticker, elsewhereFor(CRASHES, LEVEL6.window.key, ticker)],
      )),
    }),
  };
}

/** The card a level 6 round with these dollars is shown. */
function crashCard(dollars) {
  const { result, facts } = crashRoundFacts(dollars);
  const share = fallAgainstIndex(result).share;
  return pickWhy(facts, WHY, { outcome: { measure: 'fallShare', passed: share < 0.5 } });
}

test('signedPercent puts the direction in the number, so no template has to', () => {
  // The holding that cushions a fall sometimes rose and sometimes merely fell
  // least, so "rose" and "fell" cannot be written into a template.
  assert.equal(signedPercent(0.1423), '+14%');
  assert.equal(signedPercent(-0.0246), '-2%');
  assert.equal(signedPercent(0), '0%');
  // A fall too small to round to a percent reads as 0%, not as -0%.
  assert.equal(signedPercent(-0.001), '0%');
  assert.equal(signedPercent(0.001), '0%');
  assert.throws(() => signedPercent(Number.NaN), /expected a number/);
});

test('the crash rules lead on a replayed round and are in no order at all', () => {
  for (const key of ['crashCushionElsewhere', 'crashCushion', 'crashDrag']) {
    assert.ok(!WHY.order.includes(key), `${key} must not sit in the order`);
  }
  assert.deepEqual(leadingRules(WHY, { measure: 'fallShare', passed: true }),
    ['crashCushionElsewhere', 'crashCushion']);
  assert.deepEqual(leadingRules(WHY, { measure: 'fallShare', passed: false }), ['crashDrag']);
  // And they say nothing about any other round.
  assert.deepEqual(leadingRules(WHY, { measure: 'maxRiskShare', passed: false }), ['overRiskLimit']);
  assert.deepEqual(leadingRules(WHY, { measure: 'effectiveBets', passed: true }), []);
});

test('the cushion is the holding that moved the most DOLLARS, not the most percent', () => {
  // AMZN fell 12% and BND fell 1%, but AMZN is $3,000 of the money and BND
  // $2,000: BND still lost less in dollars, so BND is what held this up. A card
  // that named the biggest percent mover would name AMZN and be wrong about why
  // the portfolio held up.
  const card = crashCard({ AMZN: 3000, VWO: 3000, BND: 2000, GLD: 2000 });
  assert.equal(card.key, 'crashCushion');
  assert.equal(card.values.ticker, 'BND');
  const { facts } = crashRoundFacts({ AMZN: 3000, VWO: 3000, BND: 2000, GLD: 2000 });
  const byTicker = Object.fromEntries(facts.crash.holdings.map((h) => [h.ticker, h]));
  assert.ok(byTicker.AMZN.change < byTicker.BND.change, 'AMZN fell the further of the two');
  assert.ok(byTicker.AMZN.gain < byTicker.BND.gain, 'and lost the more of the two in dollars');
});

test('a cushion that rose here and fell harder elsewhere carries the warning', () => {
  // The lesson portfolio. TLT rose 14% through February 2020 and fell 29%
  // against the index's 25% through 2022, and both halves are read from
  // data/crashes.json rather than written into why.json.
  const card = crashCard({ WMT: 3000, PG: 3000, TLT: 2000, BND: 2000 });
  assert.equal(card.key, 'crashCushionElsewhere');
  assert.deepEqual(card.values, {
    ticker: 'TLT',
    move: '+14%',
    indexMove: '34%',
    dollarPct: '20%',
    otherWindow: 'the 2022 bear market',
    otherMove: '-29%',
    otherIndexMove: '25%',
  });
  assert.match(card.text, /You can watch that one in Crash replay\.$/);

  // The numbers are the file's, to the percent: a card that quoted a stale
  // figure would be the one thing this rule exists to prevent.
  const bear = replay(CRASHES, 'bear2022', { TLT: 10000 });
  assert.equal(signedPercent(bear.change), card.values.otherMove);
  assert.equal(Math.round(Math.abs(bear.indexChange) * 100), 25);
  assert.ok(bear.change < bear.indexChange, 'TLT really did fall harder than the index in 2022');
});

test('the warning stands itself down when the cushion only fell least', () => {
  // Nothing rose in this build, so "it was not a cushion every time" would be
  // claiming more than the data says. The plain cushion card answers instead.
  const card = crashCard({ WMT: 2500, JNJ: 2500, AMZN: 2500, QQQ: 2500 });
  assert.equal(card.key, 'crashCushion');
  assert.equal(card.values.ticker, 'WMT');
  assert.equal(card.values.move, '-2%');
  assert.ok(!card.text.includes('not a cushion'));
});

test('a missed replay names what took the portfolio down', () => {
  const card = crashCard({ JPM: 3000, XOM: 3000, TLT: 2000, BND: 2000 });
  assert.equal(card.key, 'crashDrag');
  assert.equal(card.values.ticker, 'XOM');
  assert.equal(card.values.move, '-48%');
  assert.equal(card.values.dollarPct, '30%');
  // TLT rose in this round too, and is NOT what the card talks about: on a
  // missed round the question is what did the damage.
  assert.ok(!card.text.includes('TLT'));
});

test('the crash cards are templates filled in, like every other card', () => {
  for (const dollars of [
    { WMT: 3000, PG: 3000, TLT: 2000, BND: 2000 },
    { JPM: 3000, XOM: 3000, TLT: 2000, BND: 2000 },
    { WMT: 2500, JNJ: 2500, AMZN: 2500, QQQ: 2500 },
  ]) {
    const card = crashCard(dollars);
    assert.equal(card.text, fillTemplate(card.template, card.values),
      'the card text must be its own template with the values put in');
    const rule = WHY.rules.find((r) => r.key === card.key);
    assert.equal(card.template, rule.template, 'and the template must be why.json\'s own');
  }
});

test('a replay with no holdings to talk about gets no crash card', () => {
  // The guards, rather than a card describing a portfolio that does not exist.
  const rule = WHY.rules.find((r) => r.key === 'crashCushion');
  assert.equal(ruleCandidate({}, rule).fires, false, 'no crash facts at all');
  assert.equal(ruleCandidate({ crash: { holdings: [], indexChange: -0.34 } }, rule).fires, false);
  // An index that did not fall has no fall to hold up against.
  assert.equal(ruleCandidate({
    crash: { holdings: [{ ticker: 'VOO', gain: 1, change: 0.1, dollarShare: 1, elsewhere: [] }], indexChange: 0.02 },
  }, rule).fires, false);
});

test('the crash lesson portfolios still get the cards written down beside them', () => {
  for (const result of checkCrashLessons(CRASHES, LEVEL6, WHY)) {
    assert.ok(result.ok, `${result.lesson.key}: got ${result.card.key} ${JSON.stringify(result.card.values)}`);
  }
  assert.equal(CRASH_LESSONS.length, 3);
  // The pair that is the lesson: same shape, same cushion, opposite verdicts.
  const [cushion, drag] = CRASH_LESSONS;
  assert.equal(cushion.dollars.TLT, drag.dollars.TLT);
  assert.equal(cushion.dollars.BND, drag.dollars.BND);
  assert.notEqual(cushion.expect.key, drag.expect.key);
});
