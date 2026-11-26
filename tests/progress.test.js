// tests/progress.test.js - what the browser remembers about the levels.
//
// docs/PRD.md: "Levels 1 to 7, in order; progress saved in the browser."
//
// WHAT IS SAVED, AND WHAT IS NOT. Each level's best stars, its best guess
// error, and whether it has been played - which is what unlocks the next one.
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
  assert.deepEqual(levelProgress(after, 3), { played: true, stars: 2, error: 0.42 });
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
  assert.deepEqual(levelProgress(progress, 5), { played: true, stars: 3, error: 0.01 });
});

test('a failed level still counts as played, which is what unlocks the next', () => {
  const progress = recordLevel(emptyProgress(), 1, { stars: 0, error: 0.5 });
  assert.equal(levelProgress(progress, 1).played, true);
  assert.equal(starsOf(progress, 1), 0);
  assert.equal(isUnlocked(progress, 2, IDS), true, 'playing level 1 did not open level 2');
});

test('a result with no usable guess is recorded without an error', () => {
  const progress = recordLevel(emptyProgress(), 4, { stars: 1, error: null });
  assert.deepEqual(levelProgress(progress, 4), { played: true, stars: 1, error: null });
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

test('playing a level opens the next one, and only the next one', () => {
  let progress = recordLevel(emptyProgress(), 1, { stars: 1, error: 0.1 });
  assert.equal(unlockedThrough(progress, IDS), 2);
  assert.equal(isUnlocked(progress, 2, IDS), true);
  assert.equal(isUnlocked(progress, 3, IDS), false);

  progress = recordLevel(progress, 2, { stars: 3, error: 0.1 });
  assert.equal(unlockedThrough(progress, IDS), 3);
  // The last level opens nothing past itself.
  for (const id of IDS) progress = recordLevel(progress, id, { stars: 1, error: 0.1 });
  assert.equal(unlockedThrough(progress, IDS), IDS[IDS.length - 1]);
});

test('unlocking is worked out from what was played, not stored beside it', () => {
  // One source of truth: a stored "unlocked" list could disagree with the stars
  // sitting next to it, and then two screens would read the same save
  // differently.
  const progress = recordLevel(emptyProgress(), 1, { stars: 1, error: 0.1 });
  assert.ok(!('unlocked' in progress), 'the record stores an unlocked list as well as the levels');
  assert.deepEqual(playedLevels(progress), [1]);
});

test('a level played out of order does not open everything behind it', () => {
  // Nothing in the game offers level 5 before level 4, but a hand-edited save
  // or an old one from before unlocking could say so. Being generous here is
  // right: the levels it claims were played stay played.
  const progress = recordLevel(emptyProgress(), 5, { stars: 2, error: 0.1 });
  assert.equal(isUnlocked(progress, 5, IDS), true, 'a level recorded as played is open');
  assert.equal(isUnlocked(progress, 6, IDS), true, 'the level after the furthest played is open');
  assert.equal(isUnlocked(progress, 7, IDS), false);
});

// ------------------------------------------------------- reading a record

test('a record from an older or newer schema reads as no progress', () => {
  for (const version of [0, 2, 99, '1', null, undefined]) {
    assert.equal(
      migrate({ version, levels: { 1: { played: true, stars: 3, error: 0.1 } } }, IDS), null,
      `version ${JSON.stringify(version)} was trusted`,
    );
  }
  // The current one reads back exactly.
  const mine = recordLevel(emptyProgress(), 1, { stars: 2, error: 0.3 });
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(mine)), IDS), mine);
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
