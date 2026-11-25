// js/round.js - one round: build, guess, reveal.
//
// docs/PRD.md's core loop is "Build ($10,000 pretend money) -> Guess the number
// of bets -> Reveal (from real prices) -> Why? card -> Stars". This file is that
// loop as a state machine, and nothing else: no DOM, no fetch, no level text and
// no thresholds. Every rule it applies is data in levels.json, read through
// js/levels.js; every price it uses comes from data/game.json, read through
// js/gameView.js.
//
// THE GUESS COMES FIRST, and the PRD says why: "Predicting and then being
// corrected is the main learning moment." So reveal() refuses to run before a
// guess has been made. The guess also starts as null rather than at the middle
// of its range, so a player is never shown a number to anchor on - the screen
// has nothing to show until they move the slider themselves.
//
// WHAT THE STATE MACHINE REFUSES, and why each one is a real mistake:
//   - revealing before a guess: it would throw away the lesson;
//   - revealing a build that breaks the level's holdings rule: it would score a
//     portfolio the level did not ask for;
//   - a guess outside the level's own range: the star bands assume the range;
//   - a window shorter than levels.json's 252-day minimum: a measure over fewer
//     days than that is not trustworthy, so it is refused rather than shown.
//
// Educational, not investment advice.

import { correlation, covariance, effectiveBets } from './math.js';
import { gameWindow, windowMatrix } from './gameView.js';
import {
  bucketOf,
  levelById,
  passes,
  resultLine,
  starsFor,
  weightsFromDollars,
  formatMeasure,
} from './levels.js';

/** The three screens of a round, in the order the PRD puts them. */
export const BUILD = 'build';
export const GUESS = 'guess';
export const REVEAL = 'reveal';

/**
 * The measures whose value depends on how the money is split.
 *
 * Level 1's answer is a correlation between two holdings, which is the same
 * number whatever the split, so level 1 asks for no allocation: it would be taps
 * that change nothing. Effective bets does depend on the weights, so levels 2
 * and 3 carry dollars.
 */
export const WEIGHTED_MEASURES = new Set(['effectiveBets']);

/** The money a player allocates, and the step the buttons move it in. */
export const DOLLAR_STEP = 100;

/** Does this level ask the player to split the money? */
export function usesMoney(level) {
  return WEIGHTED_MEASURES.has(level.guess.measure) || WEIGHTED_MEASURES.has(level.pass.measure);
}

/** Is the portfolio fixed by the level rather than built by the player? */
export function isFixed(level) {
  return level.holdings?.fixed === true;
}

/** How many holdings this level wants, or null if it does not say. */
export function holdingsWanted(level) {
  return Number.isInteger(level.holdings?.exactly) ? level.holdings.exactly : null;
}

/**
 * The tickers a player may pick from on this level.
 *
 * "all" means the whole ticker list, which is what level 3 asks for: three real
 * bets needs all nine groups available. A list in levels.json means that list,
 * which is what level 1's 14 curated names are.
 */
export function poolFor(level, universe) {
  if (level.pool === 'all') return [...universe];
  if (Array.isArray(level.pool)) return [...level.pool];
  return [];
}

/**
 * $10,000 split as evenly as whole $100 steps allow, biggest shares first.
 *
 * Five holdings divide exactly; three do not, and 3,400/3,300/3,300 is what a
 * player would type. The parts are whole dollars so they sum to exactly 10,000
 * and no weight vector has to be checked for drift.
 */
export function evenSplit(tickers, total, step = DOLLAR_STEP) {
  const n = tickers.length;
  if (n === 0) throw new Error('evenSplit: nothing to split between');
  const steps = Math.round(total / step);
  if (steps < n) throw new Error(`evenSplit: ${total} does not divide into ${n} steps of ${step}`);
  const each = Math.floor(steps / n);
  let left = steps - each * n;
  const dollars = {};
  for (const ticker of tickers) {
    dollars[ticker] = (each + (left > 0 ? 1 : 0)) * step;
    if (left > 0) left -= 1;
  }
  return dollars;
}

/**
 * Pick one of the 20 pool portfolios.
 *
 * PREREG.md gives level 2 and level 7's first mystery portfolio one shared pool
 * "so on average they are equally hard", which holds only if the draw is
 * uniform. `random` is injected so tests can pin the draw; the game passes
 * Math.random.
 */
export function drawFromPool(guessPool, random = Math.random) {
  const portfolios = guessPool?.portfolios;
  if (!Array.isArray(portfolios) || portfolios.length === 0) {
    throw new Error('drawFromPool: the guess pool is empty');
  }
  const index = Math.floor(random() * portfolios.length);
  const chosen = portfolios[Math.min(Math.max(index, 0), portfolios.length - 1)];
  return { id: chosen.id, dollars: { ...chosen.dollars } };
}

/**
 * The level's measure for a portfolio, computed from the live game data.
 *
 * Returns the unrounded value. Nothing here rounds, and js/levels.js compares
 * the unrounded value against the threshold: docs/PRD.md requires that a
 * displayed number never disagrees with the pass check.
 */
export function measureFor(level, game, { tickers, weights }, window) {
  const measure = level.pass.measure === 'guess' ? level.guess.measure : level.pass.measure;
  const slice = gameWindow(game, tickers, window.days);
  if (slice.days < window.minDays) {
    throw new Error(
      `${tickers.join(', ')} overlap on only ${slice.days} trading days, fewer than the `
      + `${window.minDays} this game needs, so no measure would be trustworthy`,
    );
  }
  const matrix = windowMatrix(slice, tickers);

  let value;
  if (measure === 'correlation') {
    if (tickers.length !== 2) {
      throw new Error(`measureFor: a correlation needs exactly 2 holdings, not ${tickers.length}`);
    }
    value = correlation(matrix)[0][1];
  } else if (measure === 'effectiveBets') {
    value = effectiveBets(weights, covariance(matrix));
  } else {
    throw new Error(`measureFor: level ${level.id} asks for an unknown measure "${measure}"`);
  }

  return {
    measure,
    value,
    days: slice.days,
    startDate: slice.startDate,
    endDate: slice.endDate,
  };
}

/**
 * Start a round.
 *
 * @param {object} options.levels    levels.json, parsed and validated
 * @param {number} options.levelId   which level
 * @param {object} options.game      data/game.json, parsed
 * @param {string[]} options.universe the whole ticker list, for a level whose pool is "all"
 * @param {Function} options.random  the draw for level 2's portfolio
 */
export function createRound({ levels, levelId, game, universe = [], random = Math.random }) {
  const level = levelById(levels, levelId);
  const window = {
    days: levels.window?.days ?? 756,
    minDays: levels.window?.minDays ?? 252,
  };
  const total = levels.startingDollars ?? 10000;
  const pool = poolFor(level, universe);
  const wanted = holdingsWanted(level);

  // Level 2's portfolio is drawn here, once, when the round starts. The id is
  // kept so a later session can keep level 7 from drawing the same portfolio: it
  // would measure a player's memory rather than their learning. Progress is in
  // memory only for now, so this lives on the round and nowhere else.
  const drawn = isFixed(level) ? drawFromPool(levels.guessPool, random) : null;

  const round = {
    level,
    levelId: level.id,
    state: BUILD,
    pool,
    wanted,
    total,
    window,
    usesMoney: usesMoney(level),
    fixed: isFixed(level),
    /** Which of the 20 pool portfolios was drawn, or null on a level that builds its own. */
    drawnId: drawn ? drawn.id : null,
    /** The player's picks, in the order they were picked. */
    picks: drawn ? Object.keys(drawn.dollars) : [],
    /** Dollars per holding, whole dollars summing to the total. Empty when a level uses no money. */
    dollars: drawn ? { ...drawn.dollars } : {},
    /** Null until the player moves the slider: nothing is shown to anchor on. */
    guess: null,
    /** Filled in by reveal(). */
    result: null,
  };

  // ------------------------------------------------------------ building

  /** Is this ticker in the player's portfolio? */
  round.hasPick = (ticker) => round.picks.includes(ticker);

  /** Can another holding be added? */
  round.canAddPick = () => !round.fixed && (wanted === null || round.picks.length < wanted);

  /**
   * Add or remove a holding. Returns the round, so the caller can redraw.
   *
   * Picking a holding a level's pool does not carry is a bug in the caller, not
   * a player mistake, so it throws rather than being ignored quietly.
   */
  round.togglePick = (ticker) => {
    if (round.fixed) throw new Error(`level ${level.id}: the portfolio is fixed and cannot be changed`);
    if (round.state === REVEAL) throw new Error('the round is over; the build cannot change');
    if (!pool.includes(ticker)) throw new Error(`level ${level.id}: ${ticker} is not in this level's pool`);

    if (round.hasPick(ticker)) {
      round.picks = round.picks.filter((t) => t !== ticker);
    } else {
      if (!round.canAddPick()) return round;
      round.picks = [...round.picks, ticker];
    }
    // The money follows the holdings: a changed line-up gets an even split
    // again, which is the plainest starting point and the one a player can then
    // nudge in $100 steps.
    round.dollars = round.usesMoney && round.picks.length > 0
      ? evenSplit(round.picks, total)
      : {};
    return round;
  };

  /** Is the build ready - the right number of holdings, and the money adding up? */
  round.buildComplete = () => {
    if (wanted !== null && round.picks.length !== wanted) return false;
    if (round.picks.length === 0) return false;
    if (!round.usesMoney) return true;
    return round.allocated() === total && round.picks.every((t) => round.dollars[t] > 0);
  };

  /** What the player has allocated so far, in whole dollars. */
  round.allocated = () => round.picks.reduce((sum, t) => sum + (round.dollars[t] ?? 0), 0);

  /**
   * Move one holding's dollars by whole $100 steps, taking the difference from
   * the other holdings so the total stays at exactly $10,000.
   *
   * A holding never goes to zero: a 5-holding portfolio with a zero in it is a
   * 4-holding portfolio, and the level asked for 5. Returns how many steps it
   * could actually move, which is fewer than asked for when the others have
   * nothing left to give.
   */
  round.adjustDollars = (ticker, steps, step = DOLLAR_STEP) => {
    if (!round.usesMoney) throw new Error(`level ${level.id} allocates no money`);
    if (round.fixed) throw new Error(`level ${level.id}: the portfolio is fixed and cannot be changed`);
    if (round.state === REVEAL) throw new Error('the round is over; the money cannot change');
    if (!round.hasPick(ticker)) throw new Error(`${ticker} is not in this portfolio`);
    if (!Number.isInteger(steps)) throw new Error('adjustDollars: steps must be a whole number');

    const others = round.picks.filter((t) => t !== ticker);
    if (others.length === 0) return 0;

    let moved = 0;
    const direction = Math.sign(steps);
    for (let i = 0; i < Math.abs(steps); i += 1) {
      if (direction > 0) {
        // Take a step from the largest other holding that can spare one.
        const from = others
          .filter((t) => round.dollars[t] - step >= step)
          .sort((a, b) => round.dollars[b] - round.dollars[a])[0];
        if (from === undefined) break;
        round.dollars[from] -= step;
        round.dollars[ticker] += step;
      } else {
        if (round.dollars[ticker] - step < step) break;
        const to = others.sort((a, b) => round.dollars[a] - round.dollars[b])[0];
        round.dollars[ticker] -= step;
        round.dollars[to] += step;
      }
      moved += 1;
    }
    return moved;
  };

  /** Move from building to guessing. */
  round.toGuess = () => {
    if (!round.buildComplete()) {
      throw new Error(
        wanted === null
          ? 'the portfolio is not ready yet'
          : `level ${level.id} wants exactly ${wanted} holdings; this has ${round.picks.length}`,
      );
    }
    round.state = GUESS;
    return round;
  };

  /** Back to the build, with the guess thrown away rather than carried over. */
  round.toBuild = () => {
    if (round.state === REVEAL) throw new Error('the round is over');
    round.state = BUILD;
    round.guess = null;
    return round;
  };

  // -------------------------------------------------------------- guessing

  /** The range the slider runs over, from levels.json. */
  round.guessRange = () => ({ min: level.guess.min, max: level.guess.max });

  /**
   * Record the player's guess. Until this is called the guess is null, the
   * screen shows no number, and reveal() refuses to run.
   */
  round.setGuess = (value) => {
    if (round.state === REVEAL) throw new Error('the round is over; the guess cannot change');
    if (!Number.isFinite(value)) throw new Error('a guess has to be a number');
    const { min, max } = round.guessRange();
    if (value < min || value > max) {
      throw new Error(`a guess of ${value} is outside this level's range of ${min} to ${max}`);
    }
    round.guess = value;
    return round;
  };

  /** Has the player committed to a guess? */
  round.hasGuessed = () => round.guess !== null;

  /** Can the reveal happen? Not until the build is done and a guess is in. */
  round.canReveal = () => round.state === GUESS && round.buildComplete() && round.hasGuessed();

  // --------------------------------------------------------------- reveal

  /**
   * Work the answer out from real prices, score the stars, and freeze the round.
   *
   * Everything the reveal screen needs is returned here, already formatted
   * through js/levels.js so the number shown and the pass check cannot disagree.
   */
  round.reveal = (gameData = game) => {
    if (round.state === REVEAL) return round.result;
    if (!round.buildComplete()) throw new Error('the portfolio is not ready');
    if (!round.hasGuessed()) {
      throw new Error('no guess has been made, and the guess is the point of the round');
    }

    const weighted = round.usesMoney
      ? weightsFromDollars(round.dollars)
      : { tickers: [...round.picks], weights: round.picks.map(() => 1 / round.picks.length) };

    const measured = measureFor(level, gameData, weighted, window);
    const passed = passes(level, measured.value);
    const stars = starsFor(level, { guess: round.guess, actual: measured.value, passed });

    round.result = {
      ...measured,
      tickers: weighted.tickers,
      weights: weighted.weights,
      dollars: { ...round.dollars },
      guess: round.guess,
      passed,
      stars,
      // Formatted here so every screen reads the same number.
      shown: formatMeasure(measured.value, { threshold: level.pass.threshold ?? null }),
      guessShown: formatMeasure(round.guess, { threshold: level.pass.threshold ?? null }),
      line: resultLine(level, measured.value),
      // Level 1 scores its second star on naming the right bucket, so the
      // reveal has to say which bucket each of the two numbers fell in.
      buckets: Array.isArray(level.buckets)
        ? {
          actual: bucketOf(level, measured.value),
          guess: bucketOf(level, round.guess),
          labels: Object.fromEntries(level.buckets.map((b) => [b.key, b.label])),
        }
        : null,
      drawnId: round.drawnId,
    };
    round.state = REVEAL;
    return round.result;
  };

  return round;
}
