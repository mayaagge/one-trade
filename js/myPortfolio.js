// js/myPortfolio.js - My real portfolio: enter real holdings, see what they do.
//
// docs/PRD.md, Game modes: "Enter real holdings in dollars; nothing is stored or
// sent." It is the one screen in this game where somebody's own savings are the
// subject, and two rules follow from that, both of them absolute.
//
// NOTHING LEAVES, BY ANY ROUTE. No storage, no request, no beacon, no image with
// a query string, no share card, and nothing in the URL. The four data files are
// read when the mode opens - before there is anything private to put in a request
// - and after that the browser makes no outward move of any kind.
// tests/myPortfolio.test.js watches fetch, XMLHttpRequest, sendBeacon, Image,
// WebSocket, EventSource, the clipboard and every way the URL can change, and
// fails if any of them is touched once a holding has been entered.
//
// AND IT MAY NOT SOUND LIKE ADVICE. Every sentence here describes what the
// portfolio DOES; none says what to do about it. "NVDA is 60% of your money and
// 85% of your risk" is a fact about a portfolio. "You should trim NVDA" is a
// recommendation to a person about their savings, from a student project with no
// idea who they are, what else they own, or what the money is for. BANNED_PHRASES
// is that line drawn as data, and the test scans what these screens render.
//
// THE MEASURES ARE THE SAME MEASURES. js/measures.js takes any positive dollars
// and js/measuresView.js renders the panels, so Sandbox and this mode show one
// set of numbers in one set of words - and the stress-test loss is worked out on
// the REAL total rather than on a pretend $10,000.
//
// WHY NOT js/build.js's ALLOCATOR. It moves a fixed $10,000 in $100 steps, which
// is right for pretend money and wrong for $37,412 in six holdings. This screen
// types instead, and js/holdings.js does the reading.
//
// Educational, not investment advice.

import { h, button, money } from './build.js';
import { loadGameData } from './gameView.js';
import { LEVELS_URL, validateLevels } from './levels.js';
import { DISCLAIMER, measureAll } from './measures.js';
import {
  betsPanel, correlationPanel, riskTable, stressPanel, windowNote,
} from './measuresView.js';
import { LEAST_HOLDINGS, MOST_HOLDINGS, createHoldings, parseDollars } from './holdings.js';
import { groupIndex, percent } from './why.js';
// Putting a view on the page without losing the scroll position or the focused
// control - see the long note at the top of js/screen.js.
import { createScreen } from './screen.js';

export const TICKERS_URL = 'tickers.json';
export const BASKET_URL = 'basket.json';

const ENTER = 'enter';
const MEASURES = 'measures';

/** The id the ticker box's type-ahead list is attached by. */
const TICKER_LIST_ID = 'my-portfolio-tickers';

/**
 * The promise, in the player's own words, on every screen of this mode.
 *
 * BOTH HALVES MATTER. "Nothing is saved or sent" is what the code does; "Leaving
 * this page clears it" is what that means for the person reading - that the
 * holdings are gone when the tab goes, and that there is nothing to come back
 * to. Somebody deciding whether to type their real portfolio into a browser game
 * should be able to read both facts before they start, not find out afterwards.
 */
export const PRIVACY_LINE = 'Nothing is saved or sent. Leaving this page clears it.';

/**
 * Wording this mode may not use, as data rather than as a reviewer's memory.
 *
 * THE LINE IS BETWEEN DESCRIBING AND PRESCRIBING. Everything here is a shape that
 * turns a description into a recommendation: telling somebody what to do ("you
 * should", "you need to", "consider selling"), telling them what is better
 * ("better off", "we recommend"), or grading what they hold ("too much", "too
 * risky"). A measure with a number beside it is none of those things.
 *
 * It is exported so tests/myPortfolio.test.js can scan every screen against it,
 * and so a future screen in this mode is checked by the same list rather than by
 * whoever reviews it.
 */
export const BANNED_PHRASES = [
  /\byou (should|ought|need to|must|might want)\b/i,
  /\bconsider (selling|buying|trimming|reducing|adding|moving|switching)\b/i,
  /\b(we|this screen|this game) (recommend|suggest|advise)/i,
  /\brecommend(ed|ation|s)?\b/i,
  /\bbetter off\b/i,
  /\btoo (much|many|risky|concentrated|little|few)\b/i,
  /\b(buy|sell|trim|dump|rebalance|diversify)\b/i,
  /\bshould (be|have|hold|own|consider)\b/i,
  /\b(unwise|dangerous|reckless)\b/i,
  // "advice" on its own: the disclaimer is the one place it belongs, and the
  // audit takes that line out before scanning rather than carving an exception
  // into the pattern.
  /\badvice\b/i,
];

/** The two lines every screen showing a number carries, plus this mode's own. */
function footNotes(game) {
  const wrap = h('div', 'game-foot');
  wrap.append(h('p', 'live-chip', game.meta.liveLabel ?? `Live prices through ${game.meta.liveThrough}`));
  wrap.append(h('p', 'privacy-line', PRIVACY_LINE));
  wrap.append(h('p', 'disclaimer-inline', DISCLAIMER));
  return wrap;
}

// ----------------------------------------------------------- the entry screen

/** A text box the screen can find again by name. */
function box(name, { placeholder, aria, inputMode = null, list = null, value = '' }) {
  const node = h('input', 'text-box');
  node.type = 'text';
  node.value = value;
  node.setAttribute('data-box', name);
  node.setAttribute('placeholder', placeholder);
  node.setAttribute('aria-label', aria);
  node.setAttribute('autocomplete', 'off');
  // A PHONE'S NUMBER KEYBOARD, without type="number". type="number" brings a
  // spinner nobody wants on a dollar amount, and - the reason it is actually
  // refused here - a browser reading a comma as invalid silently hands back an
  // empty value, so "12,500" would arrive as nothing at all. inputmode asks for
  // the keyboard and leaves the text alone.
  if (inputMode) node.setAttribute('inputmode', inputMode);
  if (list) node.setAttribute('list', list);
  return node;
}

/** The type-ahead list: every ticker this game carries. */
function tickerDatalist(universe) {
  const list = h('datalist', null);
  list.setAttribute('id', TICKER_LIST_ID);
  for (const ticker of universe) {
    const option = h('option', null);
    option.setAttribute('value', ticker);
    list.append(option);
  }
  return list;
}

/**
 * What was typed in and refused, so the total can never be mistaken for the
 * whole portfolio.
 *
 * WHY IT OUTLIVES THE MESSAGE THAT CAUSED IT. The problem against the box is
 * cleared by the next good row - a stale complaint beside a box somebody has
 * since fixed is worse than none. But the MONEY is still missing: a player who
 * typed TSLA $600, read the refusal, shrugged and carried on now has a screen
 * measuring $8,050 of a portfolio that is really $8,650, and nothing on it
 * saying so. That is the one way this screen could mislead somebody about their
 * own savings, so the line stays until the amount goes in or the list is cleared.
 *
 * Returns null when there is nothing to report, so a caller can skip it.
 */
export function excludedLine(excluded) {
  if (!Array.isArray(excluded) || excluded.length === 0) return null;
  const named = excluded.map(({ ticker, dollars }) => (dollars === null
    ? ticker
    : `${ticker} (${money(dollars)})`));
  return `Not included in the total: ${named.join(', ')}. `
    + `${named.length === 1 ? 'That amount is' : 'Those amounts are'} not part of any `
    + 'measure on this screen.';
}

/**
 * The row shares as they are DISPLAYED, added up.
 *
 * Exported so tests/myPortfolio.test.js can hold the screen to it without
 * re-deriving the rounding, and so there is one answer to "what does the total
 * row say" rather than one in the renderer and one in the test.
 *
 * It rounds each share the way holdingRow() does - percent() from js/why.js -
 * and sums those, which is exactly what a reader adding the column up gets.
 */
export function shownShareTotal(list) {
  return list.rows.reduce(
    (sum, row) => sum + Math.round(list.shareOf(row.ticker) * 100),
    0,
  );
}

/** One entered holding: what it is, what it is worth, its share, and a way out. */
function holdingRow(ctx, row) {
  const node = h('div', 'holding-row');
  node.append(h('span', 'holding-ticker', row.ticker));
  node.append(h('span', 'holding-dollars', money(row.dollars)));
  node.append(h('span', 'holding-share', percent(ctx.list.shareOf(row.ticker))));
  node.append(button('Remove', 'btn btn-step', () => ctx.removeHolding(row.ticker), {
    // Named for its holding, so a screen reader hears which row this is.
    aria: `Remove ${row.ticker}`,
  }));
  return node;
}

function renderEnter(ctx) {
  const view = h('div', 'view view-round');
  const head = h('header', 'round-head');
  head.append(h('p', 'round-step', 'Enter your holdings'));
  head.append(h('h1', null, 'My real portfolio'));
  head.append(h('p', 'lede', 'Put in what you actually hold, in dollars, and see the same '
    + 'measures the rest of this game uses. The amounts become shares in your browser; '
    + 'they are what the measures are worked out from.'));
  // THE PROMISE GOES ABOVE THE BOXES, not only in the footer: somebody decides
  // whether to type their real holdings in before they type them, not after.
  head.append(h('p', 'privacy-line privacy-lead', PRIVACY_LINE));
  view.append(head);

  // What is already in.
  if (ctx.list.rows.length > 0) {
    const list = h('section', 'holding-list');
    const headRow = h('div', 'holding-row holding-row-head');
    headRow.append(h('span', 'holding-ticker', 'Holding'));
    headRow.append(h('span', 'holding-dollars', 'Amount'));
    headRow.append(h('span', 'holding-share', 'Share'));
    headRow.append(h('span', null, ''));
    list.append(headRow);
    for (const row of ctx.list.rows) list.append(holdingRow(ctx, row));

    const total = h('div', 'holding-row holding-total');
    total.append(h('span', 'holding-ticker', `${ctx.list.rows.length} holdings`));
    total.append(h('span', 'holding-dollars', money(ctx.list.total())));
    // THE SUM OF THE ROWS AS SHOWN, not a literal 100%.
    //
    // The shares are rounded to whole percents, and whole percents of arbitrary
    // dollars do not have to add to a hundred: three holdings of a third each
    // render 33% three times, and a row of 100% underneath them was the screen
    // disagreeing with its own column. A reader who adds the column up is doing
    // the right thing and must not be told they are wrong.
    //
    // Showing the real sum was chosen over explaining the rounding on every
    // screen: the column now adds up by inspection, which needs no sentence, and
    // the one-line reason appears only on the portfolios where it is not 100%.
    total.append(h('span', 'holding-share', `${shownShareTotal(ctx.list)}%`));
    total.append(h('span', null, ''));
    list.append(total);
    if (shownShareTotal(ctx.list) !== 100) {
      list.append(h('p', 'note holding-rounding',
        'Shares are rounded to whole percents, so they do not always add to '
        + 'exactly 100%. Every measure uses the exact amounts.'));
    }
    view.append(list);
  }

  // The entry row. A full list keeps its boxes on the screen, disabled, with the
  // reason beside them - boxes that vanish at fifteen look like a broken screen.
  const full = ctx.list.isFull();
  const entry = h('div', 'entry-row');
  const tickerBox = box('ticker', {
    placeholder: 'Ticker',
    aria: 'Ticker',
    list: TICKER_LIST_ID,
    value: ctx.typed.ticker,
  });
  const dollarBox = box('dollars', {
    placeholder: 'Amount in dollars',
    aria: 'Amount in dollars',
    inputMode: 'numeric',
    value: ctx.typed.dollars,
  });
  // Typing is remembered as it happens, so a redraw - which a refused row causes
  // - does not wipe what was typed.
  tickerBox.addEventListener('input', () => { ctx.typed.ticker = tickerBox.value; });
  dollarBox.addEventListener('input', () => { ctx.typed.dollars = dollarBox.value; });
  tickerBox.disabled = full;
  dollarBox.disabled = full;
  entry.append(tickerBox, dollarBox);
  // An id, so the Add button keeps focus after the row it added is drawn in.
  entry.append(button('Add', 'btn btn-quiet', () => ctx.addHolding(), {
    disabled: full, id: 'add-holding',
  }));
  view.append(entry);
  view.append(tickerDatalist(ctx.universe));

  // WHAT COULD NOT BE USED, against the box it belongs to. Never dropped, never
  // left at the foot of the page where it reads as a general complaint.
  if (ctx.fieldProblem) {
    const problem = h('p', 'field-problem', ctx.fieldProblem.problem);
    problem.setAttribute('data-for', ctx.fieldProblem.field);
    problem.setAttribute('role', 'status');
    view.append(problem);
  }
  const missing = excludedLine(ctx.excluded);
  if (missing) view.append(h('p', 'excluded-note', missing));
  if (full) {
    view.append(h('p', 'note', `This screen takes up to ${MOST_HOLDINGS} holdings, and you have `
      + `${ctx.list.rows.length}. Remove one to add another.`));
  } else {
    view.append(h('p', 'note', 'Whole dollars; commas are fine. The ticker box suggests the '
      + `tickers this game carries - ${LEAST_HOLDINGS} to ${MOST_HOLDINGS} of them.`));
  }

  const ready = ctx.list.canMeasure();
  view.append(button('See what this portfolio does', 'btn btn-primary btn-wide',
    () => ctx.measure(), { disabled: !ready }));
  if (!ready && ctx.list.whyNot()) view.append(h('p', 'note', ctx.list.whyNot()));
  if (ctx.list.rows.length > 0) {
    view.append(button('Clear everything', 'btn btn-quiet btn-wide', () => ctx.clearAll()));
  }

  view.append(footNotes(ctx.game));
  return view;
}

// -------------------------------------------------------- the measures screen

function renderMeasures(ctx) {
  const result = ctx.result;
  const view = h('div', 'view view-round');
  const head = h('header', 'round-head');
  head.append(h('p', 'round-step', 'What your portfolio does'));
  head.append(h('h1', null, 'My real portfolio'));
  view.append(head);

  view.append(betsPanel(result, { label: 'holdings' }));
  view.append(riskTable(result));
  view.append(correlationPanel(result));
  view.append(stressPanel(result));

  view.append(h('p', 'note', `${money(result.value)} across ${result.tickers.length} holdings: `
    + result.tickers.map((ticker) => `${ticker} ${money(result.dollars[ticker])}`).join(' · ')));
  // WHAT IS NOT IN THAT TOTAL, if anything was refused on the way here. Without
  // this line every number above reads as a measure of the whole portfolio.
  const missing = excludedLine(ctx.excluded);
  if (missing) view.append(h('p', 'excluded-note', missing));
  view.append(windowNote(result));

  view.append(button('Change these holdings', 'btn btn-primary btn-wide', () => ctx.toEnter()));
  view.append(button('Clear everything', 'btn btn-quiet btn-wide', () => ctx.clearAll()));
  view.append(footNotes(ctx.game));
  return view;
}

/** What went wrong, on a portfolio the data cannot measure. */
function renderProblem(ctx) {
  const view = h('div', 'view view-round');
  view.append(h('h1', null, 'My real portfolio'));
  view.append(h('p', 'error', ctx.problem));
  view.append(button('Change these holdings', 'btn btn-primary btn-wide', () => ctx.toEnter()));
  view.append(footNotes(ctx.game));
  return view;
}

// ---------------------------------------------------------------- mounting

/** Put My real portfolio on the page. */
export async function mountMyPortfolio(root) {
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
    levels = validateLevels(await levelsResponse.json());
    tickersDoc = await tickersResponse.json();
    const basketDoc = await basketResponse.json();
    basket = (basketDoc.stocks ?? []).map((stock) => stock.ticker);
    if (basket.length === 0) throw new Error(`${BASKET_URL} carries no stocks`);
    game = await loadGameData();
  } catch (error) {
    root.replaceChildren();
    const failed = h('div', 'view');
    failed.append(h('h1', null, 'My real portfolio'));
    failed.append(h('p', 'error', `My real portfolio could not load its data: ${error.message}. `
      + 'Serve the page from the project root with "python3 -m http.server 8000", and check '
      + 'that data/game.json is there.'));
    failed.append(h('p', 'disclaimer-inline', DISCLAIMER));
    root.append(failed);
    return null;
  }

  const universe = tickersDoc.groups
    .flatMap((group) => group.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
  const groups = groupIndex(tickersDoc);
  const priced = new Set(game.tickers);

  // One painter for this mode's whole lifetime - see js/screen.js.
  const paint = createScreen(root);

  const ctx = {
    levels,
    basket,
    game,
    groups,
    universe,
    list: createHoldings({ universe, priced }),
    /** What is in the boxes right now, so a redraw does not wipe it. */
    typed: { ticker: '', dollars: '' },
    fieldProblem: null,
    /** Rows that were typed in and refused, and whose money is therefore out. */
    excluded: [],
    result: null,
    problem: null,
    state: ENTER,

    addHolding() {
      const typedTicker = String(ctx.typed.ticker).trim().toUpperCase();
      const typedAmount = parseDollars(ctx.typed.dollars);
      const added = ctx.list.add(ctx.typed.ticker, ctx.typed.dollars);
      if (added.ok) {
        const dollars = ctx.list.rows[ctx.list.rows.length - 1].dollars;
        // THIS ROW ANSWERS AN EARLIER REFUSAL, by ticker or by amount. The
        // amount matters because the common fix for a refused row is retyping
        // the same money under a ticker this game does carry - "NVDAA $1,850"
        // becoming "NVDA $1,850" - and still reporting NVDAA as missing would
        // be reporting money that is now in the total twice over.
        ctx.excluded = ctx.excluded.filter((row) => row.ticker !== added.ticker
          && row.dollars !== dollars);
        // A row that went in empties the boxes, ready for the next one.
        ctx.typed = { ticker: '', dollars: '' };
        ctx.fieldProblem = null;
      } else {
        // A REFUSED ROW KEEPS WHAT WAS TYPED. A one-character typo should be a
        // one-character fix, not the whole row again - and the message names the
        // box it belongs to so the player knows which one to look at.
        ctx.fieldProblem = { field: added.field, problem: added.problem };
        // And the money is recorded as missing. Only when a ticker was actually
        // typed: an empty ticker box is somebody who has not finished, not a
        // holding that was left out.
        if (typedTicker.length > 0) {
          const dollars = typedAmount.dollars ?? null;
          const already = ctx.excluded
            .some((row) => row.ticker === typedTicker && row.dollars === dollars);
          if (!already) ctx.excluded = [...ctx.excluded, { ticker: typedTicker, dollars }];
        }
      }
      ctx.draw();
    },

    removeHolding(ticker) {
      ctx.list.remove(ticker);
      ctx.fieldProblem = null;
      // Taking a holding out does not put a refused one back in, so the excluded
      // list is left alone: its money is still outside the total either way.
      // The measures on the screen were of a portfolio that no longer exists.
      ctx.result = null;
      ctx.state = ENTER;
      ctx.draw();
    },

    clearAll() {
      ctx.list.clear();
      ctx.typed = { ticker: '', dollars: '' };
      ctx.fieldProblem = null;
      ctx.excluded = [];
      ctx.result = null;
      ctx.problem = null;
      ctx.state = ENTER;
      ctx.draw();
    },

    toEnter() {
      ctx.result = null;
      ctx.problem = null;
      ctx.state = ENTER;
      ctx.draw();
    },

    measure() {
      try {
        ctx.result = measureAll({
          game: ctx.game,
          // THE REAL DOLLARS, so the stress-test loss is worked out on the real
          // total. docs/PRD.md's loss is "portfolio value x beta x shock size",
          // and on this screen the value is the player's own, not $10,000.
          dollars: ctx.list.dollarsFor(),
          basket: ctx.basket,
          levels: ctx.levels,
          groups: ctx.groups,
        });
        ctx.problem = null;
      } catch (error) {
        ctx.result = null;
        ctx.problem = `This portfolio could not be measured: ${error.message}`;
      }
      ctx.state = MEASURES;
      ctx.draw();
    },

    /** Which screen is on, for js/screen.js. See js/game.js's screenKey(). */
    screenKey() {
      if (ctx.state === MEASURES) return ctx.problem ? 'problem' : 'measures';
      return 'enter';
    },
    draw() {
      let view;
      if (ctx.state === MEASURES) view = ctx.problem ? renderProblem(ctx) : renderMeasures(ctx);
      else view = renderEnter(ctx);
      paint(view, ctx.screenKey());
    },
  };

  ctx.draw();
  return ctx;
}
