// scripts/calibrate_bands.mjs - what the star bands do to a realistic guess, and
// what they would do if the two-star band were a distance instead of a bucket.
//
//   node scripts/calibrate_bands.mjs
//   node scripts/calibrate_bands.mjs --prices data/game.json
//
// WHY THIS EXISTS. Playtest feedback said close guesses in the wrong bucket
// were punished too hard (BUILD_LOG.md, player feedback 4). A band cannot be
// judged from its own number: 0.05 is generous on one scale and absurd on
// another, and what decides it is where the achievable ANSWERS sit. So this
// reads the answers out of scripts/check_levels.mjs's own design sample - the
// same 1,200 draws per level the solvability check uses, on the same seed - and
// scores a ladder of guess errors against them.
//
// NOTHING IS WRITTEN TO DISK, deliberately, and this is the pattern
// scripts/calibrate_threshold.mjs already set: the numbers go into docs/PRD.md
// by hand, so a person decides to publish them.
//
// IT PROVES NOTHING ABOUT PLAYERS. No guess on levels 1, 4, 5 or 6 has ever
// been recorded - the Worker accepts levels 2 and 7 only - so "realistic guess"
// here means an error of a given size against a real answer, not an error any
// player was observed to make. That is a weaker thing and the report says so.
//
// Educational, not investment advice.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildReturns } from '../js/returns.js';
import { validateCrashes } from '../js/crash.js';
import { bucketOf, levelById, passes, starsFor, validateLevels } from '../js/levels.js';
import {
  CHECK_SEED, SAMPLES, LEVEL6_BUILDS,
  checkLevel1, checkLevel3, checkLevel4, checkLevel5, checkLevel6Builds,
} from './check_levels.mjs';

const root = new URL('..', import.meta.url);
const path = (name) => fileURLToPath(new URL(name, root));
const read = (name) => JSON.parse(readFileSync(path(name), 'utf8'));

/**
 * The multiple of a level's three-star band that the two-star band would
 * become.
 *
 * TWO, AND IT IS NOT A NEW NUMBER. Levels 2 and 3 already score a bets count
 * with "within 1 bet" for two stars and "within half a bet" for three - a
 * factor of two, registered since the levels were built. Every level below
 * keeps its own three-star band exactly as registered and takes twice it for
 * two, so no distance in this game is invented here and no bucket edge moves.
 */
export const TWO_STAR_MULTIPLE = 2;

/**
 * The guess errors the ladder below is scored at, as multiples of the
 * three-star band.
 *
 * FINE AROUND 1, because that is where the verdict turns: a guess just inside
 * the three-star band scores three stars whichever bucket it lands in, and a
 * guess just outside it falls to one or two depending on the direction. A
 * ladder that stepped straight from 0.5 to 2 would jump over the whole
 * question. On level 5, whose band is 5 points, these are errors of 2, 4, 5,
 * 6, 8, 10, 15 and 20 points.
 */
export const ERROR_LADDER = [0.4, 0.8, 1, 1.2, 1.6, 2, 3, 4];

// ------------------------------------------------------------------ shaping

function quantile(sorted, p) {
  if (sorted.length === 0) return null;
  const at = Math.round(p * (sorted.length - 1));
  return sorted[Math.min(sorted.length - 1, Math.max(0, at))];
}

export function spread(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0] ?? null,
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1] ?? null,
  };
}

/** A level's bucket edges, lowest-bucket `null` dropped - it is not an edge. */
export function edgesOf(level) {
  return (level.buckets ?? []).map((bucket) => bucket.min).filter((min) => min !== null && min > -1);
}

/**
 * The levels whose second star was registered as "the right bucket".
 *
 * WRITTEN DOWN HERE BECAUSE THE FILE NO LONGER SAYS IT. levels.json carries
 * today's rules, so once the amendment shipped there was nothing left in the
 * repository to compute the before column from - and a before/after table that
 * reads both columns out of the current file shows no difference at all, which
 * is what the first run of this script did. These four are the registered rule
 * as docs/PRD.md's amendment of 27 November 2026 quotes it, and they are
 * frozen history: nothing should ever edit this list.
 */
export const REGISTERED_BUCKET_LEVELS = new Set([1, 4, 5, 6]);

/**
 * The levels the amendment actually moved - a subset, decided by this report.
 *
 * LEVEL 1 KEPT ITS BUCKET, and the sweep below is why. None of its passing
 * answers sits within the three-star band of an edge (0 of 8), so its bucket
 * test is a real judgement with room either side rather than a coin flip on
 * which side of a threshold a near-perfect guess fell. Moving it would have
 * changed 5 of the 201 guesses its slider offers and every one of them
 * DOWNWARDS: a player who said 0.72 about a pair correlating 0.95 named the
 * right bucket - "these are the same bet", which is the whole lesson of level
 * 1 - and would have lost the star for it. A change asked for because stars
 * were too harsh should not make a level harsher.
 */
export const AMENDED_LEVELS = new Set([4, 5, 6]);

/**
 * Stars under the bands as registered, and under the rules in levels.json now,
 * for one (answer, guess) pair.
 *
 * THE "NOW" SIDE CALLS js/levels.js's OWN starsFor(), not a copy of it, so this
 * report cannot disagree with the game about what it currently awards. The
 * "registered" side is computed here, from the rule the amendment quotes: 1
 * star for passing, 2 for landing in the answer's bucket, 3 for the level's own
 * three-star distance - which is the one band the amendment did not move, so it
 * is still read from the file.
 */
export function scorePair(level, { actual, guess }) {
  const passed = passes(level, actual);
  const now = starsFor(level, { guess, actual, passed });

  const band = level.stars.three.of;
  const error = Math.abs(guess - actual);
  let registered = 0;
  if (passed) {
    registered = level.stars.pass;
    if (REGISTERED_BUCKET_LEVELS.has(level.id)
      && bucketOf(level, guess) === bucketOf(level, actual)) registered = 2;
    if (error <= band + 1e-9) registered = 3;
  }
  return { passed, old: registered, proposed: now, error };
}

// ----------------------------------------------------------------- printing

const f4 = (x) => (x === null ? '  -  ' : x.toFixed(4));
const pct = (x) => `${(100 * x).toFixed(0)}%`;

function bucketCounts(level, winners) {
  const counts = {};
  for (const winner of winners) {
    const key = bucketOf(level, winner.value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Where a level's achievable answers sit, and how that interacts with its own
 * bucket edges.
 *
 * THE LINE THAT MATTERS is the last one: the share of passing answers sitting
 * within the three-star band of a bucket edge. On such an answer the two-star
 * bucket test is decided by which side of the edge a near-perfect guess landed
 * on, which is not a thing the level set out to measure.
 */
function reportDistribution(level, winners, { considered, skipped }) {
  const values = winners.map((w) => w.value);
  const s = spread(values);
  const band = level.stars.three.of;
  const edges = edgesOf(level);

  console.log(`\n--- Level ${level.id}: ${level.title} -------------------------------`);
  console.log(`  pass rule            ${level.pass.says}`);
  console.log(`  designs considered   ${considered}`);
  for (const [why, count] of Object.entries(skipped)) {
    console.log(`    set aside          ${count} - ${why}`);
  }
  console.log(`  passing designs      ${s.n}`);
  if (s.n === 0) {
    console.log('  NO PASSING DESIGN - nothing to calibrate against.');
    return s;
  }
  console.log(`  answers              ${f4(s.min)} .. ${f4(s.max)}   median ${f4(s.median)}`);
  console.log(`  middle half          ${f4(s.p25)} .. ${f4(s.p75)}   (width ${f4(s.p75 - s.p25)})`);
  console.log(`  three-star band      ${band}  (kept as registered)`);
  console.log(`  two-star band        ${band} x ${TWO_STAR_MULTIPLE} = ${band * TWO_STAR_MULTIPLE}  (proposed)`);

  if (edges.length > 0) {
    console.log(`  bucket edges         ${edges.join(', ')}`);
    console.log(`  passing answers by bucket  ${JSON.stringify(bucketCounts(level, winners))}`);
    const toEdge = values.map((v) => Math.min(...edges.map((e) => Math.abs(v - e))));
    const d = spread(toEdge);
    console.log(`  distance to nearest edge   median ${f4(d.median)}   lowest quarter under ${f4(d.p25)}`);
    const hugging = toEdge.filter((x) => x <= band + 1e-9).length;
    console.log(`  answers within the three-star band of an edge  ${hugging} of ${d.n} (${pct(hugging / d.n)})`);
  }
  return s;
}

/**
 * The same guess error, high and low, scored both ways.
 *
 * THE ASYMMETRY IS THE FINDING. On a level whose pass threshold IS a bucket
 * edge, every passing answer sits just inside that edge, so an error upwards
 * crosses it and the same error downwards does not. Two players equally wrong
 * in opposite directions are given different stars, and the direction that is
 * punished is the one a beginner is more likely to take - guessing that more of
 * the risk is concentrated than really is.
 */
function reportLadder(level, answer) {
  const band = level.stars.three.of;
  console.log(`\n  A passing portfolio whose real answer is ${f4(answer)}:`);
  console.log('    guess      error     old    new   what changed');
  const rows = [];
  for (const multiple of ERROR_LADDER) {
    for (const direction of [1, -1]) {
      const guess = answer + direction * band * multiple;
      if (guess < level.guess.min - 1e-9 || guess > level.guess.max + 1e-9) continue;
      const { old, proposed } = scorePair(level, { actual: answer, guess });
      const note = proposed === old ? '' : `${old} -> ${proposed} stars`;
      rows.push({ guess, error: direction * band * multiple, old, proposed, note });
    }
  }
  rows.sort((a, b) => a.guess - b.guess);
  for (const row of rows) {
    const signed = `${row.error > 0 ? '+' : ''}${row.error.toFixed(4)}`;
    console.log(`    ${f4(row.guess)}   ${signed.padStart(8)}   ${String(row.old).padStart(4)}   `
      + `${String(row.proposed).padStart(4)}   ${row.note}`);
  }
  return rows;
}

/**
 * Everything the report says about one level, as data.
 *
 * SEPARATED FROM THE PRINTING so tests/calibrateBands.test.js can hold
 * docs/PRD.md's quoted figures - the 85%, the median of 0.3302, the 0 of 8 on
 * level 1 - to the frozen snapshot they were read from. An amendment that
 * quotes numbers should fail a test when they stop being true, rather than
 * wait for somebody to re-run a script and notice.
 */
export function analyseLevel(level, winners) {
  const values = winners.map((w) => w.value);
  const s = spread(values);
  if (s.n === 0) return { level, spread: s, edges: [], hugging: null, sweep: null };
  const band = level.stars.three.of;
  const edges = edgesOf(level);
  const toEdge = values.map((v) => Math.min(...edges.map((e) => Math.abs(v - e))));
  return {
    level,
    spread: s,
    edges,
    buckets: edges.length === 0 ? null : bucketCounts(level, winners),
    hugging: edges.length === 0 ? null : {
      count: toEdge.filter((x) => x <= band + 1e-9).length,
      of: toEdge.length,
      distance: spread(toEdge),
    },
    sweep: edges.length === 0 ? null : sweepLevel(level, s.median),
  };
}

/**
 * Every guess the slider can produce against one answer, scored under the
 * registered rule and under today's.
 *
 * EXHAUSTIVE, NOT SAMPLED, and that is the point of it. The ladder above steps
 * through errors chosen as multiples of the band, and on level 1 it stepped
 * clean over the only window where the two rules disagree - errors between
 * 0.2000 and 0.2483, where the registered bucket gives two stars and a
 * distance band would give one. A report with only the ladder would have said
 * "nothing changes on level 1", which is false, and level 1 was then KEPT on
 * its bucket because of that window. The slider is a discrete control with a
 * step, so there is no need to sample it: 201 guesses on level 1, 76 on level
 * 5. BUILD_LOG.md has the longer version of this - a named case beats a random
 * sample, and here an exhaustive sweep beats both.
 */
export function sweepLevel(level, answer) {
  const { min, max, step } = level.guess;
  const rows = [];
  for (let i = 0; ; i += 1) {
    const guess = Number((min + i * step).toFixed(6));
    if (guess > max + 1e-9) break;
    const { old, proposed } = scorePair(level, { actual: answer, guess });
    rows.push({ guess, old, proposed, error: guess - answer });
  }
  const changed = rows.filter((row) => row.old !== row.proposed);
  return {
    answer,
    total: rows.length,
    changed,
    gained: changed.filter((row) => row.proposed > row.old),
    lost: changed.filter((row) => row.proposed < row.old),
  };
}

/** sweepLevel()'s answer, printed. */
function reportSweep(level, answer) {
  const sweep = sweepLevel(level, answer);
  console.log(`\n  Every guess the slider offers against that answer: ${sweep.total} of them,`);
  console.log(`  ${sweep.changed.length} scored differently.`);
  for (const [label, hit] of [['gains a star', sweep.gained], ['loses a star', sweep.lost]]) {
    if (hit.length === 0) {
      console.log(`    ${label}: none`);
      continue;
    }
    const lo = Math.min(...hit.map((r) => r.guess));
    const hi = Math.max(...hit.map((r) => r.guess));
    const errLo = Math.min(...hit.map((r) => Math.abs(r.error)));
    const errHi = Math.max(...hit.map((r) => Math.abs(r.error)));
    console.log(`    ${label}: ${hit.length} guesses, ${f4(lo)} to ${f4(hi)} `
      + `(errors of ${f4(errLo)} to ${f4(errHi)})`);
  }
  return sweep;
}

// -------------------------------------------------------------------- main

function main(argv = []) {
  let pricesPath = 'data/prices.json';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--prices') { pricesPath = argv[i + 1]; i += 1; } else {
      throw new Error(`calibrate_bands: unknown argument ${argv[i]}`);
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

  console.log('One Trade - star band calibration');
  console.log(`Prices ${pricesPath}; design sample from scripts/check_levels.mjs, seed ${CHECK_SEED}, `
    + `${SAMPLES} draws per sampled level.`);
  console.log('"was" is the registered rule - 1 for passing, 2 for the answer\'s own bucket, 3 for');
  console.log('the level\'s distance. "now" is what js/levels.js awards from levels.json today.');
  console.log('Every three-star band is unchanged; only the two-star band moved, to twice it.');
  console.log('\nNO PLAYER GUESS IS IN THIS REPORT. Levels 1, 4, 5 and 6 send no guess record,');
  console.log('so "a realistic guess" below means an error of a stated size against a real');
  console.log('answer - not an error anybody was seen to make.');

  // ONE ENTRY PER LEVEL, each with what its sample set aside and why. A draw
  // dropped in silence is how a threshold table goes quietly wrong: see
  // BUILD_LOG.md on the 49 of 400 that a bare catch once hid.
  const sampled = [
    {
      level: levelById(levels, 1),
      run: () => {
        const out = checkLevel1(built, levelById(levels, 1));
        return { ...out, skipped: { 'duplicate or short-window pairs (the pool is enumerated, not drawn)': 0 } };
      },
    },
    {
      level: levelById(levels, 3),
      run: () => {
        const level = levelById(levels, 3);
        const out = checkLevel3(built, level, universe, groupOf);
        return { ...out, skipped: { 'repeat draws of a set already scored': SAMPLES - out.considered } };
      },
    },
    {
      level: levelById(levels, 4),
      run: () => {
        const level = levelById(levels, 4);
        const out = checkLevel4(built, level, universe, basket);
        return { ...out, skipped: { 'repeat draws, or too few overlapping days': SAMPLES - out.considered } };
      },
    },
    {
      level: levelById(levels, 5),
      run: () => {
        const level = levelById(levels, 5);
        const out = checkLevel5(built, level, universe);
        return { ...out, skipped: { 'repeat draws, or too few overlapping days': SAMPLES - out.considered } };
      },
    },
    {
      level: levelById(levels, 6),
      run: () => {
        const level = levelById(levels, 6);
        const rows = checkLevel6Builds(crashes, level, LEVEL6_BUILDS);
        return {
          considered: rows.length,
          winners: rows.filter((row) => row.passed),
          skipped: { 'none - these are named builds, not a sample': 0 },
        };
      },
    },
  ];

  const summary = [];
  for (const { level, run } of sampled) {
    const out = run();
    const s = reportDistribution(level, out.winners, {
      considered: out.considered,
      skipped: out.skipped,
    });
    if (s.n === 0) continue;
    if (Array.isArray(level.buckets)) {
      const rows = reportLadder(level, s.median);
      const sweep = reportSweep(level, s.median);
      const changed = rows.filter((row) => row.proposed !== row.old);
      changed.sweep = sweep;
      summary.push({
        level,
        median: s.median,
        changed: changed.length,
        rows: rows.length,
        gained: changed.filter((row) => row.proposed > row.old),
        lost: changed.filter((row) => row.proposed < row.old),
        sweep: changed.sweep,
      });
    } else {
      console.log('\n  No buckets on this level: its two-star band is already a distance,');
      console.log('  and nothing about it changes. It is here as the comparison the');
      console.log("  proposal copies - 'within 1 bet' is twice 'within half a bet'.");
    }
  }

  console.log('\n--- what moves -------------------------------------------------');
  console.log('  GENTLER AND STRICTER BOTH, and the report says which rather than only');
  console.log('  the half that was asked for. A guess near the answer gains, because the');
  console.log('  bucket it landed in no longer decides it. A guess far from the answer on');
  console.log('  the passing side loses, because the old rule gave it two stars for being');
  console.log('  in the same bucket however far out it was.');
  for (const row of summary) {
    const gained = row.gained.map((r) => r.error.toFixed(4));
    const lost = row.lost.map((r) => r.error.toFixed(4));
    console.log(`\n  Level ${row.level.id}: ${row.changed} of ${row.rows} ladder guesses change,`);
    console.log(`    and ${row.sweep.changed.length} of the ${row.sweep.total} guesses its slider can produce`);
    console.log(`    gain a star at errors of  ${gained.length ? gained.join(', ') : 'none (on the ladder)'}`);
    console.log(`    lose a star at errors of  ${lost.length ? lost.join(', ') : 'none (on the ladder)'}`);
  }
  console.log('\nEducational, not investment advice.');
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));

export { main };
