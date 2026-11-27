// tests/dailyView.test.js - the daily puzzle screen, actually rendered.
//
// WHY A DOM STUB RATHER THAN A BROWSER, and where it lives: tests/stubDom.js,
// which the Learn screens' share test uses too. What it checks is the thing a
// unit test of the pure logic cannot - that the words reach the screen, that a
// click locks exactly one answer, and that a reload lands where it should.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { StubNode, textOf } from './stubDom.js';
import { mountDaily } from '../js/dailyView.js';
import { STORAGE_KEY } from '../js/daily.js';

const read = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8'));
const TICKERS = read('tickers.json');

/** A document, a localStorage and a fetch, for one render. */
function browser({ daily, store = {} } = {}) {
  const root = new StubNode('main');
  const previous = {
    document: globalThis.document,
    fetch: globalThis.fetch,
    localStorage: globalThis.localStorage,
    location: globalThis.location,
  };
  globalThis.document = { createElement: (tag) => new StubNode(tag) };
  globalThis.localStorage = {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
  };
  globalThis.location = { origin: 'http://localhost:8000', pathname: '/' };
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => (url.includes('daily.json') ? daily : TICKERS),
  });
  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  };
  return { root, store, restore };
}

const ANSWERS = [
  { key: 'same', label: 'the same bet' },
  { key: 'partly', label: 'partly the same bet' },
  { key: 'different', label: 'different bets' },
];

function dailyDoc(date = '2026-11-27') {
  return {
    meta: {
      from: date,
      to: date,
      timeZone: 'America/New_York',
      windowDays: 252,
      answers: ANSWERS,
      surpriseKinds: [
        { key: 'A', line: 'Different groups, same bet: these two moved together over the last year.' },
        { key: 'B', line: 'Same group, different bets: these two moved mostly independently over the last year.' },
      ],
    },
    entries: [{
      date,
      window: { days: 252, from: '2025-11-25', to: '2026-11-25' },
      surpriseKind: 'A',
      pairs: [
        { a: 'VXUS', b: 'QQQ', correlation: 0.8203, answer: 'same', groups: ['international_funds', 'core_us_funds'], surprise: 'A' },
        { a: 'AVGO', b: 'ORCL', correlation: 0.4932, answer: 'partly', groups: ['ai_stocks', 'ai_stocks'], surprise: null },
        { a: 'NVDA', b: 'GS', correlation: 0.4676, answer: 'partly', groups: ['ai_stocks', 'banks'], surprise: null },
        { a: 'ABBV', b: 'BND', correlation: 0.0829, answer: 'different', groups: ['health_care', 'bonds_and_gold'], surprise: null },
        { a: 'ADBE', b: 'CSCO', correlation: -0.0839, answer: 'different', groups: ['other_large_tech', 'other_large_tech'], surprise: 'B' },
      ],
    }],
  };
}

// ------------------------------------------------------------- the states

test('a date with no puzzle says come back tomorrow, and does not look like an error', async () => {
  const { root, restore } = browser({ daily: dailyDoc('2026-11-27') });
  try {
    await mountDaily(root, { now: '2026-11-26' });
    const text = textOf(root);
    assert.match(text, /Today's puzzle isn't ready yet\. Come back tomorrow\./);
    assert.ok(!/error|failed|could not/i.test(text), `the waiting screen reads as a fault: ${text}`);
    assert.match(text, /Educational, not investment advice\./);
  } finally { restore(); }
});

test('the committed file today renders that same waiting screen', async () => {
  // The real data, on the real date this was written.
  const { root, restore } = browser({ daily: read('data/daily.json') });
  try {
    await mountDaily(root, { now: '2026-11-26' });
    assert.match(textOf(root), /Come back tomorrow/);
  } finally { restore(); }
});

test('a day with a puzzle opens on the first pair and offers three answers', async () => {
  const { root, restore } = browser({ daily: dailyDoc() });
  try {
    await mountDaily(root, { now: '2026-11-27' });
    const text = textOf(root);
    assert.match(text, /Pair 1 of 5/);
    assert.match(text, /VXUS and QQQ/);
    const buttons = root.querySelectorAll('daily-answer');
    assert.equal(buttons.length, 3);
    assert.deepEqual(buttons.map((b) => b._text), ANSWERS.map((a) => a.label));
    // Nothing is given away before the answer is locked.
    assert.ok(!text.includes('0.82'), 'the correlation is on screen before the player has answered');
    assert.ok(!/the same bet:/.test(text));
  } finally { restore(); }
});

// -------------------------------------------------------- lock, then reveal

test('clicking an answer locks it and reveals the pair', async () => {
  const { root, store, restore } = browser({ daily: dailyDoc() });
  try {
    await mountDaily(root, { now: '2026-11-27' });
    root.querySelectorAll('daily-answer')[0].click();      // "the same bet", which is right

    const text = textOf(root);
    assert.match(text, /VXUS \(International funds\) and QQQ \(Core US funds\): 0\.82, the same bet/);
    assert.match(text, /Over the last year \(252 trading days\), as of 25 Nov 2026\./);
    assert.match(text, /Right\./);
    // The surprise line, because this pair is one.
    assert.match(text, /Different groups, same bet: these two moved together over the last year\./);
    // And the note that level 1 measures something else.
    assert.match(text, /Level 1 measures three years/);
    // It has moved on to the next pair.
    assert.match(text, /Pair 2 of 5/);
    assert.match(text, /AVGO and ORCL/);

    // Saved before the reveal was drawn.
    assert.deepEqual(JSON.parse(store[STORAGE_KEY]), { date: '2026-11-27', answers: ['same'] });
  } finally { restore(); }
});

test('a wrong answer says what the player said, and what it was', async () => {
  const { root, restore } = browser({ daily: dailyDoc() });
  try {
    await mountDaily(root, { now: '2026-11-27' });
    root.querySelectorAll('daily-answer')[2].click();      // "different bets", which is wrong
    const text = textOf(root);
    assert.match(text, /Not quite\. You said different bets\./);
    assert.match(text, /0\.82, the same bet/);
  } finally { restore(); }
});

test('the pair on screen cannot be answered twice', async () => {
  const { root, store, restore } = browser({ daily: dailyDoc() });
  try {
    await mountDaily(root, { now: '2026-11-27' });
    const first = root.querySelectorAll('daily-answer');
    first[0].click();
    // The old buttons are off the screen now; clicking a stale one changes nothing.
    first[1].click();
    first[2].click();
    assert.deepEqual(JSON.parse(store[STORAGE_KEY]).answers, ['same']);
    assert.match(textOf(root), /Pair 2 of 5/);
  } finally { restore(); }
});

// ------------------------------------------------------------------ resume

test('a reload comes back to the pair the player had reached', async () => {
  const store = { [STORAGE_KEY]: JSON.stringify({ date: '2026-11-27', answers: ['same', 'partly'] }) };
  const { root, restore } = browser({ daily: dailyDoc(), store });
  try {
    await mountDaily(root, { now: '2026-11-27' });
    const text = textOf(root);
    assert.match(text, /Pair 3 of 5/);
    assert.match(text, /NVDA and GS/);
    // The two already answered are listed, and not answerable again.
    assert.equal(root.querySelectorAll('daily-done').length, 2);
    assert.equal(root.querySelectorAll('daily-answer').length, 3, 'only the current pair has buttons');
  } finally { restore(); }
});

test('the screen still works when storage is unavailable', async () => {
  const { root, restore } = browser({ daily: dailyDoc() });
  try {
    globalThis.localStorage = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
      removeItem() { throw new Error('blocked'); },
    };
    await mountDaily(root, { now: '2026-11-27' });
    assert.match(textOf(root), /Pair 1 of 5/);
    root.querySelectorAll('daily-answer')[0].click();
    // No save is possible, but the puzzle plays.
    assert.match(textOf(root), /Pair 2 of 5/);
  } finally { restore(); }
});

// -------------------------------------------------------------------- done

test('finishing shows the score, the grid in words as well as colour, and Share', async () => {
  const { root, restore } = browser({ daily: dailyDoc() });
  try {
    await mountDaily(root, { now: '2026-11-27' });
    for (const answer of ['same', 'partly', 'partly', 'different', 'same']) {
      const buttons = root.querySelectorAll('daily-answer');
      buttons[ANSWERS.findIndex((a) => a.key === answer)].click();
    }
    const text = textOf(root);
    assert.match(text, /4 \/ 5/);

    const squares = root.querySelectorAll('daily-square');
    assert.equal(squares.length, 5);
    // Colour is never the only carrier: each square says so in words.
    assert.deepEqual(
      squares.map((s) => s.querySelector('daily-square-text')._text),
      ['1: right', '2: right', '3: right', '4: right', '5: wrong'],
    );
    assert.ok(root.querySelector('daily-share'), 'there is no Share button');
    assert.match(text, /The squares say how you did, never which pairs you had/);
    assert.match(text, /Educational, not investment advice\./);
  } finally { restore(); }
});

test('a finished day reloads as finished, not as a fresh puzzle', async () => {
  const store = {
    [STORAGE_KEY]: JSON.stringify({ date: '2026-11-27', answers: ['same', 'partly', 'partly', 'different', 'different'] }),
  };
  const { root, restore } = browser({ daily: dailyDoc(), store });
  try {
    await mountDaily(root, { now: '2026-11-27' });
    assert.match(textOf(root), /5 \/ 5/);
    assert.equal(root.querySelectorAll('daily-answer').length, 0, 'a finished day is offering answers again');
  } finally { restore(); }
});

test('midnight mid-puzzle: finish yesterday, then today is offered', async () => {
  const doc = dailyDoc('2026-11-27');
  doc.entries.push({ ...dailyDoc('2026-11-28').entries[0] });
  doc.meta.to = '2026-11-28';
  const store = { [STORAGE_KEY]: JSON.stringify({ date: '2026-11-27', answers: ['same', 'partly', 'partly'] }) };
  const { root, restore } = browser({ daily: doc, store });
  try {
    await mountDaily(root, { now: '2026-11-28' });
    assert.match(textOf(root), /You started 27 Nov 2026's puzzle before midnight/);
    assert.match(textOf(root), /Pair 4 of 5/);

    for (const answer of ['different', 'different']) {
      const buttons = root.querySelectorAll('daily-answer');
      buttons[ANSWERS.findIndex((a) => a.key === answer)].click();
    }
    const text = textOf(root);
    assert.match(text, /That was 27 Nov 2026's puzzle, which you had already started\./);

    // And today is a button, not something that happened to the player.
    const play = root.all().find((n) => n._text === "Play today's puzzle");
    assert.ok(play, "today's puzzle is not offered");
    play.click();
    assert.match(textOf(root), /Pair 1 of 5/);
    assert.deepEqual(JSON.parse(store[STORAGE_KEY]), { date: '2026-11-28', answers: [] });
  } finally { restore(); }
});

test('a puzzle file that will not load says so plainly', async () => {
  const { root, restore } = browser({ daily: dailyDoc() });
  try {
    globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
    await mountDaily(root, { now: '2026-11-27' });
    assert.match(textOf(root), /The puzzle could not load/);
    assert.match(textOf(root), /http\.server 8000/);
  } finally { restore(); }
});
