// js/levels.js - the level rules, read from levels.json.
//
// This file holds no thresholds and no level text: every rule is data in
// levels.json, so an instructor or a reviewer can read what the game checks
// without reading code. What lives here is the logic that applies those rules,
// and it is pure - no DOM, no fetch, no prices.

export const LEVELS_URL = 'levels.json';
export const DISCLAIMER = 'Educational, not investment advice.';

/** The pretend money a player allocates, in dollars. */
export const STARTING_DOLLARS = 10000;

/**
 * How close to a threshold a result has to be before it is shown to 4 decimals
 * instead of 2. docs/PRD.md: "A displayed number never disagrees with the pass
 * check." VTI and VXUS correlate at 0.800 over the current window, so this is
 * not a hypothetical.
 */
export const CLOSE_TO_THRESHOLD = 0.005;

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
export const MEASURES = ['correlation', 'effectiveBets', 'beta', 'maxRiskShare'];

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
    if (level.pass.measure !== 'guess') {
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
    validateHoldings(level);
    validateBuckets(level);
    validateStars(level);
  }

  validateGuessPool(data.guessPool);
  return data;
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
function validateHoldings(level) {
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
}

/**
 * The buckets, when a level scores its second star on naming one.
 *
 * They are listed from the top down, and ONLY THE LAST MAY HAVE NO FLOOR. A beta
 * has no lower bound - a portfolio of staples can move slightly against the AI
 * basket - so level 4's lowest bucket says `"min": null` rather than inventing a
 * floor. Any earlier bucket without one would swallow every value below it.
 */
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

function validateStars(level) {
  const where = `level ${level.id}`;
  const stars = level.stars;
  if (!stars || stars.pass !== 1) throw new Error(`${where}: stars.pass must be 1`);
  for (const key of ['two', 'three']) {
    const band = stars[key];
    if (!band || typeof band.test !== 'string') throw new Error(`${where}: stars.${key}.test is missing`);
    if (!['within', 'bucket'].includes(band.test)) {
      throw new Error(`${where}: stars.${key}.test must be "within" or "bucket"`);
    }
    if (band.test === 'within' && !Number.isFinite(band.of)) {
      throw new Error(`${where}: stars.${key}.of must be a number for a "within" test`);
    }
    if (band.test === 'bucket' && !Array.isArray(level.buckets)) {
      throw new Error(`${where}: a bucket test needs the level's buckets`);
    }
  }
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
 */
export function passes(level, measured) {
  const rule = level.pass;
  if (rule.measure === 'guess') return true;        // level 2 passes on making a guess
  if (!Number.isFinite(measured)) return false;
  switch (rule.comparison) {
    case '>=': return measured >= rule.threshold;
    case '>': return measured > rule.threshold;
    case '<=': return measured <= rule.threshold;
    case '<': return measured < rule.threshold;
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

function meetsBand(level, band, guess, actual) {
  if (!Number.isFinite(guess) || !Number.isFinite(actual)) return false;
  if (band.test === 'within') return Math.abs(guess - actual) <= band.of + BAND_TOLERANCE;
  if (band.test === 'bucket') return bucketOf(level, guess) === bucketOf(level, actual);
  throw new Error(`starsFor: unknown band test ${band.test}`);
}

// ------------------------------------------------------------------ display

/**
 * Format a measure so that what it shows can never contradict the pass check.
 *
 * A result within CLOSE_TO_THRESHOLD of its threshold, or one that would round
 * to the same text as the threshold, is shown to 4 decimals. So 0.7996 against a
 * 0.8 threshold reads "0.7996" and fails, rather than reading "0.80" and failing.
 */
export function formatMeasure(value, {
  threshold = null, places = 2, closePlaces = 4, display = 'number',
} = {}) {
  if (!Number.isFinite(value)) return '—';
  if (display === 'percent') return formatPercentMeasure(value, threshold);
  if (display !== 'number') throw new Error(`formatMeasure: unknown display "${display}"`);
  if (threshold !== null && Number.isFinite(threshold)) {
    const near = Math.abs(value - threshold) <= CLOSE_TO_THRESHOLD;
    const collides = value.toFixed(places) === threshold.toFixed(places) && value !== threshold;
    if (near || collides) return value.toFixed(closePlaces);
  }
  return value.toFixed(places);
}

/**
 * A share of 1, shown as a percent, under the same rule.
 *
 * The closeness test is done in the measure's own units, where CLOSE_TO_THRESHOLD
 * is 0.005 - half a percentage point, which is exactly the width a whole percent
 * can round across. So a biggest risk share of 0.3549 against level 5's 35%
 * reads "35.49%" and fails, never "35%" and fails.
 */
function formatPercentMeasure(value, threshold) {
  const places = 0;
  const closePlaces = 2;
  if (threshold !== null && Number.isFinite(threshold)) {
    const near = Math.abs(value - threshold) <= CLOSE_TO_THRESHOLD;
    const collides = (100 * value).toFixed(places) === (100 * threshold).toFixed(places)
      && value !== threshold;
    if (near || collides) return `${(100 * value).toFixed(closePlaces)}%`;
  }
  return `${(100 * value).toFixed(places)}%`;
}

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
  if (display === 'percent') return `${(100 * value).toFixed(0)}%`;
  return value.toFixed(places);
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
  };
}

/**
 * The measure, the threshold and the verdict as one line of text, formatted
 * together so they always tell the same story. The threshold is printed to the
 * same number of decimals as the measure, so a near miss does not read as
 * "0.7996 misses the 0.8 needed" with two different precisions side by side.
 */
export function resultLine(level, measured, { places = 2, display = null } = {}) {
  const rule = level.pass;
  if (rule.measure === 'guess') return null;
  // The DISPLAY comes from the level, because percent-or-not is a property of the
  // measure and the whole screen has to agree on it. The DECIMAL PLACES do not:
  // levels.json's guess.places describes the slider, which moves in tenths of a
  // bet, while the revealed number is worth two decimals. Reading places off the
  // level here would quietly turn level 3's "3.07 bets" into "3.1 bets".
  const asNumber = display ?? displayFor(level).display;
  const decimals = places;
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
