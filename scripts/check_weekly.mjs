// scripts/check_weekly.mjs - is the weekly challenge still a challenge?
//
// WHAT THIS IS FOR, and why it is a script rather than a test. Three properties
// hold the weekly challenge together, and every one of them is a fact about the
// PRICES rather than about this repository:
//
//   1. Every week says something specific. Which "Why?" card a portfolio earns
//      turns on thresholds - 3 bets for manyBets, 2 for fewBets - and a weekly
//      answer sitting near one would change card when the market moved.
//   2. No two weeks in a row answer within a bet of each other, so a player
//      cannot guess this week from last week. The wrap from week 10 to week 1
//      counts, because the list cycles.
//   3. One number typed every week scores badly: no four answers inside a bet.
//
// A unit test reading those from data/game.json would turn red on a morning
// when nobody had touched the code, and block a commit that was correct. So
// tests/weekly.test.js checks them on the FROZEN snapshot, which cannot move,
// and this reports them on the live file AFTER the commit - the same bargain
// scripts/build_puzzles.mjs --check and scripts/check_levels.mjs already make.
// The refresh workflow runs it with continue-on-error: it colours the run, and
// never withholds today's prices from the game.
//
// WHAT IT WOULD MEAN IF THIS WENT RED. Not that anything is broken - today's
// game plays fine either way - but that the ten portfolios need re-spacing or
// re-choosing, which is an edit to levels.json and a decision for a person.
//
// Educational, not investment advice.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { validateLevels, weightsFromDollars, starsFor } from '../js/levels.js';
import { gameWindow, windowMatrix, validateGameDoc } from '../js/gameView.js';
import { covariance, effectiveBets } from '../js/math.js';
import { groupIndex, pickWhy, validateWhy, whyFacts } from '../js/why.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (name) => JSON.parse(readFileSync(resolve(ROOT, name), 'utf8'));
export const DISCLAIMER = 'Educational, not investment advice.';

/**
 * The ten weeks as they stand today: what each one answers and what its reveal
 * would say about it.
 */
export function weeksNow(weekly, game, why, groups) {
  return weekly.portfolios.map((portfolio) => {
    const { tickers, weights } = weightsFromDollars(portfolio.dollars);
    const window = gameWindow(game, tickers, weekly.window.days);
    const matrix = windowMatrix(window, tickers);
    const facts = whyFacts({ tickers, weights, matrix, groups });
    const card = pickWhy(facts, why, {
      outcome: { mode: 'weekly', measure: 'effectiveBets', passed: true },
    });
    return {
      id: portfolio.id,
      name: portfolio.name,
      bets: effectiveBets(weights, covariance(matrix)),
      card: card.key,
      days: window.days,
    };
  });
}

/**
 * The report. PURE, and fed plain numbers, so tests/checkWeekly.test.js can
 * hand it a week list that has drifted without waiting for a market to do it.
 *
 * Every threshold it applies comes out of levels.json - the slider's range, the
 * star bands - so a change to the file changes the check with it.
 *
 * @returns {{problems: string[], notes: string[]}}
 */
export function checkWeekly(weeks, weekly) {
  const problems = [];
  const notes = [];

  notes.push(`${weeks.length} weeks, answering ${weeks.map((w) => w.bets.toFixed(2)).join(', ')}`);

  // 1. Every week says something specific.
  for (const week of weeks) {
    if (week.card === 'fallback') {
      problems.push(
        `${week.id} "${week.name}" (${week.bets.toFixed(2)} bets) has nothing specific to say about `
        + 'itself: its reveal shows the fallback card',
      );
    }
  }
  const cards = new Set(weeks.map((w) => w.card));
  notes.push(`${cards.size} different "Why?" cards across the ten: ${[...cards].sort().join(', ')}`);

  // 2. No two weeks in a row within a bet, the wrap included.
  let tightest = Infinity;
  for (let i = 0; i < weeks.length; i += 1) {
    const next = weeks[(i + 1) % weeks.length];
    const step = Math.abs(next.bets - weeks[i].bets);
    tightest = Math.min(tightest, step);
    if (step <= 1) {
      problems.push(
        `${weeks[i].id} and ${next.id} answer ${weeks[i].bets.toFixed(2)} and ${next.bets.toFixed(2)}, `
        + `${step.toFixed(2)} apart - a player who came back can guess the second from the first`,
      );
    }
  }
  notes.push(`tightest step between one week and the next: ${tightest.toFixed(2)} bets`);

  // 3. One number typed every week should score badly.
  const level = { ...weekly, stars: weekly.stars, pass: weekly.pass };
  let worst = { guess: null, stars: 0 };
  for (let guess = weekly.guess.min; guess <= weekly.guess.max + 1e-9; guess += 0.01) {
    const three = weeks.filter(
      (week) => starsFor(level, { guess, actual: week.bets, passed: true }) === 3,
    ).length;
    if (three > worst.stars) worst = { guess: Number(guess.toFixed(2)), stars: three };
  }
  notes.push(`the best constant guess is ${worst.guess}, worth 3 stars on ${worst.stars} of the ${weeks.length}`);
  if (worst.stars > 3) {
    problems.push(
      `a constant guess of ${worst.guess}, typed every week without reading the portfolio, `
      + `would earn 3 stars on ${worst.stars} of the ${weeks.length} weeks, so the answers `
      + 'need re-spacing',
    );
  }

  // 4. Every answer has to be reachable on the slider.
  for (const week of weeks) {
    if (week.bets > weekly.guess.max || week.bets < weekly.guess.min) {
      problems.push(
        `${week.id} answers ${week.bets.toFixed(2)}, which the slider cannot reach `
        + `(${weekly.guess.min} to ${weekly.guess.max})`,
      );
    }
  }

  // 5. A window short enough to be a different measure.
  for (const week of weeks) {
    if (Number.isFinite(week.days) && week.days < weekly.window.minDays) {
      problems.push(`${week.id} has only ${week.days} trading days, under the ${weekly.window.minDays} minimum`);
    }
  }
  return { problems, notes };
}

function main(argv = []) {
  const quiet = argv.includes('--quiet');
  const say = (line) => { if (!quiet) console.log(line); };

  const levels = validateLevels(readJson('levels.json'));
  const game = validateGameDoc(readJson('data/game.json'));
  const why = validateWhy(readJson('why.json'));
  const groups = groupIndex(readJson('tickers.json'));

  const weeks = weeksNow(levels.weekly, game, why, groups);
  say(`The weekly challenge, on prices through ${game.meta.liveThrough}:`);
  for (const week of weeks) {
    say(`  ${week.id}  ${week.bets.toFixed(2)} bets  ${week.card.padEnd(13)} ${week.name}`);
  }

  const { problems, notes } = checkWeekly(weeks, levels.weekly);
  for (const note of notes) say(`  ${note}`);
  if (problems.length === 0) {
    say(`The ten still work as a weekly challenge. ${DISCLAIMER}`);
    return 0;
  }
  for (const problem of problems) {
    console.error(`::error title=The weekly challenge has drifted::${problem}`);
  }
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
