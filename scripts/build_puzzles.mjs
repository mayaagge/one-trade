// scripts/build_puzzles.mjs - build the daily "Same bet?" puzzle, one entry per date.
//
// WHAT THIS IS FOR. docs/PRD.md, Feature roadmap Tier 1: "Five ticker pairs a
// day, the same for every player, picked from the date." Two words there do the
// work - SAME and DAY - and together they rule out computing the puzzle in the
// browser.
//
// WHY NOT COMPUTE IT IN THE BROWSER. data/game.json is rebuilt every weekday
// evening, so a correlation computed in the browser moves under the player's
// feet. It moves for a second reason too: docs/PRD.md, "The committed price
// snapshot is the reference data", records that Yahoo's adjusted closes are not
// reproducible between fetches, by up to 1.2e-6 relative on dividend payers.
// That is far too small to move a verdict and quite large enough to flip a pair
// sitting near a bucket edge from "partly" to "the same bet" overnight - for the
// SAME date, after someone had already answered it. So a day's puzzle is
// computed once, written to data/puzzles.json, and never recomputed.
//
// THE FREEZE RULE, which tests/puzzles.test.js enforces against git:
//
//   An entry may be written or rewritten only while its date is still in the
//   future. From the moment its date arrives it is frozen, because somebody is
//   playing it.
//
// Stated as a check on a change: every entry that differs from the previous
// committed version must be dated AFTER the New York date of the version doing
// the changing - the commit's own date, or the clock when the change is still
// uncommitted. Reading the boundary off the PARENT's date instead would leave
// today unguarded: Wednesday evening's build has Tuesday's commit as its
// parent, and could rewrite Wednesday's entry while Wednesday is being played.
//
// WHAT IT WRITES, AND ONLY THIS: data/puzzles.json. It reads data/game.json and
// never a price file, so it cannot reach the frozen research snapshot at all.
//
// WHERE THE RULES LIVE. Not here. Every number this script applies - five pairs,
// 252 days, the 0.05 guard band, the caps, the no-repeat ladder, the surprise -
// is read from levels.json's dailyPuzzle block, and the three answers are level
// 1's own buckets, read from the same file. docs/PRD.md: "The buckets are the
// ones the daily puzzle already uses, not new numbers."
//
// Educational, not investment advice.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { correlation } from '../js/math.js';
import { gameWindow, windowMatrix, validateGameDoc } from '../js/gameView.js';
import { bucketOf, levelById, puzzleBuckets, validateDailyPuzzle } from '../js/levels.js';
import { makeRng } from '../js/rng.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const GAME_PATH = 'data/game.json';
export const LEVELS_PATH = 'levels.json';
export const TICKERS_PATH = 'tickers.json';
export const PUZZLES_PATH = 'data/puzzles.json';
export const DAILY_PATH = 'data/daily.json';
export const DISCLAIMER = 'Educational, not investment advice.';

/**
 * How many days past today data/daily.json carries. The ledger is the record;
 * daily.json is the slice the game loads, and it exists because the ledger does
 * not stop growing: an entry is about 1.5 KB, so a year of them is above 500 KB
 * to download in order to play one day. This is today, in case a player opens
 * the page before the evening build, plus the horizon the build writes ahead.
 */
export const DAILY_DAYS = 7;

/** Files this script must never write, whatever --out says. */
const PROTECTED = ['data/prices.json', 'data/results.json', 'data/game.json'];

// --- dates ---------------------------------------------------------------------

/**
 * The calendar date in a named time zone, as YYYY-MM-DD.
 *
 * The puzzle turns over with the market rather than with UTC, so a player in
 * Chicago at 9pm and a player in London at 3am are on the same puzzle. 'en-CA'
 * is used only because it formats as YYYY-MM-DD.
 */
export function dateIn(timeZone, at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);
}

/** The date `days` calendar days after a YYYY-MM-DD date, as YYYY-MM-DD. */
export function addDays(date, days) {
  const at = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) throw new Error(`addDays: ${date} is not a YYYY-MM-DD date`);
  return new Date(at.getTime() + days * 86400000).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to`, negative if `to` is earlier. */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** The seed for a date: 2026-11-27 -> 20261127, so a reader can check a day by hand. */
export function seedForDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`seedForDate: ${date} is not a YYYY-MM-DD date`);
  return Number(date.replaceAll('-', ''));
}

// --- the candidate pairs --------------------------------------------------------

/** Ticker -> group key, from tickers.json. Funds are groups of their own. */
export function groupsOf(tickersDoc) {
  const out = {};
  for (const group of tickersDoc.groups) {
    for (const entry of group.tickers) {
      out[typeof entry === 'string' ? entry : entry.ticker] = group.key;
    }
  }
  return out;
}

/** A pair's key, the two tickers in the order they are stored. */
export function pairKey(a, b) {
  return `${a}|${b}`;
}

/**
 * Every pair of playable tickers, with its correlation over the puzzle's window,
 * its bucket and whether it is a surprise.
 *
 * NOTHING IS DROPPED IN SILENCE. Pairs that fall out - a window too short, a
 * correlation too near a bucket edge - are counted and returned beside the
 * candidates, and the counts go into the day's entry. A guard band that quietly
 * ate half the pool would otherwise look exactly like a guard band that ate
 * three pairs.
 */
export function candidatePairs(game, levels, tickersDoc) {
  const puzzle = validateDailyPuzzle(levels);
  if (!puzzle) throw new Error('levels.json carries no dailyPuzzle block');
  const bucketLevel = puzzleBuckets(levels);
  const groups = groupsOf(tickersDoc);
  const universe = Object.keys(groups);

  // The bucket edges, for the guard band. A bucket with no floor (level 4's
  // "anything below 0.50") has no edge to stand clear of.
  const edges = bucketLevel.buckets
    .map((bucket) => bucket.min)
    .filter((min) => min !== null && min > -1);

  const kindOf = (bucket, sameGroup) => puzzle.surprise.kinds
    .find((kind) => kind.bucket === bucket && kind.sameGroup === sameGroup)?.key ?? null;

  const pairs = [];
  const dropped = { shortWindow: 0, guardBand: 0, missingTicker: 0 };
  const droppedPairs = { shortWindow: [], guardBand: [], missingTicker: [] };

  for (let i = 0; i < universe.length; i += 1) {
    for (let j = i + 1; j < universe.length; j += 1) {
      const a = universe[i];
      const b = universe[j];
      let window;
      try {
        window = gameWindow(game, [a, b], puzzle.days);
      } catch {
        // A ticker in tickers.json that game.json does not carry. Counted, not
        // guessed at: the ticker list and the price file disagreeing is a thing
        // to see, not to route around.
        dropped.missingTicker += 1;
        droppedPairs.missingTicker.push(pairKey(a, b));
        continue;
      }
      if (window.days < puzzle.days) {
        dropped.shortWindow += 1;
        droppedPairs.shortWindow.push(pairKey(a, b));
        continue;
      }
      const r = correlation(windowMatrix(window, [a, b]))[0][1];
      if (!Number.isFinite(r)) {
        dropped.shortWindow += 1;
        droppedPairs.shortWindow.push(pairKey(a, b));
        continue;
      }
      if (edges.some((edge) => Math.abs(r - edge) < puzzle.guardBand)) {
        dropped.guardBand += 1;
        droppedPairs.guardBand.push(pairKey(a, b));
        continue;
      }
      const bucket = bucketOf(bucketLevel, r);
      const sameGroup = groups[a] === groups[b];
      pairs.push({
        key: pairKey(a, b),
        a,
        b,
        r,
        bucket,
        sameGroup,
        groupA: groups[a],
        groupB: groups[b],
        surprise: kindOf(bucket, sameGroup),
        window: { days: window.days, from: window.startDate, to: window.endDate },
      });
    }
  }
  return { pairs, dropped, droppedPairs, puzzle, bucketLevel };
}

// --- one day's five pairs --------------------------------------------------------

/**
 * Pick which answer gets the single slot, from levels.json's weights.
 *
 * Five pairs, three answers, no answer more than twice: two answers get two
 * slots and one gets one. Which one is weighted, not even, because the pools
 * are nothing like even - see dailyPuzzle.singleSlotNote in levels.json.
 */
export function pickSingleSlot(rng, buckets, weights) {
  const wheel = buckets.flatMap((key) => Array(weights[key] ?? 0).fill(key));
  if (wheel.length === 0) throw new Error('pickSingleSlot: every weight is zero');
  return wheel[rng.int(wheel.length)];
}

/**
 * The five pairs for one date, or null if this no-repeat window cannot fill them.
 *
 * Deterministic: the same date, the same candidates and the same recent history
 * always give the same five pairs, because the only randomness is makeRng seeded
 * with the date.
 *
 * The order of the draws matters and is fixed: the surprise first, because it is
 * the scarcest thing being asked for, then each bucket's remaining slots. Drawing
 * the surprise last would mean filling four slots and discovering no surprise was
 * left.
 */
export function selectDay(date, candidates, recent, puzzle, buckets) {
  const rng = makeRng(seedForDate(date));
  const free = (pool) => pool.filter((pair) => !recent.has(pair.key));

  const single = pickSingleSlot(rng, buckets, puzzle.singleSlotWeights);
  const quota = Object.fromEntries(buckets.map((key) => [key, key === single ? 1 : puzzle.maxPerAnswer]));
  const wanted = buckets.reduce((total, key) => total + quota[key], 0);
  if (wanted !== puzzle.pairsPerDay) {
    throw new Error(
      `selectDay: the quotas come to ${wanted} pairs, not ${puzzle.pairsPerDay}. `
      + 'pairsPerDay, maxPerAnswer and the number of buckets have to agree.',
    );
  }

  const chosen = [];
  const perTicker = {};
  const fits = (pair) => (perTicker[pair.a] ?? 0) < puzzle.maxPerTicker
    && (perTicker[pair.b] ?? 0) < puzzle.maxPerTicker;
  const take = (pair) => {
    chosen.push(pair);
    perTicker[pair.a] = (perTicker[pair.a] ?? 0) + 1;
    perTicker[pair.b] = (perTicker[pair.b] ?? 0) + 1;
  };

  // The surprise, first. The seed chooses the kind among the kinds that still
  // have an unused pair, so a day never fails for choosing an empty kind.
  const open = puzzle.surprise.kinds
    .map((kind) => kind.key)
    .filter((key) => free(candidates.filter((pair) => pair.surprise === key)).length > 0);
  if (open.length === 0) return null;
  const kind = open[rng.int(open.length)];
  const surprisePool = free(candidates.filter((pair) => pair.surprise === kind));
  const surprise = rng.pick(surprisePool, surprisePool.length).find(fits);
  if (!surprise) return null;
  take(surprise);
  quota[surprise.bucket] -= 1;

  // Then each bucket's remaining slots, in the buckets' own order so a reader
  // re-running a day gets the same five pairs.
  for (const key of buckets) {
    const pool = free(candidates.filter((pair) => pair.bucket === key));
    const shuffled = rng.pick(pool, pool.length);
    for (let n = 0; n < quota[key]; n += 1) {
      const pair = shuffled.find((candidate) => fits(candidate) && !chosen.includes(candidate));
      if (!pair) return null;
      take(pair);
    }
  }
  if (chosen.length !== puzzle.pairsPerDay) return null;

  // The surprise is shown last, so a day ends on the pair that teaches most.
  const rest = chosen.filter((pair) => pair !== surprise);
  return { pairs: puzzle.order === 'surpriseLast' ? [...rest, surprise] : chosen, single, kind, surprise };
}

/** The pairs used in the entries of the `days` calendar days before `date`. */
export function recentPairs(ledger, date, days) {
  const recent = new Set();
  if (days <= 0) return recent;
  for (const entry of ledger.entries ?? []) {
    const gap = daysBetween(entry.date, date);
    if (gap > 0 && gap <= days) {
      for (const pair of entry.pairs) recent.add(pairKey(pair.a, pair.b));
    }
  }
  return recent;
}

/**
 * One date's entry, walking the no-repeat ladder until a day can be built.
 *
 * The ladder relaxes the no-repeat rule and nothing else: the three answers, the
 * caps and the surprise hold at every rung, and a date that cannot be built at
 * the loosest rung throws rather than shipping a four-pair day.
 */
export function buildEntry(date, built, ledger, options) {
  const { puzzle, buckets, dropped } = options;
  const candidates = options.candidates;
  for (const days of puzzle.relaxations) {
    const recent = recentPairs(ledger, date, days);
    const day = selectDay(date, candidates, recent, puzzle, buckets);
    if (!day) continue;
    return {
      date,
      builtFrom: built,
      window: day.pairs[0].window,
      noRepeatDays: days,
      relaxed: days !== puzzle.noRepeatDays,
      singleAnswer: day.single,
      surpriseKind: day.kind,
      pairs: day.pairs.map((pair) => ({
        a: pair.a,
        b: pair.b,
        correlation: Number(pair.r.toFixed(12)),
        answer: pair.bucket,
        groups: [pair.groupA, pair.groupB],
        surprise: pair.surprise,
      })),
      counts: {
        candidates: candidates.length,
        byAnswer: Object.fromEntries(
          buckets.map((key) => [key, candidates.filter((pair) => pair.bucket === key).length]),
        ),
        bySurpriseKind: Object.fromEntries(
          puzzle.surprise.kinds.map((kind) => [
            kind.key, candidates.filter((pair) => pair.surprise === kind.key).length,
          ]),
        ),
        dropped,
        freeAfterNoRepeat: Object.fromEntries(
          buckets.map((key) => [
            key,
            candidates.filter((pair) => pair.bucket === key && !recent.has(pair.key)).length,
          ]),
        ),
      },
    };
  }
  throw new Error(
    `build_puzzles: ${date} could not be built at any no-repeat window `
    + `(${puzzle.relaxations.join(', ')}). The candidate pool has run out, which is a thing to `
    + 'fix in levels.json, not to paper over with a shorter day.',
  );
}

// --- the ledger ------------------------------------------------------------------

/** An empty ledger, for the first run. */
export function emptyLedger() {
  return { meta: null, entries: [] };
}

export function entryFor(ledger, date) {
  return (ledger.entries ?? []).find((entry) => entry.date === date) ?? null;
}

/**
 * Add or refresh every entry from tomorrow to the horizon, and touch nothing
 * dated on or before today.
 *
 * A future entry is rebuilt each evening rather than kept, so the puzzle a
 * player meets tomorrow was computed from last night's prices instead of from
 * a week ago. The horizon exists to carry the puzzle over weekends, market
 * holidays and a run of failed fetches, not to work a week ahead.
 */
export function extendLedger(ledger, { today, built, candidates, dropped, puzzle, buckets }) {
  const out = { ...ledger, entries: [...(ledger.entries ?? [])] };
  const frozen = out.entries.filter((entry) => entry.date <= today);
  const written = [];

  for (let ahead = 1; ahead <= puzzle.horizonDays; ahead += 1) {
    const date = addDays(today, ahead);
    const working = { entries: [...frozen, ...written] };
    const entry = buildEntry(date, built, working, { candidates, dropped, puzzle, buckets });
    written.push(entry);
  }

  out.entries = [...frozen, ...written].sort((x, y) => (x.date < y.date ? -1 : 1));
  return out;
}

/**
 * Which entries a change touched that it had no business touching.
 *
 * `asOf` is the New York date of the version doing the changing: a commit's own
 * date, or today's date when the change is still in the working tree. An entry
 * that differs and is dated on or before it was already being played.
 */
export function frozenViolations(before, after, asOf) {
  const was = new Map((before?.entries ?? []).map((entry) => [entry.date, entry]));
  const violations = [];
  for (const entry of after?.entries ?? []) {
    const old = was.get(entry.date);
    if (!old) continue;                                   // a new entry changes nothing
    if (JSON.stringify(old) === JSON.stringify(entry)) continue;
    if (entry.date <= asOf) violations.push({ date: entry.date, reason: 'changed' });
  }
  for (const [date] of was) {
    if (!(after?.entries ?? []).some((entry) => entry.date === date) && date <= asOf) {
      violations.push({ date, reason: 'removed' });
    }
  }
  return violations.sort((x, y) => (x.date < y.date ? -1 : 1));
}

/** The ledger as the bytes to write: one line per pair, so a day diffs readably. */
export function formatLedger(ledger) {
  return `${JSON.stringify(ledger, null, 1)}\n`;
}

/**
 * The small file the game loads: today through today + DAILY_DAYS, sliced out
 * of the ledger and NOT rebuilt.
 *
 * Every entry here is a copy of the ledger's entry for that date, byte for
 * byte, because two files that are each other's source of truth would drift
 * the first time one of them was written by a different run.
 * tests/puzzles.test.js holds them to being identical.
 *
 * Today is included, not just the days ahead: a player who opens the page in
 * the morning needs today's puzzle, and the evening build is what wrote it.
 */
// A REST PARAMETER, not a `meta` option. It was `{ days, meta = {} }`, and the
// caller passes the meta fields at the top level, so liveThrough, timeZone,
// windowDays and answersFrom were all quietly dropped on the floor: the file
// still validated, because every key the tests looked at is set below. Anything
// that is not `days` is meta, which is the shape the caller already uses.
export function dailyFile(ledger, today, { days = DAILY_DAYS, ...meta } = {}) {
  const last = addDays(today, days);
  const entries = (ledger.entries ?? [])
    .filter((entry) => entry.date >= today && entry.date <= last)
    .sort((x, y) => (x.date < y.date ? -1 : 1));
  return {
    meta: {
      ...meta,
      builtBy: 'scripts/build_puzzles.mjs',
      slicedFrom: PUZZLES_PATH,
      from: today,
      to: last,
      sliceNote:
        `Today through today + ${days} days, copied out of ${PUZZLES_PATH} without being `
        + 'rebuilt. The ledger is the full record and keeps every day ever played; this is '
        + 'the only puzzle file the game loads, so that opening the page does not download '
        + 'a year of past answers.',
      wordsNote:
        'The answers and surprise lines below are copied from levels.json at build time. An '
        + 'entry stores only keys - "same", "A" - and the screen loads this file and '
        + 'tickers.json and nothing else, so the words have to travel with the keys. '
        + 'levels.json stays the one place they are written.',
      disclaimer: DISCLAIMER,
    },
    entries,
  };
}

/**
 * What a live candidate pool cannot do today - a report, not a verdict.
 *
 * docs/PRD.md weakness 3: "Live data moves the goalposts." The same is true of
 * the puzzle's pool, so this is kept OUT of the unit tests and run as its own
 * step after the refresh workflow has committed, exactly as
 * scripts/check_levels.mjs is. A market that has thinned the pool is something
 * to see and fix in levels.json; it is not a reason to withhold tonight's
 * prices from the game.
 */
export function checkLivePool({ candidates, dropped, puzzle, buckets, today, days = 60 }) {
  const problems = [];
  const notes = [];

  for (const bucket of buckets) {
    const n = candidates.filter((pair) => pair.bucket === bucket).length;
    notes.push(`${n} pairs answer "${bucket}"`);
    if (n === 0) problems.push(`no pair answers "${bucket}", so no day can mix all three answers`);
  }
  for (const kind of puzzle.surprise.kinds) {
    const n = candidates.filter((pair) => pair.surprise === kind.key).length;
    notes.push(`${n} surprises of kind ${kind.key} (${kind.label})`);
  }
  if (!candidates.some((pair) => pair.surprise)) {
    problems.push('no surprise pair of any kind is left in the pool');
  }
  notes.push(`${dropped.guardBand} pairs dropped inside the ${puzzle.guardBand} guard band`);

  if (problems.length === 0) {
    try {
      const report = dryRun({
        today, built: {}, candidates, dropped, puzzle, buckets, days,
      });
      for (const bucket of buckets) {
        const score = report.alwaysAnswering[bucket];
        notes.push(`always answering "${bucket}" scores ${score.toFixed(2)} of ${puzzle.pairsPerDay}`);
        if (score > puzzle.maxPerAnswer) {
          problems.push(
            `always answering "${bucket}" scores ${score.toFixed(2)} of ${puzzle.pairsPerDay}, `
            + `above the cap of ${puzzle.maxPerAnswer}`,
          );
        }
      }
      const relaxed = Object.entries(report.relaxations)
        .filter(([window]) => Number(window) !== puzzle.noRepeatDays)
        .reduce((total, [, n]) => total + n, 0);
      notes.push(`${relaxed} of ${days} days needed a shorter no-repeat window than `
        + `${puzzle.noRepeatDays} days`);
      notes.push(`the gap between two showings of one "${buckets[0]}" pair: shortest `
        + `${report.sameBetGap.shortest}, mean ${report.sameBetGap.mean?.toFixed(1)}`);
    } catch (error) {
      problems.push(`${days} days could not be built from today's pool: ${error.message}`);
    }
  }
  return { problems, notes };
}

// --- the command line --------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    game: GAME_PATH,
    out: PUZZLES_PATH,
    daily: DAILY_PATH,
    today: null,
    dryRun: false,
    check: false,
    days: 60,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--game': args.game = argv[i + 1]; i += 1; break;
      case '--out': args.out = argv[i + 1]; i += 1; break;
      case '--daily': args.daily = argv[i + 1]; i += 1; break;
      case '--today': args.today = argv[i + 1]; i += 1; break;
      case '--days': args.days = Number(argv[i + 1]); i += 1; break;
      case '--dry-run': args.dryRun = true; break;
      case '--check': args.check = true; break;
      case '--quiet': args.quiet = true; break;
      default: throw new Error(`build_puzzles: unknown argument ${argv[i]}`);
    }
  }
  return args;
}

/**
 * The dry run: build `days` days forward on today's prices, write nothing, and
 * report what the rules actually produced - including what a player who always
 * gives the same answer would score, which is the test of the caps.
 */
export function dryRun({ today, built, candidates, dropped, puzzle, buckets, days }) {
  const ledger = emptyLedger();
  for (let ahead = 1; ahead <= days; ahead += 1) {
    const date = addDays(today, ahead);
    ledger.entries.push(buildEntry(date, built, ledger, { candidates, dropped, puzzle, buckets }));
  }
  const entries = ledger.entries;

  const perAnswer = Object.fromEntries(buckets.map((key) => [
    key,
    entries.reduce((total, entry) => total + entry.pairs.filter((p) => p.answer === key).length, 0) / entries.length,
  ]));

  const gaps = [];
  const sameKeys = new Set(entries.flatMap((entry) => entry.pairs
    .filter((pair) => pair.answer === buckets[0])
    .map((pair) => pairKey(pair.a, pair.b))));
  for (const key of sameKeys) {
    const at = entries
      .map((entry, i) => (entry.pairs.some((pair) => pairKey(pair.a, pair.b) === key) ? i : -1))
      .filter((i) => i >= 0);
    for (let i = 1; i < at.length; i += 1) gaps.push(at[i] - at[i - 1]);
  }

  const relaxations = Object.fromEntries(puzzle.relaxations.map((days2) => [
    days2, entries.filter((entry) => entry.noRepeatDays === days2).length,
  ]));
  const kindDays = Object.fromEntries(puzzle.surprise.kinds.map((kind) => [
    kind.key,
    {
      led: entries.filter((entry) => entry.surpriseKind === kind.key).length,
      appeared: entries.filter((entry) => entry.pairs.some((pair) => pair.surprise === kind.key)).length,
    },
  ]));

  return {
    days: entries.length,
    from: entries[0].date,
    to: entries[entries.length - 1].date,
    window: entries[0].window,
    candidates: candidates.length,
    dropped,
    byAnswer: Object.fromEntries(buckets.map((key) => [key, candidates.filter((p) => p.bucket === key).length])),
    alwaysAnswering: perAnswer,
    sameBetPairsUsed: sameKeys.size,
    sameBetGap: { shortest: gaps.length ? Math.min(...gaps) : null, mean: gaps.length ? gaps.reduce((s, x) => s + x, 0) / gaps.length : null },
    relaxations,
    surpriseKinds: kindDays,
    entries,
  };
}

function reportDryRun(report, puzzle, buckets, say) {
  say(`${report.days} days, ${report.from} to ${report.to}, on returns from `
    + `${report.window.from} to ${report.window.to} (${report.window.days} trading days)`);
  say(`candidates: ${report.candidates} pairs - `
    + buckets.map((key) => `${key} ${report.byAnswer[key]}`).join(', '));
  say(`dropped: ${report.dropped.guardBand} inside the ${puzzle.guardBand} guard band, `
    + `${report.dropped.shortWindow} for a short window, ${report.dropped.missingTicker} not in game.json`);
  say('');
  say('no-repeat window used: '
    + puzzle.relaxations.map((d) => `${d} days on ${report.relaxations[d]}`).join(', '));
  say(`"${buckets[0]}" pairs used: ${report.sameBetPairsUsed} of ${report.byAnswer[buckets[0]]}; `
    + `gap between repeats: shortest ${report.sameBetGap.shortest ?? 'n/a'}, `
    + `mean ${report.sameBetGap.mean === null ? 'n/a' : report.sameBetGap.mean.toFixed(1)}`);
  for (const kind of puzzle.surprise.kinds) {
    const k = report.surpriseKinds[kind.key];
    say(`surprise ${kind.key} (${kind.label}): led ${k.led} days, appeared on ${k.appeared}`);
  }
  say('');
  say('a player who always gives the same answer scores, out of '
    + `${puzzle.pairsPerDay}: `
    + buckets.map((key) => `${key} ${report.alwaysAnswering[key].toFixed(2)}`).join(', '));
  const worst = Math.max(...buckets.map((key) => report.alwaysAnswering[key]));
  say(worst > puzzle.maxPerAnswer
    ? `WRONG: one constant answer averages ${worst.toFixed(2)}, above the cap of ${puzzle.maxPerAnswer}`
    : `within the cap of ${puzzle.maxPerAnswer} per answer per day`);
  say('');
  say('the first day:');
  for (const pair of report.entries[0].pairs) {
    say(`  ${`${pair.a}/${pair.b}`.padEnd(14)} r=${pair.correlation.toFixed(3).padStart(6)}  `
      + `${pair.answer}${pair.surprise ? `  <- surprise ${pair.surprise}` : ''}`);
  }
}

function main(argv) {
  const args = parseArgs(argv);
  const say = (line) => { if (!args.quiet) console.log(line); };
  const outPath = resolve(ROOT, args.out);
  const dailyPath = resolve(ROOT, args.daily);

  for (const protectedPath of PROTECTED) {
    for (const [flag, path] of [['--out', outPath], ['--daily', dailyPath]]) {
      if (path === resolve(ROOT, protectedPath)) {
        console.error(`REFUSED: this script never writes ${protectedPath} (${flag}).`);
        return 1;
      }
    }
  }
  if (outPath === dailyPath) {
    console.error('REFUSED: --out and --daily would be the same file, and one would overwrite the other.');
    return 1;
  }

  const game = validateGameDoc(JSON.parse(readFileSync(resolve(ROOT, args.game), 'utf8')));
  const levels = JSON.parse(readFileSync(resolve(ROOT, LEVELS_PATH), 'utf8'));
  const tickersDoc = JSON.parse(readFileSync(resolve(ROOT, TICKERS_PATH), 'utf8'));

  const { pairs, dropped, puzzle, bucketLevel } = candidatePairs(game, levels, tickersDoc);
  const buckets = bucketLevel.buckets.map((bucket) => bucket.key);
  const today = args.today ?? dateIn(puzzle.timeZone);
  const built = { liveThrough: game.meta.liveThrough, levelsVersion: levels.version ?? null };

  if (args.dryRun) {
    reportDryRun(
      dryRun({ today, built, candidates: pairs, dropped, puzzle, buckets, days: args.days }),
      puzzle, buckets, say,
    );
    say('');
    say(`Dry run: nothing written. ${DISCLAIMER}`);
    return 0;
  }

  // --check reports on today's live pool and writes nothing. It is a separate
  // mode, and not part of the unit tests, because what it looks at moves with
  // the market: see checkLivePool above.
  if (args.check) {
    const { problems, notes } = checkLivePool({
      candidates: pairs, dropped, puzzle, buckets, today, days: args.days,
    });
    for (const note of notes) say(`  ${note}`);
    if (problems.length === 0) {
      say(`The live pool still builds a day: ${pairs.length} candidate pairs.`);
      say(DISCLAIMER);
      return 0;
    }
    for (const problem of problems) {
      console.error(`::error title=The daily puzzle's pool has thinned::${problem}`);
    }
    return 1;
  }

  const before = existsSync(outPath)
    ? JSON.parse(readFileSync(outPath, 'utf8'))
    : emptyLedger();

  const after = extendLedger(before, { today, built, candidates: pairs, dropped, puzzle, buckets });
  after.meta = {
    builtBy: 'scripts/build_puzzles.mjs',
    rulesFrom: 'levels.json, dailyPuzzle',
    pricesFrom: args.game,
    answersFrom: `levels.json, level ${bucketLevel.id} buckets`,
    liveThrough: game.meta.liveThrough,
    timeZone: puzzle.timeZone,
    windowDays: puzzle.days,
    freezeNote: 'An entry may be rewritten only while its date is still in the future. '
      + 'From the moment its date arrives it is frozen, because somebody is playing it. '
      + 'tests/puzzles.test.js checks this against git.',
    disclaimer: DISCLAIMER,
  };

  // The check this script is most likely to fail, run against its own output
  // before the output exists on disk.
  const violations = frozenViolations(before, after, today);
  if (violations.length > 0) {
    console.error(
      `REFUSED: this run would change ${violations.length} entry/entries dated on or before `
      + `${today}: ${violations.map((v) => `${v.date} (${v.reason})`).join(', ')}. `
      + 'Those days are being played or have been played.',
    );
    return 1;
  }

  const text = formatLedger(after);
  mkdirSync(dirname(outPath), { recursive: true });
  const unchanged = existsSync(outPath) && readFileSync(outPath, 'utf8') === text;
  writeFileSync(outPath, text);

  // The game's own file: the same entries, sliced, never rebuilt.
  const daily = dailyFile(after, today, {
    days: DAILY_DAYS,
    liveThrough: game.meta.liveThrough,
    timeZone: puzzle.timeZone,
    windowDays: puzzle.days,
    answersFrom: `levels.json, level ${bucketLevel.id} buckets`,
    // The words for the keys an entry stores, so the screen needs no third file.
    answers: bucketLevel.buckets.map((bucket) => ({ key: bucket.key, label: bucket.label })),
    surpriseKinds: puzzle.surprise.kinds.map((kind) => ({ key: kind.key, line: kind.line })),
  });
  const dailyText = formatLedger(daily);
  mkdirSync(dirname(dailyPath), { recursive: true });
  const dailyUnchanged = existsSync(dailyPath) && readFileSync(dailyPath, 'utf8') === dailyText;
  writeFileSync(dailyPath, dailyText);
  say(`${dailyUnchanged ? 'Unchanged' : 'Wrote'} ${args.daily}: ${daily.entries.length} entries, `
    + `${daily.meta.from} to ${daily.meta.to} (${(dailyText.length / 1024).toFixed(0)} KB, `
    + `against ${(text.length / 1024).toFixed(0)} KB for the whole ledger)`);

  const fresh = after.entries.filter((entry) => entry.date > today);
  const relaxed = fresh.filter((entry) => entry.relaxed);
  say(`${unchanged ? 'Unchanged' : 'Wrote'} ${args.out}: ${after.entries.length} entries, `
    + `${fresh.length} of them ahead of ${today} (to ${fresh[fresh.length - 1]?.date ?? 'none'})`);
  say(`${pairs.length} candidate pairs; ${dropped.guardBand} inside the guard band, `
    + `${dropped.shortWindow} short of ${puzzle.days} days, ${dropped.missingTicker} not in ${args.game}`);
  if (relaxed.length > 0) {
    console.warn(`::warning title=Puzzle pool thinning::${relaxed.length} of the ${fresh.length} days `
      + `ahead needed a shorter no-repeat window than ${puzzle.noRepeatDays} days.`);
  }
  say(DISCLAIMER);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
