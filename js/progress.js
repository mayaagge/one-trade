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

/**
 * The shape this file writes. migrate() brings version 1 forward and refuses
 * every other number.
 *
 * VERSION 2 ADDED `tries`. The hint a level shows after three failed attempts
 * has to survive the player closing the tab - somebody who fails twice on the
 * bus and once at home has failed three times - so the count is in the record
 * rather than in the session. That is the one reason the version moved; the
 * pass-to-unlock rule itself needed no migration at all, because `stars` was
 * already being stored and "played but not passed" is simply `stars: 0`.
 */
export const PROGRESS_VERSION = 2;

/** The most stars a level can give, for checking a record over. */
const MAX_STARS = 3;

/** A browser that has played nothing. */
export function emptyProgress() {
  return { version: PROGRESS_VERSION, levels: {} };
}

/** How many times this level has been finished without earning a star. */
export function triesOf(progress, levelId) {
  return levelProgress(progress, levelId)?.tries ?? 0;
}

/** Has this level ever been passed? One star is the pass. */
export function isPassed(progress, levelId) {
  return starsOf(progress, levelId) >= 1;
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
  const earned = Number.isInteger(stars) ? stars : 0;
  const bestStars = Math.max(before?.stars ?? 0, earned);
  // A TRY IS A FINISHED ATTEMPT THAT EARNED NOTHING, and it is never forgotten:
  // the count is what decides whether this level offers its hint, and a player
  // who has failed three times has failed three times whether or not they later
  // pass. It counts attempts rather than reveals, so level 7 - which is three
  // portfolios and one verdict - adds one, not three.
  const tries = (before?.tries ?? 0) + (earned === 0 ? 1 : 0);
  const bestError = [before?.error, Number.isFinite(error) ? error : null]
    .filter((value) => Number.isFinite(value))
    .reduce((best, value) => (best === null || value < best ? value : best), null);
  return {
    ...progress,
    levels: { ...progress.levels, [key]: { played: true, stars: bestStars, error: bestError, tries } },
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

/** Which levels have been passed - at least one star - in order. */
export function passedLevels(progress) {
  return playedLevels(progress).filter((id) => isPassed(progress, id));
}

/**
 * The furthest level a player may start: the one after the furthest they have
 * PASSED, and level 1 to begin with.
 *
 * PASSED, NOT PLAYED, and that is a decision with a cost. Until now reaching a
 * level's reveal opened the next one, so a player could walk the whole ladder
 * without ever meeting a pass condition. One star is now the toll.
 *
 * WHAT IT COSTS: PREREG.md's Hypothesis 3 pairs a player's level-2 error with
 * their level-7 error and needs 60 players carrying both. Every player who
 * would have stumbled past level 4's beta under 0.50, or level 6's half-the-
 * index fall, now stops there instead. The 60-player minimum was not set
 * against a gated ladder - see BUILD_LOG.md. The per-level hint after three
 * failed tries is what stands between this rule and a wall, which is why it
 * ships in the same change rather than after it.
 *
 * A level that has already been PLAYED stays open regardless - see isUnlocked().
 */
export function unlockedThrough(progress, ids) {
  const first = ids[0];
  const passed = passedLevels(progress).filter((id) => ids.includes(id));
  if (passed.length === 0) return first;
  const furthest = Math.max(...passed);
  const at = ids.indexOf(furthest);
  return at >= 0 && at + 1 < ids.length ? ids[at + 1] : ids[ids.length - 1];
}

/**
 * May this level be started?
 *
 * THE SECOND CLAUSE IS WHAT MAKES THE NEW RULE SAFE FOR OLD SAVES. A level with
 * any record stays open whatever the rule says, so a player who reached level 4
 * under the old "played is enough" rule keeps level 4 when they come back; only
 * their next step has to be earned. Nobody is sent backwards by a rule that
 * changed while they were away, and no migration code is needed to achieve it.
 * It also covers a hand-edited save and a level played out of order.
 */
export function isUnlocked(progress, levelId, ids) {
  const at = ids.indexOf(levelId);
  const open = ids.indexOf(unlockedThrough(progress, ids));
  return at >= 0 && (at <= open || levelProgress(progress, levelId) !== null);
}

// --------------------------------------------------------- reading a record

/** Is this one level's entry something this code can act on? */
function usableEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const keys = Object.keys(entry).sort();
  if (keys.join(',') !== 'error,played,stars,tries') return false;
  if (entry.played !== true) return false;
  if (!Number.isInteger(entry.stars) || entry.stars < 0 || entry.stars > MAX_STARS) return false;
  if (entry.error !== null && (!Number.isFinite(entry.error) || entry.error < 0)) return false;
  if (!Number.isInteger(entry.tries) || entry.tries < 0) return false;
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
  if (record.version !== PROGRESS_VERSION && record.version !== 1) return null;
  const levels = record.levels;
  if (!levels || typeof levels !== 'object' || Array.isArray(levels)) return null;

  // VERSION 1 IS BROUGHT FORWARD, not refused. Its entries carry played, stars
  // and error and no `tries`, which is exactly a player who has never had a hint
  // shown: tries starts at 0 and counts from their next failure. Their stars are
  // the thing worth keeping and they are already in the right shape.
  //
  // It is done BEFORE the per-entry check, so the check only ever runs against
  // the current shape and there is one definition of a usable entry rather than
  // one per version.
  const brought = record.version === 1
    ? Object.fromEntries(Object.entries(levels).map(([key, entry]) => [
      key,
      (entry && typeof entry === 'object' && !Array.isArray(entry) && entry.tries === undefined)
        ? { ...entry, tries: 0 }
        : entry,
    ]))
    : levels;

  for (const [key, entry] of Object.entries(brought)) {
    if (!/^\d+$/.test(key)) return null;
    if (!usableEntry(entry)) return null;
  }
  // `ids` is advisory: a level that levels.json no longer carries is left in
  // the record rather than throwing it away, because the file may be edited
  // between two visits and the player's stars are not the file's business.
  void ids;
  // Always stamped with the CURRENT version: a record that came in as version 1
  // has just been brought forward, and writing it back as version 1 would mean
  // migrating it again on every single load.
  return { version: PROGRESS_VERSION, levels: { ...brought } };
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
