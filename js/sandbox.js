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

import { h, button, money, tickerPicker, allocator } from './build.js';
import { createBuild } from './crash.js';
import { loadGameData } from './gameView.js';
import { LEVELS_URL, formatMeasure, validateLevels } from './levels.js';
import { BETS_NOTE, DISCLAIMER, measureAll } from './measures.js';
import { formatBeta, groupIndex, percent } from './why.js';

export const TICKERS_URL = 'tickers.json';
export const BASKET_URL = 'basket.json';

const BUILD = 'build';
const MEASURES = 'measures';

/** At least two, because a correlation and a closest pair need a pair. */
const LEAST_HOLDINGS = 2;

/** How many pairs the correlation list shows before it says there are more. */
const PAIRS_SHOWN = 10;

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

// ------------------------------------------------------------ the measures

/** One labelled number, with its own line of explanation under it. */
function measureRow(label, value, note) {
  const row = h('div', 'measure-row');
  row.append(h('p', 'measure-label', label));
  row.append(h('p', 'measure-value', value));
  if (note) row.append(h('p', 'measure-note', note));
  return row;
}

/**
 * Every holding's share of the money beside its share of the risk.
 *
 * docs/PRD.md's reason for computing the shares this way: "The shares sum to
 * 100%, so they can be compared directly with dollar weights." This table is
 * that comparison, and the gap column is the whole lesson of level 5 - a bond
 * fund that takes a fifth of the money and a twentieth of the risk, and a single
 * stock doing the reverse.
 */
function riskTable(result) {
  const wrap = h('section', 'measure-table');
  wrap.append(h('h3', null, 'Where the money is, and where the risk is'));
  const table = h('table', 'shares-table');

  const headRow = h('tr', null);
  for (const label of ['Holding', 'Share of money', 'Share of risk', 'Difference']) {
    const cell = h('th', null, label);
    cell.setAttribute('scope', 'col');
    headRow.append(cell);
  }
  const thead = h('thead', null);
  thead.append(headRow);
  table.append(thead);

  const body = h('tbody', null);
  // Biggest share of the risk first: the holding carrying the portfolio is the
  // one a player is looking for, and it is not always the biggest holding.
  const rows = [...result.holdings].sort((a, b) => b.riskShare - a.riskShare);
  for (const holding of rows) {
    const row = h('tr', null);
    const name = h('th', null, holding.ticker);
    name.setAttribute('scope', 'row');
    row.append(name);
    row.append(h('td', null, percent(holding.dollarShare)));
    row.append(h('td', null, percent(holding.riskShare)));
    // The gap in percentage POINTS, signed, because that is what it is: the
    // difference between two shares, not a change in one of them.
    const points = Math.round(holding.gap * 100);
    row.append(h('td', 'shares-gap', points === 0 ? '0' : `${points > 0 ? '+' : ''}${points}`));
    body.append(row);
  }
  table.append(body);
  wrap.append(table);
  wrap.append(h('p', 'note', 'The shares of risk add up to 100%, so they can be read straight '
    + 'across against the shares of money. A holding with a bigger share of the risk than of '
    + 'the money is doing more of the moving than its size suggests; the difference column is '
    + 'in percentage points.'));
  return wrap;
}

/**
 * The pairs, closest first.
 *
 * Every pair is computed - the matrix is the whole matrix - and the list shows
 * the closest PAIRS_SHOWN of them with a line saying so. A list that stopped at
 * ten without saying there were 780 would be hiding its own arithmetic.
 */
export function rankedPairs(result) {
  const pairs = [];
  for (let i = 0; i < result.tickers.length - 1; i += 1) {
    for (let j = i + 1; j < result.tickers.length; j += 1) {
      pairs.push({ a: result.tickers[i], b: result.tickers[j], r: result.correlations[i][j] });
    }
  }
  // Ties keep index order, which is the order the portfolio was built in, so the
  // list does not depend on how the object was assembled.
  return pairs.sort((x, y) => y.r - x.r);
}

function correlationPanel(result) {
  const wrap = h('section', 'measure-table');
  wrap.append(h('h3', null, 'Which holdings move together'));
  const pairs = rankedPairs(result);
  const shown = pairs.slice(0, PAIRS_SHOWN);

  const list = h('ul', 'pair-list');
  for (const pair of shown) {
    const item = h('li', 'pair-row');
    item.append(h('span', 'pair-names', `${pair.a} and ${pair.b}`));
    item.append(h('span', 'pair-value', formatMeasure(pair.r, { places: 3 })));
    list.append(item);
  }
  wrap.append(list);

  wrap.append(h('p', 'note', pairs.length > shown.length
    ? `The ${shown.length} closest of the ${pairs.length} pairs this portfolio holds, `
      + 'correlation of daily returns over the window below.'
    : `${pairs.length === 1 ? 'The one pair' : `All ${pairs.length} pairs`} this portfolio holds, `
      + 'correlation of daily returns over the window below.'));
  wrap.append(h('p', 'note', '1.00 is two holdings that moved identically, 0 is no relationship, '
    + 'and a negative number is two that moved opposite ways. Two tickers near 1.00 are closer '
    + 'to one bet than to two.'));
  return wrap;
}

/**
 * The stress panel: both betas and the loss as a range.
 *
 * NEVER ONE NUMBER. docs/PRD.md lists "stress estimates are noisy and look
 * backward" among the things this game has to be honest about and answers it
 * with "a beta range is shown, not one number", so the two betas are shown
 * together and the loss is a span between them. The shock itself comes from
 * levels.json, where its reason is written down.
 */
function stressPanel(result) {
  const wrap = h('section', 'measure-table');
  wrap.append(h('h3', null, 'If the AI basket fell'));
  const fall = percent(Math.abs(result.loss.shock));

  wrap.append(measureRow(
    'Beta to the AI basket, all days',
    formatBeta(result.beta.allDays),
    'How much this portfolio moved for each 1% the equal-weight AI basket moved, over '
    + 'every day in the window.',
  ));
  wrap.append(measureRow(
    `Beta on the worst ${percent(result.stress.fraction)} of days`,
    formatBeta(result.beta.stressDays),
    `The same beta over the ${result.stress.count} days the S&P 500 fell hardest in this window. `
    + 'The index picks those days, not the AI stocks, so stress is not defined by the holdings '
    + 'being measured.',
  ));
  // FROM THE SMALLER LOSS TO THE LARGER ONE. result.loss.worst is the most
  // negative of the two, so printing the pair in the order the object holds them
  // would read "$1,483 to $1,417" - a range running backwards, which a reader
  // either trips over or silently corrects. The dollars are shown as sizes, with
  // the direction in the heading above them.
  wrap.append(measureRow(
    `A ${fall} fall in the AI basket`,
    `${money(Math.round(Math.abs(result.loss.mildest)))} to ${money(Math.round(Math.abs(result.loss.worst)))}`,
    `Portfolio value times beta times the fall, worked out at both betas above - which is why `
    + 'it is a range and not a number. Both ends are estimates from past daily moves, and a real '
    + `${fall} fall need not treat this portfolio like either of them.`,
  ));
  return wrap;
}

function renderMeasures(ctx) {
  const result = ctx.result;
  const view = h('div', 'view view-round');
  const head = h('header', 'round-head');
  head.append(h('p', 'round-step', 'What this portfolio does'));
  head.append(h('h1', null, 'Sandbox'));
  view.append(head);

  const panel = h('div', 'reveal-panel');
  panel.append(h('p', 'reveal-label', 'Effective bets'));
  panel.append(h('p', 'reveal-value', formatMeasure(result.bets, { places: 2 })));
  panel.append(h('p', 'reveal-about', `${result.tickers.length} holdings, `
    + `${formatMeasure(result.bets, { places: 2 })} separate bets.`));
  // Wherever the number appears, in the same words everywhere.
  panel.append(h('p', 'measure-note', BETS_NOTE));
  view.append(panel);

  view.append(riskTable(result));
  view.append(correlationPanel(result));
  view.append(stressPanel(result));

  view.append(h('p', 'note', result.tickers
    .map((ticker) => `${ticker} ${money(result.dollars[ticker])}`).join(' · ')));
  view.append(h('p', 'note', `Measured over ${result.days} trading days, `
    + `${result.startDate} to ${result.endDate}.`));

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
    const failed = h('div', 'view');
    failed.append(h('h1', null, 'Sandbox'));
    failed.append(h('p', 'error', `Sandbox could not load its data: ${error.message}. Serve the `
      + 'page from the project root with "python3 -m http.server 8000", and check that '
      + 'data/game.json is there.'));
    failed.append(h('p', 'disclaimer-inline', DISCLAIMER));
    root.append(failed);
    return null;
  }

  const universe = tickersDoc.groups
    .flatMap((group) => group.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
  const groups = groupIndex(tickersDoc);
  const priced = new Set(game.tickers);

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
    draw() {
      let view;
      if (ctx.state === MEASURES) view = ctx.problem ? renderProblem(ctx) : renderMeasures(ctx);
      else view = renderBuild(ctx);
      root.replaceChildren(view);
      root.focus({ preventScroll: true });
    },
  };

  ctx.build = ctx.freshBuild();
  ctx.draw();
  return ctx;
}
