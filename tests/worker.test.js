// tests/worker.test.js - the Worker's pure validation, tested the same way
// as everything else: node --test, no Miniflare.
//
// WHAT IS NOT TESTED HERE: the Analytics Engine writes themselves, and the
// rate-limit bindings. Both need the Workers runtime; they are exercised by
// hand with `wrangler dev` instead (see docs/PRD.md milestone 3 step 1's
// checklist).
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  GUESS_RANGE,
  ACTUAL_RANGE,
  MAX_BODY_BYTES,
  isFiniteInRange,
  isValidDate,
  validateGuessBody,
  validatePingBody,
} from '../worker/src/index.js';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));
const LEVELS = readJson('levels.json');

const NOW = new Date('2026-11-27T12:00:00Z');
const GOOD_ID = 'a'.repeat(32);

function goodGuess(overrides = {}) {
  return { id: GOOD_ID, level: 2, guess: 2.5, actual: 2.1, date: '2026-11-27', ...overrides };
}

// ------------------------------------------------- staying in sync with levels.json

test('the hardcoded guess range matches levels 2 and 7 in levels.json', () => {
  for (const id of [2, 7]) {
    const level = LEVELS.levels.find((l) => l.id === id);
    assert.equal(level.guess.min, GUESS_RANGE.min, `level ${id}'s min drifted`);
    assert.equal(level.guess.max, GUESS_RANGE.max, `level ${id}'s max drifted`);
  }
});

test('the hardcoded actual range covers every recorded pool answer', () => {
  const answers = [
    ...LEVELS.guessPool.portfolios.map((p) => p.expectedBets),
    ...LEVELS.finalPool.portfolios.map((p) => p.expectedBets),
  ];
  assert.ok(answers.length > 0, 'no recorded answers to check against');
  for (const answer of answers) {
    assert.ok(
      isFiniteInRange(answer, ACTUAL_RANGE),
      `${answer} falls outside [${ACTUAL_RANGE.min}, ${ACTUAL_RANGE.max}]`,
    );
  }
});

// ------------------------------------------------------------- isValidDate

test('today, by the Worker\'s own clock, is valid', () => {
  assert.ok(isValidDate('2026-11-27', NOW));
});

test('a day either side is still valid', () => {
  assert.ok(isValidDate('2026-11-26', NOW));
  assert.ok(isValidDate('2026-11-28', NOW));
});

test('a week old is not - a script cannot backdate a flood', () => {
  assert.ok(!isValidDate('2026-11-20', NOW));
});

test('a week from now is not, either', () => {
  assert.ok(!isValidDate('2026-12-04', NOW));
});

test('not a real date, and not a date at all', () => {
  assert.ok(!isValidDate('2026-13-01', NOW));
  assert.ok(!isValidDate('11/27/2026', NOW));
  assert.ok(!isValidDate(20261127, NOW));
  assert.ok(!isValidDate(null, NOW));
});

// ------------------------------------------------------------ validateGuessBody

test('a well-formed level-2 record passes', () => {
  assert.ok(validateGuessBody(goodGuess(), NOW));
});

test('a well-formed level-7 record passes', () => {
  assert.ok(validateGuessBody(goodGuess({ level: 7 }), NOW));
});

test('any level but 2 or 7 is rejected, even a real one', () => {
  for (const level of [1, 3, 4, 5, 6, 2.5, '2', null]) {
    assert.ok(!validateGuessBody(goodGuess({ level }), NOW), `level ${level} should not pass`);
  }
});

test('an extra field is rejected, not silently dropped', () => {
  assert.ok(!validateGuessBody({ ...goodGuess(), ticker: 'QQQ' }, NOW));
});

test('a missing field is rejected', () => {
  const { date, ...rest } = goodGuess();
  assert.ok(!validateGuessBody(rest, NOW));
});

test('the id must be exactly 32 lowercase hex characters', () => {
  assert.ok(!validateGuessBody(goodGuess({ id: 'A'.repeat(32) }), NOW), 'uppercase hex');
  assert.ok(!validateGuessBody(goodGuess({ id: 'a'.repeat(31) }), NOW), 'too short');
  assert.ok(!validateGuessBody(goodGuess({ id: 'a'.repeat(33) }), NOW), 'too long');
  assert.ok(!validateGuessBody(goodGuess({ id: 'g'.repeat(32) }), NOW), 'not hex');
});

test('guess outside the slider\'s own range is rejected', () => {
  assert.ok(!validateGuessBody(goodGuess({ guess: 0.9 }), NOW));
  assert.ok(!validateGuessBody(goodGuess({ guess: 6.1 }), NOW));
  assert.ok(validateGuessBody(goodGuess({ guess: 1 }), NOW), 'the range is inclusive');
  assert.ok(validateGuessBody(goodGuess({ guess: 6 }), NOW), 'the range is inclusive');
});

test('actual outside the mathematical bound is rejected', () => {
  assert.ok(!validateGuessBody(goodGuess({ actual: 0.99 }), NOW));
  assert.ok(!validateGuessBody(goodGuess({ actual: 8.01 }), NOW));
});

test('a non-finite guess or actual is rejected', () => {
  assert.ok(!validateGuessBody(goodGuess({ guess: NaN }), NOW));
  assert.ok(!validateGuessBody(goodGuess({ guess: Infinity }), NOW));
  assert.ok(!validateGuessBody(goodGuess({ actual: '2.1' }), NOW), 'a numeric string is not a number');
});

test('not an object at all is rejected, not thrown on', () => {
  for (const bad of [null, undefined, 'x', 42, [goodGuess()]]) {
    assert.ok(!validateGuessBody(bad, NOW));
  }
});

// ------------------------------------------------------------- validatePingBody

test('a ping with a source code passes', () => {
  assert.ok(validatePingBody({ level: 3, src: 'club-ucla' }));
});

test('a ping with no source code passes too - a bookmark carries none', () => {
  assert.ok(validatePingBody({ level: 1 }));
});

test('every real level, 1 through 7, is accepted', () => {
  for (let level = 1; level <= 7; level += 1) assert.ok(validatePingBody({ level }));
});

test('level 0 or 8 is rejected', () => {
  assert.ok(!validatePingBody({ level: 0 }));
  assert.ok(!validatePingBody({ level: 8 }));
});

test('a source code outside the safe charset is rejected', () => {
  assert.ok(!validatePingBody({ level: 1, src: 'DROP TABLE' }));
  assert.ok(!validatePingBody({ level: 1, src: '<script>' }));
  assert.ok(!validatePingBody({ level: 1, src: 'a'.repeat(41) }), 'too long');
});

test('an extra field on a ping is rejected too', () => {
  assert.ok(!validatePingBody({ level: 1, src: 'daily', id: GOOD_ID }));
});

// --------------------------------------------------------------- MAX_BODY_BYTES

test('the body size cap is exactly 1 KB', () => {
  assert.equal(MAX_BODY_BYTES, 1024);
});
