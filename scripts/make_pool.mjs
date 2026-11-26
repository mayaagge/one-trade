// scripts/make_pool.mjs - generate the two published guess pools.
//
//   node scripts/make_pool.mjs                  print the pool of 20
//   node scripts/make_pool.mjs --write          write it into levels.json
//   node scripts/make_pool.mjs --final          print level 7's capstone pool
//   node scripts/make_pool.mjs --final --write  write it into levels.json
//
// TWO POOLS, and they answer to different rules. `guessPool` is the pool of 20
// that PREREG.md registers: level 2's portfolio and the first of level 7's three
// mystery portfolios both come from it, "so on average they are equally hard".
// `finalPool` is level 7's other two portfolios, which the registration does not
// reach at all. Every value in the capstone pool - the strata, the 40% cap, the
// one hand-placed entry - is fixed in BUILD_LOG.md, session 2.10, with the
// measurements behind it, and was fixed before the pool was generated.
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

// ---- level 7's capstone pool. Every number here is fixed in BUILD_LOG.md ----

/** Another game seed, and deliberately neither 2026 nor the pool of 20's. */
export const FINAL_SEED = 23;
export const FINAL_SIZE = 20;
export const FINAL_MIN_HOLDINGS = 3;
export const FINAL_MAX_HOLDINGS = 8;

/**
 * The two bands level 7 draws its second and third portfolios from, one from
 * each. The gap between them - 3.60 - 1.40 = 2.20 - is above 2, so no single
 * number is within 1 of both, and the capstone cannot be passed without reading
 * the portfolios.
 */
export const LOW_STRATUM = { key: 'low', min: 1.00, max: 1.40, slots: 10 };
export const HIGH_STRATUM = { key: 'high', min: 3.60, max: 4.60, slots: 10 };
export const STRATA = [LOW_STRATUM, HIGH_STRATUM];

/**
 * The biggest holding may carry at most this share of the money.
 *
 * Effective bets rises when money is pushed into one holding with the holdings
 * unchanged - on five fixed names, moving one from $2,000 to $9,600 takes the
 * answer from 1.576 to 2.683. Without this cap some high-stratum portfolios
 * would earn their answer that way, and a player applying the game's own lesson
 * about spreading risk would be marked wrong for it. The number is the candidate
 * sample's own average, not a tuned one, and it applies to both strata equally.
 */
export const TOP_WEIGHT_CAP = 0.40;

/**
 * The one portfolio placed by hand rather than drawn: docs/PRD.md's own example,
 * and the sentence the game is named after. 8,000 candidate draws never built
 * it, and no pool-of-20 portfolio is this trio.
 */
export const HAND_PLACED = {
  dollars: { VOO: 3400, QQQ: 3300, NVDA: 3300 },
  stratum: 'low',
  handPlaced: true,
  handPlacedReason:
    "docs/PRD.md's own example - an S&P 500 fund, a tech fund and NVIDIA - which is "
    + 'the sentence the game is named after. Placed by hand because 8,000 candidate '
    + 'draws never built it and no pool-of-20 portfolio is this trio, so a drawn pool '
    + 'would almost certainly never show a player the case the game is named for.',
};

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

/**
 * The holdings set of a portfolio, as one comparable key. Two portfolios holding
 * the same names are the same design however the money is split, so this is what
 * the capstone pool checks against the pool of 20.
 */
export function designKey(tickers) {
  return [...tickers].sort().join(',');
}

/**
 * Generate level 7's capstone pool: 20 portfolios, 10 in each stratum, spread
 * evenly across each stratum's band.
 *
 * EVERY REJECTION IS COUNTED AND RETURNED, not dropped quietly. A flat Dirichlet
 * draw is lopsided by design - its largest weight averages about half - so the
 * 40% cap refuses a large share of candidates, and a caller who could not see
 * how large would not know whether the pool had been drawn from a wide field or
 * scraped out of a narrow one.
 */
export function buildFinalPool(built, universe, {
  seed = FINAL_SEED, candidates = 8000, pool20 = [], handPlaced = HAND_PLACED,
} = {}) {
  const rng = makeRng(seed);
  const pool20Keys = new Set(pool20.map((p) => designKey(Object.keys(p.dollars))));
  const inStratum = (bets, s) => bets >= s.min && bets <= s.max;

  const kept = new Map(STRATA.map((s) => [s.key, []]));
  const skipped = {
    noFund: 0, repeatedDesign: 0, duplicate: 0, tooLopsided: 0, tooFewDays: 0, outsideBothStrata: 0,
  };
  let drawn = 0;
  const seen = new Set();

  while (drawn < candidates) {
    const size = FINAL_MIN_HOLDINGS
      + Math.floor(rng.uniform() * (FINAL_MAX_HOLDINGS - FINAL_MIN_HOLDINGS + 1));
    const bag = [...universe];
    const tickers = [];
    while (tickers.length < size) {
      tickers.push(...bag.splice(Math.floor(rng.uniform() * bag.length), 1));
    }
    const key = designKey(tickers);
    // The draw itself is cheap; the covariance is not. So the three rejections
    // that need no prices are made first, and none of them counts as a candidate
    // drawn - a candidate is something that was actually measured.
    if (!tickers.some((t) => FUNDS.includes(t))) { skipped.noFund += 1; continue; }
    if (seen.has(key)) { skipped.duplicate += 1; continue; }
    if (pool20Keys.has(key)) { skipped.repeatedDesign += 1; continue; }
    seen.add(key);

    const dollars = splitDollars(rng, size);
    const weights = dollars.map((d) => d / TOTAL_DOLLARS);
    const topWeight = Math.max(...weights);
    drawn += 1;

    let measured;
    try {
      measured = betsFor(built, tickers, weights);
    } catch (error) {
      skipped.tooFewDays += 1;                 // not enough overlapping history
      continue;
    }
    const { bets, days } = measured;

    const stratum = STRATA.find((s) => inStratum(bets, s));
    if (!stratum) { skipped.outsideBothStrata += 1; continue; }
    // Checked AFTER the stratum, so the tally says how many portfolios the cap
    // cost inside the bands that matter rather than across the whole range.
    if (topWeight > TOP_WEIGHT_CAP) { skipped.tooLopsided += 1; continue; }

    kept.get(stratum.key).push({
      tickers,
      dollars: Object.fromEntries(tickers.map((t, i) => [t, dollars[i]])),
      bets,
      days,
      topWeight,
    });
  }

  // The hand-placed portfolio takes the slot nearest its own answer, and the
  // drawn candidates fill the rest. Measured here rather than trusted: a
  // hand-typed portfolio is exactly the kind that could drift outside the band
  // or the cap when the snapshot changes, and that must fail loudly.
  const placedTickers = Object.keys(handPlaced.dollars);
  const placedWeights = placedTickers.map((t) => handPlaced.dollars[t] / TOTAL_DOLLARS);
  const placedTop = Math.max(...placedWeights);
  const placedMeasured = betsFor(built, placedTickers, placedWeights);
  const placedStratum = STRATA.find((s) => s.key === handPlaced.stratum);
  if (!inStratum(placedMeasured.bets, placedStratum)) {
    throw new Error(
      `buildFinalPool: the hand-placed portfolio makes ${placedMeasured.bets.toFixed(3)} bets, `
      + `outside its own ${placedStratum.key} stratum of ${placedStratum.min} to ${placedStratum.max}`,
    );
  }
  if (placedTop > TOP_WEIGHT_CAP) {
    throw new Error(
      `buildFinalPool: the hand-placed portfolio puts ${(100 * placedTop).toFixed(0)}% in one `
      + `holding, over the ${(100 * TOP_WEIGHT_CAP).toFixed(0)}% cap every drawn portfolio keeps to`,
    );
  }
  const placed = {
    tickers: placedTickers,
    dollars: { ...handPlaced.dollars },
    bets: placedMeasured.bets,
    days: placedMeasured.days,
    topWeight: placedTop,
    handPlaced: true,
    handPlacedReason: handPlaced.handPlacedReason,
  };

  const chosen = [];
  for (const stratum of STRATA) {
    const pool = kept.get(stratum.key);
    const takenHere = placed.handPlaced && handPlaced.stratum === stratum.key ? 1 : 0;
    // One target per slot, evenly spaced across the stratum's own band, so the
    // ten answers span it rather than bunching wherever candidates were thickest.
    const targets = Array.from(
      { length: stratum.slots },
      (_, k) => stratum.min + ((k + 0.5) / stratum.slots) * (stratum.max - stratum.min),
    );
    let openTargets = targets;
    if (takenHere === 1) {
      // The hand-placed portfolio answers to one of the targets; drop the one it
      // is nearest so the remaining nine do not crowd it.
      let nearest = 0;
      for (let k = 1; k < targets.length; k += 1) {
        if (Math.abs(targets[k] - placed.bets) < Math.abs(targets[nearest] - placed.bets)) nearest = k;
      }
      openTargets = targets.filter((_, k) => k !== nearest);
      chosen.push({ ...placed, stratum: stratum.key });
    }
    if (pool.length < openTargets.length) {
      throw new Error(
        `buildFinalPool: the ${stratum.key} stratum needs ${openTargets.length} portfolios but only `
        + `${pool.length} candidates landed in ${stratum.min} to ${stratum.max} within the cap`,
      );
    }
    const used = new Set();
    for (const target of openTargets) {
      let best = null;
      for (let i = 0; i < pool.length; i += 1) {
        if (used.has(i)) continue;
        const distance = Math.abs(pool[i].bets - target);
        if (best === null || distance < best.distance) best = { i, distance };
      }
      used.add(best.i);
      chosen.push({ ...pool[best.i], stratum: stratum.key });
    }
  }

  chosen.sort((a, b) => a.bets - b.bets);
  const portfolios = chosen.map((entry, i) => ({
    id: `f${String(i + 1).padStart(2, '0')}`,
    stratum: entry.stratum,
    dollars: entry.dollars,
    expectedBets: entry.bets,
    ...(entry.handPlaced
      ? { handPlaced: true, handPlacedReason: entry.handPlacedReason }
      : {}),
  }));

  return { portfolios, skipped, drawn, candidatesKept: Object.fromEntries(
    STRATA.map((s) => [s.key, kept.get(s.key).length]),
  ) };
}

function reportFinal(result, levels) {
  const { portfolios, skipped, drawn, candidatesKept } = result;
  console.log(`Level 7's capstone pool: ${portfolios.length} portfolios, seed ${FINAL_SEED}, ${WINDOW_DAYS}-day window`);
  console.log(`${FINAL_MIN_HOLDINGS} to ${FINAL_MAX_HOLDINGS} holdings, biggest holding at most ${(100 * TOP_WEIGHT_CAP).toFixed(0)}% of the money.\n`);

  for (const stratum of STRATA) {
    const here = portfolios.filter((p) => p.stratum === stratum.key);
    console.log(`  ${stratum.key} stratum, ${stratum.min.toFixed(2)} to ${stratum.max.toFixed(2)} bets  (${here.length} of ${stratum.slots} slots filled, ${candidatesKept[stratum.key]} candidates to choose from)`);
    for (const p of here) {
      const holdings = Object.entries(p.dollars).map(([t, d]) => `${t} $${d}`).join(', ');
      console.log(`    ${p.id}  ${p.expectedBets.toFixed(3)} bets${p.handPlaced ? '  [hand-placed]' : '              '}  ${holdings}`);
    }
    console.log('');
  }

  // EVERY REJECTED DRAW IS SHOWN. A tally that was computed and not printed is a
  // tally nobody checks.
  const total = Object.values(skipped).reduce((a, b) => a + b, 0);
  console.log(`  ${drawn} candidates measured; ${total} draws rejected along the way:`);
  for (const [reason, count] of Object.entries(skipped)) {
    if (count > 0) console.log(`    ${String(count).padStart(5)}  ${reason}`);
  }

  const low = portfolios.filter((p) => p.stratum === 'low');
  const high = portfolios.filter((p) => p.stratum === 'high');
  const lowMax = Math.max(...low.map((p) => p.expectedBets));
  const highMin = Math.min(...high.map((p) => p.expectedBets));
  const gap = highMin - lowMax;
  console.log(`\n  The gap between the strata: ${highMin.toFixed(3)} - ${lowMax.toFixed(3)} = ${gap.toFixed(3)}`);
  console.log(`  ${gap > 2 ? 'Above 2, so no single guess is within 1 of both.' : 'AT OR BELOW 2 - a single guess could cover both. This pool must not be used.'}`);

  // The pool of 20 sits between the two strata, which is what makes the three
  // answers read low, middle and high.
  const pool20 = (levels.guessPool?.portfolios ?? []).map((p) => p.expectedBets);
  if (pool20.length > 0) {
    console.log(`  The pool of 20, for comparison: ${Math.min(...pool20).toFixed(3)} to ${Math.max(...pool20).toFixed(3)} bets.`);
  }
  console.log('  Educational, not investment advice.');
  return gap > 2;
}

function main() {
  const write = process.argv.includes('--write');
  const final = process.argv.includes('--final');
  const snapshot = JSON.parse(readFileSync(path('data/prices.json'), 'utf8'));
  const tickers = JSON.parse(readFileSync(path('tickers.json'), 'utf8'));
  const levelsPath = path('levels.json');
  const levels = JSON.parse(readFileSync(levelsPath, 'utf8'));
  const built = buildReturns(snapshot);
  const universe = universeFrom(tickers);

  if (final) {
    const result = buildFinalPool(built, universe, {
      pool20: levels.guessPool?.portfolios ?? [],
    });
    const safe = reportFinal(result, levels);
    if (!safe) {
      console.error('\nThe strata overlap within 1 bet. Nothing written.');
      process.exitCode = 1;
      return;
    }
    if (!write) {
      console.log('\n(nothing written - pass --write to put this in levels.json)');
      return;
    }
    levels.finalPool = {
      ...levels.finalPool,
      size: FINAL_SIZE,
      note:
        "Level 7's second and third mystery portfolios, one drawn from each stratum. "
        + 'PREREG.md does not reach this pool: Hypothesis 3 covers only the FIRST mystery '
        + 'portfolio, which comes from guessPool. See BUILD_LOG.md, session 2.10.',
      seed: FINAL_SEED,
      seedNote: 'A game seed, and deliberately neither 2026 nor the pool of 20\'s seed.',
      generatedBy: 'scripts/make_pool.mjs --final',
      window: { days: WINDOW_DAYS, minDays: MIN_DAYS },
      holdings: { min: FINAL_MIN_HOLDINGS, max: FINAL_MAX_HOLDINGS },
      topWeightCap: TOP_WEIGHT_CAP,
      topWeightCapNote:
        'The biggest holding carries at most this share of the money. Effective bets rises '
        + 'when money is pushed into one holding with the holdings unchanged, so without this '
        + 'cap a portfolio could earn a high answer through concentration - and a player '
        + 'applying the game\'s own lesson about spreading risk would be marked wrong for it.',
      strata: STRATA.map((s) => ({ key: s.key, min: s.min, max: s.max, slots: s.slots })),
      strataNote:
        'Portfolio 2 is drawn from one stratum and portfolio 3 from the other. The gap '
        + 'between the bands is above 2 bets, so no single number is within 1 of both and '
        + 'the capstone cannot be passed without reading the portfolios.',
      expectedBetsNote:
        'Computed from the committed data/prices.json when the pool was generated. The game '
        + 'recomputes it at play time; a test holds the two to 1e-9.',
      portfolios: result.portfolios,
    };
    writeFileSync(levelsPath, `${JSON.stringify(levels, null, 2)}\n`);
    console.log(`\nWrote ${result.portfolios.length} portfolios into levels.json as finalPool`);
    return;
  }

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
