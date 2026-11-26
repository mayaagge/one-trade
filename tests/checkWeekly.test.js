// tests/checkWeekly.test.js - the post-commit report on the weekly challenge.
//
// WHY THIS IS A SCRIPT AND NOT A TEST. Which card a weekly portfolio earns
// depends on thresholds - 3 bets for manyBets, 2 for fewBets - and which weeks
// a player can tell apart depends on distances between answers. All of those
// are facts about the PRICES, which move every weekday evening. A unit test
// that read them from data/game.json would turn red on a morning when nobody
// had touched the repository, and block a commit that was perfectly correct.
//
// So the properties are tested on the frozen snapshot, where they cannot move
// (tests/weekly.test.js), and scripts/check_weekly.mjs reports the same
// properties on the live file after the commit, colouring the run the way
// scripts/build_puzzles.mjs --check and scripts/check_levels.mjs already do.
//
// What is tested HERE is that the reporting is right: that it notices a week
// with nothing to say, weeks that have drifted together, and a constant guess
// that would score. Fed made-up numbers, because the point is the logic.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { checkWeekly } from '../scripts/check_weekly.mjs';
import { validateLevels } from '../js/levels.js';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));
const LEVELS = validateLevels(readJson('levels.json'));

/** Ten weeks, spread the way the real ten are, with every card specific. */
const healthy = () => [
  { id: 'w01', name: 'one', bets: 1.11, card: 'groupRisk' },
  { id: 'w02', name: 'two', bets: 2.75, card: 'riskGapOver' },
  { id: 'w03', name: 'three', bets: 1.25, card: 'quietNotABet' },
  { id: 'w04', name: 'four', bets: 3.22, card: 'manyBets' },
  { id: 'w05', name: 'five', bets: 1.55, card: 'fewBets' },
  { id: 'w06', name: 'six', bets: 3.45, card: 'quietNotABet' },
  { id: 'w07', name: 'seven', bets: 2.17, card: 'riskGapUnder' },
  { id: 'w08', name: 'eight', bets: 3.84, card: 'manyBets' },
  { id: 'w09', name: 'nine', bets: 2.37, card: 'riskGapUnder' },
  { id: 'w10', name: 'ten', bets: 4.40, card: 'pair' },
];

test('a healthy week list reports no problems, and says what it found', () => {
  const { problems, notes } = checkWeekly(healthy(), LEVELS.weekly);
  assert.deepEqual(problems, []);
  assert.ok(notes.length > 0, 'the check says nothing at all');
  assert.ok(notes.some((note) => /tightest step/.test(note)));
  assert.ok(notes.some((note) => /constant guess/.test(note)));
});

test('a week with nothing specific to say is reported, not thrown', () => {
  const weeks = healthy();
  weeks[3].card = 'fallback';
  const { problems } = checkWeekly(weeks, LEVELS.weekly);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /w04/);
  assert.match(problems[0], /nothing specific/i);
});

test('two weeks in a row that have drifted together are reported', () => {
  const weeks = healthy();
  weeks[4].bets = 3.00;            // week 5, now close to week 4's 3.22
  const { problems } = checkWeekly(weeks, LEVELS.weekly);
  assert.ok(problems.some((p) => /w04 and w05/.test(p)), problems.join(' | '));
  assert.ok(problems.some((p) => /0\.22/.test(p)), 'the report does not say how far apart they are');
});

test('the wrap from the last week to the first is checked like any other step', () => {
  const weeks = healthy();
  weeks[9].bets = 1.60;            // week 10, now close to week 1's 1.11
  const { problems } = checkWeekly(weeks, LEVELS.weekly);
  assert.ok(problems.some((p) => /w10 and w01/.test(p)), problems.join(' | '));
});

test('a constant guess that would score is reported with the guess that does it', () => {
  const weeks = healthy();
  // Four answers inside one bet: 2.17, 2.37, 2.75 and now 2.60.
  weeks[3].bets = 2.60;
  const { problems } = checkWeekly(weeks, LEVELS.weekly);
  assert.ok(problems.some((p) => /constant guess/i.test(p)), problems.join(' | '));
  assert.ok(problems.some((p) => /4 of the 10/.test(p)), problems.join(' | '));
});

test('an answer the slider cannot reach is reported', () => {
  const weeks = healthy();
  weeks[9].bets = 6.40;            // past the top of the 1-to-6 slider
  const { problems } = checkWeekly(weeks, LEVELS.weekly);
  assert.ok(problems.some((p) => /slider|reach/i.test(p)), problems.join(' | '));
});

test('the check reads the levels file for its rules, not numbers of its own', () => {
  // Every threshold it applies is one levels.json already carries, so a change
  // to the file changes the check with it.
  const weekly = JSON.parse(JSON.stringify(LEVELS.weekly));
  weekly.guess.max = 3;            // a slider that stops at 3
  const { problems } = checkWeekly(healthy(), weekly);
  assert.ok(problems.some((p) => /slider|reach/i.test(p)), problems.join(' | '));
});
