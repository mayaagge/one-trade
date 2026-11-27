// js/liveRolling.js - the one part of the Research page that moves.
//
// docs/PRD.md, "Research mode and live data": every verdict and every number
// behind it comes from the committed snapshot and never moves. ONE CHART is the
// exception, and only in what it draws. The rolling 126-day correlation of the
// AI basket with the equal-weight S&P 500 - already reported-only, entering no
// verdict - continues past the freeze date on live prices.
//
// WHAT THIS FILE IS ALLOWED TO DO:
//   - read data/game.json, the live returns, and compute rolling correlation
//     values for windows ending AFTER the freeze date;
//   - append them to the frozen series read from data/results.json.
//
// WHAT IT MUST NEVER DO:
//   - change, recompute or re-round a single frozen value. The frozen half is
//     copied through, value for value, and a live date on or before the freeze
//     date is dropped rather than allowed to overwrite one.
//   - feed anything into a verdict. No verdict reads this file.
//
// THE TWO HALVES ARE ONE MEASURE, which is why the same basket members, the same
// benchmark and the same rollingCorrelation() from js/hypothesis2.js are used
// here. They are checked where they meet: the window ending on the freeze date
// itself has a value in both halves, and if those disagree by more than
// JOIN_TOLERANCE the tail is refused outright. A chart that silently joins two
// different measures would be worse than a chart that stops at the freeze date.
//
// Educational, not investment advice.

import { equalWeightBasket, rollingCorrelation, ROLLING_WINDOW } from './hypothesis2.js';
import { gameDates, tickerSeries } from './gameView.js';

/**
 * How far the live and frozen halves may disagree at the freeze date.
 *
 * BUILD_LOG.md, session 1.11: Yahoo's adjusted closes move by about 1e-6 between
 * fetches for dividend payers, and data/game.json stores returns to 10 decimal
 * places, so a perfect join is not available. 1e-4 sits far above that known
 * drift and far below any difference a reader could see, which turns the drift
 * into a tripwire for a real fault - a wrong basket, a wrong benchmark, a
 * misaligned calendar - instead of a mystery.
 */
export const JOIN_TOLERANCE = 1e-4;

/** The label docs/PRD.md requires on the live part, word for word. */
export const SHADE_LABEL = 'after the freeze date; enters no verdict';

// game.json's row-per-day layout is read by js/gameView.js, which the game uses
// too, so there is one reader of that layout rather than two. Re-exported here
// because this file's own callers and tests ask for them by name.
export { tickerSeries, gameDates } from './gameView.js';

/**
 * Rolling correlation values for the windows ending ON or AFTER the freeze date,
 * computed from live prices.
 *
 * The value dated the freeze date itself is returned separately, as joinValue:
 * it is not part of the tail (the frozen half already has that day), it is how
 * the two halves are checked against each other.
 *
 * Throws on anything that would make the tail a different measure: a missing
 * ticker, a hole inside a window, a file too short to fill one.
 *
 * @returns {{dates: string[], values: number[], joinDate: string|null, joinValue: number|null}}
 */
export function computeLiveRolling(game, { members, benchmark, window = ROLLING_WINDOW, freezeDate }) {
  if (!Array.isArray(members) || members.length === 0) {
    throw new Error('the basket members are missing');
  }
  if (typeof freezeDate !== 'string' || freezeDate.length === 0) {
    throw new Error('the freeze date is missing');
  }
  const dates = gameDates(game);
  if (dates.length === 0) throw new Error('data/game.json has no rows');

  // The two files have to agree on which date is frozen. If they ever disagree,
  // one of them was rebuilt against the wrong calendar, and the tail would be
  // appended in the wrong place - so it is not appended at all.
  const recorded = game.meta?.researchFreezeDate;
  if (recorded !== undefined && recorded !== null && recorded !== freezeDate) {
    throw new Error(
      `data/game.json records the freeze date as ${recorded}, `
      + `but data/results.json says ${freezeDate}`,
    );
  }

  // The earliest window worth computing ends on the freeze date, because that is
  // the one the join is checked on. Without a row for the freeze date there is
  // no way to check the join, so the tail is refused rather than trusted.
  const joinIndex = dates.indexOf(freezeDate);
  if (joinIndex === -1) {
    throw new Error(
      `data/game.json has no row for the freeze date ${freezeDate}, `
      + 'so the live and frozen halves cannot be checked where they meet',
    );
  }
  const from = joinIndex - window + 1;
  if (from < 0) {
    throw new Error(
      `data/game.json reaches back only to ${dates[0]}, `
      + `which cannot fill a ${window}-day window ending ${freezeDate}`,
    );
  }

  const needed = [...members, benchmark];
  const sliced = {};
  for (const ticker of needed) {
    const values = tickerSeries(game, ticker).slice(from);
    for (let t = 0; t < values.length; t += 1) {
      if (!Number.isFinite(values[t])) {
        throw new Error(
          `data/game.json has no usable return for ${ticker} on ${dates[from + t]}, `
          + 'inside a window this chart needs',
        );
      }
    }
    sliced[ticker] = values;
  }

  const basket = equalWeightBasket(sliced, members);
  const series = rollingCorrelation(basket, sliced[benchmark], {
    window,
    dates: dates.slice(from),
  });

  // series.dates[0] is the window ending on the freeze date; the rest is the tail.
  const live = { dates: [], values: [] };
  for (let i = 0; i < series.dates.length; i += 1) {
    if (series.dates[i] > freezeDate) {
      live.dates.push(series.dates[i]);
      live.values.push(series.values[i]);
    }
  }
  return {
    dates: live.dates,
    values: live.values,
    joinDate: series.dates[0],
    joinValue: series.values[0],
  };
}

/**
 * The frozen series with the live tail appended. Frozen values are copied, never
 * recomputed, and only dates strictly after the freeze date are added.
 *
 * @returns {{dates: string[], values: number[], freezeIndex: number, liveCount: number}}
 */
export function appendLiveTail(frozen, live, freezeDate) {
  if (!frozen || !Array.isArray(frozen.dates) || !Array.isArray(frozen.values)) {
    throw new Error('the frozen series from data/results.json is missing');
  }
  if (frozen.dates.length !== frozen.values.length) {
    throw new Error(
      `data/results.json has ${frozen.dates.length} frozen dates for ${frozen.values.length} values`,
    );
  }
  const past = frozen.dates.filter((date) => date > freezeDate);
  if (past.length > 0) {
    throw new Error(
      `the frozen series runs past the freeze date ${freezeDate} `
      + `(${past[0]}). data/results.json must end on the freeze date`,
    );
  }

  const dates = [...frozen.dates];
  const values = [...frozen.values];
  const freezeIndex = dates.length - 1;
  let liveCount = 0;
  for (let i = 0; i < live.dates.length; i += 1) {
    const date = live.dates[i];
    // On or before the freeze date the frozen value wins, always.
    if (date <= freezeDate) continue;
    if (dates.length > 0 && date <= dates[dates.length - 1]) {
      throw new Error(`the live dates are out of order: ${date} is not after ${dates[dates.length - 1]}`);
    }
    dates.push(date);
    values.push(live.values[i]);
    liveCount += 1;
  }
  return { dates, values, freezeIndex, liveCount };
}

function fourPlaces(value) {
  return Number.isFinite(value) ? value.toFixed(4) : '–';
}

/**
 * Everything the page needs to draw the chart: the joined series, whether to
 * shade a band, and the sentence to print.
 *
 * NO THROWS. A broken or missing game.json costs the page its tail, not its
 * chart: the status is "unavailable", the frozen series is returned untouched
 * and the reason is printed.
 *
 * status is one of:
 *   "band"        two or more trading days have closed after the freeze date
 *   "one-day"     exactly one has, so there is a point but no band worth shading
 *   "none"        none has yet
 *   "unavailable" the live tail could not be built; the reason says why
 */
export function liveTailState({ frozen, game, members, benchmark, freezeDate, window = ROLLING_WINDOW }) {
  const base = {
    status: 'unavailable',
    frozen,
    dates: [...(frozen?.dates ?? [])],
    values: [...(frozen?.values ?? [])],
    freezeIndex: (frozen?.dates?.length ?? 0) - 1,
    liveCount: 0,
    joinGap: null,
    shade: null,
    reason: '',
    sentence: '',
  };

  let live;
  let joined;
  try {
    if (!game) throw new Error('data/game.json could not be loaded');
    live = computeLiveRolling(game, { members, benchmark, window, freezeDate });
    const gap = Math.abs(live.joinValue - frozen.values[frozen.values.length - 1]);
    if (!(gap <= JOIN_TOLERANCE)) {
      return {
        ...base,
        reason: `the two halves do not join at ${freezeDate}: live prices give `
          + `${fourPlaces(live.joinValue)} where the published series has `
          + `${fourPlaces(frozen.values[frozen.values.length - 1])}, a gap of ${gap.toExponential(1)}, `
          + `above the ${JOIN_TOLERANCE} this chart allows`,
        joinGap: gap,
        sentence: `The chart shows the frozen series only, through ${freezeDate}. The live part was `
          + `left off because the two halves do not join at ${freezeDate} `
          + `(a gap of ${gap.toExponential(1)}, above the ${JOIN_TOLERANCE} allowed), which means they `
          + 'are not measuring the same thing. No verdict is affected.',
      };
    }
    joined = appendLiveTail(frozen, live, freezeDate);
    base.joinGap = gap;
  } catch (error) {
    return {
      ...base,
      reason: error.message,
      sentence: `The chart shows the frozen series only, through ${freezeDate}. The live part could `
        + `not be added: ${error.message}. No verdict is affected.`,
    };
  }

  const { dates, values, freezeIndex, liveCount } = joined;
  const state = { ...base, dates, values, freezeIndex, liveCount, reason: '' };
  const firstLive = freezeIndex + 1;

  if (liveCount === 0) {
    return {
      ...state,
      status: 'none',
      shade: null,
      sentence: `No trading day has closed after the freeze date ${freezeDate}, so the line ends `
        + 'there and there is nothing to shade yet. From the first trading day after it, the chart '
        + 'continues on live prices, and that part enters no verdict.',
    };
  }

  if (liveCount === 1) {
    return {
      ...state,
      status: 'one-day',
      // The band is not drawn for a single day: between two points it would be a
      // hairline nobody could see or hover. The day is named here instead.
      shade: { fromIndex: firstLive, label: SHADE_LABEL, band: false },
      sentence: `One trading day has closed after the freeze date ${freezeDate}: the ${window}-day `
        + `window ending ${dates[firstLive]}, at ${fourPlaces(values[firstLive])}, computed from live `
        + 'prices with the same basket, benchmark and window as the frozen half. One day is too '
        + `narrow to shade as a band, so it is named here instead. It is ${SHADE_LABEL}.`,
    };
  }

  return {
    ...state,
    status: 'band',
    shade: { fromIndex: firstLive, label: SHADE_LABEL, band: true },
    sentence: `The shaded part is the ${liveCount} trading days after the freeze date `
      + `${freezeDate}, ${dates[firstLive]} to ${dates[dates.length - 1]}, computed from live prices `
      + `with the same basket, benchmark and ${window}-day window as the frozen half. It is `
      + `${SHADE_LABEL}.`,
  };
}
