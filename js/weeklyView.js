// js/weeklyView.js - the weekly challenge screen.
//
// ONE PORTFOLIO A WEEK, THE SAME ONE FOR EVERYBODY, changing at midnight New
// York time on Monday. Which portfolio, and which days it is measured over, are
// js/weekly.js's business and are pure functions of the date; this file is the
// screen around them.
//
// IT IS A ROUND LIKE ANY OTHER. js/round.js builds it, js/why.js explains it
// and js/shareCard.js posts it, from levels.json's weekly block - which is
// level-shaped for exactly that reason. The only two things this mode does
// differently are the window, which ends on the Friday before rather than on
// the latest day, and the buttons at the end, because the next portfolio comes
// on Monday and there is no "play it again".
//
// NO BUILD STEP. The portfolio is dealt, so the screen is guess, then reveal.
//
// NOTHING LEAVES THE BROWSER. docs/PRD.md allows the Worker a count ping and a
// guess record, and a weekly guess is neither: the round is created with no
// emitter, and the only requests this file makes are for the four files below.
// tests/weeklyView.test.js watches fetch while a week is played.
//
// Educational, not investment advice.

import { h, button, errorView } from './build.js';
import { ABOUT } from './config.js';
import { read, write } from './storage.js';
import { DISCLAIMER, LEVELS_URL, validateLevels, formatGuess } from './levels.js';
import { GAME_URL, loadGameData } from './gameView.js';
import { createRound } from './round.js';
import { WHY_URL, groupIndex, validateWhy } from './why.js';
import { renderGuess, renderReveal } from './game.js';
import { cardFromResult } from './shareCard.js';
import { shareUrl } from './share.js';
import {
  WEEKLY_STORAGE_KEY, anchorFriday, anchorTradingDay, longDate, todayInNewYork, weeklyState, recordOf,
} from './weekly.js';

export const TICKERS_URL = 'tickers.json';

async function loadJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

/** The heading every state of this screen carries. */
function header(monday) {
  const head = h('header', 'round-head');
  head.append(h('p', 'round-step', monday ? `Weekly challenge · week of ${longDate(monday)}` : 'Weekly challenge'));
  head.append(h('h1', null, 'One portfolio a week'));
  return head;
}

/** Before the first Monday: no portfolio, and a date to come back on. */
function notStarted(root, state) {
  const view = h('div', 'view view-round');
  view.append(header(null));
  view.append(h('p', 'lede', `The weekly challenge starts on Monday ${longDate(state.firstMonday)}.`));
  view.append(h('p', 'small',
    'One mystery portfolio a week, the same one for every player, measured over the three years '
    + 'ending the Friday before. Guess how many separate bets it makes.'));
  view.append(h('p', 'disclaimer-inline', DISCLAIMER));
  root.replaceChildren(view);
}

/**
 * Draw the screen, and keep drawing it as the player answers.
 *
 * @param {HTMLElement} root
 * @param {string} [options.now] a fixed date, for looking at another week locally
 */
export async function mountWeekly(root, { now = null, storageKey = WEEKLY_STORAGE_KEY } = {}) {
  root.replaceChildren(h('p', 'loading', 'Loading this week’s portfolio…'));

  let levels;
  let game;
  let tickers;
  let why;
  try {
    [levels, game, tickers, why] = await Promise.all([
      loadJson(LEVELS_URL), loadGameData(GAME_URL), loadJson(TICKERS_URL), loadJson(WHY_URL),
    ]);
    validateLevels(levels);
    validateWhy(why);
  } catch (error) {
    root.replaceChildren(errorView('Weekly challenge',
      `The weekly challenge could not load: ${error.message}. Serve the page from the project root `
      + 'with "python3 -m http.server 8000".'));
    return null;
  }

  const weekly = levels.weekly;
  const today = now ?? todayInNewYork(new Date(), weekly.timeZone);
  const state = weeklyState(weekly, read(storageKey, null), today);
  if (state.status === 'notStarted') {
    notStarted(root, state);
    return { state: () => state };
  }

  // THE WINDOW ENDS ON THE FRIDAY BEFORE, so that a refresh landing on Wednesday
  // evening cannot change the answer under somebody who played on Monday. If
  // that Friday was a holiday, the last trading day the file carries before it.
  const dates = game.rows.map((row) => row[0]);
  const anchor = anchorTradingDay(dates, anchorFriday(state.monday));
  if (anchor === null) {
    const failed = h('div', 'view');
    failed.append(header(state.monday));
    failed.append(h('p', 'error',
      `The prices do not reach back to ${anchorFriday(state.monday)}, so this week cannot be measured yet.`));
    failed.append(h('p', 'disclaimer-inline', DISCLAIMER));
    root.replaceChildren(failed);
    return { state: () => ({ ...state, anchor: null }) };
  }

  const universe = tickers.groups.flatMap(
    (group) => group.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)),
  );
  // NO EMITTER, and since createRound() gained one this is a choice rather than
  // an impossibility. PREREG.md's Hypothesis 3 pairs a player's level-2 error
  // with their level-7 error; the weekly challenge is not a level, is not drawn
  // from the registered pool of 20, and deals everybody the same portfolio in a
  // given week, so a weekly guess is no part of that comparison and is not a
  // message docs/PRD.md allows. tests/guessRecords.test.js plays a week through
  // and fails if anything is emitted.
  const round = createRound({
    levels,
    level: weekly,
    levelId: weekly.id,
    game,
    universe,
    why,
    groups: groupIndex(tickers),
    endDate: anchor,
    dealt: { id: state.portfolio.id, pool: 'weekly', dollars: { ...state.portfolio.dollars } },
  });

  let guess = state.guess;
  const subtitle = `week of ${longDate(state.monday)}`;

  /** The card this week would post, built the way the reveal screen builds it. */
  const cardNow = () => cardFromResult(
    weekly, round.result, shareUrl(ABOUT, globalThis.location ?? null), { subtitle },
  );

  const context = {
    game,
    series: null,
    nextLevelId: () => null,
    startRound: () => {},
    toMenu: () => { globalThis.location.hash = '#learn'; },
    // The card says which week, never which portfolio: the portfolio's name is
    // a list of its holdings in words.
    cardSubtitle: subtitle,
    afterReveal: () => [
      h('p', 'note', 'A new portfolio every Monday. Come back next week.'),
      button('Play the levels', 'btn btn-quiet btn-wide', () => { globalThis.location.hash = '#learn'; }),
    ],
    redrawChart: null,
  };

  const drawReveal = () => {
    const view = renderReveal(context, round);
    view.append(h('p', 'note',
      `Measured over ${round.result.days} trading days to ${longDate(round.result.endDate)}, the Friday before `
      + 'this week started - so everybody playing this week gets the same answer.'));
    view.append(h('p', 'disclaimer-inline', DISCLAIMER));
    root.replaceChildren(view);
  };

  const drawGuess = () => {
    const view = renderGuess(context, round);
    view.append(h('p', 'note',
      `Measured over the three years ending ${anchor}. The same portfolio for every player this week.`));
    view.append(h('p', 'disclaimer-inline', DISCLAIMER));
    root.replaceChildren(view);
  };

  /** Lock a guess in: written down BEFORE the reveal is drawn, as the puzzle does. */
  // Level 2 and 7's rounds start in BUILD even though their portfolio is dealt;
  // the weekly has no build screen, so it goes straight to the question.
  round.toGuess();

  // THE ANSWER IS WRITTEN DOWN BEFORE THE REVEAL IS DRAWN, the rule the daily
  // puzzle follows: a reload at the wrong moment should land on the answer this
  // browser already gave, never on a second go at the week.
  context.finish = () => {
    write(storageKey, recordOf({ ...state, guess: round.guess }));
    guess = round.guess;
    drawReveal();
  };

  if (state.status === 'done') {
    // A reload inside the same week lands on the answer it already gave.
    round.setGuess(state.guess);
    round.reveal();
    drawReveal();
  } else {
    drawGuess();
  }

  return {
    state: () => ({ ...state, anchor, round, guess, status: round.state === 'reveal' ? 'done' : state.status }),
    /** Move the slider, for a test and for the console. */
    guess: (value) => { round.setGuess(value); },
    /** Lock it in, exactly as the Reveal button does. */
    reveal: () => { const result = round.reveal(); context.finish(); return result; },
    card: cardNow,
    formatGuess: (value) => formatGuess(weekly, value),
  };
}
