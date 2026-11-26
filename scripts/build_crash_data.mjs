// scripts/build_crash_data.mjs - write data/crashes.json, the prices Crash
// replay draws.
//
//   node scripts/build_crash_data.mjs           print what it would write
//   node scripts/build_crash_data.mjs --write   write data/crashes.json
//
// WHERE THE PRICES COME FROM, and why this script exists at all. The 2020 crash
// is seven years before data/game.json's 756-day window, so the game's own price
// file cannot reach it. The committed research snapshot can - it is ten years
// ending on the freeze date - and this script READS it and writes somewhere else.
//
// data/prices.json's role is unchanged by that: docs/PRD.md calls it "the exact
// bytes every published verdict was computed from, written once and then left
// alone", and nothing here writes to it. scripts/run_research.mjs already reads
// it the same way. What this adds is a small derived file the browser can afford
// to download, in data/game.json's own row-per-day layout so that js/gameView.js
// reads both with one set of functions.
//
// THE FILE IS BUILT ONCE AND COMMITTED, not rebuilt nightly. The three windows
// are history: February 2020 will not be different tomorrow. The snapshot's
// SHA-256 goes in the file, as it does in data/results.json, so a replay can
// always be matched to the exact bytes it came from.
//
// A REPLAY STARTS AT A CLOSE. Each window's rows are the returns AFTER its first
// date, and `startDate` is that first date - the close the line starts from. See
// the note at the top of js/crash.js, and "Crash replay: the three windows" in
// docs/PRD.md.
//
// Educational, not investment advice.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { buildReturns } from '../js/returns.js';
import { validateCrashes } from '../js/crash.js';

const root = new URL('..', import.meta.url);
const path = (name) => fileURLToPath(new URL(name, root));
const readJson = (name) => JSON.parse(readFileSync(path(name), 'utf8'));

/**
 * The three windows, exactly as docs/PRD.md fixes them.
 *
 * `from` is the close a replay starts at and `to` is the last day it draws. The
 * AI selloff's dates were set when Crash replay was planned: it starts on the
 * Friday before the selloff, so Nvidia's fall of about 17% on 27 January 2025 is
 * the first move the line draws, and runs a month past it.
 *
 * TWO NAMES FOR EACH WINDOW, because a name that reads right as a heading reads
 * wrong inside a sentence. `title` heads a card and a chooser - "The 2022 bear
 * market" - and `inSentence` is the same name where it is one clause of
 * something longer: "in the 2022 bear market it moved -29%". A single name
 * cannot do both: level 6's "Why?" card read "in The 2022 bear market" until
 * this existed.
 *
 * WRITTEN OUT RATHER THAN DERIVED. Lowercasing the first word is right for
 * "The 2020 crash" and wrong the moment a window is named after a day or a
 * place - "Black Monday" would become "black Monday". A test holds the two forms
 * to being the same words, so they can differ in case and in nothing else.
 */
export const WINDOWS = [
  {
    key: 'crash2020',
    title: 'The 2020 crash',
    inSentence: 'the 2020 crash',
    from: '2020-02-19',
    to: '2020-03-23',
    note: 'The fastest fall in the S&P 500\'s history: it took five weeks.',
  },
  {
    key: 'bear2022',
    title: 'The 2022 bear market',
    inSentence: 'the 2022 bear market',
    from: '2022-01-03',
    to: '2022-10-12',
    note: 'A nine-month slide, with bonds falling alongside shares rather than cushioning them.',
  },
  {
    key: 'ai2025',
    title: 'The January 2025 AI selloff',
    // January and AI keep their capitals: they are a month and a thing, not the
    // start of a sentence.
    inSentence: 'the January 2025 AI selloff',
    from: '2025-01-24',
    to: '2025-02-28',
    note: 'Nvidia fell about 17% in one day, on 27 January 2025.',
  },
];

/** The index line is a fund, so that both lines on the chart include dividends. */
export const INDEX_TICKER = 'VOO';
export const INDEX_LABEL = 'S&P 500 (VOO, with dividends)';

/** How many decimals each return is stored to, as data/game.json does it. */
export const DECIMALS = 12;

/** Every ticker a player can hold, plus the benchmarks, so a reviewer can check both. */
function tickersFor(tickersDoc) {
  const playable = tickersDoc.groups.flatMap(
    (g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)),
  );
  const benchmarks = (tickersDoc.benchmarks ?? []).map((b) => b.ticker);
  return [...new Set([...playable, ...benchmarks])].sort();
}

/** The window's own dates: the opening close, then every trading day up to `to`. */
export function datesFor(built, { from, to, key }) {
  const start = built.dates.findIndex((d) => d >= from);
  if (start === -1) throw new Error(`${key}: the snapshot ends before ${from}`);
  if (built.dates[start] !== from) {
    throw new Error(
      `${key}: ${from} is not a trading day in the snapshot - the nearest after it is `
      + `${built.dates[start]}. A window has to open on a day the market was open.`,
    );
  }
  let end = -1;
  for (let i = built.dates.length - 1; i >= 0; i -= 1) {
    if (built.dates[i] <= to) { end = i; break; }
  }
  if (end <= start) throw new Error(`${key}: ${to} is not after ${from} in the snapshot`);
  if (built.dates[end] !== to) {
    throw new Error(
      `${key}: ${to} is not a trading day in the snapshot - the last one before it is `
      + `${built.dates[end]}.`,
    );
  }
  // The rows are the returns AFTER the opening close, so the first row is the
  // day after `from`.
  return { startIndex: start, returnIndices: range(start + 1, end), startDate: from, endDate: to };
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** One window, in data/game.json's layout, plus what it could not carry. */
export function buildWindow(built, spec, tickers) {
  const { startIndex, returnIndices, startDate, endDate } = datesFor(built, spec);

  // A ticker is carried only if it has a return on EVERY day of the window. One
  // that listed partway through is named with its own first date instead, so the
  // screen can say why it cannot be held rather than drawing a flat line.
  const carried = [];
  const unavailable = [];
  for (const ticker of tickers) {
    const series = built.byTicker[ticker];
    if (!series) {
      unavailable.push({ ticker, firstDate: null, reason: 'the snapshot does not carry it' });
      continue;
    }
    const holes = returnIndices.filter((i) => !Number.isFinite(series[i]));
    if (holes.length === 0) {
      carried.push(ticker);
      continue;
    }
    // Its own first day in the snapshot, which is what makes a late listing a
    // late listing rather than a gap. js/returns.js has already refused any gap
    // after a ticker's own first date, so this cannot be a hole in the middle.
    const firstIndex = series.findIndex((value) => Number.isFinite(value));
    const firstDate = firstIndex === -1 ? null : built.dates[firstIndex];
    unavailable.push({ ticker, firstDate, reason: 'it had not listed yet' });
  }

  if (!carried.includes(INDEX_TICKER)) {
    throw new Error(`${spec.key}: ${INDEX_TICKER} is not carried, and every replay draws it`);
  }

  const round = (value) => Number(value.toFixed(DECIMALS));
  const rows = returnIndices.map((i) => [
    built.dates[i],
    ...carried.map((ticker) => round(built.byTicker[ticker][i])),
  ]);

  return {
    key: spec.key,
    title: spec.title,
    // The same name as one clause of a longer sentence - see the note on WINDOWS.
    inSentence: spec.inSentence,
    note: spec.note,
    from: spec.from,
    to: spec.to,
    startDate,
    endDate,
    startIndex,
    days: rows.length,
    tickers: carried,
    unavailable,
    rows,
  };
}

/**
 * The whole file.
 *
 * `specs` defaults to the three registered windows and is a parameter only so a
 * test can hand it a window it should refuse - one that opens on a holiday, say.
 * Nothing in the game passes anything else.
 */
export function buildCrashData(built, tickers, snapshotSha, specs = WINDOWS) {
  const windows = specs.map((spec) => buildWindow(built, spec, tickers));
  return {
    meta: {
      builtBy: 'scripts/build_crash_data.mjs',
      returnsFrom: 'js/returns.js',
      pricesFrom: 'data/prices.json',
      pricesSha256: snapshotSha,
      tickersFrom: 'tickers.json',
      decimals: DECIMALS,
      indexTicker: INDEX_TICKER,
      indexLabel: INDEX_LABEL,
      windowNote:
        'Daily simple returns for each window, in data/game.json\'s layout: one row per trading '
        + 'day, the date then one return per ticker. A replay starts at startDate\'s CLOSE and '
        + 'applies the rows after it, so a path has one more point than there are rows.',
      sourceNote:
        'Derived from the committed research snapshot, which is read and never written. The 2020 '
        + 'crash is outside data/game.json\'s 756-day window, so the game cannot reach it from the '
        + 'file it plays on; these windows are history and never move, so this file is built once '
        + 'and committed rather than refreshed.',
      holdNote:
        'A portfolio is bought and held, never rebalanced: see js/crash.js and docs/PRD.md.',
      disclaimer: 'Educational, not investment advice.',
    },
    windows,
  };
}

function main(argv = []) {
  const write = argv.includes('--write');
  const snapshot = readJson('data/prices.json');
  const tickersDoc = readJson('tickers.json');
  const built = buildReturns(snapshot);
  const tickers = tickersFor(tickersDoc);
  const sha = createHash('sha256').update(readFileSync(path('data/prices.json'))).digest('hex');

  const doc = validateCrashes(buildCrashData(built, tickers, sha));

  console.log(`Crash replay windows from data/prices.json (${sha.slice(0, 12)}…),`);
  console.log(`drawn against ${INDEX_LABEL}.\n`);
  for (const window of doc.windows) {
    const index = window.tickers.indexOf(INDEX_TICKER) + 1;
    let value = 1;
    for (const row of window.rows) value *= 1 + row[index];
    console.log(`  ${window.key.padEnd(10)} ${window.startDate} to ${window.endDate}  `
      + `${String(window.days).padStart(3)} returns  ${window.tickers.length} tickers  `
      + `${INDEX_TICKER} ${(100 * (value - 1)).toFixed(2)}%`);
    for (const missing of window.unavailable) {
      console.log(`             ${missing.ticker} is not in it: ${missing.reason}`
        + `${missing.firstDate ? ` (first day ${missing.firstDate})` : ''}`);
    }
  }

  const json = `${JSON.stringify(doc, null, 1)}\n`;
  console.log(`\n  ${(json.length / 1024).toFixed(0)} KB`);
  console.log('\nEducational, not investment advice.');

  if (!write) {
    console.log('\n(nothing written - pass --write to put this in data/crashes.json)');
    return;
  }
  writeFileSync(path('data/crashes.json'), json);
  console.log('\nWrote data/crashes.json');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
