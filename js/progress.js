// js/progress.js - what the browser remembers about the levels.
//
// docs/PRD.md: "Levels 1 to 7, in order; progress saved in the browser."
//
// WHAT IS SAVED: for each level, whether it has been played, the best stars it
// has given, and the closest guess it has had. Which levels are unlocked is
// WORKED OUT from that rather than stored beside it - one source of truth, so
// two screens cannot read the same save differently.
//
// WHAT IS NOT SAVED, and will not be: anything from Sandbox or My real
// portfolio. docs/PRD.md promises the game collects no student data, and a
// save file is the one place where that could quietly stop being true. A
// record carrying a key this file does not know is not trusted at all.
//
// THE VERSION LIVES IN THE RECORD, not in the key. js/daily.js and js/weekly.js
// version their KEYS, because a half-finished puzzle is disposable and an old
// one is better abandoned than understood. Progress is not disposable: a key
// that changed with the format would strand a player's save behind a name
// nothing reads. Here, migrate() is handed the record and gets the chance to
// bring an old one forward - and refuses anything it does not recognise, which
// reads as a fresh start rather than a crash.
//
// NOTHING HERE BLOCKS PLAY. A storage that is missing, full or throwing is the
// same answer as an empty one: you have nothing saved. js/storage.js already
// swallows all three, and the callers below pass that straight on.
//
// Educational, not investment advice.

import { read, remove, write } from './storage.js';

/**
 * Where progress is kept. NOT versioned - see the note above.
 */
export const PROGRESS_KEY = 'oneTrade.learn';

/** The shape this file writes. migrate() refuses every other number. */
export const PROGRESS_VERSION = 1;

/** The most stars a level can give, for checking a record over. */
const MAX_STARS = 3;

/** A browser that has played nothing. */
export function emptyProgress() {
  return { version: PROGRESS_VERSION, levels: {} };
}

/** One level's record, or null if it has not been played. */
export function levelProgress(progress, levelId) {
  return progress?.levels?.[String(levelId)] ?? null;
}

/** The best stars a level has given, or 0. */
export function starsOf(progress, levelId) {
  return levelProgress(progress, levelId)?.stars ?? 0;
}

/** The closest guess a level has had, or null if it has never had one. */
export function errorOf(progress, levelId) {
  return levelProgress(progress, levelId)?.error ?? null;
}

/** Which levels have been played, in order. */
export function playedLevels(progress) {
  return Object.keys(progress?.levels ?? {})
    .map(Number)
    .filter((id) => Number.isInteger(id))
    .sort((a, b) => a - b);
}

/**
 * Record a finished level. A REPLAY NEVER LOWERS A SAVED SCORE.
 *
 * The two bests are kept SEPARATELY: three stars from one play and the closest
 * guess from another. They need never have happened in the same round, which
 * is a choice rather than an oversight - a player who has once guessed within
 * a hundredth should keep that, even on the evening they earned more stars by
 * building better.
 *
 * Returns a new record; the old one is left alone, so a caller can save the
 * result and keep the one on screen if the save failed.
 */
export function recordLevel(progress, levelId, { stars = 0, error = null } = {}) {
  const key = String(levelId);
  const before = progress.levels[key] ?? null;
  const bestStars = Math.max(before?.stars ?? 0, Number.isInteger(stars) ? stars : 0);
  const bestError = [before?.error, Number.isFinite(error) ? error : null]
    .filter((value) => Number.isFinite(value))
    .reduce((best, value) => (best === null || value < best ? value : best), null);
  return {
    ...progress,
    levels: { ...progress.levels, [key]: { played: true, stars: bestStars, error: bestError } },
  };
}

/**
 * The gap between a guess and the answer, in the level's own units.
 *
 * A SERIES IS MEASURED BY ITS WORST. Level 7 asks three questions and turns on
 * all three landing inside the band, so the number that describes how it went
 * is the worst of them, not the average of them.
 *
 * Null rather than zero when there is nothing to measure: zero would read as a
 * perfect guess.
 */
export function guessError(result) {
  if (Array.isArray(result?.parts)) {
    const errors = result.parts.map((part) => part.error).filter((e) => Number.isFinite(e));
    return errors.length === 0 ? null : Math.max(...errors);
  }
  if (!Number.isFinite(result?.guess) || !Number.isFinite(result?.actual)) return null;
  return Math.abs(result.guess - result.actual);
}

// ------------------------------------------------------------ the unlocking

/**
 * The furthest level a player may start: the one after the furthest they have
 * played, and level 1 to begin with.
 *
 * PLAYED, NOT PASSED. Level 4 asks for a beta under 0.50 and level 6 for half
 * the index's fall; a player who cannot manage those should still see the rest
 * of the game. Reaching a level's reveal is what opens the next one.
 */
export function unlockedThrough(progress, ids) {
  const first = ids[0];
  const played = playedLevels(progress).filter((id) => ids.includes(id));
  if (played.length === 0) return first;
  const furthest = Math.max(...played);
  const at = ids.indexOf(furthest);
  return at >= 0 && at + 1 < ids.length ? ids[at + 1] : ids[ids.length - 1];
}

/** May this level be started? */
export function isUnlocked(progress, levelId, ids) {
  const at = ids.indexOf(levelId);
  const open = ids.indexOf(unlockedThrough(progress, ids));
  // A level recorded as played stays open, whatever order it was played in: an
  // old save, or a hand-edited one, should not take a level away from somebody.
  return at >= 0 && (at <= open || levelProgress(progress, levelId) !== null);
}

// --------------------------------------------------------- reading a record

/** Is this one level's entry something this code can act on? */
function usableEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const keys = Object.keys(entry).sort();
  if (keys.join(',') !== 'error,played,stars') return false;
  if (entry.played !== true) return false;
  if (!Number.isInteger(entry.stars) || entry.stars < 0 || entry.stars > MAX_STARS) return false;
  if (entry.error !== null && (!Number.isFinite(entry.error) || entry.error < 0)) return false;
  return true;
}

/**
 * A stored record this code can trust, or null.
 *
 * WHOLE, OR NOT AT ALL. One bad entry voids the record rather than being
 * dropped quietly: a save that is partly understood produces a screen nobody
 * can explain, which is the rule js/daily.js follows for the same reason. The
 * cost of being wrong is one player's stars, and the cost of being half-right
 * is a bug nobody can reproduce.
 *
 * This is also the gate that keeps other modes out: a record carrying any key
 * beyond `version` and `levels`, or a level key that is not a whole number, is
 * refused. Sandbox and My real portfolio can never be read back in.
 *
 * @param {*} record whatever was in storage
 * @param {number[]} [ids] the levels that exist, for a caller that wants to be told
 */
export function migrate(record, ids = null) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  if (Object.keys(record).sort().join(',') !== 'levels,version') return null;
  // A LATER FORMAT COMES THROUGH HERE. Version 2 would be brought forward to
  // the current shape at this line; until there is one, anything that is not
  // version 1 reads as a fresh start.
  if (record.version !== PROGRESS_VERSION) return null;
  const levels = record.levels;
  if (!levels || typeof levels !== 'object' || Array.isArray(levels)) return null;

  for (const [key, entry] of Object.entries(levels)) {
    if (!/^\d+$/.test(key)) return null;
    if (!usableEntry(entry)) return null;
  }
  // `ids` is advisory: a level that levels.json no longer carries is left in
  // the record rather than throwing it away, because the file may be edited
  // between two visits and the player's stars are not the file's business.
  void ids;
  return { version: record.version, levels: { ...record.levels } };
}

/** Read progress out of the browser. An empty record if there is nothing usable. */
export function loadProgress(key = PROGRESS_KEY) {
  return migrate(read(key, null)) ?? emptyProgress();
}

/** Write progress. False if the browser would not take it, which is not an error. */
export function saveProgress(progress, key = PROGRESS_KEY) {
  return write(key, progress);
}

/**
 * Forget everything about the levels.
 *
 * ONLY THIS KEY. The daily puzzle and the weekly challenge keep their own, and
 * a player resetting their stars has not asked to lose today's puzzle. The
 * per-browser ID that guess records will carry will live under its own key for
 * the same reason - see the open question in BUILD_LOG.md.
 */
export function clearProgress(key = PROGRESS_KEY) {
  return remove(key);
}
