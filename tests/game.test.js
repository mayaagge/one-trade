// tests/game.test.js - the parts of the Learn screens that are not DOM.
//
// js/game.js is mostly document-building, which needs a browser, and this
// project takes no new libraries (CLAUDE.md rule 8) so there is no jsdom to run
// it under. What CAN be tested in node is everything in that file which is a
// decision rather than a node: how fine the guess slider is, what the stars
// explanation says, and what the session remembers between rounds. Those are
// exported for exactly that reason.
//
// The screens themselves are checked by hand on a phone-width browser, and
// BUILD_LOG.md records what was looked at.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildReturns } from '../js/returns.js';
import { GAME_DAYS } from '../scripts/build_game_data.mjs';
import { validateLevels, levelById } from '../js/levels.js';
import { createRound } from '../js/round.js';
import {
  basketFrom,
  seenPoolIds,
  buildHint,
  gapSentence,
  guessPlaces,
  guessSliderState,
  guessStep,
  newSession,
  recordResult,
  revealLine,
  starText,
  starsExplanation,
} from '../js/game.js';
import { validateCrashes } from '../js/crash.js';
// The picker, the allocator and the money they are written in now live in
// js/build.js, shared with Crash replay.
import { floorNotes, money } from '../js/build.js';
import { SEEN_POOL_KEY } from '../js/seenPool.js';

/** A localStorage for one test, and the teardown that takes it away again. Same pattern as tests/progress.test.js. */
function withStorage(store = {}) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
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

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));
const LEVELS = validateLevels(readJson('levels.json'));
const TICKERS = readJson('tickers.json');
const BASKET = readJson('basket.json').stocks.map((stock) => stock.ticker);
const UNIVERSE = TICKERS.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));

// Prices from the frozen snapshot, shaped like data/game.json: the round needs
// data to reveal, and the live file moves every weekday evening.
const GAME = (() => {
  const built = buildReturns(readJson('data/prices.json'));
  const tickers = built.tickers.slice().sort();
  const from = built.dates.length - GAME_DAYS;
  const dates = built.dates.slice(from);
  return {
    meta: { liveThrough: dates[dates.length - 1], firstDate: dates[0] },
    tickers,
    rows: dates.map((date, i) => [date, ...tickers.map((t) => built.byTicker[t][from + i])]),
  };
})();

// Level 6's own prices, which are history and never move.
const CRASHES = validateCrashes(readJson('data/crashes.json'));

/** A fresh round on a level, with the draw pinned. */
function round(levelId) {
  return createRound({
    levels: LEVELS,
    levelId,
    game: GAME,
    universe: UNIVERSE,
    basket: BASKET,
    crashes: CRASHES,
    random: () => 0,
  });
}

/** A round sitting on the guess screen, built and waiting for a guess. */
function atGuess(levelId, picks = []) {
  const r = createRound({ levels: LEVELS, levelId, game: GAME, universe: UNIVERSE, random: () => 0 });
  for (const ticker of picks) r.togglePick(ticker);
  return r.toGuess();
}

// ------------------------------------------------------------- the slider

test('the slider is in hundredths for a correlation and tenths for a bets count', () => {
  // Level 1 is scored to 0.10, so hundredths let a player aim inside the band.
  assert.equal(guessStep(levelById(LEVELS, 1)), 0.01);
  assert.equal(guessPlaces(levelById(LEVELS, 1)), 2);
  // Levels 2 and 3 are scored to half a bet.
  assert.equal(guessStep(levelById(LEVELS, 2)), 0.1);
  assert.equal(guessPlaces(levelById(LEVELS, 2)), 1);
  assert.equal(guessStep(levelById(LEVELS, 3)), 0.1);
});

test('every level has a slider step fine enough to reach its own third star', () => {
  // A band of 0.10 reachable only in steps of 0.5 would be a star nobody could
  // win. The step has to be at most the band it is aiming at.
  for (const level of LEVELS.levels) {
    if (level.stars.three.test !== 'within') continue;
    assert.ok(
      guessStep(level) <= level.stars.three.of,
      `level ${level.id}: step ${guessStep(level)} cannot hit a band of ${level.stars.three.of}`,
    );
  }
});

// ------------------------------------------------- the slider before a tap
//
// The guess slider shows no number AND no thumb until the player's first tap or
// drag, so there is nothing on the screen to anchor a guess on and nothing to
// confirm by accident. These tests are the behaviour; the thumb itself is hidden
// in css/style.css by the class named here.

test('no value is set before the player interacts with the slider', () => {
  const round = atGuess(1, ['VOO', 'VTI']);
  const state = guessSliderState(round);

  assert.equal(round.guess, null, 'the round holds no guess');
  assert.equal(round.hasGuessed(), false);
  assert.equal(state.blank, true);
  assert.equal(state.readout, '—', 'the screen shows no number');
  assert.equal(state.revealDisabled, true, 'Reveal stays disabled');
  assert.match(state.className, /guess-slider-blank/, 'the thumb and the track fill are hidden');
  assert.equal(state.valueText, 'no guess yet - tap the line to guess');
  assert.match(state.hint, /Tap anywhere on the line/);
});

test('the control rests at the midpoint, but nothing on the screen says so', () => {
  // A range input reports a value whether or not it has been touched, so the
  // resting position is the midpoint and is then hidden. What must not happen is
  // that resting position becoming the player's guess.
  const round = atGuess(1, ['VOO', 'VTI']);
  const state = guessSliderState(round);
  assert.equal(state.value, 0, 'halfway between -1 and 1');
  assert.equal(round.guess, null, 'and the round still has no guess');
  assert.throws(() => round.reveal(), /no guess has been made/);
});

test('the first interaction sets the value, shows it, and enables Reveal', () => {
  const round = atGuess(1, ['VOO', 'VTI']);
  round.setGuess(0.85);                       // what the input event does
  const state = guessSliderState(round);
  assert.equal(state.blank, false);
  assert.equal(state.readout, '0.85');
  assert.equal(state.revealDisabled, false);
  assert.equal(state.className, 'guess-slider');
  assert.equal(state.valueText, null, 'the screen reader hint is dropped once there is a value');
  assert.equal(state.hint, null);
  assert.equal(state.value, 0.85, 'the thumb now sits where the player put it');
});

test('a tap that lands exactly on the midpoint still counts as a guess', () => {
  // The one case a "has the thumb moved?" check would get wrong: a player who
  // taps the middle of the line has guessed, and the round must take it.
  const round = atGuess(1, ['VOO', 'VTI']);
  round.setGuess(0);
  const state = guessSliderState(round);
  assert.equal(state.blank, false);
  assert.equal(state.readout, '0.00');
  assert.equal(state.revealDisabled, false);
});

test('the slider state reads its range and step from the level, on every level', () => {
  const one = guessSliderState(atGuess(1, ['VOO', 'VTI']));
  assert.deepEqual([one.min, one.max, one.step], [-1, 1, 0.01]);

  const two = guessSliderState(atGuess(2));
  assert.deepEqual([two.min, two.max, two.step], [1, 6, 0.1]);
  assert.equal(two.value, 3.5, 'halfway between 1 and 6 bets');
  assert.equal(two.blank, true, 'a dealt portfolio still gets a blank slider');

  const three = guessSliderState(atGuess(3, ['VOO', 'BND', 'GLD', 'XOM', 'JNJ']));
  assert.deepEqual([three.min, three.max, three.step], [1, 5, 0.1]);
});

test('a guess carried back from a reveal is shown, not blanked', () => {
  // Going back to the build throws the guess away, but a re-render of the same
  // guess screen must not: a redraw is not an interaction.
  const round = atGuess(3, ['VOO', 'BND', 'GLD', 'XOM', 'JNJ']);
  round.setGuess(2.5);
  assert.equal(guessSliderState(round).readout, '2.5');
  round.toBuild();
  round.toGuess();
  assert.equal(guessSliderState(round).blank, true, 'a changed build deserves a fresh guess');
});

// -------------------------------------------------------------- the stars

test('starText always shows three stars, filled and empty', () => {
  assert.equal(starText(0), '☆☆☆');
  assert.equal(starText(1), '★☆☆');
  assert.equal(starText(2), '★★☆');
  assert.equal(starText(3), '★★★');
});

test('a failed level says what the level needed, in the words levels.json uses', () => {
  const level = levelById(LEVELS, 3);
  const text = starsExplanation(level, { passed: false, stars: 0 });
  assert.match(text, /No stars this time/);
  assert.match(text, /at least 3 effective bets/, "the level's own pass.says, not a number typed here");
});

test('a 1-star reveal says what 2 stars would have needed', () => {
  const level = levelById(LEVELS, 3);
  const text = starsExplanation(level, { passed: true, stars: 1 });
  assert.match(text, /1 star for at least 3 effective bets/);
  assert.match(text, /2 stars needed within 1 bet/);
});

test('a 3-star reveal names all three bands and asks for nothing more', () => {
  const level = levelById(LEVELS, 3);
  const text = starsExplanation(level, { passed: true, stars: 3 });
  assert.match(text, /3 for within half a bet/);
  assert.doesNotMatch(text, /needed/);
});

test('the explanation for level 1 uses its bucket band, not a bets band', () => {
  const text = starsExplanation(levelById(LEVELS, 1), { passed: true, stars: 2 });
  assert.match(text, /naming the right bucket/);
  assert.match(text, /within 0\.10 of the real correlation/);
});

// ------------------------------------------------------------ the session

test('a fresh session remembers nothing', () => {
  const session = newSession();
  assert.equal(session.stars.size, 0);
  assert.equal(session.drawnPoolIds.size, 0);
});

test('the best score for a level stands, and a worse replay does not undo it', () => {
  const session = newSession();
  recordResult(session, 3, { stars: 3, drawnId: null });
  recordResult(session, 3, { stars: 1, drawnId: null });
  assert.equal(session.stars.get(3), 3);
});

test('the pool portfolio drawn on level 2 is remembered, so level 7 can avoid it', () => {
  const session = newSession();
  recordResult(session, 2, { stars: 2, drawnId: 'p11', drawnPool: 'guessPool' });
  recordResult(session, 2, { stars: 1, drawnId: 'p04', drawnPool: 'guessPool' });
  assert.deepEqual([...session.drawnPoolIds].sort(), ['guessPool:p04', 'guessPool:p11']);
  assert.deepEqual(seenPoolIds(session).sort(), ['p04', 'p11'], 'what level 7 leaves out');
  // A level that draws nothing adds nothing.
  recordResult(session, 3, { stars: 1, drawnId: null });
  assert.equal(session.drawnPoolIds.size, 2);
});

test('a capstone portfolio never shrinks the pool of 20 that Hypothesis 3 needs', () => {
  // Both pools are remembered, but only guessPool ids are excluded from level
  // 7's first draw. If a capstone id leaked into that list it would quietly take
  // a portfolio out of the registered pool of 20.
  const session = newSession();
  recordResult(session, 2, { stars: 1, drawnId: 'p07', drawnPool: 'guessPool' });
  recordResult(session, 7, { stars: 1, drawnId: 'f13', drawnPool: 'finalPool' });
  assert.equal(session.drawnPoolIds.size, 2, 'both are remembered');
  assert.deepEqual(seenPoolIds(session), ['p07'], 'only the pool-of-20 one is excluded');
});

test('an id recorded without its pool is taken for a pool-of-20 id', () => {
  // Level 2 is the only level that draws without naming a pool, and its
  // portfolio is always from the pool of 20.
  const session = newSession();
  recordResult(session, 2, { stars: 1, drawnId: 'p11' });
  assert.deepEqual(seenPoolIds(session), ['p11']);
});

test('every id the session could remember is a real pool portfolio', () => {
  const ids = new Set(LEVELS.guessPool.portfolios.map((p) => p.id));
  const session = newSession();
  for (const portfolio of LEVELS.guessPool.portfolios) {
    recordResult(session, 2, { stars: 1, drawnId: portfolio.id, drawnPool: 'guessPool' });
  }
  for (const id of seenPoolIds(session)) assert.ok(ids.has(id), `${id} is not in the pool`);
  assert.equal(session.drawnPoolIds.size, 20);
  assert.equal(seenPoolIds(session).length, 20);
});

// ---------------------------------------------- persisting the seen pool

test('a pool portfolio survives into a new session, under its own key', () => {
  const restore = withStorage();
  try {
    const first = newSession();
    recordResult(first, 2, { stars: 2, drawnId: 'p11', drawnPool: 'guessPool' });

    // A new session is what a reload builds - nothing is passed by hand.
    const second = newSession();
    assert.deepEqual(seenPoolIds(second), ['p11'], 'the reload forgot what level 2 showed');
  } finally { restore(); }
});

test('the seen pool is stored under its own key, separate from progress', () => {
  const store = {};
  const restore = withStorage(store);
  try {
    const session = newSession();
    recordResult(session, 2, { stars: 2, drawnId: 'p11', drawnPool: 'guessPool' });
    assert.ok(store[SEEN_POOL_KEY], 'nothing was stored');
    assert.notEqual(SEEN_POOL_KEY, 'oneTrade.learn');
  } finally { restore(); }
});

test('a browser with no storage still plays, remembering nothing across reload', () => {
  const restore = withoutStorage();
  try {
    const first = newSession();
    recordResult(first, 2, { stars: 2, drawnId: 'p11', drawnPool: 'guessPool' });
    assert.deepEqual(seenPoolIds(first), ['p11'], 'this visit still excludes it');

    const second = newSession();
    assert.deepEqual(seenPoolIds(second), [], 'a browser with no storage cannot carry it to a new session');
  } finally { restore(); }
});

test('a save that cannot be written still excludes the portfolio for the rest of this visit', () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error('storage is blocked'); },
    setItem() { throw new Error('storage is blocked'); },
    removeItem() { throw new Error('storage is blocked'); },
  };
  try {
    const session = newSession();
    recordResult(session, 2, { stars: 2, drawnId: 'p11', drawnPool: 'guessPool' });
    assert.deepEqual(seenPoolIds(session), ['p11']);
  } finally {
    if (had) globalThis.localStorage = previous;
    else delete globalThis.localStorage;
  }
});

// --------------------------------------------------------------- the money

test('money reads the way a player writes it', () => {
  assert.equal(money(10000), '$10,000');
  assert.equal(money(2000), '$2,000');
  assert.equal(money(100), '$100');
  assert.equal(money(0), '$0');
});

// -------------------------------------------- the screens for levels 4 and 5

test('a level that deals a holding shows it held and locked, not tappable', () => {
  // The chip for QQQ on level 4. It is disabled because removing it throws, and
  // a button whose only outcome is an error is not a button.
  const r = round(4);
  assert.deepEqual(r.required, ['QQQ']);
  assert.equal(r.hasPick('QQQ'), true);
  assert.throws(() => r.togglePick('QQQ'), /cannot be removed/);
});

test('the money buttons are offered only when they would do something', () => {
  const r = round(4);
  for (const ticker of ['BND', 'GLD', 'JNJ']) r.togglePick(ticker);

  // A fresh build has every dollar allocated, so NOTHING can be raised: there is
  // no money left to raise it with. This is the visible face of independent
  // sliders - before, + always worked because it took from somebody else.
  assert.equal(r.moneyLeft(), 0);
  for (const ticker of r.picks) {
    assert.equal(r.canRaise(ticker), false, `${ticker} could be raised with $0 left`);
  }

  // QQQ sits at its 30% floor, so - is off there and on everywhere else.
  assert.equal(r.canLower('QQQ'), false);
  assert.equal(r.canLower('BND'), true);

  // Free a step and + comes back on - for every holding, including QQQ, which a
  // player may hold more of than the level demands.
  r.adjustDollars('BND', -1);
  assert.equal(r.moneyLeft(), 100);
  for (const ticker of r.picks) {
    assert.equal(r.canRaise(ticker), true, `${ticker} could not be raised with $100 left`);
  }

  // What the buttons say matches what the round will actually do, both ways.
  for (const ticker of r.picks) {
    assert.equal(r.canLower(ticker), r.adjustDollars(ticker, -1) === 1,
      `${ticker}: the - button and adjustDollars disagree`);
    assert.equal(r.canRaise(ticker), r.adjustDollars(ticker, 1) === 1,
      `${ticker}: the + button and adjustDollars disagree`);
  }
});

test('the floor under a holding is named in the level’s own numbers', () => {
  const r = round(4);
  assert.deepEqual(floorNotes(r), [
    'QQQ stays at $3,000 or more: the 30% this level asks you to keep in it.',
  ]);
  // A level with no floor says nothing about floors.
  assert.deepEqual(floorNotes(round(5)), []);
  assert.deepEqual(floorNotes(round(3)), []);
});

test('the floor on a kind is named with where the money actually is', () => {
  // Unlike a floor on one holding, this one can be unmet while every row on the
  // screen looks legal - four bond funds, $2,500 each, nothing below its $100 -
  // so the line has to carry the running total.
  const short = round(6);
  for (const ticker of ['BND', 'TLT', 'LQD', 'GLD']) short.togglePick(ticker);
  assert.deepEqual(floorNotes(short), [
    '$6,000 of the $10,000 has to sit in stocks - the 60% this level asks for. '
    + 'You have $0 in stocks.',
  ]);

  const met = round(6);
  for (const ticker of ['WMT', 'PG', 'TLT', 'BND']) met.togglePick(ticker);
  assert.deepEqual(floorNotes(met), [
    '$6,000 of the $10,000 has to sit in stocks - the 60% this level asks for. '
    + 'You have $6,000 in stocks.',
  ]);

  // Crash replay's own build has no level and no floor, and must not grow a line.
  assert.deepEqual(floorNotes({ total: 10000, floorOf: () => 100 }), []);
});

test('the build hint names what is missing, not the last thing that was', () => {
  // The line under a disabled Next button. Level 6 can have all four holdings and
  // still not be ready, and "Pick 0 more holdings to carry on" was what the old
  // line said about that.
  const empty = round(6);
  assert.equal(buildHint(empty), 'Pick 4 more holdings to carry on.');
  empty.togglePick('WMT');
  assert.equal(buildHint(empty), 'Pick 3 more holdings to carry on.');

  const wrongPlace = round(6);
  for (const ticker of ['BND', 'TLT', 'LQD', 'GLD']) wrongPlace.togglePick(ticker);
  // The action, not the rule: the allocator's floor note states the rule and the
  // running total a few lines above, and at 390px the two read as one sentence
  // twice. Found by driving the level, not by a test.
  assert.equal(
    buildHint(wrongPlace),
    'Move $6,000 into stocks with the + buttons, or swap a holding for one.',
  );
  assert.ok(!buildHint(wrongPlace).includes('has to sit in'),
    'the hint must not repeat the floor note above it');

  // A ready build says nothing, and neither does a dealt one.
  const ready = round(6);
  for (const ticker of ['WMT', 'PG', 'TLT', 'BND']) ready.togglePick(ticker);
  assert.equal(buildHint(ready), null);
  assert.equal(buildHint(round(2)), null, 'level 2 is dealt its portfolio');

  // One stock can carry the whole 60%, and then there is nothing to say either.
  const oneStock = round(6);
  for (const ticker of ['WMT', 'BND', 'TLT', 'LQD']) oneStock.togglePick(ticker);
  assert.equal(buildHint(oneStock), null);

  // The levels that came before are unchanged.
  assert.equal(buildHint(round(1)), 'Pick 2 more holdings to carry on.');
  assert.equal(buildHint(round(4)), 'Pick 3 more holdings to carry on.');
});

test('every level names its own reveal panel, and none of them is the old ternary', () => {
  for (const level of LEVELS.levels) {
    assert.ok(level.revealLabel.length > 10, `level ${level.id} has no reveal label`);
  }
  assert.match(levelById(LEVELS, 4).revealLabel, /AI basket/);
  assert.match(levelById(LEVELS, 5).revealLabel, /risk/i);
});

test('the slider on each level reads the step and the units from levels.json', () => {
  assert.equal(guessStep(levelById(LEVELS, 4)), 0.05);
  assert.equal(guessStep(levelById(LEVELS, 5)), 0.01);
  // Level 5's guess is a share of 1 and reads as a percent on the screen.
  const five = round(5);
  for (const ticker of ['VOO', 'BND', 'GLD', 'XOM']) five.togglePick(ticker);
  five.toGuess();
  five.setGuess(0.38);
  assert.equal(guessSliderState(five).readout, '38%');
  const four = round(4);
  for (const ticker of ['BND', 'GLD', 'JNJ']) four.togglePick(ticker);
  four.toGuess();
  four.setGuess(0.55);
  assert.equal(guessSliderState(four).readout, '0.55');
});

test('basketFrom() accepts the registered basket and refuses anything else', () => {
  const basket = basketFrom(readJson('basket.json'));
  assert.equal(basket.length, 13);
  assert.deepEqual(basket, BASKET);
  // Level 4 is a beta TO this basket, so a round measured against some other
  // list of names would be a different level wearing level 4's title.
  assert.throws(() => basketFrom({ stocks: [] }), /carries no stocks/);
  assert.throws(() => basketFrom({}), /carries no stocks/);
  assert.throws(() => basketFrom({ stocks: [{ layer: 'chips' }] }), /no ticker/);
});

// --------------------------------------------- the reveal's number line
//
// Where the guess, the answer and the threshold fall on the line, and the gap in
// words. Pure: the rendering of it is tested in tests/gameShare.test.js, which
// has a document.

/** A level played to its reveal, with a given guess. */
function revealed(levelId, picks, guess) {
  const r = atGuess(levelId, picks);
  r.setGuess(guess);
  r.reveal();
  return r;
}

test('the number line is drawn on the level own scale', () => {
  // THE SAME RULER AS THE QUESTION. Level 3's slider ran from 1.0 to 5.0, so the
  // marks have to land where that slider would have put them - a reveal drawn
  // against a different scale is a reveal of a different number.
  const r = revealed(3, ['VOO', 'BND', 'GLD', 'XOM', 'JNJ'], 3.2);
  const line = revealLine(r);
  assert.equal(line.min, 1);
  assert.equal(line.max, 5);
  // 3.2 on a 1-to-5 scale is (3.2 - 1) / 4 = 55%.
  assert.ok(Math.abs(line.guessAt - 55) < 1e-9, `the guess sits at ${line.guessAt}%`);
  // A THOUSANDTH, not 1e-9: the positions are rounded to three decimals on the
  // way out, because they end up in a style attribute and 36.524439324273615%
  // is not a position anybody needs. Finer than a pixel on any screen.
  const expected = ((r.result.value - 1) / 4) * 100;
  assert.ok(Math.abs(line.answerAt - expected) < 1e-3,
    `the answer sits at ${line.answerAt}%, not ${expected}%`);
  // The span is a length, so it has no sign whichever way round the two fell.
  assert.ok(Math.abs(line.spanWidth - Math.abs(line.answerAt - line.guessAt)) < 1e-9);
  assert.equal(line.spanFrom, Math.min(line.guessAt, line.answerAt));
  // The threshold is on it too: 3 bets on a 1-to-5 scale is halfway.
  assert.ok(Math.abs(line.needAt - 50) < 1e-9);
  assert.equal(line.needShown, '3.0');
});

test('an answer past the end of the scale is held to the edge, and says so', () => {
  // NOT CLAMPED QUIETLY. levels.json records that level 5's share of risk can
  // pass 100% when a holding offsets the rest, and the slider stops at 100%; a
  // mark drawn off the end would be invisible, and one drawn at the edge with
  // nothing said about it is a lie about where the answer was.
  const r = revealed(5, ['VOO', 'BND', 'GLD', 'JNJ'], 0.5);

  const beyond = revealLine({ ...r, result: { ...r.result, value: 1.2, guess: 0.5 } });
  assert.equal(beyond.answerAt, 100, 'a mark past the top was not held to the line');
  assert.equal(beyond.beyond, true, 'and nothing said it had been held');

  const below = revealLine({ ...r, result: { ...r.result, value: 0.1, guess: 0.5 } });
  assert.equal(below.answerAt, 0);
  assert.equal(below.beyond, true);

  const inside = revealLine({ ...r, result: { ...r.result, value: 0.4, guess: 0.5 } });
  assert.equal(inside.beyond, false);
});

test('revealLine answers null where there is nothing to draw', () => {
  const r = round(3);
  for (const ticker of ['VOO', 'BND', 'GLD', 'XOM', 'JNJ']) r.togglePick(ticker);
  assert.equal(revealLine(r), null, 'a round with no result drew a line');
  r.toGuess();
  assert.equal(revealLine(r), null, 'a round with no guess drew a line');
});

test('the gap is said in words, and a guess that rounds to the answer is spot on', () => {
  const r = revealed(3, ['VOO', 'BND', 'GLD', 'XOM', 'JNJ'], 3.2);
  const line = revealLine(r);
  const said = gapSentence(r, line);
  assert.match(said, /^Out by \d+\.\d\.$/, `the gap read "${said}"`);
  // Level 3 answers to one decimal, so the sentence does too.
  assert.equal(said, `Out by ${line.gap.toFixed(1)}.`);

  // A guess that lands on the answer is not "out by 0.0", which reads as a fault.
  assert.equal(gapSentence(r, { ...line, gap: 0 }), 'Spot on.');
  // And one that rounds to zero in the level's own units is the same thing.
  assert.equal(gapSentence(r, { ...line, gap: 0.004 }), 'Spot on.');
});

test('every level can draw its own line, in its own units', () => {
  // A line is drawn on six of the seven levels. Level 2's pass condition is
  // "make a guess" and has no threshold, so it gets the line without the tick -
  // which is the case that would throw if the threshold were assumed.
  // Level 4 and level 6 are left out: their measures need a basket and a crash
  // window that atGuess() does not deal, and they are covered in the round's own
  // tests. The point here is the SCALES, and four different ones is the point.
  for (const [levelId, picks, guess] of [
    [1, ['VOO', 'VTI'], 0.8],
    [2, [], 2.5],
    [3, ['VOO', 'BND', 'GLD', 'XOM', 'JNJ'], 3.2],
    [5, ['VOO', 'BND', 'GLD', 'JNJ'], 0.4],
  ]) {
    const r = revealed(levelId, picks, guess);
    const line = revealLine(r);
    assert.ok(line, `level ${levelId} drew no line`);
    for (const at of [line.guessAt, line.answerAt, line.spanFrom]) {
      assert.ok(at >= 0 && at <= 100, `level ${levelId} put a mark at ${at}%`);
    }
    assert.ok(line.spanFrom + line.spanWidth <= 100 + 1e-9,
      `level ${levelId}'s span runs off the end`);
    assert.ok(line.needAt === null || (line.needAt >= 0 && line.needAt <= 100));
  }
});
