// scripts/check_levels.mjs - can every level still be passed, three ways?
//
//   node scripts/check_levels.mjs
//
// docs/PRD.md, Milestone 2 step 4: "Tune thresholds on real data so each level
// has at least 3 different winning designs." This is that check, for levels 1 to
// 3. It exits non-zero if any level has fewer than 3, so it can become the weekly
// CI job later without being rewritten.
//
// A "design" is a distinct SET OF HOLDINGS, not a reweighting. Effective bets
// moves with the weights, so counting reweightings would make any threshold look
// passable - a level with one winning set and a thousand winning splits of it has
// one design, and a player who picked the wrong five names cannot get there.
// Level 3's designs are therefore scored at EQUAL weights, the plainest
// allocation a player can type, which makes the count a floor: a player free with
// the dollars can only do better.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildReturns } from '../js/returns.js';
import { correlation } from '../js/math.js';
import { makeRng } from '../js/rng.js';
import { passes, levelById, weightsFromDollars, formatMeasure } from '../js/levels.js';
import { betsFor, WINDOW_DAYS } from './make_pool.mjs';

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
  const built = buildReturns(snapshot);
  const universe = universeFrom(tickersFile);
  const groupOf = groupsFrom(tickersFile);

  console.log(`Levels 1 to 3 against ${pricesPath}, ${WINDOW_DAYS}-day windows.`);
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

  const level2 = levelById(levels, 2);
  const two = checkLevel2(built, level2, levels.guessPool);
  console.log(`\nLevel 2 - ${level2.title}: ${level2.pass.says}, so every guess passes`);
  console.log(`  the pool of ${two.considered} spans ${two.spread.low.toFixed(3)} to ${two.spread.high.toFixed(3)} effective bets`);
  const okTwo = two.considered === 20 && two.spread.high - two.spread.low >= 1;
  console.log(`  ${okTwo ? 'OK' : 'FAIL - the pool is too narrow to tell a good guess from a lucky one'}`);

  console.log('\nEducational, not investment advice.');

  if (!(okOne && okTwo && okThree)) {
    console.error('\nAt least one level does not have 3 winning designs.');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
