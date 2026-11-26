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
import { validateLevels, displayFor, formatGuess, LEVELS_URL } from './levels.js';
import { BUILD, GUESS, REVEAL, createRound, DOLLAR_STEP } from './round.js';
import { WHY_URL, groupIndex, validateWhy } from './why.js';

export const TICKERS_URL = 'tickers.json';

/**
 * The AI basket, frozen at the prereg tag. Level 4 measures a beta to it, and it
 * is read from the registered file rather than repeated in the game's own data:
 * basket.json is authoritative, and a test holds the level to its 13 names.
 */
export const BASKET_URL = 'basket.json';

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

// ------------------------------------------------------------------ DOM bits

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function button(label, className, onClick, { disabled = false, aria = null } = {}) {
  const node = h('button', className, label);
  node.type = 'button';
  node.disabled = disabled;
  if (aria) node.setAttribute('aria-label', aria);
  node.addEventListener('click', onClick);
  return node;
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

/** The money, as a player reads it. */
export function money(dollars) {
  return `$${dollars.toLocaleString('en-US')}`;
}

// ------------------------------------------------------------- the session

/**
 * What this browser tab remembers. In memory only, by design for now: nothing
 * is written to storage and nothing leaves the browser.
 */
export function newSession() {
  return {
    stars: new Map(),          // level id -> best stars so far
    drawnPoolIds: new Set(),   // pool portfolios already seen, for level 7 later
  };
}

/** Record a finished round. The best score for a level stands. */
export function recordResult(session, levelId, result) {
  const best = Math.max(session.stars.get(levelId) ?? 0, result.stars);
  session.stars.set(levelId, best);
  if (result.drawnId) session.drawnPoolIds.add(result.drawnId);
  return session;
}

// --------------------------------------------------------------- the menu

function levelCard(ctx, level) {
  const card = h('article', 'level-card');
  const head = h('header', 'level-card-head');
  head.append(h('h2', null, `${level.id}. ${level.title}`));
  const stars = ctx.session.stars.get(level.id);
  head.append(h('span', stars ? 'level-stars' : 'level-stars level-stars-none',
    stars ? starText(stars) : 'not played'));
  card.append(head);
  card.append(h('p', 'level-concept', level.concept));
  card.append(h('p', 'level-challenge', level.challenge));
  card.append(button(stars ? 'Play again' : 'Play', 'btn btn-primary btn-wide',
    () => ctx.startRound(level.id)));
  return card;
}

function renderMenu(ctx) {
  const view = h('div', 'view');
  view.append(h('h1', null, 'Learn'));
  view.append(h('p', 'lede', 'Build a portfolio with $10,000 of pretend money, guess how many separate bets you made, then see the answer worked out from real prices.'));
  const list = h('div', 'level-list');
  for (const level of ctx.levels.levels) list.append(levelCard(ctx, level));
  view.append(list);
  view.append(h('p', 'note', 'Levels 6 and 7 are still being built. Returns never score anything here, and there is no leaderboard.'));
  view.append(footNotes(ctx.game));
  return view;
}

// -------------------------------------------------------------- the build

/** The level's pool, laid out under its group headings. */
function tickerPicker(ctx, round) {
  const wrap = h('div', 'picker');
  const inPool = new Set(round.pool);

  for (const group of ctx.tickers.groups) {
    const names = group.tickers
      .map((t) => (typeof t === 'string' ? t : t.ticker))
      .filter((t) => inPool.has(t));
    if (names.length === 0) continue;

    const section = h('section', 'picker-group');
    section.append(h('h3', 'picker-group-label', group.label));
    const row = h('div', 'picker-row');
    for (const ticker of names) {
      const held = round.hasPick(ticker);
      // A holding the level deals and keeps - level 4's QQQ - is shown held and
      // locked rather than tappable and then refused. The round throws if it is
      // removed, and a button whose only outcome is an error is not a button.
      const locked = round.required.includes(ticker);
      const node = button(ticker, [
        'chip', held ? 'chip-on' : null, locked ? 'chip-locked' : null,
      ].filter(Boolean).join(' '), () => {
        round.togglePick(ticker);
        ctx.draw();
      }, {
        // A full pool stays tappable for the names already held, so a player can
        // always swap one out; the rest go flat rather than vanishing.
        disabled: locked || (!held && !round.canAddPick()),
        aria: locked
          ? `${ticker} is required on this level`
          : `${held ? 'Remove' : 'Add'} ${ticker}`,
      });
      node.setAttribute('aria-pressed', String(held));
      row.append(node);
    }
    section.append(row);
    wrap.append(section);
  }
  return wrap;
}

/** The $10,000, split across the holdings, moved in $100 steps. */
function allocator(ctx, round) {
  const wrap = h('div', 'allocator');
  wrap.append(h('h3', 'allocator-head', `Split your ${money(round.total)}`));
  for (const ticker of round.picks) {
    const dollars = round.dollars[ticker] ?? 0;
    const row = h('div', 'alloc-row');
    row.append(h('span', 'alloc-ticker', ticker));
    const amount = h('span', 'alloc-amount');
    amount.append(h('strong', null, money(dollars)));
    amount.append(h('span', 'alloc-share', `${Math.round((dollars / round.total) * 100)}%`));
    row.append(amount);
    const buttons = h('div', 'alloc-buttons');
    // A step that cannot be taken is not offered. On level 4 that is QQQ at its
    // $3,000 floor, and on every level it is the last $100 of any holding: the
    // level asked for this many holdings, and a holding of nothing is one fewer.
    buttons.append(button('−', 'btn btn-step', () => {
      round.adjustDollars(ticker, -1);
      ctx.draw();
    }, { aria: `Take ${money(DOLLAR_STEP)} off ${ticker}`, disabled: !round.canLower(ticker) }));
    buttons.append(button('+', 'btn btn-step', () => {
      round.adjustDollars(ticker, 1);
      ctx.draw();
    }, { aria: `Add ${money(DOLLAR_STEP)} to ${ticker}`, disabled: !round.canRaise(ticker) }));
    row.append(buttons);
    wrap.append(row);
  }
  wrap.append(h('p', 'note', `Moves in ${money(DOLLAR_STEP)} steps, always adding up to ${money(round.total)}. It starts split evenly.`));
  // The floors a level puts under a holding, named with the number the level
  // asks for and the dollars it comes to, so the locked - button has a reason
  // beside it rather than just being flat.
  for (const line of floorNotes(round)) wrap.append(h('p', 'note note-floor', line));
  return wrap;
}

/**
 * One line per holding the level puts a floor under: level 4's "at least 30% in
 * QQQ", as a share and as the money it works out to.
 */
export function floorNotes(round) {
  const shares = round.level.holdings?.minShare ?? {};
  return Object.entries(shares).map(([ticker, share]) => {
    const floor = round.floorOf(ticker);
    return `${ticker} stays at ${money(floor)} or more: the ${Math.round(share * 100)}% `
      + `this level asks you to keep in it.`;
  });
}

function renderBuild(ctx, round) {
  const view = h('div', 'view view-round');
  view.append(roundHead(ctx, round, 'Build'));
  view.append(h('p', 'lede', round.level.challenge));

  if (round.fixed) {
    view.append(h('h3', 'allocator-head', 'Your starter portfolio'));
    const list = h('ul', 'holding-list');
    for (const ticker of round.picks) {
      const item = h('li', 'holding');
      item.append(h('span', 'alloc-ticker', ticker));
      item.append(h('span', 'alloc-amount', money(round.dollars[ticker])));
      list.append(item);
    }
    view.append(list);
    view.append(h('p', 'note', 'This one is dealt to you, drawn at random from a pool of 20. Guessing comes next.'));
  } else {
    const count = round.wanted === null
      ? `${round.picks.length} picked`
      : `${round.picks.length} of ${round.wanted} picked`;
    view.append(h('p', 'picker-count', count));
    view.append(tickerPicker(ctx, round));
    if (round.usesMoney && round.picks.length > 0) view.append(allocator(ctx, round));
  }

  const ready = round.buildComplete();
  view.append(button('Next: your guess', 'btn btn-primary btn-wide', () => {
    round.toGuess();
    ctx.draw();
  }, { disabled: !ready }));
  if (!ready && !round.fixed) {
    const left = round.wanted === null ? null : round.wanted - round.picks.length;
    view.append(h('p', 'note', left === null
      ? 'Pick your holdings to carry on.'
      : `Pick ${left} more ${left === 1 ? 'holding' : 'holdings'} to carry on.`));
  }
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

function renderGuess(ctx, round) {
  const level = round.level;
  const view = h('div', 'view view-round');
  view.append(roundHead(ctx, round, 'Guess'));
  view.append(h('p', 'lede', level.guess.prompt));

  view.append(h('p', 'guess-holdings', round.picks.join(' · ')));

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
  slider.min = String(state.min);
  slider.max = String(state.max);
  slider.step = String(state.step);
  slider.value = String(state.value);
  slider.setAttribute('aria-label', level.guess.prompt);
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

function renderReveal(ctx, round) {
  const level = round.level;
  const result = round.result;
  const view = h('div', 'view view-round');
  view.append(roundHead(ctx, round, 'Reveal'));

  const panel = h('div', 'reveal-panel');
  // The level's own words for what the number is. It used to be a ternary on the
  // measure's name, which could only ever name two of the four measures.
  panel.append(h('p', 'reveal-label', level.revealLabel));
  panel.append(h('p', 'reveal-value', result.shown));
  // Which holding the number is about, on a level whose measure names one. Level
  // 5 shows "38%", and without this the player never learns whose 38% it was.
  if (result.aboutTicker) {
    panel.append(h('p', 'reveal-about', `That holding is ${result.aboutTicker}.`));
  }
  panel.append(h('p', 'reveal-guess', `You guessed ${formatGuess(level, result.guess)}`));
  if (result.line) {
    panel.append(h('p', result.passed ? 'reveal-line reveal-pass' : 'reveal-line reveal-fail', result.line));
  }
  view.append(panel);

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
    card.append(h('h3', 'why-card-head', 'Why?'));
    // Two templates from why.json, rendered as two lines. They are never joined
    // into one string: see the note at the top of js/why.js.
    if (result.whyCard.leadIn) card.append(h('p', 'why-card-lead', result.whyCard.leadIn));
    card.append(h('p', 'why-card-text', result.whyCard.text));
    view.append(card);
  }

  // Headed "The idea" rather than "Why", which the card above now carries.
  view.append(h('h3', null, 'The idea'));
  view.append(h('p', 'explain', level.explain));
  view.append(h('p', 'explain', level.why));

  const holdings = h('p', 'note', result.tickers
    .map((t) => (round.usesMoney ? `${t} ${money(result.dollars[t])}` : t))
    .join(' · '));
  view.append(holdings);
  view.append(h('p', 'note', `Measured over ${result.days} trading days, ${result.startDate} to ${result.endDate}.`));

  const next = ctx.nextLevelId(level.id);
  if (next !== null) {
    view.append(button(`Next: level ${next}`, 'btn btn-primary btn-wide', () => ctx.startRound(next)));
  }
  view.append(button('Play this level again', 'btn btn-quiet btn-wide', () => ctx.startRound(level.id)));
  view.append(button('Back to the levels', 'btn btn-quiet btn-wide', () => ctx.toMenu()));
  view.append(footNotes(ctx.game));
  return view;
}

/**
 * Why those stars, in the level's own words from levels.json. A player who got
 * 1 star should be able to read what the other two needed.
 */
export function starsExplanation(level, result) {
  if (!result.passed) {
    return `No stars this time: ${level.pass.says} is what this level needs. The guess still counts - look at the number above.`;
  }
  const parts = [`1 star for ${level.pass.says ?? 'passing'}`];
  if (result.stars >= 2) parts.push(`2 for ${level.stars.two.says}`);
  if (result.stars >= 3) parts.push(`3 for ${level.stars.three.says}`);
  if (result.stars === 1) parts.push(`2 stars needed ${level.stars.two.says}`);
  if (result.stars === 2) parts.push(`3 stars needed ${level.stars.three.says}`);
  return `${parts.join(', ')}.`;
}

// --------------------------------------------------------------- the frame

function roundHead(ctx, round, step) {
  const head = h('header', 'round-head');
  head.append(h('p', 'round-step', `Level ${round.level.id} · ${step}`));
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
export async function mountLearn(root, { session = newSession() } = {}) {
  root.replaceChildren(h('p', 'loading', 'Loading the levels and the live prices…'));
  let levels;
  let tickers;
  let why;
  let basket;
  let game;
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
    game = await loadGameData();
  } catch (error) {
    root.replaceChildren();
    const failed = h('div', 'view');
    failed.append(h('h1', null, 'Learn'));
    failed.append(h('p', 'error', `The game could not load its data: ${error.message}. Serve the page from the project root with "python3 -m http.server 8000", and check that data/game.json is there.`));
    failed.append(h('p', 'disclaimer-inline', DISCLAIMER));
    root.append(failed);
    return null;
  }

  const universe = tickers.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
  // Ticker -> group, which the "Why?" card's group rule names.
  const groups = groupIndex(tickers);

  const ctx = {
    levels,
    tickers,
    why,
    basket,
    game,
    session,
    round: null,
    nextLevelId(id) {
      const ids = levels.levels.map((l) => l.id);
      const at = ids.indexOf(id);
      return at >= 0 && at + 1 < ids.length ? ids[at + 1] : null;
    },
    startRound(levelId) {
      ctx.round = createRound({ levels, levelId, game, universe, groups, why, basket });
      ctx.draw();
    },
    toMenu() {
      ctx.round = null;
      ctx.draw();
    },
    finish(round) {
      recordResult(session, round.levelId, round.result);
      ctx.draw();
    },
    draw() {
      const round = ctx.round;
      let view;
      if (!round) view = renderMenu(ctx);
      else if (round.state === BUILD) view = renderBuild(ctx, round);
      else if (round.state === GUESS) view = renderGuess(ctx, round);
      else if (round.state === REVEAL) view = renderReveal(ctx, round);
      else throw new Error(`unknown round state ${round.state}`);
      root.replaceChildren(view);
      // A new screen starts at its heading, not wherever the last one was
      // scrolled to, which on a phone is halfway down a ticker list.
      root.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    },
  };

  ctx.draw();
  return ctx;
}
