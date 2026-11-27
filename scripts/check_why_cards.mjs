// scripts/check_why_cards.mjs - which "Why?" card does a portfolio get?
//
//   node scripts/check_why_cards.mjs
//
// Two jobs, and the second one is the check:
//
//   1. THE FREQUENCY TABLE. How often each rule in why.json fires, and how often
//      it is the card actually shown, over all 20 pool portfolios and a seeded
//      sample of 5-holding level 3 builds. This is the table that set the
//      thresholds in why.json; BUILD_LOG.md records the numbers it produced and
//      the reasoning. Running this is how you reproduce them.
//   2. THE LESSON PORTFOLIOS. A fixed, hand-picked set of portfolios that each
//      exist to teach one thing, with the card each one must get written down
//      beside it. The script exits non-zero if any of them gets a different
//      card, so a threshold moved by a future session cannot quietly break the
//      case the game is named after.
//
// WHY THE LESSON SET EXISTS AT ALL. The frequency table is a random sample, and
// a random sample missed the worst bug this feature had: five AI stocks read
// "nothing stands out here", and not one of 400 random 5-holding draws had taken
// all five from a single group, so the table looked identical before and after
// the fix. A player picking five AI stocks on purpose is not a random draw - it
// is the point of level 3 - so the portfolios that carry the lesson are named
// here rather than hoped for.
//
// THE PRICES ARE THE FROZEN SNAPSHOT, not data/game.json, so the table and the
// expected cards do not move when the market does. The game itself plays on
// data/game.json; this is a check on the rules, not on today's prices.
//
// Educational, not investment advice.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildReturns } from '../js/returns.js';
import { makeRng } from '../js/rng.js';
import { validateLevels, weightsFromDollars } from '../js/levels.js';
import { gameWindow, windowMatrix } from '../js/gameView.js';
import {
  crashFacts, groupIndex, leadingRules, pickWhy, ruleCandidate, validateWhy, whyFacts,
} from '../js/why.js';
import { equalWeightBasket } from '../js/math.js';
import {
  validateCrashes, replay, fallAgainstIndex, elsewhereFor,
} from '../js/crash.js';
import { passes, levelById } from '../js/levels.js';
import { GAME_DAYS } from './build_game_data.mjs';
import { WINDOW_DAYS, MIN_DAYS, TOTAL_DOLLARS } from './make_pool.mjs';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));

/** A game seed, deliberately not the registered seed 2026. */
export const CHECK_SEED = 23;

/** How many random 5-holding level 3 builds the table is taken over. */
export const SAMPLES = 400;

/**
 * The hand-picked lesson portfolios, each with the card it must get.
 *
 * These are not a sample of anything. Each one is the plainest statement of one
 * thing the game teaches, and the card beside it is the card a player who builds
 * it has to be shown. A mismatch is a bug in the rules, not a surprising result.
 *
 * `dollars` sums to the game's $10,000 in every case, so the weights are the
 * ones a player would actually be looking at.
 */
export const LESSON_PORTFOLIOS = [
  {
    key: 'all-ai-stocks',
    what: 'Five AI stocks',
    lesson: 'Different tickers, the same bet. This is the portfolio the game is named after.',
    dollars: { NVDA: 2000, AMD: 2000, AVGO: 2000, MU: 2000, ANET: 2000 },
    expect: { key: 'groupRisk', values: { group: 'AI stocks', count: '5', total: '5' } },
    // The pair rule cannot catch this one: the closest pair among the five is
    // AVGO and ANET at 0.63, under the 0.70 the rule asks for. Only the group
    // rule sees it, which is why the minGroups guard mattered so much.
    note: 'The closest pair inside it is only 0.63, so the group rule is the only one that catches it',
  },
  {
    key: 'all-bond-funds',
    what: 'Three bond funds',
    lesson: 'Safe holdings are still one bet when they are all the same kind of safe.',
    dollars: { BND: 3400, TLT: 3300, LQD: 3300 },
    expect: { key: 'groupRisk', values: { group: 'Bonds and gold', count: '3', total: '3' } },
    note: 'Fires the pair rule too - BND and LQD correlate at 0.95 - and the group card wins by order',
  },
  {
    key: 'index-plus-tech',
    what: 'An index fund and a tech fund',
    lesson: 'Two funds, hundreds of names, and one bet. The PRD\'s opening example.',
    dollars: { VOO: 5000, QQQ: 5000 },
    expect: { key: 'pair', values: { a: 'VOO', b: 'QQQ', r: '0.95' } },
    // A player meets this one on level 1, which takes the bucket path, so
    // tests/why.test.js checks it both ways: the pair rule here, and the "same
    // bet" bucket card as a level 1 round.
    onLevel: 1,
    note: 'Two holdings, so the group rule is held off by minHoldings and the pair rule answers',
  },
  {
    key: 'small-volatile-in-bonds',
    what: 'A mostly-bond portfolio with one small volatile holding',
    lesson: 'A holding\'s share of risk is not its share of the money. The PRD\'s fifth learning goal.',
    dollars: { BND: 9000, NVDA: 1000 },
    expect: { key: 'riskGapOver', values: { ticker: 'NVDA', dollarPct: '10%', riskPct: '58%' } },
    note: '10% of the money and 58% of the risk, which is the whole lesson in one line',
  },
  {
    key: 'small-volatile-among-bond-funds',
    what: 'The same lesson, buried: three bond funds and one small volatile holding',
    lesson: 'The order in why.json genuinely decides the card, and here it decides against the gap.',
    dollars: { BND: 4000, TLT: 2500, LQD: 2500, NVDA: 1000 },
    // NVDA is 10% of the money and 38% of the risk here, so riskGapOver fires -
    // but BND and LQD correlate at 0.95, and the pair rule comes first. Both
    // cards are true; the pair is the one shown. Kept in the set deliberately,
    // as the case that shows the order is not a formality.
    expect: { key: 'pair', values: { a: 'BND', b: 'LQD' } },
    note: 'riskGapOver fires on NVDA at 10%/38% and loses to the pair rule by order',
    // The pair here carries 33.9% of the risk, which clears the pair rule's own
    // 20% condition comfortably, so this one keeps the pair card by decision
    // rather than by accident. Separating it from the VEA/VXUS case below is not
    // possible on pair risk share: the case worth keeping carries LESS (30%)
    // than this one does. Raising the threshold to reach this portfolio costs 49
    // of the check's 76 pair cards. BUILD_LOG.md has the table.
    decided: 'Keeps the pair card. No threshold separates it from a 0.99 pair worth naming',
  },
  {
    key: 'hidden-ai-in-a-fund',
    what: 'Level 4 passed: QQQ at its 30% floor, with a broad fund, gold and bonds',
    lesson: 'The AI exposure a player cannot see on their own screen: it is inside the fund.',
    // The allocation js/round.js deals a level 4 round, so this is the portfolio
    // a player is looking at when the round starts, not one built for the rule.
    dollars: { QQQ: 3000, VTI: 2300, GLD: 2300, BND: 2400 },
    needsBasket: true,
    expect: { key: 'hiddenAi', values: { ticker: 'QQQ', dollarPct: '30%' } },
    note: 'Beta 0.29, and QQQ alone brings 0.17 of it while being 30% of the money',
  },
  {
    key: 'hidden-ai-all-of-it',
    what: 'Level 4 passed the ordinary way: QQQ at its floor, with bonds and two staples',
    lesson: 'Every bit of the AI exposure came through the fund. The plainest version of level 4.',
    // What the quiet holdings take off cancels what the rest add, so the fund's
    // part of the beta IS the beta. Found by playing the level, where the
    // two-number card read "0.17 of 0.17" and looked like a typo.
    dollars: { QQQ: 3000, BND: 2400, PG: 2300, JNJ: 2300 },
    needsBasket: true,
    expect: { key: 'hiddenAiAll', values: { ticker: 'QQQ', dollarPct: '30%' } },
    note: 'PG and JNJ move slightly against the basket, so QQQ accounts for the whole of it',
  },
  {
    key: 'ai-held-in-the-open',
    what: 'Level 4 failed: QQQ beside three AI stocks',
    lesson: 'When the AI is held in the open, the group card says it better than the fund card.',
    dollars: { QQQ: 3000, NVDA: 2400, MSFT: 2300, AVGO: 2300 },
    needsBasket: true,
    expect: { key: 'groupRisk', values: { group: 'AI stocks' } },
    // hiddenAi stands itself down here: the biggest contributor to the beta is
    // NVDA, a basket member, not the fund. That is the condition doing its job.
    note: 'Beta 0.79. The fund is only a fifth of it, so hiddenAi does not fire at all',
  },
  {
    key: 'even-risk-one-bet',
    what: 'Level 5 passed: four funds, each carrying about a quarter of the risk',
    lesson: 'Spreading the risk evenly is not making several bets. The trap level 5 sets.',
    dollars: { GLD: 2500, VEA: 2500, VXUS: 2500, VOO: 2500 },
    expect: { key: 'fewBets', values: { total: '4' } },
    note: '27% in the biggest holding and 1.03 bets: it passes level 5 and would fail level 3',
  },
  {
    key: 'over-the-risk-limit',
    what: 'Level 5 missed by a little: GLD at 37.9% of the risk against a 35% limit',
    lesson: 'The holding that failed the level, named. The answer to "where is the risk?" is a ticker.',
    dollars: { VOO: 2500, BND: 2500, GLD: 2500, XOM: 2500 },
    // What the round was. This card leads on a missed level 5 and is in no order
    // at all, so without the outcome it cannot be reached - which is the point:
    // on every other round the portfolio gets the card it got before.
    outcome: { measure: 'maxRiskShare', passed: false },
    limit: 0.35,
    expect: { key: 'overRiskLimit', values: { ticker: 'GLD', riskPct: '38%', dollarPct: '25%', limitPct: '35%' } },
    // Before this card, the round named BND - 25% of the money and 3% of the
    // risk - which is true, is level 5's own concept, and is about the other end
    // of the portfolio from the holding that failed.
    note: 'Without the card leading, this round named BND, the quietest holding, instead of GLD',
  },
  {
    key: 'one-holding-carries-it-all',
    what: 'Level 5 failed: three bond funds and one volatile holding',
    lesson: 'A quarter of the money can be four fifths of the risk.',
    dollars: { BND: 2500, TLT: 2500, LQD: 2500, NVDA: 2500 },
    expect: { key: 'riskGapOver', values: { ticker: 'NVDA', dollarPct: '25%' } },
    // fewBets cannot reach this one: NVDA holds 82% of the risk, so the risk is
    // not spread, which is exactly the condition that separates the two cards.
    note: 'NVDA is 25% of the money and 82% of the risk, so fewBets is held off by its own test',
  },
  {
    key: 'tight-pair-in-a-corner',
    what: 'A 0.94 pair carrying 13% of the risk, beside a holding that carries 45%',
    lesson: 'A pair can be the same bet and still not be the bet that decided the number.',
    // This is p17 from the level 2 guess pool, not a case built for the rule: one
    // of the 20 portfolios the game actually deals. A test holds the two equal,
    // so a change to the pool cannot leave this lesson quietly describing
    // something else.
    dollars: { ABBV: 4500, QQQ: 700, AAPL: 2900, MU: 700, VTI: 1200 },
    poolId: 'p17',
    expect: { key: 'pairLowRisk', values: { a: 'QQQ', b: 'VTI', r: '0.94', riskPct: '13%' } },
    note: 'ABBV is 45% of the money and 45% of the risk, so no gap rule and no group rule fires either',
  },
];

/**
 * The lesson portfolios for a REPLAYED round - level 6 - which are a different
 * kind of case from every one above.
 *
 * Those are portfolios measured over three years of returns. These are
 * portfolios HELD THROUGH a fixed five weeks of 2020, and the card is about
 * which holding moved the money rather than which holdings move together. The
 * pair at the top is the level's whole lesson: the same shape and the same
 * cushion, five times apart, because of which stocks sit in the 60%.
 */
export const CRASH_LESSONS = [
  {
    key: 'the-cushion-that-was-not-always-one',
    what: 'Level 6 passed: defensive stocks behind long Treasuries and a bond fund',
    lesson: 'What cushioned this crash is named - and so is the crash where the same holding did not.',
    dollars: { WMT: 3000, PG: 3000, TLT: 2000, BND: 2000 },
    expect: {
      key: 'crashCushionElsewhere',
      values: {
        ticker: 'TLT', move: '+14%', indexMove: '34%', dollarPct: '20%',
        otherWindow: 'the 2022 bear market', otherMove: '−29%', otherIndexMove: '25%',
      },
    },
    note: 'TLT rose 14% here and fell 29% against the index\'s 25% in 2022, both read from data/crashes.json',
  },
  {
    key: 'banks-and-oil-behind-the-same-cushion',
    what: 'Level 6 missed: banks and oil behind exactly the same cushion',
    lesson: 'The other half of the pair. Same shape, same bonds, and the card names what did the damage.',
    dollars: { JPM: 3000, XOM: 3000, TLT: 2000, BND: 2000 },
    expect: { key: 'crashDrag', values: { ticker: 'XOM', move: '−48%', dollarPct: '30%' } },
    note: 'XOM lost the most DOLLARS; it also fell the furthest, but the rule is dollars',
  },
  {
    key: 'held-up-by-a-holding-that-still-fell',
    what: 'Level 6 passed with no holding that rose at all',
    lesson: 'A cushion is sometimes just the thing that fell least, and the card has to read correctly then too.',
    dollars: { WMT: 2500, JNJ: 2500, AMZN: 2500, QQQ: 2500 },
    expect: { key: 'crashCushion', values: { ticker: 'WMT', move: '−2%', indexMove: '34%' } },
    note: 'Nothing rose, so the warning card stands itself down and the plain one answers',
  },
];

// ---------------------------------------------------------------- the data

/** The frozen snapshot, in data/game.json's shape. Never the live file. */
export function frozenGameDoc(prices) {
  const built = buildReturns(prices);
  const tickers = built.tickers.slice().sort();
  const from = built.dates.length - GAME_DAYS;
  const dates = built.dates.slice(from);
  return {
    meta: { liveThrough: dates[dates.length - 1], firstDate: dates[0], days: GAME_DAYS },
    tickers,
    rows: dates.map((date, i) => [date, ...tickers.map((t) => built.byTicker[t][from + i])]),
  };
}

/**
 * The card a bare portfolio gets, by the RULE path - no level, so no bucket
 * card and no lead-in.
 *
 * A lesson portfolio is not tied to a level: "three bond funds" is 3 holdings,
 * which fits neither level 1's two nor level 3's five. What is being checked is
 * which rule explains the portfolio, and that is a question about the rules.
 */
export function cardFor(game, groups, why, dollars, {
  days = WINDOW_DAYS, basket = null, outcome = null, limit = null, pairPlaces = undefined,
} = {}) {
  const total = Object.values(dollars).reduce((sum, d) => sum + d, 0);
  if (total !== TOTAL_DOLLARS) {
    throw new Error(`cardFor: ${Object.keys(dollars).join('/')} allocates ${total}, not ${TOTAL_DOLLARS}`);
  }
  const { tickers, weights } = weightsFromDollars(dollars);
  // The basket's members share the window with the portfolio, exactly as
  // js/round.js does it: a beta read off days the basket may not have is a
  // different measure.
  const needed = basket ? [...new Set([...tickers, ...basket])] : tickers;
  const window = gameWindow(game, needed, days);
  if (window.days < MIN_DAYS) {
    throw new Error(`cardFor: ${needed.join('/')} overlap on only ${window.days} days`);
  }
  const facts = whyFacts({
    tickers,
    weights,
    matrix: windowMatrix(window, tickers),
    groups,
    basketReturns: basket ? equalWeightBasket(window.byTicker, basket) : null,
    basketMembers: basket,
  });
  // `outcome` is what the round WAS, for a lesson about a card that leads on one
  // kind of round rather than sitting in why.json's order.
  // `pairPlaces` is for a caller comparing this card against a LEVEL's card:
  // level 1 reveals a correlation to three decimals, and the same pair has to
  // read the same way whichever path reached it. A bare lesson portfolio has no
  // level and leaves it unset, which is the two decimals every card had before.
  return { facts, card: pickWhy(facts, why, { outcome, limit, pairPlaces }), days: window.days };
}

/**
 * Which rules fire on these facts, in the order they would be asked: any rule
 * leading on this round first, then why.json's own order.
 */
export function firedRules(facts, why, { outcome = null, limit = null } = {}) {
  const keys = [...leadingRules(why, outcome), ...why.order];
  return keys.filter((key) => ruleCandidate(facts, why.rules.find((r) => r.key === key), { limit }).fires);
}

// ------------------------------------------------------------- the checks

/**
 * Every lesson portfolio, against the card written down beside it.
 *
 * The expected values are checked as a SUBSET: a case that cares which group was
 * named says so, and one that only cares which rule answered does not have to
 * list every percent.
 */
export function checkLessonPortfolios(game, groups, why, portfolios = LESSON_PORTFOLIOS, basket = null) {
  return portfolios.map((lesson) => {
    // A lesson about AI exposure needs the basket; the rest are measured without
    // one, which is also how a level that does not ask for a beta plays.
    const { card, facts } = cardFor(game, groups, why, lesson.dollars, {
      basket: lesson.needsBasket ? basket : null,
      outcome: lesson.outcome ?? null,
      limit: lesson.limit ?? null,
    });
    const wrongValues = Object.entries(lesson.expect.values ?? {})
      .filter(([name, want]) => card.values[name] !== want)
      .map(([name, want]) => `${name}: wanted ${want}, got ${card.values[name]}`);
    return {
      lesson,
      card,
      fired: firedRules(facts, why, { outcome: lesson.outcome ?? null, limit: lesson.limit ?? null }),
      ok: card.key === lesson.expect.key && wrongValues.length === 0,
      wrongValues,
    };
  });
}

/**
 * Every crash lesson portfolio, against the card written down beside it.
 *
 * The round is replayed rather than measured, so this does not go through
 * cardFor(): there is no game window and no covariance in it at all.
 */
export function checkCrashLessons(crashes, level, why, lessons = CRASH_LESSONS) {
  return lessons.map((lesson) => {
    const total = Object.values(lesson.dollars).reduce((sum, d) => sum + d, 0);
    if (total !== TOTAL_DOLLARS) {
      throw new Error(`${lesson.key} allocates ${total}, not ${TOTAL_DOLLARS}`);
    }
    const result = replay(crashes, level.window.key, lesson.dollars);
    const share = fallAgainstIndex(result).share;
    const passed = passes(level, share);
    const facts = crashFacts(result, {
      elsewhere: Object.fromEntries(result.tickers.map(
        (ticker) => [ticker, elsewhereFor(crashes, level.window.key, ticker)],
      )),
    });
    const card = pickWhy(facts, why, { outcome: { measure: 'fallShare', passed } });
    const wrongValues = Object.entries(lesson.expect.values ?? {})
      .filter(([name, want]) => card.values[name] !== want)
      .map(([name, want]) => `${name}: wanted ${want}, got ${card.values[name]}`);
    return {
      lesson,
      card,
      share,
      passed,
      ok: card.key === lesson.expect.key && wrongValues.length === 0,
      wrongValues,
    };
  });
}

/**
 * The tickers a player can actually hold: every ticker in a tickers.json GROUP.
 *
 * NOT game.tickers. That carries the two benchmarks as well - ^GSPC, which
 * defines market stress days, and RSP, the equal-weight S&P 500 behind
 * Hypothesis 2's verdict - and neither is a holding anybody can pick. js/game.js
 * builds the game's universe the same way, from the groups alone.
 */
export function playableUniverse(tickersDoc) {
  return tickersDoc.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
}

/** How often each rule fires, and how often it is the card shown. */
export function frequencies(game, levels, groups, why, universe, { samples = SAMPLES, seed = CHECK_SEED } = {}) {
  const keys = [...why.order, 'fallback'];
  const fired = Object.fromEntries(keys.map((k) => [k, 0]));
  const won = Object.fromEntries(keys.map((k) => [k, 0]));
  let counted = 0;

  const record = (facts, card) => {
    const list = firedRules(facts, why);
    for (const key of list) fired[key] += 1;
    if (list.length === 0) fired.fallback += 1;
    won[card.key] += 1;
    counted += 1;
  };

  // The 20 pool portfolios, which is what a level 2 round is dealt.
  for (const portfolio of levels.guessPool.portfolios) {
    const { facts, card } = cardFor(game, groups, why, portfolio.dollars);
    record(facts, card);
  }
  const pool = counted;

  // Seeded 5-holding level 3 builds at an even split, the plainest allocation a
  // player can type. Level 4's and 5's builds are not drawn here: this table is
  // what set the thresholds for the rules that existed when it was written, and
  // adding draws to it would change every number in it for reasons that have
  // nothing to do with the rules. The two new rules are measured by their lesson
  // portfolios and by the per-level counts in scripts/check_levels.mjs instead.
  const rng = makeRng(seed);
  let drawn = 0;
  let skipped = 0;
  while (drawn < samples && skipped < samples * 10) {
    const bag = [...universe];
    const tickers = [];
    while (tickers.length < 5) tickers.push(...bag.splice(rng.int(bag.length), 1));
    const dollars = Object.fromEntries(tickers.map((t) => [t, TOTAL_DOLLARS / 5]));
    try {
      const { facts, card } = cardFor(game, groups, why, dollars);
      record(facts, card);
      drawn += 1;
    } catch {
      // A late listing - VRT or PLTR, the two registered ones - can shorten the
      // window below the 252 days the game trusts. Those builds are skipped
      // rather than measured, and counted so the number is visible: a silent
      // skip once hid the two benchmarks being drawn as if they were holdings.
      skipped += 1;
    }
  }
  return { fired, won, counted, pool, builds: drawn, skipped, keys };
}

// -------------------------------------------------------------- reporting

/**
 * Which cards each level can show, and the lesson every one of them carries.
 *
 * WHY THIS IS A HAND-WRITTEN MAP and not derived: a rule fires on the FACTS,
 * and which facts exist depends on what the level measures - level 6 has no
 * covariance matrix, level 4 is the only one with a basket beta, and level 1
 * takes the bucket path and no rule at all. Deriving it would mean
 * reimplementing that branching here and hoping the second copy agrees. The
 * firing table this script prints is what the map is read against.
 *
 * THE POINT OF IT. "The idea" left the reveal on 27 November 2026, so a card
 * is the only general thing a player meets after a guess. A level whose cards
 * never state its lesson has lost that lesson rather than moved it.
 */
export const CARDS_BY_LEVEL = {
  1: ['same', 'partly', 'different'],
  2: ['pair', 'groupRisk', 'fewBets', 'manyBets', 'riskGapOver', 'riskGapUnder',
    'quietNotABet', 'pairLowRisk', 'fallback'],
  3: ['pair', 'groupRisk', 'fewBets', 'manyBets', 'riskGapOver', 'riskGapUnder',
    'quietNotABet', 'pairLowRisk', 'fallback'],
  4: ['hiddenAiAll', 'hiddenAi', 'pair', 'groupRisk', 'fewBets', 'manyBets',
    'riskGapOver', 'riskGapUnder', 'quietNotABet', 'pairLowRisk', 'fallback'],
  5: ['overRiskLimit', 'pair', 'groupRisk', 'fewBets', 'manyBets', 'riskGapOver',
    'riskGapUnder', 'quietNotABet', 'pairLowRisk', 'fallback'],
  6: ['crashCushionElsewhere', 'crashCushion', 'crashDrag'],
  7: ['pair', 'groupRisk', 'fewBets', 'manyBets', 'riskGapOver', 'riskGapUnder',
    'quietNotABet', 'pairLowRisk', 'fallback'],
};

/** The review table: each level's lesson, then every card it can show. */
function printLessons(levels, why) {
  console.log("Every level's lesson, and every card that level can show.");
  console.log('A card is three lines: what happened, how that compares with the guess,');
  console.log('and one thing to try. The middle line is per MEASURE, so it is printed');
  console.log('once per level rather than once per card.');

  const byKey = new Map(why.rules.map((rule) => [rule.key, rule]));
  for (const [key, card] of Object.entries(why.bucketCards)) byKey.set(key, card);
  byKey.set('fallback', why.fallback);

  for (const level of levels.levels) {
    const keys = CARDS_BY_LEVEL[level.id] ?? [];
    console.log(`\n${'='.repeat(74)}`);
    console.log(`LEVEL ${level.id}: ${level.title}`);
    console.log(`  LESSON    ${level.lesson}`);
    console.log(`  defines   ${level.guess.define}`);
    const lines = why.guessLines[level.guess.measure];
    if (lines) {
      console.log(`  guess line, ${level.guess.measure}:`);
      for (const direction of ['high', 'low', 'close']) {
        console.log(`    ${pad(direction, 6)}${lines[direction]}`);
      }
    }
    console.log(`\n  ${keys.length} cards can appear here:`);
    for (const key of keys) {
      const card = byKey.get(key);
      if (!card) {
        console.log(`    !! ${key} - no such card in why.json`);
        continue;
      }
      console.log(`\n    [${key}]`);
      console.log(`      happened: ${card.template}`);
      console.log(`      try next: ${card.tryNext}`);
    }
  }
  console.log('\nEducational, not investment advice.');
}

const pad = (text, width) => String(text).padEnd(width);

function main(argv = []) {
  const levels = validateLevels(readJson('levels.json'));
  const why = validateWhy(readJson('why.json'));
  const groups = groupIndex(readJson('tickers.json'));

  // --lessons prints the review table and stops: every level's lesson beside
  // every card that level can show. It is for reading, not for CI.
  if (argv.includes('--lessons')) {
    printLessons(levels, why);
    return;
  }

  const game = frozenGameDoc(readJson('data/prices.json'));

  console.log(`The "Why?" cards, over the frozen snapshot through ${game.meta.liveThrough}.`);

  const basket = readJson('basket.json').stocks.map((stock) => stock.ticker);
  const lessons = checkLessonPortfolios(game, groups, why, LESSON_PORTFOLIOS, basket);
  console.log(`\nLesson portfolios (${lessons.length}), each with the card it has to get\n`);
  for (const result of lessons) {
    const { lesson, card } = result;
    console.log(`  ${result.ok ? 'OK  ' : 'FAIL'} ${pad(lesson.key, 32)} ${pad(card.key, 13)} (fired: ${result.fired.join('+') || 'none'})`);
    console.log(`       ${lesson.what}`);
    console.log(`       ${card.text}`);
    for (const wrong of result.wrongValues) console.log(`       WRONG VALUE - ${wrong}`);
    if (!result.ok && card.key !== lesson.expect.key) {
      console.log(`       WRONG CARD - wanted ${lesson.expect.key}`);
    }
    console.log('');
  }

  const crashes = validateCrashes(readJson('data/crashes.json'));
  const crashLessons = checkCrashLessons(crashes, levelById(levels, 6), why);
  console.log(`Crash lesson portfolios (${crashLessons.length}), replayed through the 2020 crash\n`);
  for (const result of crashLessons) {
    console.log(`  ${result.ok ? 'OK  ' : 'FAIL'} ${pad(result.lesson.key, 36)} ${pad(result.card.key, 22)}`
      + ` ${result.share.toFixed(4)} ${result.passed ? 'passes' : 'misses'}`);
    console.log(`       ${result.lesson.what}`);
    console.log(`       ${result.card.text}`);
    for (const wrong of result.wrongValues) console.log(`       WRONG VALUE - ${wrong}`);
    if (!result.ok && result.card.key !== result.lesson.expect.key) {
      console.log(`       WRONG CARD - wanted ${result.lesson.expect.key}`);
    }
    console.log('');
  }

  const table = frequencies(game, levels, groups, why, playableUniverse(readJson('tickers.json')));
  console.log(`How often each rule fires, and how often it is the card shown`);
  console.log(`(${table.pool} pool portfolios + ${table.builds} seeded level 3 builds = ${table.counted})\n`);
  console.log(`  ${pad('rule', 15)}${pad('fires', 14)}shown`);
  for (const key of table.keys) {
    const share = (n) => `${n} (${Math.round((100 * n) / table.counted)}%)`;
    console.log(`  ${pad(key, 15)}${pad(share(table.fired[key]), 14)}${share(table.won[key])}`);
  }
  // A rule that leads on one kind of round cannot appear in a table of
  // portfolios measured without one, so say so rather than printing a silent 0.
  const leading = why.rules.filter((rule) => rule.leads);
  for (const rule of leading) {
    console.log(`\n  ${rule.key} is not in this table: it leads on one kind of round `
      + `(${Object.entries(rule.leads).map(([k, v]) => `${k} ${v}`).join(', ')}), and these `
      + 'portfolios are measured without a round. Its lesson portfolio is what holds it.');
  }
  // Level 7's cards are chosen from THREE GUESSES, not from a portfolio, so they
  // cannot be sampled here at all: no portfolio has a card of its own in this
  // family. Said out loud rather than left as an absence, because an absence
  // reads like an oversight. Their lesson cases - one named guess pattern per
  // card, with the card each must get - are in tests/series.test.js, which is the
  // same discipline as the lesson portfolios below.
  const seriesKeys = (why.seriesCards?.rules ?? []).map((rule) => rule.key);
  if (seriesKeys.length > 0) {
    console.log(`\n  ${seriesKeys.length + 1} series cards are not in this table either `
      + `(${[...seriesKeys, why.seriesCards.fallback.key].join(', ')}): they are chosen from a `
      + "player's three guesses rather than from a portfolio. tests/series.test.js names one "
      + 'guess pattern per card and holds each to the card it must get.');
  }
  if (table.skipped > 0) {
    console.log(`\n  ${table.skipped} draws skipped: a late listing left fewer than ${MIN_DAYS} overlapping days.`);
  }
  console.log(`  Drawn from the ${playableUniverse(readJson('tickers.json')).length} tickers a player can hold, which excludes the two benchmarks.`);

  console.log('\nEducational, not investment advice.');

  const broken = [...lessons, ...crashLessons].filter((r) => !r.ok);
  if (broken.length > 0) {
    console.error(`\n${broken.length} lesson portfolio(s) got the wrong card: ${broken.map((r) => r.lesson.key).join(', ')}.`);
    console.error('A threshold or the order in why.json has moved. Fix it, or change the lesson deliberately.');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
