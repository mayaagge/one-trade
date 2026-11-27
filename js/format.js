// js/format.js - the one place that turns a number or a date into what a
// player reads: money, percentages, measures, dates, and the minus sign.
//
// Every other module re-exports from here rather than defining its own, so
// "the same everywhere" is one function to test instead of six. This file is
// pure - no DOM, no fetch, no level data - so js/levels.js can import from it
// without a cycle.
//
// Educational, not investment advice.

export const MINUS = '−';

/**
 * Swap a leading hyphen-minus for the true minus - unless the number it signs
 * rounded to zero, in which case the sign is dropped rather than shown on a
 * zero. `(-0.3).toFixed(0)` is the string "-0", and "-0%" reads as a mistake.
 */
export function withMinus(text) {
  if (!text.startsWith('-')) return text;
  const bare = text.slice(1);
  if (Number(bare.replace(/%$/, '')) === 0) return bare;
  return `${MINUS}${bare}`;
}

/** The money, as a player reads it: $1,480. */
export function money(dollars) {
  return `$${dollars.toLocaleString('en-US')}`;
}

/** A share of the portfolio, as a whole percent. Can be negative - a hedged
 * holding's share of risk can go below 0. */
export function percent(share) {
  if (!Number.isFinite(share)) throw new Error('percent: expected a number');
  return withMinus(`${Math.round(share * 100)}%`);
}

/**
 * A move over a window, as a signed whole percent: "+14%", "−2%", "0%".
 *
 * SIGNED, AND NOT WORDED. The crash cards name one holding's own move, and the
 * holding that cushioned a fall is sometimes one that rose and sometimes one
 * that merely fell least, so a template cannot say "rose" or "fell" without
 * being wrong half the time. Putting the direction in the number keeps the
 * sentence true either way.
 */
export function signedPercent(change) {
  if (!Number.isFinite(change)) throw new Error('signedPercent: expected a number');
  const whole = Math.round(change * 100);
  // -0% is an artefact of rounding a tiny fall, and reads as a mistake.
  if (whole === 0) return '0%';
  return whole > 0 ? `+${whole}%` : `${MINUS}${Math.abs(whole)}%`;
}

/**
 * A gap between two shares, in whole percentage points, signed: "+3", "−2",
 * "0". Used where the number is a difference rather than a share of anything,
 * so it carries no "%" of its own context (the column header says so once).
 */
export function signedPoints(points) {
  if (!Number.isFinite(points)) throw new Error('signedPoints: expected a number');
  const whole = Math.round(points);
  if (whole === 0) return '0';
  return whole > 0 ? `+${whole}` : `${MINUS}${Math.abs(whole)}`;
}

/**
 * How close to a threshold a result has to be before it is shown to 4 decimals
 * instead of 2. docs/PRD.md: "A displayed number never disagrees with the pass
 * check." VTI and VXUS correlate at 0.800 over the current window, so this is
 * not a hypothetical.
 */
export const CLOSE_TO_THRESHOLD = 0.005;

/**
 * Format a measure so that what it shows can never contradict the pass check.
 *
 * A result within CLOSE_TO_THRESHOLD of its threshold, or one that would round
 * to the same text as the threshold, is shown to 4 decimals. So 0.7996 against
 * a 0.8 threshold reads "0.7996" and fails, rather than reading "0.80" and
 * failing.
 */
export function formatMeasure(value, {
  threshold = null, places = 2, closePlaces = 4, display = 'number',
} = {}) {
  if (!Number.isFinite(value)) return '–';
  if (display === 'percent') return formatPercentMeasure(value, threshold);
  if (display !== 'number') throw new Error(`formatMeasure: unknown display "${display}"`);
  if (threshold !== null && Number.isFinite(threshold)) {
    const near = Math.abs(value - threshold) <= CLOSE_TO_THRESHOLD;
    const collides = value.toFixed(places) === threshold.toFixed(places) && value !== threshold;
    if (near || collides) return withMinus(value.toFixed(closePlaces));
  }
  return withMinus(value.toFixed(places));
}

/**
 * A share of 1, shown as a percent, under the same rule.
 *
 * The closeness test is done in the measure's own units, where
 * CLOSE_TO_THRESHOLD is 0.005 - half a percentage point, which is exactly the
 * width a whole percent can round across. So a biggest risk share of 0.3549
 * against level 5's 35% reads "35.49%" and fails, never "35%" and fails.
 */
function formatPercentMeasure(value, threshold) {
  const places = 0;
  const closePlaces = 2;
  if (threshold !== null && Number.isFinite(threshold)) {
    const near = Math.abs(value - threshold) <= CLOSE_TO_THRESHOLD;
    const collides = (100 * value).toFixed(places) === (100 * threshold).toFixed(places)
      && value !== threshold;
    if (near || collides) return withMinus(`${(100 * value).toFixed(closePlaces)}%`);
  }
  return withMinus(`${(100 * value).toFixed(places)}%`);
}

// ---------------------------------------------------------------- dates

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2026-11-25 as "25 Nov 2026" - the one date style, everywhere a player reads one. */
export function longDate(date) {
  const [year, month, day] = String(date).split('-').map(Number);
  if (!(month >= 1 && month <= 12) || !Number.isFinite(day) || !Number.isFinite(year)) {
    throw new Error(`longDate: "${date}" is not an ISO date`);
  }
  return `${day} ${MONTH_ABBR[month - 1]} ${year}`;
}

/**
 * An ISO date as "Mon D" - "Feb 19" - for a chart's x-axis and tooltip, where a
 * full date would crowd the axis and every window sits inside one year anyway.
 *
 * Parsed straight out of the string rather than through a Date object, which
 * would read the day back in whatever timezone the browser is in.
 */
export function formatShortDate(isoDate) {
  const [, month, day] = String(isoDate).split('-');
  const index = Number(month) - 1;
  if (!(index >= 0 && index < 12) || !Number.isFinite(Number(day))) {
    throw new Error(`formatShortDate: "${isoDate}" is not an ISO date`);
  }
  return `${MONTH_ABBR[index]} ${Number(day)}`;
}
