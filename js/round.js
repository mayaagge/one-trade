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
import { crashFacts, pickWhy, whyFacts } from './why.js';
// Level 6 is replayed through a crash window, so this file reaches into Crash
// replay's arithmetic rather than keeping a second copy of it: fallAgainstIndex()
// is the measure, and replay() is bought-and-held against VOO, both already
// checked against numpy. js/crash.js imports DOLLAR_STEP and evenSplit back out
// of this file, so the two are a cycle - a safe one, because neither side reads
// the other's bindings while the modules are still evaluating, only inside
// functions. tests/round.test.js imports them in both orders to keep it that way.
import {
  elsewhereFor, fallAgainstIndex, replay, unavailableIn, windowByKey,
} from './crash.js';
import {
  bucketOf,
  displayFor,
  kindFloorFor,
  levelById,
  passes,
  resultLine,
  seriesVerdict,
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
export const WEIGHTED_MEASURES = new Set(['effectiveBets', 'beta', 'maxRiskShare', 'fallShare']);

/**
 * Measures read from a crash window in data/crashes.json rather than from the
 * rolling window in data/game.json. Level 6's ratio of falls is the only one.
 */
export const CRASH_MEASURES = new Set(['fallShare']);

/** Does this level replay a fixed crash window instead of the rolling window? */
export function usesCrashWindow(level) {
  return CRASH_MEASURES.has(level.guess?.measure) || CRASH_MEASURES.has(level.pass?.measure);
}

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
 * Move money into a KIND of holding until it reaches its floor: level 6's "at
 * least 60% in stocks".
 *
 * Steps come out of the largest holding that is NOT of the kind and go into the
 * SMALLEST one that is, so both sides stay as level as whole $100 steps allow:
 * two stocks and two bond funds open at $3,000 / $3,000 / $2,000 / $2,000 rather
 * than at $3,500 / $2,500, which is what giving every step to one stock would
 * produce. An even split is the plainest thing to hand a player, and this keeps
 * it as even as the floor permits.
 *
 * IT DOES NOT THROW WHEN THE FLOOR CANNOT BE MET, and that is the difference
 * from splitWithFloors(). A level's floor on a ticker it deals is always
 * satisfiable, and validateLevels() has already proved it. This floor depends on
 * what the PLAYER picked: four bond funds can never put 60% in stocks, and that
 * is a build the player has to be told about, not an exception. So it moves as
 * far as it can and leaves the rest to buildComplete().
 *
 * @param {Object<string, number>} dollars ticker -> dollars, as it stands
 * @param {string[]} picks the holdings, in pick order
 * @param {Function} inKind does this ticker count towards the floor?
 * @param {number} floor the least dollars the kind must hold, a whole number of steps
 * @param {Object<string, number>} floors each holding's own least dollars
 */
export function raiseToKindFloor(dollars, picks, inKind, floor, step = DOLLAR_STEP, floors = {}) {
  const floorOf = (ticker) => floors[ticker] ?? step;
  const inside = picks.filter((t) => inKind(t));
  const held = () => inside.reduce((sum, t) => sum + dollars[t], 0);

  while (inside.length > 0 && held() < floor) {
    const to = inside.slice().sort((a, b) => dollars[a] - dollars[b])[0];
    const from = picks
      .filter((t) => !inKind(t) && dollars[t] - step >= floorOf(t))
      .sort((a, b) => dollars[b] - dollars[a])[0];
    if (from === undefined) break;     // nothing left to take from; the gate reports it
    dollars[from] -= step;
    dollars[to] += step;
  }
  return dollars;
}

/**
 * Pick one of a pool's portfolios, leaving out the ones this player has seen.
 *
 * PREREG.md gives level 2 and level 7's first mystery portfolio one shared pool
 * "so on average they are equally hard", which holds only if the draw is
 * uniform. `random` is injected so tests can pin the draw; the game passes
 * Math.random.
 *
 * THE EXCLUSION DOES NOT BREAK THAT SENTENCE, and the arithmetic is worth having
 * in the file rather than only in the log. Level 2 draws one of 20; level 7 then
 * draws one of the remaining 19. For any portfolio, the chance it is level 7's
 * first is 19/20 x 1/19 = 1/20 - exactly uniform over all 20, not approximately.
 * The pair is also exactly exchangeable, which is what the registered one-sided
 * sign test assumes. What the exclusion removes is a player being asked the
 * portfolio they already saw, which would measure their memory of a reveal
 * rather than what they learned, and would bias Hypothesis 3 toward "supported".
 *
 * IT NEVER BLOCKS PLAY. Progress lives in memory until browser storage is built,
 * and storage can be cleared or refused at any time, so a player can reach level
 * 7 with nothing recorded to exclude. Then the draw is uniform over all 20, as it
 * was before. An exclusion that refused to deal a portfolio would be a worse game
 * and no better a study.
 */
export function drawFromPool(guessPool, random = Math.random, { exclude = [] } = {}) {
  const portfolios = guessPool?.portfolios;
  if (!Array.isArray(portfolios) || portfolios.length === 0) {
    throw new Error('drawFromPool: the guess pool is empty');
  }
  const skip = new Set(exclude);
  const live = portfolios.filter((p) => !skip.has(p.id));
  // Everything seen already: fall back to the whole pool rather than refuse. A
  // player who has played level 2 twenty times has earned a repeat, not an error.
  const from = live.length > 0 ? live : portfolios;
  const index = Math.floor(random() * from.length);
  const chosen = from[Math.min(Math.max(index, 0), from.length - 1)];
  return { id: chosen.id, dollars: { ...chosen.dollars }, pool: 'guessPool' };
}

/**
 * Pick one of the capstone pool's portfolios from a named stratum.
 *
 * Level 7's second and third portfolios come one from each stratum, and the gap
 * between the two bands is what stops a single number being within 1 of both.
 * The stratum is therefore part of the draw and not a detail of it: drawing
 * both from the same band would hand back a level that can be passed blind,
 * which is why this refuses a stratum the pool does not carry rather than
 * quietly drawing from everything.
 */
export function drawFromStratum(finalPool, stratumKey, random = Math.random, { exclude = [] } = {}) {
  const portfolios = finalPool?.portfolios;
  if (!Array.isArray(portfolios) || portfolios.length === 0) {
    throw new Error('drawFromStratum: the capstone pool is empty');
  }
  const inStratum = portfolios.filter((p) => p.stratum === stratumKey);
  if (inStratum.length === 0) {
    throw new Error(
      `drawFromStratum: the capstone pool carries no "${stratumKey}" stratum`
      + ` (it has ${[...new Set(portfolios.map((p) => p.stratum))].join(', ')})`,
    );
  }
  const skip = new Set(exclude);
  const live = inStratum.filter((p) => !skip.has(p.id));
  const from = live.length > 0 ? live : inStratum;
  const index = Math.floor(random() * from.length);
  const chosen = from[Math.min(Math.max(index, 0), from.length - 1)];
  return {
    id: chosen.id, dollars: { ...chosen.dollars }, pool: 'finalPool', stratum: chosen.stratum,
  };
}

/** Does this level ask three questions in a row rather than one? */
export function isSeries(level) {
  return level?.pass?.measure === 'series';
}

/**
 * Deal level 7's three portfolios, in the order they will be played.
 *
 * Drawn ALL AT ONCE, before the first question is asked, and the order the
 * random stream is consumed in is fixed here: part 1, then the coin that decides
 * which stratum comes second, then parts 2 and 3. Nothing about parts 2 and 3
 * reaches the player before their turn, and a test that pins `random` pins the
 * whole deal.
 *
 * WHICH STRATUM COMES SECOND IS DRAWN, not fixed. Always showing the low
 * stratum second would make the capstone's shape learnable from one play -
 * "the middle one is always the one trade" - and the level is meant to be
 * answered by reading portfolios, not by remembering an order.
 */
export function dealSeries(levels, level, random = Math.random, { exclude = [] } = {}) {
  const parts = level.series?.parts;
  if (!Array.isArray(parts)) throw new Error(`level ${level.id}: no series parts to deal`);
  const strata = (levels.finalPool?.strata ?? []).map((s) => s.key);
  if (strata.length !== 2) {
    throw new Error(`level ${level.id}: the capstone pool needs two strata to deal from, found ${strata.length}`);
  }

  const first = drawFromPool(levels.guessPool, random, { exclude });
  // The coin is spent whether or not the order matters, so the stream reads the
  // same way on every play.
  const order = random() < 0.5 ? strata : [...strata].reverse();

  const dealt = [{ ...first, part: parts[0].part }];
  const seen = [first.id];
  order.forEach((stratumKey, i) => {
    const drawn = drawFromStratum(levels.finalPool, stratumKey, random, { exclude: [...exclude, ...seen] });
    seen.push(drawn.id);
    dealt.push({ ...drawn, part: parts[i + 1].part });
  });
  return dealt;
}

/**
 * Which quantity a level's round actually computes.
 *
 * A level's pass rule is not always a measure. Level 2 passes on making a guess
 * and level 7 on three guesses landing within 1 of their answers; neither is a
 * number to work out from prices. Both levels still measure something - the
 * effective bets their guess is about - and that is what this returns.
 */
export function measureOf(level) {
  return ['guess', 'series'].includes(level.pass.measure)
    ? level.guess.measure
    : level.pass.measure;
}

/**
 * The level's measure for a portfolio, computed from the live game data.
 *
 * Returns the unrounded value. Nothing here rounds, and js/levels.js compares
 * the unrounded value against the threshold: docs/PRD.md requires that a
 * displayed number never disagrees with the pass check.
 */
export function measureFor(level, game, { tickers, weights }, window, {
  basket = null, crashes = null, dollars = null,
} = {}) {
  const measure = measureOf(level);

  // LEVEL 6 LEAVES HERE FIRST. Its prices are a fixed stretch of 2020 in
  // data/crashes.json, not the rolling window in data/game.json, so none of what
  // follows applies: no covariance, no 252-day minimum, and nothing that moves
  // when the market does. The measure is Crash replay's own fallAgainstIndex(),
  // over a portfolio bought and held against VOO with dividends.
  if (measure === 'fallShare') {
    if (!crashes) {
      throw new Error(
        `measureFor: level ${level.id} replays a crash, but no crash data was given. `
        + `levels.json names its source as ${level.window?.source ?? 'nothing'}.`,
      );
    }
    const money = dollars ?? Object.fromEntries(tickers.map((t, i) => [t, weights[i]]));
    const result = replay(crashes, level.window.key, money);
    const against = fallAgainstIndex(result);
    if (!against.indexFell) {
      // Not reachable with the registered windows - the 2020 crash's index fell
      // 33.99% - but a share of a rise is not what this level asks about, and
      // 0.4 of a gain would read on screen as if it were.
      throw new Error(
        `measureFor: the ${result.indexLabel} did not fall in ${result.window.inSentence}, `
        + 'so there is no fall for a portfolio to take a share of',
      );
    }
    return {
      measure,
      value: against.share,
      days: result.window.days,
      startDate: result.window.from,
      endDate: result.window.to,
      basketReturns: null,
      aboutTicker: null,
      // No matrix: this measure is two paths, not a covariance. The "Why?" card
      // for this level is written from the replay itself and is still to come.
      matrix: null,
      // The two lines and the numbers under them, for the reveal screen. Small -
      // 24 points each - unlike the 756-by-5 matrix the other levels take off
      // their result before storing it.
      crash: result,
    };
  }

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
  // A SERIES PART HAS NO VERDICT YET, so it gets no lead-in. Level 7 is decided
  // by three guesses together, and "close" or "wide" about one of them would be
  // a verdict on a level the player is still halfway through.
  if (level.pass.measure === 'series') return null;
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
  crash = null, crashes = null, value, passed, stars,
}) {
  if (!why) return { whyCard: null, whyFacts: null };

  // A REPLAYED ROUND TAKES THE CRASH PATH. Level 6 has no covariance matrix, and
  // why.json's ordered rules are all thresholded on one: over 23 crash days
  // nearly everything correlates above 0.9, so every round would be handed the
  // pair card and told its holdings move together. The crash rules read the
  // replay itself instead - which holding moved the money, and what that holding
  // did in the file's other windows - and they lead on the round rather than
  // sitting in an order, exactly as the missed-level-5 card does.
  if (crash) {
    const facts = crashFacts(crash, {
      elsewhere: Object.fromEntries(crash.tickers.map(
        (ticker) => [ticker, crashes ? elsewhereFor(crashes, crash.window.key, ticker) : []],
      )),
    });
    return {
      whyCard: pickWhy(facts, why, {
        outcome: { measure: 'fallShare', passed },
        leadIn: leadInKey(level, { passed, stars }),
      }),
      whyFacts: facts,
    };
  }

  if (!matrix) return { whyCard: null, whyFacts: null };
  const measure = measureOf(level);
  const onCorrelation = measure === 'correlation';
  const facts = whyFacts({ tickers, weights, matrix, groups, basketReturns, basketMembers });
  return {
    whyCard: pickWhy(facts, why, {
      bucket: onCorrelation && Array.isArray(level.buckets) ? bucketOf(level, value) : null,
      pairThreshold: onCorrelation ? level.pass.threshold ?? null : null,
      // And to the same number of decimals as the panel above it: level 1
      // reveals a correlation to three.
      pairPlaces: onCorrelation ? displayFor(level).revealPlaces : undefined,
      // WHAT THIS ROUND WAS, so that a card written for one kind of round can
      // lead on it and stay silent everywhere else. Level 5 missed means one
      // holding went past the limit, and naming it is the whole answer to
      // "where's the risk?"; nothing leads on any other round, and those get
      // why.json's order exactly as before.
      outcome: { measure, passed },
      // The level's own threshold, so a card that states the limit states the
      // same number the pass check used.
      limit: level.pass.threshold ?? null,
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
  crashes = null, random = Math.random, dealt = null,
}) {
  const level = levelById(levels, levelId);
  const window = {
    days: levels.window?.days ?? 756,
    minDays: levels.window?.minDays ?? 252,
  };
  const total = levels.startingDollars ?? 10000;
  const pool = poolFor(level, universe);
  const wanted = holdingsWanted(level);

  // Level 6's own window, from data/crashes.json. A round that replays a crash
  // needs the file at BUILD time, not only at the reveal: which holdings can be
  // held at all is a property of the window - PLTR had not listed in February
  // 2020 - and a round that discovered that at the reveal would have let a
  // player spend their build on a portfolio it cannot measure.
  if (usesCrashWindow(level) && !crashes) {
    throw new Error(
      `level ${level.id} replays ${level.window?.key ?? 'a crash window'}, so it needs `
      + `${level.window?.source ?? 'the crash data'}; none was given`,
    );
  }
  const crashWindow = usesCrashWindow(level) ? windowByKey(crashes, level.window.key) : null;

  /**
   * Can this holding be held through this round's window?
   *
   * Always true off a crash window. On one it is the window's own rule, derived
   * here rather than passed in, so the build screen and the round cannot
   * disagree about which chips are live.
   */
  const canHold = (ticker) => crashWindow === null
    || (crashWindow.tickers.includes(ticker) && !unavailableIn(crashWindow, ticker));

  // Level 6's "at least 60% in stocks": a floor on a KIND of holding rather than
  // on a named one. Any holding of the kind can carry it.
  const kindRule = kindFloorFor(level, levels);
  const kindSet = kindRule ? new Set(kindRule.tickers) : null;
  const inKind = (ticker) => kindSet !== null && kindSet.has(ticker);
  // Rounded UP to a whole step, as floorFor() does, so the floor the buttons stop
  // at is never a hair under the share the level requires.
  const kindFloorDollars = kindRule
    ? Math.ceil((kindRule.share * total) / DOLLAR_STEP) * DOLLAR_STEP
    : 0;

  // Level 2's portfolio is drawn here, once, when the round starts. The id is
  // kept so level 7 can leave it out of its own draw: asking a player the
  // portfolio they have already seen would measure their memory rather than
  // their learning.
  //
  // A SERIES PART IS DEALT, NEVER DRAWN HERE. Level 7's three portfolios are
  // dealt together by dealSeries() before its first question is asked, so that
  // one function owns the whole deal and a test can pin it. A round on a series
  // level without a dealt portfolio is a caller mistake, not a round to improvise.
  if (isSeries(level) && dealt === null) {
    throw new Error(
      `level ${level.id} asks ${level.series?.count ?? 'several'} questions in a row, so its `
      + 'portfolios are dealt by dealSeries() and handed in - createRound does not draw them',
    );
  }
  const drawn = dealt ?? (isFixed(level) ? drawFromPool(levels.guessPool, random) : null);

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
    /** Which pool portfolio was dealt, or null on a level that builds its own. */
    drawnId: drawn ? drawn.id : null,
    /** Which pool it came from, so a session knows what to exclude next time. */
    drawnPool: drawn ? (drawn.pool ?? 'guessPool') : null,
    /** Which of a series' questions this round is, or null on a one-question level. */
    seriesPart: drawn && Number.isFinite(drawn.part) ? drawn.part : null,
    /** The holdings this level deals and will not let go, and their dollar floors. */
    required,
    floors,
    /** The crash window this level replays, or null on a level measured over the rolling window. */
    crashWindow,
    /**
     * The floor on a kind of holding: level 6's 60% in stocks, as the share the
     * level asks for, the dollars it works out to, and the tickers it counts.
     * Null on every other level.
     */
    kindFloor: kindRule ? { ...kindRule, dollars: kindFloorDollars } : null,
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
    // Enforced HERE and not only by the picker disabling a chip, the same way the
    // required holding above is: a disabled button can stop a click, never a
    // caller. js/crash.js's createBuild() refuses the same thing for Crash replay.
    if (!round.hasPick(ticker) && !canHold(ticker)) {
      const missing = crashWindow ? unavailableIn(crashWindow, ticker) : null;
      throw new Error(missing?.firstDate
        ? `${ticker} cannot be held through ${crashWindow.inSentence}: its first trading day was ${missing.firstDate}`
        : `${ticker} has no prices in ${crashWindow?.inSentence ?? "this round's window"}`);
    }

    if (round.hasPick(ticker)) {
      round.picks = round.picks.filter((t) => t !== ticker);
    } else {
      if (!round.canAddPick()) return round;
      round.picks = [...round.picks, ticker];
    }
    // The money follows the holdings: a changed line-up gets an even split
    // again, which is the plainest starting point and the one a player can then
    // nudge in $100 steps - then raised to meet any floor this level puts on a
    // kind of holding, so level 6 opens AT its 60% in stocks rather than at an
    // even split that breaks the rule before the player has touched anything.
    round.dollars = round.usesMoney && round.picks.length > 0
      ? splitWithFloors(round.picks, total, floors)
      : {};
    if (kindRule && round.usesMoney && round.picks.length > 0) {
      raiseToKindFloor(round.dollars, round.picks, inKind, kindFloorDollars, DOLLAR_STEP, floors);
    }
    return round;
  };

  /** Is the build ready - the right number of holdings, and the money adding up? */
  round.buildComplete = () => {
    if (wanted !== null && round.picks.length !== wanted) return false;
    if (round.picks.length === 0) return false;
    if (!round.usesMoney) return true;
    if (round.allocated() !== total) return false;
    // The floor on a kind: level 6's 60% in stocks. UNLIKE the per-holding floors
    // below, this one can genuinely be unmet - four bond funds can never reach it
    // - and that is a build the player is told about rather than an exception.
    if (kindRule && round.allocatedInKind() < kindFloorDollars) return false;
    // At or above its own floor: the $100 every holding has, and the level's own
    // floor on a holding it requires - level 4's 30% in QQQ.
    return round.picks.every((t) => (round.dollars[t] ?? 0) >= (floors[t] ?? DOLLAR_STEP));
  };

  /** Can this holding be held through this round's window? Always true off a crash window. */
  round.canHold = canHold;

  /** Does this holding count towards the level's floor on a kind? */
  round.inKind = inKind;

  /** What the holdings of the floored kind hold between them, in whole dollars. */
  round.allocatedInKind = () => round.picks
    .filter((t) => inKind(t))
    .reduce((sum, t) => sum + (round.dollars[t] ?? 0), 0);

  /**
   * How far short of the floor on the kind this build is, in whole dollars, or 0
   * when it is met. What the build screen puts under the allocator.
   */
  round.shortOfKindFloor = () => (kindRule
    ? Math.max(0, kindFloorDollars - round.allocatedInKind())
    : 0);

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
  /**
   * Would moving one step from `from` to `to` drop the kind below its floor?
   *
   * Only a step leaving the kind can: a step between two stocks, or into a stock,
   * leaves the total in stocks the same or larger.
   */
  const breaksKindFloor = (from, to, step) => kindRule !== null
    && inKind(from) && !inKind(to)
    && round.allocatedInKind() - step < kindFloorDollars;

  /**
   * The holdings that could give `ticker` a step, largest first - and the
   * holdings that could take one from it, smallest first.
   *
   * Both the buttons and adjustDollars() go through these, so a disabled button
   * and a refused move are the same rule rather than two copies of it. That
   * matters more now than it did: a - on a stock in level 6 can be illegal
   * because of what the OTHER stocks hold, which is not something a player can
   * read off the one row they are looking at.
   */
  const donorsFor = (ticker, step) => round.picks
    .filter((other) => other !== ticker)
    .filter((other) => round.dollars[other] - step >= round.floorOf(other))
    .filter((other) => !breaksKindFloor(other, ticker, step))
    .sort((a, b) => round.dollars[b] - round.dollars[a]);

  const receiversFor = (ticker, step) => round.picks
    .filter((other) => other !== ticker)
    .filter((other) => !breaksKindFloor(ticker, other, step))
    .sort((a, b) => round.dollars[a] - round.dollars[b]);

  round.canLower = (ticker, step = DOLLAR_STEP) => round.usesMoney
    && round.hasPick(ticker)
    && round.picks.length > 1
    && (round.dollars[ticker] ?? 0) - step >= round.floorOf(ticker)
    && receiversFor(ticker, step).length > 0;

  round.canRaise = (ticker, step = DOLLAR_STEP) => round.usesMoney
    && round.hasPick(ticker)
    && donorsFor(ticker, step).length > 0;

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
   *
   * SO IS A FLOOR ON A KIND. On level 6 the last $6,000 cannot leave stocks: a
   * step out of a stock goes to another stock, and a step into a bond fund comes
   * from another bond fund. A build that satisfies "at least 60% in stocks"
   * cannot be nudged out of satisfying it either.
   */
  round.adjustDollars = (ticker, steps, step = DOLLAR_STEP) => {
    if (!round.usesMoney) throw new Error(`level ${level.id} allocates no money`);
    if (round.fixed) throw new Error(`level ${level.id}: the portfolio is fixed and cannot be changed`);
    if (round.state === REVEAL) throw new Error('the round is over; the money cannot change');
    if (!round.hasPick(ticker)) throw new Error(`${ticker} is not in this portfolio`);
    if (!Number.isInteger(steps)) throw new Error('adjustDollars: steps must be a whole number');

    if (round.picks.length < 2) return 0;     // nothing to take from or give to
    const floorOf = (name) => floors[name] ?? step;

    let moved = 0;
    const direction = Math.sign(steps);
    for (let i = 0; i < Math.abs(steps); i += 1) {
      if (direction > 0) {
        // Take a step from the largest other holding that can spare one without
        // dropping through its own floor, or through the floor on the kind.
        const from = donorsFor(ticker, step)[0];
        if (from === undefined) break;
        round.dollars[from] -= step;
        round.dollars[ticker] += step;
      } else {
        if (round.dollars[ticker] - step < floorOf(ticker)) break;
        // Give it to the smallest other holding that can take it without the kind
        // losing the step: on level 6, money leaving a stock has to go to another
        // stock once the 60% is all that is left.
        const to = receiversFor(ticker, step)[0];
        if (to === undefined) break;
        round.dollars[ticker] -= step;
        round.dollars[to] += step;
      }
      moved += 1;
    }
    return moved;
  };

  /**
   * Why the build is not ready, in words a player can act on, or null when it is.
   *
   * It lives here and not on the screen because the gate and the message have to
   * agree. With one rule per level, "wants exactly 4 holdings; this has 4" was
   * impossible; level 6 has two rules, and a build of four bond funds read
   * exactly that until this function existed - four holdings and $10,000
   * allocated are both already true there, and neither is what is wrong.
   */
  round.whyIncomplete = () => {
    if (round.buildComplete()) return null;
    // The count first, and including an empty build: "wants exactly 5 holdings;
    // this has 0" tells a player the target, where "nothing is picked yet" only
    // tells them what they can already see.
    if (wanted !== null && round.picks.length !== wanted) {
      return `level ${level.id} wants exactly ${wanted} holdings; this has ${round.picks.length}`;
    }
    if (round.picks.length === 0) return 'nothing is picked yet';
    if (round.usesMoney && round.allocated() !== total) {
      return `the money has to add up to $${total}; this adds up to $${round.allocated()}`;
    }
    if (kindRule && round.allocatedInKind() < kindFloorDollars) {
      // The kind's key is the word a player reads - "stocks" - which is why
      // levels.json names its kinds in plain English.
      return `level ${level.id} needs at least $${kindFloorDollars} of the $${total} in `
        + `${kindRule.kind}; this has $${round.allocatedInKind()}`;
    }
    const low = round.picks.find((t) => (round.dollars[t] ?? 0) < (floors[t] ?? DOLLAR_STEP));
    if (low) return `${low} has to hold at least $${floors[low] ?? DOLLAR_STEP}`;
    return 'the portfolio is not ready yet';
  };

  /** Move from building to guessing. */
  round.toGuess = () => {
    if (!round.buildComplete()) throw new Error(round.whyIncomplete());
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
      level, gameData, weighted, window, { basket, crashes, dollars: round.dollars },
    );
    // A SERIES PART IS NOT SCORED ON ITS OWN. Level 7 passes on all three
    // guesses together, so there is no verdict to give after one of them, and
    // inventing one - "passed", because a guess was made - would put a verdict on
    // the screen that the level's own rule might contradict two questions later.
    // js/levels.js's seriesVerdict() scores the three, once they are all in.
    const part = isSeries(level);
    const passed = part ? null : passes(level, measured.value);
    const stars = part
      ? null
      : starsFor(level, { guess: round.guess, actual: measured.value, passed });

    round.result = {
      ...measured,
      tickers: weighted.tickers,
      weights: weighted.weights,
      dollars: { ...round.dollars },
      guess: round.guess,
      passed,
      stars,
      // Formatted here so every screen reads the same number - the panel, the
      // result line, the "Why?" card and the share card all take these.
      shown: formatMeasure(measured.value, {
        threshold: level.pass.threshold ?? null,
        display: displayFor(level).display,
        places: displayFor(level).revealPlaces,
      }),
      // The GUESS keeps the slider's own places: it is a value the player set
      // in hundredths or tenths, not a measured answer, and showing "0.950"
      // would claim a precision the control does not have.
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
      drawnPool: round.drawnPool,
      seriesPart: round.seriesPart,
      ...buildWhyCard(level, {
        ...weighted, matrix, groups, why, basketReturns, basketMembers: basket,
        // The replay, on a level that is one, and the file it came from: the
        // crash card names what one holding did here AND what it did in the
        // other windows, which is the warning that keeps "bonds cushion a
        // crash" from being the lesson a player takes away.
        crash: measured.crash ?? null,
        crashes,
        value: measured.value, passed, stars,
      }),
    };
    round.state = REVEAL;
    return round.result;
  };

  return round;
}

/**
 * Level 7: three portfolios, guessed and revealed one after another, then one
 * verdict over all three.
 *
 * A THIN WRAPPER OVER THREE ORDINARY ROUNDS, deliberately. Each part is a
 * createRound() with its portfolio dealt to it, so every refusal that file
 * already makes - no reveal before a guess, no guess outside the level's range,
 * no window shorter than 252 days - applies to a capstone question exactly as it
 * does to level 2. This file adds the order, the record, and the verdict, and
 * nothing else.
 *
 * THE NEXT PORTFOLIO DOES NOT EXIST UNTIL THE LAST ONE IS ANSWERED. A part's
 * round is built when the series reaches it, not up front. That is what makes
 * "each record is sent before the next portfolio appears" a property of the code
 * rather than a promise about it: there is nothing to appear until advance() is
 * called, and advance() refuses to run before the live part has revealed.
 *
 * @param {Function} [options.emit]  called with one record per locked guess, at
 *   the moment it is locked. The record carries the level, the guess and the
 *   actual value; the per-browser ID and the date belong to whatever sends it,
 *   and PREREG.md fixes those five fields. Defaults to doing nothing, so the
 *   round is testable and playable with no sender attached.
 * @param {string[]} [options.seenPoolIds]  pool portfolios this browser has
 *   already been shown, left out of part 1's draw.
 */
export function createSeries({
  levels, levelId, game, universe = [], why = null, groups = null, basket = null,
  crashes = null, random = Math.random, seenPoolIds = [], emit = () => {},
}) {
  const level = levelById(levels, levelId);
  if (!isSeries(level)) {
    throw new Error(`level ${level.id} asks one question, so it is a round and not a series`);
  }
  const dealt = dealSeries(levels, level, random, { exclude: seenPoolIds });

  const series = {
    level,
    levelId: level.id,
    /** How many questions, from levels.json. */
    count: level.series.count,
    /** Which question is live, from 0. */
    at: 0,
    /** The portfolios dealt, in play order. Parts not yet reached are dealt but unseen. */
    dealt,
    /** One round per question, built as the series reaches it. */
    rounds: [],
    /** {guess, actual} per answered question, in order. */
    answers: [],
    /** Every record emitted, in the order it was sent. */
    records: [],
  };

  /** Build the round for question `index`, and arrange for its record to be sent. */
  function attach(index) {
    const round = createRound({
      levels, levelId, game, universe, why, groups, basket, crashes, random, dealt: dealt[index],
    });

    // The record is sent from inside reveal(), not from advance() and not from a
    // screen. A guess is locked the moment its answer is worked out, and that is
    // the moment the record exists in full: batching three of them at the end of
    // the level would leave their arrival order - the only thing that tells them
    // apart, since all three carry level 7 - up to whatever order the requests
    // happened to land in. Hypothesis 3 reads the earliest level-7 row.
    const reveal = round.reveal;
    round.reveal = (gameData) => {
      const already = round.state === REVEAL;
      const result = reveal(gameData);
      if (already) return result;                  // reveal() is idempotent; the record is not
      series.answers.push({
        part: dealt[index].part,
        guess: result.guess,
        actual: result.value,
        drawnId: result.drawnId,
        pool: result.drawnPool,
      });
      const record = { level: series.levelId, guess: result.guess, actual: result.value };
      series.records.push(record);
      emit(record);
      return result;
    };

    series.rounds[index] = round;
    return round;
  }

  attach(0);

  /** The question being played. */
  series.current = () => series.rounds[series.at];

  /** Has the live question been answered? */
  series.partRevealed = () => series.current().state === REVEAL;

  /** Is there another question after this one? */
  series.hasNext = () => series.at + 1 < series.count;

  /**
   * Move to the next question.
   *
   * Refuses before the live one has revealed, which is the rule that keeps a
   * record from being skipped: the next portfolio cannot be built until the last
   * one's guess has been locked and sent.
   */
  series.advance = () => {
    if (!series.partRevealed()) {
      throw new Error(
        `level ${series.levelId}: question ${series.at + 1} has not been answered yet, so there is `
        + 'nothing to move on from - and its record has not been sent',
      );
    }
    if (!series.hasNext()) {
      throw new Error(`level ${series.levelId}: all ${series.count} questions have been answered`);
    }
    series.at += 1;
    return attach(series.at);
  };

  /** Are all three in? */
  series.complete = () => series.answers.length === series.count;

  /**
   * The level's verdict, over the three guesses together. Null until all three
   * are in: an unfinished series has no verdict, and a partial one would be a
   * verdict on a level the player has not finished.
   */
  series.verdict = () => (series.complete()
    ? seriesVerdict(level, series.answers.map(({ guess, actual }) => ({ guess, actual })))
    : null);

  /**
   * Which pool portfolios this play has shown, for the session to remember. Only
   * guessPool ids matter to the exclusion - the capstone pool is not part of the
   * registered comparison - but both are reported, so a session can avoid
   * repeating a capstone portfolio too.
   */
  series.shownIds = () => series.dealt
    .slice(0, series.at + 1)
    .map(({ id, pool }) => ({ id, pool }));

  return series;
}
