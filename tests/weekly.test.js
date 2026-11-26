// tests/weekly.test.js - the weekly challenge: the ten, the week, the window.
//
// WHAT THIS FILE IS REALLY GUARDING. One mystery portfolio a week, the same one
// for everybody, changing at midnight New York time on Monday. Three things can
// go wrong and none of them is visible by reading the code:
//
//   * THE TEN COULD BE GUESSABLE. If four of the ten answers sit within a bet of
//     each other, one number typed every week earns 3 stars most weeks and the
//     challenge teaches nothing. The rule is at most 3 of the 10, and it is
//     checked against the live data rather than against numbers written here.
//   * THE WEEK COULD DRIFT. Every player in a week has to get the same answer,
//     so the window ends on the Friday before the Monday - not on the latest
//     day - and the answer must not move as the week's refreshes land.
//   * A WEEKLY PORTFOLIO COULD BE A POOL PORTFOLIO. The pools belong to
//     Hypothesis 3; a portfolio a player met on level 2 is not a mystery.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  WEEKLY_STORAGE_KEY,
  anchorFriday,
  anchorTradingDay,
  mondayOf,
  portfolioFor,
  recordOf,
  weekIndex,
  weeklyState,
} from '../js/weekly.js';
import { validateLevels, weightsFromDollars, starsFor, STARTING_DOLLARS } from '../js/levels.js';
import { gameWindow, windowEndingOn, windowMatrix } from '../js/gameView.js';
import { covariance, effectiveBets } from '../js/math.js';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));
const LEVELS = validateLevels(readJson('levels.json'));
const GAME = readJson('data/game.json');
const WEEKLY = LEVELS.weekly;

const copy = () => JSON.parse(JSON.stringify(LEVELS));

/** This portfolio's effective bets over a window ending on `endDate`. */
function betsOn(dollars, endDate = null, days = WEEKLY.window.days) {
  const { tickers, weights } = weightsFromDollars(dollars);
  const window = endDate === null
    ? gameWindow(GAME, tickers, days)
    : windowEndingOn(GAME, tickers, days, endDate);
  return { bets: effectiveBets(weights, covariance(windowMatrix(window, tickers))), days: window.days };
}

// ----------------------------------------------------------------- the ten

test('the weekly block holds ten portfolios, each allocating the pretend money', () => {
  assert.equal(WEEKLY.portfolios.length, 10);
  const ids = new Set();
  for (const portfolio of WEEKLY.portfolios) {
    assert.match(portfolio.id, /^w\d\d$/);
    assert.ok(!ids.has(portfolio.id), `duplicate id ${portfolio.id}`);
    ids.add(portfolio.id);
    assert.ok(portfolio.name.length > 0, `${portfolio.id} has no name`);
    const total = Object.values(portfolio.dollars).reduce((sum, d) => sum + d, 0);
    assert.equal(total, STARTING_DOLLARS, `${portfolio.id} allocates ${total}`);
    assert.ok(Object.keys(portfolio.dollars).length >= 2, `${portfolio.id} holds one thing`);
  }
});

test('no weekly portfolio is one of the Hypothesis 3 pool portfolios', () => {
  // By HOLDINGS, not by dollars: the same holdings with the money moved around
  // is the same puzzle, and a player who met it on level 2 is not guessing.
  const pool = [...LEVELS.guessPool.portfolios, ...LEVELS.finalPool.portfolios];
  const sameHoldings = (a, b) => a.size === b.size && [...a].every((t) => b.has(t));
  for (const weekly of WEEKLY.portfolios) {
    const mine = new Set(Object.keys(weekly.dollars));
    for (const p of pool) {
      assert.ok(
        !sameHoldings(mine, new Set(Object.keys(p.dollars))),
        `weekly ${weekly.id} holds the same things as pool portfolio ${p.id}`,
      );
    }
  }
  // And no two weeks are the same portfolio either.
  for (let i = 0; i < WEEKLY.portfolios.length; i += 1) {
    for (let j = i + 1; j < WEEKLY.portfolios.length; j += 1) {
      assert.ok(
        !sameHoldings(
          new Set(Object.keys(WEEKLY.portfolios[i].dollars)),
          new Set(Object.keys(WEEKLY.portfolios[j].dollars)),
        ),
        `${WEEKLY.portfolios[i].id} and ${WEEKLY.portfolios[j].id} are the same portfolio`,
      );
    }
  }
});

test('one number typed every week earns 3 stars on at most 3 of the 10', () => {
  // THE POINT OF THE SET. Computed from the live data, not from numbers written
  // down here: if a refresh moves the answers together, this goes red and the
  // ten need re-spacing, which is exactly when somebody should be told.
  const level = WEEKLY;
  const answers = WEEKLY.portfolios.map((p) => betsOn(p.dollars).bets);

  let worst = { guess: null, stars: 0 };
  for (let guess = level.guess.min; guess <= level.guess.max + 1e-9; guess += 0.01) {
    const three = answers.filter(
      (actual) => starsFor(level, { guess, actual, passed: true }) === 3,
    ).length;
    if (three > worst.stars) worst = { guess: Number(guess.toFixed(2)), stars: three };
  }
  assert.ok(
    worst.stars <= 3,
    `a constant guess of ${worst.guess} earns 3 stars on ${worst.stars} of 10: ${answers.map((a) => a.toFixed(2)).join(', ')}`,
  );
});

test('the ten are spread, and no four of them sit within a bet of each other', () => {
  const answers = WEEKLY.portfolios.map((p) => betsOn(p.dollars).bets).sort((a, b) => a - b);
  // The same rule as above, stated as a distance, which is what a reviewer can
  // check by eye against the file.
  for (let i = 0; i + 3 < answers.length; i += 1) {
    assert.ok(
      answers[i + 3] - answers[i] > 1,
      `${answers.slice(i, i + 4).map((a) => a.toFixed(2)).join(', ')} all fit inside one bet`,
    );
  }
  const low = answers.filter((a) => a < 1.5).length;
  const mid = answers.filter((a) => a >= 1.5 && a <= 2.5).length;
  const high = answers.filter((a) => a > 2.5).length;
  assert.ok(low >= 2, `only ${low} answers below 1.5`);
  assert.ok(mid >= 2, `only ${mid} answers between 1.5 and 2.5`);
  assert.ok(high >= 3, `only ${high} answers above 2.5`);
  assert.ok(answers[answers.length - 1] <= WEEKLY.guess.max,
    'an answer sits above the top of the slider, so no guess can reach it');
});

test('no two weeks in a row answer within a bet of each other', () => {
  // SORTED BY ANSWER THE TEN RISE from 1.11 to 4.40, and a player who came back
  // every week could guess "a bit more than last week" without reading the
  // portfolio. The order in the file is a fixed mixed one, and this is the rule
  // it exists to satisfy.
  //
  // THE WRAP COUNTS. The list cycles, so week 10 is followed by week 1 again,
  // and a returning player meets that step like any other.
  const answers = WEEKLY.portfolios.map((p) => betsOn(p.dollars).bets);
  for (let i = 0; i < answers.length; i += 1) {
    const next = (i + 1) % answers.length;
    const step = Math.abs(answers[next] - answers[i]);
    assert.ok(
      step > 1,
      `weeks ${i + 1} and ${next + 1} answer ${answers[i].toFixed(2)} and ${answers[next].toFixed(2)}, `
      + `${step.toFixed(2)} apart - a returning player can guess the second from the first`,
    );
  }
});

test('the order alternates rather than climbing, and week 1 opens on the lesson', () => {
  const answers = WEEKLY.portfolios.map((p) => betsOn(p.dollars).bets);
  // Not sorted, in either direction: a sorted list is the thing the rule above
  // forbids, and it would pass that rule by accident if the ten were far apart.
  const rising = answers.every((value, i) => i === 0 || value > answers[i - 1]);
  const falling = answers.every((value, i) => i === 0 || value < answers[i - 1]);
  assert.ok(!rising && !falling, 'the weeks run in order of their answers');
  // Each step changes direction, which is what "mixed" means here.
  for (let i = 1; i + 1 < answers.length; i += 1) {
    const up = answers[i] > answers[i - 1];
    const thenUp = answers[i + 1] > answers[i];
    assert.notEqual(up, thenUp, `weeks ${i} to ${i + 2} move the same way twice`);
  }
  // The first week is five famous companies that turn out to be one trade,
  // which is the lesson the game is named for.
  assert.equal(WEEKLY.portfolios[0].id, 'w01');
  assert.equal(WEEKLY.portfolios[0].name, 'Five big names');
  assert.ok(answers[0] < 1.5, `week 1 answers ${answers[0].toFixed(2)}, which is not "these are one bet"`);
});

test('the ids run in play order, so the file reads in the order it is played', () => {
  assert.deepEqual(
    WEEKLY.portfolios.map((p) => p.id),
    Array.from({ length: 10 }, (_, i) => `w${String(i + 1).padStart(2, '0')}`),
  );
});

// ---------------------------------------------------------------- the week

test('the week turns over at midnight on Monday, New York time', () => {
  assert.equal(mondayOf('2026-11-30'), '2026-11-30');      // a Monday is its own week
  assert.equal(mondayOf('2026-12-06'), '2026-11-30');      // the Sunday after
  assert.equal(mondayOf('2026-12-07'), '2026-12-07');      // the next Monday
  // Across a year end, and across the spring clock change, on calendar dates
  // rather than on an offset from a timestamp.
  assert.equal(mondayOf('2027-01-01'), '2026-12-28');
  assert.equal(mondayOf('2027-03-15'), '2027-03-15');
  assert.equal(mondayOf('2027-03-14'), '2027-03-08');
});

test('the window ends on the Friday before the Monday, never on the latest day', () => {
  assert.equal(anchorFriday('2026-11-30'), '2026-11-27');
  assert.equal(anchorFriday('2026-12-07'), '2026-12-04');
  // A holiday Friday has no prices, so the anchor walks back to the last day
  // the file actually carries. No holiday calendar is needed for that.
  const dates = ['2026-11-24', '2026-11-25', '2026-11-27'];
  assert.equal(anchorTradingDay(dates, '2026-11-27'), '2026-11-27');
  assert.equal(anchorTradingDay(dates, '2026-11-26'), '2026-11-25');
  assert.equal(anchorTradingDay(dates, '2020-01-01'), null);
});

test('which portfolio a week gets is a pure function of the date, and it cycles', () => {
  const first = WEEKLY.firstMonday;
  assert.equal(weekIndex(first, first, 10), 0);
  assert.equal(weekIndex(first, '2026-12-07', 10), 1);
  // Ten weeks on, the list starts again rather than running out.
  const tenWeeksOn = '2027-02-08';
  assert.equal(mondayOf(tenWeeksOn), tenWeeksOn);
  assert.equal(weekIndex(first, tenWeeksOn, 10), 0);
  assert.equal(weekIndex(first, '2027-02-15', 10), 1);
  // Before the first Monday there is no weekly challenge yet.
  assert.equal(weekIndex(first, '2026-11-23', 10), null);

  // Two browsers on the same date get the same portfolio, with nothing stored.
  assert.equal(portfolioFor(WEEKLY, '2026-12-07').id, portfolioFor(WEEKLY, '2026-12-07').id);
  assert.equal(portfolioFor(WEEKLY, '2026-11-23'), null);
});

// -------------------------------------------------- the same answer all week

test('every player in a week gets the same answer, whichever day they play', () => {
  // A week of refreshes, simulated by truncating the committed file: on the nth
  // weekday after the anchor the file ends on a later day, so the anchored
  // window starts later too. The ANSWER must not move enough to change a star,
  // and should not move the two decimals the screen prints.
  const dates = GAME.rows.map((row) => row[0]);
  const anchorAt = dates.length - 6;                    // a Friday's worth back
  const anchor = dates[anchorAt];

  let worst = 0;
  for (const portfolio of WEEKLY.portfolios) {
    const seen = [];
    for (let day = 1; day <= 5; day += 1) {
      const upTo = anchorAt + day;
      if (upTo >= dates.length) break;
      // The file as it would stand that evening: the most recent `days` rows.
      const file = { ...GAME, rows: GAME.rows.slice(0, upTo + 1) };
      const { tickers, weights } = weightsFromDollars(portfolio.dollars);
      const window = windowEndingOn(file, tickers, WEEKLY.window.days, anchor);
      seen.push(effectiveBets(weights, covariance(windowMatrix(window, tickers))));
    }
    const spread = Math.max(...seen) - Math.min(...seen);
    worst = Math.max(worst, spread);
    // No star can change, which is the promise that matters.
    for (const actual of seen) {
      assert.equal(
        starsFor(WEEKLY, { guess: seen[0], actual, passed: true }), 3,
        `${portfolio.id} moved enough during the week to change a star`,
      );
    }
  }
  // And the measured size of it, so a change that makes this worse is visible.
  assert.ok(worst < 0.05, `the answer moved by ${worst.toFixed(4)} bets during one week`);
});

test('an anchored window is an ordinary window when the anchor is the last day', () => {
  const tickers = ['VOO', 'BND', 'GLD'];
  const last = GAME.rows[GAME.rows.length - 1][0];
  const plain = gameWindow(GAME, tickers, 300);
  const anchored = windowEndingOn(GAME, tickers, 300, last);
  assert.deepEqual(anchored, plain);
});

test('an anchored window never reaches past its anchor', () => {
  const tickers = ['VOO', 'BND'];
  const dates = GAME.rows.map((row) => row[0]);
  const anchor = dates[dates.length - 4];
  const window = windowEndingOn(GAME, tickers, 100, anchor);
  assert.equal(window.endDate, anchor);
  assert.equal(window.dates[window.dates.length - 1], anchor);
  assert.ok(window.dates.every((date) => date <= anchor));
  assert.equal(window.days, 100);
});

test('a window that cannot reach back far enough says so rather than guessing', () => {
  const dates = GAME.rows.map((row) => row[0]);
  assert.throws(
    () => windowEndingOn(GAME, ['VOO'], 100, '2019-01-02'),
    /2019-01-02/,
    'a date the file does not carry should be refused',
  );
  // A short window is shorter, not wrong: the caller checks it against minDays.
  const early = windowEndingOn(GAME, ['VOO'], 756, dates[100]);
  assert.equal(early.days, 101);
  assert.equal(early.endDate, dates[100]);
});

// --------------------------------------------------------------- the state

test('a week is played once: the state carries the guess, and a reload shows the reveal', () => {
  const today = '2026-12-02';
  const monday = mondayOf(today);

  const fresh = weeklyState(WEEKLY, null, today);
  assert.equal(fresh.status, 'playing');
  assert.equal(fresh.monday, monday);
  assert.equal(fresh.guess, null);
  assert.equal(fresh.portfolio.id, portfolioFor(WEEKLY, monday).id);

  const answered = weeklyState(WEEKLY, { week: monday, guess: 2.4 }, today);
  assert.equal(answered.status, 'done');
  assert.equal(answered.guess, 2.4);

  // Last week's record does not answer this week.
  const stale = weeklyState(WEEKLY, { week: '2026-11-30', guess: 2.4 }, '2026-12-08');
  assert.equal(stale.status, 'playing');
  assert.equal(stale.guess, null);

  // A record this code cannot trust is ignored rather than obeyed.
  for (const bad of [{ week: monday, guess: 'two' }, { week: 99 }, 'nonsense', []]) {
    assert.equal(weeklyState(WEEKLY, bad, today).status, 'playing', `${JSON.stringify(bad)} was trusted`);
  }

  assert.deepEqual(recordOf(answered), { week: monday, guess: 2.4 });
  assert.equal(WEEKLY_STORAGE_KEY, 'oneTrade.weekly.v1');
});

test('before the first Monday the challenge says so, rather than dealing week -1', () => {
  const early = weeklyState(WEEKLY, null, '2026-11-26');
  assert.equal(early.status, 'notStarted');
  assert.equal(early.portfolio, null);
  assert.equal(early.firstMonday, WEEKLY.firstMonday);
});

// ------------------------------------------------------------ the file itself

test('the weekly block is validated, and the validator means it', () => {
  const short = copy();
  short.weekly.portfolios = short.weekly.portfolios.slice(0, 3);
  assert.throws(() => validateLevels(short), /weekly: 3 portfolios/);

  const wrongMoney = copy();
  wrongMoney.weekly.portfolios[0].dollars.VOO = 1;
  assert.throws(() => validateLevels(wrongMoney), /allocates/);

  const notMonday = copy();
  notMonday.weekly.firstMonday = '2026-12-01';            // a Tuesday
  assert.throws(() => validateLevels(notMonday), /Monday/);

  const tellsTheAnswer = copy();
  tellsTheAnswer.weekly.share.hidesAnswer = false;
  assert.throws(() => validateLevels(tellsTheAnswer), /hidesAnswer/);
});

test('the weekly scores like level 2: a star for guessing, then the two bands', () => {
  assert.equal(WEEKLY.pass.measure, 'guess');
  assert.equal(WEEKLY.stars.pass, 1);
  assert.equal(WEEKLY.stars.two.of, 1);
  assert.equal(WEEKLY.stars.three.of, 0.5);
  assert.equal(starsFor(WEEKLY, { guess: 2.0, actual: 2.3, passed: true }), 3);
  assert.equal(starsFor(WEEKLY, { guess: 2.0, actual: 2.9, passed: true }), 2);
  assert.equal(starsFor(WEEKLY, { guess: 2.0, actual: 4.0, passed: true }), 1);
});
