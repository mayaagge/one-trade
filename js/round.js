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

import {
  betaContributions,
  correlation,
  covariance,
  effectiveBets,
  equalWeightBasket,
  maxRiskShare,
  topRiskShare,
} from './math.js';
import { gameWindow, windowMatrix } from './gameView.js';
import { pickWhy, whyFacts } from './why.js';
import {
  bucketOf,
  displayFor,
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
export const WEIGHTED_MEASURES = new Set(['effectiveBets', 'beta', 'maxRiskShare']);

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
 * The holdings a level deals the player and will not let go: level 4's QQQ,
 * because "keep at least 30% in QQQ" is not a choice about whether to hold it.
 */
export function requiredHoldings(level) {
  return Array.isArray(level.holdings?.required) ? [...level.holdings.required] : [];
}

/**
 * The least money a holding may carry on this level, in whole dollars.
 *
 * Two floors meet here. Every holding has the $100 one - a 4-holding portfolio
 * with a zero in it is a 3-holding portfolio, and the level asked for 4 - and a
 * holding named in holdings.minShare has its own, which is level 4's 30% of the
 * $10,000. The share is rounded UP to a whole step, so the floor the buttons stop
 * at is never a hair under the share the level requires.
 */
export function floorFor(level, ticker, total, step = DOLLAR_STEP) {
  const share = level.holdings?.minShare?.[ticker];
  if (!Number.isFinite(share)) return step;
  return Math.max(step, Math.ceil((share * total) / step) * step);
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
 * $10,000 split as evenly as whole $100 steps allow, then raised to meet any
 * floor the level puts under a holding.
 *
 * Level 4 asks for at least 30% in QQQ, so an even quarter of the money is not a
 * legal start: the split begins even and then moves whole steps out of the
 * largest holdings that can spare them until QQQ reaches $3,000. It stops AT the
 * floor rather than above it, so the level starts at exactly what it demands and
 * a player who wants more QQQ has to choose it - and find out what it costs.
 *
 * @param {string[]} tickers the holdings
 * @param {number} total the pretend money, in whole dollars
 * @param {Object<string, number>} floors ticker -> its least dollars
 */
export function splitWithFloors(tickers, total, floors = {}, step = DOLLAR_STEP) {
  const dollars = evenSplit(tickers, total, step);
  const floorOf = (ticker) => floors[ticker] ?? step;

  // Biggest floor first, so a level with two floors fills the binding one before
  // the money has been spread thin on the other.
  const needy = tickers
    .filter((ticker) => dollars[ticker] < floorOf(ticker))
    .sort((a, b) => floorOf(b) - floorOf(a));

  for (const ticker of needy) {
    while (dollars[ticker] < floorOf(ticker)) {
      const donor = tickers
        .filter((other) => other !== ticker && dollars[other] - step >= floorOf(other))
        .sort((a, b) => dollars[b] - dollars[a])[0];
      if (donor === undefined) {
        throw new Error(
          `splitWithFloors: ${tickers.join(', ')} cannot meet their floors out of ${total}`,
        );
      }
      dollars[donor] -= step;
      dollars[ticker] += step;
    }
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
export function measureFor(level, game, { tickers, weights }, window, { basket = null } = {}) {
  const measure = level.pass.measure === 'guess' ? level.guess.measure : level.pass.measure;

  // A beta is measured against a basket, so the window has to be one both the
  // portfolio and every basket member cover. Taking the portfolio's own window and
  // then reading the basket over it would be reading the basket off days it may
  // not have, which is the mistake js/returns.js exists to prevent.
  if (measure === 'beta' && (!Array.isArray(basket) || basket.length === 0)) {
    throw new Error(
      `measureFor: level ${level.id} measures a beta to a basket, but no basket was given. `
      + `levels.json names its source as ${level.basket?.source ?? 'nothing'}.`,
    );
  }
  const needed = measure === 'beta' ? [...new Set([...tickers, ...basket])] : tickers;
  const slice = gameWindow(game, needed, window.days);
  if (slice.days < window.minDays) {
    throw new Error(
      `${needed.join(', ')} overlap on only ${slice.days} trading days, fewer than the `
      + `${window.minDays} this game needs, so no measure would be trustworthy`,
    );
  }
  const matrix = windowMatrix(slice, tickers);

  let value;
  // The basket's own daily returns, on a level that has one. The "Why?" card
  // reads the same series the measure was taken over rather than rebuilding it.
  let basketReturns = null;
  // The holding a measure is ABOUT, when it is about one. Level 5's measure is
  // one holding's share of the risk; a correlation is about a pair and a beta is
  // about the whole portfolio, so both leave this null.
  let aboutTicker = null;
  if (measure === 'correlation') {
    if (tickers.length !== 2) {
      throw new Error(`measureFor: a correlation needs exactly 2 holdings, not ${tickers.length}`);
    }
    value = correlation(matrix)[0][1];
  } else if (measure === 'effectiveBets') {
    value = effectiveBets(weights, covariance(matrix));
  } else if (measure === 'maxRiskShare') {
    const top = topRiskShare(weights, covariance(matrix));
    value = top.share;
    // The screen names the holding: "38%" without "that holding is GLD" leaves a
    // player to guess at the one thing level 5 asked them about.
    aboutTicker = tickers[top.index];
  } else if (measure === 'beta') {
    // The same equal-weight basket Hypothesis 2 measures, built by the same
    // function in js/math.js, over the same days as the portfolio.
    basketReturns = equalWeightBasket(slice.byTicker, basket);
    // SUMMED FROM THE HOLDINGS' OWN CONTRIBUTIONS rather than taken from the
    // portfolio's return series. The two are the same identity - beta is linear
    // in the weights - and agree to about 1e-17, but the "Why?" card names one
    // holding's part of this number, and a card that decomposes a number the
    // panel above it worked out a different way could in principle print a
    // different last digit. One computation, one number on the screen.
    value = betaContributions(matrix, weights, basketReturns).beta;
  } else {
    throw new Error(`measureFor: level ${level.id} asks for an unknown measure "${measure}"`);
  }

  return {
    measure,
    value,
    days: slice.days,
    startDate: slice.startDate,
    endDate: slice.endDate,
    basketReturns,
    aboutTicker,
    // The "Why?" card reads the same window the measure was taken over, so the
    // matrix is handed back rather than built a second time. reveal() takes it
    // off before storing the result: a 756-by-5 array does not belong on
    // something every screen holds.
    matrix,
  };
}

/**
 * Which lead-in line opens the card, from the level's own pass rule.
 *
 * A level that checks the PORTFOLIO reports a verdict on the portfolio: level 3
 * asks for at least 3 effective bets, and a round either cleared that or did
 * not.
 *
 * A level whose pass rule IS THE GUESS has nothing to pass or miss. levels.json
 * gives level 2 `pass.measure: "guess"` and `says: "make a guess"`, so every
 * round passes, and "You passed" on a level nobody can fail says nothing. Its
 * line reports on the guess instead.
 *
 * "Close" is the level's own TWO-STAR BAND and is read as `stars >= 2` rather
 * than recomputed from a threshold of its own. levels.json words level 2's band
 * as "within 1 bet", and the line sits directly beneath the stars it describes,
 * so the two cannot be allowed to disagree - a second copy of that number could.
 */
function leadInKey(level, { passed, stars }) {
  if (level.pass.measure === 'guess') return stars >= 2 ? 'closeGuess' : 'wideGuess';
  return passed ? 'passed' : 'missed';
}

/**
 * The "Why?" card for a revealed portfolio: the rule that explains it, worded by
 * a template in why.json. js/why.js holds the rules and the wording; what is
 * decided here is only which of its two paths a level takes.
 *
 * LEVEL 1 TAKES THE BUCKET PATH. A level whose measure is a correlation holds
 * two holdings and splits no money, so the risk-share rules would describe a
 * split the player never chose. It gets the card for the "Same bet?" bucket its
 * pair landed in instead, and no lead-in: the panel above it already gives the
 * verdict, and the bucket line below it gives it again. The same levels give the pair's correlation a
 * threshold to be formatted against, because on those levels the pair's
 * correlation IS the pass-checked number, and the card must not round it to
 * something the reveal panel does not say.
 *
 * Returns both the card and the facts behind it: the facts are what
 * tests/why.test.js checks against numpy, and they are small - a few numbers per
 * holding, no matrix.
 */
function buildWhyCard(level, {
  tickers, weights, matrix, groups, why, basketReturns = null, basketMembers = null,
  value, passed, stars,
}) {
  if (!why) return { whyCard: null, whyFacts: null };
  const measure = level.pass.measure === 'guess' ? level.guess.measure : level.pass.measure;
  const onCorrelation = measure === 'correlation';
  const facts = whyFacts({ tickers, weights, matrix, groups, basketReturns, basketMembers });
  return {
    whyCard: pickWhy(facts, why, {
      bucket: onCorrelation && Array.isArray(level.buckets) ? bucketOf(level, value) : null,
      pairThreshold: onCorrelation ? level.pass.threshold ?? null : null,
      // Only the rule path takes a lead-in. A level 1 reveal already says
      // whether the pair cleared its threshold and which bucket the guess
      // named, so a third verdict line would be the same news a third time.
      leadIn: leadInKey(level, { passed, stars }),
    }),
    whyFacts: facts,
  };
}

/**
 * Start a round.
 *
 * @param {object} options.levels    levels.json, parsed and validated
 * @param {number} options.levelId   which level
 * @param {object} options.game      data/game.json, parsed
 * @param {string[]} options.universe the whole ticker list, for a level whose pool is "all"
 * @param {object} [options.why]     why.json, validated, for the "Why?" card
 * @param {Map} [options.groups]     ticker -> {key, label}, from js/why.js's groupIndex
 * @param {string[]} [options.basket] the AI basket's members, from basket.json, for a
 *                                   level whose measure is a beta to it
 * @param {Function} options.random  the draw for level 2's portfolio
 *
 * `why` and `groups` are optional, and without them the round plays exactly as
 * before with result.why left null. A round is a valid round without a card -
 * the card is a reveal screen feature - and this file stays testable on its own.
 */
export function createRound({
  levels, levelId, game, universe = [], why = null, groups = null, basket = null,
  random = Math.random,
}) {
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

  // Level 4's QQQ. "Keep at least 30% in QQQ" is not a choice about whether to
  // hold it, so it is dealt with the round and cannot be given up; what a player
  // puts beside it is the level.
  const required = requiredHoldings(level);
  for (const ticker of required) {
    if (!pool.includes(ticker)) {
      throw new Error(`level ${level.id}: ${ticker} is required but is not in this level's pool`);
    }
  }
  const floors = Object.fromEntries(
    Object.keys(level.holdings?.minShare ?? {}).map((t) => [t, floorFor(level, t, total)]),
  );

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
    /** The holdings this level deals and will not let go, and their dollar floors. */
    required,
    floors,
    /** The player's picks, in the order they were picked, any required ones first. */
    picks: drawn ? Object.keys(drawn.dollars) : [...required],
    /** Dollars per holding, whole dollars summing to the total. Empty when a level uses no money. */
    dollars: drawn
      ? { ...drawn.dollars }
      : (usesMoney(level) && required.length > 0 ? splitWithFloors(required, total, floors) : {}),
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
    if (required.includes(ticker) && round.hasPick(ticker)) {
      throw new Error(`level ${level.id} is built around ${ticker}, so it cannot be removed`);
    }

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
      ? splitWithFloors(round.picks, total, floors)
      : {};
    return round;
  };

  /** Is the build ready - the right number of holdings, and the money adding up? */
  round.buildComplete = () => {
    if (wanted !== null && round.picks.length !== wanted) return false;
    if (round.picks.length === 0) return false;
    if (!round.usesMoney) return true;
    if (round.allocated() !== total) return false;
    // At or above its own floor: the $100 every holding has, and the level's own
    // floor on a holding it requires - level 4's 30% in QQQ.
    return round.picks.every((t) => (round.dollars[t] ?? 0) >= (floors[t] ?? DOLLAR_STEP));
  };

  /** The least dollars this holding may carry on this level. */
  round.floorOf = (ticker) => floors[ticker] ?? DOLLAR_STEP;

  /**
   * Can this holding give up a step, or take one?
   *
   * These mirror adjustDollars()'s own conditions exactly, and exist so the
   * screen can disable a button rather than offer one that does nothing. A - on
   * QQQ at its 30% floor is a button that cannot work, and a player who taps it
   * twice learns nothing from either tap.
   */
  round.canLower = (ticker, step = DOLLAR_STEP) => round.usesMoney
    && round.hasPick(ticker)
    && round.picks.length > 1
    && (round.dollars[ticker] ?? 0) - step >= round.floorOf(ticker);

  round.canRaise = (ticker, step = DOLLAR_STEP) => round.usesMoney
    && round.hasPick(ticker)
    && round.picks.some((other) => other !== ticker
      && round.dollars[other] - step >= round.floorOf(other));

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
   *
   * A LEVEL'S OWN FLOOR IS PART OF THAT. On level 4 the buttons will not take QQQ
   * below $3,000, and will not take it there from another holding either, so a
   * build that satisfies "at least 30% in QQQ" cannot be nudged out of satisfying
   * it. The gate is not the only thing holding the rule up; the controls are.
   */
  round.adjustDollars = (ticker, steps, step = DOLLAR_STEP) => {
    if (!round.usesMoney) throw new Error(`level ${level.id} allocates no money`);
    if (round.fixed) throw new Error(`level ${level.id}: the portfolio is fixed and cannot be changed`);
    if (round.state === REVEAL) throw new Error('the round is over; the money cannot change');
    if (!round.hasPick(ticker)) throw new Error(`${ticker} is not in this portfolio`);
    if (!Number.isInteger(steps)) throw new Error('adjustDollars: steps must be a whole number');

    const others = round.picks.filter((t) => t !== ticker);
    if (others.length === 0) return 0;
    const floorOf = (name) => floors[name] ?? step;

    let moved = 0;
    const direction = Math.sign(steps);
    for (let i = 0; i < Math.abs(steps); i += 1) {
      if (direction > 0) {
        // Take a step from the largest other holding that can spare one without
        // dropping through its own floor.
        const from = others
          .filter((t) => round.dollars[t] - step >= floorOf(t))
          .sort((a, b) => round.dollars[b] - round.dollars[a])[0];
        if (from === undefined) break;
        round.dollars[from] -= step;
        round.dollars[ticker] += step;
      } else {
        if (round.dollars[ticker] - step < floorOf(ticker)) break;
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

    const { matrix, basketReturns, ...measured } = measureFor(
      level, gameData, weighted, window, { basket },
    );
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
      shown: formatMeasure(measured.value, {
        threshold: level.pass.threshold ?? null, display: displayFor(level).display,
      }),
      guessShown: formatMeasure(round.guess, {
        threshold: level.pass.threshold ?? null, display: displayFor(level).display,
      }),
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
      ...buildWhyCard(level, {
        ...weighted, matrix, groups, why, basketReturns, basketMembers: basket,
        value: measured.value, passed, stars,
      }),
    };
    round.state = REVEAL;
    return round.result;
  };

  return round;
}
