// js/dailyView.js - the daily "Same bet?" screen.
//
// WHAT IT LOADS, AND ONLY THIS: data/daily.json and tickers.json.
//
//   * NOT data/puzzles.json. That is the full ledger and it keeps every day
//     ever played; at about 1.5 KB an entry it passes 500 KB inside a year,
//     which is not a download to ask for in order to play one morning.
//   * NOT data/game.json. A day's correlations were computed once, on the
//     evening before, and written down. Recomputing them here would mean the
//     answer could change under a player who had already answered: Yahoo
//     re-adjusts closes between fetches, and the weekday rebuild slides the
//     252-day window every evening.
//   * NOT levels.json. The words for the keys an entry stores travel in
//     daily.json's meta, copied from levels.json by the builder.
//
// LOCK, THEN REVEAL, ONE PAIR AT A TIME. Three buttons; a click commits the
// answer, disables all three and shows what the prices actually did. The answer
// is written to storage before the reveal is drawn, so a reload lands on the
// next pair rather than offering a second go at one already seen.
//
// NOTHING LEAVES THE BROWSER. No ping, no guess record: docs/PRD.md allows the
// Worker two kinds of message and this is neither.
//
// Educational, not investment advice.

import { h, button } from './build.js';
import { ABOUT } from './config.js';
import { copyOut, shareOut } from './share.js';
import { read, write } from './storage.js';
import {
  DISCLAIMER,
  RIGHT,
  STORAGE_KEY,
  answerLabels,
  groupLabels,
  lock,
  longDate,
  pairLine,
  puzzleState,
  recordOf,
  shareText,
  shareUrl,
  startToday,
  surpriseLine,
  todayInNewYork,
  windowLine,
} from './daily.js';

export const DAILY_URL = 'data/daily.json';
export const TICKERS_URL = 'tickers.json';

/** What a square means, for anyone not reading the colour. */
const SQUARE_LABEL = { [RIGHT]: 'right', '⬜': 'wrong' };

async function loadJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

/** The heading every state of this screen carries. */
function header(date) {
  const head = h('div', 'daily-head');
  head.append(h('h1', null, 'Same bet?'));
  head.append(h('p', 'lede', date
    ? `Five pairs for ${longDate(date)}. For each, say whether the two moved together.`
    : 'Five ticker pairs a day, the same for every player.'));
  return head;
}

/** The three answer buttons for one pair. */
function answerButtons(answers, onPick) {
  const row = h('div', 'daily-answers');
  for (const answer of answers) {
    row.append(button(answer.label, 'daily-answer', () => onPick(answer.key)));
  }
  return row;
}

/** A pair after it has been answered: what it was, and what the player said. */
function revealed(pair, state, words, given) {
  const block = h('div', `daily-reveal ${given === pair.answer ? 'is-right' : 'is-wrong'}`);
  const verdict = h('p', 'daily-verdict');
  verdict.append(h('span', 'daily-mark', given === pair.answer ? RIGHT : '⬜'));
  verdict.append(h('span', null, given === pair.answer
    ? 'Right.'
    : `Not quite — you said ${words.answers.find((a) => a.key === given)?.label ?? given}.`));
  block.append(verdict);
  block.append(h('p', 'daily-pair-line', pairLine(pair, words)));
  block.append(h('p', 'daily-window', windowLine(state.entry)));

  const surprise = surpriseLine(pair, state.meta);
  if (surprise) block.append(h('p', 'daily-surprise', surprise));

  // Said once, where it matters: the same two tickers can read differently on
  // level 1, which measures three years rather than one.
  block.append(h('p', 'daily-elsewhere',
    'Level 1 measures three years, so the same two tickers can land in a different '
    + 'answer there. Neither is wrong; they are different questions about different stretches of time.'));
  return block;
}

/** One answered pair, small, in the list above the current one. */
function donePair(pair, given, index) {
  const row = h('li', `daily-done ${given === pair.answer ? 'is-right' : 'is-wrong'}`);
  row.append(h('span', 'daily-mark', given === pair.answer ? RIGHT : '⬜'));
  row.append(h('span', 'daily-done-pair', `${index + 1}. ${pair.a} and ${pair.b}`));
  row.append(h('span', 'daily-done-mark', given === pair.answer ? 'right' : 'wrong'));
  return row;
}

/** The grid, on screen, where colour alone is not enough. */
function gridRow(state) {
  const row = h('ol', 'daily-grid');
  row.setAttribute('aria-label', `Your five answers: ${state.score} right`);
  for (const [i, square] of [...state.grid].entries()) {
    const cell = h('li', `daily-square ${square === RIGHT ? 'is-right' : 'is-wrong'}`);
    cell.append(h('span', 'daily-square-mark', square));
    cell.append(h('span', 'daily-square-text', `${i + 1}: ${SQUARE_LABEL[square] ?? 'wrong'}`));
    row.append(cell);
  }
  return row;
}

/** The end of a day: the score, the grid, and the share. */
function summary(state, onPlayToday) {
  const view = h('div', 'daily-summary');
  view.append(h('h2', null, `${state.score} / ${state.entry.pairs.length}`));
  view.append(gridRow(state));

  const text = shareText(state.answers, state.entry, shareUrl(ABOUT, globalThis.location ?? null));
  const status = h('p', 'daily-share-status');
  const holder = h('div', 'daily-share-holder');

  view.append(button('Share', 'primary daily-share', async () => {
    // A phone gets the sheet it expects; everything else gets the clipboard.
    // Both come from js/share.js, which the score card uses too.
    if (await shareOut({ text }) !== 'unsupported') return;
    await copyOut(text, (said) => { status.textContent = said; }, holder);
  }));
  view.append(status);
  view.append(holder);
  view.append(h('p', 'daily-spoiler-note',
    'The squares say how you did, never which pairs you had or what the answers were.'));

  if (state.carriedOver) {
    view.append(h('p', 'daily-carried',
      `That was ${longDate(state.date)}'s puzzle, which you had already started.`));
    if (state.newDayReady) {
      view.append(button("Play today's puzzle", 'primary', onPlayToday));
    }
  } else {
    view.append(h('p', 'daily-again', 'A new puzzle each day. Come back tomorrow.'));
  }
  return view;
}

/**
 * Draw the whole screen for a state. Called again after every answer: the state
 * is the only thing that decides what is on screen, so there is no partial
 * redraw to get out of step with it.
 */
function render(root, state, words, { onPick, onPlayToday }) {
  const view = h('div', 'view daily');
  view.append(header(state.status === 'notReady' ? null : state.date));

  if (state.status === 'notReady') {
    const waiting = h('div', 'daily-waiting');
    waiting.append(h('p', 'lede', "Today's puzzle isn't ready yet. Come back tomorrow."));
    waiting.append(h('p', 'small',
      'A day\'s five pairs are worked out the evening before, so that everybody '
      + 'who plays on the same date gets the same puzzle.'));
    view.append(waiting);
    view.append(h('p', 'disclaimer-inline', DISCLAIMER));
    root.replaceChildren(view);
    return;
  }

  if (state.carriedOver && state.status === 'playing') {
    view.append(h('p', 'daily-carried',
      `You started ${longDate(state.date)}'s puzzle before midnight — finish it, `
      + "and today's will be waiting."));
  }

  // The pairs already answered, in short.
  if (state.answers.length > 0) {
    const list = h('ol', 'daily-done-list');
    for (const [i, given] of state.answers.entries()) {
      list.append(donePair(state.entry.pairs[i], given, i));
    }
    view.append(list);
  }

  if (state.status === 'playing') {
    const pair = state.entry.pairs[state.at];
    const card = h('div', 'daily-card');
    card.append(h('p', 'daily-count', `Pair ${state.at + 1} of ${state.entry.pairs.length}`));
    card.append(h('p', 'daily-tickers', `${pair.a} and ${pair.b}`));
    card.append(h('p', 'daily-ask', 'Did these two move together over the last year?'));
    card.append(answerButtons(words.answers, (key) => onPick(state.at, key)));
    view.append(card);
  } else {
    // The last pair's reveal stays on screen above the summary.
    const last = state.entry.pairs[state.answers.length - 1];
    view.append(revealed(last, state, words, state.answers[state.answers.length - 1]));
    view.append(summary(state, onPlayToday));
  }

  view.append(h('p', 'disclaimer-inline', DISCLAIMER));
  root.replaceChildren(view);
}

/**
 * Draw the screen, and keep drawing it as the player answers.
 *
 * @param {HTMLElement} root
 * @param {object} options.now a fixed date, for previewing another day locally
 */
export async function mountDaily(root, { now = null, storageKey = STORAGE_KEY } = {}) {
  root.replaceChildren(h('p', 'loading', "Loading today's puzzle…"));

  let doc;
  let tickers;
  try {
    [doc, tickers] = await Promise.all([loadJson(DAILY_URL), loadJson(TICKERS_URL)]);
  } catch (error) {
    const failed = h('div', 'view');
    failed.append(h('h1', null, 'Same bet?'));
    failed.append(h('p', 'error',
      `The puzzle could not load: ${error.message}. Serve the page from the project root `
      + 'with "python3 -m http.server 8000".'));
    failed.append(h('p', 'disclaimer-inline', DISCLAIMER));
    root.replaceChildren(failed);
    return null;
  }

  const words = { groups: groupLabels(tickers), answers: answerLabels(doc.meta) };
  const today = now ?? todayInNewYork();
  let state = puzzleState(doc, read(storageKey, null), today);

  const draw = () => render(root, state, words, {
    onPick(index, answer) {
      const next = lock(state, index, answer);
      if (next === state) return;          // already answered, or not this pair
      state = next;
      // Saved BEFORE the reveal is drawn: a reload at the wrong moment should
      // land on the next pair, never offer this one again.
      write(storageKey, recordOf(state));
      draw();
      // The reveal for the pair just answered, below the list.
      const view = root.querySelector('.daily');
      if (view && state.status === 'playing') {
        const pair = state.entry.pairs[index];
        view.insertBefore(
          revealed(pair, state, words, answer),
          view.querySelector('.daily-card'),
        );
      }
    },
    onPlayToday() {
      state = startToday(doc, today);
      write(storageKey, recordOf(state));
      draw();
    },
  });

  draw();
  return { state: () => state };
}
