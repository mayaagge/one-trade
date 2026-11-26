// js/build.js - the build screen: pick holdings, split the money.
//
// WHY THIS IS ITS OWN FILE. Learn's levels and Crash replay ask a player for the
// same thing - some holdings and a split of $10,000 - and the PRD has two more
// modes coming that ask for it too (Sandbox, and My real portfolio). The picker
// and the allocator lived inside js/game.js, where only Learn could reach them;
// they are here so there is one build screen in the game rather than one per
// mode, and so a change to how money moves changes it everywhere at once.
//
// WHAT IT KNOWS ABOUT, and nothing more: a BUILD. That is any object with the
// shape js/round.js's round has - picks, pool, dollars, total, required, floors,
// and the methods that change them - so this file does not know what a level is,
// whether anything is being scored, or what happens next. Crash replay has no
// level and no stars, and the screen is the same screen.
//
// PHONE FIRST, as in js/game.js: one column, 44px targets, no keyboard needed.
// A control that cannot do anything is disabled rather than offered - the minus
// button on a holding at its floor, and the chip for a holding the level deals
// and keeps.
//
// Educational, not investment advice.

import { DOLLAR_STEP } from './round.js';

// ------------------------------------------------------------------ DOM bits

/** An element with a class and some text, which is most of what this file makes. */
export function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

/** A button that cannot submit anything, with an optional spoken label. */
export function button(label, className, onClick, { disabled = false, aria = null } = {}) {
  const node = h('button', className, label);
  node.type = 'button';
  node.disabled = disabled;
  if (aria) node.setAttribute('aria-label', aria);
  node.addEventListener('click', onClick);
  return node;
}

/** The money, as a player reads it. */
export function money(dollars) {
  return `$${dollars.toLocaleString('en-US')}`;
}

// -------------------------------------------------------------- the picker

/**
 * The tickers a build may hold, laid out under their group headings.
 *
 * @param {object} build        a round, or anything with its build interface
 * @param {object[]} options.groups tickers.json's groups, for the headings and the order
 * @param {Function} options.redraw what to call after a tap
 * @param {Function} [options.reasonFor] why a ticker cannot be picked here, or null
 *        if it can. Crash replay uses it for a holding that had not listed yet in
 *        the window being replayed; Learn passes none.
 */
export function tickerPicker(build, { groups, redraw, reasonFor = () => null }) {
  const wrap = h('div', 'picker');
  const inPool = new Set(build.pool);

  for (const group of groups) {
    const names = group.tickers
      .map((t) => (typeof t === 'string' ? t : t.ticker))
      .filter((t) => inPool.has(t));
    if (names.length === 0) continue;

    const section = h('section', 'picker-group');
    section.append(h('h3', 'picker-group-label', group.label));
    const row = h('div', 'picker-row');
    for (const ticker of names) {
      const held = build.hasPick(ticker);
      // A holding the build deals and keeps - level 4's QQQ - is shown held and
      // locked rather than tappable and then refused. The round throws if it is
      // removed, and a button whose only outcome is an error is not a button.
      const locked = (build.required ?? []).includes(ticker);
      const unavailable = held ? null : reasonFor(ticker);
      const node = button(ticker, [
        'chip', held ? 'chip-on' : null, locked ? 'chip-locked' : null,
        unavailable ? 'chip-unavailable' : null,
      ].filter(Boolean).join(' '), () => {
        build.togglePick(ticker);
        redraw();
      }, {
        // A full pool stays tappable for the names already held, so a player can
        // always swap one out; the rest go flat rather than vanishing.
        disabled: locked || Boolean(unavailable) || (!held && !build.canAddPick()),
        aria: locked
          ? `${ticker} is required on this level`
          : unavailable ?? `${held ? 'Remove' : 'Add'} ${ticker}`,
      });
      node.setAttribute('aria-pressed', String(held));
      if (unavailable) node.title = unavailable;
      row.append(node);
    }
    section.append(row);
    wrap.append(section);
  }
  return wrap;
}

// ----------------------------------------------------------- the allocator

/** The money, split across the holdings, moved in $100 steps. */
export function allocator(build, { redraw }) {
  const wrap = h('div', 'allocator');
  wrap.append(h('h3', 'allocator-head', `Split your ${money(build.total)}`));
  for (const ticker of build.picks) {
    const dollars = build.dollars[ticker] ?? 0;
    const row = h('div', 'alloc-row');
    row.append(h('span', 'alloc-ticker', ticker));
    const amount = h('span', 'alloc-amount');
    amount.append(h('strong', null, money(dollars)));
    amount.append(h('span', 'alloc-share', `${Math.round((dollars / build.total) * 100)}%`));
    row.append(amount);
    const buttons = h('div', 'alloc-buttons');
    // A step that cannot be taken is not offered. On level 4 that is QQQ at its
    // $3,000 floor, and on every build it is the last $100 of any holding: the
    // build asked for this many holdings, and a holding of nothing is one fewer.
    buttons.append(button('−', 'btn btn-step', () => {
      build.adjustDollars(ticker, -1);
      redraw();
    }, { aria: `Take ${money(DOLLAR_STEP)} off ${ticker}`, disabled: !build.canLower(ticker) }));
    buttons.append(button('+', 'btn btn-step', () => {
      build.adjustDollars(ticker, 1);
      redraw();
    }, { aria: `Add ${money(DOLLAR_STEP)} to ${ticker}`, disabled: !build.canRaise(ticker) }));
    row.append(buttons);
    wrap.append(row);
  }
  wrap.append(h('p', 'note', `Moves in ${money(DOLLAR_STEP)} steps, always adding up to ${money(build.total)}. It starts split evenly.`));
  // The floors a build puts under a holding, named with the share asked for and
  // the dollars it comes to, so the locked minus button has a reason beside it
  // rather than just being flat.
  for (const line of floorNotes(build)) wrap.append(h('p', 'note note-floor', line));
  return wrap;
}

/**
 * One line per floor the build puts under the money: level 4's "at least 30% in
 * QQQ", and level 6's "at least 60% in stocks", each as a share and as the
 * dollars it works out to.
 *
 * A build with no floors - which is every other level, and Crash replay - gets no
 * lines rather than an empty heading.
 *
 * THE FLOOR ON A KIND REPORTS WHERE THE MONEY IS NOW, because unlike a floor on
 * one holding it can be unmet while every row on the screen looks legal: four
 * bond funds, $2,500 each, nothing below its $100, and 0% of it in stocks. The
 * line that says so has to carry the running total, or the disabled Next button
 * above it has no explanation on screen.
 */
export function floorNotes(build) {
  const shares = build.level?.holdings?.minShare ?? {};
  const lines = Object.entries(shares).map(([ticker, share]) => {
    const floor = build.floorOf(ticker);
    return `${ticker} stays at ${money(floor)} or more: the ${Math.round(share * 100)}% `
      + `this level asks you to keep in it.`;
  });

  const kind = build.kindFloor;
  if (kind) {
    const held = build.allocatedInKind();
    lines.push(`${money(kind.dollars)} of the ${money(build.total)} has to sit in ${kind.kind} `
      + `- the ${Math.round(kind.share * 100)}% this level asks for. `
      + `You have ${money(held)} in ${kind.kind}.`);
  }
  return lines;
}
