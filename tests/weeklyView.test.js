// tests/weeklyView.test.js - the weekly challenge screen, actually rendered.
//
// Rendered through tests/stubDom.js, with the real levels.json and the real
// data/game.json, so the portfolio on the screen is the one a player gets.
//
// THE THREE THINGS THIS CATCHES that a unit test of the pure logic cannot:
//
//   * NOTHING IS SENT. docs/PRD.md gives the Worker two kinds of message and a
//     weekly guess is neither. The screen is rendered and played with fetch
//     watched: the only requests allowed are the files it reads.
//   * THE CARD KEEPS THE ANSWER. Everybody has the same portfolio this week, so
//     a card naming the bets would hand the answer to whoever has not played.
//     The card carries the stars and the band, and ?src=weekly.
//   * THE PORTFOLIO'S NAME IS NOT ON THE CARD EITHER. "Gold, bonds, oil and
//     staples" is a list of the holdings in words.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { StubNode, textOf, withDocument } from './stubDom.js';
import { mountWeekly } from '../js/weeklyView.js';
import { WEEKLY_STORAGE_KEY, mondayOf, portfolioFor } from '../js/weekly.js';
import { validateLevels } from '../js/levels.js';
import { cardText, shareMessage, hidesValue } from '../js/shareCard.js';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));
const LEVELS = validateLevels(readJson('levels.json'));
const WEEKLY = LEVELS.weekly;
const TICKERS = readJson('tickers.json');
const GAME = readJson('data/game.json');
const WHY = readJson('why.json');

const ALL_TICKERS = TICKERS.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));

/** A browser for one render: a document, a store, and a watched fetch. */
function browser({ store = {} } = {}) {
  const asked = [];
  const restoreDom = withDocument({
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
      removeItem: (key) => { delete store[key]; },
    },
    location: { origin: 'http://localhost:8000', pathname: '/' },
    fetch: async (url) => {
      asked.push(String(url));
      const body = String(url).includes('levels.json') ? LEVELS
        : String(url).includes('game.json') ? GAME
          : String(url).includes('why.json') ? WHY
            : TICKERS;
      return { ok: true, status: 200, json: async () => body };
    },
  });
  return { root: new StubNode('main'), store, asked, restore: restoreDom };
}

const PLAYING_DAY = '2026-12-02';            // a Wednesday in the first week

test('before the first Monday the screen says when it starts, and deals nothing', async () => {
  const b = browser();
  try {
    await mountWeekly(b.root, { now: '2026-11-26' });
    const text = textOf(b.root);
    assert.match(text, /starts on Monday/i);
    assert.ok(!/slider|Reveal the answer/i.test(text), 'a portfolio was dealt before the first week');
    assert.match(text, /Educational, not investment advice\./);
  } finally { b.restore(); }
});

test('a week deals one portfolio, asks for a guess, and reveals it', async () => {
  const b = browser();
  try {
    const view = await mountWeekly(b.root, { now: PLAYING_DAY });
    assert.match(textOf(b.root), /Weekly challenge/);

    // The guess comes first: no answer anywhere on the screen yet.
    const bets = view.state().round.result;
    assert.equal(bets, null, 'the answer was worked out before the guess');

    view.guess(2.5);
    const result = view.reveal();
    assert.ok(Number.isFinite(result.value));
    assert.equal(result.stars >= 1, true, 'the weekly passes on making a guess');
    assert.match(textOf(b.root), /Educational, not investment advice\./);
  } finally { b.restore(); }
});

test('the answer is measured to the Friday before, not to the latest day', async () => {
  const b = browser();
  try {
    const view = await mountWeekly(b.root, { now: PLAYING_DAY });
    view.guess(2.5);
    const result = view.reveal();
    const anchor = view.state().anchor;
    assert.ok(anchor < mondayOf(PLAYING_DAY), `the window ends on ${anchor}, which is not before the Monday`);
    assert.equal(result.endDate, anchor, 'the round measured to a different day than the screen says');
    assert.match(textOf(b.root), new RegExp(anchor));
  } finally { b.restore(); }
});

test('nothing is sent anywhere: the only requests are the files the screen reads', async () => {
  const b = browser();
  try {
    const view = await mountWeekly(b.root, { now: PLAYING_DAY });
    view.guess(3.1);
    view.reveal();
    for (const url of b.asked) {
      assert.match(url, /levels\.json|game\.json|tickers\.json|why\.json/, `the screen fetched ${url}`);
    }
    assert.ok(!b.asked.some((url) => /guess|ping|worker/i.test(url)), 'a guess record was sent');
  } finally { b.restore(); }
});

test('a reload in the same week lands on the reveal, not on a second go', async () => {
  const store = {};
  const first = browser({ store });
  try {
    const view = await mountWeekly(first.root, { now: PLAYING_DAY });
    view.guess(2.2);
    view.reveal();
    assert.deepEqual(JSON.parse(store[WEEKLY_STORAGE_KEY]), { week: mondayOf(PLAYING_DAY), guess: 2.2 });
  } finally { first.restore(); }

  const again = browser({ store });
  try {
    const view = await mountWeekly(again.root, { now: PLAYING_DAY });
    assert.equal(view.state().status, 'done');
    assert.match(textOf(again.root), /You guessed 2\.2/);
  } finally { again.restore(); }
});

test('next week is a new portfolio and a fresh go', async () => {
  const store = { [WEEKLY_STORAGE_KEY]: JSON.stringify({ week: '2026-11-30', guess: 2.2 }) };
  const b = browser({ store });
  try {
    const view = await mountWeekly(b.root, { now: '2026-12-09' });
    assert.equal(view.state().status, 'playing');
    assert.notEqual(
      view.state().portfolio.id,
      portfolioFor(WEEKLY, '2026-11-30').id,
      'the next week dealt the same portfolio',
    );
  } finally { b.restore(); }
});

// -------------------------------------------------------------- the card

test('the weekly card carries the stars and the band, and never the answer', async () => {
  const b = browser();
  try {
    const view = await mountWeekly(b.root, { now: PLAYING_DAY });
    view.guess(2.5);
    const result = view.reveal();
    const card = view.card();
    const text = `${cardText(card)}\n${shareMessage(card)}`;

    assert.ok(hidesValue(WEEKLY), 'the weekly does not hide its answer');
    // Not the answer, not the guess, not the two decimals of either.
    for (const leak of [result.shown, result.value.toFixed(2), result.value.toFixed(1), '2.5']) {
      assert.ok(!text.includes(leak), `the weekly card gives away "${leak}": ${text}`);
    }
    // Not the holdings, and not the portfolio's NAME, which lists them in words.
    for (const ticker of ALL_TICKERS) {
      assert.ok(!new RegExp(`\\b${ticker}\\b`).test(text), `the card names ${ticker}`);
    }
    assert.ok(!text.includes(view.state().portfolio.name), 'the card names the portfolio');
    assert.ok(!text.includes('$'), 'the card posts money');

    // What it does carry.
    assert.match(text, /Weekly challenge/);
    assert.match(card.link, /\?src=weekly$/);
    assert.match(text, /Educational, not investment advice\./);
    assert.ok(card.stars.count >= 1 && card.stars.count <= 3);
  } finally { b.restore(); }
});

test('two players with the same stars post the same card, whatever they guessed', async () => {
  // The spoiler property, as on levels 2 and 7: the card cannot be read
  // backwards into the answer.
  const cards = [];
  for (const guess of [2.4, 2.6]) {
    const b = browser();
    try {
      const view = await mountWeekly(b.root, { now: PLAYING_DAY });
      view.guess(guess);
      const result = view.reveal();
      cards.push({ stars: result.stars, card: view.card() });
    } finally { b.restore(); }
  }
  if (cards[0].stars === cards[1].stars) {
    assert.deepEqual(cards[0].card, cards[1].card);
  }
});
