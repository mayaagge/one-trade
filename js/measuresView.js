// js/measuresView.js - the measures, on a screen. Two modes show the same ones.
//
// Sandbox and My real portfolio ask different questions - "what would this
// portfolio do?" and "what does mine do?" - and then show the SAME six measures
// in the same words. This file is those panels, so that the wording is written
// once.
//
// WHY THAT MATTERS MORE HERE THAN USUALLY. My real portfolio may not sound like
// advice: it describes what a portfolio does and never what to do about it. That
// is a property of particular sentences, and sentences copied into two files
// drift apart one edit at a time - a note softened on one screen and not the
// other, and the audit that passed last month now passes on half the game. One
// copy, one audit: tests/myPortfolio.test.js scans what these panels render.
//
// WHAT IS NOT HERE: the headline panel's heading, the buttons, and anything
// about pretend money. Those differ between the two modes, and a difference
// belongs in the mode rather than behind a flag in here.
//
// Every number comes in already computed, from js/measures.js. Nothing in this
// file does arithmetic beyond rounding for display.
//
// Educational, not investment advice.

import { h, money } from './build.js';
import { formatMeasure, longDate, signedPoints } from './format.js';
import { BETS_NOTE } from './measures.js';
import { formatBeta, percent } from './why.js';

/** How many pairs the correlation list shows before it says there are more. */
export const PAIRS_SHOWN = 10;

/** One labelled number, with its own line of explanation under it. */
export function measureRow(label, value, note) {
  const row = h('div', 'measure-row');
  row.append(h('p', 'measure-label', label));
  row.append(h('p', 'measure-value', value));
  if (note) row.append(h('p', 'measure-note', note));
  return row;
}

/**
 * Every holding's share of the money beside its share of the risk.
 *
 * docs/PRD.md's reason for computing the shares this way: "The shares sum to
 * 100%, so they can be compared directly with dollar weights." This table is
 * that comparison, and the gap column is the whole lesson of level 5 - a bond
 * fund that takes a fifth of the money and a twentieth of the risk, and a single
 * stock doing the reverse.
 */
export function riskTable(result) {
  const wrap = h('section', 'measure-table');
  wrap.append(h('h2', 'section-head', 'Where the money is, and where the risk is'));
  const table = h('table', 'shares-table');

  const headRow = h('tr', null);
  for (const label of ['Holding', 'Share of money', 'Share of risk', 'Difference']) {
    const cell = h('th', null, label);
    cell.setAttribute('scope', 'col');
    headRow.append(cell);
  }
  const thead = h('thead', null);
  thead.append(headRow);
  table.append(thead);

  const body = h('tbody', null);
  // Biggest share of the risk first: the holding carrying the portfolio is the
  // one a player is looking for, and it is not always the biggest holding.
  const rows = [...result.holdings].sort((a, b) => b.riskShare - a.riskShare);
  for (const holding of rows) {
    const row = h('tr', null);
    const name = h('th', null, holding.ticker);
    name.setAttribute('scope', 'row');
    row.append(name);
    row.append(h('td', null, percent(holding.dollarShare)));
    row.append(h('td', null, percent(holding.riskShare)));
    // The gap in percentage POINTS, signed, because that is what it is: the
    // difference between two shares, not a change in one of them.
    row.append(h('td', 'shares-gap', signedPoints(holding.gap * 100)));
    body.append(row);
  }
  table.append(body);
  wrap.append(table);
  wrap.append(h('p', 'note', 'The shares of risk add up to 100%, so they can be read straight '
    + 'across against the shares of money. A holding with a bigger share of the risk than of '
    + 'the money is doing more of the moving than its size suggests; the difference column is '
    + 'in percentage points.'));
  return wrap;
}

/**
 * The pairs, closest first.
 *
 * Every pair is computed - the matrix is the whole matrix - and the list shows
 * the closest PAIRS_SHOWN of them with a line saying so. A list that stopped at
 * ten without saying there were 780 would be hiding its own arithmetic.
 */
export function rankedPairs(result) {
  const pairs = [];
  for (let i = 0; i < result.tickers.length - 1; i += 1) {
    for (let j = i + 1; j < result.tickers.length; j += 1) {
      pairs.push({ a: result.tickers[i], b: result.tickers[j], r: result.correlations[i][j] });
    }
  }
  // Ties keep index order, which is the order the portfolio was built in, so the
  // list does not depend on how the object was assembled.
  return pairs.sort((x, y) => y.r - x.r);
}

export function correlationPanel(result) {
  const wrap = h('section', 'measure-table');
  wrap.append(h('h2', 'section-head', 'Which holdings move together'));
  const pairs = rankedPairs(result);
  const shown = pairs.slice(0, PAIRS_SHOWN);

  const list = h('ul', 'pair-list');
  for (const pair of shown) {
    const item = h('li', 'pair-row');
    item.append(h('span', 'pair-names', `${pair.a} and ${pair.b}`));
    item.append(h('span', 'pair-value', formatMeasure(pair.r, { places: 2 })));
    list.append(item);
  }
  wrap.append(list);

  wrap.append(h('p', 'note', pairs.length > shown.length
    ? `The ${shown.length} closest of the ${pairs.length} pairs this portfolio holds, `
      + 'correlation of daily returns over the window below.'
    : `${pairs.length === 1 ? 'The one pair' : `All ${pairs.length} pairs`} this portfolio holds, `
      + 'correlation of daily returns over the window below.'));
  wrap.append(h('p', 'note', '1.00 is two holdings that moved identically, 0 is no relationship, '
    + 'and a negative number is two that moved opposite ways. Two tickers near 1.00 are closer '
    + 'to one bet than to two.'));
  return wrap;
}

/**
 * The stress panel: both betas and the loss as a range.
 *
 * NEVER ONE NUMBER. docs/PRD.md lists "stress estimates are noisy and look
 * backward" among the things this game has to be honest about and answers it
 * with "a beta range is shown, not one number", so the two betas are shown
 * together and the loss is a span between them. The shock itself comes from
 * levels.json, where its reason is written down.
 */
export function stressPanel(result) {
  const wrap = h('section', 'measure-table');
  wrap.append(h('h2', 'section-head', 'If the AI basket fell'));
  const fall = percent(Math.abs(result.loss.shock));

  wrap.append(measureRow(
    'Beta to the AI basket, all days',
    formatBeta(result.beta.allDays),
    'How much this portfolio moved for each 1% the equal-weight AI basket moved, over '
    + 'every day in the window.',
  ));
  wrap.append(measureRow(
    `Beta on the worst ${percent(result.stress.fraction)} of days`,
    formatBeta(result.beta.stressDays),
    `The same beta over the ${result.stress.count} days the S&P 500 fell hardest in this window. `
    + 'The index picks those days, not the AI stocks, so stress is not defined by the holdings '
    + 'being measured.',
  ));
  // FROM THE SMALLER LOSS TO THE LARGER ONE. result.loss.worst is the most
  // negative of the two, so printing the pair in the order the object holds them
  // would read "$1,483 to $1,417" - a range running backwards, which a reader
  // either trips over or silently corrects. The dollars are shown as sizes, with
  // the direction in the heading above them.
  wrap.append(measureRow(
    `A ${fall} fall in the AI basket`,
    `${money(Math.round(Math.abs(result.loss.mildest)))} to ${money(Math.round(Math.abs(result.loss.worst)))}`,
    `Portfolio value times beta times the fall, worked out at both betas above - which is why `
    + 'it is a range and not a number. Both ends are estimates from past daily moves, and a real '
    + `${fall} fall need not treat this portfolio like either of them.`,
  ));
  return wrap;
}

/**
 * The headline panel: effective bets, with the sentence that must go wherever
 * the number appears.
 *
 * docs/PRD.md, on the measure: "It counts risk, not money, so a bond fund adds
 * little. The page says this wherever the number appears." BETS_NOTE is that
 * sentence, one exported constant, so neither screen can show the number
 * without it or show it in different words.
 *
 * @param {string} label what the panel calls the portfolio's holdings, which is
 *        the one thing the two modes word differently
 */
export function betsPanel(result, { label = 'holdings' } = {}) {
  const panel = h('div', 'reveal-panel');
  const shown = formatMeasure(result.bets, { places: 2 });
  panel.append(h('p', 'reveal-label', 'Effective bets'));
  panel.append(h('p', 'reveal-value', shown));
  panel.append(h('p', 'reveal-about', `${result.tickers.length} ${label}, ${shown} separate bets.`));
  panel.append(h('p', 'measure-note', BETS_NOTE));
  return panel;
}

/** The window every measure above was taken over. */
export function windowNote(result) {
  return h('p', 'note', `Measured over ${result.days} trading days, `
    + `${longDate(result.startDate)} to ${longDate(result.endDate)}.`);
}
