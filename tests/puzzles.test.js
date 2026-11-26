// tests/puzzles.test.js - the daily "Same bet?" puzzle's builder and its ledger.
//
// WHAT IS TESTED WHERE, and why it is split that way:
//
//   * THE MATH runs against numpy. tests/fixtures/known_answers.json carries a
//     game.json-shaped document and the correlation of each pair over the last
//     252 trading days both tickers cover, computed by numpy in
//     tests/make_fixtures.py. The puzzle adds no new measure, but it does add a
//     new WINDOW, so the fixture carries the WHOLE series, nulls and all, and
//     js/gameView.js does the slicing here. CLAUDE.md rule 3: 1e-9.
//
//   * THE SELECTOR runs against a crafted pool, not the market. Whether a day
//     holds all three answers and a surprise is a property of the rules, and a
//     test of the rules must not go red because correlations moved. The real
//     data gets one test of its own, below, which is allowed to go red: if the
//     live pool can no longer build a day, that IS the news.
//
//   * THE FREEZE RULE runs against git. An entry may be rewritten only while
//     its date is still in the future, and the boundary sits on the version
//     doing the changing, not on its parent - see the Wednesday test.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { correlation } from '../js/math.js';
import { gameWindow, windowMatrix } from '../js/gameView.js';
import { validateDailyPuzzle, puzzleBuckets, validateLevels } from '../js/levels.js';
import {
  addDays,
  buildEntry,
  candidatePairs,
  checkLivePool,
  DAILY_DAYS,
  dailyFile,
  dateIn,
  daysBetween,
  emptyLedger,
  extendLedger,
  frozenViolations,
  groupsOf,
  pairKey,
  pickSingleSlot,
  recentPairs,
  seedForDate,
  selectDay,
} from '../scripts/build_puzzles.mjs';
import { makeRng } from '../js/rng.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));

const LEVELS = read('levels.json');
const TICKERS = read('tickers.json');
const PUZZLE = validateDailyPuzzle(LEVELS);
const BUCKET_LEVEL = puzzleBuckets(LEVELS);
const BUCKETS = BUCKET_LEVEL.buckets.map((bucket) => bucket.key);
const FIXTURES = read('tests/fixtures/known_answers.json');
const REL_TOL = 1e-9;
const ABS_TOL = 1e-12;

function close(actual, expected, what) {
  const room = Math.max(ABS_TOL, Math.abs(expected) * REL_TOL);
  assert.ok(
    Math.abs(actual - expected) <= room,
    `${what}: ${actual} is not within ${room} of numpy's ${expected}`,
  );
}

// ---------------------------------------------------------------- the math

test('a pair\'s correlation over the 252-day window matches numpy to 1e-9', () => {
  const fixture = FIXTURES.puzzle_window;
  assert.ok(fixture, 'tests/fixtures/known_answers.json has no puzzle_window block');

  // The fixture's columns, in game.json's own layout: a date, then one value
  // per ticker, with null before a ticker listed.
  const doc = {
    meta: { liveThrough: fixture.dates[fixture.dates.length - 1] },
    tickers: fixture.tickers,
    rows: fixture.dates.map((date, day) => [date, ...fixture.tickers.map((t) => fixture.columns[t][day])]),
  };

  for (const expected of fixture.cases) {
    const [a, b] = expected.pair;
    const window = gameWindow(doc, [a, b], fixture.requested_days);
    assert.equal(window.days, expected.expected.days, `${expected.name}: window length`);
    assert.equal(window.availableDays, expected.expected.available_days, `${expected.name}: days available`);
    assert.equal(window.startDate, expected.expected.start_date, `${expected.name}: window start`);
    assert.equal(window.endDate, expected.expected.end_date, `${expected.name}: window end`);
    const r = correlation(windowMatrix(window, [a, b]))[0][1];
    close(r, expected.expected.correlation, `${expected.name}: correlation`);
  }
});

test('a ticker that listed late shortens the window rather than being dropped', () => {
  const fixture = FIXTURES.puzzle_window;
  const withLate = fixture.cases.find((c) => c.pair.includes('CCC'));
  const full = fixture.cases.find((c) => !c.pair.includes('CCC'));
  assert.equal(full.expected.days, fixture.requested_days);
  assert.ok(withLate.expected.days < fixture.requested_days);
  assert.equal(withLate.expected.days, withLate.expected.available_days);
});

// ---------------------------------------------------------------- the rules file

test('levels.json carries the puzzle rules, and its answers are level 1\'s own', () => {
  validateLevels(LEVELS);
  assert.equal(PUZZLE.pairsPerDay, 5);
  assert.equal(PUZZLE.days, 252);
  assert.equal(BUCKET_LEVEL.id, 1);
  assert.deepEqual(BUCKETS, ['same', 'partly', 'different']);

  // The edges are not restated anywhere in the puzzle block: one definition.
  const text = JSON.stringify(PUZZLE);
  for (const edge of ['0.7', '0.3']) {
    assert.ok(
      !new RegExp(`:\\s*${edge}[,}]`).test(text),
      `dailyPuzzle restates the bucket edge ${edge}; it should read level 1's buckets instead`,
    );
  }
});

test('the rules leave a day that can actually be built', () => {
  assert.ok(PUZZLE.maxPerAnswer * BUCKETS.length >= PUZZLE.pairsPerDay);
  assert.ok(PUZZLE.pairsPerDay >= BUCKETS.length, 'a day has to be able to show all three answers');
  // Five pairs, three answers, two at most each: exactly one answer gets one slot.
  assert.equal(PUZZLE.maxPerAnswer * (BUCKETS.length - 1) + 1, PUZZLE.pairsPerDay);
});

// ---------------------------------------------------------------- a crafted pool

/**
 * A candidate pool with known shape, so the selector's properties can be tested
 * without the market moving under them. Tickers are T0, T1, ... and the groups
 * are chosen so each bucket holds both surprises and ordinary pairs.
 */
function craftPool({ same = 12, partly = 40, different = 60 } = {}) {
  const pairs = [];
  let n = 0;
  const add = (bucket, r, sameGroup, surprise) => {
    const a = `T${n}`;
    const b = `T${n + 1}`;
    n += 2;
    pairs.push({
      key: pairKey(a, b),
      a,
      b,
      r,
      bucket,
      sameGroup,
      groupA: sameGroup ? 'g1' : 'g1',
      groupB: sameGroup ? 'g1' : 'g2',
      surprise,
      window: { days: 252, from: '2025-11-25', to: '2026-11-25' },
    });
  };
  // Half of each surprise-capable bucket is a surprise, as on real data.
  for (let i = 0; i < same; i += 1) add('same', 0.8, i % 2 === 1, i % 2 === 0 ? 'A' : null);
  for (let i = 0; i < partly; i += 1) add('partly', 0.5, i % 2 === 0, null);
  for (let i = 0; i < different; i += 1) add('different', 0.1, i % 2 === 0, i % 2 === 0 ? 'B' : null);
  return pairs;
}

const SIXTY_DAYS = (pool, opts = {}) => {
  const ledger = emptyLedger();
  const built = { liveThrough: '2026-11-25', levelsVersion: 1 };
  for (let i = 1; i <= (opts.days ?? 60); i += 1) {
    const date = addDays(opts.today ?? '2026-11-26', i);
    ledger.entries.push(buildEntry(date, built, ledger, {
      candidates: pool, dropped: {}, puzzle: PUZZLE, buckets: BUCKETS,
    }));
  }
  return ledger;
};

test('every day holds five pairs, all three answers, and no answer more than twice', () => {
  for (const entry of SIXTY_DAYS(craftPool()).entries) {
    assert.equal(entry.pairs.length, PUZZLE.pairsPerDay, `${entry.date}: five pairs`);
    for (const bucket of BUCKETS) {
      const n = entry.pairs.filter((pair) => pair.answer === bucket).length;
      assert.ok(n >= 1, `${entry.date}: no "${bucket}" pair, so the day does not mix all three answers`);
      assert.ok(n <= PUZZLE.maxPerAnswer, `${entry.date}: ${n} "${bucket}" pairs, above the cap`);
    }
  }
});

test('always giving the same answer cannot score three of five', () => {
  const entries = SIXTY_DAYS(craftPool()).entries;
  for (const bucket of BUCKETS) {
    const worst = Math.max(...entries.map((e) => e.pairs.filter((p) => p.answer === bucket).length));
    assert.ok(
      worst <= PUZZLE.maxPerAnswer,
      `always answering "${bucket}" scores ${worst} of ${PUZZLE.pairsPerDay} on some day`,
    );
  }
});

test('every day carries at least one surprise, and no ticker appears three times', () => {
  for (const entry of SIXTY_DAYS(craftPool()).entries) {
    const surprises = entry.pairs.filter((pair) => pair.surprise);
    assert.ok(
      surprises.length >= PUZZLE.surprise.required,
      `${entry.date}: ${surprises.length} surprises, fewer than the ${PUZZLE.surprise.required} required`,
    );
    const seen = {};
    for (const pair of entry.pairs) {
      seen[pair.a] = (seen[pair.a] ?? 0) + 1;
      seen[pair.b] = (seen[pair.b] ?? 0) + 1;
    }
    for (const [ticker, n] of Object.entries(seen)) {
      assert.ok(n <= PUZZLE.maxPerTicker, `${entry.date}: ${ticker} appears ${n} times`);
    }
  }
});

test('the surprise is the last pair of the day', () => {
  assert.equal(PUZZLE.order, 'surpriseLast');
  for (const entry of SIXTY_DAYS(craftPool()).entries) {
    const last = entry.pairs[entry.pairs.length - 1];
    assert.equal(last.surprise, entry.surpriseKind, `${entry.date}: the day does not end on its surprise`);
  }
});

test('no pair repeats inside the no-repeat window the day recorded', () => {
  const entries = SIXTY_DAYS(craftPool()).entries;
  for (const [i, entry] of entries.entries()) {
    const keys = new Set(entry.pairs.map((pair) => pairKey(pair.a, pair.b)));
    assert.equal(keys.size, entry.pairs.length, `${entry.date}: a pair appears twice in one day`);
    for (const earlier of entries.slice(0, i)) {
      const gap = daysBetween(earlier.date, entry.date);
      if (gap > entry.noRepeatDays) continue;
      for (const pair of earlier.pairs) {
        assert.ok(
          !keys.has(pairKey(pair.a, pair.b)),
          `${entry.date}: ${pair.a}/${pair.b} was used ${gap} days earlier, inside its `
          + `${entry.noRepeatDays}-day window`,
        );
      }
    }
  }
});

test('the same date always gives the same five pairs, and two dates differ', () => {
  const pool = craftPool();
  const once = selectDay('2026-11-27', pool, new Set(), PUZZLE, BUCKETS);
  const again = selectDay('2026-11-27', pool, new Set(), PUZZLE, BUCKETS);
  assert.deepEqual(once.pairs.map((p) => p.key), again.pairs.map((p) => p.key));

  const next = selectDay('2026-11-28', pool, new Set(), PUZZLE, BUCKETS);
  assert.notDeepEqual(once.pairs.map((p) => p.key), next.pairs.map((p) => p.key));
});

test('the seed is the date, so a reader can check a day by hand', () => {
  assert.equal(seedForDate('2026-11-27'), 20261127);
  assert.throws(() => seedForDate('27 November 2026'), /YYYY-MM-DD/);
});

test('the single slot follows the weights in levels.json', () => {
  const counts = {};
  for (let i = 1; i <= 700; i += 1) {
    const date = addDays('2026-01-01', i);
    const key = pickSingleSlot(makeRng(seedForDate(date)), BUCKETS, PUZZLE.singleSlotWeights);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const total = Object.values(PUZZLE.singleSlotWeights).reduce((s, w) => s + w, 0);
  for (const bucket of BUCKETS) {
    const share = counts[bucket] / 700;
    const wanted = PUZZLE.singleSlotWeights[bucket] / total;
    assert.ok(
      Math.abs(share - wanted) < 0.06,
      `"${bucket}" took the single slot ${(share * 100).toFixed(0)}% of days, not about `
      + `${(wanted * 100).toFixed(0)}%`,
    );
  }
  // The point of the weighting: "the same bet" is usually the scarce single slot.
  assert.ok(counts.same > counts.partly + counts.different);
});

test('a thinning pool relaxes the no-repeat window, and says it did', () => {
  // Only four "same bet" pairs, so a 14-day no-repeat cannot be honoured.
  const entries = SIXTY_DAYS(craftPool({ same: 4 })).entries;
  const relaxed = entries.filter((entry) => entry.relaxed);
  assert.ok(relaxed.length > 0, 'a four-pair pool should have forced a relaxation');
  for (const entry of relaxed) {
    assert.ok(PUZZLE.relaxations.includes(entry.noRepeatDays));
    assert.notEqual(entry.noRepeatDays, PUZZLE.noRepeatDays);
    // Relaxing the no-repeat rule never relaxes the rest.
    assert.equal(entry.pairs.length, PUZZLE.pairsPerDay);
    assert.ok(entry.pairs.some((pair) => pair.surprise));
  }
});

test('a pool that cannot build a day fails the build rather than shipping a short one', () => {
  const noSurprises = craftPool().map((pair) => ({ ...pair, surprise: null }));
  assert.throws(
    () => buildEntry('2026-11-27', {}, emptyLedger(), {
      candidates: noSurprises, dropped: {}, puzzle: PUZZLE, buckets: BUCKETS,
    }),
    /could not be built/,
  );

  const noSameBets = craftPool({ same: 0 });
  assert.throws(
    () => buildEntry('2026-11-27', {}, emptyLedger(), {
      candidates: noSameBets, dropped: {}, puzzle: PUZZLE, buckets: BUCKETS,
    }),
    /could not be built/,
  );
});

test('an entry counts what the guard band and the no-repeat rule dropped', () => {
  const entry = SIXTY_DAYS(craftPool()).entries[20];
  assert.equal(entry.counts.candidates, 112);
  assert.deepEqual(Object.keys(entry.counts.byAnswer).sort(), [...BUCKETS].sort());
  for (const bucket of BUCKETS) {
    assert.ok(entry.counts.freeAfterNoRepeat[bucket] <= entry.counts.byAnswer[bucket]);
  }
  assert.ok(entry.counts.bySurpriseKind.A > 0 && entry.counts.bySurpriseKind.B > 0);
});

// ---------------------------------------------------------------- the ledger

const LEDGER_OPTS = {
  built: { liveThrough: '2026-11-25', levelsVersion: 1 },
  candidates: craftPool(),
  dropped: {},
  puzzle: PUZZLE,
  buckets: BUCKETS,
};

test('a build fills every date from tomorrow to the horizon', () => {
  const ledger = extendLedger(emptyLedger(), { today: '2026-11-26', ...LEDGER_OPTS });
  assert.equal(ledger.entries.length, PUZZLE.horizonDays);
  assert.equal(ledger.entries[0].date, '2026-11-27');
  assert.equal(ledger.entries[ledger.entries.length - 1].date, addDays('2026-11-26', PUZZLE.horizonDays));
  // Sorted, and no date twice.
  const dates = ledger.entries.map((entry) => entry.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(new Set(dates).size, dates.length);
});

test('tomorrow\'s build leaves every past day exactly as it was', () => {
  const monday = extendLedger(emptyLedger(), { today: '2026-11-23', ...LEDGER_OPTS });
  const tuesday = extendLedger(monday, { today: '2026-11-24', ...LEDGER_OPTS });

  for (const old of monday.entries.filter((entry) => entry.date <= '2026-11-24')) {
    const now = tuesday.entries.find((entry) => entry.date === old.date);
    assert.deepEqual(now, old, `${old.date} changed after it had arrived`);
  }
  assert.equal(frozenViolations(monday, tuesday, '2026-11-24').length, 0);
});

test('a gap left by days of failed builds is filled in, not skipped', () => {
  const before = extendLedger(emptyLedger(), { today: '2026-11-23', ...LEDGER_OPTS });
  // Nothing ran for four days.
  const after = extendLedger(before, { today: '2026-11-27', ...LEDGER_OPTS });
  for (let i = 1; i <= PUZZLE.horizonDays; i += 1) {
    const date = addDays('2026-11-27', i);
    assert.ok(after.entries.some((entry) => entry.date === date), `${date} is missing`);
  }
  // The days that passed in the meantime are still there, untouched.
  for (const old of before.entries.filter((entry) => entry.date <= '2026-11-27')) {
    assert.deepEqual(after.entries.find((entry) => entry.date === old.date), old);
  }
});

test('recentPairs looks back the right number of days and no further', () => {
  const ledger = extendLedger(emptyLedger(), { today: '2026-11-26', ...LEDGER_OPTS });
  const target = '2026-12-04';
  assert.equal(recentPairs(ledger, target, 0).size, 0);
  const three = recentPairs(ledger, target, 3);
  const seven = recentPairs(ledger, target, 7);
  assert.ok(three.size < seven.size);
  // A pair from four days before the target is outside a three-day window.
  const fourBack = ledger.entries.find((entry) => entry.date === addDays(target, -4));
  assert.ok(!three.has(pairKey(fourBack.pairs[0].a, fourBack.pairs[0].b)));
  assert.ok(seven.has(pairKey(fourBack.pairs[0].a, fourBack.pairs[0].b)));
});

// ---------------------------------------------------------------- the freeze rule

/** A ledger of plain entries, enough for the freeze rule to chew on. */
function ledgerOf(...dates) {
  return { entries: dates.map((date) => ({ date, pairs: [{ a: 'AAA', b: 'BBB' }], noRepeatDays: 14 })) };
}

function changed(ledger, date, to = 'CCC') {
  return {
    entries: ledger.entries.map((entry) => (entry.date === date
      ? { ...entry, pairs: [{ a: 'AAA', b: to }] }
      : entry)),
  };
}

test('rewriting a day that has not arrived yet is allowed', () => {
  const before = ledgerOf('2026-11-24', '2026-11-25', '2026-11-26');
  const after = changed(before, '2026-11-26');
  assert.deepEqual(frozenViolations(before, after, '2026-11-25'), []);
});

test('rewriting a day that has passed is caught', () => {
  const before = ledgerOf('2026-11-24', '2026-11-25', '2026-11-26');
  const after = changed(before, '2026-11-24');
  assert.deepEqual(frozenViolations(before, after, '2026-11-25'), [{ date: '2026-11-24', reason: 'changed' }]);
});

test('WEDNESDAY: Wednesday evening\'s build may not rewrite Wednesday\'s own puzzle', () => {
  // The case the boundary exists for. Wednesday evening's refresh has TUESDAY's
  // commit as its parent. People have been playing Wednesday's puzzle all day.
  const tuesdayCommit = ledgerOf('2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27');
  const wednesdayBuild = changed(tuesdayCommit, '2026-11-25');   // 2026-11-25 is the Wednesday

  // Read against the build's OWN date, which is the rule: caught.
  assert.deepEqual(
    frozenViolations(tuesdayCommit, wednesdayBuild, '2026-11-25'),
    [{ date: '2026-11-25', reason: 'changed' }],
    'Wednesday evening rewrote Wednesday and the check did not notice',
  );

  // Read against the PARENT's date - Tuesday - it slips through. This is the
  // hole the rule closes, and it is pinned here so nobody reinstates it.
  assert.deepEqual(
    frozenViolations(tuesdayCommit, wednesdayBuild, '2026-11-24'),
    [],
    'the parent-dated boundary is supposed to be the broken one',
  );

  // The same evening may still rewrite Thursday, which nobody has played.
  const alsoThursday = changed(wednesdayBuild, '2026-11-26');
  assert.deepEqual(
    frozenViolations(tuesdayCommit, alsoThursday, '2026-11-25')
      .filter((v) => v.date === '2026-11-26'),
    [],
  );
});

test('deleting a day that has passed is caught too', () => {
  const before = ledgerOf('2026-11-24', '2026-11-25');
  const after = { entries: before.entries.filter((entry) => entry.date !== '2026-11-24') };
  assert.deepEqual(frozenViolations(before, after, '2026-11-25'), [{ date: '2026-11-24', reason: 'removed' }]);
});

test('adding days ahead of today changes nothing that is frozen', () => {
  const before = ledgerOf('2026-11-24', '2026-11-25');
  const after = { entries: [...before.entries, ...ledgerOf('2026-11-26', '2026-11-27').entries] };
  assert.deepEqual(frozenViolations(before, after, '2026-11-25'), []);
});

test('the builder refuses a run that would rewrite a day that has arrived', () => {
  const before = extendLedger(emptyLedger(), { today: '2026-11-23', ...LEDGER_OPTS });
  // A different pool, so the same dates would be built differently.
  const after = extendLedger(before, {
    today: '2026-11-24', ...LEDGER_OPTS, candidates: craftPool({ same: 8, partly: 30, different: 40 }),
  });
  assert.deepEqual(frozenViolations(before, after, '2026-11-24'), []);
});

// ---------------------------------------------------------------- against git

/** Run git, or null when this is not a usable checkout. */
function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function ledgerAt(ref) {
  const text = git(['show', `${ref}:data/puzzles.json`]);
  return text === null ? null : JSON.parse(text);
}

test('no commit, and no pending change, rewrites a puzzle that had already arrived', (t) => {
  if (git(['rev-parse', '--git-dir']) === null) return t.skip('not a git checkout');
  const path = resolve(ROOT, 'data/puzzles.json');
  const head = ledgerAt('HEAD');
  // Before the first commit of the ledger there is nothing to compare against,
  // whether or not a build has already written the file.
  if (head === null) return t.skip('data/puzzles.json is not committed yet');

  let checks = 0;

  // The working tree against HEAD, read against today: the check the refresh
  // workflow runs before it commits.
  if (existsSync(path)) {
    const working = JSON.parse(readFileSync(path, 'utf8'));
    const today = dateIn(PUZZLE.timeZone);
    assert.deepEqual(
      frozenViolations(head, working, today),
      [],
      `an uncommitted change rewrites a puzzle dated on or before ${today}`,
    );
    checks += 1;
  }

  // HEAD against its parent, read against HEAD's OWN date: the check that has
  // something to say after a push, where the working tree equals HEAD and
  // comparing the file with itself could never fail.
  const parent = ledgerAt('HEAD~1');
  if (parent !== null) {
    const stamp = git(['show', '-s', '--format=%cI', 'HEAD'])?.trim();
    const asOf = dateIn(PUZZLE.timeZone, new Date(stamp));
    assert.deepEqual(
      frozenViolations(parent, head, asOf),
      [],
      `the commit at HEAD, made on ${asOf}, rewrites a puzzle dated on or before that`,
    );
    checks += 1;
  } else {
    // Said out loud rather than passed in silence: without the parent's copy
    // this test is doing half of what it is for. WHICH reason matters - one of
    // these is a checkout to fix, one is a commit to wait for, one is normal -
    // so they are told apart rather than guessed at in the message.
    const hasParent = git(['rev-parse', '--verify', '--quiet', 'HEAD~1']) !== null;
    const shallow = git(['rev-parse', '--is-shallow-repository'])?.trim() === 'true';
    let why;
    if (!hasParent && shallow) why = 'the parent commit was not fetched (shallow checkout; fetch-depth: 2)';
    else if (!hasParent) why = 'HEAD has no parent commit';
    else why = 'data/puzzles.json is new in HEAD, so the parent has no copy to compare against';
    t.diagnostic(`${why}; checked the working tree against HEAD only`);
  }

  assert.ok(checks > 0, 'neither comparison could run, so this test checked nothing');
});

// ---------------------------------------------------------------- the live pool

// WHAT IS *NOT* TESTED HERE, DELIBERATELY. Whether today's market still offers
// a "same bet" pair, a surprise, or sixty buildable days is a fact about
// prices, not about this code, and docs/PRD.md weakness 3 is exactly that live
// data moves the goalposts. A unit test that went red because correlations
// drifted would block every push for a reason no commit caused. Those checks
// live in `node scripts/build_puzzles.mjs --check`, which the refresh workflow
// runs AFTER it has committed - the same arrangement scripts/check_levels.mjs
// has, and for the same reason.
//
// What IS tested here is the thing a commit can break: the two files agreeing
// with each other.

test('every ticker in tickers.json has prices in data/game.json', () => {
  const game = read('data/game.json');
  const { dropped } = candidatePairs(game, LEVELS, TICKERS);
  assert.equal(
    dropped.missingTicker, 0,
    'tickers.json names a playable ticker that data/game.json does not carry, so some pairs '
    + 'can never be used. This is the two files disagreeing, not the market moving.',
  );
});

test('--check reports a thinned pool rather than throwing at it', () => {
  // A pool with no "same bet" pair at all: a report with problems in it, not a crash.
  const thin = craftPool({ same: 0 });
  const report = checkLivePool({
    candidates: thin, dropped: { guardBand: 0 }, puzzle: PUZZLE, buckets: BUCKETS,
    today: '2026-11-26', days: 10,
  });
  assert.ok(report.problems.length > 0);
  assert.match(report.problems.join(' '), /no pair answers "same"/);
  assert.ok(report.notes.length > 0, 'a report with no notes tells nobody anything');

  // A healthy pool: notes, no problems.
  const healthy = checkLivePool({
    candidates: craftPool(), dropped: { guardBand: 0 }, puzzle: PUZZLE, buckets: BUCKETS,
    today: '2026-11-26', days: 10,
  });
  assert.deepEqual(healthy.problems, []);
});

// ---------------------------------------------------------------- data/daily.json

test('daily.json carries today through today + 7, and nothing else', () => {
  const ledger = extendLedger(emptyLedger(), { today: '2026-11-26', ...LEDGER_OPTS });
  const daily = dailyFile(ledger, '2026-11-27');     // a day later: today's entry exists
  assert.equal(daily.meta.from, '2026-11-27');
  assert.equal(daily.meta.to, addDays('2026-11-27', DAILY_DAYS));
  for (const entry of daily.entries) {
    assert.ok(entry.date >= daily.meta.from && entry.date <= daily.meta.to,
      `${entry.date} is outside the window daily.json says it covers`);
  }
  // Today itself is in there, not only the days ahead.
  assert.ok(daily.entries.some((entry) => entry.date === '2026-11-27'));
});

test('every entry in daily.json matches the ledger exactly', () => {
  const ledger = extendLedger(emptyLedger(), { today: '2026-11-26', ...LEDGER_OPTS });
  const daily = dailyFile(ledger, '2026-11-27');
  const byDate = new Map(ledger.entries.map((entry) => [entry.date, entry]));

  for (const entry of daily.entries) {
    const original = byDate.get(entry.date);
    assert.ok(original, `daily.json carries ${entry.date}, which is not in the ledger at all`);
    assert.deepEqual(entry, original, `${entry.date} differs between daily.json and the ledger`);
    // Deep-equal would pass on a rebuilt-but-identical entry; this says it is
    // the same object, sliced rather than recomputed.
    assert.equal(entry, original, `${entry.date} was rebuilt for daily.json instead of copied`);
  }

  // And nothing in range was left out.
  const inRange = ledger.entries.filter(
    (entry) => entry.date >= daily.meta.from && entry.date <= daily.meta.to,
  );
  assert.deepEqual(
    daily.entries.map((entry) => entry.date),
    inRange.map((entry) => entry.date),
  );
});

test('the committed daily.json matches the committed ledger', () => {
  const daily = read('data/daily.json');
  const ledger = read('data/puzzles.json');
  const byDate = new Map(ledger.entries.map((entry) => [entry.date, entry]));

  assert.ok(daily.entries.length > 0, 'data/daily.json has no entries, so the game has no puzzle');
  for (const entry of daily.entries) {
    assert.deepEqual(
      entry, byDate.get(entry.date),
      `data/daily.json and data/puzzles.json disagree about ${entry.date}`,
    );
  }
  for (const entry of ledger.entries) {
    const inRange = entry.date >= daily.meta.from && entry.date <= daily.meta.to;
    assert.equal(
      daily.entries.some((e) => e.date === entry.date), inRange,
      `${entry.date} is ${inRange ? 'missing from' : 'wrongly in'} data/daily.json`,
    );
  }
  assert.equal(daily.meta.slicedFrom, 'data/puzzles.json');
});

test('daily.json is the small file and the ledger is the big one', () => {
  const daily = readFileSync(resolve(ROOT, 'data/daily.json'), 'utf8');
  const ledger = readFileSync(resolve(ROOT, 'data/puzzles.json'), 'utf8');
  assert.ok(daily.length <= ledger.length);
  // The reason this file exists: a year of the ledger is above 500 KB, and the
  // game must not have to download it to play one day.
  assert.ok(
    daily.length < 64 * 1024,
    `data/daily.json is ${(daily.length / 1024).toFixed(0)} KB; the game loads this on every visit`,
  );
});

// ---------------------------------------------------------------- dates

test('the day turns over in New York, not in UTC', () => {
  // 03:00 UTC on the 27th is 22:00 on the 26th in New York: still yesterday's puzzle.
  const at = new Date('2026-11-27T03:00:00Z');
  assert.equal(dateIn('America/New_York', at), '2026-11-26');
  assert.equal(dateIn('UTC', at), '2026-11-27');
  assert.equal(PUZZLE.timeZone, 'America/New_York');
});

test('adding and subtracting days crosses months and years', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(daysBetween('2026-11-24', '2026-12-01'), 7);
  assert.equal(daysBetween('2026-12-01', '2026-11-24'), -7);
});

test('a day in the daylight-saving change still has one date', () => {
  // US clocks go back on 1 November 2026. 05:30 UTC that morning is 01:30 EDT;
  // 06:30 UTC is 01:30 EST. Both are still 1 November in New York.
  assert.equal(dateIn('America/New_York', new Date('2026-11-01T05:30:00Z')), '2026-11-01');
  assert.equal(dateIn('America/New_York', new Date('2026-11-01T06:30:00Z')), '2026-11-01');
  assert.equal(dateIn('America/New_York', new Date('2026-11-01T04:59:00Z')), '2026-11-01');
});

test('groupsOf reads every playable ticker out of tickers.json', () => {
  const groups = groupsOf(TICKERS);
  assert.equal(Object.keys(groups).length, 40);
  assert.equal(groups.NVDA, 'ai_stocks');
  assert.equal(groups.VOO, 'core_us_funds');
  assert.equal(groups.VXUS, 'international_funds');
  // The benchmarks are not playable and are not here.
  assert.equal(groups['^GSPC'], undefined);
  assert.equal(groups.RSP, undefined);
});
