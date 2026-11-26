// tests/daily.test.js - the daily "Same bet?" puzzle as the player meets it.
//
// This is the PLAYER's half. The builder and its ledger are tested in
// tests/puzzles.test.js; nothing here builds a puzzle or reads a price. What is
// tested here is what happens to five pairs and an answer each:
//
//   * the score, the grid and the share text, which is the one thing a player
//     sends to people who have not played yet - so it carries no ticker, no
//     answer and no correlation, and a test goes looking for all three;
//   * resuming after a reload, which is the whole reason anything is stored;
//   * midnight in New York passing mid-puzzle, which must not delete the
//     puzzle somebody is halfway through;
//   * a date with no entry, which is today as this is written and so is the
//     first state anyone will see.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  STORAGE_KEY,
  answerLabels,
  entryFor,
  gridOf,
  groupLabels,
  lock,
  pairLine,
  puzzleState,
  scoreOf,
  shareText,
  shareUrl,
  startToday,
  surpriseLine,
  todayInNewYork,
  windowLine,
} from '../js/daily.js';
import { ABOUT } from '../js/config.js';

const path = (name) => fileURLToPath(new URL(`../${name}`, import.meta.url));
const read = (name) => JSON.parse(readFileSync(path(name), 'utf8'));

const COMMITTED = read('data/daily.json');
const TICKERS = read('tickers.json');

const ANSWERS = [
  { key: 'same', label: 'the same bet' },
  { key: 'partly', label: 'partly the same bet' },
  { key: 'different', label: 'different bets' },
];
const KINDS = [
  { key: 'A', line: 'Different groups, same bet: these two moved together over the last year.' },
  { key: 'B', line: 'Same group, different bets: these two moved mostly independently over the last year.' },
];

/** A puzzle document in data/daily.json's shape, with answers we choose. */
function docOf(dates, answers = ['same', 'partly', 'different', 'partly', 'different']) {
  return {
    meta: {
      from: dates[0],
      to: dates[dates.length - 1],
      timeZone: 'America/New_York',
      windowDays: 252,
      answers: ANSWERS,
      surpriseKinds: KINDS,
      disclaimer: 'Educational, not investment advice.',
    },
    entries: dates.map((date) => ({
      date,
      window: { days: 252, from: '2025-11-25', to: '2026-11-25' },
      surpriseKind: 'B',
      pairs: answers.map((answer, i) => ({
        a: `AA${i}`,
        b: `BB${i}`,
        correlation: answer === 'same' ? 0.82 : answer === 'partly' ? 0.47 : 0.09,
        answer,
        groups: ['ai_stocks', 'core_us_funds'],
        surprise: i === answers.length - 1 ? 'B' : null,
      })),
    })),
  };
}

const DOC = docOf(['2026-12-01', '2026-12-02']);
const ENTRY = DOC.entries[0];
const saved = (date, answers) => ({ date, answers });

// ------------------------------------------------------------------ scoring

test('scoring counts the answers that matched', () => {
  assert.equal(scoreOf(['same', 'partly', 'different', 'partly', 'different'], ENTRY), 5);
  assert.equal(scoreOf(['different', 'different', 'different', 'different', 'different'], ENTRY), 2);
  assert.equal(scoreOf(['partly', 'same', 'same', 'same', 'same'], ENTRY), 0);
});

test('scoring an unfinished puzzle counts what has been answered', () => {
  assert.equal(scoreOf(['same', 'partly'], ENTRY), 2);
  assert.equal(scoreOf([], ENTRY), 0);
});

// --------------------------------------------------------------------- grid

test('the grid marks each answer right or wrong, in order', () => {
  assert.equal(gridOf(['same', 'partly', 'different', 'partly', 'different'], ENTRY), '🟩🟩🟩🟩🟩');
  assert.equal(gridOf(['partly', 'partly', 'same', 'partly', 'different'], ENTRY), '⬜🟩⬜🟩🟩');
  assert.equal([...gridOf(['same', 'partly', 'different', 'partly', 'different'], ENTRY)].length, 5);
});

test('the grid says nothing about what the answers were', () => {
  // Two different days, the same pattern of right and wrong: the same grid.
  const other = docOf(['2026-12-01'], ['different', 'same', 'same', 'different', 'partly']);
  const mine = gridOf(['same', 'partly', 'different', 'partly', 'different'], ENTRY);
  const theirs = gridOf(['different', 'same', 'same', 'different', 'partly'], other.entries[0]);
  assert.equal(mine, theirs, 'the grid leaks which answers the day held');
});

// --------------------------------------------------------------- share text

test('the share text carries the date, the grid, the score and the link', () => {
  const text = shareText(['same', 'partly', 'same', 'partly', 'different'], ENTRY, 'https://example.org/one-trade/');
  assert.match(text, /^One Trade: Same bet\? 2026-12-01$/m);
  assert.match(text, /^🟩🟩⬜🟩🟩$/m);
  assert.match(text, /^4\/5$/m);
  assert.match(text, /https:\/\/example\.org\/one-trade\/\?src=daily/);
});

test('the share text gives nothing away: no ticker, no answer, no correlation', () => {
  const text = shareText(['same', 'partly', 'same', 'partly', 'different'], ENTRY, 'https://example.org/');

  for (const pair of ENTRY.pairs) {
    assert.ok(!text.includes(pair.a), `the share text names ${pair.a}`);
    assert.ok(!text.includes(pair.b), `the share text names ${pair.b}`);
    assert.ok(!text.includes(String(pair.correlation)), 'the share text carries a correlation');
    assert.ok(
      !text.includes(pair.correlation.toFixed(2)),
      'the share text carries a rounded correlation',
    );
  }
  for (const answer of ANSWERS) {
    assert.ok(!text.toLowerCase().includes(answer.label), `the share text says "${answer.label}"`);
    assert.ok(!new RegExp(`\\b${answer.key}\\b`).test(text), `the share text says "${answer.key}"`);
  }
  // Nor which pair was the surprise, which would narrow the answers down.
  assert.ok(!text.toLowerCase().includes('surprise'));
});

test('the share link carries the source code the PRD asks every shared link to carry', () => {
  const text = shareText(['same'], ENTRY, 'https://example.org/');
  assert.match(text, /\?src=daily/);
});

test('shareUrl prefers ABOUT.url and falls back to the page it is served from', () => {
  assert.equal(shareUrl({ url: 'https://example.org/one-trade/' }, null), 'https://example.org/one-trade/');
  // Not set yet: docs/PRD.md milestone 3 sets it at deploy.
  assert.equal(
    shareUrl({ url: null }, { origin: 'http://localhost:8000', pathname: '/index.html' }),
    'http://localhost:8000/index.html',
  );
  assert.equal(shareUrl({ url: '' }, { origin: 'http://localhost:8000', pathname: '/' }), 'http://localhost:8000/');
  // Neither: a share without a link beats throwing on the share button.
  assert.equal(shareUrl({ url: null }, null), '');
});

test('the real share link points at the deployed site, not at a laptop', () => {
  // The case ABOUT.url exists for: a share made while testing locally would
  // otherwise carry http://localhost:8000, which nobody else can open.
  assert.equal(ABOUT.url, 'https://mayaagge.github.io/one-trade/');
  assert.equal(
    shareUrl(ABOUT, { origin: 'http://localhost:8000', pathname: '/' }),
    'https://mayaagge.github.io/one-trade/',
  );
  assert.match(
    shareText(['same'], ENTRY, shareUrl(ABOUT, { origin: 'http://localhost:8000', pathname: '/' })),
    /^https:\/\/mayaagge\.github\.io\/one-trade\/\?src=daily#daily$/m,
  );
});

// ------------------------------------------------------------------- state

test('a fresh visit starts at the first pair', () => {
  const state = puzzleState(DOC, null, '2026-12-01');
  assert.equal(state.status, 'playing');
  assert.equal(state.date, '2026-12-01');
  assert.equal(state.at, 0);
  assert.deepEqual(state.answers, []);
  assert.equal(state.carriedOver, false);
});

test('a reload comes back to the pair the player had reached', () => {
  const state = puzzleState(DOC, saved('2026-12-01', ['same', 'partly']), '2026-12-01');
  assert.equal(state.status, 'playing');
  assert.equal(state.at, 2, 'the third pair is the one to answer');
  assert.deepEqual(state.answers, ['same', 'partly']);
});

test('a pair that has been answered cannot be answered again', () => {
  let state = puzzleState(DOC, null, '2026-12-01');
  state = lock(state, 0, 'same');
  assert.deepEqual(state.answers, ['same']);
  // The same index again, with a different answer: nothing moves.
  const again = lock(state, 0, 'different');
  assert.deepEqual(again.answers, ['same']);
  assert.equal(again.at, 1);
  // And neither does a pair further ahead than the one in front of them.
  assert.deepEqual(lock(state, 3, 'same').answers, ['same']);
});

test('answering the last pair finishes the puzzle', () => {
  let state = puzzleState(DOC, null, '2026-12-01');
  for (const answer of ['same', 'partly', 'different', 'partly', 'same']) {
    state = lock(state, state.at, answer);
  }
  assert.equal(state.status, 'done');
  assert.equal(state.score, 4);
  assert.equal(state.grid, '🟩🟩🟩🟩⬜');
});

test('a finished day stays finished when the player comes back to it', () => {
  const done = saved('2026-12-01', ['same', 'partly', 'different', 'partly', 'different']);
  const state = puzzleState(DOC, done, '2026-12-01');
  assert.equal(state.status, 'done');
  assert.equal(state.score, 5);
});

test('a saved record from a day that has finished and gone is not replayed', () => {
  const old = saved('2026-11-30', ['same', 'partly', 'different', 'partly', 'different']);
  const state = puzzleState(DOC, old, '2026-12-01');
  assert.equal(state.status, 'playing');
  assert.equal(state.date, '2026-12-01');
  assert.deepEqual(state.answers, [], "yesterday's answers must not count towards today");
});

// ------------------------------------------------- midnight, mid-puzzle

test('midnight passing mid-puzzle lets the player finish the day they started', () => {
  // Two pairs answered on the 1st; it is now the 2nd.
  const state = puzzleState(DOC, saved('2026-12-01', ['same', 'partly']), '2026-12-02');
  assert.equal(state.status, 'playing');
  assert.equal(state.date, '2026-12-01', 'the half-finished puzzle was taken away at midnight');
  assert.equal(state.at, 2);
  assert.equal(state.carriedOver, true, 'the screen needs to know it is not today');
  assert.equal(state.newDayReady, true, 'and that there is a new one waiting');
});

test('and then the new day is offered, not forced', () => {
  let state = puzzleState(DOC, saved('2026-12-01', ['same', 'partly']), '2026-12-02');
  for (const answer of ['different', 'partly', 'different']) state = lock(state, state.at, answer);
  assert.equal(state.status, 'done');
  assert.equal(state.date, '2026-12-01');
  assert.equal(state.newDayReady, true);

  // Starting the new day is a deliberate act, and it does not touch the record
  // of the day just finished until it writes its own.
  const fresh = startToday(DOC, '2026-12-02');
  assert.equal(fresh.status, 'playing');
  assert.equal(fresh.date, '2026-12-02');
  assert.deepEqual(fresh.answers, []);
  assert.equal(fresh.carriedOver, false);
});

test('a half-finished day that has aged out of the file is not resumable', () => {
  // daily.json carries 8 days; a puzzle older than that is simply gone.
  const state = puzzleState(DOC, saved('2026-10-01', ['same']), '2026-12-01');
  assert.equal(state.date, '2026-12-01');
  assert.deepEqual(state.answers, []);
});

test('a stored record that is nonsense is ignored rather than obeyed', () => {
  for (const bad of [{}, { date: '2026-12-01' }, { date: 5, answers: ['same'] },
    { date: '2026-12-01', answers: 'same' }, { date: '2026-12-01', answers: [1, 2] },
    { date: '2026-12-01', answers: ['same', 'nonsense'] }]) {
    const state = puzzleState(DOC, bad, '2026-12-01');
    assert.equal(state.status, 'playing', `${JSON.stringify(bad)} was trusted`);
    assert.deepEqual(state.answers, [], `${JSON.stringify(bad)} was trusted`);
  }
});

test('more answers than there are pairs is ignored, not scored', () => {
  const state = puzzleState(DOC, saved('2026-12-01', ['same', 'same', 'same', 'same', 'same', 'same']), '2026-12-01');
  assert.deepEqual(state.answers, []);
});

// --------------------------------------------------------- nothing for today

test("a date with no entry says so, and does not read as an error", () => {
  const state = puzzleState(DOC, null, '2026-12-09');
  assert.equal(state.status, 'notReady');
  assert.equal(state.entry, null);
});

test('the committed file today is exactly that case', () => {
  // Written 26 November 2026, when the ledger starts on the 27th: the first
  // state anyone will see is the one that says come back tomorrow.
  const state = puzzleState(COMMITTED, null, '2026-11-26');
  assert.equal(state.status, 'notReady');
  // And tomorrow it plays.
  const tomorrow = puzzleState(COMMITTED, null, '2026-11-27');
  assert.equal(tomorrow.status, 'playing');
  assert.equal(tomorrow.entry.pairs.length, 5);
});

test('entryFor finds a date, or nothing', () => {
  assert.equal(entryFor(DOC, '2026-12-01').date, '2026-12-01');
  assert.equal(entryFor(DOC, '2026-12-30'), null);
  assert.equal(entryFor({ entries: [] }, '2026-12-01'), null);
  assert.equal(entryFor(null, '2026-12-01'), null);
});

// ------------------------------------------------------------------- words

test('a pair reads as a sentence, with both groups named', () => {
  const groups = groupLabels(TICKERS);
  const line = pairLine(
    { a: 'NVDA', b: 'VOO', correlation: 0.6817, answer: 'partly', groups: ['ai_stocks', 'core_us_funds'] },
    { groups, answers: answerLabels(DOC.meta) },
  );
  assert.equal(line, 'NVDA (AI stocks) and VOO (Core US funds): 0.68, partly the same bet');
});

test('a group the ticker file does not name still reads', () => {
  const line = pairLine(
    { a: 'AAA', b: 'BBB', correlation: 0.1, answer: 'different', groups: ['nope', 'core_us_funds'] },
    { groups: groupLabels(TICKERS), answers: answerLabels(DOC.meta) },
  );
  assert.match(line, /^AAA and BBB \(Core US funds\): 0\.10, different bets$/);
});

test('the window is named, and so is the fact that level 1 uses another one', () => {
  const line = windowLine(ENTRY);
  assert.match(line, /252 trading days/);
  assert.match(line, /25 November 2026/);
  assert.match(line, /last year/i);
});

test('a surprise says which kind it is, over the window it was measured on', () => {
  assert.equal(surpriseLine({ surprise: 'B' }, DOC.meta), KINDS[1].line);
  assert.equal(surpriseLine({ surprise: 'A' }, DOC.meta), KINDS[0].line);
  assert.equal(surpriseLine({ surprise: null }, DOC.meta), null);
  // Every line ties itself to the year measured, not to how markets always are.
  for (const kind of DOC.meta.surpriseKinds) assert.match(kind.line, /over the last year/);
});

test('the answer buttons come from the file, in the file\'s order', () => {
  assert.deepEqual(answerLabels(DOC.meta), ANSWERS);
  assert.deepEqual(answerLabels(COMMITTED.meta).map((a) => a.key), ['same', 'partly', 'different']);
  for (const answer of answerLabels(COMMITTED.meta)) {
    assert.ok(answer.label.length > 0, `${answer.key} has no label to put on a button`);
  }
});

// -------------------------------------------------------------------- dates

test('the day turns over in New York', () => {
  assert.equal(todayInNewYork(new Date('2026-11-27T03:00:00Z')), '2026-11-26');
  assert.equal(todayInNewYork(new Date('2026-11-27T05:00:00Z')), '2026-11-27');
});

test('the screen and the builder agree on what day it is', async () => {
  const { dateIn } = await import('../scripts/build_puzzles.mjs');
  for (const at of ['2026-11-27T03:00:00Z', '2026-11-27T05:00:00Z', '2026-07-04T23:30:00Z']) {
    assert.equal(
      todayInNewYork(new Date(at)),
      dateIn(COMMITTED.meta.timeZone, new Date(at)),
      `${at}: the screen and the builder would show different puzzles`,
    );
  }
});

test('the storage key is versioned, so an old shape cannot be read as a new one', () => {
  assert.match(STORAGE_KEY, /\.v\d+$/);
});
