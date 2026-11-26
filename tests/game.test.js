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
  guessPlaces,
  guessSliderState,
  guessStep,
  newSession,
  recordResult,
  starText,
  starsExplanation,
} from '../js/game.js';
// The picker, the allocator and the money they are written in now live in
// js/build.js, shared with Crash replay.
import { floorNotes, money } from '../js/build.js';

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

/** A fresh round on a level, with the draw pinned. */
function round(levelId) {
  return createRound({
    levels: LEVELS, levelId, game: GAME, universe: UNIVERSE, basket: BASKET, random: () => 0,
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
  assert.deepEqual([two.min, two.max, two.step], [1, 5, 0.1]);
  assert.equal(two.value, 3, 'halfway between 1 and 5 bets');
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
  assert.match(text, /named the right bucket/);
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
  recordResult(session, 2, { stars: 2, drawnId: 'p11' });
  recordResult(session, 2, { stars: 1, drawnId: 'p04' });
  assert.deepEqual([...session.drawnPoolIds].sort(), ['p04', 'p11']);
  // A level that draws nothing adds nothing.
  recordResult(session, 3, { stars: 1, drawnId: null });
  assert.equal(session.drawnPoolIds.size, 2);
});

test('every id the session could remember is a real pool portfolio', () => {
  const ids = new Set(LEVELS.guessPool.portfolios.map((p) => p.id));
  const session = newSession();
  for (const portfolio of LEVELS.guessPool.portfolios) {
    recordResult(session, 2, { stars: 1, drawnId: portfolio.id });
  }
  for (const id of session.drawnPoolIds) assert.ok(ids.has(id), `${id} is not in the pool`);
  assert.equal(session.drawnPoolIds.size, 20);
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

  // QQQ sits at its floor, so - is off and + is on.
  assert.equal(r.canLower('QQQ'), false);
  assert.equal(r.canRaise('QQQ'), true);
  // The others can give and take.
  assert.equal(r.canLower('BND'), true);
  assert.equal(r.canRaise('BND'), true);

  // What the buttons say matches what the round will actually do.
  for (const ticker of r.picks) {
    assert.equal(r.canLower(ticker), r.adjustDollars(ticker, -1) === 1,
      `${ticker}: the - button and adjustDollars disagree`);
    if (r.canLower(ticker)) r.adjustDollars(ticker, 1);     // put it back
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
