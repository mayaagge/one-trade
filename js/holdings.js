// js/holdings.js - reading a real portfolio out of two text boxes.
//
// My real portfolio is the only screen in this game a player types into. Every
// other mode is taps on chips the screen chose, where the only input possible is
// one the game already approved; here somebody types a ticker and an amount, and
// either can be anything.
//
// SO THIS FILE IS THE RULES ABOUT WHAT CANNOT BE USED, and it has one rule above
// all: NOTHING IS DROPPED QUIETLY. Every line that cannot be used comes back as a
// plain message naming the box it belongs to, and the row is not added. The
// alternative - a try/catch that skips what it cannot parse - would mean a
// player's $4,000 in a misspelled ticker silently missing from a total they are
// reading as their own portfolio, and every measure below it computed on a
// portfolio that is not theirs. A wrong total is worse than a refused row.
//
// IT HOLDS NOTHING BUT THE ROWS. No history, no last-known-good copy, no
// storage: docs/PRD.md promises of this mode that "nothing is stored or sent",
// and the cheapest way to keep that promise is to have nowhere to put anything.
// A removed holding leaves no trace that could be read back later.
//
// NO DOM AND NO MEASURES. The screen is js/myPortfolio.js and the arithmetic is
// js/measures.js; what is here is only the reading of two strings.
//
// Educational, not investment advice.

/** Two, because a correlation and a closest pair need a pair to be about. */
export const LEAST_HOLDINGS = 2;

/**
 * Fifteen.
 *
 * Not a limit of the arithmetic - the measures would take forty - but of the
 * screen and of the typing. Fifteen rows is already a long phone screen, and a
 * player with more holdings than that can enter the fifteen that carry the money
 * and still read a portfolio that is substantially theirs. A sixteenth is
 * refused with a reason rather than silently ignored.
 */
export const MOST_HOLDINGS = 15;

/**
 * A dollar amount, as somebody actually types it.
 *
 * Returns `{dollars}` or `{problem}`, never both, and never throws: a typo is an
 * ordinary thing for a text box to contain, not an exception.
 *
 * WHAT IS ACCEPTED, and why each one:
 *   * "5000" - plain digits, the common case;
 *   * "5,000" and "1,250,000" - commas where a reader would put them, because
 *     people type them and brokerage pages print them;
 *   * "$5,000" and " 5000 " - a dollar sign and spaces, because people paste;
 *   * "12,500.00" and "12,500.37" - cents, rounded to the nearest dollar,
 *     because a real balance usually has cents and a screen that refused them
 *     would be refusing the commonest paste of all.
 *
 * THE ROUNDING IS SHOWN, NOT HIDDEN. Rounding changes a number the player typed,
 * so the row on the screen displays what was recorded - $12,500 for "12,500.37"
 * - rather than echoing what was typed. A cent either way moves no measure in
 * this game: the biggest holding would have to shift by about $50 in $10,000 to
 * move a share of risk by a tenth of a point.
 *
 * WHAT IS REFUSED, and why:
 *   * "1,25" - a misgrouped comma is a slip for either 125 or 1,250, and
 *     guessing which would put a number on the screen the player never typed;
 *   * "0" and anything negative - a holding of nothing is not a holding, and a
 *     negative one is not something this game can measure;
 *   * "0.37" - more than nothing, but it rounds to nothing, so it is refused
 *     with a message that says so rather than becoming a $0 holding;
 *   * "5k", "1e5", "five thousand" - readable by a machine, perhaps, but a box
 *     that accepts "1e5" as $100,000 is a box that will one day accept a typo as
 *     a fortune.
 */
export function parseDollars(text) {
  const raw = String(text ?? '').trim();
  if (raw.length === 0) return { problem: 'Put an amount in dollars in this box.' };

  // The dollar sign and any spaces inside the number come off first; what is
  // left has to match one of the two shapes exactly.
  const cleaned = raw.replace(/^\$/, '').replace(/\s/g, '');
  if (cleaned.length === 0) return { problem: 'Put an amount in dollars in this box.' };

  if (cleaned.startsWith('-')) {
    return { problem: `A holding cannot be a minus amount, and "${raw}" is one.` };
  }

  // The cents come off first, so what is left is checked for its commas as a
  // whole number is. Any number of cent digits is taken - a balance is usually
  // two, but there is nothing to gain from refusing three.
  let whole = cleaned;
  let cents = 0;
  const dot = cleaned.indexOf('.');
  if (dot !== -1) {
    const after = cleaned.slice(dot + 1);
    whole = cleaned.slice(0, dot);
    if (!/^\d+$/.test(after)) return { problem: `"${raw}" is not a number of dollars.` };
    cents = Number(`0.${after}`);
  }

  // Either plain digits, or digits grouped in threes after the first group.
  const plain = /^\d+$/.test(whole);
  const grouped = /^\d{1,3}(,\d{3})+$/.test(whole);
  if (!plain && !grouped) {
    if (whole.includes(',')) {
      return {
        problem: `The commas in "${raw}" are not in the usual places, so it is not clear `
          + 'what it means. Try it without commas.',
      };
    }
    return { problem: `"${raw}" is not a number of dollars.` };
  }

  const exact = Number(whole.replace(/,/g, '')) + cents;
  if (!Number.isFinite(exact)) return { problem: `"${raw}" is not a number of dollars.` };
  if (!(exact > 0)) return { problem: 'A holding has to be more than $0.' };

  const dollars = Math.round(exact);
  // MORE THAN NOTHING, BUT IT ROUNDS TO NOTHING. A holding of $0 would carry no
  // weight and no risk, so it is refused here with a message naming both numbers
  // rather than added as a row that cannot affect anything.
  if (dollars === 0) {
    return { problem: `$${exact} rounds to $0, and a holding has to be at least $1.` };
  }
  return { dollars };
}

/**
 * A ticker, as somebody actually types it, checked against the game's own list.
 *
 * Returns `{ticker}` or `{problem}`. The message NAMES THE TICKER and says where
 * the list is; it does not say "error" or "invalid", because a player who typed
 * TSLA has not done anything wrong - this game simply does not carry it.
 *
 * @param {string[]} options.universe tickers.json's names
 * @param {Set} options.priced which of them data/game.json has prices for
 * @param {string[]} [options.already] the tickers already in the list
 */
export function readTicker(text, { universe, priced, already = [] }) {
  const ticker = String(text ?? '').trim().toUpperCase();
  if (ticker.length === 0) return { problem: 'Put a ticker in this box.' };

  if (!universe.includes(ticker)) {
    return {
      problem: `${ticker} is not one of the tickers this game carries. The list on the `
        + 'Sandbox screen is all of them.',
    };
  }
  // In the list but with no prices yet: a name added to tickers.json before the
  // next data refresh. Explained rather than accepted and then failing at the
  // measure, which is the same job js/sandbox.js's reasonFor() does.
  if (!priced.has(ticker)) {
    return { problem: `${ticker} has no prices in this game's data yet, so it cannot be measured.` };
  }
  if (already.includes(ticker)) {
    return { problem: `${ticker} is already in your list. Remove it first to change the amount.` };
  }
  return { ticker };
}

/**
 * The list of holdings a player has entered.
 *
 * `rows` is the only state, and it is the only non-function property: a test
 * asserts that, because "nothing is stored" is easiest to keep true when there
 * is nowhere to store it.
 */
export function createHoldings({ universe, priced }) {
  const list = {
    rows: [],
  };

  /** Add a row, or say why not. The ticker box is checked first. */
  list.add = (tickerText, dollarText) => {
    if (list.rows.length >= MOST_HOLDINGS) {
      return {
        ok: false,
        field: 'ticker',
        problem: `This screen takes up to ${MOST_HOLDINGS} holdings, and you have `
          + `${list.rows.length}. Remove one to add another.`,
      };
    }
    // THE TICKER FIRST, so one bad row reports one problem. Both boxes can be
    // wrong at once, and two messages at the same time is two things to fix
    // before anything happens; the ticker is the box a player fills in first.
    const read = readTicker(tickerText, {
      universe, priced, already: list.rows.map((row) => row.ticker),
    });
    if (read.problem) return { ok: false, field: 'ticker', problem: read.problem };

    const amount = parseDollars(dollarText);
    if (amount.problem) return { ok: false, field: 'dollars', problem: amount.problem };

    list.rows = [...list.rows, { ticker: read.ticker, dollars: amount.dollars }];
    return { ok: true, ticker: read.ticker };
  };

  /** Take a holding out. A name that is not there is not an error. */
  list.remove = (ticker) => {
    list.rows = list.rows.filter((row) => row.ticker !== ticker);
    return list;
  };

  /** Everything, gone. Used by "Start again" and by leaving the mode. */
  list.clear = () => {
    list.rows = [];
    return list;
  };

  /** The real total, which is what this mode is about: not $10,000. */
  list.total = () => list.rows.reduce((sum, row) => sum + row.dollars, 0);

  /**
   * One holding's share of the total, unrounded.
   *
   * The screen rounds this for display; what the measures are handed is the
   * exact ratio, so a portfolio of $3,333 and $6,667 is measured at 0.3333 and
   * 0.6667 rather than at a rounded third.
   */
  list.shareOf = (ticker) => {
    const row = list.rows.find((at) => at.ticker === ticker);
    const total = list.total();
    if (!row || !(total > 0)) return 0;
    return row.dollars / total;
  };

  /** Ticker to dollars, which is what js/measures.js takes. */
  list.dollarsFor = () => Object.fromEntries(list.rows.map((row) => [row.ticker, row.dollars]));

  list.isFull = () => list.rows.length >= MOST_HOLDINGS;

  list.canMeasure = () => list.rows.length >= LEAST_HOLDINGS
    && list.rows.length <= MOST_HOLDINGS
    && list.total() > 0;

  /** Why the measures cannot be shown yet, in the player's own words, or null. */
  list.whyNot = () => {
    if (list.canMeasure()) return null;
    const short = LEAST_HOLDINGS - list.rows.length;
    return `Add ${short === 1 ? 'one more holding' : `${short} holdings`}. Several of the `
      + 'measures - how your holdings move together, and the closest pair you hold - need at '
      + `least ${LEAST_HOLDINGS} to be about.`;
  };

  return list;
}
