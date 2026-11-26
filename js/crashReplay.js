// js/crashReplay.js - Crash replay: build a pretend portfolio, then watch it
// through a real crash next to the S&P 500.
//
// docs/PRD.md, Game modes: "Watch a pretend portfolio through the 2020 crash,
// the 2022 bear market or the January 2025 AI selloff, next to the S&P 500."
// Unlike Learn, there is no guess and no stars here - the PRD does not ask for
// either, and the point of this mode is watching a real history play out, not
// scoring a prediction of it.
//
// THE SCREENS ARE THE SHAPE: choose a window, build a portfolio, watch the
// reveal. The build screen is js/build.js's, shared with Learn. The pool it
// draws from is the WHOLE game universe, not just this window's own tickers -
// a holding the window cannot replay still has to appear, disabled, with a
// reason, which is what js/build.js's `reasonFor` is for. A pool already
// narrowed to what is available would make an unavailable holding vanish
// instead of being explained.
//
// EVERY NUMBER COMES FROM js/crash.js. What is written here is screen text:
// which card is shown, and the plain-words sentence under the chart. The
// sentence's own numbers (fallSentence()) are a pure function of a replay
// result, tested the way js/game.js's starsExplanation() is.
//
// Educational, not investment advice.

import { h, button, money, tickerPicker, allocator } from './build.js';
import { renderLineChart, chartBox, niceStep, DEFAULT_PADDING } from './chart.js';
import {
  DISCLAIMER,
  createBuild,
  fallAgainstIndex,
  formatShortDate,
  loadCrashes,
  replay,
  unavailableIn,
  windowByKey,
} from './crash.js';

export const TICKERS_URL = 'tickers.json';

const BUILD = 'build';
const REVEAL = 'reveal';

/** The disclaimer every screen carries, on its own - there is no live-price chip here: this mode never reads a live price. */
function footNotes() {
  const wrap = h('div', 'game-foot');
  wrap.append(h('p', 'disclaimer-inline', DISCLAIMER));
  return wrap;
}

// --------------------------------------------------------------- the chooser

function windowCard(ctx, crashWindow) {
  const card = h('article', 'level-card');
  card.append(h('h2', null, crashWindow.title));
  card.append(h('p', 'level-concept', `${formatShortDate(crashWindow.from)} to ${formatShortDate(crashWindow.to)}, ${crashWindow.to.slice(0, 4)}`));
  card.append(h('p', 'level-challenge', crashWindow.note));
  card.append(button('Replay this one', 'btn btn-primary btn-wide', () => ctx.chooseWindow(crashWindow.key)));
  return card;
}

function renderChooser(ctx) {
  const view = h('div', 'view');
  view.append(h('h1', null, 'Crash replay'));
  view.append(h('p', 'lede', 'Build a pretend portfolio with $10,000, then watch it through a real crash next to the S&P 500.'));
  const list = h('div', 'level-list');
  for (const crashWindow of ctx.crashes.windows) list.append(windowCard(ctx, crashWindow));
  view.append(list);
  view.append(footNotes());
  return view;
}

// ----------------------------------------------------------------- the head

function crashHead(crashWindow, step) {
  const head = h('header', 'round-head');
  head.append(h('p', 'round-step', step));
  head.append(h('h1', null, crashWindow.title));
  head.append(h('p', 'lede', `${formatShortDate(crashWindow.from)} to ${formatShortDate(crashWindow.to)}, `
    + `${crashWindow.to.slice(0, 4)}. ${crashWindow.note}`));
  return head;
}

// --------------------------------------------------------------- the build

/** Why a ticker cannot be picked for this window, in the player's own words, or null if it can be. */
function pickReason(crashWindow, ticker) {
  const missing = unavailableIn(crashWindow, ticker);
  if (!missing) return null;
  return missing.firstDate
    ? `${ticker} had not listed yet - its first trading day was ${missing.firstDate}`
    : `${ticker} has no prices for this window`;
}

function renderBuild(ctx) {
  const { crashWindow, build } = ctx;
  const view = h('div', 'view view-round');
  view.append(crashHead(crashWindow, 'Build your portfolio'));

  view.append(h('p', 'picker-count', build.picks.length === 0
    ? 'Nothing picked yet'
    : `${build.picks.length} ${build.picks.length === 1 ? 'holding' : 'holdings'} picked`));
  view.append(tickerPicker(build, {
    groups: ctx.tickers.groups,
    redraw: ctx.draw,
    reasonFor: (ticker) => pickReason(crashWindow, ticker),
  }));
  if (build.picks.length > 0) view.append(allocator(build, { redraw: ctx.draw }));

  const ready = build.buildComplete();
  view.append(button('Watch it play out', 'btn btn-primary btn-wide', () => ctx.reveal(), { disabled: !ready }));
  if (!ready) {
    view.append(h('p', 'note', 'Pick at least one holding and split the $10,000 between them to carry on.'));
  }
  view.append(button('Choose a different crash', 'btn btn-quiet btn-wide', () => ctx.toChooser()));
  view.append(footNotes());
  return view;
}

// -------------------------------------------------------------- the reveal

/**
 * The fall, in plain words: the portfolio's own change, the index's, and how
 * the first compares with the second when both fell.
 *
 * A pure function of a replay() result, so it is tested the way
 * js/game.js's starsExplanation() is tested - on hand-built results, with no
 * document involved.
 */
export function fallSentence(result) {
  const pct = (fraction) => `${Math.round(Math.abs(fraction) * 100)}%`;
  const line = (change, label) => (change < 0
    ? `${label} fell ${pct(change)}.`
    : change > 0
      ? `${label} rose ${pct(change)}.`
      : `${label} ended exactly where it started.`);

  const portfolio = line(result.change, 'Your portfolio');
  const index = line(result.indexChange, `The ${result.indexLabel}`);

  const against = fallAgainstIndex(result);
  const compare = against.indexFell && against.fell
    ? ` That is ${pct(against.share)} of the index's fall.`
    : '';
  return `${portfolio} ${index}${compare}`;
}

/** The chart's spec, built once per reveal and redrawn at whatever width the plot actually has. */
function chartSpecFor(result) {
  const low = Math.min(...result.path, ...result.indexPath);
  const high = Math.max(...result.path, ...result.indexPath);
  return {
    dates: result.dates,
    values: result.path,
    compare: { values: result.indexPath, label: result.indexLabel },
    seriesLabel: 'Your portfolio',
    valueLabel: 'portfolio value',
    formatValue: (v) => money(Math.round(v)),
    formatDate: formatShortDate,
    formatWhen: (date) => formatShortDate(date),
    // Rounded to the nearest $1,000 when the step is that coarse, but to one
    // decimal of a thousand when it is finer - a $500 step would otherwise print
    // "$9K" and "$10K" for both $9,000 AND $9,500, two different dollar amounts
    // reading as the same tick.
    formatYTick: (v) => {
      const thousands = Math.round((v / 1000) * 10) / 10;
      return Number.isInteger(thousands) ? `$${thousands}K` : `$${thousands.toFixed(1)}K`;
    },
    yStep: niceStep(low, high),
    // Wider than DEFAULT_PADDING.left: "$10.5K" does not fit the 40px gutter
    // Research's one-decimal correlation reads were sized for, and a label that
    // does not fit is clipped, not wrapped. Found by looking at the rendered
    // chart, not by a test - see BUILD_LOG.md session 2.8.
    padding: { ...DEFAULT_PADDING, left: 54 },
  };
}

function renderReveal(ctx) {
  const { crashWindow, result } = ctx;
  const view = h('div', 'view view-round');
  view.append(crashHead(crashWindow, 'Reveal'));

  const plot = h('div', 'chart-plot');
  view.append(plot);
  // NOT drawn here. `plot` is not yet attached to the document - this function
  // only builds the view, ctx.draw() attaches it - so plot.clientWidth would
  // read 0 and chartBox() would fall back to its 720px default. js/research.js's
  // renderResearch()/drawCharts() split exists for exactly this reason, and
  // ctx.draw() below calls redrawChart() only once the view is live.
  ctx.redrawChart = () => renderLineChart(plot, { ...chartSpecFor(result), ...chartBox(plot.clientWidth) });

  const panel = h('div', 'reveal-panel');
  panel.append(h('p', 'reveal-label', 'How your portfolio moved, next to the index'));
  panel.append(h('p', 'reveal-line', fallSentence(result)));
  view.append(panel);

  view.append(h('p', 'note', result.tickers
    .map((t) => `${t} ${money(Math.round(result.dollars[t]))}`)
    .join(' · ')));
  view.append(h('p', 'note', `${result.window.days} trading days, `
    + `${formatShortDate(result.window.from)} to ${formatShortDate(result.window.to)}, `
    + `${result.window.to.slice(0, 4)}.`));

  view.append(button('Replay this crash again', 'btn btn-quiet btn-wide', () => ctx.toBuild()));
  view.append(button('Choose a different crash', 'btn btn-quiet btn-wide', () => ctx.toChooser()));
  view.append(footNotes());
  return view;
}

// ---------------------------------------------------------------- mounting

/** Put Crash replay on the page. */
export async function mountCrash(root) {
  root.replaceChildren(h('p', 'loading', 'Loading the crash windows…'));
  let crashes;
  let tickersDoc;
  try {
    const [crashesDoc, tickersResponse] = await Promise.all([
      loadCrashes(),
      fetch(TICKERS_URL, { cache: 'no-cache' }),
    ]);
    crashes = crashesDoc;
    if (!tickersResponse.ok) throw new Error(`${TICKERS_URL} returned ${tickersResponse.status}`);
    tickersDoc = await tickersResponse.json();
  } catch (error) {
    root.replaceChildren();
    const failed = h('div', 'view');
    failed.append(h('h1', null, 'Crash replay'));
    failed.append(h('p', 'error', `Crash replay could not load its data: ${error.message}. Serve the page from the project root with "python3 -m http.server 8000", and check that data/crashes.json is there (run "node scripts/build_crash_data.mjs --write" if not).`));
    failed.append(h('p', 'disclaimer-inline', DISCLAIMER));
    root.append(failed);
    return null;
  }

  const universe = tickersDoc.groups.flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));

  const ctx = {
    crashes,
    tickers: tickersDoc,
    crashWindow: null,
    build: null,
    result: null,
    redrawChart: null,
    state: null,
    // A fresh build over the whole universe, with the chosen window's own
    // availability enforced at the build layer - not only by the picker
    // disabling a chip. See the note above createBuild() in js/crash.js.
    freshBuild() {
      return createBuild(universe, { isAvailable: (ticker) => !unavailableIn(ctx.crashWindow, ticker) });
    },
    chooseWindow(key) {
      ctx.crashWindow = windowByKey(crashes, key);
      ctx.build = ctx.freshBuild();
      ctx.result = null;
      ctx.state = BUILD;
      ctx.draw();
    },
    toChooser() {
      ctx.crashWindow = null;
      ctx.build = null;
      ctx.result = null;
      ctx.redrawChart = null;
      ctx.state = null;
      ctx.draw();
    },
    toBuild() {
      ctx.build = ctx.freshBuild();
      ctx.result = null;
      ctx.redrawChart = null;
      ctx.state = BUILD;
      ctx.draw();
    },
    reveal() {
      ctx.result = replay(crashes, ctx.crashWindow.key, ctx.build.dollars);
      ctx.state = REVEAL;
      ctx.draw();
    },
    draw() {
      ctx.redrawChart = null;
      let view;
      if (!ctx.crashWindow) view = renderChooser(ctx);
      else if (ctx.state === REVEAL) view = renderReveal(ctx);
      else view = renderBuild(ctx);
      root.replaceChildren(view);
      // The chart is drawn AFTER attachment, once the plot div has a real
      // clientWidth to size itself against - see the note in renderReveal().
      if (ctx.redrawChart) ctx.redrawChart();
      root.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    },
  };

  // One resize listener for the mode's whole lifetime, as js/research.js's
  // mountResearch() does for its own charts: only the reveal screen sets
  // ctx.redrawChart, so a resize while building or choosing does nothing.
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    if (ctx.redrawChart && root.isConnected) ctx.redrawChart();
  });

  ctx.draw();
  return ctx;
}
