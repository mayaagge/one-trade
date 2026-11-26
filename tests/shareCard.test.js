// tests/shareCard.test.js - what a share card says, before anything is drawn.
//
// THE CARD IS PLAIN DATA FIRST. shareCardContent() returns the words and
// nothing else: no canvas, no document, no fonts. The drawing in
// js/shareCard.js turns that object into pixels and adds no text of its own, so
// everything a player could post is decided by a function node can run.
//
// WHAT THESE TESTS ARE REALLY FOR. A share card is the one thing in this game
// that leaves the browser, and two kinds of leak matter:
//
//   * A PRIVACY LEAK: a ticker, a dollar amount or a weight would post the
//     player's portfolio. docs/PRD.md: "It includes stars and the bets number,
//     never real holdings."
//   * A SPOILER LEAK: levels 2 and 7 deal their portfolios from the Hypothesis 3
//     pool, so the same portfolio reaches other players. Their cards carry the
//     stars and how close the guess was, never the answer and never the guess -
//     because the two together ARE the answer.
//
// Both are checked by scanning the whole card, not by reading the templates.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  cardFromResult,
  cardFromSeries,
  cardText,
  hidesValue,
  shareMessage,
  shareCardContent,
  drawShareCard,
  fontsReady,
  wrapLines,
  SHARE_MODE,
  SHARE_SOURCE,
  CARD_SIZE,
} from '../js/shareCard.js';
import {
  validateLevels, levelById, formatMeasure, formatGuess, displayFor, seriesVerdict, DISCLAIMER,
} from '../js/levels.js';
import { ABOUT } from '../js/config.js';

const read = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8'));
const LEVELS = validateLevels(read('../levels.json'));
const TICKERS = read('../tickers.json');

const KNOWN_TICKERS = TICKERS.groups.flatMap(
  (g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)),
);

const URL_FOR_TEST = 'https://example.org/one-trade/';
const LINK = `${URL_FOR_TEST}?src=${SHARE_SOURCE}#${SHARE_MODE}`;

/** A deep copy, so a test that breaks the file on purpose breaks only its copy. */
const copy = () => JSON.parse(JSON.stringify(LEVELS));

/**
 * A reveal result, as js/round.js builds one.
 *
 * `shown` goes through the real formatMeasure(), so a card that prints it prints
 * exactly what the reveal screen printed - this is the thing that keeps the
 * card and the screen from disagreeing about the same portfolio.
 */
function resultFor(levelId, { value, stars, guess = null, tickers = null, drawnId = null }) {
  const level = levelById(LEVELS, levelId);
  const held = tickers ?? ['VOO', 'BND', 'GLD', 'XOM', 'JPM'];
  const dollars = Object.fromEntries(held.map((t, i) => [t, 2000 + i * 100]));
  return {
    value,
    stars,
    guess,
    passed: stars > 0,
    tickers: held,
    weights: held.map(() => 1 / held.length),
    dollars,
    drawnId,
    shown: formatMeasure(value, {
      threshold: level.pass.threshold ?? null,
      display: displayFor(level).display,
      places: displayFor(level).revealPlaces,
    }),
  };
}

const headlineOf = (levelId, result) => cardFromResult(levelById(LEVELS, levelId), result, URL_FOR_TEST).headline;

// ------------------------------------------------------- the seven headlines

test('each level that builds its own portfolio leads on its own measure', () => {
  assert.equal(
    headlineOf(1, resultFor(1, { value: 0.94, stars: 3, tickers: ['VOO', 'VTI'] })),
    'I found two holdings with a correlation of 0.940. Can you beat it?',
  );
  assert.equal(
    headlineOf(3, resultFor(3, { value: 3.07, stars: 2 })),
    'I found 3.07 bets in 5 holdings. Can you beat it?',
  );
  assert.equal(
    headlineOf(4, resultFor(4, { value: 0.38, stars: 3, tickers: ['QQQ', 'BND', 'GLD', 'KO'] })),
    'My portfolio moves 0.38% for every 1% the AI basket moves. Can you get lower?',
  );
  assert.equal(
    headlineOf(5, resultFor(5, { value: 0.31, stars: 2, tickers: ['VOO', 'BND', 'GLD', 'KO'] })),
    'No holding carries more than 31% of my risk. Can you spread it thinner?',
  );
  assert.equal(
    headlineOf(6, resultFor(6, { value: 0.42, stars: 3, tickers: ['VOO', 'TLT', 'GLD', 'KO'] })),
    'My portfolio fell 0.42 times as far as the S&P 500 in the 2020 crash. Can you fall less?',
  );
});

test('a failed level still reads as a true sentence', () => {
  assert.equal(
    headlineOf(1, resultFor(1, { value: 0.42, stars: 0, tickers: ['GLD', 'NVDA'] })),
    'I found two holdings with a correlation of 0.420. Can you beat it?',
  );
  assert.equal(
    headlineOf(3, resultFor(3, { value: 2.14, stars: 0 })),
    'I found 2.14 bets in 5 holdings. Can you beat it?',
  );
  assert.equal(
    headlineOf(4, resultFor(4, { value: 0.78, stars: 0, tickers: ['QQQ', 'NVDA', 'AMD', 'MSFT'] })),
    'My portfolio moves 0.78% for every 1% the AI basket moves. Can you get lower?',
  );
  assert.equal(
    headlineOf(5, resultFor(5, { value: 0.48, stars: 0, tickers: ['NVDA', 'BND', 'GLD', 'KO'] })),
    'No holding carries more than 48% of my risk. Can you spread it thinner?',
  );
  assert.equal(
    headlineOf(6, resultFor(6, { value: 1.22, stars: 0, tickers: ['NVDA', 'AMD', 'MU', 'AVGO'] })),
    'My portfolio fell 1.22 times as far as the S&P 500 in the 2020 crash. Can you fall less?',
  );
});

test('a value the sentence cannot take gets the level\'s own second line', () => {
  // levels.json's guessNote: a legal level 6 build reaches -0.117, a portfolio
  // that ROSE 3.96% while the index fell. "Fell -0.12 times as far" is not
  // clumsy, it is false.
  assert.equal(
    headlineOf(6, resultFor(6, { value: -0.117, stars: 3, tickers: ['VOO', 'TLT', 'GLD', 'KO'] })),
    'My portfolio did not fall at all while the S&P 500 fell in the 2020 crash. Can you?',
  );
  // Exactly zero is not a rise either, and the same line covers it.
  assert.match(headlineOf(6, resultFor(6, { value: 0, stars: 3 })), /did not fall at all/);
  // levels.json's bucketNote: a portfolio can move slightly AGAINST the basket.
  assert.equal(
    headlineOf(4, resultFor(4, { value: -0.05, stars: 3, tickers: ['QQQ', 'TLT', 'GLD', 'KO'] })),
    'My portfolio moves against the AI basket, not with it. Can you do the same?',
  );
});

// ------------------------------------------- the two levels that must not tell

test('levels 2 and 7 are the pool levels, and they are the ones that hide the answer', () => {
  const hidden = LEVELS.levels.filter((level) => hidesValue(level)).map((level) => level.id);
  assert.deepEqual(hidden, [2, 7], 'the levels dealt from the Hypothesis 3 pool are 2 and 7');
});

test('level 2 says how close the guess was, in its own star words', () => {
  const close = (stars) => headlineOf(2, resultFor(2, { value: 3.7, stars, guess: 3.3 }));
  assert.equal(close(3), 'I guessed the bets in a mystery portfolio — within half a bet. Can you?');
  assert.equal(close(2), 'I guessed the bets in a mystery portfolio — within 1 bet. Can you?');
  // THE LOW BAND ASKS FOR BETTER. "Can you?" against a poor result would be
  // inviting a friend to do worse.
  assert.equal(close(1), 'I guessed the bets in a mystery portfolio — out by more than 1 bet. Can you get closer?');
});

test('level 7 says how close all three were, matching how the game awards its stars', () => {
  const level = levelById(LEVELS, 7);
  // Built from seriesVerdict() itself rather than from a star count written
  // here, so a band and the rule that earns it cannot drift apart.
  const bandFor = (answers) => cardFromSeries(level, seriesVerdict(level, answers), URL_FOR_TEST).headline;

  const allTight = [{ guess: 3.0, actual: 3.2 }, { guess: 2.0, actual: 2.1 }, { guess: 4.0, actual: 4.3 }];
  const twoTight = [{ guess: 3.0, actual: 3.2 }, { guess: 2.0, actual: 2.1 }, { guess: 4.0, actual: 4.8 }];
  const oneTight = [{ guess: 3.0, actual: 3.2 }, { guess: 2.0, actual: 2.9 }, { guess: 4.0, actual: 4.8 }];
  const missed = [{ guess: 3.0, actual: 3.2 }, { guess: 2.0, actual: 2.1 }, { guess: 4.0, actual: 6.0 }];

  assert.equal(seriesVerdict(level, allTight).stars, 3);
  assert.equal(seriesVerdict(level, twoTight).stars, 2);
  assert.equal(seriesVerdict(level, oneTight).stars, 1);
  assert.equal(seriesVerdict(level, missed).stars, 0);

  assert.equal(bandFor(allTight), 'Three mystery portfolios — all three within half a bet. Can you?');
  assert.equal(bandFor(twoTight), 'Three mystery portfolios — two of three within half a bet. Can you?');
  assert.equal(bandFor(oneTight), 'Three mystery portfolios — all three within 1 bet. Can you?');
  assert.equal(bandFor(missed), 'Three mystery portfolios — not all three within 1 bet. Can you get all three?');
});

test('a pool level card carries neither the answer nor the guess', () => {
  const result = resultFor(2, { value: 3.7, stars: 3, guess: 3.3, drawnId: 'p07' });
  const card = cardFromResult(levelById(LEVELS, 2), result, URL_FOR_TEST);
  const text = `${cardText(card)}\n${shareMessage(card)}`;
  // The answer, the guess, and the two of them as the reveal screen writes them.
  for (const leak of ['3.7', '3.3', result.shown, formatGuess(levelById(LEVELS, 2), 3.3), 'p07']) {
    assert.ok(!text.includes(leak), `a level 2 card gives away "${leak}": ${text}`);
  }
});

test('on a pool level the card does not change when the answer does', () => {
  // The property behind the rule: two players with the same stars post the same
  // card, so a friend who draws the same portfolio learns nothing from either.
  const level = levelById(LEVELS, 2);
  const one = cardFromResult(level, resultFor(2, { value: 1.4, stars: 3, guess: 1.2 }), URL_FOR_TEST);
  const other = cardFromResult(level, resultFor(2, { value: 5.9, stars: 3, guess: 5.7 }), URL_FOR_TEST);
  assert.deepEqual(one, other);
});

// --------------------------------------------------- never the portfolio

/** One card per level, with a portfolio in it, for the scans below. */
function everyCard() {
  const held = ['NVDA', 'TLT', 'GLD', 'XOM', 'JPM'];
  const cards = [];
  for (const level of LEVELS.levels) {
    if (level.id === 7) {
      cards.push(cardFromSeries(level, seriesVerdict(level, [
        { guess: 3.0, actual: 3.2 }, { guess: 2.0, actual: 2.1 }, { guess: 4.0, actual: 4.3 },
      ]), URL_FOR_TEST));
      continue;
    }
    // Level 2 passes on making a guess, so 0 stars is not one of its outcomes.
    const possible = level.pass.measure === 'guess' ? [1, 2, 3] : [0, 1, 2, 3];
    for (const stars of possible) {
      cards.push(cardFromResult(
        level,
        resultFor(level.id, { value: 0.42, stars, guess: 0.4, tickers: held, drawnId: 'p07' }),
        URL_FOR_TEST,
      ));
    }
  }
  return cards;
}

test('no card names a ticker', () => {
  for (const card of everyCard()) {
    const text = `${cardText(card)}\n${shareMessage(card)}`;
    for (const ticker of KNOWN_TICKERS) {
      assert.ok(
        !new RegExp(`\\b${ticker}\\b`).test(text),
        `${card.levelLine} posts the holding ${ticker}: ${text}`,
      );
    }
  }
});

test('no card names a dollar amount or a weight', () => {
  for (const card of everyCard()) {
    const text = `${cardText(card)}\n${shareMessage(card)}`;
    assert.ok(!text.includes('$'), `${card.levelLine} posts money: ${text}`);
    assert.ok(!/\d,\d{3}/.test(text), `${card.levelLine} posts a dollar figure: ${text}`);
    for (const amount of [2000, 2100, 2200, 2300, 2400]) {
      assert.ok(!text.includes(String(amount)), `${card.levelLine} posts the split: ${text}`);
    }
    assert.ok(!/\bweight/i.test(text), `${card.levelLine} talks about weights: ${text}`);
  }
});

// ------------------------------------------------------------------ the link

test('the link is the game, with the share source and a mode, and nothing else', () => {
  // THE FRAGMENT USED TO HAVE TO BE EMPTY, because a fragment is somewhere a
  // draw could be encoded and handed to whoever opens the link. It now carries
  // the MODE, which is the one thing js/app.js ever puts in the URL, so the test
  // changed from "there is no fragment" to "the fragment is a mode name and
  // nothing else" - which rules out the same leak and is checkable rather than
  // merely absent.
  const modes = ['learn', 'daily', 'weekly', 'crash', 'sandbox', 'mine', 'research'];
  for (const card of everyCard()) {
    assert.equal(card.link, LINK);
    const url = new globalThis.URL(card.link);
    assert.deepEqual([...url.searchParams.keys()], ['src'], 'the link carries more than the source code');
    assert.equal(url.searchParams.get('src'), 'share');
    assert.equal(url.hash, `#${SHARE_MODE}`);
    assert.ok(modes.includes(url.hash.slice(1)), `the fragment "${url.hash}" is not a mode`);
    // A score card opens the levels, which is where it was earned.
    assert.equal(SHARE_MODE, 'learn');
  }
});

test('the real link is ABOUT.url, and it survives one that already has a query', () => {
  const card = cardFromResult(levelById(LEVELS, 3), resultFor(3, { value: 3.07, stars: 2 }), ABOUT.url);
  assert.equal(card.link, 'https://mayaagge.github.io/one-trade/?src=share#learn');
  const withQuery = cardFromResult(
    levelById(LEVELS, 3), resultFor(3, { value: 3.07, stars: 2 }), 'https://example.org/?a=1',
  );
  assert.equal(withQuery.link, 'https://example.org/?a=1&src=share#learn');
});

// ----------------------------------------------------------- the rest of it

test('every card says the level, the stars and the disclaimer', () => {
  for (const card of everyCard()) {
    assert.match(card.levelLine, /^Level [1-7] · .+/);
    assert.equal(card.stars.of, 3);
    assert.ok(card.stars.count >= 0 && card.stars.count <= 3);
    assert.equal(card.disclaimer, DISCLAIMER);
    assert.match(cardText(card), /Educational, not investment advice\./);
    // The caption that travels with the picture carries it too.
    assert.match(shareMessage(card), /Educational, not investment advice\./);
    assert.ok(shareMessage(card).includes(card.headline));
    assert.equal(card.size, CARD_SIZE);
    assert.match(card.fileName, /^one-trade-level-[1-7]\.png$/);
    // The alt text is the card read out, for a screen reader and for the share sheet.
    assert.ok(card.alt.includes(card.headline), 'the alt text leaves the headline out');
    assert.ok(card.alt.includes(card.stars.text), 'the alt text leaves the stars out');
  }
});

test('the stars on the card are the stars the level gave', () => {
  for (const stars of [0, 1, 2, 3]) {
    const card = cardFromResult(levelById(LEVELS, 3), resultFor(3, { value: 3.07, stars }), URL_FOR_TEST);
    assert.equal(card.stars.count, stars);
    assert.equal(card.stars.text, `${stars} of 3 stars`);
  }
});

test('the card is 1080 by 1080', () => {
  assert.equal(CARD_SIZE, 1080);
});

// -------------------------------------------------- the file holds the words

test('levels.json carries a share line for every level, and the validator insists', () => {
  for (const level of LEVELS.levels) {
    assert.equal(typeof level.share?.headline, 'string', `level ${level.id} has no share headline`);
  }

  const missing = copy();
  delete missing.levels[2].share;
  assert.throws(() => validateLevels(missing), /share\.headline/);
});

test('the validator refuses a pool level whose headline would print the answer', () => {
  const leaky = copy();
  // Level 2, with level 3's template: a headline that prints the measure.
  leaky.levels[1].share.headline = 'I found {value} bets. Can you beat it?';
  assert.throws(() => validateLevels(leaky), /level 2.*\{value\}/s);

  const noBands = copy();
  delete noBands.levels[6].share.bands['0'];
  assert.throws(() => validateLevels(noBands), /level 7.*band/s);
});

test('a card for a star count the level has no words for throws rather than inventing one', () => {
  const level = levelById(LEVELS, 2);
  assert.throws(
    () => shareCardContent({ level, stars: 9, url: URL_FOR_TEST }),
    /9/,
    'an impossible star count passed silently',
  );
});

// ------------------------------------------------------------- the drawing

/**
 * A canvas that writes down what was asked of it.
 *
 * Node has no canvas, and this project adds no libraries to get one. What is
 * worth checking without pixels is that drawShareCard() paints the content and
 * invents nothing: every string that reaches fillText has to be one the pure
 * function already decided on.
 */
function recordingCanvas() {
  const calls = { text: [], fonts: [], fills: [] };
  const ctx = {
    set fillStyle(value) { calls.fills.push(value); },
    get fillStyle() { return calls.fills[calls.fills.length - 1]; },
    set font(value) { calls.fonts.push(value); },
    get font() { return calls.fonts[calls.fonts.length - 1]; },
    strokeStyle: '', lineWidth: 0, textAlign: '', textBaseline: '',
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    fill() {}, stroke() {},
    fillText(text) { calls.text.push(String(text)); },
    // Every character the same width, so wrapping is predictable here.
    measureText(text) { return { width: String(text).length * 30 }; },
  };
  return { canvas: { getContext: () => ctx, width: 0, height: 0 }, calls };
}

test('the drawing paints the card and invents no words of its own', () => {
  const card = cardFromResult(levelById(LEVELS, 3), resultFor(3, { value: 3.07, stars: 2 }), URL_FOR_TEST);
  const { canvas, calls } = recordingCanvas();
  drawShareCard(canvas, card);

  assert.equal(canvas.width, CARD_SIZE);
  assert.equal(canvas.height, CARD_SIZE);

  const painted = calls.text.join(' ');
  for (const words of [card.wordmark, card.levelLine, card.link, card.disclaimer]) {
    assert.ok(calls.text.includes(words), `the card never painted "${words}"`);
  }
  // The headline arrives in wrapped pieces, which together are the headline.
  const headlineLines = calls.text.filter((line) => card.headline.includes(line) && line !== card.wordmark);
  assert.equal(headlineLines.join(' '), card.headline);
  // And nothing else was painted.
  const allowed = new Set([card.wordmark, card.levelLine, card.link, card.disclaimer, ...headlineLines]);
  for (const line of calls.text) {
    assert.ok(allowed.has(line), `the drawing added "${line}", which no one decided on`);
  }
  assert.ok(!painted.includes('$'));
});

test('wrapping breaks a line only where it has to', () => {
  const measure = (text) => text.length * 10;
  assert.deepEqual(wrapLines(measure, 'one two three', 1000), ['one two three']);
  assert.deepEqual(wrapLines(measure, 'one two three', 70), ['one two', 'three']);
  // A word longer than the line goes on its own line rather than disappearing.
  assert.deepEqual(wrapLines(measure, 'short loooooooooong', 60), ['short', 'loooooooooong']);
});

test('the fonts are waited for, and a browser without them still draws', async () => {
  const asked = [];
  let readyWaited = false;
  await fontsReady({
    fonts: {
      load: (font) => { asked.push(font); return Promise.resolve(); },
      get ready() { readyWaited = true; return Promise.resolve(); },
    },
  });
  assert.ok(asked.length >= 1, 'no font was asked for before drawing');
  assert.ok(asked.every((font) => /\d+px/.test(font)), 'a font was asked for without a size');
  assert.ok(readyWaited, 'the card did not wait for the fonts in flight');

  // No document.fonts at all, and a font that refuses to load: neither throws.
  await fontsReady({});
  await fontsReady({ fonts: { load: () => Promise.reject(new Error('no')), ready: Promise.resolve() } });
});

test('a card that fell short asks for better, never for the same', () => {
  // "Can you?" invites a friend to match the result. On a band that fell short
  // that is an invitation to do worse, so every such ending asks for better.
  const level2 = levelById(LEVELS, 2);
  const level7 = levelById(LEVELS, 7);
  assert.equal(level2.share.endings['1'], 'Can you get closer?');
  assert.equal(level7.share.endings['0'], 'Can you get all three?');
  for (const [stars, ending] of Object.entries(level2.share.endings)) {
    if (Number(stars) >= 2) assert.equal(ending, 'Can you?', `level 2, ${stars} stars`);
  }
  for (const [stars, ending] of Object.entries(level7.share.endings)) {
    if (Number(stars) >= 1) assert.equal(ending, 'Can you?', `level 7, ${stars} stars`);
  }
  // The levels that print a number end by naming the DIRECTION - beat it, get
  // lower, spread it thinner, fall less - so the same sentence asks for better
  // whether it passed or failed, and needs no second ending.
  for (const level of LEVELS.levels) {
    if (hidesValue(level)) continue;
    assert.ok(!/\. Can you\?$/.test(level.share.headline),
      `level ${level.id} ends with a bare "Can you?": ${level.share.headline}`);
    // A second line for a NEGATIVE value is the other way round: level 4's
    // describes a portfolio moving against the basket and level 6's one that did
    // not fall at all, and both are the best thing that can happen on their
    // level. "Can you do the same?" and "Can you?" ask a friend to match a good
    // result, which is what they are for.
    assert.equal(level.share.headlineBelowZero ?? null, level.id === 4
      ? 'My portfolio moves against the AI basket, not with it. Can you do the same?'
      : null);
    assert.equal(level.share.headlineAtOrBelowZero ?? null, level.id === 6
      ? 'My portfolio did not fall at all while the S&P 500 fell in the 2020 crash. Can you?'
      : null);
  }
});

test('level 1 reveals a correlation to three decimals, on the card and on the screen', () => {
  // A real 0.9962 reading "1.00" claims a pair that moves together perfectly.
  const level = levelById(LEVELS, 1);
  assert.equal(displayFor(level).revealPlaces, 3);
  const result = resultFor(1, { value: 0.9962, stars: 3, tickers: ['VOO', 'VTI'] });
  assert.equal(result.shown, '0.996');
  assert.equal(
    cardFromResult(level, result, URL_FOR_TEST).headline,
    'I found two holdings with a correlation of 0.996. Can you beat it?',
  );
  // The near-threshold rule still wins where it has to.
  assert.equal(
    formatMeasure(0.7996, { threshold: 0.8, display: 'number', places: 3 }), '0.7996',
  );
  // And every other level still reveals two.
  for (const other of LEVELS.levels) {
    if (other.id !== 1) assert.equal(displayFor(other).revealPlaces, 2, `level ${other.id}`);
  }
});
