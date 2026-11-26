// js/sandbox.js - Sandbox: build any portfolio, see every measure.
//
// docs/PRD.md, Game modes: "Build any portfolio from the full ticker list and
// see every measure." There is no guess here and no stars, and that is the
// difference from Learn rather than an omission: a level asks for a prediction
// first because "predicting and then being corrected is the main learning
// moment", and this mode is for the player who has already been corrected and
// now wants to take a portfolio apart.
//
// SO THERE IS NO ROUND. js/round.js refuses to reveal before a guess, by design,
// and computes the one measure its level asks about. This mode needs all of them
// and none of that, so it reads js/measures.js instead - which is the same
// js/math.js underneath, assembled differently.
//
// THE BUILD SCREEN IS LEARN'S, unchanged: js/build.js's picker and allocator over
// js/crash.js's level-free build object. $10,000 of pretend money in $100 steps,
// exactly as every other mode, so a player who has played a level already knows
// how to drive this one.
//
// WHAT IT NEVER DOES: no storage of any kind, no guess record, no ping, no share
// card, and nothing in the URL beyond the mode name. There is nothing here worth
// saving - a sandbox portfolio is a question, not a result - and the Worker has
// two kinds of message, a count ping and a guess record, of which this mode has
// neither to send.
//
// WHY THE CORRELATIONS ARE A LIST AND NOT A GRID. A 40-holding portfolio has 780
// pairs, and a 40-column table cannot be read on a phone without the sideways
// scrolling docs/PRD.md's phone-first rule forbids. The pairs are ranked closest
// first instead, which is also the order that answers the question the mode is
// for - "which of these are really the same bet?" - and the screen says how many
// pairs it is showing out of how many there are, rather than quietly cutting the
// list off.
//
// Educational, not investment advice.

import {
  h, button, money, tickerPicker, allocator, errorView,
} from './build.js';
import { createBuild } from './crash.js';
import { loadGameData } from './gameView.js';
import { LEVELS_URL, validateLevels } from './levels.js';
import { DISCLAIMER, measureAll } from './measures.js';
// The panels, shared with My real portfolio so the two screens say the same
// things about the same numbers. See the note at the top of js/measuresView.js.
import {
  betsPanel, correlationPanel, riskTable, stressPanel, windowNote,
} from './measuresView.js';
import { groupIndex } from './why.js';
// Putting a view on the page without losing the scroll position or the focused
// control - see the long note at the top of js/screen.js.
import { createScreen } from './screen.js';

export const TICKERS_URL = 'tickers.json';
export const BASKET_URL = 'basket.json';

const BUILD = 'build';
const MEASURES = 'measures';

/** At least two, because a correlation and a closest pair need a pair. */
const LEAST_HOLDINGS = 2;

/** The two lines every screen showing a number carries. */
function footNotes(game) {
  const wrap = h('div', 'game-foot');
  wrap.append(h('p', 'live-chip', game.meta.liveLabel ?? `Live prices through ${game.meta.liveThrough}`));
  wrap.append(h('p', 'disclaimer-inline', DISCLAIMER));
  return wrap;
}

// --------------------------------------------------------------- the build

function renderBuild(ctx) {
  const { build } = ctx;
  const view = h('div', 'view view-round');
  const head = h('header', 'round-head');
  head.append(h('p', 'round-step', 'Build a portfolio'));
  head.append(h('h1', null, 'Sandbox'));
  head.append(h('p', 'lede', `Put ${money(build.total)} of pretend money into any holdings you like, `
    + 'then see every measure this game computes - with no guess to make first.'));
  view.append(head);

  view.append(h('p', 'picker-count', build.picks.length === 0
    ? 'Nothing picked yet'
    : `${build.picks.length} ${build.picks.length === 1 ? 'holding' : 'holdings'} picked`));
  view.append(tickerPicker(build, {
    groups: ctx.tickers.groups,
    redraw: ctx.draw,
    reasonFor: (ticker) => ctx.reasonFor(ticker),
  }));
  if (build.picks.length > 0) view.append(allocator(build, { redraw: ctx.draw }));

  const ready = build.buildComplete() && build.picks.length >= LEAST_HOLDINGS;
  view.append(button('See what this portfolio does', 'btn btn-primary btn-wide',
    () => ctx.measure(), { disabled: !ready }));
  if (!ready) {
    // WHY IT IS NOT READY, specifically. A flat button with no reason beside it
    // is the same screen whether the player has picked nothing or picked one.
    view.append(h('p', 'note', build.picks.length < LEAST_HOLDINGS
      ? `Pick at least ${LEAST_HOLDINGS} holdings. Several of the measures - the correlation `
        + 'between your holdings, and the closest pair you hold - need a pair to be about.'
      : `Split the whole ${money(build.total)} between them to carry on.`));
  }
  view.append(footNotes(ctx.game));
  return view;
}

function renderMeasures(ctx) {
  const result = ctx.result;
  const view = h('div', 'view view-round');
  const head = h('header', 'round-head');
  head.append(h('p', 'round-step', 'What this portfolio does'));
  head.append(h('h1', null, 'Sandbox'));
  view.append(head);

  view.append(betsPanel(result));
  view.append(riskTable(result));
  view.append(correlationPanel(result));
  view.append(stressPanel(result));

  view.append(h('p', 'note', result.tickers
    .map((ticker) => `${ticker} ${money(result.dollars[ticker])}`).join(' · ')));
  view.append(windowNote(result));

  view.append(button('Change this portfolio', 'btn btn-primary btn-wide', () => ctx.toBuild({ keep: true })));
  view.append(button('Start a new portfolio', 'btn btn-quiet btn-wide', () => ctx.toBuild({ keep: false })));
  view.append(footNotes(ctx.game));
  return view;
}

/** What went wrong, on a portfolio the data cannot measure. */
function renderProblem(ctx) {
  const view = h('div', 'view view-round');
  view.append(h('h1', null, 'Sandbox'));
  view.append(h('p', 'error', ctx.problem));
  view.append(button('Change this portfolio', 'btn btn-primary btn-wide', () => ctx.toBuild({ keep: true })));
  view.append(footNotes(ctx.game));
  return view;
}

// ---------------------------------------------------------------- mounting

/** Put Sandbox on the page. */
export async function mountSandbox(root) {
  root.replaceChildren(h('p', 'loading', 'Loading the ticker list and the live prices…'));
  let levels;
  let tickersDoc;
  let basket;
  let game;
  try {
    const [levelsResponse, tickersResponse, basketResponse] = await Promise.all([
      fetch(LEVELS_URL, { cache: 'no-cache' }),
      fetch(TICKERS_URL, { cache: 'no-cache' }),
      fetch(BASKET_URL, { cache: 'no-cache' }),
    ]);
    if (!levelsResponse.ok) throw new Error(`${LEVELS_URL} returned ${levelsResponse.status}`);
    if (!tickersResponse.ok) throw new Error(`${TICKERS_URL} returned ${tickersResponse.status}`);
    if (!basketResponse.ok) throw new Error(`${BASKET_URL} returned ${basketResponse.status}`);
    // levels.json is read for its window and its stress rules only - no level is
    // played here - and validated as a whole so a broken file is one error now
    // rather than a wrong number later.
    levels = validateLevels(await levelsResponse.json());
    tickersDoc = await tickersResponse.json();
    const basketDoc = await basketResponse.json();
    basket = (basketDoc.stocks ?? []).map((stock) => stock.ticker);
    if (basket.length === 0) throw new Error(`${BASKET_URL} carries no stocks`);
    game = await loadGameData();
  } catch (error) {
    root.replaceChildren();
    root.append(errorView('Sandbox', `Sandbox could not load its data: ${error.message}. Serve the `
      + 'page from the project root with "python3 -m http.server 8000", and check that '
      + 'data/game.json is there.'));
    return null;
  }

  const universe = tickersDoc.groups
    .flatMap((group) => group.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
  const groups = groupIndex(tickersDoc);
  const priced = new Set(game.tickers);

  // One painter for this mode's whole lifetime - see js/screen.js.
  const paint = createScreen(root);

  const ctx = {
    tickers: tickersDoc,
    levels,
    basket,
    game,
    groups,
    build: null,
    result: null,
    problem: null,
    state: BUILD,
    /**
     * Why a ticker cannot be picked, or null. A name in tickers.json that
     * data/game.json has no column for is explained rather than left to fail at
     * the measure - the same job pickReason() does for Crash replay.
     */
    reasonFor(ticker) {
      return priced.has(ticker) ? null : `${ticker} has no prices in this game's data yet`;
    },
    freshBuild() {
      return createBuild(universe, { isAvailable: (ticker) => priced.has(ticker) });
    },
    toBuild({ keep = false } = {}) {
      // "Change this portfolio" keeps the holdings so a player can move $100 and
      // watch what it does; "Start a new portfolio" clears them. Two buttons
      // because both are things people do here, and a single one would guess.
      if (!keep || !ctx.build) ctx.build = ctx.freshBuild();
      ctx.result = null;
      ctx.problem = null;
      ctx.state = BUILD;
      ctx.draw();
    },
    measure() {
      try {
        // READ OFF ctx, not off the closure these were loaded into. The two were
        // the same object until something reached in and changed one; an object
        // that exposes `levels` and then measures with a different `levels` is
        // lying about its own state, and the next reader to trust it is a screen.
        ctx.result = measureAll({
          game: ctx.game,
          dollars: ctx.build.dollars,
          basket: ctx.basket,
          levels: ctx.levels,
          groups: ctx.groups,
        });
        ctx.problem = null;
        ctx.state = MEASURES;
      } catch (error) {
        // A portfolio the data cannot measure - too short an overlap, usually -
        // says so on the screen with its holdings still intact, rather than
        // throwing behind a button that then looks broken.
        ctx.result = null;
        ctx.problem = `This portfolio could not be measured: ${error.message}`;
        ctx.state = MEASURES;
      }
      ctx.draw();
    },
    /**
     * Which screen is on, for js/screen.js.
     *
     * Sandbox never called window.scrollTo, so it had no jump to the top - but a
     * picked chip adds an allocator row, the page gets taller, and the browser
     * clamped the scroll anyway: 1054 to 438, measured. The key fixes that too,
     * because the position is now restored rather than left to the browser.
     */
    screenKey() {
      if (ctx.state === MEASURES) return ctx.problem ? 'problem' : 'measures';
      return 'build';
    },
    draw() {
      let view;
      if (ctx.state === MEASURES) view = ctx.problem ? renderProblem(ctx) : renderMeasures(ctx);
      else view = renderBuild(ctx);
      paint(view, ctx.screenKey());
    },
  };

  ctx.build = ctx.freshBuild();
  ctx.draw();
  return ctx;
}
