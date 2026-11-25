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
      if (!['>=', '<=', '>', '<'].includes(level.pass.comparison)) {
        throw new Error(`${where}: pass.comparison must be one of >= <= > <`);
      }
      if (!Number.isFinite(level.pass.threshold)) {
        throw new Error(`${where}: pass.threshold must be a number`);
      }
    }
    if (!level.guess || typeof level.guess.measure !== 'string') {
      throw new Error(`${where}: a guess with a measure is missing - every level asks for one`);
    }
    validateStars(level);
  }

  validateGuessPool(data.guessPool);
  return data;
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

/** Which "Same bet?" bucket a correlation falls in. */
export function bucketOf(level, value) {
  if (!Array.isArray(level.buckets)) throw new Error(`level ${level.id}: no buckets`);
  if (!Number.isFinite(value)) return null;
  for (const bucket of level.buckets) {
    if (value >= bucket.min) return bucket.key;
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
export function formatMeasure(value, { threshold = null, places = 2, closePlaces = 4 } = {}) {
  if (!Number.isFinite(value)) return '—';
  if (threshold !== null && Number.isFinite(threshold)) {
    const near = Math.abs(value - threshold) <= CLOSE_TO_THRESHOLD;
    const collides = value.toFixed(places) === threshold.toFixed(places) && value !== threshold;
    if (near || collides) return value.toFixed(closePlaces);
  }
  return value.toFixed(places);
}

/**
 * The measure, the threshold and the verdict as one line of text, formatted
 * together so they always tell the same story. The threshold is printed to the
 * same number of decimals as the measure, so a near miss does not read as
 * "0.7996 misses the 0.8 needed" with two different precisions side by side.
 */
export function resultLine(level, measured, { places = 2 } = {}) {
  const rule = level.pass;
  if (rule.measure === 'guess') return null;
  const shown = formatMeasure(measured, { threshold: rule.threshold, places });
  const shownPlaces = shown.split('.')[1]?.length ?? places;
  const asThreshold = rule.threshold.toFixed(shownPlaces);
  const comparison = passes(level, measured) ? 'clears' : 'misses';
  return `${shown} ${comparison} the ${asThreshold} needed`;
}
