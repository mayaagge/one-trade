// tests/progress.test.js - what the browser remembers about the levels.
//
// docs/PRD.md: "Levels 1 to 7, in order; progress saved in the browser."
//
// WHAT IS SAVED, AND WHAT IS NOT. Each level's best stars, its best guess
// error, how many times it has been finished without a star, and whether it has
// been played. A STAR is what unlocks the next level; `played` now only keeps a
// level somebody already reached from being taken away again.
// Nothing from Sandbox or My real portfolio, ever: docs/PRD.md's promise is
// that the game collects no student data, and a save file is the one place
// where that could quietly stop being true.
//
// EVERY FAILURE HERE IS A SILENT ONE. A save that cannot be read, a save from
// a format that no longer exists, a storage that throws: none of them may stop
// the game. The rule is js/daily.js's rule - a record that is only partly
// understood is ignored rather than obeyed - because a half-trusted save
// produces a screen nobody can explain.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  PROGRESS_KEY,
  PROGRESS_VERSION,
  isPassed,
  passedLevels,
  triesOf,
  clearProgress,
  emptyProgress,
  errorOf,
  guessError,
  isUnlocked,
  levelProgress,
  loadProgress,
  migrate,
  playedLevels,
  recordLevel,
  saveProgress,
  starsOf,
  unlockedThrough,
} from '../js/progress.js';
import { validateLevels } from '../js/levels.js';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));
const LEVELS = validateLevels(readJson('levels.json'));
const IDS = LEVELS.levels.map((level) => level.id);

/** A localStorage for one test, and the teardown that takes it away again. */
function withStorage(store = {}, { broken = false } = {}) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const previous = globalThis.localStorage;
  globalThis.localStorage = broken ? {
    getItem() { throw new Error('storage is blocked'); },
    setItem() { throw new Error('storage is blocked'); },
    removeItem() { throw new Error('storage is blocked'); },
  } : {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
  };
  return () => {
    if (had) globalThis.localStorage = previous;
    else delete globalThis.localStorage;
  };
}

/** No localStorage at all, which is what some browsers do in private windows. */
function withoutStorage() {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const previous = globalThis.localStorage;
  delete globalThis.localStorage;
  return () => { if (had) globalThis.localStorage = previous; };
}

// ------------------------------------------------------------- the shape

test('a fresh record carries the version, and nothing else', () => {
  const fresh = emptyProgress();
  assert.equal(fresh.version, PROGRESS_VERSION);
  assert.deepEqual(fresh.levels, {});
  assert.deepEqual(Object.keys(fresh).sort(), ['levels', 'version']);
  assert.equal(PROGRESS_KEY, 'oneTrade.learn');
});

test('the key is not versioned, because progress is worth migrating', () => {
  // The daily and weekly keys carry .v1: a half-finished puzzle is disposable,
  // and an old one is better abandoned than understood. Progress is not
  // disposable, so the version goes INSIDE the record, where a later format can
  // migrate it rather than orphan it behind a key nothing reads.
  assert.ok(!/\.v\d+$/.test(PROGRESS_KEY), `${PROGRESS_KEY} is versioned, so an old save would be stranded`);
});

// ----------------------------------------------------- recording a result

test('a level remembers that it was played, its stars and its error', () => {
  const after = recordLevel(emptyProgress(), 3, { stars: 2, error: 0.42 });
  assert.deepEqual(levelProgress(after, 3), { played: true, stars: 2, error: 0.42, tries: 0 });
  assert.equal(starsOf(after, 3), 2);
  assert.equal(errorOf(after, 3), 0.42);
  // Nothing is invented for a level that has not been played.
  assert.equal(levelProgress(after, 4), null);
  assert.equal(starsOf(after, 4), 0);
  assert.equal(errorOf(after, 4), null);
});

test('a replay never lowers a saved score', () => {
  let progress = recordLevel(emptyProgress(), 2, { stars: 3, error: 0.10 });
  progress = recordLevel(progress, 2, { stars: 1, error: 0.90 });
  assert.equal(starsOf(progress, 2), 3, 'a worse replay took the stars away');
  assert.equal(errorOf(progress, 2), 0.10, 'a worse replay took the best guess away');

  // And a better one does update, field by field.
  progress = recordLevel(progress, 2, { stars: 2, error: 0.05 });
  assert.equal(starsOf(progress, 2), 3);
  assert.equal(errorOf(progress, 2), 0.05, 'a better guess was not saved');
});

test('the two bests are kept separately, which is a choice worth seeing', () => {
  // Three stars on one play, the closest guess on another: the saved pair is
  // the best of each and need never have happened in a single round.
  let progress = recordLevel(emptyProgress(), 5, { stars: 3, error: 0.30 });
  progress = recordLevel(progress, 5, { stars: 1, error: 0.01 });
  assert.deepEqual(levelProgress(progress, 5), { played: true, stars: 3, error: 0.01, tries: 0 });
});

test('a failed level is recorded as played, and unlocks nothing', () => {
  // `played` is still written, because it is what keeps a level somebody has
  // already reached from being taken away. It is no longer what unlocks.
  const progress = recordLevel(emptyProgress(), 1, { stars: 0, error: 0.5 });
  assert.equal(levelProgress(progress, 1).played, true);
  assert.equal(starsOf(progress, 1), 0);
  assert.equal(levelProgress(progress, 1).tries, 1, 'a failure counts as a try');
  assert.equal(isUnlocked(progress, 2, IDS), false, 'failing level 1 unlocked level 2');
});

test('a result with no usable guess is recorded without an error', () => {
  const progress = recordLevel(emptyProgress(), 4, { stars: 1, error: null });
  assert.deepEqual(levelProgress(progress, 4), { played: true, stars: 1, error: null, tries: 0 });
  // And a later real error fills it in.
  const later = recordLevel(progress, 4, { stars: 1, error: 0.2 });
  assert.equal(errorOf(later, 4), 0.2);
});

test('guessError measures the gap in the level\'s own units, worst-first on a series', () => {
  assert.equal(guessError({ guess: 0.8, actual: 0.95 }).toFixed(2), '0.15');
  assert.equal(guessError({ guess: 3, actual: 3 }), 0);
  // Level 7 answers three at once, and the level turns on the worst of them.
  assert.equal(guessError({
    parts: [{ error: 0.2 }, { error: 0.9 }, { error: 0.4 }],
  }), 0.9);
  // Nothing to measure is null, not zero: zero would read as a perfect guess.
  assert.equal(guessError({ guess: null, actual: 3 }), null);
  assert.equal(guessError({}), null);
});

// ---------------------------------------------------------- the unlocking

test('level 1 is always open, and the rest wait their turn', () => {
  const nothing = emptyProgress();
  assert.equal(isUnlocked(nothing, 1, IDS), true);
  for (const id of IDS.slice(1)) {
    assert.equal(isUnlocked(nothing, id, IDS), false, `level ${id} was open before level ${id - 1} was played`);
  }
  assert.equal(unlockedThrough(nothing, IDS), 1);
});

test('passing a level unlocks the next one, and only the next one', () => {
  let progress = recordLevel(emptyProgress(), 1, { stars: 1, error: 0.1 });
  assert.equal(unlockedThrough(progress, IDS), 2);
  assert.equal(isUnlocked(progress, 2, IDS), true);
  assert.equal(isUnlocked(progress, 3, IDS), false);

  progress = recordLevel(progress, 2, { stars: 3, error: 0.1 });
  assert.equal(unlockedThrough(progress, IDS), 3);
  // The last level unlocks nothing past itself.
  for (const id of IDS) progress = recordLevel(progress, id, { stars: 1, error: 0.1 });
  assert.equal(unlockedThrough(progress, IDS), IDS[IDS.length - 1]);
});

test('PLAYING a level is no longer enough: a pass is one star', () => {
  // The whole of the change. Before this, reaching a reveal unlocked the next
  // level and a player could walk the ladder without ever meeting a pass
  // condition.
  const failed = recordLevel(emptyProgress(), 1, { stars: 0, error: 0.9 });
  assert.equal(playedLevels(failed).length, 1, 'it was still played');
  assert.deepEqual(passedLevels(failed), [], 'and not passed');
  assert.equal(isPassed(failed, 1), false);
  assert.equal(isUnlocked(failed, 1, IDS), true, 'level 1 is always open');
  assert.equal(isUnlocked(failed, 2, IDS), false, 'a failed level 1 does not unlock level 2');
  assert.equal(unlockedThrough(failed, IDS), 1);

  // One star is the toll, and the lowest one counts.
  const passed = recordLevel(failed, 1, { stars: 1, error: 0.2 });
  assert.equal(isPassed(passed, 1), true);
  assert.equal(isUnlocked(passed, 2, IDS), true);
});

test('a level already reached under the old rule is never taken away', () => {
  // A SAVE FROM BEFORE THIS CHANGE. The player failed level 3 and the old rule
  // opened level 4 for them; they played level 4 too, and failed that. Coming
  // back to the strict rule they must keep both - a rule that changed while
  // somebody was away may not send them backwards.
  let progress = emptyProgress();
  progress = recordLevel(progress, 1, { stars: 2, error: 0.1 });
  progress = recordLevel(progress, 2, { stars: 1, error: 0.4 });
  progress = recordLevel(progress, 3, { stars: 0, error: 0.9 });
  progress = recordLevel(progress, 4, { stars: 0, error: 0.8 });

  assert.equal(isUnlocked(progress, 3, IDS), true, 'level 3 was played and stays open');
  assert.equal(isUnlocked(progress, 4, IDS), true, 'level 4 was played and stays open');
  // But the next step is earned, not given: level 5 waits for a star on 4.
  assert.equal(isUnlocked(progress, 5, IDS), false);
  assert.equal(unlockedThrough(progress, IDS), 3, 'the furthest PASSED is 2, so 3 is the frontier');
});

test('a try is a finished attempt that earned no star, and it is remembered', () => {
  let progress = recordLevel(emptyProgress(), 4, { stars: 0, error: 0.9 });
  assert.equal(triesOf(progress, 4), 1);
  progress = recordLevel(progress, 4, { stars: 0, error: 0.7 });
  progress = recordLevel(progress, 4, { stars: 0, error: 0.6 });
  assert.equal(triesOf(progress, 4), 3, 'three failures is when the hint is offered');
  // Passing does not add one, and does not erase the ones already taken: the
  // hint has been earned and a later pass does not unsay the three attempts.
  progress = recordLevel(progress, 4, { stars: 2, error: 0.05 });
  assert.equal(triesOf(progress, 4), 3);
  assert.equal(starsOf(progress, 4), 2);
  // A level never attempted has none.
  assert.equal(triesOf(progress, 1), 0);
  assert.equal(triesOf(emptyProgress(), 4), 0);
});

test('unlocking is worked out from what was played, not stored beside it', () => {
  // One source of truth: a stored "unlocked" list could disagree with the stars
  // sitting next to it, and then two screens would read the same save
  // differently.
  const progress = recordLevel(emptyProgress(), 1, { stars: 1, error: 0.1 });
  assert.ok(!('unlocked' in progress), 'the record stores an unlocked list as well as the levels');
  assert.deepEqual(playedLevels(progress), [1]);
});

test('a level played out of order does not unlock everything behind it', () => {
  // Nothing in the game offers level 5 before level 4, but a hand-edited save
  // or an old one from before unlocking could say so. Being generous here is
  // right: the levels it claims were played stay played.
  const progress = recordLevel(emptyProgress(), 5, { stars: 2, error: 0.1 });
  assert.equal(isUnlocked(progress, 5, IDS), true, 'a level recorded as played is open');
  assert.equal(isUnlocked(progress, 6, IDS), true, 'the level after the furthest passed is unlocked');
  assert.equal(isUnlocked(progress, 7, IDS), false);
  // And a level played out of order WITHOUT passing unlocks nothing new.
  const nostar = recordLevel(emptyProgress(), 5, { stars: 0, error: 0.9 });
  assert.equal(isUnlocked(nostar, 5, IDS), true, 'still open, because it was played');
  assert.equal(isUnlocked(nostar, 6, IDS), false, 'but it opened nothing');
});

// ------------------------------------------------------- reading a record

test('a record from an unknown schema reads as no progress', () => {
  for (const version of [0, 3, 99, '1', null, undefined]) {
    assert.equal(
      migrate({ version, levels: { 1: { played: true, stars: 3, error: 0.1, tries: 0 } } }, IDS), null,
      `version ${JSON.stringify(version)} was trusted`,
    );
  }
  // The current one reads back exactly.
  const mine = recordLevel(emptyProgress(), 1, { stars: 2, error: 0.3 });
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(mine)), IDS), mine);
});

test('a version 1 save is brought forward, not thrown away', () => {
  // THE WHOLE POINT OF VERSIONING THE RECORD AND NOT THE KEY. Everybody playing
  // before this change has a version 1 save; refusing it would silently wipe
  // their stars, which is the one thing in here worth keeping.
  const old = {
    version: 1,
    levels: {
      1: { played: true, stars: 3, error: 0.01 },
      4: { played: true, stars: 0, error: 0.42 },
    },
  };
  const now = migrate(old, IDS);
  assert.equal(now.version, PROGRESS_VERSION, 'it comes back stamped with the current version');
  assert.equal(starsOf(now, 1), 3, 'the stars survived');
  assert.equal(errorOf(now, 4), 0.42, 'the best guess survived');
  assert.equal(triesOf(now, 1), 0, 'a player who has never had a hint starts the count at 0');
  assert.equal(triesOf(now, 4), 0);
  // And the strict rule reads the brought-forward record correctly: level 1 was
  // passed so level 2 is unlocked; level 4 was played but not passed, so it
  // stays open and level 5 does not.
  assert.equal(isUnlocked(now, 2, IDS), true);
  assert.equal(isUnlocked(now, 4, IDS), true);
  assert.equal(isUnlocked(now, 5, IDS), false);
  // Migrating twice changes nothing.
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(now)), IDS), now);
  // A version 1 entry that is broken in some OTHER way is still refused whole.
  assert.equal(migrate({ version: 1, levels: { 1: { played: true, stars: 9, error: null } } }, IDS), null);
});

test('corrupted data is ignored whole, never half-trusted', () => {
  const bad = [
    null, undefined, 'nonsense', 42, [], [{ version: 1 }],
    { levels: {} },                                              // no version
    { version: 1 },                                              // no levels
    { version: 1, levels: [] },                                  // levels is a list
    { version: 1, levels: { 1: null } },
    { version: 1, levels: { 1: 'three stars' } },
    { version: 1, levels: { 1: { played: true, stars: 'three', error: 0.1 } } },
    { version: 1, levels: { 1: { played: true, stars: 9, error: 0.1 } } },
    { version: 1, levels: { 1: { played: true, stars: -1, error: 0.1 } } },
    { version: 1, levels: { 1: { played: true, stars: 1.5, error: 0.1 } } },
    { version: 1, levels: { 1: { played: true, stars: 1, error: -0.2 } } },
    { version: 1, levels: { 1: { played: true, stars: 1, error: 'close' } } },
    { version: 1, levels: { 1: { played: 'yes', stars: 1, error: 0.1 } } },
    { version: 1, levels: { 1: { stars: 1, error: 0.1 } } },      // no played
    { version: 1, levels: { notALevel: { played: true, stars: 1, error: 0.1 } } },
    { version: 1, levels: {}, extra: 'something' },               // a key we do not know
  ];
  for (const record of bad) {
    assert.equal(migrate(record, IDS), null, `${JSON.stringify(record)} was trusted`);
  }
});

test('nothing from another mode can hide in a save', () => {
  // docs/PRD.md: the game collects no student data. Sandbox and My real
  // portfolio are where a real holding could appear, and a save file is the one
  // place that promise could quietly stop being true.
  for (const record of [
    { version: 1, levels: {}, sandbox: { tickers: ['NVDA'] } },
    { version: 1, levels: {}, realPortfolio: { VOO: 5000 } },
    { version: 1, levels: { sandbox: { played: true, stars: 1, error: 0 } } },
  ]) {
    assert.equal(migrate(record, IDS), null, `${JSON.stringify(record)} was trusted`);
  }
  // And what the game writes carries level ids and nothing else.
  let progress = emptyProgress();
  for (const id of IDS) progress = recordLevel(progress, id, { stars: 1, error: 0.1 });
  assert.deepEqual(Object.keys(progress).sort(), ['levels', 'version']);
  assert.deepEqual(Object.keys(progress.levels).map(Number).sort((a, b) => a - b), IDS);
});

// ----------------------------------------------------------- the storage

test('a save survives a round trip through the browser', () => {
  const store = {};
  const restore = withStorage(store);
  try {
    const progress = recordLevel(emptyProgress(), 1, { stars: 3, error: 0.04 });
    assert.equal(saveProgress(progress), true);
    assert.deepEqual(loadProgress(), progress);
    assert.ok(store[PROGRESS_KEY], 'nothing was written under the progress key');
  } finally { restore(); }
});

test('without storage the game plays, and simply does not save', () => {
  const restore = withoutStorage();
  try {
    assert.deepEqual(loadProgress(), emptyProgress());
    assert.equal(saveProgress(recordLevel(emptyProgress(), 1, { stars: 1, error: 0 })), false);
    assert.equal(clearProgress(), false);
    // And reading again still answers "nothing saved" rather than throwing.
    assert.deepEqual(loadProgress(), emptyProgress());
  } finally { restore(); }
});

test('a storage that throws is the same as no storage', () => {
  const restore = withStorage({}, { broken: true });
  try {
    assert.deepEqual(loadProgress(), emptyProgress());
    assert.equal(saveProgress(emptyProgress()), false);
    assert.equal(clearProgress(), false);
  } finally { restore(); }
});

test('an unreadable save reads as a fresh start, and is not left to rot', () => {
  const store = { [PROGRESS_KEY]: '{not json' };
  const restore = withStorage(store);
  try {
    assert.deepEqual(loadProgress(), emptyProgress());
    // The next save overwrites it, so a player is not stuck with it forever.
    assert.equal(saveProgress(recordLevel(emptyProgress(), 1, { stars: 1, error: 0.2 })), true);
    assert.equal(starsOf(loadProgress(), 1), 1);
  } finally { restore(); }
});

test('a save from another schema reads as a fresh start', () => {
  const store = { [PROGRESS_KEY]: JSON.stringify({ version: 0, levels: { 1: { played: true, stars: 3, error: 0 } } }) };
  const restore = withStorage(store);
  try {
    assert.deepEqual(loadProgress(), emptyProgress());
    assert.equal(starsOf(loadProgress(), 1), 0);
  } finally { restore(); }
});

// ---------------------------------------------------------------- reset

test('reset takes the save away and relocks the levels', () => {
  const store = {};
  const restore = withStorage(store);
  try {
    let progress = emptyProgress();
    for (const id of IDS) progress = recordLevel(progress, id, { stars: 3, error: 0.01 });
    saveProgress(progress);
    assert.equal(unlockedThrough(loadProgress(), IDS), IDS[IDS.length - 1]);

    assert.equal(clearProgress(), true);
    assert.deepEqual(loadProgress(), emptyProgress());
    assert.equal(unlockedThrough(loadProgress(), IDS), 1);
    assert.equal(starsOf(loadProgress(), 1), 0);
    assert.ok(!(PROGRESS_KEY in store), 'the key is still there after a reset');
  } finally { restore(); }
});

test('reset touches only this key, so the daily and weekly keep their day', () => {
  const store = {
    'oneTrade.daily.v1': JSON.stringify({ date: '2026-11-27', answers: ['same'] }),
    'oneTrade.weekly.v1': JSON.stringify({ week: '2026-11-30', guess: 2.2 }),
  };
  const restore = withStorage(store);
  try {
    saveProgress(recordLevel(emptyProgress(), 1, { stars: 1, error: 0.1 }));
    clearProgress();
    assert.ok(store['oneTrade.daily.v1'], 'resetting the levels took the daily puzzle with it');
    assert.ok(store['oneTrade.weekly.v1'], 'resetting the levels took the weekly challenge with it');
  } finally { restore(); }
});
