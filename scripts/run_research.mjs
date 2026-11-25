// One Trade - reproduce every published verdict and write data/results.json.
//
// WHAT THIS IS FOR. Milestone 1 step 9: "Run fetch_data.py on real prices and let
// the generated headline say whatever the verdicts say." The first real-data run
// (BUILD_LOG.md, session 1.10) was done from a throwaway script, so the four
// numbers it reported could not be re-derived by anyone, including its author.
// This script is the committed version: one command, every verdict, and a JSON
// record of what came out.
//
// It decides NOTHING. Every threshold, window, seed, sample size and verdict rule
// lives in PREREG.md, PREREG_AMENDMENT.md and PREREG_AMENDMENT_2.md, and is
// implemented in js/. This file only chooses the registered dates out of the
// calendar and prints what the hypotheses return.
//
// IT READS ONE FILE, AND ONLY ONE: the committed data/prices.json. There is no
// flag to point it at another snapshot, on purpose.
//
// Yahoo's adjusted closes for dividend-paying tickers are not reproducible
// between fetches: refetching KO with an unchanged start date disagreed with the
// committed snapshot on 1,731 of 2,513 days, by up to 8.1e-7 relative (BUILD_LOG
// 2026-11-25). The differences are far too small to move any verdict here, but
// they do mean a fresh fetch is not the same data. So the committed snapshot is
// the reference data, its SHA-256 is recorded in data/results.json, and a result
// can always be matched to the exact bytes it came from.
//
// Usage:
//   node scripts/run_research.mjs
//   node scripts/run_research.mjs --out /tmp/other_results.json
//   node scripts/run_research.mjs --quiet
//
// Educational, not investment advice.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { SEED } from '../js/rng.js';
import { buildReturns, CALENDAR_TICKER } from '../js/returns.js';
import {
  WINDOW_DAYS,
  MIN_DAYS,
  CONTROL_POOL,
  beginnerPool,
  hypothesis1,
} from '../js/hypothesis1.js';
import {
  ROLLING_WINDOW,
  CHATGPT_RELEASE,
  MIN_WINDOW_DAYS,
  equalWeightBasket,
  growingBasket,
  rollingCorrelation,
  hypothesis2,
} from '../js/hypothesis2.js';
import { leaveOneOutReport } from '../js/leaveOneOut.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// --- the registered windows -------------------------------------------------
//
// PREREG_AMENDMENT.md section 2, resolved from the freeze date of 24 November
// 2026. The dates are quoted here rather than computed from the freeze date,
// because they are registered text: a reader should be able to check them
// against the amendment by eye, not by rerunning a date library.
//
//   Full window (10 years)   24 November 2016 to 24 November 2026
//   Earliest 12 months       24 November 2016 to 23 November 2017
//   Recent 12 months         25 November 2025 to 24 November 2026
//
// 24 November 2016 was Thanksgiving, so each window beginning on it starts at
// the first trading day on or after it. js/returns.js does that by slicing on
// dates, so no date here needs to be a trading day.
const WINDOWS = {
  full: { start: '2016-11-24', end: '2026-11-24', label: 'the full 10 years' },
  early: { start: '2016-11-24', end: '2017-11-23', label: 'the earliest 12 months' },
  recent: { start: '2025-11-25', end: '2026-11-24', label: 'the most recent 12 months' },
};

const FREEZE_DATE = '2026-11-24';

/** The verdict's benchmark, and the one reported beside it. */
const BENCHMARKS = {
  RSP: {
    role: 'verdict',
    name: 'the equal-weight S&P 500',
    why: 'PREREG.md step 3: in RSP each AI stock is about 0.2% of the index, so a rise in '
      + 'correlation is not mostly the arithmetic fact that the AI names ARE the index.',
  },
  '^GSPC': {
    role: 'reported',
    name: 'the S&P 500 index',
    why: 'Reported beside RSP, never the verdict. The AI names are among the largest weights '
      + 'in a cap-weighted S&P 500, so a basket of them correlates with it partly by '
      + 'arithmetic rather than by markets tightening. That is weakness 7 in the PRD, and it '
      + 'is why PREREG.md registered RSP instead.',
  },
};

// --- small helpers ------------------------------------------------------------

/**
 * The reference data. Not configurable: see the note at the top of this file.
 * Every published verdict comes from these exact bytes.
 */
const PRICES = 'data/prices.json';

function parseArgs(argv) {
  const args = { out: 'data/results.json', quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') { args.out = argv[i + 1]; i += 1; } else if (argv[i] === '--quiet') { args.quiet = true; } else if (argv[i] === '--prices') {
      throw new Error(
        'run_research: --prices was removed. This script reads the committed data/prices.json '
        + 'and nothing else, because a fresh fetch is not the same data: Yahoo\'s adjusted '
        + 'closes for dividend payers move by about 1e-6 between fetches. See BUILD_LOG.md.',
      );
    } else {
      throw new Error(`run_research: unknown argument ${argv[i]}`);
    }
  }
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** The snapshot's SHA-256, so a result can be matched to the exact bytes. */
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** The commit this run's code came from, so a result can be traced to a tree. */
function codeCommit() {
  try {
    return {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim(),
      clean: execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString().trim() === '',
    };
  } catch {
    return { commit: null, clean: null };
  }
}

const fixed = (x, places = 4) => (Number.isFinite(x) ? x.toFixed(places) : String(x));

// --- Hypothesis 1 ---------------------------------------------------------------

/**
 * One window for every portfolio in the run.
 *
 * The overlap is taken ONCE across every name the sampler can draw - including
 * the short-history names PLTR and VRT - so all 500 beginner and 500 control
 * portfolios are scored on the same days. See alignReturns in js/hypothesis1.js.
 */
function h1Window(series, basket) {
  const needed = [...new Set([...beginnerPool(basket), ...CONTROL_POOL])];
  return series.commonWindow(needed, WINDOW_DAYS);
}

function runHypothesis1(series, basket, seed = SEED) {
  const window = h1Window(series, basket);
  const result = hypothesis1({ returnsByTicker: window.byTicker, basket, seed });
  return {
    ...result,
    window: {
      startDate: window.startDate,
      endDate: window.endDate,
      days: window.days,
      requestedDays: window.requestedDays,
      availableDays: window.availableDays,
      note: window.days < window.requestedDays
        ? `The registered 3-year window is ${window.requestedDays} trading days, but the `
          + `universe only overlaps for ${window.availableDays}. Every portfolio is scored on `
          + `the same ${window.days} days; the floor is ${MIN_DAYS}.`
        : `All ${window.days} days of the registered 3-year window, and every portfolio is `
          + 'scored on the same ones.',
    },
  };
}

// --- Hypothesis 2 -----------------------------------------------------------------

/**
 * Build one basket's returns over one window.
 *
 * kind 'fullHistory' is the registered basket: equal weight, limited to the
 * members with the full 10 years, which is 11 of the 13 (VRT and PLTR are out).
 * kind 'growing' adds names as they list, which PREREG.md asks to be reported
 * beside it; a member that has not listed yet is left out of that day's average.
 */
function basketSeries(series, members, window, kind) {
  if (kind === 'fullHistory') {
    const sliced = series.window(window.start, window.end, { tickers: members });
    if (sliced.incomplete.length > 0) {
      throw new Error(
        `basketSeries: ${sliced.incomplete.map((m) => m.ticker).join(', ')} do not cover `
        + `${window.start} to ${window.end}, but are listed as full-history members`,
      );
    }
    return {
      dates: sliced.dates,
      values: equalWeightBasket(sliced.byTicker, members),
      members,
      memberCount: members.length,
    };
  }
  const sliced = series.windowAllowingGaps(window.start, window.end, { tickers: members });
  // How many of the growing basket's members actually contribute in this window.
  const present = members.filter((ticker) => sliced.byTicker[ticker].some((v) => v !== null));
  return {
    dates: sliced.dates,
    values: growingBasket(sliced.byTicker, members),
    members,
    memberCount: present.length,
    presentMembers: present,
  };
}

function benchmarkSeries(series, ticker, window) {
  const sliced = series.window(window.start, window.end, { tickers: [ticker] });
  if (!sliced.byTicker[ticker]) {
    throw new Error(`benchmarkSeries: ${ticker} does not cover ${window.start} to ${window.end}`);
  }
  return { dates: sliced.dates, values: sliced.byTicker[ticker] };
}

/** One (basket kind, benchmark) combination, run end to end. */
function runCombination(series, { members, kind, benchmark, seed = SEED, rolling = true }) {
  const early = basketSeries(series, members, WINDOWS.early, kind);
  const recent = basketSeries(series, members, WINDOWS.recent, kind);
  const earlyBenchmark = benchmarkSeries(series, benchmark, WINDOWS.early);
  const recentBenchmark = benchmarkSeries(series, benchmark, WINDOWS.recent);

  const result = hypothesis2({
    early: { basket: early.values, benchmark: earlyBenchmark.values },
    recent: { basket: recent.values, benchmark: recentBenchmark.values },
    // The registered "at least 2 names with full history" floor. For the growing
    // basket this is how many of its members contribute in the early window.
    fullHistoryNames: early.memberCount,
    seed,
  });

  const out = {
    basket: kind,
    benchmark,
    benchmarkRole: BENCHMARKS[benchmark].role,
    benchmarkName: BENCHMARKS[benchmark].name,
    benchmarkWhy: BENCHMARKS[benchmark].why,
    members,
    memberCount: {
      early: early.memberCount,
      recent: recent.memberCount,
    },
    windows: {
      early: { ...WINDOWS.early, firstDate: early.dates[0], lastDate: early.dates.at(-1), days: early.dates.length },
      recent: { ...WINDOWS.recent, firstDate: recent.dates[0], lastDate: recent.dates.at(-1), days: recent.dates.length },
    },
    ...result,
  };

  if (rolling) {
    const full = basketSeries(series, members, WINDOWS.full, kind);
    const fullBenchmark = benchmarkSeries(series, benchmark, WINDOWS.full);
    out.rolling = rollingCorrelation(full.values, fullBenchmark.values, {
      window: ROLLING_WINDOW,
      dates: full.dates,
      mark: CHATGPT_RELEASE,
    });
    out.rolling.note = 'Reported only, over the full 10 years. It enters no verdict, and '
      + '30 November 2022 is marked as a reference date only.';
  }
  return out;
}

function runHypothesis2(series, basket, fullHistory, seed = SEED) {
  const fullHistoryMembers = basket.filter((ticker) => fullHistory.has(ticker));
  const combinations = [];
  for (const benchmark of Object.keys(BENCHMARKS)) {
    for (const kind of ['fullHistory', 'growing']) {
      combinations.push(runCombination(series, {
        members: kind === 'fullHistory' ? fullHistoryMembers : basket,
        kind,
        benchmark,
        seed,
      }));
    }
  }
  // The registered verdict: the full-history equal-weight basket against RSP.
  const registered = combinations.find((c) => c.basket === 'fullHistory' && c.benchmark === 'RSP');
  return {
    verdict: registered.verdict,
    registered,
    combinations,
    excludedFromRegisteredBasket: basket.filter((ticker) => !fullHistory.has(ticker)),
    note: 'The verdict is the equal-weight basket of full-history members against RSP, as '
      + 'registered. The growing basket and the S&P 500 index are reported beside it and '
      + 'enter no verdict.',
  };
}

/**
 * Shrink the 13 reruns to what they are for.
 *
 * leaveOneOutReport carries each rerun's whole result, which includes the full
 * 500-value distributions - 13 times over, for both hypotheses. PREREG.md asks
 * for the full distributions of the BASELINE run (they stay, in full, under
 * hypothesis1), and of the reruns it asks only: "If any single drop flips a
 * verdict, the page says so." So each rerun keeps its verdicts and its medians,
 * which is what a reader checking that sentence needs, and drops the arrays.
 */
function compactLeaveOneOut(loo) {
  const h1Runs = loo.hypothesis1.runs.map(({ dropped, result }) => ({
    dropped,
    headlineVerdict: result.verdict,
    registeredVerdict: result.registered?.verdict ?? null,
    headlineBeginnerMedian: result.headline?.beginner.median ?? null,
    headlineControlMedian: result.headline?.control.median ?? null,
    registeredBeginnerMedian: result.registered?.beginner.median ?? null,
    registeredControlMedian: result.registered?.control.median ?? null,
    days: result.days,
  }));
  const h2Runs = loo.hypothesis2.runs.map(({ dropped, result }) => ({
    dropped,
    verdict: result.verdict,
    members: result.members,
    earlyCorrelation: result.earlyCorrelation,
    recentCorrelation: result.recentCorrelation,
    difference: result.difference,
    interval: result.interval,
  }));
  const strip = ({ baselineVerdict, anyFlipped, flippedBy }) => ({
    baselineVerdict, anyFlipped, flippedBy,
  });
  return {
    seed: loo.seed,
    droppedCount: loo.droppedCount,
    anyFlipped: loo.anyFlipped,
    statement: loo.statement,
    hypothesis1: {
      anyFlipped: loo.hypothesis1.anyFlipped,
      headline: strip(loo.hypothesis1.headline),
      registered: strip(loo.hypothesis1.registered),
      runs: h1Runs,
    },
    hypothesis2: { ...strip(loo.hypothesis2), runs: h2Runs },
    note: 'Each rerun keeps its verdicts and medians. The full 500-value distributions are '
      + 'reported for the baseline run, under hypothesis1, as PREREG.md asks; of the reruns it '
      + 'asks only whether any single drop flips a verdict.',
    disclaimer: loo.disclaimer,
  };
}

// --- the generated headline -------------------------------------------------------

/**
 * The PRD: Research mode "computes 'supported', 'not supported' or 'not enough
 * data' automatically, and its headline is generated from the verdicts". So the
 * sentence is assembled from the verdicts rather than written by hand, and it
 * says whatever they say.
 */
function generatedHeadline(h1, h2) {
  const parts = [
    `Hypothesis 1 (hidden concentration): ${h1.verdict} on the headline correlation-only `
    + `test, ${h1.registered ? h1.registered.verdict : 'not scored'} on the registered test.`,
    `Hypothesis 2 (a tightening market): ${h2.verdict} against RSP, the registered benchmark.`,
    'Hypothesis 3 (players learn): collecting - no player data exists yet.',
  ];
  if (h1.registered && !h1.verdictsAgree) {
    parts.push(h1.statement);
  }
  return parts.join(' ');
}

// --- main -------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const pricesPath = resolve(ROOT, PRICES);
  const outPath = resolve(ROOT, args.out);
  const say = args.quiet ? () => {} : (line = '') => console.log(line);

  const snapshot = readJson(pricesPath);
  const pricesSha256 = sha256(pricesPath);
  const basketFile = readJson(join(ROOT, 'basket.json'));
  const basket = basketFile.stocks.map((s) => s.ticker);
  const fullHistory = new Set(basketFile.stocks.filter((s) => s.full_history).map((s) => s.ticker));

  if (snapshot.freeze_date !== FREEZE_DATE) {
    throw new Error(
      `run_research: the snapshot's freeze date is ${snapshot.freeze_date}, but the registered `
      + `freeze date is ${FREEZE_DATE} (PREREG_AMENDMENT.md section 1)`,
    );
  }

  // Build the returns. This refuses outright if any ticker is missing a trading
  // day inside its own history, so no verdict is ever computed over a gap.
  const series = buildReturns(snapshot);

  say('='.repeat(78));
  say('One Trade - research run');
  say('='.repeat(78));
  say(`snapshot            ${PRICES}`);
  say(`sha256              ${pricesSha256}`);
  say(`fetched at          ${snapshot.fetched_at}`);
  say(`prereg-v3 commit    ${snapshot.prereg_v3_commit}`);
  say(`calendar            ${CALENDAR_TICKER}, ${series.dates.length} return days, `
    + `${series.dates[0]} to ${series.dates.at(-1)}`);
  say(`lead-in             ${snapshot.fetch_start
    ? `downloaded from ${snapshot.fetch_start}, so the window's first day has a return`
    : 'NONE - the registered window loses its first day'}`);
  say(`trimmed             ${Object.keys(series.trimmed).length > 0
    ? Object.entries(series.trimmed).map(([t, v]) => `${t} from ${v.start}`).join(', ')
    : 'nothing'}`);
  say();

  const h1 = runHypothesis1(series, basket);
  const h2 = runHypothesis2(series, basket, fullHistory);

  // The leave-one-out reruns: 13 drops, with both of Hypothesis 1's verdicts and
  // Hypothesis 2's read out of the same runs.
  const loo = leaveOneOutReport({
    basket,
    baseline: { hypothesis1: h1, hypothesis2: h2 },
    runH1: (remaining, dropped, seed) => runHypothesis1(series, remaining, seed),
    runH2: (remaining, dropped, seed) => {
      const members = remaining.filter((ticker) => fullHistory.has(ticker));
      return runCombination(series, {
        members, kind: 'fullHistory', benchmark: 'RSP', seed, rolling: false,
      });
    },
  });

  const results = {
    generated_by: 'scripts/run_research.mjs',
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    code: codeCommit(),
    snapshot: {
      path: PRICES,
      sha256: pricesSha256,
      sha256Note: 'The SHA-256 of the committed data/prices.json these verdicts were computed '
        + 'from. Yahoo\'s adjusted closes for dividend payers are not reproducible between '
        + 'fetches, so the committed file - not a fresh fetch - is the reference data. A rerun '
        + 'that reports a different hash is a rerun on different data.',
      fetched_at: snapshot.fetched_at,
      prereg_v3_commit: snapshot.prereg_v3_commit,
      yfinance_version: snapshot.yfinance_version ?? null,
      fetch_start: snapshot.fetch_start ?? null,
      window_start_requested: snapshot.window_start_requested ?? null,
      freeze_date: snapshot.freeze_date,
      trimmed: snapshot.trimmed ?? {},
      returnDays: series.dates.length,
      firstReturnDate: series.dates[0],
      lastReturnDate: series.dates.at(-1),
    },
    registered: {
      seed: SEED,
      freezeDate: FREEZE_DATE,
      windows: WINDOWS,
      covarianceWindowDays: WINDOW_DAYS,
      minDays: MIN_DAYS,
      minWindowDays: MIN_WINDOW_DAYS,
      rollingWindow: ROLLING_WINDOW,
      markedDate: CHATGPT_RELEASE,
      sources: ['PREREG.md', 'PREREG_AMENDMENT.md', 'PREREG_AMENDMENT_2.md'],
    },
    headline: generatedHeadline(h1, h2),
    hypothesis1: h1,
    hypothesis2: h2,
    hypothesis3: {
      verdict: 'collecting',
      note: 'No player data exists yet. PREREG.md: fewer than 60 players reaching level 7 is '
        + '"not enough data", and collection closes 60 days after launch.',
    },
    leaveOneOut: compactLeaveOneOut(loo),
    disclaimer: 'Educational, not investment advice.',
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(results, null, 1)}\n`);

  // --- the printed summary ---------------------------------------------------
  say('-'.repeat(78));
  say('HYPOTHESIS 1: hidden concentration');
  say('-'.repeat(78));
  say(`window              ${h1.window.days} days, ${h1.window.startDate} to ${h1.window.endDate}`);
  if (h1.verdict === 'not enough data') {
    say(`verdict             not enough data - ${h1.note}`);
  } else {
    say(`HEADLINE  R         beginner median ${fixed(h1.headline.beginner.median)} against a `
      + `${h1.headline.threshold} threshold -> ${h1.headline.verdict}`);
    say(`                    control median ${fixed(h1.headline.control.median)}, gap `
      + `${fixed(h1.headline.gap)}, separates the sets: ${h1.headline.separatesSets ? 'yes' : 'no'}`);
    say(`                    share of beginner portfolios below the threshold `
      + `${(h1.headline.beginner.shareBelowThreshold * 100).toFixed(1)}%`);
    say(`REGISTERED ratio    beginner median ${fixed(h1.registered.beginner.median)} against a `
      + `${h1.registered.threshold} threshold -> ${h1.registered.verdict}`);
    say(`                    independence benchmark ${h1.registered.independenceBenchmark}; below `
      + `it: ${h1.registered.belowIndependenceBenchmark ? 'yes' : 'NO - the verdict says little'}`);
    say(`                    control median ${fixed(h1.registered.control.median)}, gap `
      + `${fixed(h1.registered.gap)}, separates the sets: `
      + `${h1.registered.separatesSets ? 'yes' : 'no'}`);
    say(`                    share of beginner portfolios below 0.60 `
      + `${(h1.registered.beginner.shareBelowThreshold * 100).toFixed(1)}%`);
    say(`agree               ${h1.verdictsAgree ? 'yes' : 'NO'}`);
    say(`statement           ${h1.statement}`);
  }
  say();

  say('-'.repeat(78));
  say('HYPOTHESIS 2: a tightening market');
  say('-'.repeat(78));
  say(`${'basket'.padEnd(12)} ${'benchmark'.padEnd(10)} ${'early'.padEnd(9)} ${'recent'.padEnd(9)} `
    + `${'rise'.padEnd(9)} ${'90% interval'.padEnd(20)} verdict`);
  for (const c of h2.combinations) {
    const interval = c.interval ? `[${fixed(c.interval.lower)}, ${fixed(c.interval.upper)}]` : 'n/a';
    const role = c.benchmarkRole === 'verdict' && c.basket === 'fullHistory' ? '  <- REGISTERED' : '';
    say(`${c.basket.padEnd(12)} ${c.benchmark.padEnd(10)} ${fixed(c.earlyCorrelation).padEnd(9)} `
      + `${fixed(c.recentCorrelation).padEnd(9)} ${fixed(c.difference).padEnd(9)} `
      + `${interval.padEnd(20)} ${c.verdict}${role}`);
  }
  say();
  say(`days                early ${h2.registered.windows.early.days} `
    + `(${h2.registered.windows.early.firstDate} to ${h2.registered.windows.early.lastDate}), `
    + `recent ${h2.registered.windows.recent.days} `
    + `(${h2.registered.windows.recent.firstDate} to ${h2.registered.windows.recent.lastDate})`);
  say(`registered basket   ${h2.registered.members.join(', ')}`);
  say(`excluded from it    ${h2.excludedFromRegisteredBasket.join(', ')} (not the full 10 years)`);
  for (const c of h2.combinations) {
    if (!c.rolling) continue;
    const mark = c.rolling.mark;
    say(`rolling ${ROLLING_WINDOW}d ${c.basket.padEnd(11)} vs ${c.benchmark.padEnd(6)} `
      + `${c.rolling.values.length} values, ${c.rolling.dates[0]} to ${c.rolling.dates.at(-1)}, `
      + `marked ${mark.requested}: ${mark.inSeries ? fixed(mark.value) : 'outside the series'}`);
  }
  say();

  say('-'.repeat(78));
  say('LEAVE-ONE-OUT: 13 reruns, one basket name dropped each time');
  say('-'.repeat(78));
  say(loo.statement);
  say();
  say(`headline verdict  ${(h1.verdict ?? '').padEnd(16)} flipped by: `
    + `${loo.hypothesis1.headline.flippedBy.map((f) => f.dropped).join(', ') || 'nothing'}`);
  say(`registered verdict ${(h1.registered?.verdict ?? 'n/a').padEnd(15)} flipped by: `
    + `${loo.hypothesis1.registered.flippedBy.map((f) => f.dropped).join(', ') || 'nothing'}`);
  say(`hypothesis 2      ${h2.verdict.padEnd(16)} flipped by: `
    + `${loo.hypothesis2.flippedBy.map((f) => f.dropped).join(', ') || 'nothing'}`);
  say();
  say('-'.repeat(78));
  say(`HEADLINE: ${results.headline}`);
  say('-'.repeat(78));
  say(`Wrote ${args.out}`);
  say();
  say('Educational, not investment advice.');
  return 0;
}

process.exit(main());
