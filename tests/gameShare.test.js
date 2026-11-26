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
import { renderReveal, renderSeriesSummary } from '../js/game.js';
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
