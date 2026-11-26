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
import { renderMenu, newSession } from '../js/game.js';
import {
  PROGRESS_KEY, emptyProgress, recordLevel, loadProgress, saveProgress,
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
const playButton = (card) => card.all().find((node) => node.tagName === 'BUTTON' && /^Play/.test(node._text ?? ''));

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

test('playing a level opens the next one on the very next render', () => {
  const { restore } = screen();
  try {
    const progress = recordLevel(emptyProgress(), 1, { stars: 0, error: 2.0 });
    const view = renderMenu(context(progress));
    // Failed, and level 2 is open anyway: played, not passed.
    assert.equal(playButton(cardFor(view, 2)).disabled, false);
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
