// tests/guessRecords.test.js - what the game would send, and what it must not.
//
// TWO SUBJECTS, ONE MOUNTED MODE, which is why they share a file: both are about
// what leaves the browser, and both need Learn rendered and played.
//
// 1. THE RECORDS EXIST AND ARE CORRECT. PREREG.md's Hypothesis 3 compares each
//    player's error on level 2 with their own error on level 7 and pairs the two
//    with a one-sided sign test. Before this file, only level 7 produced a
//    record: js/round.js's createRound() had no emit at all, and only
//    createSeries() could send. The level-2 half of every pair had no code path
//    to send from, so the registered test would have become uncomputable the day
//    the Worker was wired up - silently, with level 7's rows arriving all along,
//    and discoverable only when collection closed 60 days after launch. That is
//    the failure this file exists to make impossible.
//
// 2. NOTHING IS SENT ANYWHERE YET. The records are collected in memory and the
//    Worker does not exist, so Learn is rendered here with every outward route a
//    browser has watched - fetch, XMLHttpRequest, sendBeacon, Image, WebSocket,
//    EventSource, navigator.share, the clipboard and all four ways to change the
//    URL - exactly as tests/myPortfolio.test.js watches them, and anything that
//    goes out after the data files are read is a failure. Learn is the mode that
//    will gain /guess and /ping, so it is the mode where an accidental send is
//    most likely and least visible.
//
// WHAT A RECORD MAY CARRY, and this is the part worth being strict about:
// PREREG.md says "a random per-browser ID, level, guess, actual value and date.
// No tickers, amounts or personal data", and docs/PRD.md repeats it. The tests
// below check the five fields are present AND that nothing else is - a record
// built by spreading a result object would carry tickers and dollars the day
// somebody added a field, and would look fine in review.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { StubNode, withDocument } from './stubDom.js';
import { mountLearn, RECORDING_LEVELS } from '../js/game.js';
import { mountWeekly } from '../js/weeklyView.js';
import { mountSandbox } from '../js/sandbox.js';
import { mountMyPortfolio } from '../js/myPortfolio.js';
import { PARTICIPANT_KEY, newId, participantId } from '../js/participant.js';
import { SEEN_POOL_KEY } from '../js/seenPool.js';
import { validateLevels } from '../js/levels.js';
import { PROGRESS_KEY, recordLevel, starsOf, triesOf } from '../js/progress.js';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));
const LEVELS = validateLevels(readJson('levels.json'));
const TICKERS = readJson('tickers.json');
const BASKET = readJson('basket.json');
const WHY = readJson('why.json');
const GAME = readJson('data/game.json');
const CRASHES = readJson('data/crashes.json');
const NAMES = readJson('names.json');

const FILES = {
  'levels.json': LEVELS,
  'tickers.json': TICKERS,
  'basket.json': BASKET,
  'why.json': WHY,
  'names.json': NAMES,
  'data/game.json': GAME,
  'data/crashes.json': CRASHES,
};
const DATA_FILES = Object.keys(FILES).sort();
const UNIVERSE = TICKERS.groups
  .flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));

/** The five fields PREREG.md registers, and the only five. */
const RECORD_FIELDS = ['id', 'level', 'guess', 'actual', 'date'].sort();

/**
 * A browser with every exit watched.
 *
 * `sent` collects anything that would leave the machine by any route. The data
 * files go through `fetch` and are counted there too, so a test marks how many
 * had gone out by the time play started and asserts nothing is added after.
 */
function browser({ store = {}, search = '' } = {}) {
  const asked = [];
  const sent = [];
  const urlChanges = [];

  const location = {
    origin: 'http://localhost:8000',
    pathname: '/',
    hash: '#learn',
    search,
    href: `http://localhost:8000/${search}#learn`,
    assign: (url) => urlChanges.push(`assign ${url}`),
    replace: (url) => urlChanges.push(`replace ${url}`),
  };

  const restore = withDocument({
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
      removeItem: (key) => { delete store[key]; },
    },
    location,
    history: {
      pushState: (s, t, url) => urlChanges.push(`pushState ${url}`),
      replaceState: (s, t, url) => urlChanges.push(`replaceState ${url}`),
    },
    navigator: {
      sendBeacon: (url, body) => { sent.push(`beacon ${url} ${body ?? ''}`); return true; },
      clipboard: { writeText: (text) => { sent.push(`clipboard ${text}`); return Promise.resolve(); } },
      share: async (data) => { sent.push(`share ${JSON.stringify(data)}`); },
    },
    XMLHttpRequest: class {
      open(method, url) { sent.push(`xhr ${method} ${url}`); }

      send(body) { sent.push(`xhr send ${body ?? ''}`); }

      setRequestHeader() {}
    },
    Image: class { set src(value) { sent.push(`img ${value}`); } },
    WebSocket: class { constructor(url) { sent.push(`ws ${url}`); } },
    EventSource: class { constructor(url) { sent.push(`sse ${url}`); } },
    fetch: async (url, options) => {
      const name = String(url);
      asked.push(name);
      sent.push(`fetch ${name} ${options?.body ?? ''}`);
      const body = FILES[name];
      if (!body) throw new Error(`unexpected fetch: ${name}`);
      return { ok: true, status: 200, json: async () => body };
    },
  });
  globalThis.window = { innerWidth: 390, addEventListener() {}, scrollTo() {} };

  return {
    root: new StubNode('main'), asked, sent, store, urlChanges, location, restore,
  };
}

/**
 * Play one single-question level: pick what it needs, guess, reveal.
 *
 * Driven through the round rather than through the slider, because what is
 * being counted is records and not clicks - and reveal() is exactly what the
 * "Reveal the answer" button calls.
 */
function play(ctx, levelId, guess) {
  ctx.startRound(levelId);
  const round = ctx.round;
  const level = round.level;
  if (!round.buildComplete()) {
    // Fill the build out of the level's own pool, respecting its floors.
    const wanted = level.holdings?.exactly ?? 2;
    const required = level.holdings?.required ?? [];
    for (const ticker of required) if (!round.hasPick(ticker)) round.togglePick(ticker);
    for (const ticker of round.pool) {
      if (round.picks.length >= wanted) break;
      if (!round.hasPick(ticker) && round.canAddPick()) round.togglePick(ticker);
    }
  }
  if (round.state === 'build') round.toGuess();
  round.setGuess(guess);
  round.reveal(ctx.game);
  ctx.finish(round);
  return round;
}

/** Play all three of level 7's portfolios. */
function playSeries(ctx, guess = 2) {
  ctx.startRound(7);
  for (let i = 0; i < ctx.series.count; i += 1) {
    const round = ctx.series.current();
    round.setGuess(guess);
    round.reveal(ctx.game);
    if (ctx.series.hasNext()) ctx.series.advance();
  }
  return ctx.series;
}

// --- level 2: one record per locked guess -----------------------------------

test('level 2 produces exactly one record per locked guess', async () => {
  const b = browser();
  try {
    const ctx = await mountLearn(b.root);
    assert.deepEqual(ctx.records, [], 'a record existed before anything was played');

    play(ctx, 2, 2.5);
    assert.equal(ctx.records.length, 1, 'level 2 did not produce exactly one record');
    assert.equal(ctx.records[0].level, 2);

    // A second round of the same level is a second guess, and a second record.
    play(ctx, 2, 3);
    assert.equal(ctx.records.length, 2);
    assert.deepEqual(ctx.records.map((r) => r.level), [2, 2]);
  } finally { b.restore(); }
});

test('revealing a revealed round again does not produce a second record', async () => {
  const b = browser();
  try {
    const ctx = await mountLearn(b.root);
    const round = play(ctx, 2, 2.5);
    assert.equal(ctx.records.length, 1);
    // reveal() is idempotent - a redraw calls it - but the record is not.
    round.reveal(ctx.game);
    round.reveal(ctx.game);
    assert.equal(ctx.records.length, 1, 'a redraw produced extra records');
  } finally { b.restore(); }
});

test('a record carries the five registered fields and nothing else', async () => {
  const b = browser();
  try {
    const ctx = await mountLearn(b.root);
    ctx.today = () => '2026-11-26';
    play(ctx, 2, 2.5);
    const record = ctx.records[0];

    assert.deepEqual(Object.keys(record).sort(), RECORD_FIELDS,
      'a record carries something other than the five fields PREREG.md registers');
    assert.equal(typeof record.id, 'string');
    assert.equal(record.id.length, 32);
    assert.equal(record.level, 2);
    assert.equal(record.guess, 2.5);
    assert.equal(Number.isFinite(record.actual), true);
    assert.equal(record.date, '2026-11-26');

    // NO TICKERS AND NO AMOUNTS, checked against the whole universe rather than
    // against a couple of examples.
    const asText = JSON.stringify(record);
    for (const ticker of UNIVERSE) {
      assert.ok(!asText.includes(`"${ticker}"`), `${ticker} reached a record`);
    }
    assert.ok(!/dollars|tickers|weights|holdings/.test(asText), `a holding field reached a record: ${asText}`);
  } finally { b.restore(); }
});

// --- level 7: one record per part -------------------------------------------

test('level 7 produces one record per portfolio, in portfolio order', async () => {
  const b = browser();
  try {
    const ctx = await mountLearn(b.root);
    const series = playSeries(ctx);
    assert.equal(ctx.records.length, 3, 'level 7 did not produce three records');
    assert.deepEqual(ctx.records.map((r) => r.level), [7, 7, 7]);
    // The order is the order the portfolios were answered in, which is the only
    // thing telling three level-7 rows apart.
    assert.deepEqual(ctx.records.map((r) => r.actual), series.records.map((r) => r.actual));
    for (const record of ctx.records) {
      assert.deepEqual(Object.keys(record).sort(), RECORD_FIELDS);
    }
  } finally { b.restore(); }
});

test('the two levels Hypothesis 3 pairs are the two that record', () => {
  assert.deepEqual([...RECORDING_LEVELS].sort(), [2, 7],
    'the recording levels are not the pair PREREG.md registers');
});

// --- every other level and mode: nothing ------------------------------------

for (const levelId of [1, 3, 4, 5, 6]) {
  test(`level ${levelId} produces no record`, async () => {
    const b = browser();
    try {
      const ctx = await mountLearn(b.root);
      const level = LEVELS.levels.find((l) => l.id === levelId);
      // A guess inside the level's own range, so the round is a real round.
      play(ctx, levelId, (level.guess.min + level.guess.max) / 2);
      assert.deepEqual(ctx.records, [],
        `level ${levelId} is no part of Hypothesis 3 and must send nothing`);
    } finally { b.restore(); }
  });
}

test('the weekly challenge produces no record', async () => {
  const b = browser();
  try {
    const ctx = await mountWeekly(b.root, { now: '2026-12-02' });
    ctx.guess(2);
    ctx.reveal();
    // The weekly is not a level, is not drawn from the registered pool, and is
    // played by everybody in the same week - it is no part of the comparison.
    assert.equal(ctx.records, undefined, 'the weekly collects records');
    assert.equal(ctx.state().round.state, 'reveal', 'the week was not actually played');
    assert.deepEqual(b.sent.filter((s) => !s.startsWith('fetch')), [],
      'the weekly sent something');
  } finally { b.restore(); }
});

test('Sandbox and My real portfolio produce no record: they have no guess', async () => {
  for (const [name, mount] of [['sandbox', mountSandbox], ['mine', mountMyPortfolio]]) {
    const b = browser();
    try {
      const ctx = await mount(b.root);
      assert.equal(ctx.records, undefined, `${name} collects records`);
      assert.equal(ctx.record, undefined, `${name} has a record collector`);
    } finally { b.restore(); }
  }
});

// --- the per-browser ID -----------------------------------------------------

test('every record from one browser carries the same ID', async () => {
  const b = browser();
  try {
    const ctx = await mountLearn(b.root);
    play(ctx, 2, 2.5);
    playSeries(ctx);
    const ids = new Set(ctx.records.map((r) => r.id));
    assert.equal(ids.size, 1, 'one browser produced records under more than one ID');
    assert.equal(ctx.records.length, 4, 'expected one level-2 record and three level-7 ones');
  } finally { b.restore(); }
});

test('the ID is stored under its own key, never inside the progress record', async () => {
  const b = browser();
  try {
    const ctx = await mountLearn(b.root);
    play(ctx, 2, 2.5);
    assert.ok(b.store[PARTICIPANT_KEY], 'the ID was not stored');
    assert.notEqual(PARTICIPANT_KEY, PROGRESS_KEY);
    // js/progress.js voids a record carrying any key it does not expect, so an
    // ID living inside it would void a player's stars.
    const progress = JSON.parse(b.store[PROGRESS_KEY] ?? '{}');
    assert.ok(!('id' in progress), 'the ID is inside the progress record');
    assert.deepEqual(Object.keys(progress).sort(), ['levels', 'version']);
  } finally { b.restore(); }
});

test('resetting progress does not make the player a new participant', async () => {
  const b = browser();
  try {
    const ctx = await mountLearn(b.root);
    play(ctx, 2, 2.5);
    const before = ctx.records[0].id;

    // Reset progress exactly as a player does it: the menu's first click asks,
    // and the second one clears. Driven through the buttons because the reset is
    // a screen, not a method - see js/game.js's resetRow().
    ctx.toMenu();
    b.root.querySelector('reset-progress').click();
    b.root.querySelector('reset-confirm').click();
    assert.equal(b.store[PROGRESS_KEY], undefined, 'the stars were not cleared');
    assert.notEqual(b.store[PARTICIPANT_KEY], undefined,
      'Reset progress cleared the participant ID');

    playSeries(ctx);
    const after = ctx.records[ctx.records.length - 1].id;
    assert.equal(after, before,
      'a reset split one player into two, and the sign test would never pair them');
  } finally { b.restore(); }
});

test('resetting progress does not re-deal a pool portfolio this browser has already seen', async () => {
  const b = browser();
  try {
    const ctx = await mountLearn(b.root);
    const round = play(ctx, 2, 2.5);
    const drawnId = round.drawnId;
    assert.ok(drawnId, 'level 2 did not draw a pool portfolio');
    assert.ok(b.store[SEEN_POOL_KEY], 'nothing was stored for the seen pool');

    ctx.toMenu();
    b.root.querySelector('reset-progress').click();
    b.root.querySelector('reset-confirm').click();
    assert.equal(b.store[PROGRESS_KEY], undefined, 'the stars were not cleared');
    assert.notEqual(b.store[SEEN_POOL_KEY], undefined,
      'Reset progress cleared the seen pool, which would hand back a portfolio whose answer is already known');
    assert.match(b.store[SEEN_POOL_KEY], new RegExp(drawnId),
      'the specific portfolio level 2 drew is no longer remembered');
  } finally { b.restore(); }
});

test('a browser that cannot store still plays, and still pairs within the visit', async () => {
  const b = browser();
  try {
    // A storage that reads nothing and keeps nothing, which is a blocked browser.
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    const ctx = await mountLearn(b.root);
    play(ctx, 2, 2.5);
    assert.equal(ctx.records.length, 1);
    assert.equal(ctx.records[0].id.length, 32, 'no ID was made at all');
  } finally { b.restore(); }
});

test('the ID is random, hex and 128 bits', () => {
  const ids = new Set(Array.from({ length: 200 }, () => newId()));
  assert.equal(ids.size, 200, 'newId() repeated itself');
  for (const id of ids) assert.match(id, /^[0-9a-f]{32}$/);
});

test('a stored ID that is not usable is replaced, not trusted', () => {
  for (const bad of [null, {}, { version: 2, id: 'a'.repeat(32) }, { version: 1, id: 'nope' },
    { version: 1, id: 'Z'.repeat(32) }]) {
    const store = { [PARTICIPANT_KEY]: JSON.stringify(bad) };
    const restore = withDocument({
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
      },
    });
    try {
      const { id, fresh } = participantId();
      assert.match(id, /^[0-9a-f]{32}$/, `a bad record gave the id ${id}`);
      assert.equal(fresh, true, 'a bad record was trusted');
    } finally { restore(); }
  }
});

// --- what is sent, and what still is not ------------------------------------
//
// This block used to assert that Learn sent NOTHING by any route, which was
// right for as long as there was nowhere to send to. The Worker exists now
// (BUILD_LOG.md session 2.29), so the assertion flips to the precise version
// of the same promise: these exact requests go out, and nothing else does.
// Every other mode keeps the original assertion, in its own test file.

/** Just the Worker sends from `b.sent`, in the order they went. */
function workerSends(sent) {
  return sent
    .filter((line) => line.startsWith('fetch ') && line.includes('/one-trade-worker'))
    .map((line) => {
      const [, url, ...rest] = line.split(' ');
      return { url, body: rest.join(' ') ? JSON.parse(rest.join(' ')) : null };
    });
}

test('Learn sends exactly the pings and guess records, and nothing else', async () => {
  const b = browser();
  try {
    const ctx = await mountLearn(b.root);

    // Everything up to here is the data files, which are "prices come in".
    assert.deepEqual([...b.asked].sort(), DATA_FILES);
    const sentOnTheWayIn = b.sent.length;

    // Play a level of every shape: a correlation, the recorded pool level, a
    // built portfolio, a beta with a required holding, a risk share, a replay,
    // and the three-portfolio series.
    for (const id of [1, 2, 3, 4, 5, 6]) {
      const level = LEVELS.levels.find((l) => l.id === id);
      play(ctx, id, (level.guess.min + level.guess.max) / 2);
    }
    playSeries(ctx);
    ctx.finishSeries();
    ctx.toMenu();

    const after = b.sent.slice(sentOnTheWayIn);
    const worker = workerSends(after);

    // NOTHING BUT THE WORKER. Every other exit a browser has - beacon, XHR,
    // image, websocket, SSE, clipboard, share - is still watched by browser()
    // and must still be untouched, and no data file may be refetched.
    assert.equal(worker.length, after.length,
      `something left the browser that was not a ping or a guess: ${after.join(' | ')}`);
    // `asked` counts the Worker sends too now, so the data files are what is
    // left once those are set aside - the same promise, narrowed to its point.
    const dataAsks = b.asked.filter((url) => !url.includes('/one-trade-worker'));
    assert.deepEqual([...dataAsks].sort(), DATA_FILES, 'a data file was refetched during play');
    assert.deepEqual(b.urlChanges, [], `the URL was changed: ${b.urlChanges.join(', ')}`);

    // ONE PING PER LEVEL REACHED, each exactly once despite seven startRound()
    // calls plus a series that re-enters level 7.
    const pings = worker.filter((r) => r.url.endsWith('/ping'));
    assert.deepEqual(pings.map((r) => r.body.level), [1, 2, 3, 4, 5, 6, 7],
      'a level was pinged twice, or not at all');
    // AND NOTHING ON A PING BUT THE LEVEL, THE FLAG AND THE SOURCE CODE. No
    // per-browser id has ever ridden on a ping and none may start to: a ping
    // counts a visit, and the moment it could be tied to a person the success
    // targets would be measuring something docs/PRD.md does not promise.
    for (const { body } of pings) {
      assert.deepEqual(Object.keys(body).sort(), ['level', 'passed'],
        `a ping carried the wrong fields: ${JSON.stringify(body)}`);
      assert.equal(typeof body.passed, 'boolean');
    }

    // ONE GUESS PER LOCKED GUESS, on levels 2 and 7 only: one from level 2,
    // three from the series, in that order.
    const guesses = worker.filter((r) => r.url.includes('/guess'));
    assert.deepEqual(guesses.map((r) => r.body.level), [2, 7, 7, 7],
      'the guess records are not one-per-locked-guess in portfolio order');
    assert.equal(guesses.length, ctx.records.length,
      'the rows kept in memory and the rows sent disagree');

    // AND STILL ONLY THE FIVE REGISTERED FIELDS, on every row that went out.
    for (const { body } of guesses) {
      assert.deepEqual(Object.keys(body).sort(), RECORD_FIELDS,
        `a sent record carried the wrong fields: ${JSON.stringify(body)}`);
    }
    const ids = new Set(guesses.map((r) => r.body.id));
    assert.equal(ids.size, 1, 'one browser sent records under more than one ID');
  } finally { b.restore(); }
});

test("a ping says whether everything before that level had been passed", async () => {
  // WHAT TWO SUCCESS TARGETS NOW REST ON. Since session 2.38 a level unlocks by
  // being played, so reaching level 4 no longer implies passing level 3, and
  // docs/PRD.md measures "players who finish level 3" by level 4's pings. The
  // flag is what keeps that row meaning what it says.
  const b = browser();
  try {
    const ctx = await mountLearn(b.root);
    const pingsSince = (from) => workerSends(b.sent.slice(from))
      .filter((r) => r.url.endsWith('/ping'))
      .map((r) => r.body);

    // Level 1 finished and MISSED. Level 2 is unlocked all the same, and its
    // ping says the ladder behind it is not clean.
    ctx.progress = recordLevel(ctx.progress, 1, { stars: 0, error: 2.0 });
    let before = b.sent.length;
    ctx.startRound(2);
    assert.deepEqual(pingsSince(before), [{ level: 2, passed: false }]);

    // The same level 2, reached by a player who passed level 1.
    ctx.progress = recordLevel(ctx.progress, 1, { stars: 2, error: 0.3 });
    ctx.session.pingedLevels.delete(2);
    before = b.sent.length;
    ctx.startRound(2);
    assert.deepEqual(pingsSince(before), [{ level: 2, passed: true }]);

    // Level 1 itself: nothing stands before it, so the flag is true and says
    // nothing about skill.
    ctx.session.pingedLevels.delete(1);
    before = b.sent.length;
    ctx.startRound(1);
    assert.deepEqual(pingsSince(before), [{ level: 1, passed: true }]);
  } finally { b.restore(); }
});

test('trying again with the same portfolio sends nothing and pings nothing', async () => {
  // Levels 3 to 6 send no guess record at all - RECORDING_LEVELS is 2 and 7 -
  // so a retry cannot reach Hypothesis 3 by any route. Asserted rather than
  // reasoned about, because "it only sends on two levels" is exactly the kind
  // of thing a later change breaks quietly.
  const b = browser();
  try {
    const ctx = await mountLearn(b.root);
    play(ctx, 3, 2.0);
    const before = b.sent.length;
    const missed = ctx.round;

    ctx.retry(missed);
    assert.deepEqual(ctx.round.picks, missed.picks, 'the portfolio did not come back');
    assert.deepEqual(ctx.round.dollars, missed.dollars);
    ctx.round.toGuess();
    ctx.round.setGuess(2.5);
    ctx.round.reveal(ctx.game);
    ctx.finish(ctx.round);

    assert.equal(b.sent.length, before, `a retry sent something: ${b.sent.slice(before).join(' | ')}`);
    assert.equal(ctx.records.length, 0, 'a level 3 round produced a guess record');
  } finally { b.restore(); }
});

test('a retry is a second finished attempt, and is counted as one', async () => {
  // js/progress.js counts a try as a finished attempt that earned no star,
  // and the count is what the saved record keeps. A retry is a real attempt,
  // so it counts - a player who misses twice has missed twice.
  const b = browser();
  try {
    const ctx = await mountLearn(b.root);
    play(ctx, 3, 2.0);
    const after = triesOf(ctx.progress, 3);
    ctx.retry(ctx.round);
    ctx.round.toGuess();
    ctx.round.setGuess(2.5);
    ctx.round.reveal(ctx.game);
    ctx.finish(ctx.round);
    assert.equal(triesOf(ctx.progress, 3), after + 1, 'the retry was not counted as an attempt');
  } finally { b.restore(); }
});

test('a level played twice is pinged once, so a retry is not a second player', async () => {
  const b = browser();
  try {
    const ctx = await mountLearn(b.root);
    const before = b.sent.length;
    play(ctx, 1, 0.9);
    play(ctx, 1, 0.9);
    play(ctx, 1, 0.9);
    const pings = workerSends(b.sent.slice(before)).filter((r) => r.url.endsWith('/ping'));
    assert.deepEqual(pings.map((r) => r.body.level), [1], 'three attempts produced more than one ping');
  } finally { b.restore(); }
});

test('a ?src=playtest visit tags its guesses and its pings, all the way out', async () => {
  // Maya's own testing on the live site depends on exactly this: every guess
  // from a playtest session must carry the query parameter that sends it to
  // GUESSES_PLAYTEST instead of the dataset Hypothesis 3 reads.
  const b = browser({ search: '?src=playtest' });
  try {
    const ctx = await mountLearn(b.root);
    const before = b.sent.length;
    play(ctx, 2, 2.5);
    playSeries(ctx);
    const worker = workerSends(b.sent.slice(before));

    const guesses = worker.filter((r) => r.url.includes('/guess'));
    assert.equal(guesses.length, 4, 'expected one level-2 record and three level-7 ones');
    for (const { url, body } of guesses) {
      assert.ok(url.endsWith('/guess?src=playtest'), `a playtest guess went untagged: ${url}`);
      // AND THE TAG STAYS OUT OF THE RECORD. It is a query parameter, not a
      // sixth field - PREREG_AMENDMENT_3.md section 3.
      assert.deepEqual(Object.keys(body).sort(), RECORD_FIELDS);
    }

    // A ping carries it as a field instead, because for a ping it is the
    // measurement rather than a routing decision.
    const pings = worker.filter((r) => r.url.endsWith('/ping'));
    assert.ok(pings.length > 0, 'no pings were sent at all');
    for (const { body } of pings) assert.equal(body.src, 'playtest');
  } finally { b.restore(); }
});

test('a broken Worker changes nothing a player can see', async () => {
  // docs/PRD.md milestone 3 step 5, in its post-correction form: there is no
  // price fallback to test, because prices never went through the Worker. What
  // has to hold is that breaking it is invisible.
  const b = browser();
  const workingFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('/one-trade-worker')) throw new Error('Worker is down');
    return workingFetch(url, options);
  };
  try {
    const ctx = await mountLearn(b.root);
    const round = play(ctx, 2, 2.5);
    assert.equal(round.state, 'reveal', 'the round did not finish');
    assert.ok(round.result, 'there is no result to show');
    assert.equal(ctx.records.length, 1, 'the record was lost from memory, not just from the Worker');

    const series = playSeries(ctx);
    ctx.finishSeries();
    assert.equal(series.answers.length, 3, 'the capstone did not take all three guesses');
    assert.equal(ctx.records.length, 4, 'the series records were lost');

    // And the stars are saved exactly as they would have been.
    ctx.toMenu();
    assert.ok(starsOf(JSON.parse(b.store[PROGRESS_KEY]), 2) >= 1, 'level 2 did not pass');
  } finally {
    globalThis.fetch = workingFetch;
    b.restore();
  }
});

test('the records never reach the browser\'s storage either', async () => {
  const b = browser();
  try {
    const ctx = await mountLearn(b.root);
    play(ctx, 2, 2.5);
    playSeries(ctx);
    const stored = JSON.stringify(b.store);
    // A guess and an actual value are not holdings, but they are not progress
    // either, and the progress record is validated field by field.
    assert.ok(!stored.includes('"actual"'), 'a record was written to storage');
    assert.deepEqual(
      Object.keys(b.store).sort(), [PARTICIPANT_KEY, PROGRESS_KEY, SEEN_POOL_KEY].sort(),
      `the game wrote keys it should not: ${Object.keys(b.store).join(', ')}`,
    );
  } finally { b.restore(); }
});
