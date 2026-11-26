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
  passes, levelById, weightsFromDollars, formatMeasure, displayFor,
} from '../js/levels.js';
import { splitWithFloors, floorFor } from '../js/round.js';
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

function report(title, { considered, winners }, show, formatter) {
  const enough = winners.length >= REQUIRED_DESIGNS;
  console.log(`\n${title}`);
  console.log(`  ${winners.length} winning designs out of ${considered} considered` +
    `  ${enough ? 'OK' : `FAIL - fewer than ${REQUIRED_DESIGNS}`}`);
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
  const basket = basketFile.stocks.map((stock) => stock.ticker);
  const built = buildReturns(snapshot);
  const universe = universeFrom(tickersFile);
  const groupOf = groupsFrom(tickersFile);

  console.log(`Levels 1 to 5 against ${pricesPath}, ${WINDOW_DAYS}-day windows.`);
  console.log(`Each level needs at least ${REQUIRED_DESIGNS} different winning designs.`);

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

  const level2 = levelById(levels, 2);
  const two = checkLevel2(built, level2, levels.guessPool);
  console.log(`\nLevel 2 - ${level2.title}: ${level2.pass.says}, so every guess passes`);
  console.log(`  the pool of ${two.considered} spans ${two.spread.low.toFixed(3)} to ${two.spread.high.toFixed(3)} effective bets`);
  const okTwo = two.considered === 20 && two.spread.high - two.spread.low >= 1;
  console.log(`  ${okTwo ? 'OK' : 'FAIL - the pool is too narrow to tell a good guess from a lucky one'}`);

  console.log('\nEducational, not investment advice.');

  if (!(okOne && okTwo && okThree && okFour && okFive)) {
    console.error('\nAt least one level does not have 3 winning designs.');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
