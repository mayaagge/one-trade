// js/research.js - the Research page.
//
// This file does NO maths. Every number on the page is read straight out of
// data/results.json, which scripts/run_research.mjs writes from the committed
// price snapshot. That is deliberate: the page cannot print a number that the
// reproducible script did not produce.

import { renderLineChart, yearEndSample } from './chart.js';

// Each chart's data, kept against the element it draws into. The SVG is sized to
// the element's real width rather than scaled down from a fixed box, so the axis
// labels stay the same number of pixels on a phone as on a laptop. That width is
// only known once the page is in the document, so drawing happens after mounting.
const CHART_SPEC = new WeakMap();

export const RESULTS_URL = 'data/results.json';
export const DISCLAIMER = 'Educational, not investment advice.';

// The claims themselves are prose from docs/PRD.md, not computed values.
export const CLAIMS = {
  hypothesis1: 'A beginner who combines a broad index fund, a tech fund and individual AI stocks has far fewer independent sources of risk than holdings.',
  hypothesis2: 'AI stocks move more closely with the broad market now than they did before the AI trade.',
  hypothesis3: 'After a few levels, players estimate a portfolio’s number of bets more accurately.',
};

// Also from the PRD: the limit this page has to state for Hypothesis 3.
export const HYPOTHESIS3_LIMIT = 'There is no control group. Players who reach level 7 may already be the stronger ones, so this shows improvement during the game, not proof that learning lasts or transfers.';

/** Format a number for the page. Returns an em dash for anything missing. */
export function fmt(value, places = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(places);
}

/** A share of 1 as a percentage. */
export function pct(value, places = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(places)}%`;
}

/** A signed number, so a fall reads as a fall. */
export function signed(value, places = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(places)}`;
}

/** A 90% interval as [lower, upper]. */
export function intervalText(interval, places = 4) {
  if (!interval) return '—';
  return `[${signed(interval.lower, places)}, ${signed(interval.upper, places)}]`;
}

/**
 * The status word for a verdict. "supported" and "not supported" are both
 * results, not a pass and a fail, so neither gets a success or an error colour:
 * they get neutral chips, and only "collecting" / "not enough data" is marked
 * as waiting.
 */
export function verdictClass(verdict) {
  switch (verdict) {
    case 'supported': return 'verdict verdict-supported';
    case 'not supported': return 'verdict verdict-not-supported';
    case 'collecting':
    case 'not enough data': return 'verdict verdict-waiting';
    default: return 'verdict';
  }
}

export function verdictLabel(verdict) {
  return typeof verdict === 'string' && verdict.length > 0 ? verdict : 'no verdict';
}

/**
 * The sentence the page must print when Hypothesis 1's two tests disagree.
 * Returns null when they agree, so the panel only appears when it is true.
 */
export function disagreementStatement(hypothesis1) {
  if (!hypothesis1 || hypothesis1.verdictsAgree !== false) return null;
  return hypothesis1.statement;
}

/** Which Hypothesis 2 combinations are reported beside the verdict's. */
export function reportedCombinations(hypothesis2) {
  const combinations = hypothesis2?.combinations ?? [];
  const registered = hypothesis2?.registered;
  return combinations.filter((c) => !(registered && c.basket === registered.basket && c.benchmark === registered.benchmark));
}

/**
 * Hypothesis 2's leave-one-out runs hold 13 rows but fewer distinct results:
 * VRT and PLTR are outside the full-history basket, so dropping either changes
 * nothing. Counting the distinct differences is how the page says so.
 */
export function distinctRunCount(runs, key = 'difference') {
  return new Set((runs ?? []).map((r) => String(r[key]))).size;
}

// ---------------------------------------------------------------- rendering

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function verdictChip(verdict) {
  return h('span', verdictClass(verdict), verdictLabel(verdict));
}

/** A labelled number. The label is secondary ink; the value carries weight. */
function stat(label, value, note) {
  const wrap = h('div', 'stat');
  wrap.append(h('span', 'stat-label', label), h('span', 'stat-value', value));
  if (note) wrap.append(h('span', 'stat-note', note));
  return wrap;
}

function section(id, title) {
  const node = h('section', 'panel');
  node.id = id;
  node.append(h('h2', null, title));
  return node;
}

function paragraph(text, className) {
  return h('p', className, text);
}

function definitionRow(term, value) {
  const row = h('div', 'kv');
  row.append(h('dt', null, term), h('dd', null, value));
  return row;
}

function table(headers, rows, caption) {
  const node = h('table', 'data-table');
  if (caption) node.append(h('caption', null, caption));
  const thead = h('thead');
  const hrow = h('tr');
  for (const head of headers) {
    const th = h('th', null, head);
    th.setAttribute('scope', 'col');
    hrow.append(th);
  }
  thead.append(hrow);
  const tbody = h('tbody');
  for (const row of rows) {
    const tr = h('tr');
    for (const cell of row) tr.append(h('td', null, cell));
    tbody.append(tr);
  }
  node.append(thead, tbody);
  return node;
}

/** A wide table in a scroller of its own, so it cannot widen the page. */
function scrollableTable(headers, rows, caption) {
  const wrap = h('div', 'table-scroll');
  wrap.setAttribute('tabindex', '0');
  wrap.setAttribute('role', 'region');
  if (caption) wrap.setAttribute('aria-label', caption);
  wrap.append(table(headers, rows, caption));
  return wrap;
}

/** One of Hypothesis 1's two tests. */
function hypothesis1Card(test, { extra = [] } = {}) {
  const card = h('article', 'card');
  const head = h('header', 'card-head');
  head.append(h('h3', null, test.title), verdictChip(test.data.verdict));
  card.append(head);
  card.append(paragraph(test.data.statistic, 'card-sub'));

  const stats = h('div', 'stat-row');
  stats.append(
    stat('Beginner median', fmt(test.data.beginner.median), `threshold ${fmt(test.data.threshold, 2)}`),
    stat('Control median', fmt(test.data.control.median)),
    stat('Beginner share below threshold', pct(test.data.beginner.shareBelowThreshold)),
    stat('Control share below threshold', pct(test.data.control.shareBelowThreshold)),
  );
  card.append(stats);

  for (const row of extra) card.append(row);

  card.append(paragraph(test.data.note, 'note'));
  const limit = h('p', 'limit');
  limit.append(h('strong', null, 'Limit: '), document.createTextNode(test.data.limit));
  card.append(limit);
  return card;
}

function renderHypothesis1(results) {
  const h1 = results.hypothesis1;
  const node = section('hypothesis-1', 'Hypothesis 1: hidden concentration');

  const head = h('div', 'panel-head');
  head.append(h('p', 'claim', CLAIMS.hypothesis1), verdictChip(h1.verdict));
  node.append(head);
  node.append(paragraph(
    `500 beginner portfolios and 500 control portfolios, 3 to 8 holdings each, drawn with seed ${h1.seed} and scored on the same ${h1.days} trading days (${h1.window.startDate} to ${h1.window.endDate}).`,
    'panel-sub',
  ));

  const cards = h('div', 'card-grid');
  cards.append(
    hypothesis1Card({ title: 'The headline test: correlation only', data: h1.headline }),
    hypothesis1Card({
      title: 'The registered test, kept as registered',
      data: h1.registered,
      extra: [paragraph(
        `Beginner median ${h1.registered.belowIndependenceBenchmark ? 'is below' : 'is not below'} the ${fmt(h1.independenceBenchmark, 3)} independence benchmark.`,
        'note',
      )],
    }),
  );
  node.append(cards);

  const statement = disagreementStatement(h1);
  if (statement) {
    const panel = h('div', 'disagreement');
    panel.append(h('h3', null, 'The two tests disagree'), paragraph(statement));
    node.append(panel);
  }

  const benchmarks = h('dl', 'kv-list');
  benchmarks.append(
    definitionRow('Independence benchmark', `${fmt(h1.independenceBenchmark, 3)} \u2014 what the registered sampler gives when holdings are exactly uncorrelated and exactly equally volatile, so there is no hidden concentration at all`),
    definitionRow('Separation margin', `${fmt(h1.separationMargin, 2)} \u2014 reporting only. It decides a sentence, never a verdict`),
  );
  node.append(benchmarks);
  return node;
}

/** One Hypothesis 2 result: a basket against a benchmark. */
function hypothesis2Card(combination, { role }) {
  const card = h('article', 'card');
  const head = h('header', 'card-head');
  const basket = combination.basket === 'fullHistory' ? 'full-history basket' : 'growing basket';
  head.append(h('h3', null, `${basket} vs ${combination.benchmark}`), verdictChip(combination.verdict));
  card.append(head);
  card.append(paragraph(
    role === 'verdict'
      ? `${combination.benchmarkName} — the registered benchmark, and the only one carrying a verdict.`
      : `${combination.benchmarkName} — reported beside the verdict. It enters no verdict.`,
    'card-sub',
  ));

  const stats = h('div', 'stat-row');
  stats.append(
    stat('Earliest 12 months', fmt(combination.earlyCorrelation, 4)),
    stat('Most recent 12 months', fmt(combination.recentCorrelation, 4)),
    stat('The rise', signed(combination.difference), `supported needs more than +${fmt(combination.rise, 2)}`),
    stat('90% interval', intervalText(combination.interval), 'block bootstrap, 20-day blocks, 2,000 resamples'),
  );
  card.append(stats);
  card.append(paragraph(combination.benchmarkWhy, 'note'));
  return card;
}

function renderHypothesis2(results) {
  const h2 = results.hypothesis2;
  const registered = h2.registered;
  const node = section('hypothesis-2', 'Hypothesis 2: a tightening market');

  const head = h('div', 'panel-head');
  head.append(h('p', 'claim', CLAIMS.hypothesis2), verdictChip(h2.verdict));
  node.append(head);
  node.append(paragraph(
    `Equal-weight AI basket of the ${registered.members.length} members with the full 10 years of history, against ${registered.benchmark}. ` +
    `${capitalise(registered.windows.early.label)} is ${registered.windows.early.start} to ${registered.windows.early.end} (${registered.windows.early.days} returns); ` +
    `${registered.windows.recent.label} is ${registered.windows.recent.start} to ${registered.windows.recent.end} (${registered.windows.recent.days} returns).`,
    'panel-sub',
  ));

  const cards = h('div', 'card-grid');
  cards.append(hypothesis2Card(registered, { role: 'verdict' }));
  for (const combination of reportedCombinations(h2)) {
    cards.append(hypothesis2Card(combination, { role: 'reported' }));
  }
  node.append(cards);

  node.append(paragraph(h2.note, 'note'));
  node.append(paragraph(
    `${h2.excludedFromRegisteredBasket.join(' and ')} are outside the registered basket: they do not have the full 10 years of history. The growing basket above adds names as they list.`,
    'note',
  ));

  node.append(renderRolling(registered));
  return node;
}

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The rolling 126-day correlation, with the reference date marked. */
function renderRolling(registered) {
  const rolling = registered.rolling;
  const wrap = h('figure', 'chart');
  wrap.append(h('figcaption', 'chart-title', `Rolling ${rolling.window}-day correlation: the full-history AI basket with ${registered.benchmark}, ${rolling.dates[0]} to ${rolling.dates[rolling.dates.length - 1]}`));
  wrap.append(paragraph(`Each point is labelled by ${rolling.labelledBy}. ${rolling.note}`, 'chart-sub'));

  const plot = h('div', 'chart-plot');
  wrap.append(plot);

  const mark = rolling.mark && rolling.mark.inSeries
    ? { index: rolling.mark.index, date: rolling.mark.date, value: rolling.mark.value, label: `${rolling.mark.date} · ${fmt(rolling.mark.value, 4)}` }
    : null;

  const tableId = 'rolling-table';
  CHART_SPEC.set(plot, {
    dates: rolling.dates,
    values: rolling.values,
    mark,
    valueLabel: `rolling ${rolling.window}-day correlation`,
    formatValue: (v) => v.toFixed(4),
    describedBy: tableId,
  });

  if (mark) {
    wrap.append(paragraph(mark.date === '2022-11-30'
      ? `30 November 2022, ChatGPT’s release, is marked at ${fmt(mark.value, 4)}. ${rolling.mark.note}`
      : rolling.mark.note, 'note'));
  }

  // The table view: every value is reachable without hovering.
  const sample = yearEndSample(rolling.dates, rolling.values, mark ? [0, mark.index, rolling.dates.length - 1] : [0, rolling.dates.length - 1]);
  const details = h('details', 'table-view');
  details.append(h('summary', null, `Show the numbers (${sample.length} of ${rolling.values.length.toLocaleString('en-US')} rows)`));
  const numbers = table(
    ['Window ending', `Correlation with ${registered.benchmark}`],
    sample.map((row) => [row.date, fmt(row.value, 4)]),
    'One value per calendar year, plus the first day, the marked date and the last day.',
  );
  numbers.id = tableId;
  details.append(numbers);
  wrap.append(details);
  return wrap;
}

function renderHypothesis3(results) {
  const h3 = results.hypothesis3;
  const node = section('hypothesis-3', 'Hypothesis 3: players learn');
  const head = h('div', 'panel-head');
  head.append(h('p', 'claim', CLAIMS.hypothesis3), verdictChip(h3.verdict));
  node.append(head);
  node.append(paragraph(h3.note, 'panel-sub'));
  const limit = h('p', 'limit');
  limit.append(h('strong', null, 'Limit: '), document.createTextNode(HYPOTHESIS3_LIMIT));
  node.append(limit);
  return node;
}

function renderLeaveOneOut(results) {
  const loo = results.leaveOneOut;
  const node = section('leave-one-out', 'Dropping one basket stock at a time');
  node.append(paragraph(loo.statement, 'panel-sub'));

  const h2Runs = loo.hypothesis2.runs;
  const distinct = distinctRunCount(h2Runs);
  node.append(paragraph(
    `Each of the ${loo.droppedCount} basket names is dropped in turn and everything is rerun. Hypothesis 2 has ${distinct} distinct results across the ${h2Runs.length} reruns: dropping ${results.hypothesis2.excludedFromRegisteredBasket.join(' or ')} leaves its basket, and so its result, unchanged.`,
    'note',
  ));

  const byTicker = new Map(h2Runs.map((r) => [r.dropped, r]));
  const rows = loo.hypothesis1.runs.map((run) => {
    const h2Run = byTicker.get(run.dropped) ?? {};
    return [
      run.dropped,
      run.headlineVerdict,
      run.registeredVerdict,
      fmt(run.headlineBeginnerMedian),
      fmt(run.registeredBeginnerMedian),
      h2Run.verdict ?? '—',
      signed(h2Run.difference),
    ];
  });
  node.append(scrollableTable(
    ['Dropped', 'H1 headline', 'H1 registered', 'H1 headline median', 'H1 registered median', 'H2 vs RSP', 'H2 rise'],
    rows,
    'Verdicts and medians for each rerun.',
  ));
  node.append(paragraph(loo.note, 'note'));
  return node;
}

function renderProvenance(results) {
  const node = section('provenance', 'Where these numbers come from');
  const list = h('dl', 'kv-list');
  list.append(
    definitionRow('Freeze date', results.registered.freezeDate),
    definitionRow('Random seed', String(results.registered.seed)),
    definitionRow('Price snapshot', `${results.snapshot.path}, fetched ${results.snapshot.fetched_at}`),
    definitionRow('Snapshot SHA-256', results.snapshot.sha256),
    definitionRow('Returns', `${results.snapshot.returnDays.toLocaleString('en-US')} daily returns, ${results.snapshot.firstReturnDate} to ${results.snapshot.lastReturnDate}`),
    definitionRow('Computed by', `${results.generated_by} at commit ${results.code.commit.slice(0, 7)}${results.code.clean ? ' (clean tree)' : ' (uncommitted changes)'}, run ${results.generated_at}`),
    definitionRow('Pre-registration', results.registered.sources.join(', ')),
  );
  node.append(list);
  node.append(paragraph(results.snapshot.sha256Note, 'note'));
  return node;
}

/**
 * Pick an SVG box for a plot of this width. Narrow screens get fewer x-axis
 * labels, because six dates will not fit without colliding.
 */
export function chartBox(containerWidth) {
  const width = Math.max(320, Math.min(880, Math.round(containerWidth) || 720));
  return {
    width,
    height: width < 520 ? 240 : 300,
    xTickCount: width < 420 ? 3 : width < 620 ? 4 : 6,
  };
}

/** Draw every chart in `root`, sized to the width it actually has on screen. */
export function drawCharts(root) {
  for (const plot of root.querySelectorAll('.chart-plot')) {
    const spec = CHART_SPEC.get(plot);
    if (!spec) continue;
    renderLineChart(plot, { ...spec, ...chartBox(plot.clientWidth) });
  }
}

/** Render the whole Research view into `root`. */
export function renderResearch(root, results) {
  root.replaceChildren();
  const view = h('div', 'view');

  view.append(h('h1', null, 'Research'));
  view.append(paragraph(
    'Three questions were pre-registered and tagged on GitHub before any price was downloaded. The page computes nothing: every number below is read from data/results.json, which one command regenerates from the committed price snapshot. Every result is reported, whichever way it came out.',
    'lede',
  ));
  view.append(paragraph(DISCLAIMER, 'disclaimer-inline'));

  const headline = h('div', 'headline');
  headline.append(h('h2', null, 'The headline, generated from the verdicts'), paragraph(results.headline));
  view.append(headline);

  view.append(renderHypothesis1(results));
  view.append(renderHypothesis2(results));
  view.append(renderHypothesis3(results));
  view.append(renderLeaveOneOut(results));
  view.append(renderProvenance(results));

  root.append(view);
  drawCharts(view);
  return view;
}

/** Fetch the results file and render, or say plainly that it could not load. */
export async function mountResearch(root) {
  root.replaceChildren(h('p', 'loading', 'Loading the research results…'));
  try {
    const response = await fetch(RESULTS_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${RESULTS_URL} returned ${response.status}`);
    const results = await response.json();
    const view = renderResearch(root, results);
    let lastWidth = window.innerWidth;
    let pending = null;
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      clearTimeout(pending);
      pending = setTimeout(() => {
        if (view.isConnected) drawCharts(view);
      }, 150);
    });
  } catch (error) {
    root.replaceChildren();
    const failed = h('div', 'view');
    failed.append(h('h1', null, 'Research'));
    failed.append(paragraph(`The research results could not be loaded: ${error.message}. Run "node scripts/run_research.mjs" to regenerate data/results.json, and serve the page from the project root.`, 'error'));
    failed.append(paragraph(DISCLAIMER, 'disclaimer-inline'));
    root.append(failed);
  }
}
