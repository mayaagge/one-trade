// scripts/check_pass_bar.mjs - what level 1's pass bar asks for, over every pair
// the game can offer, and what every other level's bar asks for beside it.
//
//   node scripts/check_pass_bar.mjs
//   node scripts/check_pass_bar.mjs --prices data/prices.json
//
// THE LIVE WINDOW BY DEFAULT, which is the opposite of
// scripts/calibrate_bands.mjs's default and deliberately so. A pass bar is a
// question about the market a player is actually playing on, and that is
// data/live_prices.json, the file the weekday refresh fetches and
// data/game.json is built from. The frozen snapshot is there for reproducing a
// published verdict; this is not one.
//
// NOTHING IS WRITTEN TO DISK. Same reason as the other two calibration
// scripts: a number reaches docs/PRD.md because a person put it there.
//
// WHY A PASS BAR NEEDS CHECKING AT ALL. docs/PRD.md's known weakness 3: "Live
// data moves the goalposts. A design that passes a level today may fail next
// month." scripts/check_levels.mjs answers "can this still be passed three
// ways", which is the floor. This answers the question above it - what share of
// everything on offer clears the bar, and so whether passing means anything.
//
// Educational, not investment advice.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildReturns } from '../js/returns.js';
import { validateCrashes } from '../js/crash.js';
import { correlation } from '../js/math.js';
import { levelById, validateLevels } from '../js/levels.js';
import { WINDOW_DAYS, MIN_DAYS } from './make_pool.mjs';
import {
  checkLevel1, checkLevel3, checkLevel4, checkLevel5, checkLevel6, checkLevel7,
} from './check_levels.mjs';
// Level 2 has no design to pass or fail - every guess passes - so it has no
// checkLevel2 of that shape to import, and the table says so in words.

const root = new URL('..', import.meta.url);
const path = (name) => fileURLToPath(new URL(name, root));
const read = (name) => JSON.parse(readFileSync(path(name), 'utf8'));

/**
 * The bars this report scores level 1 at.
 *
 * 0.80 is what is registered. 0.70 is what the game calls "the same bet"
 * everywhere it asks the question. 0.75 is the midpoint, and it is here only so
 * that the two that mean something are not the only two on the page - a table
 * of exactly the current value and exactly the proposed one invites reading the
 * gap as a trend.
 */
export const CANDIDATE_BARS = [0.70, 0.75, 0.80];

/**
 * THE RULE FOR THE BAR, STATED BEFORE THE NUMBERS BELOW ARE LOOKED AT.
 *
 * Level 1's pass condition, in the words of its own challenge line, is "pick
 * two holdings with different names that move together". The game already
 * defines "move together": **0.70 and above is the same bet** - in the daily
 * "Same bet?" puzzle, and in level 1's own three buckets, which are the
 * puzzle's. So the bar is that number.
 *
 * WHAT MAKES THIS A RULE AND NOT A PREFERENCE. It is fixed by the game's
 * existing vocabulary rather than by any property of today's prices, so it
 * gives the same answer whatever this script prints. docs/PRD.md asks exactly
 * this of every value it fixes: "either a number the game already uses
 * elsewhere or the level's own pass threshold". A bar of 0.80 meets that test
 * no better than 0.70 does - it is not a number the game uses anywhere else -
 * and it asks for something stricter than the game's own definition of the
 * thing the level is about, without naming what that stricter thing is.
 *
 * THE SHARES BELOW DO NOT CHOOSE THE BAR. They are a sanity check on it: a bar
 * that nearly every pair clears is not a pass condition, and one that almost
 * none clears is a wall. If 0.70 turned out to be either, the right move would
 * be to say so and leave the bar at 0.80, not to search the column for a
 * number that looks comfortable.
 */
export const BAR_RULE = {
  bar: 0.70,
  why: 'the floor of the "same bet" bucket, which the daily puzzle and level 1\'s own '
    + 'buckets already use for exactly this question',
};

/** A pass share this low makes a level a wall; this high makes it not a test. */
export const SANITY = { floor: 0.01, ceiling: 0.50 };

// ------------------------------------------------------------------- pairs

/**
 * Every pair of playable tickers, with its correlation over the game's window.
 *
 * EVERY PAIR, not level 1's pool of 14. The pool is a curated 14 and the
 * question here is what the BAR asks of the market as a whole - 780 pairs from
 * 40 tickers - so that a later decision to widen the pool does not need this
 * work done again. Pairs the window cannot measure are counted and named
 * rather than dropped: see BUILD_LOG.md on the 49 of 400 a silent catch once
 * hid.
 */
export function allPairs(built, universe) {
  const pairs = [];
  const skipped = [];
  for (let i = 0; i < universe.length; i += 1) {
    for (let j = i + 1; j < universe.length; j += 1) {
      const tickers = [universe[i], universe[j]];
      const window = built.commonWindow(tickers, WINDOW_DAYS);
      if (window.days < MIN_DAYS) {
        skipped.push({ tickers, days: window.days });
        continue;
      }
      const rows = Array.from(
        { length: window.days },
        (_, t) => tickers.map((x) => window.byTicker[x][t]),
      );
      pairs.push({ tickers, value: correlation(rows)[0][1], days: window.days });
    }
  }
  pairs.sort((a, b) => b.value - a.value);
  return { pairs, skipped, considered: pairs.length + skipped.length };
}

/** The share of pairs at or above a bar, with the count behind it. */
export function shareAtOrAbove(pairs, bar) {
  const count = pairs.filter((pair) => pair.value >= bar).length;
  return { bar, count, of: pairs.length, share: pairs.length === 0 ? null : count / pairs.length };
}

/**
 * Does this bar sit ON one of the level's bucket edges?
 *
 * WHY IT MATTERS, and it is the whole of session 2.40's finding: stars are
 * only awarded to a portfolio that passed, so if the bar is a bucket edge then
 * every passing answer lands in the same bucket and "naming the right bucket"
 * stops being a judgement at all. It also becomes asymmetric - a guess the
 * wrong side of the edge is punished and the same error the other way is not.
 * Levels 4, 5 and 6 were amended for exactly this on 27 November 2026. Level 1
 * was examined and left alone BECAUSE its bar of 0.80 sits above its top edge
 * of 0.70. Move the bar to 0.70 and that reason expires with it.
 */
export function barIsBucketEdge(level, bar) {
  const edges = (level.buckets ?? [])
    .map((bucket) => bucket.min)
    .filter((min) => min !== null && min > -1);
  return { edges, onEdge: edges.some((edge) => Math.abs(edge - bar) <= 1e-9) };
}

// ----------------------------------------------------------------- printing

const pct = (x) => (x === null ? '  -  ' : `${(100 * x).toFixed(1)}%`);
const f4 = (x) => x.toFixed(4);

function main(argv = []) {
  let pricesPath = 'data/live_prices.json';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--prices') { pricesPath = argv[i + 1]; i += 1; } else {
      throw new Error(`check_pass_bar: unknown argument ${argv[i]}`);
    }
  }

  const levels = validateLevels(read('levels.json'));
  const tickersFile = read('tickers.json');
  const basket = read('basket.json').stocks.map((stock) => stock.ticker);
  const crashes = validateCrashes(read('data/crashes.json'));
  const built = buildReturns(read(pricesPath));
  const universe = tickersFile.groups
    .flatMap((group) => group.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
  const groupOf = new Map();
  for (const group of tickersFile.groups) {
    for (const ticker of group.tickers) {
      groupOf.set(typeof ticker === 'string' ? ticker : ticker.ticker, group.key);
    }
  }

  const one = levelById(levels, 1);
  console.log('One Trade - level 1\'s pass bar, and every level\'s pass rate');
  console.log(`Prices ${pricesPath}; ${WINDOW_DAYS}-day windows, ${MIN_DAYS} days minimum.`);
  console.log(`The bar in levels.json: ${one.pass.says}.`);
  console.log('It was "a correlation of 0.80 or more" until 27 November 2026; docs/PRD.md\'s');
  console.log('second band amendment says why it moved and keeps the old number visible.');

  console.log('\n--- the rule, stated before the numbers ------------------------');
  console.log(`  The bar is ${f4(BAR_RULE.bar)}: ${BAR_RULE.why}.`);
  console.log('  The shares below check that rule rather than choose it. A bar almost every');
  console.log(`  pair clears (over ${pct(SANITY.ceiling)}) is not a pass condition; one almost none clears`);
  console.log(`  (under ${pct(SANITY.floor)}) is a wall.`);

  // ------------------------------------------------------------ the pairs
  const { pairs, skipped, considered } = allPairs(built, universe);
  console.log('\n--- every pair the game can offer -----------------------------');
  console.log(`  ${universe.length} playable tickers, ${considered} pairs`);
  console.log(`  measured  ${pairs.length}`);
  if (skipped.length > 0) {
    console.log(`  set aside ${skipped.length} - fewer than ${MIN_DAYS} overlapping days:`);
    for (const s of skipped) console.log(`    ${s.tickers.join(' / ')} - ${s.days} days`);
  } else {
    console.log('  set aside 0');
  }

  console.log('\n  bar     pairs at or above it   share   verdict on the bar');
  for (const bar of CANDIDATE_BARS) {
    const { count, share } = shareAtOrAbove(pairs, bar);
    const verdict = share > SANITY.ceiling ? 'too loose - not a test'
      : share < SANITY.floor ? 'too tight - a wall'
        : 'a pass condition with something to find';
    const isRule = Math.abs(bar - BAR_RULE.bar) <= 1e-9;
    const isCurrent = Math.abs(bar - one.pass.threshold) <= 1e-9;
    const mark = isRule && isCurrent ? ' <- the rule, and the bar in levels.json'
      : isRule ? ' <- the rule' : isCurrent ? ' <- the bar in levels.json now' : '';
    console.log(`  ${f4(bar)}  ${String(count).padStart(8)} of ${pairs.length}        `
      + `${pct(share).padStart(6)}   ${verdict}${mark}`);
  }

  // How many DISTINCT holdings a passing pair can be built from, which is what
  // a player actually needs: one pair is one design.
  for (const bar of CANDIDATE_BARS) {
    const passing = pairs.filter((pair) => pair.value >= bar);
    const names = new Set(passing.flatMap((pair) => pair.tickers));
    console.log(`  at ${f4(bar)}: ${passing.length} passing pairs across ${names.size} different holdings`);
  }

  console.log('\n  the ten closest pairs in the game:');
  for (const pair of pairs.slice(0, 10)) {
    console.log(`    ${f4(pair.value)}  ${pair.tickers.join(' / ')}`
      + `  (${groupOf.get(pair.tickers[0])} / ${groupOf.get(pair.tickers[1])})`);
  }

  // Level 1's own pool, which is what a player is offered today.
  const inPool = pairs.filter((pair) => pair.tickers.every((t) => one.pool.includes(t)));
  console.log(`\n  level 1's pool of ${one.pool.length} on its own: ${inPool.length} pairs`);
  for (const bar of CANDIDATE_BARS) {
    const { count, share } = shareAtOrAbove(inPool, bar);
    console.log(`    at ${f4(bar)}: ${count} of ${inPool.length} pass (${pct(share)})`);
  }

  // ------------------------------------------------- the conditional rule
  console.log('\n--- if the bar becomes a bucket edge --------------------------');
  const { edges, onEdge } = barIsBucketEdge(one, BAR_RULE.bar);
  console.log(`  level 1's bucket edges: ${edges.join(', ')}`);
  console.log(`  the rule's bar of ${f4(BAR_RULE.bar)} ${onEdge ? 'IS' : 'is NOT'} one of them.`);
  if (onEdge) {
    console.log('  So level 1 acquires the defect docs/PRD.md amended levels 4, 5 and 6 for:');
    console.log('  every passing answer would sit in the "same bet" bucket, and the second');
    console.log('  star would be asking which side of the bar a guess fell on rather than');
    console.log('  how close it was. Its two-star band therefore has to become a distance,');
    console.log(`  twice its own three-star band: within ${f4(one.stars.three.of * 2)} of the real correlation.`);
    console.log(`  It is currently "${one.stars.two.says}" (test: ${one.stars.two.test}).`);
  }

  // ------------------------------------------------------- every level's rate
  console.log('\n--- every level\'s pass rate ----------------------------------');
  console.log('  On the same design samples scripts/check_levels.mjs draws. Level 1 is its');
  console.log("  own pool of 14 here, not all 780, so it is comparable with the others.");
  const rates = [
    ['1. Two of a kind', checkLevel1(built, one), one.pass.says],
    ['3. Three real bets', checkLevel3(built, levelById(levels, 3), universe, groupOf),
      levelById(levels, 3).pass.says],
    ['4. Hidden AI', checkLevel4(built, levelById(levels, 4), universe, basket),
      levelById(levels, 4).pass.says],
    ['5. Where\'s the risk?', checkLevel5(built, levelById(levels, 5), universe),
      levelById(levels, 5).pass.says],
    ['6. Crash test', checkLevel6(crashes, levelById(levels, 6), levels, universe),
      levelById(levels, 6).pass.says],
  ];
  console.log('\n  level                  passing / considered     rate   the bar');
  for (const [name, out, says] of rates) {
    const rate = out.considered === 0 ? null : out.winners.length / out.considered;
    console.log(`  ${name.padEnd(22)} ${String(out.winners.length).padStart(6)} / `
      + `${String(out.considered).padEnd(6)}  ${pct(rate).padStart(7)}   ${says}`);
  }
  console.log(`  ${'2. How many bets?'.padEnd(22)} ${'every'.padStart(6)} / `
    + `${'guess'.padEnd(6)}  ${'100.0%'.padStart(7)}   ${levelById(levels, 2).pass.says}`);
  const seven = checkLevel7(built, levelById(levels, 7), levels.guessPool, levels.finalPool);
  console.log(`  ${'7. One trade'.padEnd(22)} ${'see'.padStart(6)} / ${'below'.padEnd(6)}`
    + `  ${'-'.padStart(7)}   ${levelById(levels, 7).pass.says}`);
  console.log('    level 7 turns on three guesses, not a design: the check that matters is');
  console.log('    that no single guess covers all three, and the gap between the low and');
  console.log(`    high strata is ${seven.gap.toFixed(3)} bets over ${seven.considered} triples.`);

  console.log('\nEducational, not investment advice.');
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));

export { main };
