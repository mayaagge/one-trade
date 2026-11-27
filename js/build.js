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
// money() now lives in js/format.js, the one place that formats a number for
// a player; imported here for use below and re-exported so every existing
// `from './build.js'` import keeps working unchanged.
import { money } from './format.js';
import { DISCLAIMER } from './levels.js';
import { describePool, kindOf, nameOf } from './names.js';

export { money };

// ------------------------------------------------------------------ DOM bits

/** An element with a class and some text, which is most of what this file makes. */
export function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

/**
 * A button that cannot submit anything, with an optional spoken label and an
 * optional id.
 *
 * THE ID IS FOR KEEPING FOCUS ACROSS A REDRAW. js/screen.js finds a control
 * again by its id or by its aria-label, and a label is only good enough when it
 * does not change: a ticker chip announces itself as "Add GLD" and then as
 * "Remove GLD" the moment it is tapped, so the chip a player just pressed could
 * never be found again and focus fell back to the view. An id naming the ticker
 * is the same before and after.
 */
export function button(label, className, onClick, {
  disabled = false, aria = null, id = null,
} = {}) {
  const node = h('button', className, label);
  node.type = 'button';
  node.disabled = disabled;
  if (aria) node.setAttribute('aria-label', aria);
  if (id) node.id = id;
  node.addEventListener('click', onClick);
  return node;
}

/**
 * A screen that failed to load its data: one heading, a sentence a player can
 * act on, a retry, and the technical detail last - still there for whoever is
 * debugging a local server, but no longer the first thing a player reads.
 *
 * role="alert" on the view itself, because replacing the loading screen with
 * this said nothing to a screen reader before - see docs/DESIGN_REVIEW.md.
 */
export function errorView(title, detail) {
  const view = h('div', 'view');
  view.setAttribute('role', 'alert');
  view.append(h('h1', null, title));
  view.append(h('p', 'lede',
    'Something went wrong loading this page. Check your connection and try again.'));
  view.append(button('Try again', 'btn btn-quiet', () => globalThis.location.reload()));
  view.append(h('p', 'error', detail));
  view.append(h('p', 'disclaimer-inline', DISCLAIMER));
  return view;
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
 * @param {boolean} [options.grouped] false for one alphabetical list with no
 *        headings, which is level 1 and nothing else. See the note below.
 */
export function tickerPicker(build, {
  groups, redraw, reasonFor = () => null, grouped = true, names = null, markKinds = false,
}) {
  const wrap = h('div', 'picker');
  const inPool = new Set(build.pool);

  // ONE ALPHABETICAL LIST, ON A LEVEL THAT ASKS FOR ONE. levels.json carries
  // the flag and the reason (level 1's pickerNote): the group headings are a
  // map of which holdings move together, and level 1 is the level that asks a
  // player to work that out from the prices instead of reading it off a
  // label. The sections are what is dropped, not the chips - same buttons,
  // same ids, same behaviour, one row.
  //
  // SORTED HERE RATHER THAN IN THE FILE. tickers.json's order is its groups'
  // order, which is the thing being hidden; sorting the names at the point of
  // drawing means a new ticker lands in the right place with no second list
  // to maintain.
  const sections = grouped ? groups : [{
    key: 'all',
    label: null,
    tickers: groups
      .flatMap((group) => group.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)))
      .sort((a, b) => a.localeCompare(b)),
  }];

  for (const group of sections) {
    // NOT `names`: that is the parameter holding names.json, and a local of
    // the same name shadowed it here - every chip's spoken label came out as
    // "Add BND, BND" because nameOf() was handed this array instead. Caught by
    // a test, not by reading.
    const offered = group.tickers
      .map((t) => (typeof t === 'string' ? t : t.ticker))
      .filter((t) => inPool.has(t));
    if (offered.length === 0) continue;

    const section = h('section', 'picker-group');
    if (group.label) section.append(h('h2', 'picker-group-label', group.label));
    const row = h('div', 'picker-row');
    for (const ticker of offered) {
      const held = build.hasPick(ticker);
      // A holding the build deals and keeps - level 4's QQQ - is shown held and
      // locked rather than tappable and then refused. The round throws if it is
      // removed, and a button whose only outcome is an error is not a button.
      const locked = (build.required ?? []).includes(ticker);
      const unavailable = held ? null : reasonFor(ticker);
      // WHAT KIND OF THING IT IS, on a level whose rule is about kinds. Level
      // 6 asks for 60% of the money in stocks, and until now the only way to
      // know that BND is not one was to know it already. The four that are
      // not stocks say so on the chip itself and are coloured.
      //
      // THE WORD, NOT ONLY THE COLOUR. Colour alone would carry this for
      // nobody who cannot see the difference (WCAG 1.4.1), and the fix is not
      // a legend a player has to find: "BND bond" needs no key.
      const kind = markKinds ? kindOf(names, ticker) : null;
      const otherKind = kind !== null && kind !== 'stock' && kind !== 'stock fund';
      const label = otherKind ? `${ticker} ${kind === 'gold' ? 'gold' : 'bond'}` : ticker;
      const node = button(label, [
        'chip', held ? 'chip-on' : null, locked ? 'chip-locked' : null,
        unavailable ? 'chip-unavailable' : null, otherKind ? 'chip-other-kind' : null,
      ].filter(Boolean).join(' '), () => {
        build.togglePick(ticker);
        redraw();
      }, {
        // Named for its ticker, so the chip keeps focus when tapping it changes
        // what it is announced as - see button()'s note.
        id: `chip-${ticker}`,
        // A full pool stays tappable for the names already held, so a player can
        // always swap one out; the rest go flat rather than vanishing.
        disabled: locked || Boolean(unavailable) || (!held && !build.canAddPick()),
        // THE NAME IS IN THE SPOKEN LABEL, not only in the list below. A
        // screen reader hears "Add BND, Vanguard Total Bond Market ETF"
        // rather than three letters it will spell out.
        aria: locked
          ? `${ticker} is required on this level${names ? `, ${nameOf(names, ticker)}` : ''}`
          : unavailable ?? `${held ? 'Remove' : 'Add'} ${ticker}`
            + (names ? `, ${nameOf(names, ticker)}` : ''),
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

/**
 * "What are these?" - every holding this screen can offer, with its full name
 * and what kind of thing it is.
 *
 * BEHIND A TAP, and that is the whole design. Playtest feedback was that a
 * player cannot tell what a ticker is; the fix cannot be forty lines of text
 * on a screen where reading is already 89% of the time to finish levels 1 to 3
 * (BUILD_LOG.md session 2.34). A closed <details> costs one line until
 * somebody wants it, and the player who already knows what VOO is never pays.
 *
 * ALPHABETICAL, NEVER GROUPED. This list appears on level 1 too, where the
 * picker's group headings are deliberately hidden because they say which
 * holdings move together. A list ordered or labelled by group would hand that
 * back on the same screen.
 *
 * NATIVE <details>, no JavaScript: it keeps its open state across a redraw for
 * free, works with the keyboard, and is announced as a disclosure without any
 * aria of our own.
 */
export function whatAreThese(names, pool) {
  if (!names || pool.length === 0) return null;
  const box = h('details', 'what-are-these');
  box.append(h('summary', null, 'What are these?'));
  const list = h('dl', 'ticker-glossary');
  for (const { ticker, name, kind } of describePool(names, pool)) {
    const row = h('div', 'glossary-row');
    row.append(h('dt', null, ticker));
    const dd = h('dd', null, name);
    if (kind) dd.append(h('span', 'glossary-kind', ` (${kind})`));
    row.append(dd);
    list.append(row);
  }
  box.append(list);
  return box;
}

/**
 * The holdings currently picked, each with its full name.
 *
 * WHY A LIST OF WHAT IS HELD, rather than a flash of the name on the chip that
 * was just tapped. "Tapped" is a moment and this is a question a player asks
 * later - they pick four things, then wonder what the third one was. A line
 * per holding answers it without anything to re-trigger, survives a redraw,
 * and is read in order by a screen reader. It is also the only place level 1
 * can show a name at all, having no allocator rows to hang them off.
 *
 * Null when nothing is picked: an empty heading helps nobody.
 */
export function pickedNames(build, names) {
  if (!names || build.picks.length === 0) return null;
  const wrap = h('ul', 'picked-names');
  for (const ticker of build.picks) {
    const item = h('li', 'picked-name');
    // ONE FLOWING LINE, not three boxes. Laid out as flex items these wrapped
    // raggedly at 375px - "BOND FUND" dropping to its own line under a fund
    // name that had already wrapped - and the parentheses make it read as a
    // sentence that can break anywhere, which is what a narrow screen needs.
    item.append(h('span', 'picked-ticker', ticker));
    item.append(h('span', 'picked-full', ` ${nameOf(names, ticker)}`));
    const kind = kindOf(names, ticker);
    if (kind) item.append(h('span', 'picked-kind', ` (${kind})`));
    wrap.append(item);
  }
  return wrap;
}

// ----------------------------------------------------------- the allocator

/**
 * The top of a holding's slider scale: the whole budget, less the floors the
 * other holdings have to keep.
 *
 * Fixed for as long as the line-up is, so the thumbs are comparable with each
 * other. It is a DISPLAY decision, which is why it lives here and not on the
 * build: the build's own ceilingFor() is about what a move may do.
 */
export function sliderCeiling(build, ticker) {
  const others = build.picks
    .filter((other) => other !== ticker)
    .reduce((sum, other) => sum + build.floorOf(other), 0);
  return Math.max(build.floorOf(ticker), build.total - others);
}

/**
 * A number of dollars as a slider position, for the aria value a reader hears.
 *
 * The slider's own value is a number of dollars, and "3000" read out on its own
 * is not money. aria-valuetext says what it is.
 */
function dollarsSpoken(dollars) {
  return money(dollars);
}

/**
 * The money, one slider per holding, moved in $100 steps.
 *
 * ONE SLIDER MOVES ONE HOLDING. The amounts no longer compensate each other, so
 * what is not allocated sits in "Money left" until it is spent, and the button
 * out of this screen stays disabled until that reaches $0. js/round.js's
 * setDollars() carries the reason; this file only draws it.
 *
 * WHAT EACH ROW CARRIES, and why each part is there:
 *   - a real <label> for the slider, which is the holding's own ticker, so the
 *     control a screen reader lands on says what it adjusts;
 *   - an <output> showing the dollars and the share, updated live;
 *   - the slider, from the holding's floor to the most it could take;
 *   - the + and - buttons, for a step a thumb can hit exactly.
 *
 * The slider is the coarse control and the buttons are the fine one, which is
 * the pairing a phone wants: dragging to roughly the right place is easy and
 * landing on exactly $2,400 is not.
 */
export function allocator(build, { redraw }) {
  const wrap = h('div', 'allocator');
  wrap.append(h('h2', 'allocator-head', `Split your ${money(build.total)}`));

  // MONEY LEFT, ABOVE THE SLIDERS. It is the number that decides whether the
  // player can leave this screen, so it goes where they are looking before they
  // start moving things, not under a list they have scrolled past.
  const left = build.moneyLeft();
  const leftLine = h('p', left === 0 ? 'money-left money-left-done' : 'money-left');
  leftLine.append(h('span', null, 'Money left: '));
  leftLine.append(h('strong', null, money(left)));
  // Announced, because it changes as a consequence of moving something else.
  leftLine.setAttribute('role', 'status');
  wrap.append(leftLine);

  wrap.append(button('Even split', 'btn btn-quiet btn-even', () => {
    build.evenSplit();
    redraw();
  }, { aria: `Split the ${money(build.total)} evenly between your holdings` }));

  for (const ticker of build.picks) {
    const dollars = build.dollars[ticker] ?? 0;
    const row = h('div', 'alloc-row');

    // A REAL LABEL, tied to the slider by id. The id is per holding and the
    // screen is redrawn whole, so it cannot collide with another row's.
    const id = `alloc-${ticker}`;
    const label = h('label', 'alloc-ticker', ticker);
    label.setAttribute('for', id);
    row.append(label);

    const amount = h('output', 'alloc-amount');
    amount.setAttribute('for', id);
    amount.append(h('strong', null, money(dollars)));
    amount.append(h('span', 'alloc-share', `${Math.round((dollars / build.total) * 100)}%`));
    row.append(amount);

    const slider = h('input', 'alloc-slider');
    slider.type = 'range';
    slider.id = id;
    slider.min = String(build.floorOf(ticker));
    // THE SCALE IS THE WHOLE BUDGET, less what the other holdings must keep.
    //
    // The first version ran each slider to ceilingFor() - what this holding could
    // take right now - which is the honest limit on the MOVE and the wrong scale
    // for the POSITION: with every dollar allocated the ceiling equals the
    // current amount, so all five thumbs sat hard against the right-hand end and
    // an even split looked like everything being in the first holding.
    //
    // A fixed scale means the thumb's position is the holding's share of the
    // money, which is the thing a player is reading, and it is comparable from
    // one row to the next. Dragging past what is left snaps back, because
    // setDollars() still clamps to the real ceiling - and the + button is
    // disabled and "Money left: $0" is on the screen, so the limit is said
    // rather than merely enforced.
    slider.max = String(sliderCeiling(build, ticker));
    slider.step = String(DOLLAR_STEP);
    slider.value = String(dollars);
    slider.setAttribute('aria-valuetext', dollarsSpoken(dollars));
    slider.addEventListener('input', () => {
      build.setDollars(ticker, Number(slider.value));
      redraw();
    });
    row.append(slider);

    const buttons = h('div', 'alloc-buttons');
    // A step that cannot be taken is not offered: the minus at a holding's floor,
    // and the plus when there is nothing left to spend.
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
