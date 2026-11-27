// js/game.js - the Learn mode: levels 1 to 3, built, guessed and revealed.
//
// This file is the screens and nothing else. Every rule comes from levels.json
// through js/levels.js, every price from data/game.json through js/gameView.js,
// every sentence of the "Why?" card from why.json through js/why.js, and the
// round itself is js/round.js, which has no DOM in it. If a number appears here
// it was computed there, and if a sentence appears here it was written there.
//
// PHONE FIRST. One column, controls big enough for a thumb (44px minimum), no
// horizontal scrolling, and the keyboard never needed: the money moves on - and
// + buttons and the guess on a slider. docs/PRD.md's launch bar is "Levels 1 to
// 3 can be played in under 10 minutes on a mid-range phone".
//
// WHAT EVERY SCREEN IN A ROUND CARRIES, because the PRD requires both:
//   - "Live prices through [date]", read from data/game.json's own meta;
//   - "Educational, not investment advice."
//
// PROGRESS IS IN MEMORY, and goes when the tab closes. Browser storage is
// Milestone 2 step 7. The pool portfolio drawn on level 2 is kept here too, so
// that level 7 can avoid drawing the same one later: level 7 would otherwise be
// measuring a player's memory rather than their learning.
//
// Educational, not investment advice.

import { loadGameData, DISCLAIMER } from './gameView.js';
import {
  validateLevels, bandsMet, displayFor, formatGuess, levelById, LEVELS_URL,
} from './levels.js';
import { longDate } from './format.js';
import { BUILD, GUESS, REVEAL, createRound, createSeries, isSeries } from './round.js';
import { WHY_URL, groupIndex, pickSeriesWhy, seriesFacts, validateWhy } from './why.js';
import { CRASHES_URL, loadCrashes } from './crash.js';
// Level 6 replays a crash window, so its reveal draws the two lines Crash
// replay draws, from the same spec and with the same refusal wording for a
// holding the window cannot replay. See the notes beside both exports.
import { chartSpecFor, fallSentence, pickReason } from './crashReplay.js';
import { renderLineChart, chartBox } from './chart.js';
// The build screen, shared with Crash replay - and with Sandbox and My real
// portfolio when they arrive. See the note at the top of js/build.js.
import {
  h, button, money, tickerPicker, allocator, floorNotes, errorView,
  whatAreThese, pickedNames, holdingList,
} from './build.js';
// What each ticker is, for the "What are these?" list and the names beside a
// picked holding. Its own file, not tickers.json, which is registered.
import { NAMES_URL, loadNames, nameOf } from './names.js';
// Saved progress: the stars a player keeps, and which levels are open.
import {
  clearProgress, guessError, isUnlocked, loadProgress, passedLevels, playedLevels,
  recordLevel, saveProgress, starsOf, triesOf, unlockedThrough,
} from './progress.js';
// The anonymous per-browser ID the records carry. Its own storage key, and
// Reset progress does not clear it - see the note at the top of the file.
import { participantId } from './participant.js';
import { loadSeenPool, saveSeenPool } from './seenPool.js';
import { sendGuess, sendPing } from './analytics.js';
// The share card: its words are decided by js/shareCard.js, which is pure, and
// carried out of the browser by js/share.js, which the daily puzzle shares.
import {
  cardFromResult, cardFromSeries, drawShareCard, fontsReady, shareMessage,
} from './shareCard.js';
import { canvasToFile, copyOut, downloadFile, shareOut, shareUrl } from './share.js';
import { ABOUT } from './config.js';
// Putting a view on the page without throwing away the scroll position or the
// focused control. See the long note at the top of js/screen.js.
import { createScreen } from './screen.js';

export const TICKERS_URL = 'tickers.json';

/**
 * The AI basket, frozen at the prereg tag. Level 4 measures a beta to it, and it
 * is read from the registered file rather than repeated in the game's own data:
 * basket.json is authoritative, and a test holds the level to its 13 names.
 */
export const BASKET_URL = 'basket.json';

/**
 * The levels whose guesses produce an anonymous record, and the only ones.
 *
 * PREREG.md's Hypothesis 3 compares each player's error on LEVEL 2 with their
 * error on LEVEL 7 and pairs the two with a sign test, so those two levels and
 * no others are the registered comparison. Levels 1 and 3 to 6 build their own
 * portfolios, which are not drawn from the pool and not comparable to anything;
 * the weekly challenge is not a level; and Sandbox and My real portfolio have no
 * guess step at all.
 *
 * It is a list here rather than a condition in startRound() so that what the
 * game collects can be read in one line, which is the thing a reviewer of a
 * privacy claim wants to find. Level 7 is in the list for completeness and is
 * sent by createSeries(), which deals its three portfolios.
 */
export const RECORDING_LEVELS = [2, 7];

/**
 * How many failed tries a level takes before it offers its hint.
 *
 * Three, from your brief. It is a constant rather than a literal because the
 * number is a judgement about how long somebody should be left to work it out,
 * and a reviewer should be able to find it without reading renderBuild().
 */
export const HINT_AFTER_TRIES = 3;

/**
 * How fine the guess slider is, from levels.json.
 *
 * This used to be a branch on the measure's name - hundredths for a correlation,
 * tenths for anything else - and with five levels answering with a correlation, a
 * bets count, a beta and a share of risk, that branch had started deciding how
 * numbers read. levels.json carries guess.step and guess.display now, so the step
 * sits beside the star band it has to be able to reach, where a reviewer can see
 * the two together.
 */
export function guessStep(level) {
  return displayFor(level).step;
}

/** How many decimals to show a guess or a result in, to match the slider. */
export function guessPlaces(level) {
  return displayFor(level).places;
}

/**
 * How long the window was, in the words the measure's own source counts in.
 *
 * A REPLAY COUNTS CLOSES AND A COVARIANCE COUNTS MOVES, and the difference is
 * one day. Level 6's window is 19 February to 23 March 2020, which docs/PRD.md's
 * crash table records as 24 trading days; the replay applies the 23 moves
 * between those 24 closes. Levels 1 to 5 measure over returns, and the PRD's own
 * phrasing for that window is "the most recent 756 trading days" of them. So the
 * number printed is whichever one the result carries, and both are right about
 * what they count.
 */
function windowDays(result) {
  return result.tradingDays ?? result.days;
}

/** The two lines every screen in a round carries. */
function footNotes(game) {
  const wrap = h('div', 'game-foot');
  wrap.append(h('p', 'live-chip', game.meta.liveLabel ?? `Live prices through ${game.meta.liveThrough}`));
  wrap.append(h('p', 'disclaimer-inline', DISCLAIMER));
  return wrap;
}

/**
 * The basket's members, from basket.json.
 *
 * It throws on a file that is not the registered basket, because level 4's
 * measure is a beta TO that basket: a round measured against some other list of
 * names would be a different level wearing level 4's title.
 */
export function basketFrom(doc) {
  const members = (doc?.stocks ?? []).map((stock) => stock.ticker);
  if (members.length === 0) throw new Error(`${BASKET_URL} carries no stocks`);
  if (members.some((ticker) => typeof ticker !== 'string' || ticker.length === 0)) {
    throw new Error(`${BASKET_URL} has a stock with no ticker`);
  }
  return members;
}

/** Stars as text, so they copy and read aloud sensibly. */
export function starText(count) {
  return `${'★'.repeat(count)}${'☆'.repeat(3 - count)}`;
}

/**
 * The same stars, for a level list that also has to say "and this one has been
 * played".
 *
 * THREE EMPTY STARS ON THEIR OWN ARE AMBIGUOUS. ☆☆☆ is what a level scores when
 * it is played and missed, and it is also what a level that was never opened
 * would look like if the list drew stars for it - so the zero case says so in
 * words and the rest are left as the stars they are. The words are only on the
 * zero: "★☆☆ one star" would be the same news twice.
 */
export function starsLabel(count) {
  return count === 0 ? `${starText(0)} no stars yet` : starText(count);
}

// ------------------------------------------------------------- the session

/**
 * What this browser tab remembers for the length of one visit.
 *
 * Not the whole picture any more, and this note used to claim it was. The
 * stars here are a copy of js/progress.js's saved record; `drawnPoolIds` is
 * seeded from and written back to js/seenPool.js; and a locked guess on level
 * 2 or 7 now leaves the browser entirely, through js/analytics.js. What stays
 * true, and matters more: no ticker, dollar amount, weight or name is in any
 * of it.
 */
export function newSession(progress = null) {
  return {
    // The best stars per level, seeded from what the browser saved. The record
    // itself stays the source of truth on disk; this is the copy the screens
    // read while a visit is in progress.
    stars: new Map(
      progress ? playedLevels(progress).map((id) => [id, starsOf(progress, id)]) : [],
    ),
    // Pool portfolios already shown, as "pool:id", so the two pools cannot be
    // confused. Level 7's first question leaves out every guessPool id in here:
    // asking a player the portfolio they already saw on level 2 would measure
    // their memory of that reveal rather than what they learned.
    //
    // SEEDED FROM STORAGE, under its own key (js/seenPool.js), so the
    // exclusion survives a reload. PREREG_AMENDMENT_3.md section 2 registers
    // that this only extends the registered draw rather than changing it. A
    // browser with no storage gets an empty set here, the same as before this
    // was persisted at all.
    drawnPoolIds: new Set(loadSeenPool()),
    // Levels this VISIT has already pinged, so a retry is not a second player.
    // In memory only, and unlike drawnPoolIds that is the right scope rather
    // than a compromise: a ping counts a visit reaching a level, so somebody
    // coming back tomorrow genuinely is a new one to count. See the note on
    // docs/PRD.md's success targets - pings count visits, not people.
    pingedLevels: new Set(),
    // Which level's reveal said what the share card carries. Null until the
    // first reveal of the visit claims it - see wantsShareNote().
    shareNoteLevel: null,
  };
}

/**
 * Which guessPool portfolios this browser has been shown, for level 7's draw.
 *
 * ONLY guessPool IDS. The capstone pool is not part of the registered
 * comparison, and mixing the two would let a capstone portfolio silently shrink
 * the pool of 20 that Hypothesis 3 depends on.
 */
export function seenPoolIds(session) {
  return [...session.drawnPoolIds]
    .filter((key) => key.startsWith('guessPool:'))
    .map((key) => key.slice('guessPool:'.length));
}

/**
 * Record a finished round. The best score for a level stands.
 *
 * It writes to the SESSION and to the saved record, which hold different
 * things for different lengths of time: the session carries this visit's draws
 * and dies with the tab, and js/progress.js carries the stars and the closest
 * guess, and outlives it. A save that fails changes nothing on screen - the
 * game is playable without storage, and says so on the menu.
 */
export function recordResult(session, levelId, result) {
  // A LEVEL IS IN THIS MAP ONCE IT HAS BEEN PLAYED, which is what the level
  // list reads to tell "played and missed" from "never opened" - a 0 is a
  // score, not an absence. So the key has to go in even when the score is 0.
  //
  // A SERIES PART IS NOT A FINISHED LEVEL. Level 7's parts each come through
  // here - they have a drawn portfolio to remember below - and their stars are
  // null, because three guesses decide the level and one of them decides
  // nothing (js/round.js). Writing a key for a part would put level 7 on the
  // list as played the moment its first portfolio was revealed, and then take
  // it off again on the next reload, since saveResult() does not write a part
  // either. The guard keeps this map and the saved record agreeing about what
  // counts as played; finishSeries() writes level 7 once, from the verdict.
  if (Number.isInteger(result.stars)) {
    const best = Math.max(session.stars.get(levelId) ?? 0, result.stars);
    session.stars.set(levelId, best);
  }
  if (result.drawnId) {
    session.drawnPoolIds.add(`${result.drawnPool ?? 'guessPool'}:${result.drawnId}`);
    // A failed write changes nothing on screen, same as every other save in
    // this game: the exclusion still holds for the rest of this tab's life
    // either way, and only a future visit notices.
    saveSeenPool(session.drawnPoolIds);
  }
  return session;
}

/**
 * Put a finished level into the saved record, and write it.
 *
 * `result` is the one-question reveal or level 7's verdict; guessError() knows
 * the difference. Returns the new record, and whether it reached the browser.
 */
export function saveResult(progress, levelId, result) {
  const next = recordLevel(progress, levelId, {
    stars: result.stars ?? 0,
    error: guessError(result),
  });
  return { progress: next, saved: saveProgress(next) };
}

// --------------------------------------------------------------- the menu

function levelCard(ctx, level, { continueId, allPassed }) {
  const card = h('article', 'level-card');
  const head = h('header', 'level-card-head');
  head.append(h('h2', null, `${level.id}. ${level.title}`));
  // PLAYED IS NOT THE SAME QUESTION AS SCORED, and reading one off the other
  // is what this card used to do: `stars ? starText(stars) : 'not played'`
  // treated a 0 as nothing at all, so a level played and missed was shown
  // exactly as a level never opened. A player who had just failed level 4
  // three times was told on the list that they had never tried it. The map
  // answers both questions - has() for whether it was played, get() for what
  // it scored - and recordResult() puts the key in on a 0 for that reason.
  const played = ctx.session.stars.has(level.id);
  const stars = ctx.session.stars.get(level.id) ?? 0;
  head.append(h('span', stars ? 'level-stars' : 'level-stars level-stars-none',
    played ? starsLabel(stars) : 'not played'));
  card.append(head);
  card.append(h('p', 'level-concept', level.concept));

  // IN ORDER, and by PLAYING: level N+1 unlocks once level N has been finished,
  // passed or not. Level 1 is always unlocked. js/progress.js carries the rule
  // and what it costs - see unlockedThrough().
  const ids = ctx.levels.levels.map((l) => l.id);
  const unlocked = isUnlocked(ctx.progress, level.id, ids);
  const before = ids[ids.indexOf(level.id) - 1];

  // THE CHALLENGE WAITS UNTIL THE LEVEL DOES. On a first visit six of the seven
  // cards are locked, and this used to hand a new player the full rules of six
  // levels they cannot start - 111 words of the menu's 277, read before level 1
  // begins, on a screen where reading is 89% of the time to finish levels 1 to 3
  // (BUILD_LOG.md sessions 2.33 and 2.34). The title and the concept still say
  // what each level is about, which is what a player choosing where they are up
  // to actually needs.
  //
  // RENDERING ONLY. levels.json keeps both fields exactly as docs/PRD.md's level
  // table states them, and tests/prdLevels.test.js still checks them against it.
  if (unlocked) card.append(h('p', 'level-challenge', level.challenge));

  if (!unlocked) {
    card.classList.add('level-locked');
    // WHAT UNLOCKS IT, in the card's own words. Since session 2.38 that is
    // playing the level before, not passing it - and "play" is the surprising
    // half, so the menu states the rule once above the list rather than
    // adding "you don't have to pass it" to each of six locked cards. On a
    // first visit six of the seven are locked, and reading is 89% of the time
    // to finish levels 1 to 3 (BUILD_LOG.md 2.34).
    card.append(h('p', 'level-lock-note', `Play level ${before} to unlock this one.`));
  }
  // The one level worth pressing next stands out from the rest of the column -
  // never once every level has been passed, since there is no next one then.
  const isContinue = !allPassed && level.id === continueId;
  if (isContinue) card.classList.add('level-card-continue');
  // The gate is HERE and not only on the button: a disabled button stops a
  // click, never a caller. js/round.js refuses the same kinds of thing.
  card.append(button(isContinue ? 'Continue' : (played ? 'Play again' : 'Play'), 'btn btn-primary btn-wide',
    () => { if (isUnlocked(ctx.progress, level.id, ids)) ctx.startRound(level.id); },
    { disabled: !unlocked, aria: unlocked ? null : `Level ${level.id} unlocks when level ${before} is played` }));
  return card;
}

/**
 * "Reset progress", which asks before it takes anything away.
 *
 * IN THE PAGE, not window.confirm(): some embedded browsers refuse that dialog
 * outright, and one that is refused silently would wipe a player's stars with
 * no question asked at all.
 */
function resetRow(ctx) {
  const row = h('div', 'reset-row');
  if (!ctx.askingReset) {
    row.append(button('Reset progress', 'btn btn-quiet reset-progress', () => {
      ctx.askingReset = true;
      ctx.redraw();
    }));
    return row;
  }
  row.append(h('p', 'reset-ask', 'Reset progress? Your stars and your best guesses will be forgotten. '
    + "Today's puzzle and this week's challenge are kept."));
  row.append(button('Yes, reset it', 'btn btn-quiet reset-confirm', () => {
    clearProgress();
    ctx.progress = loadProgress();
    ctx.session = newSession(ctx.progress);
    ctx.askingReset = false;
    ctx.redraw();
  }));
  row.append(button('Keep my progress', 'btn btn-quiet reset-cancel', () => {
    ctx.askingReset = false;
    ctx.redraw();
  }));
  return row;
}

/**
 * The level list.
 *
 * Exported for tests/learnProgress.test.js, which renders it to check that
 * saved stars reach the screen, that a locked level cannot be started, and
 * that Reset asks first.
 */
export function renderMenu(ctx) {
  const view = h('div', 'view');
  view.append(h('h1', null, 'Learn'));
  view.append(h('p', 'lede', 'Build a portfolio with $10,000 of pretend money, guess how many separate bets you made, then see the answer worked out from real prices.'));

  const ids = ctx.levels.levels.map((l) => l.id);
  const passedCount = passedLevels(ctx.progress).filter((id) => ids.includes(id)).length;
  const allPassed = passedCount === ids.length;
  // THE RULE, ONCE, above the list. A locked card says which level unlocks it;
  // this says what counts as unlocking, which is the part a player will not
  // guess - finishing a level is enough, and passing is a separate reward.
  // "Unlock", never "open": the menu retired that word (tests/learnProgress).
  view.append(h('p', 'note',
    'Levels unlock in order. Finish one to unlock the next — you do not have to pass it.'));
  view.append(h('p', 'level-progress', allPassed
    ? `All ${ids.length} passed`
    : `${passedCount} of ${ids.length} passed`));
  const continueId = unlockedThrough(ctx.progress, ids);

  const list = h('div', 'level-list');
  for (const level of ctx.levels.levels) list.append(levelCard(ctx, level, { continueId, allPassed }));
  view.append(list);
  view.append(h('p', 'note', 'Returns never score anything here, and there is no leaderboard.'));
  if (ctx.canSave === false) {
    // Said plainly rather than left to be discovered: a player who thinks their
    // stars are kept and finds them gone has been misled by this screen.
    view.append(h('p', 'note', 'This browser will not let the game save anything, so your '
      + 'progress will not be saved. Everything else works as usual.'));
  } else {
    view.append(resetRow(ctx));
  }
  view.append(footNotes(ctx.game));
  return view;
}

/**
 * Has every level BEFORE this one been passed?
 *
 * What a count ping carries beside the level it reached, and what two of
 * docs/PRD.md's success targets are actually about: "players who finish level
 * 3" is level 4's ping with this true, and "players who reach level 7" is
 * level 7's ping with this true, which is the same claim as "levels 1 to 6
 * were all passed".
 *
 * VACUOUSLY TRUE ON THE FIRST LEVEL, which is the honest answer rather than a
 * special case: nothing stands before level 1 to have been failed.
 *
 * EVERY earlier level, not just the one immediately before. Play-to-unlock
 * lets a player walk past a level they failed, so "level 3 was passed" and
 * "levels 1, 2 and 3 were all passed" are now different claims, and the
 * targets mean the second one.
 */
export function allPassedBefore(progress, levels, levelId) {
  const ids = levels.map((level) => level.id);
  const at = ids.indexOf(levelId);
  if (at <= 0) return true;
  const passed = new Set(passedLevels(progress));
  return ids.slice(0, at).every((id) => passed.has(id));
}

// -------------------------------------------------------------- the build

/**
 * What is still missing from the build, in the player's own words, or null when
 * nothing is.
 *
 * A pure function of the round, so it is tested in node without a document, the
 * way guessSliderState() and starsExplanation() are. js/round.js's
 * whyIncomplete() is the same question answered for a caller - it names the rule
 * and the dollars exactly - and this is the version a player reads.
 *
 * TWO THINGS CAN BE MISSING NOW, which is why this is a function and not a
 * ternary. Level 6 can have all four holdings and still not be ready, because
 * the money is in the wrong place, and "Pick 0 more holdings to carry on" was
 * what the old line said about that.
 */
export function buildHint(round) {
  if (round.fixed || round.buildComplete()) return null;
  if (round.wanted !== null && round.picks.length !== round.wanted) {
    const left = round.wanted - round.picks.length;
    if (left > 0) return `Pick ${left} more ${left === 1 ? 'holding' : 'holdings'} to carry on.`;
    return `Drop ${-left} to get back to ${round.wanted}.`;
  }
  if (round.picks.length === 0) return 'Pick your holdings to carry on.';
  const kind = round.kindFloor;
  if (kind && round.allocatedInKind() < kind.dollars) {
    // WHAT TO DO, not what the rule is. The allocator's own floor note states the
    // rule and the running total a few lines above this, and on a 390px screen
    // the two were reading as the same sentence twice - found by driving the
    // level, not by a test.
    return `Move ${money(round.shortOfKindFloor())} into ${kind.kind} with the + buttons, `
      + `or swap a holding for one.`;
  }
  return 'Split the money between your holdings to carry on.';
}

/**
 * The level's own hint, once it has been failed enough times, or null.
 *
 * TRIES, NOT REVEALS. js/progress.js counts a try as a finished attempt that
 * earned no star, so level 7 - three portfolios and one verdict - adds one
 * rather than three, and a player cannot be shown a hint halfway through a
 * series it has not finished.
 *
 * It is a separate question from buildHint(), which says what is still missing
 * from THIS build. This one says what to think about on this level.
 */
export function levelHint(ctx, level, { after = HINT_AFTER_TRIES } = {}) {
  const hint = level.hint;
  if (typeof hint !== 'string' || hint.length === 0) return null;
  return triesOf(ctx.progress, level.id) >= after ? hint : null;
}

function renderBuild(ctx, round) {
  const view = h('div', 'view view-round');
  view.append(roundHead(ctx, round, 'Build'));
  view.append(h('p', 'lede', round.level.challenge));

  // THE HINT, after three finished attempts that earned nothing. It points at
  // what to think about and never at a portfolio: levels.json carries the words
  // so they can be edited without touching code, and scripts/check_levels.mjs
  // still has to find at least 3 winning designs that the hint does not name.
  const levelsHint = levelHint(ctx, round.level);
  if (levelsHint) {
    const box = h('aside', 'level-hint');
    box.append(h('p', 'level-hint-head', 'A hint'));
    box.append(h('p', 'level-hint-body', levelsHint));
    view.append(box);
  }

  if (round.fixed) {
    // "Your starter portfolio" is level 2's phrase and is wrong on a capstone:
    // nothing about the seventh level is a start. The series says which of the
    // three this is, which is also what the player needs to know here.
    view.append(h('h2', 'allocator-head', ctx.series
      ? `Mystery portfolio ${ctx.series.at + 1} of ${ctx.series.count}`
      : 'Your starter portfolio'));
    // The same component the guess screen draws, off the same round, so the
    // two screens cannot come to show a dealt portfolio differently.
    view.append(holdingList(round));
    // DEALT, BUT STILL UNNAMED WITHOUT THIS. Levels 2 and 7 hand a player a
    // portfolio rather than letting them pick one, which makes "what is LQD?"
    // more pressing here than anywhere, not less.
    const dealtNames = whatAreThese(ctx.names, round.picks);
    if (dealtNames) view.append(dealtNames);
    // The pool of 20 is named only where it IS the pool of 20. Level 7's second
    // and third portfolios come from the capstone pool, and saying "a pool of
    // 20" under all three would be telling a player something untrue about two
    // of them.
    view.append(h('p', 'note', round.drawnPool === 'finalPool'
      ? 'This one is dealt to you too, from the capstone pool. Guessing comes next.'
      : 'This one is dealt to you, drawn at random from a pool of 20. Guessing comes next.'));
  } else {
    const count = round.wanted === null
      ? `${round.picks.length} picked`
      : `${round.picks.length} of ${round.wanted} picked`;
    view.append(h('p', 'picker-count', count));
    view.append(tickerPicker(round, {
      groups: ctx.tickers.groups,
      redraw: ctx.draw,
      // levels.json decides, not this file: level 1 hides the group headings
      // because they give away which pairs move together, and its pickerNote
      // says so. Every other level, and every other mode, keeps them.
      grouped: round.level.picker?.grouped !== false,
      names: ctx.names,
      // Only a level whose rule is about kinds marks them. Level 6 asks for
      // 60% of the money in stocks; everywhere else the distinction is not
      // the lesson and the extra word on four chips would be noise.
      markKinds: Boolean(round.kindFloor),
      // A holding this round's window cannot replay is shown disabled with its
      // reason - PLTR had not listed in February 2020 - rather than left out. A
      // level without a crash window has nothing to refuse.
      reasonFor: (ticker) => (round.crashWindow ? pickReason(round.crashWindow, ticker) : null),
    }));
    const picked = pickedNames(round, ctx.names);
    if (picked) view.append(picked);
    const glossary = whatAreThese(ctx.names, round.pool);
    if (glossary) view.append(glossary);
    if (round.usesMoney && round.picks.length > 0) {
      view.append(allocator(round, { redraw: ctx.draw }));
    }
  }

  const ready = round.buildComplete();
  view.append(button('Next: your guess', 'btn btn-primary btn-wide', () => {
    round.toGuess();
    ctx.draw();
  }, { disabled: !ready }));
  const hint = buildHint(round);
  if (hint) view.append(h('p', 'note', hint));
  view.append(button('Back to the levels', 'btn btn-quiet btn-wide', () => ctx.toMenu()));
  view.append(footNotes(ctx.game));
  return view;
}

// -------------------------------------------------------------- the guess

/**
 * Everything the guess screen shows, worked out before any node is made.
 *
 * It is a function of the round alone, so it can be tested in node without a
 * document (tests/game.test.js), and the renderer below is a thin wrapper around
 * it. The point of the state is the blank one: before the player's first tap
 * there is no number, no thumb and no reveal.
 */
export function guessSliderState(round) {
  const level = round.level;
  const { min, max } = round.guessRange();
  const guessed = round.hasGuessed();
  return {
    min,
    max,
    step: guessStep(level),
    // Where the control rests before it is touched. The input needs SOME value -
    // a range input with none would report its own midpoint anyway - so the
    // midpoint is used and then hidden: no thumb, no fill, no number. Nothing on
    // the screen says it, and round.guess stays null until the player acts.
    value: guessed ? round.guess : (min + max) / 2,
    blank: !guessed,
    className: guessed ? 'guess-slider' : 'guess-slider guess-slider-blank',
    readout: guessed ? formatGuess(level, round.guess) : '—',
    // Screen readers get the same message the blank thumb gives everyone else.
    valueText: guessed ? null : 'no guess yet - tap the line to guess',
    revealDisabled: !round.canReveal(),
    hint: guessed ? null : 'Tap anywhere on the line, or drag, to make your guess. The answer stays hidden until you do.',
  };
}

/**
 * The guess screen.
 *
 * Exported because the weekly challenge asks exactly this question about
 * exactly this kind of portfolio, and a second copy of a slider that must not
 * show a number before the player moves it is a second copy of the thing most
 * worth getting right.
 */
export function renderGuess(ctx, round) {
  const level = round.level;
  const view = h('div', 'view view-round');
  view.append(roundHead(ctx, round, 'Guess'));
  const prompt = h('label', 'lede', level.guess.prompt);
  prompt.setAttribute('for', 'guess-slider-input');
  view.append(prompt);

  // THE PORTFOLIO, AND WHERE ITS MONEY SITS, while the guess is being made.
  // Playtest feedback: on level 2 the split was on the screen before and a
  // dealt round has no way back to it. The same list the build screen draws,
  // from the same round - which is also what keeps level 2 and level 7's
  // first portfolio asking the question identically, as Hypothesis 3 needs.
  view.append(holdingList(round));

  const state = guessSliderState(round);

  // No number until the player makes one. docs/PRD.md makes the guess the
  // lesson, and a number already on the screen is a number to anchor on - or to
  // confirm without thinking.
  const readout = h('p', 'guess-readout', state.readout);
  if (state.blank) readout.classList.add('guess-readout-empty');
  view.append(readout);

  // The thumb is hidden too, for the same reason: its resting position is a
  // weaker anchor than a number, but it is still an anchor. The first tap on the
  // track sets the value where it landed and the thumb appears there, which is
  // what a range input does natively - no click handler of our own.
  const slider = h('input', state.className);
  slider.type = 'range';
  slider.id = 'guess-slider-input';
  slider.min = String(state.min);
  slider.max = String(state.max);
  slider.step = String(state.step);
  slider.value = String(state.value);
  if (state.valueText) slider.setAttribute('aria-valuetext', state.valueText);

  const reveal = button('Reveal the answer', 'btn btn-primary btn-wide', () => {
    round.reveal();
    ctx.finish(round);
  }, { disabled: state.revealDisabled });

  const hint = h('p', 'note', state.hint ?? '');
  if (!state.hint) hint.hidden = true;

  slider.addEventListener('input', () => {
    round.setGuess(Number(slider.value));
    const now = guessSliderState(round);
    readout.textContent = now.readout;
    readout.classList.remove('guess-readout-empty');
    slider.className = now.className;
    slider.removeAttribute('aria-valuetext');
    reveal.disabled = now.revealDisabled;
    hint.hidden = true;
  });

  const scale = h('div', 'guess-scale');
  // The ends of the scale read in the level's own units, so level 5's slider runs
  // from "25%" to "100%" rather than from 0.25 to 1.
  scale.append(h('span', null, formatGuess(level, state.min)));
  scale.append(h('span', null, formatGuess(level, state.max)));
  view.append(slider, scale, hint, reveal);

  if (!round.fixed) {
    view.append(button('Back to the build', 'btn btn-quiet btn-wide', () => {
      round.toBuild();
      ctx.draw();
    }));
  }
  view.append(footNotes(ctx.game));
  return view;
}

// ------------------------------------------------------------- the reveal

/**
 * How close the guess and the answer have to land, in percent of the scale,
 * before their labels stop anchoring on their own dot and anchor on the
 * midpoint between the two instead. 20 is generous on purpose: a label is
 * short - "your guess 3.2", two or three characters for the answer - but a
 * phone's screen is narrow enough that two own-anchored labels can still
 * reach each other well before their dots are this close.
 */
const CLOSE_LABEL_GAP = 20;

/**
 * How far the shared label anchor is kept from either end of the scale, in
 * percent, when the guess and the answer are close enough to share one (see
 * CLOSE_LABEL_GAP). Without this, a close pair that also lands near 0% or
 * 100% - a guess of 1.00 against an answer of 0.996, say - anchors its labels
 * at the very edge, and a label that grows away from the edge of the screen
 * still runs off the edge of the screen.
 */
const EDGE_LABEL_MARGIN = 32;

/**
 * The number line itself.
 *
 * The marks are in their FINAL positions in the markup, and the keyframes only
 * move them into place - so with motion turned off the screen is the same
 * screen, fully readable, with nothing missing. The two custom properties are
 * where the animation starts from, which only the round knows.
 *
 * aria-hidden, every bit of it: it is a drawing of two numbers that the panel
 * says in words directly above and below it, and a screen reader being walked
 * through "your guess 3.2, 3.00 needed, 2.06" a second time as disconnected
 * labels is being given the same information worse.
 */
export function numberLine(round, line) {
  const wrap = h('div', 'numberline');
  wrap.setAttribute('aria-hidden', 'true');
  wrap.style.setProperty('--guess-at', `${line.guessAt}%`);
  wrap.style.setProperty('--answer-at', `${line.answerAt}%`);
  wrap.style.setProperty('--span-from', `${line.spanFrom}%`);
  wrap.style.setProperty('--span-width', `${line.spanWidth}%`);

  wrap.append(h('span', 'numberline-track'));

  const span = h('span', round.result.passed === false ? 'numberline-span' : 'numberline-span numberline-span-pass');
  span.style.left = `${line.spanFrom}%`;
  span.style.width = `${line.spanWidth}%`;
  wrap.append(span);

  if (line.needAt !== null) {
    const need = h('span', 'numberline-need');
    need.style.left = `${line.needAt}%`;
    need.append(h('span', null, `${line.needShown} needed`));
    wrap.append(need);
  }

  // Whichever mark is further left gets its label pushed further left, and
  // the other right - a tie (guessAt === answerAt, a "spot on" guess) always
  // splits guess-left, answer-right. See the note below the dots for why that
  // alone is not enough when the two are this close.
  const guessOnLeft = line.guessAt <= line.answerAt;

  const guess = h('span', 'numberline-mark mark-guess');
  guess.style.left = `${line.guessAt}%`;
  wrap.append(guess);

  const answer = h('span', 'numberline-mark mark-answer');
  answer.style.left = `${line.answerAt}%`;
  wrap.append(answer);

  // THE LABELS ARE NOT CHILDREN OF THEIR DOTS. A guess that lands on or next
  // to the answer puts the two dots within a few pixels of each other, and a
  // label anchored "a fixed distance outside its own dot" still starts from
  // essentially the same point as the other one's and the two run together.
  // Within CLOSE_LABEL_GAP of each other, both labels instead anchor off the
  // MIDPOINT between the two dots and are told to grow away from each other
  // from there, which is the only anchor guaranteed not to coincide with
  // either dot. Further apart, each keeps anchoring off its own dot as
  // before - splitting away from the other mark, never centred under it,
  // since two centred labels can still touch before they are this close.
  const gap = Math.abs(line.guessAt - line.answerAt);
  const close = gap < CLOSE_LABEL_GAP;
  // PULLED IN FROM THE EDGE, every label's anchor, not only the shared one. A
  // guess of 1.00 on a -1-to-1 scale sits at 100% with an answer right beside
  // it - a real case, not a hypothetical, since a correlation this close to
  // the edge is what a 3-star answer on level 1 looks like - and a label that
  // grows away from a point that is already the edge grows straight off the
  // screen. A lone mark near 0% or 100% has the same problem with no second
  // mark in sight. The dots themselves stay exactly where the data puts
  // them; only the text's anchor is kept clear of the edge.
  const clampToEdge = (at) => Math.min(Math.max(at, EDGE_LABEL_MARGIN), 100 - EDGE_LABEL_MARGIN);
  const clusterAt = clampToEdge((line.guessAt + line.answerAt) / 2);

  const guessLabel = h('span', `numberline-label mark-guess-label ${guessOnLeft ? 'mark-label-left' : 'mark-label-right'}`,
    `your guess ${formatGuess(round.level, round.result.guess)}`);
  guessLabel.style.left = `${close ? clusterAt : clampToEdge(line.guessAt)}%`;
  wrap.append(guessLabel);

  const answerLabel = h('span', `numberline-label mark-answer-label ${guessOnLeft ? 'mark-label-right' : 'mark-label-left'}`,
    round.result.shown);
  answerLabel.style.left = `${close ? clusterAt : clampToEdge(line.answerAt)}%`;
  wrap.append(answerLabel);

  return wrap;
}

/**
 * Where the guess, the answer and the level's threshold fall on the reveal's
 * number line, as percentages across it.
 *
 * PURE, so it is tested in node without a document, the way guessSliderState()
 * and starsExplanation() are. The screen below is a thin wrapper around it.
 *
 * THE SCALE IS THE LEVEL'S OWN GUESS RANGE, which is the scale the player has
 * just been looking at: level 3 ran from 1.0 to 5.0 and the marks have to land
 * where that slider would have put them, or the reveal is drawn against a
 * different ruler from the question.
 *
 * AN ANSWER CAN FALL OUTSIDE IT, and that is not a bug to clamp away quietly.
 * levels.json records that level 5's share of risk can pass 100% when a holding
 * offsets the rest, and level 6's fall ratio reaches -0.117 on a legal build. A
 * mark is held to the ends of the line so it stays on the screen, and `beyond`
 * says it was held, so the caller can say so rather than drawing a dot in the
 * corner and hoping nobody asks.
 *
 * Returns null when there is nothing to draw a line for - a level with no
 * numeric guess, or a round that was never guessed.
 */
export function revealLine(round) {
  const result = round.result;
  if (!result || !Number.isFinite(result.guess) || !Number.isFinite(result.value)) return null;
  const { min, max } = round.guessRange();
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;

  // ROUNDED TO A THOUSANDTH OF THE LINE. The arithmetic gives 55.00000000000001
  // for a guess of 3.2 on a 1-to-5 scale, and that goes straight into a style
  // attribute: three decimals is finer than a pixel on any screen this runs on
  // and reads as a position rather than as a float.
  const round3 = (value) => Math.round(value * 1000) / 1000;
  const at = (value) => round3(((value - min) / (max - min)) * 100);
  const held = (value) => Math.min(100, Math.max(0, at(value)));

  const guessAt = held(result.guess);
  const answerAt = held(result.value);
  const threshold = round.level.pass?.threshold;
  const hasThreshold = Number.isFinite(threshold);

  return {
    min,
    max,
    guessAt,
    answerAt,
    // The span runs from whichever is further left, so it is a length rather
    // than a signed offset: it is drawn, and a drawing has no sign.
    spanFrom: Math.min(guessAt, answerAt),
    spanWidth: round3(Math.abs(answerAt - guessAt)),
    needAt: hasThreshold ? held(threshold) : null,
    needShown: hasThreshold ? formatGuess(round.level, threshold) : null,
    // How far out the guess was, in the level's own units and its own rounding.
    gap: Math.abs(result.guess - result.value),
    beyond: at(result.value) !== answerAt,
  };
}

/**
 * The gap in words, because a length on a line is not a quantity.
 *
 * "Spot on" rather than "out by 0.00": a guess that rounds to the answer in the
 * units the level shows has not missed by anything a player could have done
 * better, and telling them they were out by zero reads as a fault.
 */
export function gapSentence(round, line) {
  const places = guessPlaces(round.level);
  const shown = line.gap.toFixed(places);
  if (Number(shown) === 0) return 'Spot on.';
  return `Out by ${shown}.`;
}

/** The "there is more about this on the Research page" link, when a level has one. */
function whyMoreLink(more) {
  const wrap = h('p', 'explain explain-more');
  const link = h('a', null, more.text);
  link.setAttribute('href', more.href);
  wrap.append(link);
  return wrap;
}

/**
 * The reveal.
 *
 * Exported for tests/gameShare.test.js, which renders it to check that the
 * share card is offered where there is a verdict and nowhere else. A series
 * part has no verdict yet and must not offer one.
 */
export function renderReveal(ctx, round) {
  const level = round.level;
  const result = round.result;
  const view = h('div', 'view view-round');
  view.append(roundHead(ctx, round, 'Reveal'));

  // THE REPLAY ITSELF, on a level that is one. Level 6's answer is a ratio of
  // two falls, and the ratio alone is a number without a story: the two lines
  // are where a player sees their portfolio come apart from the index, or not.
  // Drawn from the same spec Crash replay uses, so the same history cannot be
  // drawn two ways.
  //
  // NOT DRAWN HERE. `plot` is not attached to the document yet - this function
  // only builds the view - so plot.clientWidth would read 0 and chartBox() would
  // fall back to its 720px default. ctx.draw() calls ctx.redrawChart() once the
  // view is live, exactly as js/crashReplay.js and js/research.js do.
  if (result.crash) {
    const plot = h('div', 'chart-plot');
    view.append(plot);
    ctx.redrawChart = () => renderLineChart(plot, {
      ...chartSpecFor(result.crash), ...chartBox(plot.clientWidth),
    });
  }

  const panel = h('div', 'reveal-panel');
  // ANNOUNCED. The reveal replaces the screen with the answer a player has been
  // waiting for, and until now a screen reader was told nothing: focus moved to
  // the view and the number arrived in silence.
  panel.setAttribute('role', 'status');
  // The level's own words for what the number is. It used to be a ternary on the
  // measure's name, which could only ever name two of the four measures.
  panel.append(h('p', 'reveal-label', level.revealLabel));
  panel.append(h('p', 'reveal-value', result.shown));
  // Which holding the number is about, on a level whose measure names one. Level
  // 5 shows "38%", and without this the player never learns whose 38% it was.
  if (result.aboutTicker) {
    panel.append(h('p', 'reveal-about', `That holding is ${result.aboutTicker}.`));
  }
  // On a replay, the two falls in plain words under the ratio. The ratio is the
  // level's answer; "your portfolio fell 5%, the index fell 34%" is what it means,
  // and the same sentence Crash replay prints under the same chart.
  if (result.crash) {
    panel.append(h('p', 'reveal-about', fallSentence(result.crash, { compare: false })));
  }
  panel.append(h('p', 'reveal-guess', `You guessed ${formatGuess(level, result.guess)}`));
  // THE NUMBER LINE: the guess, the answer, and the distance between them drawn
  // to scale on the level's own scale. It is the reveal's whole job - a player
  // who was out by 1.14 should see 1.14 of the line, not work it out from two
  // numbers - and it is why this screen is the one place in the game that moves.
  const line = revealLine(round);
  if (line) {
    panel.append(numberLine(round, line));

    // The ends of the scale, in the level's own units, so the drawing above is
    // readable as a measurement rather than as a picture.
    const ends = h('p', 'numberline-ends');
    ends.setAttribute('aria-hidden', 'true');
    ends.append(h('span', null, formatGuess(level, line.min)));
    ends.append(h('span', null, formatGuess(level, line.max)));
    panel.append(ends);

    // THE GAP IN WORDS, beside the drawing of it. A length on a line says "about
    // this far"; the sentence says how far, in the units the level answers in.
    const gap = h('p', 'reveal-gap');
    gap.append(h('strong', null, gapSentence(round, line)));
    if (line.beyond) {
      // The answer fell off the end of the level's own scale, which levels.json
      // records as reachable on levels 5 and 6. Saying so beats a dot parked at
      // the edge with nothing to explain it.
      gap.append(h('span', null, ' The answer is past the end of the scale, so its mark sits at the edge.'));
    }
    panel.append(gap);
  }
  if (result.line) {
    panel.append(h('p', result.passed ? 'reveal-line reveal-pass' : 'reveal-line reveal-fail', result.line));
  }
  view.append(panel);

  // A SERIES PART STOPS HERE. It has the answer and the guess, which is the
  // correction the player came for, and nothing else: no stars, no "Why?" card
  // and no verdict, because level 7 is decided by three guesses and two of them
  // may not be in yet. All of that is on the summary screen, once.
  if (ctx.series && result.passed === null) {
    const series = ctx.series;
    const last = !series.hasNext();
    // WHAT THE NUMBER IS ABOUT. The full reveal carries this below its stars; the
    // early return above skips that, and without it a player reading "4.15" has
    // the portfolio only on the screen before. The summary lists all three again.
    view.append(h('p', 'note', result.tickers
      .map((ticker) => `${ticker} ${money(result.dollars[ticker])}`).join(' · ')));
    view.append(h('p', 'note', `Measured over ${windowDays(result)} trading days, ${longDate(result.startDate)} to ${longDate(result.endDate)}.`));
    view.append(h('p', 'note', last
      ? 'That is the third. Next you will see all three together.'
      : `Portfolio ${series.at + 1} of ${series.count} answered. The next one comes with no hints from this one.`));
    view.append(button(last ? 'See how you did' : 'Next portfolio', 'btn btn-primary btn-wide', () => {
      if (last) ctx.finishSeries();
      else ctx.nextPortfolio();
    }));
    view.append(button('Back to the levels', 'btn btn-quiet btn-wide', () => ctx.toMenu()));
    view.append(footNotes(ctx.game));
    return view;
  }

  const stars = h('div', 'stars-panel');
  stars.append(h('p', 'stars-row', starText(result.stars)));
  stars.append(h('p', 'stars-why', starsExplanation(level, result)));
  view.append(stars);

  if (result.buckets) {
    const labels = result.buckets.labels;
    view.append(h('p', 'bucket-line',
      `That is ${labels[result.buckets.actual]}. You said ${labels[result.buckets.guess]}.`));
  }

  // The "Why?" card: the specific cause, in why.json's own words. It goes above
  // the level's general explanation because it is about THIS portfolio - the
  // pair the player picked, the group their money went into - and the general
  // text reads as the lesson behind it.
  if (result.whyCard) {
    const card = h('section', 'why-card');
    card.append(h('h2', 'why-card-head', 'Why?'));
    // Two templates from why.json, rendered as two lines. They are never joined
    // into one string: see the note at the top of js/why.js.
    if (result.whyCard.leadIn) card.append(h('p', 'why-card-lead', result.whyCard.leadIn));
    card.append(h('p', 'why-card-text', result.whyCard.text));
    view.append(card);
  }

  // Headed "The idea" rather than "Why", which the card above now carries.
  view.append(h('h2', 'section-head', 'The idea'));
  view.append(h('p', 'explain', level.explain));
  view.append(h('p', 'explain', level.why));
  // A level whose "why" points somewhere fuller says so with a link rather than
  // by printing the whole thing. Level 2's pool explanation is research method,
  // not teaching: the short line is what a player needs mid-round, and Research
  // mode carries the rest (BUILD_LOG.md session 2.35).
  if (level.whyMore) view.append(whyMoreLink(level.whyMore));

  const holdings = h('p', 'note', result.tickers
    .map((t) => (round.usesMoney ? `${t} ${money(result.dollars[t])}` : t))
    .join(' · '));
  view.append(holdings);
  view.append(h('p', 'note', `Measured over ${windowDays(result)} trading days, ${longDate(result.startDate)} to ${longDate(result.endDate)}.`));

  // The card. Below the level, above the buttons that leave it: a player reads
  // what happened, then decides whether to post it.
  view.append(shareRow(cardFromResult(
    level, result, shareUrl(ABOUT, globalThis.location ?? null), { subtitle: ctx.cardSubtitle ?? null },
  ), { note: wantsShareNote(ctx.session, level.id) }));

  // WHERE TO GO NEXT BELONGS TO THE MODE. Learn offers the next level and a
  // replay; the weekly challenge has neither - its next portfolio arrives on
  // Monday, and playing this one again would be a second go at the week.
  for (const node of (ctx.afterReveal ?? defaultAfterReveal)(ctx, round)) view.append(node);
  view.append(footNotes(ctx.game));
  return view;
}

/** Learn's own buttons: the next level, this one again, and the menu. */
function defaultAfterReveal(ctx, round) {
  const nodes = [];
  const next = ctx.nextLevelId(round.level.id);
  if (next !== null) {
    nodes.push(button(`Next: level ${next}`, 'btn btn-primary btn-wide', () => ctx.startRound(next)));
  }
  nodes.push(button('Play this level again', 'btn btn-quiet btn-wide', () => ctx.startRound(round.level.id)));
  nodes.push(button('Back to the levels', 'btn btn-quiet btn-wide', () => ctx.toMenu()));
  return nodes;
}

// --------------------------------------------------------- the share card

/**
 * "Share my score": the card, drawn and handed over.
 *
 * WHAT IS ON IT IS NOT DECIDED HERE. The content comes from js/shareCard.js as
 * plain data - the level, the stars, one headline, the link, the disclaimer -
 * and this function only paints it and passes it on. No text is added on the
 * way, which is what lets tests/shareCard.test.js say what a player can post
 * without rendering anything.
 *
 * THREE WAYS OUT, in order of what the device will take: the system share
 * sheet with the picture in it, which is what a phone gives; the sheet with
 * just the caption, on a browser that has one but will not take files; and a
 * download beside a copy-link button, which is every laptop. A Share button
 * that silently does nothing would be worse than none.
 *
 * NOTHING IS SENT ANYWHERE. Every path hands the image to the player.
 */
function shareRow(content, { note = true } = {}) {
  const row = h('div', 'share-row');
  const status = h('p', 'share-status');
  const holder = h('div', 'share-holder');
  const preview = h('div', 'share-preview');

  /** The fallback: the picture to keep, and the link to paste. */
  const offerFallback = (file) => {
    const actions = h('div', 'share-actions');
    actions.append(button('Download the image', 'btn btn-quiet', () => {
      downloadFile(file, content.fileName);
      status.textContent = 'Saved.';
    }));
    actions.append(button('Copy the link', 'btn btn-quiet', async () => {
      await copyOut(shareMessage(content), (said) => { status.textContent = said; }, holder);
    }));
    holder.replaceChildren(actions);
  };

  const share = button('Share my score', 'btn btn-quiet btn-wide share-card-button', async () => {
    status.textContent = 'Drawing your card…';
    try {
      // The fonts FIRST. A canvas paints with whatever is loaded when fillText
      // runs, so drawing before they arrive measures one face and paints another.
      await fontsReady();
      const canvas = document.createElement('canvas');
      drawShareCard(canvas, content);

      // The player sees what they are about to post before they post it.
      canvas.className = 'share-card-image';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', content.alt);
      preview.replaceChildren(canvas);

      const file = await canvasToFile(canvas, content.fileName);
      const outcome = await shareOut({ text: shareMessage(content), file });
      if (outcome === 'shared' || outcome === 'cancelled') {
        status.textContent = '';
        return;
      }
      status.textContent = 'Your card is ready.';
      offerFallback(file);
    } catch (error) {
      // A card that cannot be drawn says so, and still offers the link.
      status.textContent = `The card could not be made: ${error.message}`;
      await copyOut(shareMessage(content), (said) => { status.textContent = said; }, holder);
    }
  });

  row.append(share, status, preview, holder);
  if (note) {
    row.append(h('p', 'share-note',
      'The card shows your stars and one line about the result. Never your holdings, '
      + 'your money, or - on the mystery-portfolio levels - the answer.'));
  }
  return row;
}

/**
 * Should this reveal carry the share-card note?
 *
 * ONCE A VISIT. 23 words on every reveal is 69 across levels 1 to 3, where
 * reading is 89% of the time to finish (BUILD_LOG.md session 2.34), and a
 * player who read it on their first reveal does not need it on their third.
 *
 * KEYED TO THE LEVEL, NOT TOGGLED ON RENDER. draw() re-renders the same screen
 * on every slider nudge and every redraw; a flag flipped on first paint would
 * take the note off the very reveal it belongs to. The session remembers WHICH
 * level said it, so that one keeps it however often it is drawn.
 *
 * NO SESSION MEANS SHOW IT. A caller without one - a test, or anything new -
 * should fail towards saying what the card carries rather than towards silence.
 */
function wantsShareNote(session, levelId) {
  if (!session) return true;
  if (session.shareNoteLevel === null || session.shareNoteLevel === undefined) {
    session.shareNoteLevel = levelId;
    return true;
  }
  return session.shareNoteLevel === levelId;
}

/**
 * Why those stars, in the level's own words from levels.json. A player who got
 * 1 star should be able to read what the other two needed.
 *
 * IT ASKS WHICH BANDS WERE MET, NOT HOW MANY STARS THERE WERE, and that is the
 * bug this was written to fix (player feedback 3 of 16). The lines used to be
 * gated on `result.stars >= 2` and `>= 3`, which reads the bands off the count
 * - and the count does not carry them. js/levels.js's starsFor() awards the
 * BEST band met, so on levels 1, 4, 5 and 6 a guess can take the three-star
 * band while missing the two-star one: level 1's 0.69 against an actual 0.71
 * is within 0.10 and in the wrong bucket. That scored three stars and was told
 * "2 for naming the right bucket" - about a guess that named the wrong one.
 *
 * SO IT NEEDS THE GUESS AND THE ANSWER, which is why `result` must carry
 * `guess` and `value`. Every real result does; a caller that hands over
 * neither gets a sentence about no bands rather than a confident wrong one.
 *
 * AND IT SAYS THE RULE OUT LOUD in the case that exposed this. A player who
 * earns all three on the tight band alone is told that is what happened, since
 * "the tight band earns all three on its own" is exactly what the screen had
 * been denying. The bucket they actually named is on the line below this one,
 * from renderReveal's bucket line, so it is not repeated here.
 */
export function starsExplanation(level, result) {
  if (!result.passed) {
    return `No stars this time: ${level.pass.says} is what this level needs. The guess still counts - look at the number above.`;
  }
  const met = bandsMet(level, { guess: result.guess, actual: result.value });
  const parts = [`1 star for ${level.pass.says ?? 'passing'}`];
  if (met.two) parts.push(`2 for ${level.stars.two.says}`);
  if (met.three) parts.push(`3 for ${level.stars.three.says}`);
  if (!met.two && !met.three) parts.push(`2 stars needed ${level.stars.two.says}`);
  else if (met.two && !met.three) parts.push(`3 stars needed ${level.stars.three.says}`);
  const sentence = `${parts.join(', ')}.`;
  if (met.three && !met.two) {
    return `${sentence} The second star is for ${level.stars.two.says}, and this guess `
      + 'missed it - the tight band earns all three on its own.';
  }
  return sentence;
}

// --------------------------------------------------------------- the frame

/**
 * Level 7's last screen: the three portfolios together, the verdict and the stars.
 *
 * WHY THERE IS A SCREEN HERE AT ALL, and not just a verdict on the third reveal.
 * Each portfolio gets its own reveal, because a guess followed by its answer is
 * the learning moment and three of them are three moments. But the level is
 * decided by all three, and a player who has just been told about portfolio 3
 * cannot see the shape of their own three errors - which is the thing worth
 * seeing on a capstone. So the three answers are laid out side by side here,
 * once, with the card that names what they have in common.
 */
export function renderSeriesSummary(ctx, series) {
  const level = series.level;
  const verdict = series.verdict();
  const view = h('div', 'view view-round');

  const head = h('header', 'round-head');
  head.append(h('p', 'round-step', `Level ${level.id} · All ${series.count} portfolios`));
  head.append(h('h1', null, level.title));
  view.append(head);

  const panel = h('div', 'reveal-panel');
  panel.append(h('p', 'reveal-label', level.pass.says));
  panel.append(h('p', 'reveal-value', `${verdict.withinPassBand} of ${series.count}`));
  panel.append(h('p', verdict.passed ? 'reveal-line reveal-pass' : 'reveal-line reveal-fail',
    seriesLine(series, verdict)));
  view.append(panel);

  const stars = h('div', 'stars-panel');
  stars.append(h('p', 'stars-row', starText(verdict.stars)));
  stars.append(h('p', 'stars-why', seriesStarsExplanation(level, verdict)));
  view.append(stars);

  // The three, in the order they were played, each with what it held, what it
  // answered and what was guessed. This is the table a player reads to find
  // their own mistake, so the holdings are here and not only on the reveal.
  view.append(h('h2', 'section-head', 'Your three guesses'));
  const list = h('ol', 'series-list');
  series.answers.forEach((answerRow, index) => {
    const result = series.rounds[index].result;
    const item = h('li', verdict.parts[index].within ? 'series-row series-hit' : 'series-row series-miss');
    // THE ANSWER TO 2 DECIMALS, THE GUESS TO 1, which is the rule the one-guess
    // reveal already follows: guess.places describes the slider, which moves in
    // tenths, while a revealed answer is worth two decimals. Reading both off the
    // slider's places made this screen say "1.2" where the reveal before it said
    // "1.20" about the same portfolio.
    item.append(h('p', 'series-row-head',
      `Portfolio ${answerRow.part}: ${result.shown} bets`));
    item.append(h('p', 'series-row-guess',
      `You guessed ${formatGuess(level, answerRow.guess)} — out by ${verdict.parts[index].error.toFixed(2)}`));
    item.append(h('p', 'note', result.tickers.map((t) => `${t} ${money(result.dollars[t])}`).join(' · ')));
    list.append(item);
  });
  view.append(list);

  if (series.whyCard) {
    const card = h('section', 'why-card');
    card.append(h('h2', 'why-card-head', 'Why?'));
    card.append(h('p', 'why-card-text', series.whyCard.text));
    view.append(card);
  }

  view.append(h('h2', 'section-head', 'The idea'));
  view.append(h('p', 'explain', level.explain));
  view.append(h('p', 'explain', level.why));
  // A level whose "why" points somewhere fuller says so with a link rather than
  // by printing the whole thing. Level 2's pool explanation is research method,
  // not teaching: the short line is what a player needs mid-round, and Research
  // mode carries the rest (BUILD_LOG.md session 2.35).
  if (level.whyMore) view.append(whyMoreLink(level.whyMore));

  const days = series.rounds[0].result.days;
  const first = series.rounds[0].result;
  view.append(h('p', 'note', `Each portfolio measured over ${days} trading days, ${longDate(first.startDate)} to ${longDate(first.endDate)}.`));

  // Level 7's card is built from the VERDICT and nothing else - not from the
  // three results - because the stars are all it is allowed to know. Its three
  // portfolios come from the pools, and other players will be dealt them.
  view.append(shareRow(cardFromSeries(level, verdict, shareUrl(ABOUT, globalThis.location ?? null)),
    { note: wantsShareNote(ctx.session, level.id) }));

  view.append(button('Play this level again', 'btn btn-primary btn-wide', () => ctx.startRound(level.id)));
  view.append(button('Back to the levels', 'btn btn-quiet btn-wide', () => ctx.toMenu()));
  view.append(footNotes(ctx.game));
  return view;
}

/**
 * The verdict in the level's own words.
 *
 * It names the WORST guess on a miss, because that is the one that decided the
 * level: "two of three" reads like a near miss when the third was out by 3 bets.
 */
export function seriesLine(series, verdict) {
  if (verdict.passed) {
    return `Every guess was within ${series.level.pass.of}, so the level is passed.`;
  }
  const missed = verdict.parts.filter((part) => !part.within).length;
  return `${missed === 1 ? 'One guess was' : `${missed} guesses were`} out by more than `
    + `${series.level.pass.of} — the worst by ${verdict.worstError.toFixed(2)} — `
    + `and this level needs all ${series.count} inside it.`;
}

/**
 * Why those stars, in levels.json's own words.
 *
 * The bands are counts here rather than distances, so the wording comes from the
 * level's own `says` lines - the same way starsExplanation() reads the one-guess
 * bands - and no number in this sentence is written twice.
 */
export function seriesStarsExplanation(level, verdict) {
  if (!verdict.passed) {
    return `No stars this time: ${level.pass.says} is what this level needs. `
      + 'The guesses still count - look at the three answers below.';
  }
  const parts = [`1 star for ${level.pass.says}`];
  if (verdict.stars >= 2) parts.push(`2 for ${level.stars.two.says}`);
  if (verdict.stars >= 3) parts.push(`3 for ${level.stars.three.says}`);
  if (verdict.stars < 3) {
    const needed = verdict.stars < 2 ? level.stars.two : level.stars.three;
    parts.push(`${verdict.stars + 1} needs ${needed.says}`);
  }
  return `${parts.join('; ')}.`;
}

function roundHead(ctx, round, step) {
  const head = h('header', 'round-head');
  // ON A SERIES, WHERE THE PLAYER IS. "Portfolio 2 of 3" is the only thing on
  // these screens that says the level is not over, and without it the second
  // portfolio reads as a replay of the first.
  const series = ctx.series;
  const inSeries = series && series.rounds[series.at] === round;
  head.append(h('p', 'round-step', inSeries
    ? `Level ${round.level.id} · Portfolio ${series.at + 1} of ${series.count} · ${step}`
    : `Level ${round.level.id} · ${step}`));
  head.append(h('h1', null, round.level.title));
  return head;
}

// ---------------------------------------------------------------- mounting

/**
 * Put the Learn mode on the page.
 *
 * The session is passed in so that a caller - a test, or a later session that
 * adds storage - can supply one. Without it, progress starts fresh.
 */
export async function mountLearn(root, { session = null, progress = null } = {}) {
  root.replaceChildren(h('p', 'loading', 'Loading the levels and the live prices…'));
  let levels;
  let tickers;
  let why;
  let basket;
  let names = null;
  let game;
  let crashes;
  try {
    const [levelsResponse, tickersResponse, whyResponse, basketResponse] = await Promise.all([
      fetch(LEVELS_URL, { cache: 'no-cache' }),
      fetch(TICKERS_URL, { cache: 'no-cache' }),
      fetch(WHY_URL, { cache: 'no-cache' }),
      fetch(BASKET_URL, { cache: 'no-cache' }),
    ]);
    if (!levelsResponse.ok) throw new Error(`${LEVELS_URL} returned ${levelsResponse.status}`);
    if (!tickersResponse.ok) throw new Error(`${TICKERS_URL} returned ${tickersResponse.status}`);
    if (!whyResponse.ok) throw new Error(`${WHY_URL} returned ${whyResponse.status}`);
    if (!basketResponse.ok) throw new Error(`${BASKET_URL} returned ${basketResponse.status}`);
    levels = validateLevels(await levelsResponse.json());
    tickers = await tickersResponse.json();
    why = validateWhy(await whyResponse.json());
    basket = basketFrom(await basketResponse.json());
    // WHAT EACH TICKER IS, and a failure here is not fatal. Every screen
    // falls back to the bare symbol it showed before this file existed, which
    // is worse but still playable - unlike a missing price, which makes the
    // round meaningless. So this one is caught on its own.
    try {
      names = await loadNames();
    } catch {
      names = null;
    }
    game = await loadGameData();
    // Level 6's prices, which are a different file from the rest of the game's:
    // a fixed stretch of 2020 that never moves. Loaded with everything else
    // rather than when the level starts, so a missing file is one error on the
    // way in instead of a dead end three screens deep.
    crashes = await loadCrashes();
  } catch (error) {
    root.replaceChildren();
    root.append(errorView('Learn', `The game could not load its data: ${error.message}. Serve the page from the project root with "python3 -m http.server 8000", and check that data/game.json and ${CRASHES_URL} are there.`));
    return null;
  }

  const universe = tickers.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
  // Ticker -> group, which the "Why?" card's group rule names.
  const groups = groupIndex(tickers);

  // WHAT THIS BROWSER REMEMBERS, read once on the way in. The session is seeded
  // from it, so the stars on the level list are the saved ones.
  const saved = progress ?? loadProgress();
  const live = session ?? newSession(saved);

  // One painter for this mode's whole lifetime: it is what remembers which
  // screen was on last, and that is the only state needed to tell a new screen
  // from a redraw.
  const paint = createScreen(root);

  const ctx = {
    progress: saved,
    /** What each ticker is, or null if names.json could not be read. */
    names,
    // Whether this browser saves at all, settled once by writing back the
    // record we just read - harmless, and the only honest way to find out.
    // The menu says so plainly when it is false.
    canSave: saveProgress(saved),
    askingReset: false,
    redraw() { ctx.draw(); },
    levels,
    tickers,
    why,
    basket,
    game,
    round: null,
    /** The live series, on a level that asks three questions. Null on every other. */
    series: null,
    /** Is the series over and its summary on screen? */
    showSummary: false,
    /**
     * The anonymous records this play has produced, in the order they were sent.
     * Kept so the Worker session has somewhere to attach and so a test can read
     * them; NOTHING LEAVES THE BROWSER TODAY, and tests/guessRecords.test.js
     * renders this mode with every outward route watched to keep it that way.
     */
    records: [],
    /**
     * One record, completed to the five fields PREREG.md registers.
     *
     * js/round.js supplies the level, the guess and the actual value, and stops
     * there on purpose: it has no storage and no clock, and the remaining two
     * fields are neither about the round. They are added here, at the one place
     * records are collected, so there is a single answer to "what exactly does a
     * record contain" rather than one per level.
     *
     * THE ID IS READ PER RECORD, not once per session, because a browser that
     * could not store one would otherwise hand every record the same fresh ID
     * from the first call and look, to the Worker, like a player who had stored
     * it. Reading each time means an unstorable browser produces a new ID per
     * record and is visible as what it is.
     */
    record(record) {
      const row = {
        id: participantId().id,
        ...record,
        date: ctx.today(),
      };
      ctx.records.push(row);
      // AND OUT IT GOES, now that there is somewhere to send it. One send per
      // locked guess, never batched, because arrival order is the only thing
      // that tells level 7's three rows apart - PREREG_AMENDMENT_3.md section
      // 1. Fire and forget: js/analytics.js cannot throw into this, and a
      // failed send costs a row and nothing else. `ctx.records` keeps every
      // row in memory either way, which is what the tests read.
      ctx.sendGuess(row);
      return row;
    },
    /** Injectable so a test can watch the sends without a network. */
    sendGuess,
    sendPing,
    /** Today, as the date a record carries. Injectable so a test can fix it. */
    today: () => new Date().toISOString().slice(0, 10),
    /** This visit's draws and stars, seeded from the saved record. */
    session: live,
    nextLevelId(id) {
      const ids = levels.levels.map((l) => l.id);
      const at = ids.indexOf(id);
      return at >= 0 && at + 1 < ids.length ? ids[at + 1] : null;
    },
    crashes,
    /** Set by a reveal that draws a chart, and only once the view is attached. */
    redrawChart: null,
    startRound(levelId) {
      // ONE PING PER LEVEL PER VISIT, and the dedup has to be here rather than
      // at the Worker: a ping carries no per-browser id (docs/PRD.md's "What
      // leaves the browser"), so nothing downstream can tell a replay from a
      // new player. Without this, a level somebody retries four times counts
      // four times, and "players who reached level 7" becomes "attempts".
      if (!ctx.session.pingedLevels.has(levelId)) {
        ctx.session.pingedLevels.add(levelId);
        // AND WHETHER EVERYTHING BEFORE IT WAS PASSED. Since session 2.38 a
        // level unlocks by being played rather than passed, so reaching level
        // 4 no longer means level 3 was passed - and docs/PRD.md measures
        // "players who finish level 3" by level 4's pings. The ping carries
        // the answer rather than the target being read off a weaker event.
        // Taken HERE, at the moment of reaching, which is the moment the
        // target is about.
        ctx.sendPing(levelId, allPassedBefore(ctx.progress, levels.levels, levelId));
      }
      // A LEVEL THAT ASKS THREE QUESTIONS STARTS A SERIES, not a round. One
      // entry point, so a menu button, a "Next level" button and a replay all
      // reach the right one without any of them knowing which levels are which.
      const level = levelById(levels, levelId);
      if (isSeries(level)) {
        ctx.round = null;
        ctx.series = createSeries({
          levels,
          levelId,
          game,
          universe,
          groups,
          why,
          basket,
          crashes,
          // The portfolios this browser has already been shown. Level 7's first
          // question leaves out the one level 2 dealt: see BUILD_LOG.md 2.10.
          seenPoolIds: seenPoolIds(live),
          // Each record goes the moment its guess is locked, never batched, so
          // that arrival order matches portfolio order - which is the only thing
          // that tells three level-7 records apart. Nothing is sent anywhere yet:
          // the Worker is a later session, and this is where it will attach.
          emit: (record) => ctx.record(record),
        });
        ctx.showSummary = false;
        ctx.draw();
        return;
      }
      ctx.series = null;
      ctx.round = createRound({
        levels, levelId, game, universe, groups, why, basket, crashes,
        // LEVEL 2'S RECORD, which is half of Hypothesis 3. Its error is what the
        // sign test pairs with the same player's level-7 error, so a round that
        // sent nothing here would leave the registered test uncomputable - and
        // uncomputable silently, 60 days after launch, with level 7's rows
        // arriving all along. Every other single-question level passes no emit
        // and therefore sends nothing.
        emit: RECORDING_LEVELS.includes(levelId) ? (record) => ctx.record(record) : undefined,
      });
      ctx.draw();
    },
    /** Move the series on, once the live guess is locked and its record is sent. */
    nextPortfolio() {
      ctx.series.advance();
      ctx.draw();
    },
    /** All three answered: score them together and show the summary. */
    finishSeries() {
      const series = ctx.series;
      // The card is worked out ONCE, here, and kept on the series. Rebuilding it
      // on every redraw would let a resize change which card a player is reading.
      series.whyCard = why ? pickSeriesWhy(seriesFacts(series.answers.map((answerRow, i) => {
        const result = series.rounds[i].result;
        return {
          guess: answerRow.guess,
          actual: result.value,
          holdings: result.tickers.length,
          groups: new Set(result.tickers.map((ticker) => groups.get(ticker)?.key)).size,
        };
      })), why) : null;
      for (const shown of series.shownIds()) {
        recordResult(live, series.levelId, {
          stars: series.verdict().stars, drawnId: shown.id, drawnPool: shown.pool,
        });
      }
      // SAVED ONCE, from the verdict: level 7 is decided by all three guesses
      // together, and its error is the worst of them - see guessError().
      ({ progress: ctx.progress } = saveResult(ctx.progress, series.levelId, series.verdict()));
      ctx.showSummary = true;
      ctx.draw();
    },
    toMenu() {
      ctx.round = null;
      ctx.series = null;
      ctx.showSummary = false;
      ctx.draw();
    },
    finish(round) {
      recordResult(live, round.levelId, round.result);
      // A SERIES PART IS NOT SAVED. Level 7 has no verdict until all three are
      // in, and a part's own stars are null; finishSeries() saves it once.
      if (round.result.passed !== null) {
        ({ progress: ctx.progress } = saveResult(ctx.progress, round.levelId, {
          stars: round.result.stars,
          guess: round.result.guess,
          actual: round.result.value,
        }));
      }
      ctx.draw();
    },
    /**
     * WHICH SCREEN IS ON, as a string js/screen.js can compare.
     *
     * It is what tells a new screen from a redraw of the one already there. A
     * tapped chip, a + on a slider and an asked-for reset all leave this the
     * same, so the player keeps their place; moving from build to guess, or
     * from one level to the next, changes it and starts at the heading.
     *
     * The level id is in it because "build" on level 3 and "build" on level 4
     * are different screens, and the series part is in it because portfolio 2
     * of 3 is a new question even though the state is the same.
     */
    screenKey() {
      if (ctx.series && ctx.showSummary) return `summary:${ctx.series.levelId}`;
      const round = ctx.round;
      if (!round) return 'menu';
      const part = ctx.series ? `:${ctx.series.at}` : '';
      return `${round.state}:${round.levelId}${part}`;
    },
    draw() {
      // A SERIES RENDERS ITS LIVE QUESTION through the same three screens every
      // other level uses; only the summary is its own. ctx.round is kept in step
      // so that renderBuild, renderGuess and renderReveal need to know nothing
      // about series at all.
      if (ctx.series) ctx.round = ctx.showSummary ? null : ctx.series.current();
      const round = ctx.round;
      // Cleared before every screen: only a reveal with a replay in it sets one,
      // so a resize on any other screen has nothing to redraw.
      ctx.redrawChart = null;
      let view;
      if (ctx.series && ctx.showSummary) view = renderSeriesSummary(ctx, ctx.series);
      else if (!round) view = renderMenu(ctx);
      else if (round.state === BUILD) view = renderBuild(ctx, round);
      else if (round.state === GUESS) view = renderGuess(ctx, round);
      else if (round.state === REVEAL) view = renderReveal(ctx, round);
      else throw new Error(`unknown round state ${round.state}`);
      paint(view, ctx.screenKey(), () => {
        // The chart is drawn AFTER attachment, once the plot div has a real
        // clientWidth to size itself against - see the note in renderReveal().
        if (ctx.redrawChart) ctx.redrawChart();
      });
    },
  };

  // One resize listener for the mode's whole lifetime, as js/crashReplay.js and
  // js/research.js have: a chart drawn at one width has to be redrawn at another,
  // and only a level 6 reveal has one to redraw.
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    if (ctx.redrawChart && root.isConnected) ctx.redrawChart();
  });

  ctx.draw();
  return ctx;
}
