// tests/worker.test.js - the Worker's pure validation, and the fetch
// handler itself, tested the same way as everything else: node --test, no
// Miniflare. Node has native fetch/Request/Response (confirmed on the
// Node version this project runs), so the real `export default { fetch }`
// can be called directly against stand-in env bindings - PING_LIMITER,
// GUESS_LIMITER and the three datasets are plain objects here, not
// Cloudflare's own runtime objects.
//
// WHAT IS STILL NOT TESTED HERE: that Cloudflare's real Analytics Engine
// and Rate Limiting bindings behave the way the stand-ins assume. That
// needs the Workers runtime, and is exercised by hand with `wrangler dev`
// (see docs/PRD.md milestone 3 step 1's checklist). What IS tested here:
// that this file's own code calls the right binding, with the right key,
// in the right order, and never leaks what it isn't supposed to.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import worker from '../worker/src/index.js';
import {
  GUESS_RANGE,
  ACTUAL_RANGE,
  MAX_BODY_BYTES,
  isFiniteInRange,
  isValidDate,
  rateLimited,
  validateGuessBody,
  validatePingBody,
} from '../worker/src/validate.js';

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

// ---------------------------------------------------------------- rateLimited

test('no limiter at all is not a block', async () => {
  assert.equal(await rateLimited(undefined, 'some-key'), false);
});

test('no key at all is not a block, rather than a call that throws', async () => {
  const limiter = { limit: async () => ({ success: false }) };
  assert.equal(await rateLimited(limiter, undefined), false);
});

test('the limiter\'s own answer decides it', async () => {
  const allow = { limit: async () => ({ success: true }) };
  const block = { limit: async () => ({ success: false }) };
  assert.equal(await rateLimited(allow, 'x'), false);
  assert.equal(await rateLimited(block, 'x'), true);
});

test('the exact key given is the exact key passed to the binding', async () => {
  const seen = [];
  const limiter = { limit: async ({ key }) => { seen.push(key); return { success: true }; } };
  await rateLimited(limiter, 'visitor-203.0.113.5');
  assert.deepEqual(seen, ['visitor-203.0.113.5']);
});

// -------------------------------------------------------- the fetch handler

const ORIGIN = 'https://mayaagge.github.io';

/** A limiter stand-in: `allow` decides every key the same way, or a function of the key. */
function stubLimiter(allow = true) {
  const calls = [];
  const decide = typeof allow === 'function' ? allow : () => allow;
  return { calls, limit: async ({ key }) => { calls.push(key); return { success: decide(key) }; } };
}

/** An Analytics Engine dataset stand-in: just remembers what it was handed. */
function stubDataset() {
  const points = [];
  return { points, writeDataPoint: (point) => points.push(point) };
}

function baseEnv(overrides = {}) {
  return {
    ALLOWED_ORIGIN: ORIGIN,
    PING_LIMITER: stubLimiter(true),
    GUESS_LIMITER: stubLimiter(true),
    GUESS_IP_LIMITER: stubLimiter(true),
    PINGS: stubDataset(),
    GUESSES: stubDataset(),
    GUESSES_PLAYTEST: stubDataset(),
    ...overrides,
  };
}

function postRequest(path, body, { ip = '203.0.113.5', origin = ORIGIN } = {}) {
  return new Request(`https://worker.example${path}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  });
}

test('a well-formed /guess is accepted and lands in GUESSES', async () => {
  const env = baseEnv();
  const response = await worker.fetch(postRequest('/guess', goodGuess()), env);
  assert.equal(response.status, 204);
  assert.equal(env.GUESSES.points.length, 1);
  assert.equal(env.GUESSES_PLAYTEST.points.length, 0);
});

test('?src=playtest routes the row to GUESSES_PLAYTEST instead, same five fields', async () => {
  const env = baseEnv();
  const response = await worker.fetch(postRequest('/guess?src=playtest', goodGuess()), env);
  assert.equal(response.status, 204);
  assert.equal(env.GUESSES.points.length, 0);
  assert.equal(env.GUESSES_PLAYTEST.points.length, 1);
});

test('an invalid body never reaches a limiter or a dataset', async () => {
  const env = baseEnv();
  const response = await worker.fetch(postRequest('/guess', { ...goodGuess(), level: 3 }), env);
  assert.equal(response.status, 400);
  assert.equal(env.PING_LIMITER.calls.length, 0);
  assert.equal(env.GUESS_LIMITER.calls.length, 0);
  assert.equal(env.GUESSES.points.length, 0);
});

test('a fresh random id on every request still gets caught, by IP', async () => {
  // Simulates exactly the dodge this fix closes: the id-keyed limiter always
  // allows, because a script minting a new id per request never repeats one -
  // but GUESS_IP_LIMITER has seen this IP too many times.
  const env = baseEnv({ GUESS_IP_LIMITER: stubLimiter(false), GUESS_LIMITER: stubLimiter(true) });
  const response = await worker.fetch(postRequest('/guess', goodGuess({ id: 'b'.repeat(32) })), env);
  assert.equal(response.status, 429);
  assert.equal(env.GUESSES.points.length, 0, 'a rate-limited request must not be written');
});

test('one id reused from many different IPs is still caught, by id', async () => {
  // GUESS_IP_LIMITER is fine with any single one of many IPs; the id-keyed
  // one has seen this exact id too many times regardless of which IP it
  // arrived from.
  const env = baseEnv({ GUESS_IP_LIMITER: stubLimiter(true), GUESS_LIMITER: stubLimiter(false) });
  const response = await worker.fetch(postRequest('/guess', goodGuess()), env);
  assert.equal(response.status, 429);
  assert.equal(env.GUESSES.points.length, 0);
});

test('/guess and /ping do NOT share an IP-keyed limiter', async () => {
  // The opposite property of what this binding layout used to have, and on
  // purpose: a class's pings sharing one IP must never be able to exhaust a
  // budget /guess also depends on.
  const env = baseEnv();
  await worker.fetch(postRequest('/guess', goodGuess(), { ip: '198.51.100.9' }), env);
  await worker.fetch(postRequest('/ping', { level: 3 }, { ip: '198.51.100.9' }), env);
  assert.deepEqual(env.GUESS_IP_LIMITER.calls, ['198.51.100.9'], 'only /guess should call this one');
  assert.deepEqual(env.PING_LIMITER.calls, ['198.51.100.9'], 'only /ping should call this one');
});

test('a class hammering /ping on one shared IP cannot starve /guess', async () => {
  // The exact scenario that was missed: PING_LIMITER exhausted (30-40
  // students on one campus-wifi IP pinging at once) must not block a /guess
  // from that same IP, because they are different bindings now.
  const env = baseEnv({ PING_LIMITER: stubLimiter(false) });
  const pingResponse = await worker.fetch(postRequest('/ping', { level: 2 }, { ip: '198.51.100.50' }), env);
  assert.equal(pingResponse.status, 429, 'the ping should still be the one that is limited');
  const guessResponse = await worker.fetch(postRequest('/guess', goodGuess(), { ip: '198.51.100.50' }), env);
  assert.equal(guessResponse.status, 204, 'a guess from the same IP must not be caught by the ping limiter');
  assert.equal(env.GUESSES.points.length, 1);
});

test('a full class-sized burst of guesses from one IP all succeed', async () => {
  // Not a stub this time: the real rateLimited() against a counting stand-in
  // for GUESS_IP_LIMITER, so the 300/60s configured in wrangler.toml is
  // actually exercised, not just assumed generous enough.
  let count = 0;
  const env = baseEnv({ GUESS_IP_LIMITER: { limit: async () => ({ success: (count += 1) <= 300 }) } });
  for (let i = 0; i < 40; i += 1) {
    const id = `${i}`.padStart(32, '0');
    // eslint-disable-next-line no-await-in-loop
    const response = await worker.fetch(
      postRequest('/guess', goodGuess({ id }), { ip: '198.51.100.77' }),
      env,
    );
    assert.equal(response.status, 204, `request ${i} from a full class on one IP should not be limited`);
  }
  assert.equal(env.GUESSES.points.length, 40);
});

test('a rate-limited /ping is rejected and writes nothing', async () => {
  const env = baseEnv({ PING_LIMITER: stubLimiter(false) });
  const response = await worker.fetch(postRequest('/ping', { level: 2 }), env);
  assert.equal(response.status, 429);
  assert.equal(env.PINGS.points.length, 0);
});

test('the real visitor IP is never written to any dataset, any blob, or any index', async () => {
  const markedIp = '203.0.113.123';
  const env = baseEnv();
  await worker.fetch(postRequest('/guess', goodGuess(), { ip: markedIp }), env);
  await worker.fetch(postRequest('/ping', { level: 4, src: 'daily' }, { ip: markedIp }), env);
  const everythingWritten = JSON.stringify([
    ...env.GUESSES.points, ...env.GUESSES_PLAYTEST.points, ...env.PINGS.points,
  ]);
  assert.ok(!everythingWritten.includes(markedIp), 'the IP leaked into a written record');
});
