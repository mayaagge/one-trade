// tests/learnProgress.test.js - saved progress where a player meets it.
//
// tests/progress.test.js says what the record holds. This says what the LEVEL
// LIST does with it: the stars a player earned last week are on the screen, a
// level they have not reached yet cannot be started, and Reset asks before it
// takes anything away.
//
// Rendered through tests/stubDom.js against the real levels.json.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { StubNode, textOf, withDocument } from './stubDom.js';
import {
  HINT_AFTER_TRIES, levelHint, recordResult, renderMenu, newSession,
} from '../js/game.js';
import {
  PROGRESS_KEY, emptyProgress, recordLevel, loadProgress, saveProgress, triesOf,
} from '../js/progress.js';
import { validateLevels } from '../js/levels.js';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));
const LEVELS = validateLevels(readJson('levels.json'));
const GAME = readJson('data/game.json');
const IDS = LEVELS.levels.map((level) => level.id);

/** A document and a store for one render. */
function screen({ store = {} } = {}) {
  const restore = withDocument({
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
      removeItem: (key) => { delete store[key]; },
    },
  });
  return { store, restore };
}

/** Everything renderMenu() reads off its context. */
function context(progress, extra = {}) {
  const session = newSession(progress);
  return {
    levels: LEVELS,
    game: GAME,
    session,
    progress,
    // Set once at mount, the way mountLearn() sets it: writing the record we
    // just read back is harmless, and the answer is whether this browser saves.
    canSave: saveProgress(progress),
    started: [],
    startRound(id) { this.started.push(id); },
    redraw() {},
    ...extra,
  };
}

const cardFor = (view, id) => view.querySelectorAll('level-card')[IDS.indexOf(id)];
const playButton = (card) => card.all().find((node) => node.tagName === 'BUTTON' && /^(Play|Continue)/.test(node._text ?? ''));

test('a fresh browser sees level 1 open and the rest waiting', () => {
  const { restore } = screen();
  try {
    const view = renderMenu(context(emptyProgress()));
    assert.equal(playButton(cardFor(view, 1)).disabled, false);
    for (const id of IDS.slice(1)) {
      const button = playButton(cardFor(view, id));
      assert.equal(button.disabled, true, `level ${id} can be started before level ${id - 1}`);
    }
    assert.match(textOf(cardFor(view, 2)), /level 1/, 'a locked level does not say what opens it');
  } finally { restore(); }
});

test('saved stars are on the list when the browser comes back', () => {
  const { restore } = screen();
  try {
    let progress = recordLevel(emptyProgress(), 1, { stars: 3, error: 0.02 });
    progress = recordLevel(progress, 2, { stars: 1, error: 1.4 });
    const view = renderMenu(context(progress));
    const text = textOf(cardFor(view, 1));
    assert.match(text, /★★★|3/, `level 1's stars are not on its card: ${text}`);
    assert.match(textOf(cardFor(view, 2)), /★|1/);
    // Level 3 is open now, and says it has not been played.
    assert.equal(playButton(cardFor(view, 3)).disabled, false);
    assert.match(textOf(cardFor(view, 3)), /not played/);
  } finally { restore(); }
});

test('PASSING a level unlocks the next one on the very next render', () => {
  const { restore } = screen();
  try {
    const failed = recordLevel(emptyProgress(), 1, { stars: 0, error: 2.0 });
    const locked = renderMenu(context(failed));
    assert.equal(playButton(cardFor(locked, 2)).disabled, true,
      'a failed level 1 unlocked level 2');
    assert.match(cardFor(locked, 2).textContent, /Pass level 1 to unlock this one\./);

    const passed = recordLevel(failed, 1, { stars: 1, error: 0.4 });
    const open = renderMenu(context(passed));
    assert.equal(playButton(cardFor(open, 2)).disabled, false,
      'one star on level 1 did not unlock level 2');
    assert.ok(!/to unlock this one/.test(cardFor(open, 2).textContent),
      'an unlocked card still carries its lock note');
  } finally { restore(); }
});

test('the progress line counts passed levels, and the next one to play stands out', () => {
  const { restore } = screen();
  try {
    const fresh = renderMenu(context(emptyProgress()));
    assert.match(textOf(fresh), /0 of 7 passed/);
    // A brand new player has no level open but the first, so it is the one
    // "next to play" and gets the Continue treatment from the start.
    assert.equal(playButton(cardFor(fresh, 1))._text, 'Continue');
    assert.ok(cardFor(fresh, 1).classList.contains('level-card-continue'));
    for (const id of IDS.slice(1)) {
      assert.ok(!cardFor(fresh, id).classList.contains('level-card-continue'));
    }

    let progress = recordLevel(emptyProgress(), 1, { stars: 2, error: 0.3 });
    progress = recordLevel(progress, 2, { stars: 1, error: 1.1 });
    const view = renderMenu(context(progress));
    assert.match(textOf(view), /2 of 7 passed/);
    assert.equal(playButton(cardFor(view, 3))._text, 'Continue');
    assert.ok(cardFor(view, 3).classList.contains('level-card-continue'));
    assert.ok(!cardFor(view, 1).classList.contains('level-card-continue'));
    assert.equal(playButton(cardFor(view, 1))._text, 'Play again');
  } finally { restore(); }
});

test('once every level is passed, the progress line says so and nothing offers to continue', () => {
  const { restore } = screen();
  try {
    let progress = emptyProgress();
    for (const id of IDS) progress = recordLevel(progress, id, { stars: 1, error: 0.1 });
    const view = renderMenu(context(progress));
    assert.match(textOf(view), /All 7 passed/);
    for (const id of IDS) {
      assert.ok(!cardFor(view, id).classList.contains('level-card-continue'),
        `level ${id} still offered Continue after every level was passed`);
      assert.equal(playButton(cardFor(view, id))._text, 'Play again');
    }
  } finally { restore(); }
});

test('a level played and missed says so, instead of reading as never opened', () => {
  // THE BUG THIS IS HERE FOR. The card asked `stars ? starText(stars) : 'not
  // played'`, and a level played and failed scores 0 - which is falsy - so the
  // list told a player who had just failed level 1 three times that they had
  // never tried it. A 0 is a score, not an absence.
  const { restore } = screen();
  try {
    const progress = recordLevel(emptyProgress(), 1, { stars: 0, error: 2.0 });
    const card = cardFor(renderMenu(context(progress)), 1);
    const text = textOf(card);
    assert.ok(!/not played/.test(text), `a played level still reads as unplayed: ${text}`);
    assert.match(text, /no stars yet/);
    // "Continue" rather than "Play again", and that is right: under
    // pass-to-unlock a level that was missed is still the next one to play, so
    // the continue treatment wins over the replay wording. "Play again" is
    // asserted above, on a level that was passed and left behind.
    assert.equal(playButton(card)._text, 'Continue');
  } finally { restore(); }
});

test('three failed tries still read as played, and the hint does not change that', () => {
  const { restore } = screen();
  try {
    let progress = emptyProgress();
    for (let i = 0; i < HINT_AFTER_TRIES; i += 1) {
      progress = recordLevel(progress, 1, { stars: 0, error: 1.5 });
    }
    assert.equal(triesOf(progress, 1), HINT_AFTER_TRIES, 'the tries were not counted');
    assert.ok(!/not played/.test(textOf(cardFor(renderMenu(context(progress)), 1))));
  } finally { restore(); }
});

test('the best stars stand on the list, and a worse replay does not take them off it', () => {
  const { restore } = screen();
  try {
    let progress = recordLevel(emptyProgress(), 1, { stars: 3, error: 0.02 });
    progress = recordLevel(progress, 1, { stars: 1, error: 0.9 });
    assert.match(textOf(cardFor(renderMenu(context(progress)), 1)), /\u2605\u2605\u2605/);
  } finally { restore(); }
});

test("a finished round is on the list on the next draw, without a reload", () => {
  // "Updated as soon as a round ends" - through the same two calls js/game.js's
  // finish() makes, on one context, with no reload in between.
  const { restore } = screen();
  try {
    const ctx = context(emptyProgress());
    assert.match(textOf(cardFor(renderMenu(ctx), 1)), /not played/);

    recordResult(ctx.session, 1, { stars: 2, drawnId: null });
    ctx.progress = recordLevel(ctx.progress, 1, { stars: 2, error: 0.4 });

    const card = cardFor(renderMenu(ctx), 1);
    assert.match(textOf(card), /\u2605\u2605\u2606/, 'the stars just earned are not on the list');
    assert.equal(playButton(card)._text, 'Play again');
  } finally { restore(); }
});

test('a half-finished capstone is not on the list as played', () => {
  // Level 7's parts carry no stars of their own - three guesses decide the
  // level - and nothing is saved until the verdict. If the list drew the first
  // part as "played", a reload would take it off again, which is the same bug
  // this file's first case is about, one screen over.
  const { restore } = screen();
  try {
    let progress = emptyProgress();
    for (const id of IDS.slice(0, 6)) progress = recordLevel(progress, id, { stars: 1, error: 0.3 });
    const ctx = context(progress);

    recordResult(ctx.session, 7, { stars: null, drawnId: 'p03', drawnPool: 'guessPool' });

    assert.match(textOf(cardFor(renderMenu(ctx), 7)), /not played/);
    assert.deepEqual([...ctx.session.drawnPoolIds], ['guessPool:p03'],
      'the part\'s portfolio was forgotten, so level 7 could deal it twice');
  } finally { restore(); }
});

test('a locked card says "unlock", never "open"', () => {
  const { restore } = screen();
  try {
    const view = renderMenu(context(emptyProgress()));
    for (const id of [2, 3, 4, 5, 6, 7]) {
      const card = cardFor(view, id);
      assert.match(card.textContent, new RegExp(`Pass level ${id - 1} to unlock this one\\.`));
      assert.match(
        playButton(card).getAttribute('aria-label') ?? '',
        new RegExp(`Level ${id} unlocks when level ${id - 1} is passed`),
      );
    }
    // The word the brief retired, nowhere on the screen.
    assert.ok(!/\bopens?\b/i.test(view.textContent), 'the menu still says "open" somewhere');
  } finally { restore(); }
});

test('a locked level cannot be started, even by a caller', () => {
  const { restore } = screen();
  try {
    const ctx = context(emptyProgress());
    const view = renderMenu(ctx);
    playButton(cardFor(view, 5)).click();
    assert.deepEqual(ctx.started, [], 'a locked level started a round');
  } finally { restore(); }
});

// ------------------------------------------------------------------ reset

test('Reset asks first, and the first click takes nothing away', () => {
  const store = {};
  const { restore } = screen({ store });
  try {
    let progress = recordLevel(emptyProgress(), 1, { stars: 3, error: 0.1 });
    progress = recordLevel(progress, 2, { stars: 2, error: 0.3 });
    saveProgress(progress);

    const ctx = context(progress);
    const view = renderMenu(ctx);
    const reset = view.querySelector('reset-progress');
    assert.ok(reset, 'there is no Reset progress button');
    reset.click();

    // Still saved: the first click only asks.
    assert.ok(store[PROGRESS_KEY], 'the first click wiped the save without asking');
    const asking = renderMenu(ctx);
    assert.match(textOf(asking), /sure|really/i, 'the confirmation does not ask anything');
    assert.ok(asking.querySelector('reset-cancel'), 'there is no way to change your mind');
  } finally { restore(); }
});

test('confirming the reset clears the save and relocks the levels', () => {
  const store = {};
  const { restore } = screen({ store });
  try {
    let progress = emptyProgress();
    for (const id of IDS) progress = recordLevel(progress, id, { stars: 3, error: 0.01 });
    saveProgress(progress);

    const ctx = context(progress);
    renderMenu(ctx).querySelector('reset-progress').click();
    renderMenu(ctx).querySelector('reset-confirm').click();

    assert.ok(!(PROGRESS_KEY in store), 'the save is still there after confirming');
    const after = renderMenu(context(loadProgress()));
    assert.equal(playButton(cardFor(after, 1)).disabled, false);
    assert.equal(playButton(cardFor(after, 2)).disabled, true, 'the levels did not relock');
    assert.match(textOf(cardFor(after, 1)), /not played/);
  } finally { restore(); }
});

test('cancelling leaves everything where it was', () => {
  const store = {};
  const { restore } = screen({ store });
  try {
    const progress = recordLevel(emptyProgress(), 1, { stars: 3, error: 0.1 });
    saveProgress(progress);
    const ctx = context(progress);
    renderMenu(ctx).querySelector('reset-progress').click();
    renderMenu(ctx).querySelector('reset-cancel').click();
    assert.ok(store[PROGRESS_KEY], 'cancelling wiped the save anyway');
    assert.ok(!renderMenu(ctx).querySelector('reset-confirm'), 'the confirmation is still open');
  } finally { restore(); }
});

// ------------------------------------------------------- no storage at all

test('without storage the list still plays, and says progress is not kept', () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const previous = globalThis.localStorage;
  const restoreDoc = withDocument();
  delete globalThis.localStorage;
  try {
    const view = renderMenu(context(loadProgress()));
    assert.equal(playButton(cardFor(view, 1)).disabled, false);
    assert.match(textOf(view), /not be saved|cannot save|without saving/i,
      'a browser that cannot save is not told so');
  } finally {
    restoreDoc();
    if (had) globalThis.localStorage = previous;
  }
});

// ------------------------------------------------------------- the hint

test('a level offers its hint on the fourth attempt, not before', () => {
  const { restore } = screen();
  try {
    const level = LEVELS.levels.find((one) => one.id === 5);
    let progress = emptyProgress();
    const ctx = () => context(progress);

    assert.equal(levelHint(ctx(), level), null, 'a hint before anything was tried');
    for (const expected of [1, 2]) {
      progress = recordLevel(progress, 5, { stars: 0, error: 0.9 });
      assert.equal(triesOf(progress, 5), expected);
      assert.equal(levelHint(ctx(), level), null, `a hint after only ${expected} tries`);
    }
    progress = recordLevel(progress, 5, { stars: 0, error: 0.8 });
    assert.equal(triesOf(progress, 5), HINT_AFTER_TRIES);
    assert.equal(levelHint(ctx(), level), level.hint, 'no hint after three failed tries');
  } finally { restore(); }
});

test('every level carries a hint, and none of them names a winning portfolio', () => {
  // A HINT THAT NAMES A PORTFOLIO IS AN ANSWER KEY. The rule is checkable: a
  // hint may not contain a ticker this game carries, because a list of tickers
  // is what a winning design IS. It may talk about groups, headings and what
  // moves differently, which is the thinking the level is for.
  //
  // QQQ is the one exception, on level 4, and it is not a leak: the level's own
  // challenge line already says "Keep at least 30% in QQQ" and the build screen
  // deals it locked. Naming the holding the level forces gives nothing away
  // about the other three, which are the whole puzzle.
  const universe = readJson('tickers.json').groups
    .flatMap((group) => group.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
  const allowed = { 4: ['QQQ'] };

  for (const level of LEVELS.levels) {
    assert.equal(typeof level.hint, 'string', `level ${level.id} has no hint`);
    assert.ok(level.hint.length > 40, `level ${level.id}'s hint is too short to help`);
    const named = universe.filter((ticker) => new RegExp(`\\b${ticker}\\b`).test(level.hint));
    assert.deepEqual(
      named, allowed[level.id] ?? [],
      `level ${level.id}'s hint names ${named.join(', ')}, which is a portfolio rather than a direction`,
    );
  }
});

test('the hint reaches the build screen, and only once it is earned', () => {
  const { restore } = screen();
  try {
    const level = LEVELS.levels.find((one) => one.id === 3);
    const failedThrice = [1, 2, 3].reduce(
      (record) => recordLevel(record, 3, { stars: 0, error: 0.9 }), emptyProgress(),
    );
    assert.equal(levelHint(context(failedThrice), level), level.hint);
    // And a player who passed first time never sees it.
    const passed = recordLevel(emptyProgress(), 3, { stars: 3, error: 0.05 });
    assert.equal(levelHint(context(passed), level), null);
  } finally { restore(); }
});

// -------------------------------------------- what a locked card gives away
//
// READING IS 89% OF THE TIME TO FINISH LEVELS 1 TO 3 (BUILD_LOG.md session
// 2.33), and on a first visit six of the seven cards are locked - so the menu
// was handing a new player the full challenge text of six levels they are not
// allowed to start. The title and the one-word concept stay; the challenge
// waits until the level is unlocked.
//
// levels.json is NOT touched by this: both fields stay exactly as the PRD's
// level table states them, and tests/prdLevels.test.js still checks them.

const classText = (card, className) => card.all()
  .filter((n) => n.classList?.contains?.(className))
  .map((n) => n._text ?? '')
  .join(' ');

test('a locked card shows its concept but not its challenge', () => {
  const { restore } = screen();
  try {
    const view = renderMenu(context(emptyProgress()));
    for (const id of IDS.slice(1)) {
      const card = cardFor(view, id);
      const level = LEVELS.levels.find((l) => l.id === id);
      assert.equal(classText(card, 'level-concept'), level.concept,
        `level ${id} should still say what it is about`);
      assert.equal(classText(card, 'level-challenge'), '',
        `level ${id} is locked and should not spend a new player's reading on its challenge`);
    }
  } finally { restore(); }
});

test('level 1 is open on a fresh browser, so it shows its challenge', () => {
  const { restore } = screen();
  try {
    const card = cardFor(renderMenu(context(emptyProgress())), 1);
    const level = LEVELS.levels.find((l) => l.id === 1);
    assert.equal(classText(card, 'level-challenge'), level.challenge);
  } finally { restore(); }
});

test('passing a level reveals the next one\'s challenge', () => {
  const { restore } = screen();
  try {
    const progress = recordLevel(emptyProgress(), 1, { stars: 1, passed: true, guess: 0.9, value: 0.9 });
    const view = renderMenu(context(progress));
    const level2 = LEVELS.levels.find((l) => l.id === 2);
    assert.equal(classText(cardFor(view, 2), 'level-challenge'), level2.challenge,
      'level 2 is unlocked now and should say what it asks for');
    assert.equal(classText(cardFor(view, 3), 'level-challenge'), '',
      'level 3 is still locked');
  } finally { restore(); }
});
