// scripts/build_game_data.mjs - turn a live price file into data/game.json.
//
// WHAT THIS IS FOR. The game plays on live prices; the research verdicts are
// frozen. This script is the join between the two, and it is deliberately the
// only thing that writes data/game.json.
//
//   live prices (fetched, never committed)  ->  data/game.json  ->  the browser
//
// IT USES js/returns.js, AND NOTHING ELSE, TO MAKE A RETURN. The game and the
// published research must apply one rule for date alignment, gaps and window
// slicing, so there is no second implementation of that arithmetic here: this
// file calls buildReturns(), takes the last 756 return dates, rounds, and
// writes. Everything else in here is checking.
//
// WHAT IT WILL NOT DO:
//   * write data/prices.json or data/results.json. Those are the exact bytes the
//     published verdicts came from (see the note at the top of run_research.mjs).
//     Passing either as --out is refused.
//   * write a file it has not checked. A missing ticker, a hole inside a
//     ticker's own history, a short window or an impossible daily move all stop
//     the run, so a broken file is never committed over a good one.
//
// WHY THE FILE HOLDS NO TIMESTAMP. The refresh workflow commits game.json only
// when it changed. A generated-at field would change every evening, including
// market holidays when the data is identical, and every run would look like
// fresh data. Git's commit date already timestamps it.
//
// WHY ONE LINE PER TRADING DAY. A daily rebuild drops the oldest day and appends
// a new one, so a date-major layout changes two lines out of 756 and git stores
// the day as a small delta. A ticker-major layout puts each ticker's whole
// series on one line, so every line changes every day.
//
// Usage:
//   node scripts/build_game_data.mjs                                 # live file -> data/game.json
//   node scripts/build_game_data.mjs --prices data/prices.json --out /tmp/g.json
//   node scripts/build_game_data.mjs --check-stale                   # how old is the committed file?
//
// Educational, not investment advice.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { buildReturns } from '../js/returns.js';
import { WINDOW_DAYS, MIN_DAYS } from '../js/hypothesis1.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The game's window: the most recent 756 trading days of returns, about 3 years.
 *
 * docs/PRD.md, "Inputs": "Sigma is the covariance matrix of daily returns over
 * the most recent 756 trading days, about 3 years." The same constant drives the
 * research code and scripts/make_pool.mjs, so it is imported rather than retyped.
 */
export const GAME_DAYS = WINDOW_DAYS;

/**
 * How many trading days the FILE keeps, which is more than the game window.
 *
 * WHY THE TWO DIFFER. The weekly challenge measures over the window ending on
 * the Friday before its Monday, so that every player in a week gets the same
 * answer however many refreshes land while the week runs. The file is rebuilt
 * every weekday evening and keeps the most recent days, so by Friday a window
 * anchored on the previous Friday has had five days fall off its far end - and
 * the answer moves, by up to 0.022 bets across the ten weekly portfolios.
 *
 * Ten spare days - a trading week, and a day - make the anchored window the
 * same 756 rows every day of the week, so the drift is not reduced but
 * removed. Nothing else changes: every reader of this file asks for its own
 * window (js/round.js for levels.json's 756, scripts/build_puzzles.mjs for the
 * daily puzzle's 252, js/liveRolling.js from the freeze date), and gameWindow()
 * takes the most recent N of whatever the file holds.
 */
export const FILE_DAYS = GAME_DAYS + 10;

/**
 * Returns are stored to 12 decimal places.
 *
 * Measured, not guessed, and measured twice. Session 2.3a chose 10 decimals on a
 * sample of the level-1 pairs and two equal-weight 5-holding portfolios, where
 * the worst drift was 8.5e-11 on a correlation and 1.2e-10 on an effective-bets
 * count. Session 2.3c widened the sample to 400 random portfolios of 2 to 5
 * holdings at random weights, and 10 decimals moved a bets count by up to 2.0e-9
 * - outside the 1e-9 this project holds its maths to (CLAUDE.md rule 3). Equal
 * weights turned out to be the kind case.
 *
 * At 12 decimals the worst drift over that same wide sample is 1.8e-11, nearly
 * two orders of magnitude inside the bar. tests/gamedata.test.js measures both, on
 * the wide sample, so the figure cannot be shortened without answering for it.
 *
 * It also matters that the file is small: every player downloads it. Twelve
 * decimals takes the file from 428 KB to 489 KB, and from 167 KB to 199 KB
 * gzipped, which is what GitHub Pages serves. That is the price of the project's
 * own precision rule, and worth paying.
 */
export const DECIMALS = 12;

/** A daily simple return bigger than this is a data fault, not a market move. */
export const MAX_DAILY_MOVE = 0.5;

/** More weekdays than this without fresh data, and the refresh job goes red. */
export const STALE_WEEKDAYS = 5;

/**
 * How many incomplete newest trading days may be dropped before the run gives
 * up. Two covers a ticker whose bar is published late and the evening after it;
 * a third missing day is a feed that is actually broken, not one that is slow.
 */
export const MAX_TRIMMED_DAYS = 2;

export const DISCLAIMER = 'Educational, not investment advice.';

/** Defaults. The live price file is fetched on every run and never committed. */
export const LIVE_PRICES_PATH = 'data/live_prices.json';
export const GAME_PATH = 'data/game.json';

/** Files this script must never write, whatever it is asked to do. */
const PROTECTED = ['data/prices.json', 'data/results.json'];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-11-24" -> "24 November 2026", without depending on the runner's locale. */
export function longDate(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
  if (!match) throw new Error(`longDate: ${date} is not a YYYY-MM-DD date`);
  const [, year, month, day] = match;
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/**
 * One return, stored. null passes through: a day before a ticker's first return
 * is not a zero return, and must never be rounded into one.
 */
export function roundReturn(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`roundReturn: ${value} is not a usable return`);
  }
  // + 0 turns -0 into 0, so a rounded-away negative never prints as "-0".
  return Number(value.toFixed(DECIMALS)) + 0;
}

/** The tickers game.json must carry: every group in tickers.json, plus both benchmarks. */
export function expectedTickers(spec) {
  if (!spec || !Array.isArray(spec.groups) || !Array.isArray(spec.benchmarks)) {
    throw new Error('expectedTickers: tickers.json needs groups and benchmarks');
  }
  const all = [];
  for (const group of spec.groups) {
    for (const t of group.tickers) all.push(typeof t === 'string' ? t : t.ticker);
  }
  for (const benchmark of spec.benchmarks) all.push(benchmark.ticker);
  return { all, set: new Set(all) };
}

/**
 * Build the document from a parsed price snapshot.
 *
 * The returns come from js/returns.js, which refuses the snapshot outright if a
 * ticker is missing a trading day inside its own history. So a gap stops the run
 * here, before anything is written, which is what keeps a broken game.json from
 * replacing a good one.
 */
/**
 * Cut every series back to the newest date EVERY ticker has, and say what was
 * cut.
 *
 * WHY THIS EXISTS. Yahoo does not publish every ticker's daily bar at the same
 * moment. On 25 November 2026 the scheduled refresh found 41 tickers with that
 * day's close and AAPL without it, more than four hours after the close, and
 * threw the whole evening away. The next morning AAPL had it. A tail that is a
 * few hours behind is not a broken feed, and the answer is to play on the last
 * day everybody has rather than on nothing.
 *
 * ONLY THE TAIL IS EVER CUT. A missing day in the MIDDLE of a ticker's history
 * would turn one day's return into two days' worth, and that still stops the
 * run: js/returns.js refuses it, and trimming the end cannot reach it. A
 * snapshot can hold both faults at once and still be refused for the second.
 *
 * THE CALENDAR TICKER IS NOT A SPECIAL CASE. ^GSPC defines the trading days, so
 * when it is the one lagging, every other ticker holds a date the calendar does
 * not have, and js/returns.js refuses that too - the same complete evening lost
 * for the same reason. The cut is therefore the oldest last-date across every
 * series, ^GSPC included.
 *
 * @param {object} snapshot a price file in data/live_prices.json's shape
 * @returns {{snapshot: object, cutDate: string, dropped: Array<{date: string, missing: string[]}>}}
 */
export function trimIncompleteTail(snapshot, { maxDropped = MAX_TRIMMED_DAYS } = {}) {
  const prices = snapshot?.prices;
  if (!prices || typeof prices !== 'object') {
    throw new Error('trimIncompleteTail: the snapshot has no prices object');
  }
  const tickers = Object.keys(prices);
  if (tickers.length === 0) throw new Error('trimIncompleteTail: the snapshot has no tickers');

  const lastOf = {};
  for (const ticker of tickers) {
    const dates = prices[ticker]?.dates;
    if (!Array.isArray(dates) || dates.length === 0) {
      throw new Error(`trimIncompleteTail: ${ticker} has no dates at all`);
    }
    lastOf[ticker] = dates[dates.length - 1];
  }

  // The newest date every ticker has. Not the calendar's last day: if the
  // calendar ticker is the laggard, its last day is already the cut.
  const cutDate = tickers.reduce((oldest, ticker) => (
    lastOf[ticker] < oldest ? lastOf[ticker] : oldest
  ), lastOf[tickers[0]]);

  // Every date ANY series holds past the cut, so a dropped day is reported even
  // when only one ticker had it.
  const past = new Set();
  for (const ticker of tickers) {
    for (const date of prices[ticker].dates) if (date > cutDate) past.add(date);
  }
  const dropped = [...past].sort().map((date) => ({
    date,
    missing: tickers.filter((ticker) => !prices[ticker].dates.includes(date)).sort(),
  }));

  if (dropped.length === 0) return { snapshot, cutDate, dropped };

  if (dropped.length > maxDropped) {
    const laggards = tickers.filter((ticker) => lastOf[ticker] === cutDate).sort();
    throw new Error(
      `build_game_data: the ${dropped.length} newest trading days are incomplete `
      + `(${dropped.map((day) => `${day.date}: ${day.missing.join(', ')}`).join('; ')}). `
      + `At most ${maxDropped} may be dropped, so nothing was written. The series that stops `
      + `earliest is ${laggards.join(', ')}, which ends on ${cutDate} - if that is a delisting `
      + 'rather than a late publication, the ticker list is what needs changing.',
    );
  }

  const trimmed = {};
  for (const ticker of tickers) {
    const series = prices[ticker];
    let keep = series.dates.length;
    while (keep > 0 && series.dates[keep - 1] > cutDate) keep -= 1;
    trimmed[ticker] = { ...series, dates: series.dates.slice(0, keep), close: series.close.slice(0, keep) };
  }
  return { snapshot: { ...snapshot, prices: trimmed }, cutDate, dropped };
}

export function buildGameData(snapshot, { days = FILE_DAYS, source = LIVE_PRICES_PATH } = {}) {
  const built = buildReturns(snapshot);
  if (built.dates.length < days) {
    throw new Error(
      `buildGameData: the snapshot has ${built.dates.length} return days, fewer than the ${days} `
      + 'the game window needs. Fetch a longer history.',
    );
  }
  const tickers = built.tickers.slice().sort();
  const from = built.dates.length - days;
  const dates = built.dates.slice(from);

  const rows = dates.map((date, i) => [date, ...tickers.map((t) => roundReturn(built.byTicker[t][from + i]))]);

  return {
    meta: {
      builtBy: 'scripts/build_game_data.mjs',
      returnsFrom: 'js/returns.js',
      pricesFrom: source,
      tickersFrom: 'tickers.json',
      days,
      decimals: DECIMALS,
      firstDate: dates[0],
      liveThrough: dates[dates.length - 1],
      liveLabel: `Live prices through ${longDate(dates[dates.length - 1])}`,
      calendarTicker: built.calendarTicker,
      // Where the frozen verdicts stop. The live file carries it as
      // research_freeze_date; the frozen snapshot's own freeze_date is the same date.
      researchFreezeDate: snapshot.research_freeze_date ?? snapshot.freeze_date ?? null,
      windowNote:
        `The most recent ${days} trading days of daily simple returns, as docs/PRD.md registers for `
        + 'the covariance window. One row per trading day: the date, then one return per ticker in '
        + 'the order of the tickers list.',
      pricesNote:
        'Live prices, unofficial educational data. These are NOT the frozen research snapshot: '
        + 'data/prices.json and the verdicts in data/results.json are unchanged by this file and '
        + 'enter no verdict here.',
      noTimestampNote:
        'Deliberately no generated-at field: the refresh workflow commits this file only when it '
        + 'changed, and a timestamp would make every run look like fresh data. The commit dates it.',
      disclaimer: DISCLAIMER,
    },
    tickers,
    rows,
  };
}

/**
 * Check a document over, and throw on anything the game or the page would
 * otherwise discover mid-round.
 *
 * Every fault names the ticker or the date, because the run that trips it will
 * be an unattended one on a random Tuesday and the log is all there will be.
 */
export function checkGameData(doc, {
  tickers, days = FILE_DAYS, windowDays = GAME_DAYS, minDays = MIN_DAYS,
} = {}) {
  if (!doc || typeof doc !== 'object') throw new Error('game.json: expected an object');
  if (!doc.meta || typeof doc.meta !== 'object') throw new Error('game.json: meta is missing');
  if (!Array.isArray(doc.tickers) || doc.tickers.length === 0) {
    throw new Error('game.json: a non-empty tickers list is missing');
  }
  if (!Array.isArray(doc.rows) || doc.rows.length === 0) {
    throw new Error('game.json: a non-empty rows list is missing');
  }

  // 1. The full ticker list, sorted, with nothing missing and nothing extra.
  if (tickers) {
    const have = new Set(doc.tickers);
    const missing = tickers.all.filter((t) => !have.has(t));
    if (missing.length > 0) {
      throw new Error(`game.json is missing ${missing.join(', ')}, which tickers.json lists`);
    }
    const extra = doc.tickers.filter((t) => !tickers.set.has(t));
    if (extra.length > 0) {
      throw new Error(`game.json carries ${extra.join(', ')}, which tickers.json does not list`);
    }
  }
  const sorted = doc.tickers.slice().sort();
  for (const [i, ticker] of doc.tickers.entries()) {
    if (ticker !== sorted[i]) {
      throw new Error(`game.json: the tickers list is not sorted (${ticker} is out of place)`);
    }
  }

  // 2. Enough days for the game's window, and no more than the file keeps.
  //
  // A RANGE RATHER THAN A NUMBER, because the two ends mean different things.
  // Too few days is a broken file: a level could not be scored over the window
  // levels.json asks for. Too many is a file that has stopped being trimmed,
  // which is a slow leak rather than a fault, and is caught here before it
  // doubles. Between them sits the one case that is neither: the days after
  // the retention is raised and before the next weekday rebuild has run, when
  // the committed file is still the old length and every screen works.
  if (doc.rows.length < windowDays) {
    throw new Error(
      `game.json has ${doc.rows.length} trading days, fewer than the ${windowDays} the game window needs`,
    );
  }
  if (doc.rows.length > days) {
    throw new Error(
      `game.json has ${doc.rows.length} trading days, more than the ${days} this file keeps`,
    );
  }

  // 3. One row per trading day: right width, a real date, strictly increasing.
  const width = doc.tickers.length + 1;
  let previous = null;
  for (const [i, row] of doc.rows.entries()) {
    if (!Array.isArray(row) || row.length !== width) {
      throw new Error(
        `game.json row ${i} has ${Array.isArray(row) ? row.length - 1 : '?'} values for `
        + `${doc.tickers.length} tickers; every row needs a date and one value per ticker`,
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row[0])) {
      throw new Error(`game.json row ${i} starts with ${row[0]}, which is not a YYYY-MM-DD date`);
    }
    if (previous !== null && !(row[0] > previous)) {
      throw new Error(
        `game.json: the dates are out of order or repeat: ${previous} then ${row[0]}. `
        + 'They must be strictly increasing.',
      );
    }
    previous = row[0];
  }

  // 4. Each ticker's own column: leading nulls are a late listing, a null after
  //    the first value is a hole, and a hole would turn one day's return into
  //    two days' worth.
  for (const [t, ticker] of doc.tickers.entries()) {
    const column = t + 1;
    let first = -1;
    let present = 0;
    for (const [i, row] of doc.rows.entries()) {
      const value = row[column];
      if (value === null) {
        if (first !== -1) {
          // A run of nulls that reaches the last row is a SHORT TAIL - the
          // ticker's prices stop early - and a null with values after it is a
          // HOLE. They are different faults: a short tail is a bar that has not
          // been published yet, which trimIncompleteTail() drops before this
          // function ever sees it, and a hole would turn one day's return into
          // two days' worth. Calling both "inside its own history" is what sent
          // the refresh of 26 November 2026 looking for a gap that was not there.
          const trailing = doc.rows.slice(i).every((later) => later[column] === null);
          throw new Error(
            trailing
              ? `game.json: ${ticker} has no values from ${row[0]} to the end of the file, so its `
                + `prices stop ${doc.rows.length - i} trading day`
                + `${doc.rows.length - i === 1 ? '' : 's'} early. That is a short tail, not a gap: `
                + 'the newest days should have been trimmed before the file was built.'
              : `game.json: ${ticker} has no value on ${row[0]}, inside its own history (it starts on `
                + `${doc.rows[first][0]}). A missing day would turn one day's return into two days' `
                + 'worth, so nothing was written.',
          );
        }
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`game.json: ${ticker} has ${JSON.stringify(value)} on ${row[0]}, which is not a number`);
      }
      if (Math.abs(value) >= MAX_DAILY_MOVE) {
        throw new Error(
          `game.json: ${ticker} moves ${value} on ${row[0]}. A daily simple return that size is a `
          + 'data fault, not a market move.',
        );
      }
      if (first === -1) first = i;
      present += 1;
    }
    if (first === -1) throw new Error(`game.json: ${ticker} has no returns at all`);
    if (present < minDays) {
      throw new Error(
        `game.json: ${ticker} has ${present} returns, fewer than the ${minDays} minimum, so no `
        + 'measure using it would be trustworthy',
      );
    }
  }

  // 5. The meta has to describe the rows it is attached to.
  const firstDate = doc.rows[0][0];
  const lastDate = doc.rows[doc.rows.length - 1][0];
  if (doc.meta.liveThrough !== lastDate) {
    throw new Error(
      `game.json: meta.liveThrough says ${doc.meta.liveThrough} but the last row is ${lastDate}`,
    );
  }
  if (doc.meta.firstDate !== firstDate) {
    throw new Error(`game.json: meta.firstDate says ${doc.meta.firstDate} but the first row is ${firstDate}`);
  }
  if (doc.meta.days !== doc.rows.length) {
    throw new Error(`game.json: meta.days says ${doc.meta.days} but there are ${doc.rows.length} rows`);
  }
  if (doc.meta.liveLabel !== `Live prices through ${longDate(lastDate)}`) {
    throw new Error(
      `game.json: meta.liveLabel is "${doc.meta.liveLabel}", which does not name ${lastDate}`,
    );
  }
  if (doc.meta.disclaimer !== DISCLAIMER) {
    throw new Error(`game.json: every file that carries numbers must carry "${DISCLAIMER}"`);
  }
  return doc;
}

/**
 * The document as text: one line per trading day.
 *
 * JSON.stringify would put the whole thing on one line, or indent every number
 * onto a line of its own. Neither diffs usefully, so the rows are written here.
 */
export function formatGameJson(doc) {
  const cell = (value) => (value === null ? 'null' : String(value));
  const rows = doc.rows.map((row) => `  [${JSON.stringify(row[0])},${row.slice(1).map(cell).join(',')}]`);
  return [
    '{',
    `"meta": ${JSON.stringify(doc.meta, null, 2)},`,
    `"tickers": ${JSON.stringify(doc.tickers)},`,
    '"rows": [',
    rows.join(',\n'),
    ']',
    '}',
    '',
  ].join('\n');
}

// --- staleness ----------------------------------------------------------------

/** Whole weekdays after `fromDate` up to and including `toDate`. Never negative. */
export function weekdaysBetween(fromDate, toDate) {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new Error(`weekdaysBetween: ${fromDate} to ${toDate} is not a pair of dates`);
  }
  let count = 0;
  for (let t = from + 86400000; t <= to; t += 86400000) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

/**
 * How old the committed data is, and whether that is now a problem.
 *
 * Weekdays rather than trading days: a holiday makes this count one day high,
 * which only ever makes the check slightly impatient, and the alternative is
 * trusting a calendar that the failed fetch is exactly what did not arrive.
 */
export function stalenessReport(doc, today) {
  if (!doc) {
    return {
      stale: true,
      weekdays: null,
      liveThrough: null,
      message: 'There is no data/game.json to fall back on, so there is nothing for the game to play on.',
    };
  }
  const liveThrough = doc.meta?.liveThrough;
  if (!liveThrough) {
    return { stale: true, weekdays: null, liveThrough: null, message: 'data/game.json has no meta.liveThrough.' };
  }
  const weekdays = weekdaysBetween(liveThrough, today);
  const stale = weekdays > STALE_WEEKDAYS;
  return {
    stale,
    weekdays,
    liveThrough,
    message: stale
      ? `data/game.json still ends on ${liveThrough}, ${weekdays} weekdays before ${today}. `
        + `More than ${STALE_WEEKDAYS} weekdays without fresh prices is an outage, not a bad evening.`
      : `data/game.json ends on ${liveThrough}, ${weekdays} weekday${weekdays === 1 ? '' : 's'} `
        + `before ${today}. Inside the ${STALE_WEEKDAYS}-weekday allowance.`,
  };
}

// --- the command line ----------------------------------------------------------

function parseArgs(argv) {
  const args = { prices: LIVE_PRICES_PATH, out: GAME_PATH, checkStale: false, today: null, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--prices': args.prices = argv[i + 1]; i += 1; break;
      case '--out': args.out = argv[i + 1]; i += 1; break;
      case '--today': args.today = argv[i + 1]; i += 1; break;
      case '--check-stale': args.checkStale = true; break;
      case '--quiet': args.quiet = true; break;
      default: throw new Error(`build_game_data: unknown argument ${argv[i]}`);
    }
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const say = (line) => { if (!args.quiet) console.log(line); };
  const today = args.today ?? new Date().toISOString().slice(0, 10);
  const outPath = resolve(ROOT, args.out);

  if (args.checkStale) {
    const gamePath = resolve(ROOT, GAME_PATH);
    const doc = existsSync(gamePath) ? JSON.parse(readFileSync(gamePath, 'utf8')) : null;
    const report = stalenessReport(doc, today);
    say(report.message);
    if (report.stale) {
      console.error(`STALE: ${report.message}`);
      return 1;
    }
    return 0;
  }

  for (const protectedPath of PROTECTED) {
    if (outPath === resolve(ROOT, protectedPath)) {
      console.error(
        `REFUSED: ${protectedPath} is the frozen research data that every published verdict was `
        + 'computed from. This script never writes it.',
      );
      return 1;
    }
  }

  const fetched = JSON.parse(readFileSync(resolve(ROOT, args.prices), 'utf8'));
  const tickers = expectedTickers(JSON.parse(readFileSync(resolve(ROOT, 'tickers.json'), 'utf8')));

  // An evening where a ticker's bar has not been published yet is one day
  // behind, not broken. Drop the incomplete newest days, say which and why, and
  // play on the last day everybody has.
  const { snapshot, dropped } = trimIncompleteTail(fetched);
  for (const day of dropped) {
    console.warn(
      `::warning title=Incomplete trading day dropped::${day.date} was dropped because `
      + `${day.missing.length} ticker${day.missing.length === 1 ? ' has' : 's have'} no close for `
      + `it yet: ${day.missing.join(', ')}. The game plays on the last day every ticker has.`,
    );
    say(`Dropped ${day.date}: no close yet for ${day.missing.join(', ')}`);
  }

  const doc = buildGameData(snapshot, { source: args.prices });
  checkGameData(doc, { tickers });

  const report = stalenessReport(doc, today);
  say(`${doc.rows.length} trading days, ${doc.tickers.length} tickers, `
    + `${doc.meta.firstDate} to ${doc.meta.liveThrough}`);
  say(report.message);
  if (report.stale) {
    console.error(
      `REFUSED: the prices just fetched end on ${doc.meta.liveThrough}, ${report.weekdays} weekdays `
      + `before ${today}. That is not fresh data, so nothing was written.`,
    );
    return 1;
  }

  const text = formatGameJson(doc);
  mkdirSync(dirname(outPath), { recursive: true });
  const unchanged = existsSync(outPath) && readFileSync(outPath, 'utf8') === text;
  writeFileSync(outPath, text);
  say(`${unchanged ? 'Unchanged' : 'Wrote'} ${args.out} (${(text.length / 1024).toFixed(0)} KB)`);
  say(DISCLAIMER);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
