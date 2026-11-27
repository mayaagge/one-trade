// js/levels.js - the level rules, read from levels.json.
//
// This file holds no thresholds and no level text: every rule is data in
// levels.json, so an instructor or a reviewer can read what the game checks
// without reading code. What lives here is the logic that applies those rules,
// and it is pure - no DOM, no fetch, no prices.

// CLOSE_TO_THRESHOLD and formatMeasure() now live in js/format.js, the one
// place that formats a number for a player; imported here for use below and
// re-exported so every existing `from './levels.js'` import keeps working.
import { CLOSE_TO_THRESHOLD, formatMeasure, withMinus } from './format.js';

export const LEVELS_URL = 'levels.json';
export const DISCLAIMER = 'Educational, not investment advice.';

/** The pretend money a player allocates, in dollars. */
export const STARTING_DOLLARS = 10000;

export { CLOSE_TO_THRESHOLD, formatMeasure };

/**
 * How many decimals a revealed answer carries, unless its level says otherwise
 * with revealPlaces. Two reads right for a number of bets, a beta and a ratio
 * of falls; level 1 asks for three, because a correlation rounds to 1.00 while
 * still being short of it.
 */
export const REVEAL_PLACES = 2;

/**
 * How many portfolios the weekly challenge cycles through. Ten is about two
 * and a half months before a player sees one again, by which time the prices
 * have moved it anyway.
 */
export const WEEKLY_PORTFOLIOS = 10;

/**
 * Slack on a star band, so binary floating point cannot cost a player a star.
 *
 * A guess of 0.82 against an actual of 0.92 is "within 0.10" in every sense a
 * player means it, but the subtraction gives 0.10000000000000009, which a bare
 * <= 0.10 rejects. The bands are generous by design - the guess is the lesson -
 * so the boundary is included.
 */
export const BAND_TOLERANCE = 1e-9;

/**
 * The measures a level may be scored on.
 *
 * Checked here so a typo in levels.json fails on load rather than at the reveal,
 * with the level's name on it. Every one of these is implemented in js/math.js
 * and applied by js/round.js; "guess" is a pass rule rather than a measure - it
 * is level 2's "make a guess", which every round satisfies - so it is allowed on
 * a pass and nowhere else.
 */
export const MEASURES = ['correlation', 'effectiveBets', 'beta', 'maxRiskShare', 'fallShare'];

/**
 * The measures that are not taken over data/game.json's rolling window.
 *
 * Level 6's answer is a ratio of two falls through a fixed stretch of 2020, read
 * from data/crashes.json. A level measuring one of these carries its own
 * `window` block naming the file and the key, and levels.json's shared 756-day
 * window - and its 252-day minimum - say nothing about it.
 */
export const CRASH_MEASURES = ['fallShare'];

/** How a level's answer is shown: a plain number, or a share of 1 as a percent. */
export const DISPLAYS = ['number', 'percent'];

/**
 * The smallest share of the money one holding can hold: $100 of $10,000, which is
 * js/round.js's step. A level that sets a floor on one holding has to leave this
 * much for each of the others, and validateLevels() refuses a file that does not.
 */
export const MIN_HOLDING_SHARE = 0.01;

// ------------------------------------------------------------------ loading

/**
 * Check a levels file over, and throw on anything the game would otherwise
 * discover halfway through a round.
 */
export function validateLevels(data) {
  if (!data || typeof data !== 'object') throw new Error('levels: expected an object');
  if (!Array.isArray(data.levels) || data.levels.length === 0) {
    throw new Error('levels: expected a non-empty levels array');
  }

  const ids = new Set();
  for (const level of data.levels) {
    const where = `level ${level.id}`;
    if (!Number.isInteger(level.id)) throw new Error('levels: every level needs a whole-number id');
    if (ids.has(level.id)) throw new Error(`levels: duplicate id ${level.id}`);
    ids.add(level.id);

    for (const field of ['title', 'concept', 'challenge', 'explain']) {
      if (typeof level[field] !== 'string' || level[field].length === 0) {
        throw new Error(`${where}: ${field} is missing`);
      }
    }
    if (!level.pass || typeof level.pass.measure !== 'string') {
      throw new Error(`${where}: a pass rule with a measure is missing`);
    }
    if (level.pass.measure === 'series') {
      // Level 7's rule is about THREE guesses together, so it has no single
      // measured value to compare against a threshold. seriesVerdict() applies
      // it; validateSeries() checks the level carries what that needs.
      if (level.pass.test !== 'allWithin' || !Number.isFinite(level.pass.of)) {
        throw new Error(`${where}: a series pass rule needs test "allWithin" and a numeric "of"`);
      }
      validateSeries(level, data);
    } else if (level.pass.measure !== 'guess') {
      if (!MEASURES.includes(level.pass.measure)) {
        throw new Error(`${where}: pass.measure "${level.pass.measure}" is not one this game computes (${MEASURES.join(', ')})`);
      }
      if (!['>=', '<=', '>', '<'].includes(level.pass.comparison)) {
        throw new Error(`${where}: pass.comparison must be one of >= <= > <`);
      }
      if (!Number.isFinite(level.pass.threshold)) {
        throw new Error(`${where}: pass.threshold must be a number`);
      }
    }
    validateGuess(level);
    validatePicker(level);
    validateHoldings(level, data);
    validateBuckets(level);
    validateStars(level);
    validateWindow(level);
    validateShare(level);
    if (level.revealPlaces !== undefined
      && (!Number.isInteger(level.revealPlaces) || level.revealPlaces < 0 || level.revealPlaces > 6)) {
      throw new Error(`${where}: revealPlaces must be a whole number of decimals from 0 to 6`);
    }
  }

  validateKinds(data);
  validateStressTest(data);
  validateDailyPuzzle(data);
  validateWeekly(data);
  validateGuessPool(data.guessPool);
  validateFinalPool(data.finalPool, data.guessPool);
  return data;
}

/**
 * The kinds of ticker, for a level whose build rule is about a kind rather than
 * about a named holding: level 6's "at least 60% in stocks".
 *
 * BOTH LISTS ARE WRITTEN OUT in levels.json, and that redundancy is the point. A
 * file listing only the four that are not stocks would quietly count a bond fund
 * added next year as a stock. Here a ticker in neither list has no kind, so
 * tests/levels.test.js can hold the two lists to tickers.json's own universe and
 * fail until a new ticker is classified. This function cannot do that itself: it
 * is handed levels.json and nothing else, and the universe lives in another file.
 */
/**
 * The stress scenario Sandbox and My real portfolio show.
 *
 * WHY IT IS DATA AND NOT A CONSTANT. docs/PRD.md defines the stress-test loss as
 * "portfolio value x beta x shock size" and never fixes the shock size, so
 * somebody had to. It is fixed in levels.json beside every other rule the game
 * checks, with its reason written next to it, so that a reviewer reading the
 * file can see the number was chosen before any portfolio was measured with it -
 * which is exactly what a number buried in a .js file could not show.
 *
 * A FALL, NOT A RISE: the shock must be negative. A positive "shock" would turn
 * the loss on the screen into a gain and the range into a reward for holding the
 * most concentrated portfolio a player can build, which is the opposite of what
 * the screen is for.
 *
 * THE BENCHMARK IS NAMED, and docs/PRD.md says why: market stress days are "an
 * outside benchmark, so stress isn't defined by the AI stocks under study". The
 * file names ^GSPC rather than leaving the code to assume it.
 *
 * Absent is allowed - a levels file for the Learn ladder alone needs no stress
 * block, and every level validated above ignores it - but a block that is there
 * and wrong is refused rather than half-used.
 */
export function validateStressTest(data) {
  const stress = data.stressTest;
  if (stress === undefined) return data;
  if (typeof stress !== 'object' || stress === null) {
    throw new Error('levels: stressTest must be an object');
  }
  if (!Number.isFinite(stress.shock) || !(stress.shock < 0)) {
    throw new Error(
      `levels: stressTest.shock must be a negative number - the scenario is a fall - got ${stress.shock}`,
    );
  }
  if (!(stress.shock > -1)) {
    throw new Error(
      `levels: stressTest.shock of ${stress.shock} is a fall of ${Math.abs(stress.shock) * 100}% `
      + 'or more, which would wipe out the whole portfolio and is not a scenario this screen explains',
    );
  }
  const days = stress.stressDays;
  if (typeof days !== 'object' || days === null) {
    throw new Error('levels: stressTest.stressDays must be an object naming the fraction and the benchmark');
  }
  if (!Number.isFinite(days.fraction) || !(days.fraction > 0) || !(days.fraction < 1)) {
    throw new Error(
      `levels: stressTest.stressDays.fraction must be between 0 and 1, got ${days.fraction}`,
    );
  }
  if (typeof days.benchmark !== 'string' || days.benchmark.length === 0) {
    throw new Error('levels: stressTest.stressDays.benchmark must name the ticker stress is measured on');
  }
  return data;
}

export function validateKinds(data) {
  const kinds = data.kinds;
  if (kinds === undefined) return data;
  if (typeof kinds !== 'object' || kinds === null) throw new Error('levels: kinds must be an object');
  const seen = new Map();
  for (const [kind, members] of Object.entries(kinds)) {
    // The prose beside the lists - note, coverNote, pltrNote - is for a reader,
    // not for the game, so only the lists are checked.
    if (!Array.isArray(members)) continue;
    if (members.length === 0) throw new Error(`levels: kind "${kind}" is empty`);
    for (const ticker of members) {
      if (typeof ticker !== 'string' || ticker.length === 0) {
        throw new Error(`levels: kind "${kind}" has an entry that is not a ticker`);
      }
      if (seen.has(ticker)) {
        throw new Error(
          `levels: ${ticker} is in two kinds, "${seen.get(ticker)}" and "${kind}", `
          + 'so what it counts as would depend on which list was read first',
        );
      }
      seen.set(ticker, kind);
    }
  }
  return data;
}

/**
 * A level that measures a crash has to say which window, and in which file.
 *
 * Level 6's answer is a fixed stretch of history rather than the rolling window
 * every other level reads, so leaving the key out would silently measure
 * something else - or nothing at all.
 */
function validateWindow(level) {
  const where = `level ${level.id}`;
  const measures = [level.pass.measure, level.guess?.measure];
  const needsWindow = measures.some((measure) => CRASH_MEASURES.includes(measure));
  if (!needsWindow) return;
  const window = level.window;
  if (!window || typeof window.source !== 'string' || typeof window.key !== 'string') {
    throw new Error(
      `${where}: a level measuring ${measures.find((m) => CRASH_MEASURES.includes(m))} needs `
      + 'window.source and window.key, naming the file and the window it replays',
    );
  }
}

/**
 * The guess: every level asks for one, over a range the star bands assume, and
 * says how it is shown. A beta and a share of risk need a step and a display of
 * their own, and those live here rather than in js/game.js.
 */
function validateGuess(level) {
  const where = `level ${level.id}`;
  const guess = level.guess;
  if (!guess || typeof guess.measure !== 'string') {
    throw new Error(`${where}: a guess with a measure is missing - every level asks for one`);
  }
  if (!MEASURES.includes(guess.measure)) {
    throw new Error(`${where}: guess.measure "${guess.measure}" is not one this game computes (${MEASURES.join(', ')})`);
  }
  if (!Number.isFinite(guess.min) || !Number.isFinite(guess.max) || !(guess.max > guess.min)) {
    throw new Error(`${where}: the guess needs a min and a max, with the max above the min`);
  }
  if (!Number.isFinite(guess.step) || !(guess.step > 0)) {
    throw new Error(`${where}: guess.step must be a positive number`);
  }
  if (!DISPLAYS.includes(guess.display)) {
    throw new Error(`${where}: guess.display must be one of ${DISPLAYS.join(', ')}`);
  }
  if (guess.display === 'number' && !Number.isInteger(guess.places)) {
    throw new Error(`${where}: a number display needs guess.places, so the screen and the slider agree`);
  }
  if (typeof level.revealLabel !== 'string' || level.revealLabel.length === 0) {
    throw new Error(`${where}: revealLabel is missing, so the reveal panel could not name its number`);
  }
}

/**
 * The build rule: how many holdings, which of them the level deals, and the
 * floor under a dealt holding's share.
 *
 * Level 4 is the one with floors - "Keep at least 30% in QQQ" - and the check
 * that matters is that the floors LEAVE ROOM: every other holding still needs
 * its $100, or the level would be asking for a portfolio that cannot be built.
 */
function validateHoldings(level, data = {}) {
  const where = `level ${level.id}`;
  const holdings = level.holdings;
  if (!holdings) return;
  const wanted = Number.isInteger(holdings.exactly) ? holdings.exactly : null;

  const required = holdings.required ?? [];
  if (!Array.isArray(required)) throw new Error(`${where}: holdings.required must be a list of tickers`);
  if (required.length > 0) {
    if (wanted === null) throw new Error(`${where}: a level that deals holdings must say how many it wants`);
    if (required.length > wanted) {
      throw new Error(`${where}: ${required.length} required holdings will not fit in ${wanted}`);
    }
    if (Array.isArray(level.pool)) {
      for (const ticker of required) {
        if (!level.pool.includes(ticker)) {
          throw new Error(`${where}: ${ticker} is required but is not in this level's pool`);
        }
      }
    }
  }

  const floors = holdings.minShare ?? {};
  if (typeof floors !== 'object') throw new Error(`${where}: holdings.minShare must be an object`);
  let floorTotal = 0;
  for (const [ticker, share] of Object.entries(floors)) {
    if (!required.includes(ticker)) {
      throw new Error(`${where}: ${ticker} has a minimum share but is not a required holding, so nothing guarantees it is held`);
    }
    if (!Number.isFinite(share) || !(share > 0) || share > 1) {
      throw new Error(`${where}: ${ticker}'s minimum share must be above 0 and at most 1`);
    }
    floorTotal += share;
  }
  if (wanted !== null) {
    const others = wanted - Object.keys(floors).length;
    const room = 1 - floorTotal - others * MIN_HOLDING_SHARE;
    if (room < -BAND_TOLERANCE) {
      throw new Error(
        `${where}: the minimum shares come to ${floorTotal} and leave nothing for the other `
        + `${others} holdings, so the portfolio this level asks for cannot be built`,
      );
    }
  }

  validateKindFloor(level, data, wanted);
}

/**
 * The floor on a KIND of holding: level 6's "at least 60% in stocks".
 *
 * Different from minShare above, which names a ticker the level deals. This one
 * names a kind in levels.json's own `kinds` block, and any holding of that kind
 * can carry it - so what is checked is that the kind exists and that the floor
 * leaves every OTHER holding its $100. One holding of the kind can carry the
 * whole floor on its own, which is why the room left over is counted against
 * wanted - 1 rather than against the number of floors.
 */
function validateKindFloor(level, data, wanted) {
  const where = `level ${level.id}`;
  const rule = level.holdings?.minShareIn;
  if (rule === undefined) return;
  if (!rule || typeof rule !== 'object') throw new Error(`${where}: holdings.minShareIn must be an object`);
  if (typeof rule.kind !== 'string' || rule.kind.length === 0) {
    throw new Error(`${where}: holdings.minShareIn.kind must name a kind in this file's kinds block`);
  }
  if (!Array.isArray(data.kinds?.[rule.kind])) {
    throw new Error(
      `${where}: holdings.minShareIn names the kind "${rule.kind}", which this file's kinds `
      + 'block does not list, so nothing says which tickers it means',
    );
  }
  if (!Number.isFinite(rule.share) || !(rule.share > 0) || rule.share > 1) {
    throw new Error(`${where}: holdings.minShareIn.share must be above 0 and at most 1`);
  }
  if (wanted !== null) {
    const room = 1 - rule.share - (wanted - 1) * MIN_HOLDING_SHARE;
    if (room < -BAND_TOLERANCE) {
      throw new Error(
        `${where}: a floor of ${rule.share} in ${rule.kind} leaves nothing for the other `
        + `${wanted - 1} holdings, so the portfolio this level asks for cannot be built`,
      );
    }
  }
}

/**
 * The daily "Same bet?" puzzle's rules, which live in levels.json beside the
 * levels because they are rules a reviewer should be able to read.
 *
 * The puzzle has no buckets of its own: it answers in LEVEL 1's buckets, and
 * dailyPuzzle.bucketsFrom says so. This function therefore checks that the
 * level it points at exists and has buckets, and nothing here re-states an
 * edge. docs/PRD.md: "The buckets are the ones the daily puzzle already uses,
 * not new numbers."
 *
 * Returns the block, or null if the file carries no puzzle at all - an older
 * levels.json is not an error, it is a levels.json without a puzzle.
 */
export function validateDailyPuzzle(data) {
  const puzzle = data?.dailyPuzzle;
  if (puzzle === undefined) return null;
  if (!puzzle || typeof puzzle !== 'object') throw new Error('dailyPuzzle: expected an object');

  for (const field of ['pairsPerDay', 'days', 'maxPerAnswer', 'maxPerTicker', 'noRepeatDays', 'horizonDays']) {
    if (!Number.isInteger(puzzle[field]) || puzzle[field] < 1) {
      throw new Error(`dailyPuzzle: ${field} must be a whole number of 1 or more`);
    }
  }
  if (!Number.isFinite(puzzle.guardBand) || puzzle.guardBand < 0) {
    throw new Error('dailyPuzzle: guardBand must be a number of 0 or more');
  }

  // The buckets come from a level, and that level has to be in this file.
  const source = levelById(data, bucketLevelId(puzzle));
  if (!Array.isArray(source.buckets) || source.buckets.length === 0) {
    throw new Error(`dailyPuzzle: bucketsFrom points at level ${source.id}, which has no buckets`);
  }
  const keys = source.buckets.map((bucket) => bucket.key);

  // Five pairs, three answers, no answer more than twice: the three numbers
  // have to leave a day that can actually be built.
  if (puzzle.maxPerAnswer * keys.length < puzzle.pairsPerDay) {
    throw new Error(
      `dailyPuzzle: ${keys.length} answers capped at ${puzzle.maxPerAnswer} each cannot fill `
      + `${puzzle.pairsPerDay} pairs`,
    );
  }
  if (puzzle.pairsPerDay < keys.length) {
    throw new Error(
      `dailyPuzzle: ${puzzle.pairsPerDay} pairs cannot show all ${keys.length} answers in a day`,
    );
  }

  const weights = puzzle.singleSlotWeights;
  if (!weights || typeof weights !== 'object') {
    throw new Error('dailyPuzzle: singleSlotWeights is missing');
  }
  for (const key of keys) {
    if (!Number.isInteger(weights[key]) || weights[key] < 0) {
      throw new Error(`dailyPuzzle: singleSlotWeights.${key} must be a whole number of 0 or more`);
    }
  }
  for (const key of Object.keys(weights)) {
    if (!keys.includes(key)) {
      throw new Error(`dailyPuzzle: singleSlotWeights names "${key}", which is not one of the buckets`);
    }
  }
  if (keys.reduce((total, key) => total + weights[key], 0) <= 0) {
    throw new Error('dailyPuzzle: the singleSlotWeights are all zero, so no answer could take the single slot');
  }

  if (!Array.isArray(puzzle.relaxations) || puzzle.relaxations.length === 0) {
    throw new Error('dailyPuzzle: relaxations must be a non-empty list of no-repeat windows');
  }
  if (puzzle.relaxations[0] !== puzzle.noRepeatDays) {
    throw new Error(
      `dailyPuzzle: the first relaxation is ${puzzle.relaxations[0]} but noRepeatDays is `
      + `${puzzle.noRepeatDays}; the ladder has to start at the rule it relaxes`,
    );
  }
  for (const [i, days] of puzzle.relaxations.entries()) {
    if (!Number.isInteger(days) || days < 0) {
      throw new Error(`dailyPuzzle: relaxation ${i} must be a whole number of days of 0 or more`);
    }
    if (i > 0 && days >= puzzle.relaxations[i - 1]) {
      throw new Error('dailyPuzzle: the relaxations must get shorter, each one looser than the last');
    }
  }

  const surprise = puzzle.surprise;
  if (!surprise || !Number.isInteger(surprise.required) || surprise.required < 1) {
    throw new Error('dailyPuzzle: surprise.required must be a whole number of 1 or more');
  }
  if (!Array.isArray(surprise.kinds) || surprise.kinds.length === 0) {
    throw new Error('dailyPuzzle: surprise.kinds must be a non-empty list');
  }
  if (surprise.required > puzzle.pairsPerDay) {
    throw new Error('dailyPuzzle: more surprises are required than there are pairs in a day');
  }
  const kindKeys = new Set();
  for (const kind of surprise.kinds) {
    if (!kind || typeof kind.key !== 'string' || kind.key.length === 0) {
      throw new Error('dailyPuzzle: every surprise kind needs a key');
    }
    if (kindKeys.has(kind.key)) throw new Error(`dailyPuzzle: duplicate surprise kind ${kind.key}`);
    kindKeys.add(kind.key);
    if (!keys.includes(kind.bucket)) {
      throw new Error(
        `dailyPuzzle: surprise kind ${kind.key} names bucket "${kind.bucket}", which level `
        + `${source.id} does not have`,
      );
    }
    if (typeof kind.sameGroup !== 'boolean') {
      throw new Error(`dailyPuzzle: surprise kind ${kind.key} needs sameGroup true or false`);
    }
    // The sentence the screen shows. It lives here, not in the view, because it
    // is a claim about what the prices did over the puzzle's own window.
    if (typeof kind.line !== 'string' || kind.line.length === 0) {
      throw new Error(`dailyPuzzle: surprise kind ${kind.key} needs a "line" for the screen to show`);
    }
  }

  if (typeof puzzle.timeZone !== 'string' || puzzle.timeZone.length === 0) {
    throw new Error('dailyPuzzle: a timeZone is needed, or two devices could see different days');
  }
  return puzzle;
}

/** Which level the puzzle borrows its buckets from: "level 1" or a number. */
export function bucketLevelId(puzzle) {
  const from = puzzle?.bucketsFrom;
  if (Number.isInteger(from)) return from;
  const match = /^level\s+(\d+)$/.exec(String(from ?? ''));
  if (!match) {
    throw new Error(`dailyPuzzle: bucketsFrom should read "level N", got ${JSON.stringify(from)}`);
  }
  return Number(match[1]);
}

/** Level 1's buckets, as the puzzle answers in them. Throws if the file has no puzzle. */
export function puzzleBuckets(data) {
  const puzzle = validateDailyPuzzle(data);
  if (!puzzle) throw new Error('levels.json carries no dailyPuzzle block');
  return levelById(data, bucketLevelId(puzzle));
}

/** The tickers a kind covers, from levels.json, or an empty list if there is no such kind. */
export function kindTickers(data, kind) {
  const members = data.kinds?.[kind];
  return Array.isArray(members) ? [...members] : [];
}

/**
 * The floor a level puts on a kind of holding, as a rule the build can apply:
 * the kind, its share, and the tickers it covers. Null on a level without one,
 * which is every level but 6.
 */
export function kindFloorFor(level, data) {
  const rule = level.holdings?.minShareIn;
  if (!rule) return null;
  return { kind: rule.kind, share: rule.share, tickers: kindTickers(data, rule.kind) };
}

/**
 * The buckets, when a level scores its second star on naming one.
 *
 * They are listed from the top down, and ONLY THE LAST MAY HAVE NO FLOOR. A beta
 * has no lower bound - a portfolio of staples can move slightly against the AI
 * basket - so level 4's lowest bucket says `"min": null` rather than inventing a
 * floor. Any earlier bucket without one would swallow every value below it.
 */
/**
 * How a level draws its picker, which is one flag and only one.
 *
 * ABSENT MEANS GROUPED, so every level that says nothing keeps the headings it
 * has always had and only the level that opts out is different. Checked here
 * rather than left to the renderer because a typo - "grouping", "group" - would
 * silently restore the headings on the one level whose lesson depends on them
 * being gone, and nothing on the screen would look wrong.
 */
function validatePicker(level) {
  const picker = level.picker;
  if (picker === undefined) return;
  const where = `level ${level.id}`;
  if (typeof picker !== 'object' || picker === null || Array.isArray(picker)) {
    throw new Error(`${where}: picker must be an object`);
  }
  const keys = Object.keys(picker);
  if (keys.length !== 1 || keys[0] !== 'grouped') {
    throw new Error(`${where}: picker takes one key, "grouped", not ${keys.join(', ') || 'nothing'}`);
  }
  if (typeof picker.grouped !== 'boolean') {
    throw new Error(`${where}: picker.grouped must be true or false`);
  }
}

function validateBuckets(level) {
  if (!Array.isArray(level.buckets)) return;
  const where = `level ${level.id}`;
  if (level.buckets.length === 0) throw new Error(`${where}: buckets is empty`);
  let previous = null;
  for (const [i, bucket] of level.buckets.entries()) {
    if (typeof bucket.key !== 'string' || bucket.key.length === 0) {
      throw new Error(`${where}: bucket ${i} has no key`);
    }
    if (typeof bucket.label !== 'string' || bucket.label.length === 0) {
      throw new Error(`${where}: bucket ${bucket.key} has no label`);
    }
    const last = i === level.buckets.length - 1;
    if (bucket.min === null) {
      if (!last) throw new Error(`${where}: only the lowest bucket may have no floor; ${bucket.key} is not it`);
      continue;
    }
    if (!Number.isFinite(bucket.min)) throw new Error(`${where}: bucket ${bucket.key} needs a numeric min, or null if it is the lowest`);
    if (previous !== null && bucket.min >= previous) {
      throw new Error(`${where}: the buckets must run from the top down; ${bucket.key} at ${bucket.min} is not below ${previous}`);
    }
    previous = bucket.min;
  }
}

/**
 * The share card's words, which are the only text in this game that leaves the
 * browser. docs/PRD.md: "It includes stars and the headline number, never real
 * holdings."
 *
 * THE SPOILER RULE IS ENFORCED HERE, not only in a test. A level whose
 * portfolio is dealt from one of the Hypothesis 3 pools - level 2 and level 7 -
 * sends the same portfolio to other players, so its card says how close the
 * guess came and never the answer. A headline with {value} in it on such a
 * level would post the answer, so the file will not load with one.
 */
/**
 * The weekly challenge: ten portfolios, a first Monday, and a card that must
 * not give the week away.
 *
 * IT IS NOT A LEVEL and is not in the levels array - it has no place in the
 * ladder and earns nothing towards it - but it is LEVEL-SHAPED, so js/round.js,
 * the "Why?" cards and the share card work on it unchanged. What is checked
 * here is the part that is its own: the ten, the Monday, and the spoiler rule.
 *
 * WHAT IS NOT CHECKED HERE, deliberately: that no weekly portfolio is a pool
 * portfolio, and that the ten answers are spread far enough that one constant
 * guess cannot score. Both are properties of the PRICES as much as of the file,
 * so they live in tests/weekly.test.js where they are computed from
 * data/game.json - a market that moves the answers together should turn a test
 * run red, not stop the game from loading.
 */
export function validateWeekly(data) {
  const weekly = data.weekly;
  if (!weekly || typeof weekly !== 'object') throw new Error('weekly: the weekly block is missing');
  const where = 'weekly';

  if (!Array.isArray(weekly.portfolios) || weekly.portfolios.length !== WEEKLY_PORTFOLIOS) {
    throw new Error(
      `${where}: ${weekly.portfolios?.length ?? 0} portfolios, not ${WEEKLY_PORTFOLIOS}`,
    );
  }
  const ids = new Set();
  for (const portfolio of weekly.portfolios) {
    if (typeof portfolio.id !== 'string' || !/^w\d\d$/.test(portfolio.id)) {
      throw new Error(`${where}: "${portfolio.id}" is not a weekly id like w01`);
    }
    if (ids.has(portfolio.id)) throw new Error(`${where}: duplicate id ${portfolio.id}`);
    ids.add(portfolio.id);
    if (typeof portfolio.name !== 'string' || portfolio.name.length === 0) {
      throw new Error(`${where}: ${portfolio.id} has no name`);
    }
    const total = totalDollars(portfolio);
    if (total !== STARTING_DOLLARS) {
      throw new Error(`${where}: ${portfolio.id} allocates ${total} dollars, not ${STARTING_DOLLARS}`);
    }
    if (Object.keys(portfolio.dollars).length < 2) {
      throw new Error(`${where}: ${portfolio.id} holds one thing, which makes one bet by arithmetic`);
    }
  }

  // The week turns over on a Monday, so the date the cycle counts from has to
  // be one. A Tuesday here would put every later week half a week out.
  if (typeof weekly.firstMonday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(weekly.firstMonday)) {
    throw new Error(`${where}: firstMonday must be a YYYY-MM-DD date`);
  }
  const [y, m, d] = weekly.firstMonday.split('-').map(Number);
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 1) {
    throw new Error(`${where}: firstMonday ${weekly.firstMonday} is not a Monday`);
  }

  if (weekly.window?.anchor !== 'fridayBefore') {
    throw new Error(
      `${where}: the window must be anchored "fridayBefore", or two players in one week `
      + 'can be given different answers',
    );
  }
  if (!Number.isFinite(weekly.window.days) || !Number.isFinite(weekly.window.minDays)) {
    throw new Error(`${where}: the window needs days and minDays`);
  }

  // THE SPOILER RULE. Everybody has the same portfolio this week, so a card
  // naming the answer tells every player who has not gone yet. validateShare()
  // enforces the band wording; this insists the flag itself stays on.
  if (weekly.share?.hidesAnswer !== true) {
    throw new Error(
      `${where}: share.hidesAnswer must be true - every player has the same portfolio this `
      + 'week, so a card with the answer on it is a spoiler for all of them',
    );
  }
  validateGuess(weekly);
  validateStars(weekly);
  validateShare(weekly);
  return data;
}

function validateShare(level) {
  const where = `level ${level.id}`;
  const share = level.share;
  if (!share || typeof share.headline !== 'string' || share.headline.length === 0) {
    throw new Error(`${where}: share.headline is missing, so the level has no card to post`);
  }
  const dealt = level.holdings?.fixed === true;
  if (!dealt) {
    if (!share.headline.includes('{value}')) {
      throw new Error(`${where}: share.headline says nothing about the level's own measure ({value})`);
    }
    if (share.bands) throw new Error(`${where}: share.bands belongs to a level that hides its answer`);
    return;
  }

  // A dealt portfolio: bands, and not a number in sight.
  for (const token of ['{value}', '{holdings}']) {
    if (share.headline.includes(token)) {
      throw new Error(
        `${where} is dealt its portfolio from a pool, so its card cannot carry ${token}: `
        + 'another player can draw the same portfolio',
      );
    }
  }
  if (!share.headline.includes('{band}')) {
    throw new Error(`${where}: share.headline has no {band}, so the card would not say how close the guess was`);
  }
  // THE ENDING IS PER BAND, not per level. "Can you?" invites a friend to match
  // the result, which on the lowest band would be inviting them to do worse.
  if (!share.headline.includes('{ending}')) {
    throw new Error(`${where}: share.headline has no {ending}, so every band would end the same way`);
  }
  // Every star count the level can award needs words. A level that passes on
  // making a guess cannot score 0, and says so by having no "0" band.
  const lowest = level.pass.measure === 'guess' ? 1 : 0;
  for (let stars = lowest; stars <= 3; stars += 1) {
    if (typeof share.bands?.[String(stars)] !== 'string') {
      throw new Error(`${where}: share.bands has no band for ${stars} stars`);
    }
    if (typeof share.endings?.[String(stars)] !== 'string') {
      throw new Error(`${where}: share.endings has no ending for ${stars} stars`);
    }
  }
  for (const [what, block] of [['bands', share.bands], ['endings', share.endings]]) {
    for (const key of Object.keys(block)) {
      if (Number(key) < lowest) {
        throw new Error(`${where}: share.${what} has one for ${key} stars, which this level cannot award`);
      }
    }
  }
}

function validateStars(level) {
  const where = `level ${level.id}`;
  const stars = level.stars;
  if (!stars || stars.pass !== 1) throw new Error(`${where}: stars.pass must be 1`);
  for (const key of ['two', 'three']) {
    const band = stars[key];
    if (!band || typeof band.test !== 'string') throw new Error(`${where}: stars.${key}.test is missing`);
    if (!['within', 'bucket', 'countWithin'].includes(band.test)) {
      throw new Error(`${where}: stars.${key}.test must be "within", "bucket" or "countWithin"`);
    }
    if (band.test === 'within' && !Number.isFinite(band.of)) {
      throw new Error(`${where}: stars.${key}.of must be a number for a "within" test`);
    }
    if (band.test === 'bucket' && !Array.isArray(level.buckets)) {
      throw new Error(`${where}: a bucket test needs the level's buckets`);
    }
    if (band.test === 'countWithin') {
      if (!Number.isFinite(band.of)) {
        throw new Error(`${where}: stars.${key}.of must be a number for a "countWithin" test`);
      }
      const count = level.series?.count;
      if (!Number.isInteger(band.atLeast) || band.atLeast < 1) {
        throw new Error(`${where}: stars.${key}.atLeast must be a whole number of 1 or more`);
      }
      if (Number.isInteger(count) && band.atLeast > count) {
        throw new Error(
          `${where}: stars.${key} asks for ${band.atLeast} guesses within ${band.of} `
          + `but the level only asks ${count} questions`,
        );
      }
    }
  }
}

/**
 * Level 7's series: three portfolios in one level, each drawn from a named pool.
 *
 * THE FIRST PART IS THE REGISTERED ONE, and the check that it comes from
 * guessPool is not a formality. PREREG.md's Hypothesis 3 compares a player's
 * level-2 error with their error on "the first of level 7's mystery portfolios",
 * and that comparison is only the registered one while the first part draws from
 * the same pool of 20 level 2 does. A file that pointed part 1 somewhere else
 * would still play perfectly and would quietly stop measuring the hypothesis.
 */
function validateSeries(level, data = {}) {
  const where = `level ${level.id}`;
  const series = level.series;
  if (!series || !Number.isInteger(series.count) || series.count < 1) {
    throw new Error(`${where}: a series pass rule needs series.count, a whole number of 1 or more`);
  }
  if (!Array.isArray(series.parts) || series.parts.length !== series.count) {
    throw new Error(
      `${where}: series.parts must list ${series.count} parts, one per question`,
    );
  }
  const pools = { guessPool: data.guessPool, finalPool: data.finalPool };
  series.parts.forEach((part, index) => {
    const at = `${where}, series part ${index + 1}`;
    if (part.part !== index + 1) {
      throw new Error(`${at}: part should be numbered ${index + 1}, so the order in the file is the order played`);
    }
    if (typeof part.pool !== 'string' || !(part.pool in pools)) {
      throw new Error(`${at}: pool must name one of ${Object.keys(pools).join(' or ')}`);
    }
    if (!pools[part.pool]) throw new Error(`${at}: pool "${part.pool}" is not in this file`);
  });
  if (series.parts[0].pool !== 'guessPool') {
    throw new Error(
      `${where}: series part 1 must draw from guessPool. PREREG.md's Hypothesis 3 compares `
      + "level 2's error with the first of level 7's mystery portfolios, and that comparison "
      + `is only the registered one while part 1 comes from the pool of 20, not "${series.parts[0].pool}"`,
    );
  }
  if (series.parts[0].excludeSeen !== true) {
    throw new Error(
      `${where}: series part 1 must set excludeSeen, so a player is never asked the portfolio `
      + 'they already saw on level 2',
    );
  }
}

/**
 * The capstone pool: level 7's second and third portfolios.
 *
 * The check that earns its place here is the GAP between the strata. Level 7
 * passes on three guesses all within 1, so if the two bands came within 2 bets
 * of each other, one number would be within 1 of both and the capstone could be
 * passed without reading a single holding. That is a property of the data, and
 * data changes - so it is checked on load rather than trusted to the script that
 * wrote the file.
 */
export function validateFinalPool(pool, guessPool = null) {
  if (pool === undefined || pool === null) return null;     // a file without level 7 is still valid
  if (!Array.isArray(pool.portfolios)) throw new Error('levels: finalPool.portfolios is missing');
  if (!Array.isArray(pool.strata) || pool.strata.length !== 2) {
    throw new Error('levels: finalPool needs two strata, so one guess cannot cover both answers');
  }
  if (!Number.isFinite(pool.topWeightCap) || !(pool.topWeightCap > 0) || pool.topWeightCap > 1) {
    throw new Error('levels: finalPool.topWeightCap must be a share above 0 and at most 1');
  }

  const ids = new Set();
  const byStratum = new Map(pool.strata.map((s) => [s.key, []]));
  const seenIds = new Set((guessPool?.portfolios ?? []).map((p) => p.id));

  for (const portfolio of pool.portfolios) {
    if (!portfolio.id) throw new Error('levels: a capstone portfolio has no id');
    if (ids.has(portfolio.id)) throw new Error(`levels: duplicate capstone id ${portfolio.id}`);
    if (seenIds.has(portfolio.id)) {
      throw new Error(`levels: ${portfolio.id} is an id in both pools, so a drawn portfolio would be ambiguous`);
    }
    ids.add(portfolio.id);

    const total = totalDollars(portfolio);
    if (total !== STARTING_DOLLARS) {
      throw new Error(`levels: ${portfolio.id} allocates ${total} dollars, not ${STARTING_DOLLARS}`);
    }
    const dollars = Object.values(portfolio.dollars ?? {});
    const top = Math.max(...dollars) / STARTING_DOLLARS;
    if (top > pool.topWeightCap + BAND_TOLERANCE) {
      throw new Error(
        `levels: ${portfolio.id} puts ${(100 * top).toFixed(0)}% in one holding, over the `
        + `${(100 * pool.topWeightCap).toFixed(0)}% cap - concentration, not spread, would be `
        + 'earning its answer',
      );
    }
    if (!byStratum.has(portfolio.stratum)) {
      throw new Error(`levels: ${portfolio.id} names stratum "${portfolio.stratum}", which finalPool does not carry`);
    }
    if (!Number.isFinite(portfolio.expectedBets)) {
      throw new Error(`levels: ${portfolio.id} has no expectedBets`);
    }
    byStratum.get(portfolio.stratum).push(portfolio);
  }

  for (const stratum of pool.strata) {
    const here = byStratum.get(stratum.key);
    if (here.length !== stratum.slots) {
      throw new Error(
        `levels: the ${stratum.key} stratum holds ${here.length} portfolios, not its ${stratum.slots} slots`,
      );
    }
    for (const portfolio of here) {
      const bets = portfolio.expectedBets;
      if (bets < stratum.min - BAND_TOLERANCE || bets > stratum.max + BAND_TOLERANCE) {
        throw new Error(
          `levels: ${portfolio.id} makes ${bets.toFixed(3)} bets, outside its own ${stratum.key} `
          + `stratum of ${stratum.min} to ${stratum.max}`,
        );
      }
    }
  }

  // The gap, measured on the portfolios themselves rather than on the declared
  // bands: the bands are a claim, the answers are the fact.
  const [a, b] = pool.strata.map((s) => byStratum.get(s.key).map((p) => p.expectedBets));
  const gap = Math.min(...b) - Math.max(...a);
  const spread = Math.abs(gap);
  if (spread <= 2) {
    throw new Error(
      `levels: the capstone strata are only ${spread.toFixed(3)} bets apart, so a single guess `
      + 'would be within 1 of both and level 7 could be passed without reading the portfolios',
    );
  }
  return pool;
}

/**
 * Level 7's verdict, over the three guesses together.
 *
 * `answers` is one entry per part, in the order played: {guess, actual}. A part
 * not yet guessed is left out, and the verdict of an unfinished series is not a
 * verdict - `complete` says so, and `passed` is false until every part is in.
 *
 * THE BANDS, and why they are not the usual two. The pass rule is already "every
 * guess within 1", which is the same thing the 2-star band says on levels 2 and
 * 3, so reusing it here would hand 2 stars to everyone who passed. Level 7
 * therefore counts how many guesses landed within half a bet: 1 star for
 * passing, 2 for two of the three, 3 for all three. Both numbers - 1 and 0.5 -
 * are the bands docs/PRD.md already gives a level whose answer is a bets count;
 * only what is counted is new.
 */
export function seriesVerdict(level, answers) {
  const rule = level.pass;
  if (rule.measure !== 'series') {
    throw new Error(`seriesVerdict: level ${level.id} does not pass on a series`);
  }
  const count = level.series.count;
  const parts = answers.map(({ guess, actual }) => {
    const error = Number.isFinite(guess) && Number.isFinite(actual)
      ? Math.abs(guess - actual)
      : null;
    return {
      guess,
      actual,
      error,
      // The same 1e-9 slack every star band gives a guess, and for the same
      // reason: binary floating point should not decide a level.
      within: error !== null && error <= rule.of + BAND_TOLERANCE,
    };
  });

  const complete = parts.length === count && parts.every((p) => p.error !== null);
  const passed = complete && parts.every((p) => p.within);

  let stars = 0;
  if (passed) {
    stars = level.stars.pass;
    for (const [band, value] of [[level.stars.two, 2], [level.stars.three, 3]]) {
      if (band.test !== 'countWithin') {
        throw new Error(`seriesVerdict: level ${level.id} needs countWithin star bands, got "${band.test}"`);
      }
      const tight = parts.filter((p) => p.error !== null && p.error <= band.of + BAND_TOLERANCE).length;
      if (tight >= band.atLeast && value > stars) stars = value;
    }
  }

  return {
    parts,
    complete,
    passed,
    stars,
    /** How many landed inside the pass band, for the line the screen reads out. */
    withinPassBand: parts.filter((p) => p.within).length,
    /** The worst guess decides the level, so it is worth naming. */
    worstError: parts.some((p) => p.error === null)
      ? null
      : Math.max(...parts.map((p) => p.error)),
  };
}

function validateGuessPool(pool) {
  if (!pool || !Array.isArray(pool.portfolios)) throw new Error('levels: guessPool.portfolios is missing');
  if (pool.portfolios.length !== 20) {
    throw new Error(`levels: the guess pool holds ${pool.portfolios.length} portfolios, not 20`);
  }
  const ids = new Set();
  for (const portfolio of pool.portfolios) {
    if (!portfolio.id) throw new Error('levels: a pool portfolio has no id');
    if (ids.has(portfolio.id)) throw new Error(`levels: duplicate pool id ${portfolio.id}`);
    ids.add(portfolio.id);
    const total = totalDollars(portfolio);
    if (total !== STARTING_DOLLARS) {
      throw new Error(`levels: ${portfolio.id} allocates ${total} dollars, not ${STARTING_DOLLARS}`);
    }
  }
}

/** The dollars in a pool portfolio, summed. Integers, so the sum is exact. */
export function totalDollars(portfolio) {
  return Object.values(portfolio.dollars ?? {}).reduce((sum, d) => sum + d, 0);
}

/** A level by id, or an error naming what was asked for. */
export function levelById(data, id) {
  const level = data.levels.find((l) => l.id === id);
  if (!level) throw new Error(`levels: no level ${id} in this file`);
  return level;
}

// ------------------------------------------------------------------ money

/**
 * Dollar amounts to weights. The game's input is dollars out of 10,000, because
 * that is what the player types; every measure wants weights.
 */
export function weightsFromDollars(dollars) {
  const tickers = Object.keys(dollars);
  const total = tickers.reduce((sum, t) => sum + dollars[t], 0);
  if (!(total > 0)) throw new Error('weightsFromDollars: nothing is allocated');
  return { tickers, weights: tickers.map((t) => dollars[t] / total) };
}

// ------------------------------------------------------------------ passing

/**
 * Did this result pass?
 *
 * The comparison is against the UNROUNDED measure. Nothing here rounds, and
 * nothing that rounds is allowed upstream of it.
 *
 * A MEASURE WITHIN BAND_TOLERANCE OF THE THRESHOLD COUNTS AS EQUAL TO IT, which
 * is the same 1e-9 slack the star bands already give a guess, and for the same
 * reason: binary floating point should not decide a level.
 *
 * Level 6 is where this stopped being theoretical. Two portfolios that both fell
 * half as far as the index - 20% against the index's 40%, and 25% against 50% -
 * come out at 0.4999999999999999 and 0.5, because 8000/10000 - 1 is not exactly
 * -0.2. Both are shown as "0.5000" by formatMeasure(), as docs/PRD.md's display
 * rule requires, and without this slack one of them would have passed "< 0.50"
 * and the other missed it while the screen said the same number. Now both miss:
 * a portfolio that fell exactly half as much did not fall LESS than half as much.
 *
 * The slack cuts the player's way on an inclusive comparison and against them on
 * a strict one, which is what "counts as equal" means. It cannot change a result
 * that is not within a billionth of its threshold, and no real measure in this
 * game sits there by anything but arithmetic.
 */
export function passes(level, measured) {
  const rule = level.pass;
  if (rule.measure === 'guess') return true;        // level 2 passes on making a guess
  if (!Number.isFinite(measured)) return false;
  const equal = Math.abs(measured - rule.threshold) <= BAND_TOLERANCE;
  switch (rule.comparison) {
    case '>=': return equal || measured >= rule.threshold;
    case '>': return !equal && measured > rule.threshold;
    case '<=': return equal || measured <= rule.threshold;
    case '<': return !equal && measured < rule.threshold;
    default: throw new Error(`passes: unknown comparison ${rule.comparison}`);
  }
}

/**
 * Which of a level's buckets a value falls in: level 1's "Same bet?" buckets,
 * level 4's AI-bet bands, level 5's risk-share bands.
 *
 * The buckets run from the top down, and a `min` of null is a bucket with no
 * floor, which is how level 4 words "anything below 0.50" - a beta has no lower
 * bound to name.
 */
export function bucketOf(level, value) {
  if (!Array.isArray(level.buckets)) throw new Error(`level ${level.id}: no buckets`);
  if (!Number.isFinite(value)) return null;
  for (const bucket of level.buckets) {
    if (bucket.min === null || value >= bucket.min) return bucket.key;
  }
  return level.buckets[level.buckets.length - 1].key;
}

/**
 * Stars for a guess: 1 for passing, then the level's two bands.
 *
 * A failed level scores 0, however good the guess was: the guess is the lesson,
 * but the stars are for the portfolio.
 */
export function starsFor(level, { guess, actual, passed }) {
  if (!passed) return 0;
  let stars = level.stars.pass;
  for (const [band, count] of [[level.stars.two, 2], [level.stars.three, 3]]) {
    if (meetsBand(level, band, guess, actual) && count > stars) stars = count;
  }
  return stars;
}

/**
 * WHICH of the two bands a guess met, rather than how many stars it was worth.
 *
 * THE TWO QUESTIONS COME APART, and only on the levels whose bands are of
 * different kinds. starsFor() above takes the BEST band met, so a guess can
 * reach the three-star band without having met the two-star one - level 1's
 * 0.69 against an actual 0.71 is within 0.10 and in the wrong bucket, and
 * scores the full three. Levels 2, 3 and 7 cannot do this: "within half a bet"
 * implies "within 1 bet" and three guesses inside a band are also two, so on
 * those the count tells you the bands and nothing is lost by reading it off.
 * On levels 1, 4, 5 and 6 it is not, and a screen that infers the bands from
 * the count tells a player they named the right bucket when they did not.
 *
 * ONE GUESS, so not for level 7: a countWithin band is about three answers
 * together and cannot be settled from a single guess and a single actual.
 * meetsBand() throws on it rather than guessing, which is what a caller that
 * reached here with a series would deserve. js/game.js's seriesStarsExplanation
 * is the one for that level.
 */
export function bandsMet(level, { guess, actual }) {
  return {
    two: meetsBand(level, level.stars.two, guess, actual),
    three: meetsBand(level, level.stars.three, guess, actual),
  };
}

function meetsBand(level, band, guess, actual) {
  if (!Number.isFinite(guess) || !Number.isFinite(actual)) return false;
  if (band.test === 'within') return Math.abs(guess - actual) <= band.of + BAND_TOLERANCE;
  if (band.test === 'bucket') return bucketOf(level, guess) === bucketOf(level, actual);
  throw new Error(`starsFor: unknown band test ${band.test}`);
}

// ------------------------------------------------------------------ display

/**
 * A guess, written the way its level's slider reads it.
 *
 * Level 5's guess is a share of 1 and reads as a whole percent, so the slider
 * says "38%" and not "0.38". Everything else is a plain number to the level's own
 * number of places. The reveal screen formats the ANSWER through formatMeasure()
 * instead, because that one is compared against a threshold.
 */
export function formatGuess(level, value) {
  if (!Number.isFinite(value)) return '—';
  const { display, places } = displayFor(level);
  if (display === 'percent') return withMinus(`${(100 * value).toFixed(0)}%`);
  return withMinus(value.toFixed(places));
}

/**
 * How a level's answer is written down, from levels.json: its display, its
 * decimal places and the step its slider moves in.
 *
 * Read from the GUESS, because the guess and the answer are the same measure on
 * every level that has one to compare. Level 2's pass rule is the guess itself,
 * so there is no second measure to disagree with.
 */
export function displayFor(level) {
  const guess = level.guess ?? {};
  return {
    display: guess.display ?? 'number',
    places: guess.places ?? 2,
    step: guess.step ?? 0.01,
    /**
     * How many decimals the REVEALED answer gets, which is not always how many
     * the guess gets. Two everywhere except level 1, where a correlation of
     * 0.9962 would read "1.00" - a claim that two holdings move together
     * perfectly, on a number that is not that. Every screen that states the
     * answer reads this one value, so none of them can disagree.
     */
    revealPlaces: level.revealPlaces ?? REVEAL_PLACES,
  };
}

/**
 * The measure, the threshold and the verdict as one line of text, formatted
 * together so they always tell the same story. The threshold is printed to the
 * same number of decimals as the measure, so a near miss does not read as
 * "0.7996 misses the 0.8 needed" with two different precisions side by side.
 */
export function resultLine(level, measured, { places = null, display = null } = {}) {
  const rule = level.pass;
  // Neither of the rules that are about guesses rather than quantities has a
  // threshold for one number to clear: level 2 passes on making a guess, and
  // level 7 on all three landing within 1, which is a line the series writes
  // once, not a line each part writes about itself.
  if (rule.measure === 'guess' || rule.measure === 'series') return null;
  // The DISPLAY comes from the level, because percent-or-not is a property of the
  // measure and the whole screen has to agree on it. The DECIMAL PLACES do not:
  // levels.json's guess.places describes the slider, which moves in tenths of a
  // bet, while the revealed number is worth two decimals. Reading places off the
  // level here would quietly turn level 3's "3.07 bets" into "3.1 bets".
  const asNumber = display ?? displayFor(level).display;
  // The level's own reveal places, so this line and the panel above it round
  // the same number the same way. Level 1 shows three.
  const decimals = places ?? displayFor(level).revealPlaces;
  const shown = formatMeasure(measured, {
    threshold: rule.threshold, places: decimals, display: asNumber,
  });
  // The threshold is printed to the same precision as the measure, so a near miss
  // never reads as "0.7996 misses the 0.8 needed" with two precisions side by side.
  // Counted off the text rather than taken from `places`, because a percent with
  // nothing after the point is shown to no decimals at all: "27% clears the 35%
  // needed", not "27% clears the 35.00% needed".
  const shownPlaces = shown.replace('%', '').split('.')[1]?.length ?? 0;
  const asThreshold = asNumber === 'percent'
    ? `${(100 * rule.threshold).toFixed(shownPlaces)}%`
    : rule.threshold.toFixed(shownPlaces);
  const comparison = passes(level, measured) ? 'clears' : 'misses';
  return `${shown} ${comparison} the ${asThreshold} needed`;
}
