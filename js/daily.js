// js/daily.js - the daily "Same bet?" puzzle, as a player plays it.
//
// PURE LOGIC. No DOM, no fetch, no storage: those are js/dailyView.js and
// js/storage.js. Everything here is a function of a puzzle document, a saved
// record and today's date, which is what lets the awkward cases - a reload
// halfway through, midnight passing mid-puzzle, a stored record written by an
// older version - be tested without a browser.
//
// IT READS ONE PUZZLE FILE AND NOTHING ELSE. data/daily.json carries today and
// the week ahead, sliced out of the ledger by scripts/build_puzzles.mjs. The
// ledger itself (data/puzzles.json) keeps every day ever played and grows
// without limit; the game must not download a year of past answers to play one
// morning. data/game.json is not read here either: a day's correlations were
// computed once, on the evening before, and are not recomputed in the browser.
//
// THE WORDS COME WITH THE FILE. An entry stores keys - "same", "A" - and the
// labels for them travel in daily.json's meta, copied from levels.json at build
// time. So the screen loads daily.json and tickers.json, and levels.json stays
// the one place an answer is named.
//
// Educational, not investment advice.

import { withSource } from './share.js';

/** Where a player's progress is kept. Versioned: an old shape is not a new one. */
export const STORAGE_KEY = 'oneTrade.daily.v1';

export const DISCLAIMER = 'Educational, not investment advice.';

/** Right, and not right. Two marks only: the grid must give nothing away. */
export const RIGHT = '🟩';
export const WRONG = '⬜';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** 2026-11-25 as "25 November 2026". */
export function longDate(date) {
  const [year, month, day] = String(date).split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/**
 * Today's date in New York, as YYYY-MM-DD.
 *
 * The puzzle turns over with the market, not with UTC, so a player in Chicago
 * at 9pm and one in London at 3am are on the same five pairs. This must agree
 * with dateIn() in scripts/build_puzzles.mjs, which decides which date the
 * evening build writes; tests/daily.test.js holds the two together.
 */
export function todayInNewYork(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);
}

/** The entry for a date, or null. */
export function entryFor(doc, date) {
  const entries = doc?.entries;
  if (!Array.isArray(entries)) return null;
  return entries.find((entry) => entry.date === date) ?? null;
}

/** The three answers, in the order the file lists them, for the buttons. */
export function answerLabels(meta) {
  const answers = meta?.answers;
  if (!Array.isArray(answers)) return [];
  return answers.map((answer) => ({ key: answer.key, label: answer.label }));
}

/** Ticker -> the group's readable name, from tickers.json. */
export function groupLabels(tickersDoc) {
  const out = {};
  for (const group of tickersDoc?.groups ?? []) out[group.key] = group.label;
  return out;
}

/**
 * One pair, as a sentence:
 *   "NVDA (AI stocks) and VOO (Core US funds): 0.68, partly the same bet"
 *
 * A group the ticker file does not name is left out rather than printed as a
 * key: "AAA (nope)" would be worse than "AAA".
 */
export function pairLine(pair, { groups = {}, answers = [] } = {}) {
  const named = (ticker, key) => {
    const label = groups[key];
    return label ? `${ticker} (${label})` : ticker;
  };
  const answer = answers.find((candidate) => candidate.key === pair.answer);
  return `${named(pair.a, pair.groups?.[0])} and ${named(pair.b, pair.groups?.[1])}: `
    + `${pair.correlation.toFixed(2)}, ${answer ? answer.label : pair.answer}`;
}

/**
 * The window the answer was measured over.
 *
 * Said on every reveal because the game measures the same pair over two
 * different windows: the puzzle uses a year, level 1 uses three. VTI and VXUS
 * correlate 0.7997 over 756 days and 0.8655 over 252, so the same two tickers
 * are a near miss on one screen and the same bet on the other. Unlabelled, that
 * reads as the game contradicting itself.
 */
export function windowLine(entry) {
  const window = entry?.window ?? {};
  return `Over the last year (${window.days} trading days), as of ${longDate(window.to)}.`;
}

/** The sentence for a surprise pair, or null when the pair is not one. */
export function surpriseLine(pair, meta) {
  if (!pair?.surprise) return null;
  const kind = (meta?.surpriseKinds ?? []).find((candidate) => candidate.key === pair.surprise);
  return kind ? kind.line : null;
}

/** How many answers matched. */
export function scoreOf(answers, entry) {
  return (answers ?? []).reduce(
    (total, answer, i) => total + (entry.pairs[i] && answer === entry.pairs[i].answer ? 1 : 0),
    0,
  );
}

/** The grid: one square per answer, right or wrong, and nothing else. */
export function gridOf(answers, entry) {
  return (answers ?? [])
    .map((answer, i) => (entry.pairs[i] && answer === entry.pairs[i].answer ? RIGHT : WRONG))
    .join('');
}

/**
 * Where the game lives, for a link in a share.
 *
 * It lives in js/share.js now, because the score card needs the same link, and
 * it is re-exported here so every caller of the puzzle's share keeps the one
 * import it has always had.
 */
export { shareUrl } from './share.js';

/**
 * What the player posts. SPOILER-FREE, and tests/daily.test.js goes looking:
 * no ticker, no answer, no correlation, and no mention of which pair was the
 * surprise. The squares say only how the sharer did, which tells a reader
 * nothing they could use to skip the puzzle.
 *
 * The link carries ?src=daily, the source code docs/PRD.md asks every shared
 * link to carry, so the count ping can tell which channel works without
 * tracking anybody.
 */
export function shareText(answers, entry, url) {
  const link = withSource(url, 'daily');
  const lines = [
    `One Trade: Same bet? ${entry.date}`,
    gridOf(answers, entry),
    `${scoreOf(answers, entry)}/${entry.pairs.length}`,
  ];
  if (link) lines.push(link);
  return lines.join('\n');
}

/**
 * Is a stored record one this code can trust?
 *
 * Anything else - another version's shape, a half-written value, a hand-edited
 * one - is ignored rather than obeyed, because a record that is partly
 * understood is the one that produces a screen nobody can explain.
 */
function usableRecord(saved, entry) {
  if (!saved || typeof saved !== 'object') return null;
  if (typeof saved.date !== 'string' || !Array.isArray(saved.answers)) return null;
  if (!entry) return null;
  if (saved.answers.length > entry.pairs.length) return null;
  const keys = new Set(entry.pairs.map((pair) => pair.answer));
  for (const pair of entry.pairs) keys.add(pair.answer);
  const known = new Set(['same', 'partly', 'different', ...keys]);
  if (!saved.answers.every((answer) => typeof answer === 'string' && known.has(answer))) return null;
  return saved;
}

function stateFor(doc, date, answers, { carriedOver = false, today = date } = {}) {
  const entry = entryFor(doc, date);
  // The document and the date travel WITH the state, so that locking an answer
  // can work out the next state without being handed them again. The first
  // version of lock() rebuilt the state from a one-entry document it made up,
  // which lost sight of whether today's puzzle existed: finishing a
  // carried-over day then reported that there was no new day waiting.
  const base = { doc, today, meta: doc?.meta ?? {} };
  if (!entry) {
    return {
      ...base,
      status: 'notReady', date, entry: null, answers: [], at: 0, score: 0, grid: '',
      carriedOver: false, newDayReady: false,
    };
  }
  const done = answers.length >= entry.pairs.length;
  return {
    ...base,
    status: done ? 'done' : 'playing',
    date,
    entry,
    answers,
    at: answers.length,
    score: scoreOf(answers, entry),
    grid: gridOf(answers, entry),
    carriedOver,
    // Only worth saying when there is in fact another day to go to.
    newDayReady: carriedOver && entryFor(doc, today) !== null,
  };
}

/**
 * The whole screen's state, from the file, what was stored, and the date.
 *
 * MIDNIGHT IS THE INTERESTING CASE. A player who starts at 23:55 and answers
 * their third pair at 00:02 has not finished yesterday's puzzle and has not
 * started today's. Taking the half-finished one away at midnight would throw
 * away work they are in the middle of, so an unfinished puzzle keeps the
 * screen until it is finished, and the new day is then offered rather than
 * forced (startToday). A FINISHED day does not hold the screen: coming back
 * the next morning starts the new one.
 */
export function puzzleState(doc, saved, today = todayInNewYork()) {
  const savedEntry = saved?.date ? entryFor(doc, saved.date) : null;
  const record = usableRecord(saved, savedEntry);
  const unfinished = record
    && record.answers.length < savedEntry.pairs.length
    && record.date !== today;

  if (unfinished) {
    return stateFor(doc, record.date, [...record.answers], { carriedOver: true, today });
  }
  const answers = record && record.date === today ? [...record.answers] : [];
  return stateFor(doc, today, answers, { today });
}

/** Today's puzzle, fresh, whatever was stored. The "play today" button. */
export function startToday(doc, today = todayInNewYork()) {
  return stateFor(doc, today, [], { today });
}

/**
 * Answer the pair in front of the player.
 *
 * Only that one: an index already answered, or further ahead than the next, is
 * ignored and the state comes back unchanged. That is what stops a reload, a
 * second tab or a double click from re-answering a pair whose answer is already
 * on the screen.
 */
export function lock(state, index, answer) {
  if (state.status !== 'playing') return state;
  if (index !== state.answers.length) return state;
  const answers = [...state.answers, answer];
  return stateFor(state.doc, state.date, answers, {
    carriedOver: state.carriedOver,
    today: state.today,
  });
}

/** What to put in storage after each answer. */
export function recordOf(state) {
  return { date: state.date, answers: state.answers };
}
