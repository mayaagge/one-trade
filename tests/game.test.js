// tests/game.test.js - the parts of the Learn screens that are not DOM.
//
// js/game.js is mostly document-building, which needs a browser, and this
// project takes no new libraries (CLAUDE.md rule 8) so there is no jsdom to run
// it under. What CAN be tested in node is everything in that file which is a
// decision rather than a node: how fine the guess slider is, what the stars
// explanation says, and what the session remembers between rounds. Those are
// exported for exactly that reason.
//
// The screens themselves are checked by hand on a phone-width browser, and
// BUILD_LOG.md records what was looked at.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildReturns } from '../js/returns.js';
import { GAME_DAYS } from '../scripts/build_game_data.mjs';
import {
  validateLevels, bandsMet, levelById, passes, starsFor,
} from '../js/levels.js';
import { createRound } from '../js/round.js';
import {
  allPassedBefore,
  basketFrom,
  seenPoolIds,
  buildHint,
  gapSentence,
  guessPlaces,
  guessSliderState,
  guessStep,
  newSession,
  recordResult,
  revealLine,
  starText,
  starsExplanation,
} from '../js/game.js';
import { emptyProgress, recordLevel, starsOf } from '../js/progress.js';
import { validateCrashes } from '../js/crash.js';
import { textOf, withDocument } from './stubDom.js';
// The picker, the allocator and the money they are written in now live in
// js/build.js, shared with Crash replay.
import {
  floorNotes, money, tickerPicker, whatAreThese, pickedNames,
} from '../js/build.js';
import { describe as describeTicker, nameOf, validateNames } from '../js/names.js';
import { SEEN_POOL_KEY } from '../js/seenPool.js';

/** A localStorage for one test, and the teardown that takes it away again. Same pattern as tests/progress.test.js. */
function withStorage(store = {}) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
  };
  return () => {
    if (had) globalThis.localStorage = previous;
    else delete globalThis.localStorage;
  };
}

/** No localStorage at all, which is what some browsers do in private windows. */
function withoutStorage() {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const previous = globalThis.localStorage;
  delete globalThis.localStorage;
  return () => { if (had) globalThis.localStorage = previous; };
}

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));
const LEVELS = validateLevels(readJson('levels.json'));
const TICKERS = readJson('tickers.json');
const BASKET = readJson('basket.json').stocks.map((stock) => stock.ticker);
const UNIVERSE = TICKERS.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));

// Prices from the frozen snapshot, shaped like data/game.json: the round needs
// data to reveal, and the live file moves every weekday evening.
const GAME = (() => {
  const built = buildReturns(readJson('data/prices.json'));
  const tickers = built.tickers.slice().sort();
  const from = built.dates.length - GAME_DAYS;
  const dates = built.dates.slice(from);
  return {
    meta: { liveThrough: dates[dates.length - 1], firstDate: dates[0] },
    tickers,
    rows: dates.map((date, i) => [date, ...tickers.map((t) => built.byTicker[t][from + i])]),
  };
})();

// Level 6's own prices, which are history and never move.
const CRASHES = validateCrashes(readJson('data/crashes.json'));

/** A fresh round on a level, with the draw pinned. */
function round(levelId) {
  return createRound({
    levels: LEVELS,
    levelId,
    game: GAME,
    universe: UNIVERSE,
    basket: BASKET,
    crashes: CRASHES,
    random: () => 0,
  });
}

/** A round sitting on the guess screen, built and waiting for a guess. */
function atGuess(levelId, picks = []) {
  const r = createRound({ levels: LEVELS, levelId, game: GAME, universe: UNIVERSE, random: () => 0 });
  for (const ticker of picks) r.togglePick(ticker);
  return r.toGuess();
}

// ------------------------------------------------------------- the slider

test('the slider is in hundredths for a correlation and tenths for a bets count', () => {
  // Level 1 is scored to 0.10, so hundredths let a player aim inside the band.
  assert.equal(guessStep(levelById(LEVELS, 1)), 0.01);
  assert.equal(guessPlaces(levelById(LEVELS, 1)), 2);
  // Levels 2 and 3 are scored to half a bet.
  assert.equal(guessStep(levelById(LEVELS, 2)), 0.1);
  assert.equal(guessPlaces(levelById(LEVELS, 2)), 1);
  assert.equal(guessStep(levelById(LEVELS, 3)), 0.1);
});

test('every level has a slider step fine enough to reach its own third star', () => {
  // A band of 0.10 reachable only in steps of 0.5 would be a star nobody could
  // win. The step has to be at most the band it is aiming at.
  for (const level of LEVELS.levels) {
    if (level.stars.three.test !== 'within') continue;
    assert.ok(
      guessStep(level) <= level.stars.three.of,
      `level ${level.id}: step ${guessStep(level)} cannot hit a band of ${level.stars.three.of}`,
    );
  }
});

// ------------------------------------------------- the slider before a tap
//
// The guess slider shows no number AND no thumb until the player's first tap or
// drag, so there is nothing on the screen to anchor a guess on and nothing to
// confirm by accident. These tests are the behaviour; the thumb itself is hidden
// in css/style.css by the class named here.

test('no value is set before the player interacts with the slider', () => {
  const round = atGuess(1, ['VOO', 'VTI']);
  const state = guessSliderState(round);

  assert.equal(round.guess, null, 'the round holds no guess');
  assert.equal(round.hasGuessed(), false);
  assert.equal(state.blank, true);
  assert.equal(state.readout, '—', 'the screen shows no number');
  assert.equal(state.revealDisabled, true, 'Reveal stays disabled');
  assert.match(state.className, /guess-slider-blank/, 'the thumb and the track fill are hidden');
  assert.equal(state.valueText, 'no guess yet - tap the line to guess');
  assert.match(state.hint, /Tap anywhere on the line/);
});

test('the control rests at the midpoint, but nothing on the screen says so', () => {
  // A range input reports a value whether or not it has been touched, so the
  // resting position is the midpoint and is then hidden. What must not happen is
  // that resting position becoming the player's guess.
  const round = atGuess(1, ['VOO', 'VTI']);
  const state = guessSliderState(round);
  assert.equal(state.value, 0, 'halfway between -1 and 1');
  assert.equal(round.guess, null, 'and the round still has no guess');
  assert.throws(() => round.reveal(), /no guess has been made/);
});

test('the first interaction sets the value, shows it, and enables Reveal', () => {
  const round = atGuess(1, ['VOO', 'VTI']);
  round.setGuess(0.85);                       // what the input event does
  const state = guessSliderState(round);
  assert.equal(state.blank, false);
  assert.equal(state.readout, '0.85');
  assert.equal(state.revealDisabled, false);
  assert.equal(state.className, 'guess-slider');
  assert.equal(state.valueText, null, 'the screen reader hint is dropped once there is a value');
  assert.equal(state.hint, null);
  assert.equal(state.value, 0.85, 'the thumb now sits where the player put it');
});

test('a tap that lands exactly on the midpoint still counts as a guess', () => {
  // The one case a "has the thumb moved?" check would get wrong: a player who
  // taps the middle of the line has guessed, and the round must take it.
  const round = atGuess(1, ['VOO', 'VTI']);
  round.setGuess(0);
  const state = guessSliderState(round);
  assert.equal(state.blank, false);
  assert.equal(state.readout, '0.00');
  assert.equal(state.revealDisabled, false);
});

test('the slider state reads its range and step from the level, on every level', () => {
  const one = guessSliderState(atGuess(1, ['VOO', 'VTI']));
  assert.deepEqual([one.min, one.max, one.step], [-1, 1, 0.01]);

  const two = guessSliderState(atGuess(2));
  assert.deepEqual([two.min, two.max, two.step], [1, 6, 0.1]);
  assert.equal(two.value, 3.5, 'halfway between 1 and 6 bets');
  assert.equal(two.blank, true, 'a dealt portfolio still gets a blank slider');

  const three = guessSliderState(atGuess(3, ['VOO', 'BND', 'GLD', 'XOM', 'JNJ']));
  assert.deepEqual([three.min, three.max, three.step], [1, 5, 0.1]);
});

test('a guess carried back from a reveal is shown, not blanked', () => {
  // Going back to the build throws the guess away, but a re-render of the same
  // guess screen must not: a redraw is not an interaction.
  const round = atGuess(3, ['VOO', 'BND', 'GLD', 'XOM', 'JNJ']);
  round.setGuess(2.5);
  assert.equal(guessSliderState(round).readout, '2.5');
  round.toBuild();
  round.toGuess();
  assert.equal(guessSliderState(round).blank, true, 'a changed build deserves a fresh guess');
});

// -------------------------------------------------------------- the stars

test('starText always shows three stars, filled and empty', () => {
  assert.equal(starText(0), '☆☆☆');
  assert.equal(starText(1), '★☆☆');
  assert.equal(starText(2), '★★☆');
  assert.equal(starText(3), '★★★');
});

test('a failed level says what the level needed, in the words levels.json uses', () => {
  const level = levelById(LEVELS, 3);
  const text = starsExplanation(level, { passed: false, stars: 0 });
  assert.match(text, /No stars this time/);
  assert.match(text, /at least 3 effective bets/, "the level's own pass.says, not a number typed here");
});

test('a 1-star reveal says what 2 stars would have needed', () => {
  const level = levelById(LEVELS, 3);
  const text = starsExplanation(level, { passed: true, stars: 1 });
  assert.match(text, /1 star for at least 3 effective bets/);
  assert.match(text, /2 stars needed within 1 bet/);
});

test('a 3-star reveal names all three bands and asks for nothing more', () => {
  // Level 3's bands nest - within half a bet IS within 1 bet - so both are met
  // and both are named.
  const level = levelById(LEVELS, 3);
  const text = starsExplanation(level, { passed: true, stars: 3, guess: 3.2, value: 3.0 });
  assert.match(text, /2 for within 1 bet/);
  assert.match(text, /3 for within half a bet/);
  assert.doesNotMatch(text, /needed/);
  assert.doesNotMatch(text, /missed it/, 'a nested band cannot be skipped');
});

test("the explanation for level 1 uses its own distances, not a bets band", () => {
  // Level 1's bands are 0.20 and 0.10, not the 1 and 0.5 a bets count uses -
  // on a correlation from -1 to 1 those would hand out two and three stars for
  // any guess at all. 0.13 out: inside 0.20, outside 0.10.
  const text = starsExplanation(levelById(LEVELS, 1), {
    passed: true, stars: 2, guess: 0.85, value: 0.98,
  });
  assert.match(text, /2 for within 0\.20 of the real correlation/);
  assert.match(text, /3 stars needed within 0\.10 of the real correlation/);
  // The bucket is no longer part of the scoring, so it is not part of the
  // sentence either - it is on the reveal's own bucket line instead.
  assert.ok(!/bucket/.test(text), `the bucket is back in the star sentence: ${text}`);
});

test('no shipped level can strand its two-star band any more', () => {
  // PLAYER FEEDBACK 3 FOUND IT, PLAYER FEEDBACK 4 REMOVED IT. A level could
  // strand its two-star band only when that band was a bucket AND its pass
  // threshold sat on a bucket edge: a passing answer lands just inside the
  // edge and a close guess just outside it. That was levels 4, 5 and 6, and
  // the amendment of 27 November 2026 gave all three a distance instead.
  // Level 1 keeps its bucket and never could - its threshold of 0.80 is above
  // its top edge of 0.70, so a guess within 0.10 of a passing answer is in the
  // same bucket as it.
  //
  // Swept over every guess each slider can produce, against every answer on a
  // half-step grid, rather than sampled: the sliders are discrete and small.
  const reachable = [];
  for (const level of LEVELS.levels) {
    if (!Array.isArray(level.buckets)) continue;
    const { min, max, step } = level.guess;
    let found = null;
    for (let actual = min; actual <= max + 1e-9 && !found; actual += step / 2) {
      if (!passes(level, actual)) continue;
      for (let guess = min; guess <= max + 1e-9 && !found; guess += step) {
        const met = bandsMet(level, { guess, actual });
        if (met.three && !met.two) found = { actual, guess };
      }
    }
    if (found) reachable.push({ id: level.id, ...found });
  }
  assert.deepEqual(reachable, [],
    `a level can still earn three stars while missing its two-star band: ${JSON.stringify(reachable)}`);
});

test('the sentence still handles a stranded band, for a level that had one', () => {
  // THE BRANCH IS DORMANT, NOT DEAD, and it is tested on a hand-built level
  // for exactly that reason: nothing shipped can reach it today, and the day
  // somebody gives a level a bucket two-star band beside a distance three-star
  // one, the bug player feedback 3 found comes straight back. This level is
  // level 5 as it was registered, before the amendment.
  const asRegistered = {
    ...levelById(LEVELS, 5),
    stars: {
      pass: 1,
      two: { test: 'bucket', says: 'naming the right bucket' },
      three: { test: 'within', of: 0.05, says: 'within 5 points of the real share' },
    },
  };
  const result = { passed: true, guess: 0.35, value: 0.32 };
  const stars = starsFor(asRegistered, { guess: result.guess, actual: result.value, passed: true });
  assert.equal(stars, 3, 'the tight band no longer earns three on its own');
  assert.deepEqual(bandsMet(asRegistered, { guess: result.guess, actual: result.value }),
    { two: false, three: true });

  const text = starsExplanation(asRegistered, { ...result, stars });
  assert.match(text, /3 for within 5 points of the real share/);
  assert.ok(!/2 for naming the right bucket/.test(text),
    `the screen still credits a bucket this guess missed: ${text}`);
  assert.match(text, /the tight band earns all three on its own/);
  assert.doesNotMatch(text, /needed/);
});

test('level 5 now scores the same error the same way in both directions', () => {
  // WHAT PLAYER FEEDBACK 4 WAS ABOUT, as one assertion. Level 5's passing
  // answers have a median of 0.3302 against a bucket edge at 0.35, so under
  // the registered rule a guess 6 points high scored 1 star and a guess 6
  // points low scored 2. The same error, punished differently, and the high
  // one is the direction a beginner errs.
  const level = levelById(LEVELS, 5);
  const actual = 0.3302;
  for (const error of [0.06, 0.08, 0.10]) {
    const high = starsFor(level, { guess: actual + error, actual, passed: true });
    const low = starsFor(level, { guess: actual - error, actual, passed: true });
    assert.equal(high, low, `an error of ${error} scores ${high} high and ${low} low`);
    assert.equal(high, 2, `an error of ${error} should be inside the two-star band of 0.10`);
  }
  // And the three-star band is untouched by the amendment.
  assert.equal(starsFor(level, { guess: actual + 0.04, actual, passed: true }), 3);
  assert.equal(starsFor(level, { guess: actual - 0.04, actual, passed: true }), 3);
});

// ------------------------------------------------------------- the picker

/** The least a build has to be for tickerPicker() to draw it. */
function stubBuild(pool, picks = []) {
  const held = new Set(picks);
  return {
    pool,
    required: [],
    hasPick: (ticker) => held.has(ticker),
    canAddPick: () => true,
    togglePick: (ticker) => (held.has(ticker) ? held.delete(ticker) : held.add(ticker)),
  };
}

const GROUPS = TICKERS.groups;
const chipsOf = (node) => node.querySelectorAll('chip').map((chip) => chip._text);

test('a flat picker is one alphabetical list with no group headings', () => {
  // PLAYER FEEDBACK 1 OF 16. The headings are a map of which holdings move
  // together, and level 1 is the level that asks a player to find that out
  // from the prices. "Core US funds" written over VOO and VTI hands them the
  // answer instead.
  const restore = withDocument();
  try {
    const pool = levelById(LEVELS, 1).pool;
    const node = tickerPicker(stubBuild(pool), {
      groups: GROUPS, redraw: () => {}, grouped: false,
    });
    assert.equal(node.querySelectorAll('picker-group-label').length, 0, 'a heading survived');
    assert.equal(node.querySelectorAll('picker-group').length, 1, 'more than one section');
    assert.deepEqual(chipsOf(node), [...pool].sort((a, b) => a.localeCompare(b)));
  } finally { restore(); }
});

test('a flat picker still carries every chip id focus depends on', () => {
  // js/screen.js finds the control a player just tapped by its id across a
  // redraw, because a chip is announced as "Add GLD" and then "Remove GLD" -
  // the label changes and the id does not. Dropping the sections must not
  // drop those.
  const restore = withDocument();
  try {
    const pool = levelById(LEVELS, 1).pool;
    const node = tickerPicker(stubBuild(pool, ['GLD']), {
      groups: GROUPS, redraw: () => {}, grouped: false,
    });
    for (const ticker of pool) {
      assert.ok(node.querySelector(`[id="chip-${ticker}"]`), `no chip id for ${ticker}`);
    }
    const gld = node.querySelector('[id="chip-GLD"]');
    assert.equal(gld.getAttribute('aria-pressed'), 'true');
    assert.equal(gld.getAttribute('aria-label'), 'Remove GLD');
  } finally { restore(); }
});

test('a grouped picker keeps its headings, which is every other level', () => {
  const restore = withDocument();
  try {
    const node = tickerPicker(stubBuild(UNIVERSE), { groups: GROUPS, redraw: () => {} });
    const headings = node.querySelectorAll('picker-group-label').map((n) => n._text);
    assert.deepEqual(headings, GROUPS.map((group) => group.label));
    // And grouped is the default, so a caller that says nothing gets headings.
    assert.equal(chipsOf(node).length, UNIVERSE.length);
  } finally { restore(); }
});

test('only level 1 asks for a flat picker, and it says why in the file', () => {
  // The flag is data, not a condition in js/game.js, so a reader of
  // levels.json can see which level hides its headings and for what reason.
  const flat = LEVELS.levels.filter((level) => level.picker?.grouped === false);
  assert.deepEqual(flat.map((level) => level.id), [1]);
  assert.match(flat[0].pickerNote, /alphabetical/);
  for (const level of LEVELS.levels) {
    if (level.id === 1) continue;
    assert.equal(level.picker, undefined, `level ${level.id} now has a picker rule`);
  }
});

// --------------------------------------------------- what each ticker is

const NAMES = validateNames(readJson('names.json'));

test('"What are these?" lists the pool alphabetically, with no sector anywhere', () => {
  // On level 1 this sits on the same screen as a picker whose group headings
  // were deliberately removed. A list ordered or labelled by group would hand
  // back exactly what the headings were hiding.
  const restore = withDocument();
  try {
    const pool = levelById(LEVELS, 1).pool;
    const node = whatAreThese(NAMES, pool);
    const tickers = node.querySelectorAll('glossary-row').map((row) => row.all()
      .find((n) => n.tagName === 'DT')._text);
    assert.deepEqual(tickers, [...pool].sort((a, b) => a.localeCompare(b)));
    const text = textOf(node);
    for (const group of TICKERS.groups) {
      assert.ok(!text.includes(group.label), `the glossary names the group "${group.label}"`);
    }
    // Closed by default: reading is 89% of the time to finish levels 1 to 3,
    // and a player who knows what VOO is should pay nothing for one who does not.
    assert.equal(node.tagName, 'DETAILS');
    assert.equal(node.attributes.open, undefined);
  } finally { restore(); }
});

test('"What are these?" describes only what this screen can offer', () => {
  const restore = withDocument();
  try {
    const node = whatAreThese(NAMES, ['GLD', 'VOO']);
    assert.equal(node.querySelectorAll('glossary-row').length, 2);
    const text = textOf(node);
    assert.ok(text.includes('SPDR Gold Shares'));
    assert.ok(!text.includes('NVIDIA'), 'it described a holding this screen cannot offer');
  } finally { restore(); }
});

test('the holdings a player has picked are named, in the order they hold them', () => {
  const restore = withDocument();
  try {
    const build = stubBuild(['VOO', 'GLD', 'BND'], []);
    build.picks = ['GLD', 'VOO'];
    const node = pickedNames(build, NAMES);
    const text = textOf(node);
    assert.ok(text.includes('SPDR Gold Shares'));
    assert.ok(text.includes('Vanguard S&P 500 ETF'));
    assert.ok(text.includes('(gold)') && text.includes('(stock fund)'));
    assert.equal(node.querySelectorAll('picked-name').length, 2);
  } finally { restore(); }
});

test('nothing picked and no names file both come back as nothing to draw', () => {
  const restore = withDocument();
  try {
    const empty = stubBuild(['VOO'], []);
    empty.picks = [];
    assert.equal(pickedNames(empty, NAMES), null, 'an empty heading helps nobody');
    const held = stubBuild(['VOO'], []);
    held.picks = ['VOO'];
    // A file that would not load is not a reason to stop playing: the screen
    // falls back to the bare symbols it showed before this file existed.
    assert.equal(pickedNames(held, null), null);
    assert.equal(whatAreThese(null, ['VOO']), null);
    assert.equal(nameOf(null, 'VOO'), 'VOO', 'the fallback is the ticker itself');
  } finally { restore(); }
});

test('a level whose rule is about kinds marks the four that are not stocks', () => {
  // Level 6 asks for 60% of the money in stocks, and until this there was no
  // way to know BND is not one except by knowing already.
  const restore = withDocument();
  try {
    const pool = ['VOO', 'BND', 'GLD', 'NVDA'];
    const marked = tickerPicker(stubBuild(pool), {
      groups: GROUPS, redraw: () => {}, names: NAMES, markKinds: true,
    });
    const labels = marked.querySelectorAll('chip').map((chip) => chip._text).sort();
    assert.deepEqual(labels, ['BND bond', 'GLD gold', 'NVDA', 'VOO']);

    // THE WORD, NOT ONLY THE COLOUR. The class is there too, and the test
    // holds both: colour alone would carry this for nobody who cannot see it.
    const bnd = marked.querySelector('[id="chip-BND"]');
    assert.ok(bnd.className.includes('chip-other-kind'));
    const voo = marked.querySelector('[id="chip-VOO"]');
    assert.ok(!voo.className.includes('chip-other-kind'), 'a stock fund is a stock here');

    // And every other level leaves the chips alone.
    const plain = tickerPicker(stubBuild(pool), {
      groups: GROUPS, redraw: () => {}, names: NAMES,
    });
    assert.deepEqual(plain.querySelectorAll('chip').map((c) => c._text).sort(),
      ['BND', 'GLD', 'NVDA', 'VOO']);
  } finally { restore(); }
});

test('a chip says its full name to a screen reader, not three letters', () => {
  const restore = withDocument();
  try {
    const node = tickerPicker(stubBuild(['BND']), {
      groups: GROUPS, redraw: () => {}, names: NAMES,
    });
    assert.equal(node.querySelector('[id="chip-BND"]').getAttribute('aria-label'),
      'Add BND, Vanguard Total Bond Market ETF');
  } finally { restore(); }
});

test('describe() works out the article rather than the file carrying it', () => {
  assert.equal(describeTicker(NAMES, 'GLD'), 'GLD - SPDR Gold Shares, a gold');
  assert.equal(describeTicker(NAMES, 'VOO'), 'VOO - Vanguard S&P 500 ETF, a stock fund');
  // The day a kind starts with a vowel, the screen must not read "a".
  const made = { tickers: { XX: { name: 'Something', kind: 'equity fund' } } };
  assert.equal(describeTicker(made, 'XX'), 'XX - Something, an equity fund');
});

// ------------------------------------------------- what a count ping carries

test('allPassedBefore is vacuously true on the first level', () => {
  // Nothing stands before level 1 to have been failed, and that is the honest
  // answer rather than a special case to code around.
  assert.equal(allPassedBefore(emptyProgress(), LEVELS.levels, 1), true);
});

test('allPassedBefore means EVERY earlier level, not just the one before', () => {
  // The difference only exists because of play-to-unlock: a player can walk
  // past a level they failed, so "level 3 was passed" and "levels 1 to 3 were
  // all passed" became different claims. docs/PRD.md's "players who reach
  // level 7" is the second one.
  let progress = emptyProgress();
  progress = recordLevel(progress, 1, { stars: 0, error: 2.0 });   // missed
  progress = recordLevel(progress, 2, { stars: 2, error: 0.3 });
  progress = recordLevel(progress, 3, { stars: 1, error: 0.8 });
  assert.equal(allPassedBefore(progress, LEVELS.levels, 4), false,
    'level 1 was missed, so not everything before level 4 was passed');

  const fixed = recordLevel(progress, 1, { stars: 1, error: 0.4 });
  assert.equal(allPassedBefore(fixed, LEVELS.levels, 4), true);
});

test('allPassedBefore on the capstone is the claim the success target makes', () => {
  // "Players who reach level 7: 60" is level 7's ping with this true, which is
  // the same sentence as "levels 1 to 6 were all passed".
  let progress = emptyProgress();
  for (const level of LEVELS.levels.slice(0, 6)) {
    progress = recordLevel(progress, level.id, { stars: 1, error: 0.2 });
  }
  assert.equal(allPassedBefore(progress, LEVELS.levels, 7), true);

  const oneMissed = recordLevel(progress, 6, { stars: 0, error: 0.9 });
  assert.equal(starsOf(oneMissed, 6), 1, 'a worse replay lowered a saved score');
  // ...so the flag is still true: the record keeps the best, and the target is
  // about whether the level was ever passed, not about the last attempt.
  assert.equal(allPassedBefore(oneMissed, LEVELS.levels, 7), true);
});

// ------------------------------------------------------------ the session

test('a fresh session remembers nothing', () => {
  const session = newSession();
  assert.equal(session.stars.size, 0);
  assert.equal(session.drawnPoolIds.size, 0);
});

test('the best score for a level stands, and a worse replay does not undo it', () => {
  const session = newSession();
  recordResult(session, 3, { stars: 3, drawnId: null });
  recordResult(session, 3, { stars: 1, drawnId: null });
  assert.equal(session.stars.get(3), 3);
});

test('a level played and missed is remembered as played, on a score of 0', () => {
  // The level list tells "played and missed" from "never opened" by asking
  // whether the key is here at all, so a 0 has to put one in. See
  // tests/learnProgress.test.js for the screen that reads it.
  const session = newSession();
  recordResult(session, 4, { stars: 0, drawnId: null });
  assert.equal(session.stars.has(4), true, 'a finished level left no record of being played');
  assert.equal(session.stars.get(4), 0);
  assert.equal(session.stars.has(5), false, 'an untouched level is in the map anyway');
});

test('a capstone part is not a finished level, and does not register level 7 as played', () => {
  // A series part has no stars of its own - level 7 turns on all three guesses
  // - and nothing is saved until the verdict. A key written here would put
  // level 7 on the list as played until the next reload took it off again.
  const session = newSession();
  recordResult(session, 7, { stars: null, drawnId: 'p02', drawnPool: 'guessPool' });
  assert.equal(session.stars.has(7), false, 'a half-finished capstone counted as played');
  // The part's portfolio is still remembered: that is the other half of this
  // call, and level 7's draw depends on it.
  assert.deepEqual(seenPoolIds(session), ['p02']);

  // The verdict, when it comes, does write one.
  recordResult(session, 7, { stars: 2, drawnId: null });
  assert.equal(session.stars.get(7), 2);
});

test('the pool portfolio drawn on level 2 is remembered, so level 7 can avoid it', () => {
  const session = newSession();
  recordResult(session, 2, { stars: 2, drawnId: 'p11', drawnPool: 'guessPool' });
  recordResult(session, 2, { stars: 1, drawnId: 'p04', drawnPool: 'guessPool' });
  assert.deepEqual([...session.drawnPoolIds].sort(), ['guessPool:p04', 'guessPool:p11']);
  assert.deepEqual(seenPoolIds(session).sort(), ['p04', 'p11'], 'what level 7 leaves out');
  // A level that draws nothing adds nothing.
  recordResult(session, 3, { stars: 1, drawnId: null });
  assert.equal(session.drawnPoolIds.size, 2);
});

test('a capstone portfolio never shrinks the pool of 20 that Hypothesis 3 needs', () => {
  // Both pools are remembered, but only guessPool ids are excluded from level
  // 7's first draw. If a capstone id leaked into that list it would quietly take
  // a portfolio out of the registered pool of 20.
  const session = newSession();
  recordResult(session, 2, { stars: 1, drawnId: 'p07', drawnPool: 'guessPool' });
  recordResult(session, 7, { stars: 1, drawnId: 'f13', drawnPool: 'finalPool' });
  assert.equal(session.drawnPoolIds.size, 2, 'both are remembered');
  assert.deepEqual(seenPoolIds(session), ['p07'], 'only the pool-of-20 one is excluded');
});

test('an id recorded without its pool is taken for a pool-of-20 id', () => {
  // Level 2 is the only level that draws without naming a pool, and its
  // portfolio is always from the pool of 20.
  const session = newSession();
  recordResult(session, 2, { stars: 1, drawnId: 'p11' });
  assert.deepEqual(seenPoolIds(session), ['p11']);
});

test('every id the session could remember is a real pool portfolio', () => {
  const ids = new Set(LEVELS.guessPool.portfolios.map((p) => p.id));
  const session = newSession();
  for (const portfolio of LEVELS.guessPool.portfolios) {
    recordResult(session, 2, { stars: 1, drawnId: portfolio.id, drawnPool: 'guessPool' });
  }
  for (const id of seenPoolIds(session)) assert.ok(ids.has(id), `${id} is not in the pool`);
  assert.equal(session.drawnPoolIds.size, 20);
  assert.equal(seenPoolIds(session).length, 20);
});

// ---------------------------------------------- persisting the seen pool

test('a pool portfolio survives into a new session, under its own key', () => {
  const restore = withStorage();
  try {
    const first = newSession();
    recordResult(first, 2, { stars: 2, drawnId: 'p11', drawnPool: 'guessPool' });

    // A new session is what a reload builds - nothing is passed by hand.
    const second = newSession();
    assert.deepEqual(seenPoolIds(second), ['p11'], 'the reload forgot what level 2 showed');
  } finally { restore(); }
});

test('the seen pool is stored under its own key, separate from progress', () => {
  const store = {};
  const restore = withStorage(store);
  try {
    const session = newSession();
    recordResult(session, 2, { stars: 2, drawnId: 'p11', drawnPool: 'guessPool' });
    assert.ok(store[SEEN_POOL_KEY], 'nothing was stored');
    assert.notEqual(SEEN_POOL_KEY, 'oneTrade.learn');
  } finally { restore(); }
});

test('a browser with no storage still plays, remembering nothing across reload', () => {
  const restore = withoutStorage();
  try {
    const first = newSession();
    recordResult(first, 2, { stars: 2, drawnId: 'p11', drawnPool: 'guessPool' });
    assert.deepEqual(seenPoolIds(first), ['p11'], 'this visit still excludes it');

    const second = newSession();
    assert.deepEqual(seenPoolIds(second), [], 'a browser with no storage cannot carry it to a new session');
  } finally { restore(); }
});

test('a save that cannot be written still excludes the portfolio for the rest of this visit', () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error('storage is blocked'); },
    setItem() { throw new Error('storage is blocked'); },
    removeItem() { throw new Error('storage is blocked'); },
  };
  try {
    const session = newSession();
    recordResult(session, 2, { stars: 2, drawnId: 'p11', drawnPool: 'guessPool' });
    assert.deepEqual(seenPoolIds(session), ['p11']);
  } finally {
    if (had) globalThis.localStorage = previous;
    else delete globalThis.localStorage;
  }
});

// --------------------------------------------------------------- the money

test('money reads the way a player writes it', () => {
  assert.equal(money(10000), '$10,000');
  assert.equal(money(2000), '$2,000');
  assert.equal(money(100), '$100');
  assert.equal(money(0), '$0');
});

// -------------------------------------------- the screens for levels 4 and 5

test('a level that deals a holding shows it held and locked, not tappable', () => {
  // The chip for QQQ on level 4. It is disabled because removing it throws, and
  // a button whose only outcome is an error is not a button.
  const r = round(4);
  assert.deepEqual(r.required, ['QQQ']);
  assert.equal(r.hasPick('QQQ'), true);
  assert.throws(() => r.togglePick('QQQ'), /cannot be removed/);
});

test('the money buttons are offered only when they would do something', () => {
  const r = round(4);
  for (const ticker of ['BND', 'GLD', 'JNJ']) r.togglePick(ticker);

  // A fresh build has every dollar allocated, so NOTHING can be raised: there is
  // no money left to raise it with. This is the visible face of independent
  // sliders - before, + always worked because it took from somebody else.
  assert.equal(r.moneyLeft(), 0);
  for (const ticker of r.picks) {
    assert.equal(r.canRaise(ticker), false, `${ticker} could be raised with $0 left`);
  }

  // QQQ sits at its 30% floor, so - is off there and on everywhere else.
  assert.equal(r.canLower('QQQ'), false);
  assert.equal(r.canLower('BND'), true);

  // Free a step and + comes back on - for every holding, including QQQ, which a
  // player may hold more of than the level demands.
  r.adjustDollars('BND', -1);
  assert.equal(r.moneyLeft(), 100);
  for (const ticker of r.picks) {
    assert.equal(r.canRaise(ticker), true, `${ticker} could not be raised with $100 left`);
  }

  // What the buttons say matches what the round will actually do, both ways.
  for (const ticker of r.picks) {
    assert.equal(r.canLower(ticker), r.adjustDollars(ticker, -1) === 1,
      `${ticker}: the - button and adjustDollars disagree`);
    assert.equal(r.canRaise(ticker), r.adjustDollars(ticker, 1) === 1,
      `${ticker}: the + button and adjustDollars disagree`);
  }
});

test('the floor under a holding is named in the level’s own numbers', () => {
  const r = round(4);
  assert.deepEqual(floorNotes(r), [
    'QQQ stays at $3,000 or more: the 30% this level asks you to keep in it.',
  ]);
  // A level with no floor says nothing about floors.
  assert.deepEqual(floorNotes(round(5)), []);
  assert.deepEqual(floorNotes(round(3)), []);
});

test('the floor on a kind is named with where the money actually is', () => {
  // Unlike a floor on one holding, this one can be unmet while every row on the
  // screen looks legal - four bond funds, $2,500 each, nothing below its $100 -
  // so the line has to carry the running total.
  const short = round(6);
  for (const ticker of ['BND', 'TLT', 'LQD', 'GLD']) short.togglePick(ticker);
  assert.deepEqual(floorNotes(short), [
    '$6,000 of the $10,000 has to sit in stocks - the 60% this level asks for. '
    + 'You have $0 in stocks.',
  ]);

  const met = round(6);
  for (const ticker of ['WMT', 'PG', 'TLT', 'BND']) met.togglePick(ticker);
  assert.deepEqual(floorNotes(met), [
    '$6,000 of the $10,000 has to sit in stocks - the 60% this level asks for. '
    + 'You have $6,000 in stocks.',
  ]);

  // Crash replay's own build has no level and no floor, and must not grow a line.
  assert.deepEqual(floorNotes({ total: 10000, floorOf: () => 100 }), []);
});

test('the build hint names what is missing, not the last thing that was', () => {
  // The line under a disabled Next button. Level 6 can have all four holdings and
  // still not be ready, and "Pick 0 more holdings to carry on" was what the old
  // line said about that.
  const empty = round(6);
  assert.equal(buildHint(empty), 'Pick 4 more holdings to carry on.');
  empty.togglePick('WMT');
  assert.equal(buildHint(empty), 'Pick 3 more holdings to carry on.');

  const wrongPlace = round(6);
  for (const ticker of ['BND', 'TLT', 'LQD', 'GLD']) wrongPlace.togglePick(ticker);
  // The action, not the rule: the allocator's floor note states the rule and the
  // running total a few lines above, and at 390px the two read as one sentence
  // twice. Found by driving the level, not by a test.
  assert.equal(
    buildHint(wrongPlace),
    'Move $6,000 into stocks with the + buttons, or swap a holding for one.',
  );
  assert.ok(!buildHint(wrongPlace).includes('has to sit in'),
    'the hint must not repeat the floor note above it');

  // A ready build says nothing, and neither does a dealt one.
  const ready = round(6);
  for (const ticker of ['WMT', 'PG', 'TLT', 'BND']) ready.togglePick(ticker);
  assert.equal(buildHint(ready), null);
  assert.equal(buildHint(round(2)), null, 'level 2 is dealt its portfolio');

  // One stock can carry the whole 60%, and then there is nothing to say either.
  const oneStock = round(6);
  for (const ticker of ['WMT', 'BND', 'TLT', 'LQD']) oneStock.togglePick(ticker);
  assert.equal(buildHint(oneStock), null);

  // The levels that came before are unchanged.
  assert.equal(buildHint(round(1)), 'Pick 2 more holdings to carry on.');
  assert.equal(buildHint(round(4)), 'Pick 3 more holdings to carry on.');
});

test('every level names its own reveal panel, and none of them is the old ternary', () => {
  for (const level of LEVELS.levels) {
    assert.ok(level.revealLabel.length > 10, `level ${level.id} has no reveal label`);
  }
  assert.match(levelById(LEVELS, 4).revealLabel, /AI basket/);
  assert.match(levelById(LEVELS, 5).revealLabel, /risk/i);
});

test('the slider on each level reads the step and the units from levels.json', () => {
  assert.equal(guessStep(levelById(LEVELS, 4)), 0.05);
  assert.equal(guessStep(levelById(LEVELS, 5)), 0.01);
  // Level 5's guess is a share of 1 and reads as a percent on the screen.
  const five = round(5);
  for (const ticker of ['VOO', 'BND', 'GLD', 'XOM']) five.togglePick(ticker);
  five.toGuess();
  five.setGuess(0.38);
  assert.equal(guessSliderState(five).readout, '38%');
  const four = round(4);
  for (const ticker of ['BND', 'GLD', 'JNJ']) four.togglePick(ticker);
  four.toGuess();
  four.setGuess(0.55);
  assert.equal(guessSliderState(four).readout, '0.55');
});

test('basketFrom() accepts the registered basket and refuses anything else', () => {
  const basket = basketFrom(readJson('basket.json'));
  assert.equal(basket.length, 13);
  assert.deepEqual(basket, BASKET);
  // Level 4 is a beta TO this basket, so a round measured against some other
  // list of names would be a different level wearing level 4's title.
  assert.throws(() => basketFrom({ stocks: [] }), /carries no stocks/);
  assert.throws(() => basketFrom({}), /carries no stocks/);
  assert.throws(() => basketFrom({ stocks: [{ layer: 'chips' }] }), /no ticker/);
});

// --------------------------------------------- the reveal's number line
//
// Where the guess, the answer and the threshold fall on the line, and the gap in
// words. Pure: the rendering of it is tested in tests/gameShare.test.js, which
// has a document.

/** A level played to its reveal, with a given guess. */
function revealed(levelId, picks, guess) {
  const r = atGuess(levelId, picks);
  r.setGuess(guess);
  r.reveal();
  return r;
}

test('the number line is drawn on the level own scale', () => {
  // THE SAME RULER AS THE QUESTION. Level 3's slider ran from 1.0 to 5.0, so the
  // marks have to land where that slider would have put them - a reveal drawn
  // against a different scale is a reveal of a different number.
  const r = revealed(3, ['VOO', 'BND', 'GLD', 'XOM', 'JNJ'], 3.2);
  const line = revealLine(r);
  assert.equal(line.min, 1);
  assert.equal(line.max, 5);
  // 3.2 on a 1-to-5 scale is (3.2 - 1) / 4 = 55%.
  assert.ok(Math.abs(line.guessAt - 55) < 1e-9, `the guess sits at ${line.guessAt}%`);
  // A THOUSANDTH, not 1e-9: the positions are rounded to three decimals on the
  // way out, because they end up in a style attribute and 36.524439324273615%
  // is not a position anybody needs. Finer than a pixel on any screen.
  const expected = ((r.result.value - 1) / 4) * 100;
  assert.ok(Math.abs(line.answerAt - expected) < 1e-3,
    `the answer sits at ${line.answerAt}%, not ${expected}%`);
  // The span is a length, so it has no sign whichever way round the two fell.
  assert.ok(Math.abs(line.spanWidth - Math.abs(line.answerAt - line.guessAt)) < 1e-9);
  assert.equal(line.spanFrom, Math.min(line.guessAt, line.answerAt));
  // The threshold is on it too: 3 bets on a 1-to-5 scale is halfway.
  assert.ok(Math.abs(line.needAt - 50) < 1e-9);
  assert.equal(line.needShown, '3.0');
});

test('an answer past the end of the scale is held to the edge, and says so', () => {
  // NOT CLAMPED QUIETLY. levels.json records that level 5's share of risk can
  // pass 100% when a holding offsets the rest, and the slider stops at 100%; a
  // mark drawn off the end would be invisible, and one drawn at the edge with
  // nothing said about it is a lie about where the answer was.
  const r = revealed(5, ['VOO', 'BND', 'GLD', 'JNJ'], 0.5);

  const beyond = revealLine({ ...r, result: { ...r.result, value: 1.2, guess: 0.5 } });
  assert.equal(beyond.answerAt, 100, 'a mark past the top was not held to the line');
  assert.equal(beyond.beyond, true, 'and nothing said it had been held');

  const below = revealLine({ ...r, result: { ...r.result, value: 0.1, guess: 0.5 } });
  assert.equal(below.answerAt, 0);
  assert.equal(below.beyond, true);

  const inside = revealLine({ ...r, result: { ...r.result, value: 0.4, guess: 0.5 } });
  assert.equal(inside.beyond, false);
});

test('revealLine answers null where there is nothing to draw', () => {
  const r = round(3);
  for (const ticker of ['VOO', 'BND', 'GLD', 'XOM', 'JNJ']) r.togglePick(ticker);
  assert.equal(revealLine(r), null, 'a round with no result drew a line');
  r.toGuess();
  assert.equal(revealLine(r), null, 'a round with no guess drew a line');
});

test('the gap is said in words, and a guess that rounds to the answer is spot on', () => {
  const r = revealed(3, ['VOO', 'BND', 'GLD', 'XOM', 'JNJ'], 3.2);
  const line = revealLine(r);
  const said = gapSentence(r, line);
  assert.match(said, /^Out by \d+\.\d\.$/, `the gap read "${said}"`);
  // Level 3 answers to one decimal, so the sentence does too.
  assert.equal(said, `Out by ${line.gap.toFixed(1)}.`);

  // A guess that lands on the answer is not "out by 0.0", which reads as a fault.
  assert.equal(gapSentence(r, { ...line, gap: 0 }), 'Spot on.');
  // And one that rounds to zero in the level's own units is the same thing.
  assert.equal(gapSentence(r, { ...line, gap: 0.004 }), 'Spot on.');
});

test('every level can draw its own line, in its own units', () => {
  // A line is drawn on six of the seven levels. Level 2's pass condition is
  // "make a guess" and has no threshold, so it gets the line without the tick -
  // which is the case that would throw if the threshold were assumed.
  // Level 4 and level 6 are left out: their measures need a basket and a crash
  // window that atGuess() does not deal, and they are covered in the round's own
  // tests. The point here is the SCALES, and four different ones is the point.
  for (const [levelId, picks, guess] of [
    [1, ['VOO', 'VTI'], 0.8],
    [2, [], 2.5],
    [3, ['VOO', 'BND', 'GLD', 'XOM', 'JNJ'], 3.2],
    [5, ['VOO', 'BND', 'GLD', 'JNJ'], 0.4],
  ]) {
    const r = revealed(levelId, picks, guess);
    const line = revealLine(r);
    assert.ok(line, `level ${levelId} drew no line`);
    for (const at of [line.guessAt, line.answerAt, line.spanFrom]) {
      assert.ok(at >= 0 && at <= 100, `level ${levelId} put a mark at ${at}%`);
    }
    assert.ok(line.spanFrom + line.spanWidth <= 100 + 1e-9,
      `level ${levelId}'s span runs off the end`);
    assert.ok(line.needAt === null || (line.needAt >= 0 && line.needAt <= 100));
  }
});
