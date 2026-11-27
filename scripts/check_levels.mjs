// scripts/check_levels.mjs - can every level still be passed, three ways?
//
//   node scripts/check_levels.mjs
//
// docs/PRD.md, Milestone 2 step 4: "Tune thresholds on real data so each level
// has at least 3 different winning designs." This is that check, for levels 1 to
// 5. It exits non-zero if any level has fewer than 3, so it can become the weekly
// CI job later without being rewritten.
//
// A "design" is a distinct SET OF HOLDINGS, not a reweighting. Effective bets
// moves with the weights, so counting reweightings would make any threshold look
// passable - a level with one winning set and a thousand winning splits of it has
// one design, and a player who picked the wrong five names cannot get there.
// Level 3's and level 5's designs are therefore scored at EQUAL weights, the
// plainest allocation a player can type, which makes the count a floor: a player
// free with the dollars can only do better.
//
// LEVEL 4 IS SCORED AT THE ALLOCATION THE GAME DEALS, not at equal weights,
// because equal weights are not a legal level 4 build: the level asks for at
// least 30% in QQQ, and js/round.js opens the round with QQQ at exactly that
// floor and the rest even. The same function produces both, so a winning design
// here is a design a player is actually looking at when the round starts.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildReturns } from '../js/returns.js';
import {
  betaTo,
  correlation,
  covariance,
  equalWeightBasket,
  maxRiskShare,
  portfolioReturns,
} from '../js/math.js';
import { makeRng } from '../js/rng.js';
import {
  passes, levelById, weightsFromDollars, formatMeasure, displayFor, kindFloorFor,
} from '../js/levels.js';
import { splitWithFloors, floorFor, raiseToKindFloor, DOLLAR_STEP } from '../js/round.js';
import {
  validateCrashes, windowByKey, unavailableIn, replay, fallAgainstIndex,
} from '../js/crash.js';
import { betsFor, WINDOW_DAYS, MIN_DAYS, TOTAL_DOLLARS } from './make_pool.mjs';

const root = new URL('..', import.meta.url);
const path = (name) => fileURLToPath(new URL(name, root));

export const REQUIRED_DESIGNS = 3;
export const CHECK_SEED = 11;
export const SAMPLES = 1200;

function universeFrom(tickers) {
  return tickers.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
}

function groupsFrom(tickers) {
  const map = new Map();
  for (const group of tickers.groups) {
    for (const t of group.tickers) map.set(typeof t === 'string' ? t : t.ticker, group.key);
  }
  return map;
}

/** Pearson correlation of two tickers over their own overlapping window. */
function pairCorrelation(built, a, b) {
  const window = built.commonWindow([a, b], WINDOW_DAYS);
  const rows = Array.from({ length: window.days }, (_, t) => [window.byTicker[a][t], window.byTicker[b][t]]);
  return { value: correlation(rows)[0][1], days: window.days };
}

/** Level 1: every pair in the level's pool, and which clear the threshold. */
export function checkLevel1(built, level) {
  const pool = level.pool;
  const pairs = [];
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      const { value, days } = pairCorrelation(built, pool[i], pool[j]);
      pairs.push({ design: [pool[i], pool[j]], value, days, passed: passes(level, value) });
    }
  }
  pairs.sort((a, b) => b.value - a.value);
  return { considered: pairs.length, winners: pairs.filter((p) => p.passed), all: pairs };
}

/** Level 3: distinct 5-holding sets at equal weights, and which clear 3 bets. */
export function checkLevel3(built, level, universe, groupOf) {
  const rng = makeRng(CHECK_SEED);
  const seen = new Set();
  const results = [];
  const size = level.holdings.exactly;

  for (let draw = 0; draw < SAMPLES; draw += 1) {
    const pool = [...universe];
    const tickers = [];
    while (tickers.length < size) {
      tickers.push(...pool.splice(Math.floor(rng.uniform() * pool.length), 1));
    }
    const key = [...tickers].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);

    const weights = tickers.map(() => 1 / size);
    const { bets, days } = betsFor(built, tickers, weights);
    results.push({
      design: tickers,
      value: bets,
      days,
      groups: new Set(tickers.map((t) => groupOf.get(t))).size,
      passed: passes(level, bets),
    });
  }
  results.sort((a, b) => b.value - a.value);
  return { considered: results.length, winners: results.filter((r) => r.passed), all: results };
}

/**
 * One window covering a portfolio AND every basket member, as a matrix of days
 * by holding, plus the basket's own daily returns over the same days.
 *
 * The joint window is the point: reading the basket over the portfolio's own
 * window would read it on days it might not have.
 */
function withBasket(built, tickers, basket, days = WINDOW_DAYS) {
  const window = built.commonWindow([...new Set([...tickers, ...basket])], days);
  const rows = Array.from({ length: window.days }, (_, t) => tickers.map((x) => window.byTicker[x][t]));
  return { window, rows, basketReturns: equalWeightBasket(window.byTicker, basket) };
}

/**
 * Level 4: distinct 4-holding sets that hold QQQ, scored at the allocation the
 * game deals them - QQQ at its 30% floor, the rest even - and which clear a beta
 * to the AI basket under 0.50.
 */
export function checkLevel4(built, level, universe, basket) {
  const rng = makeRng(CHECK_SEED);
  const size = level.holdings.exactly;
  const required = level.holdings.required;
  const floors = Object.fromEntries(
    Object.keys(level.holdings.minShare ?? {}).map((t) => [t, floorFor(level, t, TOTAL_DOLLARS)]),
  );
  const free = universe.filter((t) => !required.includes(t));
  const seen = new Set();
  const results = [];

  for (let draw = 0; draw < SAMPLES; draw += 1) {
    const bag = [...free];
    const picks = [...required];
    while (picks.length < size) {
      picks.push(...bag.splice(Math.floor(rng.uniform() * bag.length), 1));
    }
    const key = [...picks].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);

    const dollars = splitWithFloors(picks, TOTAL_DOLLARS, floors);
    const weights = picks.map((t) => dollars[t] / TOTAL_DOLLARS);
    const { window, rows, basketReturns } = withBasket(built, picks, basket);
    if (window.days < MIN_DAYS) continue;
    const beta = betaTo(portfolioReturns(rows, weights), basketReturns);
    results.push({ design: picks, value: beta, days: window.days, passed: passes(level, beta) });
  }
  results.sort((a, b) => a.value - b.value);
  return { considered: results.length, winners: results.filter((r) => r.passed), all: results };
}

/**
 * Level 5: distinct 4-holding sets at equal weights, and which keep every
 * holding at or under 35% of the risk.
 */
export function checkLevel5(built, level, universe) {
  const rng = makeRng(CHECK_SEED);
  const size = level.holdings.exactly;
  const seen = new Set();
  const results = [];

  for (let draw = 0; draw < SAMPLES; draw += 1) {
    const bag = [...universe];
    const picks = [];
    while (picks.length < size) {
      picks.push(...bag.splice(Math.floor(rng.uniform() * bag.length), 1));
    }
    const key = [...picks].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);

    const window = built.commonWindow(picks, WINDOW_DAYS);
    if (window.days < MIN_DAYS) continue;
    const rows = Array.from({ length: window.days }, (_, t) => picks.map((x) => window.byTicker[x][t]));
    const weights = picks.map(() => 1 / size);
    const cov = covariance(rows);
    const share = maxRiskShare(weights, cov);
    results.push({
      design: picks,
      value: share,
      days: window.days,
      // Reported beside the share, because a portfolio can spread its risk evenly
      // and still be one bet - which is what level 5's own "why" warns about.
      bets: betsFor(built, picks, weights).bets,
      passed: passes(level, share),
    });
  }
  results.sort((a, b) => a.value - b.value);
  return { considered: results.length, winners: results.filter((r) => r.passed), all: results };
}

/**
 * Level 6's NAMED builds, each with the answer it has to give.
 *
 * Not a sample of anything. The first two are the level's whole lesson in one
 * pair: the same shape, the same cushion, and five times apart because of which
 * stocks sit in the 60%. A random sample would have found neither - it found
 * 67 winners out of 1,799 draws and could not say what made them win.
 *
 * The expected shares are exact, to 1e-9, because data/crashes.json is history
 * and never refreshed: "these windows are history and never move, so this file
 * is built once and committed" (its own meta). If one of these numbers moves,
 * something has changed that should not have.
 */
export const LEVEL6_BUILDS = [
  {
    key: 'defensive-stocks-and-bonds',
    what: 'Defensive stocks with a bond cushion',
    lesson: 'What passes is which stocks, not how much was held back.',
    dollars: { WMT: 3000, PG: 3000, TLT: 2000, BND: 2000 },
    expect: { share: 0.14154467587923866, passes: true },
  },
  {
    key: 'banks-and-oil-same-cushion',
    what: 'Banks and oil behind the SAME cushion',
    lesson: 'Same 60/40 shape, same two bond funds, five times the fall. The pair is the lesson.',
    dollars: { JPM: 3000, XOM: 3000, TLT: 2000, BND: 2000 },
    expect: { share: 0.7224685659490999, passes: false },
  },
  {
    key: 'the-index-itself',
    what: 'All of it in VOO',
    lesson: 'The portfolio IS the index, so the answer is exactly 1 - the bucket edge, on real data.',
    dollars: { VOO: 10000 },
    expect: { share: 1, passes: false },
  },
  {
    key: 'bonds-that-did-not-cushion',
    what: '60% VOO with the broad bond fund instead of long Treasuries',
    lesson: 'Holding bonds is not the answer: BND lost 1.43% in this window and TLT gained 14.23%.',
    dollars: { VOO: 6000, BND: 4000 },
    expect: { share: 0.6168445931328964, passes: false },
  },
  {
    key: 'long-treasuries-cushioned-this-one',
    what: '60% VOO with long Treasuries',
    lesson: 'The plainest pass there is - and the one level 6\'s "why" warns not to learn too well.',
    dollars: { VOO: 6000, TLT: 4000 },
    expect: { share: 0.4325032943352791, passes: true },
  },
  {
    key: 'five-ai-stocks-no-cushion',
    what: 'Five AI stocks, the portfolio the game is named after',
    lesson: 'One bet, no cushion: it fell with the market because it was the market.',
    dollars: { NVDA: 2000, AMD: 2000, AVGO: 2000, MU: 2000, ANET: 2000 },
    expect: { share: 0.9628513468667566, passes: false },
  },
];

/**
 * Level 6: distinct 4-holding sets replayed through the 2020 crash at the
 * allocation the game deals them - an even split raised until 60% sits in stocks
 * - and which fell less than half as much as the S&P 500.
 *
 * THE PRICES ARE data/crashes.json AND NEVER data/prices.json. This level's
 * window is a fixed 23 days of history, so unlike levels 1 to 5 its answers do
 * not move when the market does and --prices says nothing about it.
 *
 * Two kinds of draw are skipped rather than scored, and both are counted:
 * a design holding something the window cannot replay (PLTR had not listed), and
 * a design with no stock in it at all, which can never reach the 60% floor.
 */
export function checkLevel6(crashes, level, levels, universe) {
  const rng = makeRng(CHECK_SEED);
  const size = level.holdings.exactly;
  const rule = kindFloorFor(level, levels);
  const inKind = (ticker) => rule.tickers.includes(ticker);
  const floorDollars = Math.ceil((rule.share * TOTAL_DOLLARS) / DOLLAR_STEP) * DOLLAR_STEP;
  const window = windowByKey(crashes, level.window.key);
  const canHold = (ticker) => window.tickers.includes(ticker) && !unavailableIn(window, ticker);

  const seen = new Set();
  const results = [];
  const skipped = { unavailable: 0, noStock: 0, shortOfFloor: 0 };

  for (let draw = 0; draw < SAMPLES; draw += 1) {
    const bag = [...universe];
    const picks = [];
    while (picks.length < size) picks.push(...bag.splice(Math.floor(rng.uniform() * bag.length), 1));
    const key = [...picks].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    if (!picks.every(canHold)) { skipped.unavailable += 1; continue; }
    if (!picks.some(inKind)) { skipped.noStock += 1; continue; }

    const dollars = raiseToKindFloor(
      splitWithFloors(picks, TOTAL_DOLLARS), picks, inKind, floorDollars,
    );
    const inStocks = picks.filter(inKind).reduce((sum, t) => sum + dollars[t], 0);
    if (inStocks < floorDollars) { skipped.shortOfFloor += 1; continue; }

    const result = replay(crashes, level.window.key, dollars);
    const share = fallAgainstIndex(result).share;
    results.push({
      design: picks,
      dollars,
      value: share,
      change: result.change,
      stockShare: inStocks / TOTAL_DOLLARS,
      days: result.window.days,
      passed: passes(level, share),
    });
  }
  results.sort((a, b) => a.value - b.value);
  return { considered: results.length, winners: results.filter((r) => r.passed), all: results, skipped };
}

/** The named builds, each against the share it has to give. */
export function checkLevel6Builds(crashes, level, builds = LEVEL6_BUILDS) {
  return builds.map((build) => {
    const total = Object.values(build.dollars).reduce((sum, d) => sum + d, 0);
    if (total !== TOTAL_DOLLARS) {
      throw new Error(`${build.key} allocates ${total}, not ${TOTAL_DOLLARS}`);
    }
    const result = replay(crashes, level.window.key, build.dollars);
    const share = fallAgainstIndex(result).share;
    return {
      build,
      value: share,
      change: result.change,
      passed: passes(level, share),
      ok: Math.abs(share - build.expect.share) <= 1e-9 && passes(level, share) === build.expect.passes,
    };
  });
}

/** Level 2 passes on making a guess, so what matters is the pool's spread. */
export function checkLevel2(built, level, guessPool) {
  const bets = guessPool.portfolios.map((portfolio) => {
    const { tickers, weights } = weightsFromDollars(portfolio.dollars);
    return { id: portfolio.id, value: betsFor(built, tickers, weights).bets };
  });
  bets.sort((a, b) => a.value - b.value);
  return {
    considered: bets.length,
    winners: bets,                       // every guess passes, as registered
    spread: { low: bets[0].value, high: bets[bets.length - 1].value },
  };
}

/**
 * Level 7: can it still be passed, and can it still not be passed blind?
 *
 * "Three winning designs" says nothing about this level - it has no build, so a
 * player picks nothing and there is no design to win with. What a guessing level
 * can lose instead is its spread. Level 7 passes on three guesses all within 1,
 * so if the capstone pool's two strata ever drifted within 2 bets of each other,
 * one number would be within 1 of all three answers and the capstone could be
 * passed without reading a portfolio.
 *
 * MEASURED HERE, FOR EVERY TRIPLE THE DRAW CAN PRODUCE, not for the pool's
 * declared bands. The bands are a claim about answers; this recomputes the
 * answers. tests/series.test.js makes the same check against the frozen snapshot,
 * and this one is the reason the script exists: a weekly run against prices that
 * have moved is where drift would show up first.
 */
export function checkLevel7(built, level, guessPool, finalPool) {
  const betsOf = (portfolio) => {
    const { tickers, weights } = weightsFromDollars(portfolio.dollars);
    return { id: portfolio.id, stratum: portfolio.stratum, value: betsFor(built, tickers, weights).bets };
  };
  const first = guessPool.portfolios.map(betsOf);
  const capstone = finalPool.portfolios.map(betsOf);
  const byStratum = finalPool.strata.map((stratum) => ({
    stratum,
    members: capstone.filter((p) => p.stratum === stratum.key),
  }));

  // A portfolio whose answer has drifted out of the band it was published in.
  const drifted = [];
  for (const { stratum, members } of byStratum) {
    for (const member of members) {
      if (member.value < stratum.min || member.value > stratum.max) {
        drifted.push({ ...member, band: stratum });
      }
    }
  }

  // Every triple: one from the pool of 20, one from each stratum.
  const [low, high] = byStratum.map((s) => s.members);
  let triples = 0;
  let worst = { spread: Infinity, ids: null };
  for (const a of first) {
    for (const b of low) {
      for (const c of high) {
        triples += 1;
        const values = [a.value, b.value, c.value];
        const spread = Math.max(...values) - Math.min(...values);
        if (spread < worst.spread) worst = { spread, ids: [a.id, b.id, c.id], values };
      }
    }
  }

  // Can it be passed at all? A player guessing each answer exactly always can,
  // so what this really asks is whether the slider reaches every answer, within
  // 1, at the step it moves in.
  const reach = [...first, ...capstone].filter((p) => {
    const nearest = Math.min(
      Math.max(Math.round(p.value / level.guess.step) * level.guess.step, level.guess.min),
      level.guess.max,
    );
    return Math.abs(nearest - p.value) > level.pass.of;
  });

  return {
    considered: triples,
    worst,
    drifted,
    unreachable: reach,
    strata: byStratum.map(({ stratum, members }) => ({
      key: stratum.key,
      low: Math.min(...members.map((m) => m.value)),
      high: Math.max(...members.map((m) => m.value)),
      count: members.length,
    })),
    gap: Math.min(...high.map((p) => p.value)) - Math.max(...low.map((p) => p.value)),
  };
}

/**
 * What it means for a level to have no winning design.
 *
 * THE STAKES CHANGED TWICE. It first meant "this level is too hard", a
 * judgement about one screen. Under pass-to-unlock (session 2.24) it meant the
 * ladder ENDED there - nobody earns a star, so nobody reaches any level after
 * it, and PREREG.md's Hypothesis 3 becomes uncomputable for every player. The
 * playtest moved the rule to play-to-unlock (session 2.38), so an unpassable
 * level no longer blocks the ladder: a player finishes it, earns nothing, and
 * carries on to the next one. Hypothesis 3 still gets its pair.
 *
 * SO WHY THIS STILL FAILS THE RUN. A level nobody can pass is a level whose
 * stated goal is a lie, which is worse on a teaching game than on a ladder -
 * the player is told what to build, builds it, and is told they were wrong
 * with no design in existence that would have been right. And two of
 * docs/PRD.md's success targets are counted off pings that say every earlier
 * level was passed, so an unpassable level zeroes both of them while the
 * levels after it still fill up with visits. The message says which of the two
 * problems it is rather than leaving a reader to infer it from a count.
 */
function solvabilityVerdict(level, winners) {
  if (winners === 0) {
    return `FAIL - NO WINNING DESIGN AT ALL on level ${level}. Under `
      + `play-to-unlock this no longer blocks the ladder, so it costs no player `
      + `the levels after it - but the level asks for something nobody can `
      + `build, and every success target counted off a passed ladder reads 0 `
      + `from here on.`;
  }
  if (winners < REQUIRED_DESIGNS) {
    return `FAIL - only ${winners} winning design${winners === 1 ? '' : 's'}, `
      + `fewer than the ${REQUIRED_DESIGNS} this level needs. Passable, but on so `
      + `few designs that most players will miss it - and a level most players `
      + `miss is a star nobody earns, not a level nobody gets past.`;
  }
  return 'OK';
}

function report(title, { considered, winners }, show, formatter, level = null) {
  const enough = winners.length >= REQUIRED_DESIGNS;
  console.log(`\n${title}`);
  console.log(`  ${winners.length} winning designs out of ${considered} considered` +
    `  ${solvabilityVerdict(level ?? title, winners.length)}`);
  for (const winner of winners.slice(0, show)) console.log(`    ${formatter(winner)}`);
  if (winners.length > show) console.log(`    ... and ${winners.length - show} more`);
  return enough;
}

function main(argv = []) {
  // --prices points the check at a different price file. The default is the
  // frozen snapshot, which is what a local run wants. The refresh workflow passes
  // the live file it has just fetched, because that is the data the game will
  // actually be played on: a level can only go unpassable as prices move, and the
  // frozen snapshot never moves.
  let pricesPath = 'data/prices.json';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--prices') { pricesPath = argv[i + 1]; i += 1; } else {
      throw new Error(`check_levels: unknown argument ${argv[i]}`);
    }
  }
  const snapshot = JSON.parse(readFileSync(path(pricesPath), 'utf8'));
  const tickersFile = JSON.parse(readFileSync(path('tickers.json'), 'utf8'));
  const levels = JSON.parse(readFileSync(path('levels.json'), 'utf8'));
  const basketFile = JSON.parse(readFileSync(path('basket.json'), 'utf8'));
  // Level 6's prices, which are a different file and a fixed piece of history.
  const crashes = validateCrashes(JSON.parse(readFileSync(path('data/crashes.json'), 'utf8')));
  const basket = basketFile.stocks.map((stock) => stock.ticker);
  const built = buildReturns(snapshot);
  const universe = universeFrom(tickersFile);
  const groupOf = groupsFrom(tickersFile);

  console.log(`Levels 1 to 5 and 7 against ${pricesPath}, ${WINDOW_DAYS}-day windows.`);
  console.log('Level 6 against data/crashes.json, which is history and does not move.');
  console.log(`Each level needs at least ${REQUIRED_DESIGNS} different winning designs.`);
  console.log('A level with NONE asks for something nobody can build: playing unlocks the next,');
  console.log('so it stops no player - but no star is ever earned on it either.');

  const level1 = levelById(levels, 1);
  const one = checkLevel1(built, level1);
  const okOne = report(
    `Level 1 - ${level1.title}: ${level1.pass.says}`,
    one, 10,
    (w) => `${formatMeasure(w.value, { threshold: level1.pass.threshold })}  ${w.design.join(' + ')}`,
  );
  const nearMiss = one.all.find((p) => !p.passed);
  if (nearMiss) {
    console.log(`    nearest miss: ${formatMeasure(nearMiss.value, { threshold: level1.pass.threshold })}` +
      `  ${nearMiss.design.join(' + ')}`);
  }

  const level3 = levelById(levels, 3);
  const three = checkLevel3(built, level3, universe, groupOf);
  const okThree = report(
    `Level 3 - ${level3.title}: ${level3.pass.says}, equal weights`,
    three, 10,
    (w) => `${formatMeasure(w.value, { threshold: level3.pass.threshold })} bets  ${w.design.join(' + ')}  [${w.groups} groups]`,
  );

  const level4 = levelById(levels, 4);
  const four = checkLevel4(built, level4, universe, basket);
  const okFour = report(
    `Level 4 - ${level4.title}: ${level4.pass.says}, QQQ at its 30% floor`,
    four, 10,
    (w) => `${formatMeasure(w.value, { threshold: level4.pass.threshold })}  ${w.design.join(' + ')}`,
  );
  const worstFour = four.all[four.all.length - 1];
  if (worstFour) {
    console.log(`    hardest draw: ${formatMeasure(worstFour.value, { threshold: level4.pass.threshold })}`
      + `  ${worstFour.design.join(' + ')}`);
  }

  const level5 = levelById(levels, 5);
  const five = checkLevel5(built, level5, universe);
  const okFive = report(
    `Level 5 - ${level5.title}: ${level5.pass.says}, equal weights`,
    five, 10,
    (w) => `${formatMeasure(w.value, { threshold: level5.pass.threshold, display: displayFor(level5).display })}`
      + `  ${w.bets.toFixed(2)} bets  ${w.design.join(' + ')}`,
  );
  // The trap this level sets, counted rather than asserted: a passing build can
  // still be barely more than one bet, which is why its "why" says so.
  const evenButOneBet = five.winners.filter((w) => w.bets < 2).length;
  if (five.winners.length > 0) {
    console.log(`    ${evenButOneBet} of ${five.winners.length} winning designs make fewer than 2 bets`
      + ' - even risk is not several bets');
  }

  const level6 = levelById(levels, 6);
  const six = checkLevel6(crashes, level6, levels, universe);
  const okSix = report(
    `Level 6 - ${level6.title}: ${level6.pass.says}, 60% in stocks, as the game deals it`,
    six, 10,
    (w) => `${formatMeasure(w.value, { threshold: level6.pass.threshold })}`
      + `  fell ${(100 * w.change).toFixed(2)}%  ${Math.round(100 * w.stockShare)}% in stocks`
      + `  ${w.design.join(' + ')}`,
  );
  console.log(`    skipped: ${six.skipped.unavailable} held something the window cannot replay, `
    + `${six.skipped.noStock} held no stock at all, ${six.skipped.shortOfFloor} could not reach the floor`);
  const worstSix = six.all[six.all.length - 1];
  if (worstSix) {
    console.log(`    hardest draw: ${formatMeasure(worstSix.value, { threshold: level6.pass.threshold })}`
      + `  ${worstSix.design.join(' + ')}`);
  }
  // What the winners have in common, which is the thing the level teaches and the
  // thing its "why" is careful about: long Treasuries were THIS crash's cushion.
  const withTlt = six.all.filter((r) => r.design.includes('TLT'));
  const withoutTlt = six.all.filter((r) => !r.design.includes('TLT'));
  const rate = (list) => `${list.filter((r) => r.passed).length} of ${list.length}`;
  console.log(`    holding TLT: ${rate(withTlt)} win; without it: ${rate(withoutTlt)}`);

  console.log(`\n  Named builds, each with the answer it has to give:`);
  const sixBuilds = checkLevel6Builds(crashes, level6);
  for (const result of sixBuilds) {
    console.log(`    ${result.ok ? 'OK  ' : 'FAIL'} ${result.value.toFixed(4)} `
      + `${result.passed ? 'passes' : 'misses'}  ${result.build.what}`);
    console.log(`         ${result.build.lesson}`);
    if (!result.ok) {
      console.log(`         WRONG - wanted ${result.build.expect.share} `
        + `${result.build.expect.passes ? 'passing' : 'missing'}`);
    }
  }
  const okSixBuilds = sixBuilds.every((r) => r.ok);

  const level2 = levelById(levels, 2);
  const two = checkLevel2(built, level2, levels.guessPool);
  console.log(`\nLevel 2 - ${level2.title}: ${level2.pass.says}, so every guess passes`);
  console.log(`  the pool of ${two.considered} spans ${two.spread.low.toFixed(3)} to ${two.spread.high.toFixed(3)} effective bets`);
  const okTwo = two.considered === 20 && two.spread.high - two.spread.low >= 1;
  console.log(`  ${okTwo ? 'OK' : 'FAIL - the pool is too narrow to tell a good guess from a lucky one'}`);

  const level7 = levelById(levels, 7);
  const seven = checkLevel7(built, level7, levels.guessPool, levels.finalPool);
  console.log(`\nLevel 7 - ${level7.title}: ${level7.pass.says}`);
  for (const stratum of seven.strata) {
    console.log(`  the ${stratum.key} stratum's ${stratum.count} portfolios answer ${stratum.low.toFixed(3)} to ${stratum.high.toFixed(3)} bets`);
  }
  console.log(`  the gap between them is ${seven.gap.toFixed(3)} bets`);
  console.log(`  the closest any of the ${seven.considered} triples comes to being covered by one guess: `
    + `${seven.worst.spread.toFixed(3)} bets apart (${seven.worst.ids.join(', ')})`);
  const okSevenBlind = seven.worst.spread > 2;
  console.log(`  ${okSevenBlind
    ? 'OK - no single guess is within 1 of all three, so it cannot be passed blind'
    : 'FAIL - one guess would be within 1 of all three answers'}`);
  // A published answer that has drifted out of its own band is not yet a broken
  // level - what breaks the level is the gap closing - so it is reported on its
  // own line and does not fail the run by itself.
  if (seven.drifted.length > 0) {
    console.log(`  ${seven.drifted.length} portfolios have drifted out of their published band:`);
    for (const d of seven.drifted) {
      console.log(`    ${d.id} now answers ${d.value.toFixed(3)}, published in ${d.band.min} to ${d.band.max}`);
    }
  }
  if (seven.unreachable.length > 0) {
    console.log(`  FAIL - the slider cannot get within 1 of ${seven.unreachable.map((p) => p.id).join(', ')}`);
  }
  const okSeven = okSevenBlind && seven.unreachable.length === 0;

  console.log('\nEducational, not investment advice.');

  if (!okSeven) {
    console.error('\nLevel 7 can no longer do its job: see the lines above.');
    process.exit(1);
  }
  if (!(okOne && okTwo && okThree && okFour && okFive && okSix)) {
    console.error('\nAt least one level does not have 3 winning designs.');
    process.exit(1);
  }
  if (!okSixBuilds) {
    console.error('\nA named level 6 build no longer gives the answer written down beside it.');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
