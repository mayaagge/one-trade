// js/weekly.js - which portfolio this week is, and which days it is measured over.
//
// docs/PRD.md: "one new mystery portfolio each Monday, so there's a reason to
// come back and to post about it."
//
// THE WEEK IS A PURE FUNCTION OF THE DATE. Nothing is drawn, nothing is stored
// to decide it, and no server is asked: two browsers opened on the same day in
// different cities deal the same portfolio because both count weeks from
// levels.json's firstMonday. The same reasoning as the daily puzzle, which
// picks its pairs from the date rather than from a draw.
//
// EVERY PLAYER IN A WEEK GETS THE SAME ANSWER, which is a harder promise than
// it looks. data/game.json is rebuilt every weekday evening, so a window ending
// on "the latest day" would answer differently on Monday and on Friday. The
// window therefore ends on the FRIDAY BEFORE the Monday, a day that does not
// move while the week runs. What still moves is the far end: the file keeps
// only the most recent 756 days, so each refresh drops one off the back and the
// anchored window is a few days shorter by Friday. Measured across the ten
// portfolios that is worth at most 0.022 bets - it cannot change a star, and
// tests/weekly.test.js holds it there.
//
// NOTHING LEAVES THE BROWSER. A weekly guess is not one of the two messages
// docs/PRD.md allows the Worker, so no record is made and none is sent. The
// round is created with no emitter at all.
//
// Educational, not investment advice.

/** Where this week's answer is kept. Versioned: an old shape is not a new one. */
export const WEEKLY_STORAGE_KEY = 'oneTrade.weekly.v1';

const DAY = 86400000;

/** A YYYY-MM-DD date as a UTC timestamp, so no local clock or zone is involved. */
function at(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    throw new Error(`weekly: "${date}" is not a YYYY-MM-DD date`);
  }
  return Date.UTC(y, m - 1, d);
}

/** A UTC timestamp back as YYYY-MM-DD. */
const asDate = (stamp) => new Date(stamp).toISOString().slice(0, 10);

/**
 * The Monday of the week a date falls in.
 *
 * Calendar arithmetic on the date STRING, never on a timestamp in the local
 * zone: the caller passes the date in New York, and "the Monday of that date"
 * is then the same answer everywhere, through a clock change and over a year
 * end. Midnight in New York is where one week becomes the next, so a Sunday
 * belongs to the week that started six days earlier.
 */
export function mondayOf(date) {
  const stamp = at(date);
  const weekday = new Date(stamp).getUTCDay();          // 0 Sunday ... 6 Saturday
  const since = (weekday + 6) % 7;                      // days since Monday
  return asDate(stamp - since * DAY);
}

/** Is this date a Monday? */
export function isMonday(date) {
  return new Date(at(date)).getUTCDay() === 1;
}

/** The Friday before a Monday: three calendar days back. */
export function anchorFriday(monday) {
  if (!isMonday(monday)) throw new Error(`weekly: ${monday} is not a Monday`);
  return asDate(at(monday) - 3 * DAY);
}

/**
 * The last trading day the file carries on or before a date, or null if it
 * reaches no further back.
 *
 * This is what makes a holiday Friday harmless without a holiday calendar: ask
 * the prices which days exist rather than working out which ones should.
 */
export function anchorTradingDay(dates, on) {
  let found = null;
  for (const date of dates) {
    if (date <= on) found = date;
    else break;
  }
  return found;
}

/**
 * Which of the ten this week gets, counting weeks from the first Monday, or
 * null before the challenge started.
 */
export function weekIndex(firstMonday, monday, count) {
  if (!Number.isInteger(count) || count <= 0) throw new Error('weekly: the list of portfolios is empty');
  const weeks = Math.round((at(monday) - at(firstMonday)) / (7 * DAY));
  if (weeks < 0) return null;
  return weeks % count;
}

/** This week's portfolio, or null before the first Monday. */
export function portfolioFor(weekly, monday) {
  const index = weekIndex(weekly.firstMonday, monday, weekly.portfolios.length);
  return index === null ? null : weekly.portfolios[index];
}

/**
 * Is a stored record one this code can trust?
 *
 * Anything else - another version's shape, a half-written value, a hand-edited
 * one - is ignored rather than obeyed, the same rule the daily puzzle follows
 * and for the same reason: a record that is partly understood produces a screen
 * nobody can explain.
 */
export function isRecord(record) {
  return Boolean(record)
    && typeof record === 'object'
    && !Array.isArray(record)
    && typeof record.week === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(record.week)
    && Number.isFinite(record.guess);
}

/**
 * Everything the screen needs for a date: which week it is, which portfolio,
 * and whether this browser has already answered.
 *
 * @param {object} weekly levels.json's weekly block
 * @param {object|null} record what storage had
 * @param {string} today the date in New York
 */
export function weeklyState(weekly, record, today) {
  const monday = mondayOf(today);
  const portfolio = portfolioFor(weekly, monday);
  if (portfolio === null) {
    return {
      status: 'notStarted',
      monday,
      firstMonday: weekly.firstMonday,
      portfolio: null,
      guess: null,
    };
  }
  // A record from another week answers nothing about this one.
  const mine = isRecord(record) && record.week === monday ? record : null;
  return {
    status: mine ? 'done' : 'playing',
    monday,
    firstMonday: weekly.firstMonday,
    portfolio,
    guess: mine ? mine.guess : null,
  };
}

/** What to write down: the week, and the guess. Never the answer. */
export function recordOf(state) {
  return { week: state.monday, guess: state.guess };
}

/** The date in New York, which is where this game's day and week turn over. */
export function todayInNewYork(now = new Date(), timeZone = 'America/New_York') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** A date as a player reads it: 30 November 2026. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export function longDate(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
