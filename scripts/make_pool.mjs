// scripts/make_pool.mjs - generate the pool of 20 guess portfolios.
//
//   node scripts/make_pool.mjs          print what it would write
//   node scripts/make_pool.mjs --write  write it into levels.json
//
// WHY A SCRIPT, not twenty hand-typed portfolios. PREREG.md gives level 2's
// portfolio and the first of level 7's mystery portfolios one shared pool of 20,
// "so on average they are equally hard". That argument only holds if the pool
// spans a range of answers rather than twenty easy ones, and a stratified draw
// is how you get that and can show you got it. The result is committed as plain
// JSON, so the pool is data a reviewer reads, not a draw they have to trust.
//
// The seed is NOT 2026. That seed belongs to the registered Hypothesis 1 sampler
// and Hypothesis 2 bootstrap, and a game pool has no business borrowing it.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildReturns } from '../js/returns.js';
import { covariance, effectiveBets } from '../js/math.js';
import { makeRng } from '../js/rng.js';

const root = new URL('..', import.meta.url);
const path = (name) => fileURLToPath(new URL(name, root));

export const POOL_SEED = 7;
export const POOL_SIZE = 20;
export const WINDOW_DAYS = 756;
export const MIN_DAYS = 252;
export const MIN_HOLDINGS = 3;
export const MAX_HOLDINGS = 5;

/** A beginner's portfolio holds at least one fund, as level 2's does. */
export const FUNDS = ['VOO', 'QQQ', 'VTI', 'VXUS', 'BND', 'GLD'];

/** Dollars are allocated in hundreds, the way a person would. */
export const DOLLAR_STEP = 100;
export const TOTAL_DOLLARS = 10000;

/**
 * Split the money into `n` parts, each a multiple of DOLLAR_STEP and each at
 * least one step, summing to exactly TOTAL_DOLLARS.
 */
export function splitDollars(rng, n) {
  const steps = TOTAL_DOLLARS / DOLLAR_STEP;
  if (n > steps) throw new Error(`splitDollars: ${n} holdings will not fit`);
  const weights = rng.dirichletFlat(n);
  // Largest-remainder rounding, so the parts sum exactly.
  const raw = weights.map((w) => w * (steps - n));
  const floors = raw.map(Math.floor);
  let left = (steps - n) - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((value, i) => ({ i, fraction: value - floors[i] }))
    .sort((a, b) => b.fraction - a.fraction);
  const parts = floors.map((f) => f + 1);
  for (let k = 0; k < left; k += 1) parts[order[k % n].i] += 1;
  return parts.map((p) => p * DOLLAR_STEP);
}

function universeFrom(tickers) {
  return tickers.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
}

/** Effective bets for a portfolio, over its own overlapping window. */
export function betsFor(built, tickers, weights) {
  const window = built.commonWindow(tickers, WINDOW_DAYS);
  if (window.days < MIN_DAYS) {
    throw new Error(`betsFor: ${tickers.join('/')} overlap on only ${window.days} days`);
  }
  // covariance() wants rows = days, columns = holdings.
  const rows = Array.from(
    { length: window.days },
    (_, t) => tickers.map((ticker) => window.byTicker[ticker][t]),
  );
  return { bets: effectiveBets(weights, covariance(rows)), days: window.days, startDate: window.startDate, endDate: window.endDate };
}

/**
 * Draw candidates, then keep 20 spread evenly across the range of answers they
 * cover: one from each of 20 equal slices between the 5th and 95th percentile of
 * the candidates' effective bets.
 */
export function buildPool(built, universe, { seed = POOL_SEED, candidates = 600 } = {}) {
  const rng = makeRng(seed);
  const drawn = [];
  const seen = new Set();

  while (drawn.length < candidates) {
    const size = MIN_HOLDINGS + Math.floor(rng.uniform() * (MAX_HOLDINGS - MIN_HOLDINGS + 1));
    const pool = [...universe];
    const tickers = [];
    while (tickers.length < size) {
      tickers.push(...pool.splice(Math.floor(rng.uniform() * pool.length), 1));
    }
    if (!tickers.some((t) => FUNDS.includes(t))) continue;     // beginners hold a fund
    const key = [...tickers].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);

    const dollars = splitDollars(rng, size);
    const byTicker = Object.fromEntries(tickers.map((t, i) => [t, dollars[i]]));
    const weights = tickers.map((t) => byTicker[t] / TOTAL_DOLLARS);
    const { bets, days } = betsFor(built, tickers, weights);
    drawn.push({ tickers, dollars: byTicker, bets, days });
  }

  drawn.sort((a, b) => a.bets - b.bets);
  const low = drawn[Math.floor(0.05 * (drawn.length - 1))].bets;
  const high = drawn[Math.floor(0.95 * (drawn.length - 1))].bets;

  // One portfolio per slice: the candidate nearest each slice's midpoint.
  const chosen = [];
  const used = new Set();
  for (let k = 0; k < POOL_SIZE; k += 1) {
    const target = low + ((k + 0.5) / POOL_SIZE) * (high - low);
    let best = null;
    for (let i = 0; i < drawn.length; i += 1) {
      if (used.has(i)) continue;
      const distance = Math.abs(drawn[i].bets - target);
      if (best === null || distance < best.distance) best = { i, distance };
    }
    used.add(best.i);
    chosen.push(drawn[best.i]);
  }

  chosen.sort((a, b) => a.bets - b.bets);
  return chosen.map((entry, i) => ({
    id: `p${String(i + 1).padStart(2, '0')}`,
    dollars: entry.dollars,
    expectedBets: entry.bets,
  }));
}

function main() {
  const write = process.argv.includes('--write');
  const snapshot = JSON.parse(readFileSync(path('data/prices.json'), 'utf8'));
  const tickers = JSON.parse(readFileSync(path('tickers.json'), 'utf8'));
  const built = buildReturns(snapshot);
  const universe = universeFrom(tickers);

  const portfolios = buildPool(built, universe);
  const bets = portfolios.map((p) => p.expectedBets);

  console.log(`Pool of ${portfolios.length}, seed ${POOL_SEED}, ${WINDOW_DAYS}-day window:`);
  for (const p of portfolios) {
    const holdings = Object.entries(p.dollars).map(([t, d]) => `${t} $${d}`).join(', ');
    console.log(`  ${p.id}  ${p.expectedBets.toFixed(3)} bets  ${holdings}`);
  }
  console.log(`\n  range ${bets[0].toFixed(3)} to ${bets[bets.length - 1].toFixed(3)} effective bets`);
  console.log('  Educational, not investment advice.');

  if (!write) {
    console.log('\n(nothing written - pass --write to put this in levels.json)');
    return;
  }

  const levelsPath = path('levels.json');
  const levels = JSON.parse(readFileSync(levelsPath, 'utf8'));
  levels.guessPool = {
    ...levels.guessPool,
    seed: POOL_SEED,
    seedNote: 'A game seed, deliberately not the registered seed 2026.',
    generatedBy: 'scripts/make_pool.mjs',
    window: { days: WINDOW_DAYS, minDays: MIN_DAYS },
    expectedBetsNote:
      'Computed from the committed data/prices.json when the pool was generated. The game recomputes it at play time; a test holds the two to 1e-9.',
    portfolios,
  };
  writeFileSync(levelsPath, `${JSON.stringify(levels, null, 2)}\n`);
  console.log(`\nWrote ${portfolios.length} portfolios into levels.json`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
