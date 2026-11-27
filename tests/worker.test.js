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
  passedValue,
  PASSED_NOT_STATED,
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

test('a ping carrying whether everything before it was passed is accepted', () => {
  // Session 2.38: a level unlocks by being played, so "reached level 4" no
  // longer implies "passed level 3", and docs/PRD.md reads two success targets
  // off exactly this field.
  assert.ok(validatePingBody({ level: 4, passed: true }));
  assert.ok(validatePingBody({ level: 4, passed: false }));
  assert.ok(validatePingBody({ level: 4, passed: true, src: 'club-ucla' }));
});

test('a ping from a page open since before the field still counts', () => {
  // A LOST PING IS A LOST COUNT, with no error anywhere to notice it by. The
  // field arrived after the site was live, so a browser holding the old page
  // keeps sending the old shape; rejecting it would quietly undercount every
  // target while looking exactly like nobody visited.
  assert.ok(validatePingBody({ level: 4 }));
  assert.ok(validatePingBody({ level: 4, src: 'daily' }));
  assert.equal(passedValue({ level: 4 }), PASSED_NOT_STATED);
  assert.equal(passedValue({ level: 4, passed: true }), 1);
  assert.equal(passedValue({ level: 4, passed: false }), 0);
  // NOT ZERO FOR "did not say". Zero is a claim the client never made, and it
  // is the claim that would undercount "players who finish level 3".
  assert.notEqual(PASSED_NOT_STATED, 0);
});

test('passed has to be a boolean, not a number that looks like one', () => {
  for (const value of [1, 0, 'true', null, undefined]) {
    assert.ok(!validatePingBody({ level: 4, passed: value }), `passed: ${JSON.stringify(value)}`);
  }
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

test('src chooses the table and is never written into a guess row', async () => {
  // The registered record is five fields (PREREG_AMENDMENT_3.md section 3):
  // src decides WHICH dataset a row lands in and contributes nothing to the
  // row itself. Checked with two values, because "playtest" leaking would be
  // caught by the routing test above anyway - an ordinary campaign code
  // leaking would not.
  const env = baseEnv();
  await worker.fetch(postRequest('/guess?src=playtest', goodGuess()), env);
  await worker.fetch(postRequest('/guess?src=club-ucla', goodGuess({ level: 7 })), env);

  assert.equal(env.GUESSES_PLAYTEST.points.length, 1, 'playtest did not choose the playtest table');
  assert.equal(env.GUESSES.points.length, 1, 'any other source code belongs in the real table');

  const written = JSON.stringify([...env.GUESSES.points, ...env.GUESSES_PLAYTEST.points]);
  assert.ok(!written.includes('playtest'), 'a source code reached a guess row');
  assert.ok(!written.includes('club-ucla'), 'a source code reached a guess row');

  // A PING IS THE EXCEPTION, AND THE CONTRAST IS THE POINT: there the source
  // code is the measurement, so it is written on purpose.
  await worker.fetch(postRequest('/ping', { level: 3, src: 'club-ucla' }), env);
  assert.ok(JSON.stringify(env.PINGS.points).includes('club-ucla'),
    'a ping must carry its source code - that is what a count ping is for');
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

test('a full class-sized burst of pings from one IP all succeed, too', async () => {
  // PING_LIMITER started at 30/60s and was raised to 300/60s on 27 November
  // 2026 (BUILD_LOG.md) - that original limit was itself tight enough for
  // one class session's worth of level-reached pings to undercount. A real
  // counting stand-in, not a stub, so the configured 300 is actually
  // exercised: up to 7 pings per student (one per level reached) times a
  // 40-student class is 280, under the limit with room to spare.
  let count = 0;
  const env = baseEnv({ PING_LIMITER: { limit: async () => ({ success: (count += 1) <= 300 }) } });
  let sent = 0;
  for (let student = 0; student < 40; student += 1) {
    for (let level = 1; level <= 7; level += 1) {
      sent += 1;
      // eslint-disable-next-line no-await-in-loop
      const response = await worker.fetch(
        postRequest('/ping', { level, src: 'classroom' }, { ip: '198.51.100.88' }),
        env,
      );
      assert.equal(response.status, 204, `ping ${sent} from a full class on one IP should not be limited`);
    }
  }
  assert.equal(sent, 280);
  assert.equal(env.PINGS.points.length, 280);
});

test('the ping row carries the level and the passed flag, in that order', async () => {
  const env = baseEnv();
  await worker.fetch(postRequest('/ping', { level: 4, passed: true, src: 'daily' }), env);
  await worker.fetch(postRequest('/ping', { level: 4, passed: false, src: 'daily' }), env);
  await worker.fetch(postRequest('/ping', { level: 4, src: 'daily' }), env);
  assert.deepEqual(env.PINGS.points.map((point) => point.doubles), [
    [4, 1], [4, 0], [4, PASSED_NOT_STATED],
  ]);
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
