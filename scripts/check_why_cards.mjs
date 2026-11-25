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
import { groupIndex, pickWhy, ruleCandidate, validateWhy, whyFacts } from '../js/why.js';
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
export function cardFor(game, groups, why, dollars, { days = WINDOW_DAYS } = {}) {
  const total = Object.values(dollars).reduce((sum, d) => sum + d, 0);
  if (total !== TOTAL_DOLLARS) {
    throw new Error(`cardFor: ${Object.keys(dollars).join('/')} allocates ${total}, not ${TOTAL_DOLLARS}`);
  }
  const { tickers, weights } = weightsFromDollars(dollars);
  const window = gameWindow(game, tickers, days);
  if (window.days < MIN_DAYS) {
    throw new Error(`cardFor: ${tickers.join('/')} overlap on only ${window.days} days`);
  }
  const facts = whyFacts({ tickers, weights, matrix: windowMatrix(window, tickers), groups });
  return { facts, card: pickWhy(facts, why, {}), days: window.days };
}

/** Which rules fire on these facts, in why.json's order. */
export function firedRules(facts, why) {
  return why.order.filter((key) => ruleCandidate(facts, why.rules.find((r) => r.key === key), {}).fires);
}

// ------------------------------------------------------------- the checks

/**
 * Every lesson portfolio, against the card written down beside it.
 *
 * The expected values are checked as a SUBSET: a case that cares which group was
 * named says so, and one that only cares which rule answered does not have to
 * list every percent.
 */
export function checkLessonPortfolios(game, groups, why, portfolios = LESSON_PORTFOLIOS) {
  return portfolios.map((lesson) => {
    const { card, facts } = cardFor(game, groups, why, lesson.dollars);
    const wrongValues = Object.entries(lesson.expect.values ?? {})
      .filter(([name, want]) => card.values[name] !== want)
      .map(([name, want]) => `${name}: wanted ${want}, got ${card.values[name]}`);
    return {
      lesson,
      card,
      fired: firedRules(facts, why),
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
  // player can type.
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

const pad = (text, width) => String(text).padEnd(width);

function main() {
  const levels = validateLevels(readJson('levels.json'));
  const why = validateWhy(readJson('why.json'));
  const groups = groupIndex(readJson('tickers.json'));
  const game = frozenGameDoc(readJson('data/prices.json'));

  console.log(`The "Why?" cards, over the frozen snapshot through ${game.meta.liveThrough}.`);

  const lessons = checkLessonPortfolios(game, groups, why);
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

  const table = frequencies(game, levels, groups, why, playableUniverse(readJson('tickers.json')));
  console.log(`How often each rule fires, and how often it is the card shown`);
  console.log(`(${table.pool} pool portfolios + ${table.builds} seeded level 3 builds = ${table.counted})\n`);
  console.log(`  ${pad('rule', 15)}${pad('fires', 14)}shown`);
  for (const key of table.keys) {
    const share = (n) => `${n} (${Math.round((100 * n) / table.counted)}%)`;
    console.log(`  ${pad(key, 15)}${pad(share(table.fired[key]), 14)}${share(table.won[key])}`);
  }
  if (table.skipped > 0) {
    console.log(`\n  ${table.skipped} draws skipped: a late listing left fewer than ${MIN_DAYS} overlapping days.`);
  }
  console.log(`  Drawn from the ${playableUniverse(readJson('tickers.json')).length} tickers a player can hold, which excludes the two benchmarks.`);

  console.log('\nEducational, not investment advice.');

  const broken = lessons.filter((r) => !r.ok);
  if (broken.length > 0) {
    console.error(`\n${broken.length} lesson portfolio(s) got the wrong card: ${broken.map((r) => r.lesson.key).join(', ')}.`);
    console.error('A threshold or the order in why.json has moved. Fix it, or change the lesson deliberately.');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
