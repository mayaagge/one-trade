// tests/research.test.js - the Research page's chart geometry, its number
// formatting, and the fields it expects data/results.json to carry.
//
// There is no DOM here, so only the pure functions are exercised; the drawing
// code is checked by hand in a browser. Both modules are written so that
// importing them touches no document.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  niceScale,
  plotArea,
  xOf,
  yOf,
  linePath,
  nearestIndex,
  tickIndices,
  yearEndSample,
  DEFAULT_PADDING,
} from '../js/chart.js';

import {
  fmt,
  pct,
  signed,
  intervalText,
  verdictClass,
  verdictLabel,
  disagreementStatement,
  reportedCombinations,
  distinctRunCount,
  chartBox,
  CLAIMS,
  DISCLAIMER,
  HYPOTHESIS3_LIMIT,
} from '../js/research.js';

const RESULTS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../data/results.json', import.meta.url)), 'utf8'),
);

const PLOT = plotArea(720, 300, DEFAULT_PADDING);

// ------------------------------------------------------------------ niceScale

test('niceScale() rounds a domain outwards to whole steps', () => {
  const scale = niceScale(0.23, 0.87, 0.1);
  assert.equal(scale.min, 0.2);
  assert.equal(scale.max, 0.9);
  assert.deepEqual(scale.ticks, [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
});

test('niceScale() leaves a domain already on the step alone', () => {
  const scale = niceScale(0.4, 0.6, 0.1);
  assert.equal(scale.min, 0.4);
  assert.equal(scale.max, 0.6);
  assert.deepEqual(scale.ticks, [0.4, 0.5, 0.6]);
});

test('niceScale() ticks carry no floating-point tails', () => {
  for (const tick of niceScale(0.05, 0.95, 0.1).ticks) {
    assert.equal(tick, Number(tick.toFixed(10)), `tick ${tick} has a tail`);
  }
});

test('niceScale() refuses bounds and steps it cannot use', () => {
  assert.throws(() => niceScale(Number.NaN, 1, 0.1), /finite bounds/);
  assert.throws(() => niceScale(0, 1, 0), /positive step/);
  assert.throws(() => niceScale(1, 0, 0.1), /below min/);
});

// ------------------------------------------------------------------ geometry

test('plotArea() sits inside its padding and refuses a box with no room', () => {
  assert.equal(PLOT.left, DEFAULT_PADDING.left);
  assert.equal(PLOT.top, DEFAULT_PADDING.top);
  assert.equal(PLOT.right, 720 - DEFAULT_PADDING.right);
  assert.equal(PLOT.bottom, 300 - DEFAULT_PADDING.bottom);
  assert.throws(() => plotArea(10, 10, DEFAULT_PADDING), /no room/);
});

test('xOf() puts the first point on the left edge and the last on the right', () => {
  assert.equal(xOf(0, 100, PLOT), PLOT.left);
  assert.equal(xOf(99, 100, PLOT), PLOT.right);
  assert.equal(xOf(0, 1, PLOT), PLOT.left);
});

test('xOf() is evenly spaced', () => {
  const step = xOf(1, 11, PLOT) - xOf(0, 11, PLOT);
  for (let i = 1; i < 10; i += 1) {
    assert.ok(Math.abs((xOf(i + 1, 11, PLOT) - xOf(i, 11, PLOT)) - step) < 1e-9);
  }
});

test('yOf() puts the domain maximum at the top, because SVG y grows downwards', () => {
  const domain = { min: 0.2, max: 0.9 };
  assert.equal(yOf(0.9, domain, PLOT), PLOT.top);
  assert.equal(yOf(0.2, domain, PLOT), PLOT.bottom);
  assert.ok(Math.abs(yOf(0.55, domain, PLOT) - (PLOT.top + PLOT.height / 2)) < 1e-9);
});

test('yOf() centres a flat series rather than dividing by zero', () => {
  assert.equal(yOf(0.5, { min: 0.5, max: 0.5 }, PLOT), PLOT.top + PLOT.height / 2);
});

// ------------------------------------------------------------------ linePath

test('linePath() draws one subpath through every point', () => {
  const d = linePath([0.3, 0.5, 0.4], { min: 0.2, max: 0.9 }, PLOT);
  assert.equal((d.match(/M/g) || []).length, 1);
  assert.equal((d.match(/L/g) || []).length, 2);
});

test('linePath() breaks at a gap instead of drawing across it', () => {
  const d = linePath([0.3, null, 0.4, Number.NaN, 0.5], { min: 0.2, max: 0.9 }, PLOT);
  assert.equal((d.match(/M/g) || []).length, 3, 'each run of values starts a new subpath');
  assert.equal((d.match(/L/g) || []).length, 0);
});

test('linePath() starts at the left edge and ends at the right', () => {
  const values = [0.9, 0.5, 0.2];
  const d = linePath(values, { min: 0.2, max: 0.9 }, PLOT);
  const first = d.match(/^M([\d.]+) ([\d.]+)/);
  assert.equal(Number(first[1]), PLOT.left);
  assert.equal(Number(first[2]), PLOT.top);
  const last = [...d.matchAll(/L([\d.]+) ([\d.]+)/g)].at(-1);
  assert.equal(Number(last[1]), PLOT.right);
  assert.equal(Number(last[2]), PLOT.bottom);
});

// ------------------------------------------------------------------ crosshair

test('nearestIndex() snaps to the closest day and clamps at both ends', () => {
  assert.equal(nearestIndex(PLOT.left, 100, PLOT), 0);
  assert.equal(nearestIndex(PLOT.right, 100, PLOT), 99);
  assert.equal(nearestIndex(PLOT.left - 500, 100, PLOT), 0);
  assert.equal(nearestIndex(PLOT.right + 500, 100, PLOT), 99);
  assert.equal(nearestIndex(xOf(42, 100, PLOT) + 1, 100, PLOT), 42);
  assert.equal(nearestIndex(10, 0, PLOT), -1);
});

test('nearestIndex() is the inverse of xOf() at every point of a real series', () => {
  const count = RESULTS.hypothesis2.registered.rolling.values.length;
  for (const i of [0, 1, 7, 1388, count - 2, count - 1]) {
    assert.equal(nearestIndex(xOf(i, count, PLOT), count, PLOT), i);
  }
});

test('tickIndices() always includes the first and last point', () => {
  const ticks = tickIndices(2388, 6);
  assert.equal(ticks[0], 0);
  assert.equal(ticks.at(-1), 2387);
  assert.ok(ticks.length <= 6);
  assert.deepEqual(tickIndices(1, 6), [0]);
  assert.deepEqual(tickIndices(0, 6), []);
});

// ------------------------------------------------------------------ table view

test('yearEndSample() keeps one row per calendar year, plus the rows asked for', () => {
  const dates = ['2017-01-02', '2017-12-29', '2018-01-02', '2018-12-31', '2019-06-03'];
  const values = [0.1, 0.2, 0.3, 0.4, 0.5];
  const sample = yearEndSample(dates, values, [0]);
  assert.deepEqual(sample.map((r) => r.date), ['2017-01-02', '2017-12-29', '2018-12-31', '2019-06-03']);
  assert.deepEqual(sample.map((r) => r.value), [0.1, 0.2, 0.4, 0.5]);
});

test('yearEndSample() is sorted, unique, and ignores out-of-range extras', () => {
  const { dates, values, mark } = RESULTS.hypothesis2.registered.rolling;
  const sample = yearEndSample(dates, values, [0, mark.index, dates.length - 1, -1, 99999]);
  const indices = sample.map((r) => r.index);
  assert.deepEqual(indices, [...new Set(indices)].sort((a, b) => a - b));
  assert.ok(indices.includes(mark.index), 'the marked date is in the table view');
  assert.ok(indices.includes(0) && indices.includes(dates.length - 1));
  assert.ok(sample.length < 20, 'the table view is a sample, not 2,388 rows');
});

// ------------------------------------------------------------------ formatting

test('fmt() prints fixed places and an em dash for a missing number', () => {
  assert.equal(fmt(0.7727881474122502), '0.773');
  assert.equal(fmt(0.5273639721625046, 4), '0.5274');
  assert.equal(fmt(0.6, 2), '0.60');
  for (const missing of [null, undefined, Number.NaN, 'x']) {
    assert.equal(fmt(missing), '—');
  }
});

test('pct() turns a share of 1 into a percentage', () => {
  assert.equal(pct(0.294), '29.4%');
  assert.equal(pct(0.928), '92.8%');
  assert.equal(pct(1), '100.0%');
  assert.equal(pct(null), '—');
});

test('signed() shows a fall as a fall, with a true minus sign', () => {
  assert.equal(signed(-0.05444971283650357), '−0.0544');
  assert.equal(signed(0.2154691152), '+0.2155');
  assert.equal(signed(0), '0.0000');
  assert.equal(signed(null), '—');
});

test('intervalText() prints both ends', () => {
  assert.equal(
    intervalText({ lower: -0.2733082255345331, upper: 0.05204349662487005 }),
    '[−0.2733, +0.0520]',
  );
  assert.equal(intervalText(null), '—');
});

// ------------------------------------------------------------------ verdicts

test('verdictClass() marks a waiting verdict and leaves both results neutral', () => {
  assert.equal(verdictClass('supported'), 'verdict verdict-supported');
  assert.equal(verdictClass('not supported'), 'verdict verdict-not-supported');
  assert.equal(verdictClass('collecting'), 'verdict verdict-waiting');
  assert.equal(verdictClass('not enough data'), 'verdict verdict-waiting');
  assert.equal(verdictClass(undefined), 'verdict');
});

test('verdictLabel() prints the verdict as it stands', () => {
  assert.equal(verdictLabel('not supported'), 'not supported');
  assert.equal(verdictLabel(''), 'no verdict');
  assert.equal(verdictLabel(undefined), 'no verdict');
});

test('disagreementStatement() appears only when the two tests disagree', () => {
  assert.equal(disagreementStatement({ verdictsAgree: true, statement: 'x' }), null);
  assert.equal(disagreementStatement({ verdictsAgree: false, statement: 'x' }), 'x');
  assert.equal(disagreementStatement(null), null);
  assert.equal(disagreementStatement({}), null, 'a file without the flag shows no panel');
});

test('the real results disagree, so the page must print the statement', () => {
  const statement = disagreementStatement(RESULTS.hypothesis1);
  assert.equal(RESULTS.hypothesis1.verdictsAgree, false);
  assert.match(statement, /disagree/);
  assert.match(statement, /not resolved by choosing the more favourable one/);
});

// ------------------------------------------------------------------ hypothesis 2

test('reportedCombinations() drops the registered pair and keeps the rest', () => {
  const reported = reportedCombinations(RESULTS.hypothesis2);
  assert.equal(reported.length, 3);
  assert.ok(!reported.some((c) => c.basket === 'fullHistory' && c.benchmark === 'RSP'));
  assert.ok(reported.some((c) => c.basket === 'fullHistory' && c.benchmark === '^GSPC'),
    'the S&P 500 result is reported beside the verdict');
  assert.deepEqual(reportedCombinations({}), []);
});

// The PRD says these 13 reruns hold 11 distinct results. The data says 12, and
// 12 is right: 11 drops each remove a full-history member and give 11 different
// results, while dropping VRT or PLTR reproduces the baseline - one more result,
// shared by those two rows. 11 is the number of drops that change the basket,
// not the number of distinct results. The page prints the computed count, so it
// cannot drift from the file; docs/PRD.md line 220 is the line to correct.
test('distinctRunCount() finds 12 distinct results in Hypothesis 2’s 13 reruns', () => {
  const runs = RESULTS.leaveOneOut.hypothesis2.runs;
  assert.equal(runs.length, 13);
  assert.equal(distinctRunCount(runs), 12);
  assert.equal(new Set(runs.map((r) => r.members.join(','))).size, 12,
    'the distinct results are exactly the distinct baskets');
  const baseline = RESULTS.hypothesis2.registered.difference;
  for (const dropped of RESULTS.hypothesis2.excludedFromRegisteredBasket) {
    assert.equal(runs.find((r) => r.dropped === dropped).difference, baseline,
      `dropping ${dropped} leaves the registered basket unchanged`);
  }
});

// ------------------------------------------------------------------ chart box

test('chartBox() keeps the SVG the size of its container, within sane bounds', () => {
  assert.equal(chartBox(720).width, 720);
  assert.equal(chartBox(2000).width, 880, 'a very wide column does not get a very wide chart');
  assert.equal(chartBox(120).width, 320, 'a narrow column still gets a readable chart');
  assert.equal(chartBox(0).width, 720, 'an unmeasured container falls back to the default');
  assert.equal(chartBox(500.4).width, 500, 'a fractional width is rounded');
});

test('chartBox() drops x-axis labels as the chart narrows, so dates cannot collide', () => {
  assert.equal(chartBox(880).xTickCount, 6);
  assert.equal(chartBox(500).xTickCount, 4);
  assert.equal(chartBox(380).xTickCount, 3);
  assert.ok(chartBox(380).height < chartBox(880).height);
});

// ------------------------------------------------- the fields the page reads

test('data/results.json carries every field the Research page renders', () => {
  const paths = [
    'headline',
    'generated_by', 'generated_at',
    'code.commit', 'code.clean',
    'snapshot.path', 'snapshot.sha256', 'snapshot.sha256Note', 'snapshot.fetched_at',
    'snapshot.returnDays', 'snapshot.firstReturnDate', 'snapshot.lastReturnDate',
    'registered.seed', 'registered.freezeDate', 'registered.sources',
    'hypothesis1.verdict', 'hypothesis1.seed', 'hypothesis1.days',
    'hypothesis1.independenceBenchmark', 'hypothesis1.separationMargin',
    'hypothesis1.verdictsAgree', 'hypothesis1.statement',
    'hypothesis1.window.startDate', 'hypothesis1.window.endDate',
    'hypothesis1.registered.belowIndependenceBenchmark',
    'hypothesis2.verdict', 'hypothesis2.note', 'hypothesis2.excludedFromRegisteredBasket',
    'hypothesis2.registered.benchmark', 'hypothesis2.registered.benchmarkName',
    'hypothesis2.registered.benchmarkWhy', 'hypothesis2.registered.members',
    'hypothesis2.registered.windows.early.label', 'hypothesis2.registered.windows.early.days',
    'hypothesis2.registered.windows.recent.label', 'hypothesis2.registered.windows.recent.days',
    'hypothesis2.registered.rolling.window', 'hypothesis2.registered.rolling.labelledBy',
    'hypothesis2.registered.rolling.note', 'hypothesis2.registered.rolling.mark.index',
    'hypothesis2.registered.rolling.mark.date', 'hypothesis2.registered.rolling.mark.value',
    'hypothesis2.registered.rolling.mark.inSeries', 'hypothesis2.registered.rolling.mark.note',
    'hypothesis3.verdict', 'hypothesis3.note',
    'leaveOneOut.statement', 'leaveOneOut.droppedCount', 'leaveOneOut.note',
    'leaveOneOut.hypothesis1.runs', 'leaveOneOut.hypothesis2.runs',
  ];
  for (const path of paths) {
    const value = path.split('.').reduce((o, k) => (o === undefined || o === null ? o : o[k]), RESULTS);
    assert.notEqual(value, undefined, `data/results.json is missing ${path}`);
  }
});

test('each Hypothesis 1 test card has the numbers and the sentences it needs', () => {
  for (const key of ['headline', 'registered']) {
    const data = RESULTS.hypothesis1[key];
    for (const field of ['statistic', 'threshold', 'verdict', 'note', 'limit']) {
      assert.notEqual(data[field], undefined, `hypothesis1.${key}.${field} is missing`);
    }
    for (const set of ['beginner', 'control']) {
      assert.equal(data[set].count, 500);
      assert.ok(Number.isFinite(data[set].median));
      assert.ok(Number.isFinite(data[set].shareBelowThreshold));
    }
  }
});

test('each Hypothesis 2 combination has the numbers and the sentences it needs', () => {
  for (const combination of RESULTS.hypothesis2.combinations) {
    for (const field of ['basket', 'benchmark', 'benchmarkRole', 'benchmarkName', 'benchmarkWhy', 'verdict', 'rise']) {
      assert.notEqual(combination[field], undefined, `${combination.basket}/${combination.benchmark} is missing ${field}`);
    }
    assert.ok(Number.isFinite(combination.earlyCorrelation));
    assert.ok(Number.isFinite(combination.recentCorrelation));
    assert.ok(Number.isFinite(combination.difference));
    assert.ok(Number.isFinite(combination.interval.lower));
    assert.ok(Number.isFinite(combination.interval.upper));
    const rolling = combination.rolling;
    assert.equal(rolling.values.length, rolling.dates.length);
    assert.equal(rolling.mark.inSeries, true);
    assert.equal(rolling.dates[rolling.mark.index], '2022-11-30', 'the marked index points at the marked date');
  }
});

test('the marked date is the reference date the pre-registration names', () => {
  const mark = RESULTS.hypothesis2.registered.rolling.mark;
  assert.equal(mark.requested, '2022-11-30');
  assert.equal(mark.date, '2022-11-30');
  assert.match(mark.note, /reference date only/);
  assert.match(mark.note, /enters no verdict/);
});

// ------------------------------------------------------------------ the page's prose

test('the page carries the disclaimer and Hypothesis 3’s stated limit', () => {
  assert.equal(DISCLAIMER, 'Educational, not investment advice.');
  assert.equal(RESULTS.disclaimer, DISCLAIMER);
  assert.match(HYPOTHESIS3_LIMIT, /no control group/);
  for (const claim of Object.values(CLAIMS)) {
    assert.ok(claim.length > 20, 'every hypothesis has its claim in plain words');
  }
});
