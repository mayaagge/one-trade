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
import { recordResult, renderMenu, newSession } from '../js/game.js';
import {
  PROGRESS_KEY, emptyProgress, recordLevel, loadProgress, saveProgress, triesOf,
} from '../js/progress.js';
import { validateLevels } from '../js/levels.js';
import * as game from '../js/game.js';

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

test('FINISHING a level unlocks the next one on the very next render, pass or not', () => {
  const { restore } = screen();
  try {
    const fresh = renderMenu(context(emptyProgress()));
    assert.equal(playButton(cardFor(fresh, 2)).disabled, true, 'level 2 was open from the start');
    assert.match(cardFor(fresh, 2).textContent, /Play level 1 to unlock this one\./);

    // MISSED, NOT PASSED, and level 2 opens anyway - the whole of session 2.38.
    const failed = recordLevel(emptyProgress(), 1, { stars: 0, error: 2.0 });
    const open = renderMenu(context(failed));
    assert.equal(playButton(cardFor(open, 2)).disabled, false,
      'a finished level 1 did not unlock level 2');
    assert.ok(!/to unlock this one/.test(cardFor(open, 2).textContent),
      'an unlocked card still carries its lock note');
    // One level on, and no further.
    assert.equal(playButton(cardFor(open, 3)).disabled, true, 'it unlocked two levels at once');
  } finally { restore(); }
});

test('the menu says what unlocking costs, once, and does not say "pass"', () => {
  // A locked card names the level that unlocks it; this line says what counts
  // as unlocking it, which is the half a player cannot guess. It is stated
  // once rather than on each of six locked cards - on a first visit six of the
  // seven are locked, and reading is 89% of the time to finish levels 1 to 3.
  const { restore } = screen();
  try {
    const text = textOf(renderMenu(context(emptyProgress())));
    assert.match(text, /Finish one to unlock the next/);
    assert.match(text, /do not have to pass it/);
    assert.equal((text.match(/do not have to pass it/g) ?? []).length, 1, 'said more than once');
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
    // "Play again", because play-to-unlock has moved on past it: finishing
    // level 1 made level 2 the next one to play, so level 1 is a level to
    // replay rather than the one to continue with. Under the old rule a missed
    // level was still the frontier and this read "Continue".
    assert.equal(playButton(card)._text, 'Play again');
  } finally { restore(); }
});

test('three failed tries still read as played, and nothing offers help', () => {
  const { restore } = screen();
  try {
    let progress = emptyProgress();
    // Three, which is what the retired hint used to wait for. The count is
    // still kept - it costs nothing and a later feature may want it - but
    // nothing reads it now.
    for (let i = 0; i < 3; i += 1) {
      progress = recordLevel(progress, 1, { stars: 0, error: 1.5 });
    }
    assert.equal(triesOf(progress, 1), 3, 'the tries were not counted');
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
      assert.match(card.textContent, new RegExp(`Play level ${id - 1} to unlock this one\\.`));
      assert.match(
        playButton(card).getAttribute('aria-label') ?? '',
        new RegExp(`Level ${id} unlocks when level ${id - 1} is played`),
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

/** The text of every node in a card carrying a class, joined. */
const classText = (card, className) => card.all()
  .filter((n) => n.classList?.contains?.(className))
  .map((n) => n._text ?? '')
  .join(' ');

// ------------------------------------------------------- no hints, anywhere

test('no level carries a hint, and no build screen offers one', () => {
  // EVERY LEVEL'S HINT IS GONE, by decision (BUILD_LOG.md, player feedback
  // 6-and-the-hint-note). The ideas they carried moved to the two places a
  // player reads after trying or by choice: the "Why?" cards after a reveal,
  // and the About tab's "What each level teaches".
  for (const level of LEVELS.levels) {
    assert.equal(level.hint, undefined, `level ${level.id} still carries a hint`);
  }
  // And nothing in the game reads one any more.
  assert.equal(typeof game.levelHint, 'undefined', 'levelHint() is still exported');
  assert.equal(typeof game.HINT_AFTER_TRIES, 'undefined', 'HINT_AFTER_TRIES is still exported');
});

test('a level failed many times still shows no hint on its build screen', () => {
  const { restore } = screen();
  try {
    let progress = emptyProgress();
    for (let i = 0; i < 6; i += 1) progress = recordLevel(progress, 3, { stars: 0, error: 1.5 });
    assert.equal(triesOf(progress, 3), 6, 'the tries were not counted');
    const view = renderMenu(context(progress));
    const text = textOf(view);
    assert.ok(!/hint/i.test(text), `the word "hint" is on the menu: ${text}`);
  } finally { restore(); }
});

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
