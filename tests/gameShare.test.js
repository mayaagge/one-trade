// tests/gameShare.test.js - the share card where a player meets it.
//
// tests/shareCard.test.js says what a card may contain. This one says WHERE one
// is offered, which is the other half of the spoiler rule:
//
//   * On a reveal that has a verdict: levels 1 to 6, passed or failed.
//   * On level 7's summary, once all three portfolios are in.
//   * NOT on one of level 7's three parts. There is no verdict yet there, and a
//     card offered after portfolio 1 would be a card about a portfolio two more
//     players are about to be dealt.
//
// Rendered through tests/stubDom.js, with real rounds played off the committed
// snapshot - so the result the card is built from is a real one.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { StubNode, textOf, withDocument } from './stubDom.js';
import { buildReturns } from '../js/returns.js';
import { GAME_DAYS } from '../scripts/build_game_data.mjs';
import { validateLevels, levelById } from '../js/levels.js';
import { createRound, createSeries } from '../js/round.js';
import { newSession, renderReveal, renderSeriesSummary, revealLine } from '../js/game.js';
import { cardText, shareMessage, cardFromResult, cardFromSeries } from '../js/shareCard.js';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));

const LEVELS = validateLevels(readJson('levels.json'));
const TICKERS = readJson('tickers.json');
const UNIVERSE = TICKERS.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
const KNOWN_TICKERS = UNIVERSE;

const GAME = (() => {
  const built = buildReturns(readJson('data/prices.json'));
  const tickers = built.tickers.slice().sort();
  const from = built.dates.length - GAME_DAYS;
  const dates = built.dates.slice(from);
  return {
    meta: { liveThrough: dates[dates.length - 1], firstDate: dates[0], days: GAME_DAYS },
    tickers,
    rows: dates.map((date, i) => [date, ...tickers.map((t) => built.byTicker[t][from + i])]),
  };
})();

/** Everything renderReveal() reads off its context, and nothing more. */
const context = (extra = {}) => ({
  game: GAME,
  series: null,
  nextLevelId: () => null,
  startRound: () => {},
  toMenu: () => {},
  finishSeries: () => {},
  nextPortfolio: () => {},
  ...extra,
});

/** Play level 3 for real, then draw its reveal. */
function revealOfLevel3(guess) {
  const round = createRound({ levels: LEVELS, levelId: 3, game: GAME, universe: UNIVERSE });
  for (const ticker of ['VOO', 'BND', 'GLD', 'XOM', 'JNJ']) round.togglePick(ticker);
  round.toGuess();
  round.setGuess(guess);
  const result = round.reveal();
  const restore = withDocument();
  try {
    return { view: renderReveal(context(), round), result, round };
  } finally { restore(); }
}

test('a reveal with a verdict offers the card', () => {
  const { view, result } = revealOfLevel3(3.0);
  const share = view.querySelector('share-card-button');
  assert.ok(share, 'there is no "Share my score" button on the reveal');
  assert.equal(share._text, 'Share my score');
  assert.match(textOf(view), /Never your holdings, your money, or - on the mystery-portfolio levels - the answer\./);
  assert.ok(result.stars >= 0);
});

test('a failed level still offers the card', () => {
  // A guess of 1.0 against a 5-holding spread: passed or not, the button is there.
  const { view } = revealOfLevel3(1.0);
  assert.ok(view.querySelector('share-card-button'), 'a missed level cannot be shared');
});

test('the screen never prints the card, only offers it', () => {
  // The headline belongs on the image. If the words were on the reveal too they
  // would be a second place to keep in step with levels.json.
  const { view, result, round } = revealOfLevel3(3.0);
  const card = cardFromResult(round.level, result, 'https://example.org/');
  assert.ok(!textOf(view).includes(card.headline));
});

test('level 7 offers nothing to share until all three are in', () => {
  const series = createSeries({
    levels: LEVELS, levelId: 7, game: GAME, universe: UNIVERSE, random: () => 0,
  });
  const restore = withDocument();
  try {
    for (let i = 0; i < series.count; i += 1) {
      const part = series.current();
      part.setGuess(3.0);
      part.reveal();
      const view = renderReveal(context({ series }), part);
      assert.equal(
        view.querySelector('share-card-button'), null,
        `portfolio ${i + 1} of 3 offers a share card before the level has a verdict`,
      );
      if (series.hasNext()) series.advance();
    }

    const summary = renderSeriesSummary(context({ series }), series);
    const share = summary.querySelector('share-card-button');
    assert.ok(share, 'the capstone summary offers no card');

    // And the summary itself still shows the portfolios - it is the screen the
    // player reads to find their own mistake. The CARD is what stays quiet.
    const onScreen = textOf(summary);
    assert.ok(KNOWN_TICKERS.some((t) => new RegExp(`\\b${t}\\b`).test(onScreen)),
      'the summary stopped showing the player their own portfolios');
  } finally { restore(); }
});

test('the card built on the capstone summary says nothing about the three portfolios', () => {
  const series = createSeries({
    levels: LEVELS, levelId: 7, game: GAME, universe: UNIVERSE, random: () => 0,
  });
  for (let i = 0; i < series.count; i += 1) {
    const part = series.current();
    part.setGuess(3.0);
    part.reveal();
    if (series.hasNext()) series.advance();
  }
  // Built the way the screen builds it: from the verdict alone.
  const card = cardFromSeries(levelById(LEVELS, 7), series.verdict(), 'https://example.org/');
  const text = `${cardText(card)}\n${shareMessage(card)}`;
  for (const ticker of KNOWN_TICKERS) {
    assert.ok(!new RegExp(`\\b${ticker}\\b`).test(text), `the capstone card names ${ticker}`);
  }
  for (const answer of series.answers) {
    assert.ok(!text.includes(answer.actual.toFixed(2)), 'the capstone card gives away an answer');
    assert.ok(!text.includes(String(answer.drawnId)), 'the capstone card names a pool portfolio');
  }
});

test('a stub node is enough to render a reveal, which is the point of the stub', () => {
  assert.ok(new StubNode('div') instanceof StubNode);
});

// ------------------------------------------- the number line, rendered

test('the reveal draws the line, says the gap, and announces itself', () => {
  const { view } = revealOfLevel3(3.2);

  const panel = view.querySelector('reveal-panel');
  assert.equal(panel.attributes.role, 'status', 'the reveal is not announced');

  const line = view.querySelector('numberline');
  assert.ok(line, 'there is no number line on the reveal');
  assert.equal(line.attributes['aria-hidden'], 'true',
    'the drawing is read out as well as the words that describe it');

  // THE MARKS ARE IN THEIR FINAL PLACES IN THE MARKUP, so the screen is complete
  // and readable with the animation off. The keyframes only move them there.
  const answer = view.querySelector('mark-answer');
  const guess = view.querySelector('mark-guess');
  assert.equal(guess.style.left, '55%', '3.2 on a 1-to-5 scale is 55% along');
  assert.match(answer.style.left, /^[\d.]+%$/);

  // And where the animation starts from is on the wrapper, for the keyframes:
  // only the round knows where on the scale the guess fell.
  assert.equal(line.style.getPropertyValue('--guess-at'), '55%');
  assert.match(line.style.getPropertyValue('--answer-at'), /^[\d.]+%$/);
  assert.match(line.style.getPropertyValue('--span-width'), /^[\d.]+%$/);

  // The gap in words, beside the drawing of it.
  assert.match(textOf(view), /Out by \d+\.\d\./);
  // And the ends of the scale, in the level's own units.
  assert.match(textOf(view), /1\.0/);
  assert.match(textOf(view), /5\.0/);
});

test('a guess EXACTLY EQUAL to the answer shares one label anchor, split away from each other', () => {
  // The real answer, read off an arbitrary guess first - level 3's five
  // holdings are fixed above, so the answer is deterministic and this is not
  // a hardcoded number that could drift out of date with the price snapshot.
  const { result: arbitrary } = revealOfLevel3(2.5);
  const { view, round, result } = revealOfLevel3(arbitrary.value);
  // THE GUESS IS THE ANSWER, exactly - ===, not "close enough" - which is the
  // one case a fixed 8px offset from each mark's own (then-identical) dot
  // cannot separate, and the case revealLine()'s own guessAt/answerAt must
  // therefore agree on exactly too.
  assert.equal(result.guess, result.value, 'this case needs the guess to equal the answer exactly');
  const line = revealLine(round);
  assert.equal(line.guessAt, line.answerAt, 'equal guess and answer landed at different points on the scale');

  const guessLabel = view.querySelector('mark-guess-label');
  const answerLabel = view.querySelector('mark-answer-label');
  assert.equal(guessLabel.style.left, answerLabel.style.left,
    'a spot-on guess did not share one label anchor with the answer');
  assert.ok(guessLabel.className.includes('mark-label-left'));
  assert.ok(answerLabel.className.includes('mark-label-right'));
});

test('a guess far from the answer keeps its own label anchor', () => {
  // 1.0 is the lowest the slider goes and a 5-holding spread never answers
  // that low, so this is far from the answer on every run of this test.
  const { view, result } = revealOfLevel3(1.0);
  assert.ok(result.value - 1.0 > 1, 'this case needs a guess genuinely far from the answer');
  const guessLabel = view.querySelector('mark-guess-label');
  const answerLabel = view.querySelector('mark-answer-label');
  assert.notEqual(guessLabel.style.left, answerLabel.style.left);
});

// ----------------------------------------- the share note, once per visit
//
// "The card shows your stars and one line about the result. Never your
// holdings, your money, or - on the mystery-portfolio levels - the answer."
// 23 words, and it used to be on EVERY reveal: 69 words across levels 1 to 3
// alone, where reading is 89% of the time to finish (BUILD_LOG.md session
// 2.34). A player who read it on their first reveal does not need it again.
//
// KEYED TO THE LEVEL, NOT TOGGLED ON RENDER. draw() re-renders the same screen
// for all sorts of reasons; a flag flipped on first paint would make the note
// vanish from the very reveal it belongs to. The session remembers WHICH level
// said it, so that reveal keeps it and later ones go without.

/** Play one single-question level and draw its reveal against a given session. */
function revealWithSession(levelId, picks, guess, session) {
  const round = createRound({ levels: LEVELS, levelId, game: GAME, universe: UNIVERSE });
  for (const ticker of picks) round.togglePick(ticker);
  if (round.state === 'build') round.toGuess();
  round.setGuess(guess);
  round.reveal(GAME);
  const restore = withDocument();
  try {
    return renderReveal(context({ session }), round);
  } finally { restore(); }
}

const hasShareNote = (view) => view.all().some((n) => n.classList?.contains?.('share-note'));

test('the share note is on the first reveal of a visit', () => {
  const session = newSession(null);
  const view = revealWithSession(1, ['VOO', 'VTI'], 0.9, session);
  assert.ok(hasShareNote(view), 'a player must be told what the card does and does not carry');
});

test('and not on a later level\'s reveal in the same visit', () => {
  const session = newSession(null);
  revealWithSession(1, ['VOO', 'VTI'], 0.9, session);
  const later = revealWithSession(3, ['VOO', 'BND', 'GLD', 'XOM', 'JNJ'], 3.2, session);
  assert.ok(!hasShareNote(later), 'the note was already read on level 1 this visit');
});

test('redrawing the same reveal keeps its note', () => {
  const session = newSession(null);
  revealWithSession(1, ['VOO', 'VTI'], 0.9, session);
  const again = revealWithSession(1, ['VOO', 'VTI'], 0.9, session);
  assert.ok(hasShareNote(again), 'a redraw of the screen that owns the note must not lose it');
});

test('with no session at all, the note is shown - the safe default', () => {
  const round = createRound({ levels: LEVELS, levelId: 1, game: GAME, universe: UNIVERSE });
  for (const ticker of ['VOO', 'VTI']) round.togglePick(ticker);
  round.toGuess();
  round.setGuess(0.9);
  round.reveal(GAME);
  const restore = withDocument();
  try {
    assert.ok(hasShareNote(renderReveal(context(), round)),
      'a caller without a session should get the privacy note, not lose it');
  } finally { restore(); }
});
