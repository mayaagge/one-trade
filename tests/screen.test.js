// tests/screen.test.js - the scroll and the focus a redraw must not throw away.
//
// THE BUG THIS PINS. Every mode redraws by replacing the whole view, and a
// redraw happens on every tap, not only when the screen changes. js/game.js and
// js/crashReplay.js then called window.scrollTo(0, 0), so a player who scrolled
// to the bottom of a build screen and tapped + was returned to the heading;
// js/sandbox.js and js/myPortfolio.js did not call it and still lost the
// position when the page height changed; and all of them moved focus to <main>,
// so pressing + with a keyboard cost a full journey back through the Tab order.
//
// Measured in scripts/dev_checks.mjs before the fix - learn/build/+ went from
// scrollY 1259 to 0, sandbox/build/chip from 1054 to 438 - and written up in
// docs/DESIGN_REVIEW.md. This file is the unit-level guard, so the rule cannot
// be undone by a later edit without a failing test.
//
// THE RULE: a new screen starts at the top with focus on the view. A redraw of
// the SAME screen puts the player back exactly where they were.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';

import { StubNode, withDocument } from './stubDom.js';
import { controlKey, createScreen, findControl } from '../js/screen.js';

/** A window whose scroll position can be read and moved, as a browser's is. */
function fakeWindow() {
  return {
    scrollY: 0,
    innerWidth: 375,
    scrollTo(x, y) { this.scrollY = y; },
    addEventListener() {},
  };
}

/** A view with one labelled button and one slider in it. */
function viewWith({ rows = 3 } = {}) {
  const view = new StubNode('div');
  view.className = 'view';
  for (let i = 0; i < rows; i += 1) {
    const row = new StubNode('div');
    row.className = 'alloc-row';
    const slider = new StubNode('input');
    slider.id = `alloc-${i}`;
    row.append(slider);
    const plus = new StubNode('button');
    plus.className = 'btn btn-step';
    plus.setAttribute('aria-label', `Add $100 to holding ${i}`);
    row.append(plus);
    view.append(row);
  }
  return view;
}

test('a control is keyed by its id, or by what it is announced as', () => {
  const slider = new StubNode('input');
  slider.id = 'alloc-VOO';
  assert.equal(controlKey(slider), 'id:alloc-VOO');

  const plus = new StubNode('button');
  plus.setAttribute('aria-label', 'Add $100 to VOO');
  assert.equal(controlKey(plus), 'aria:Add $100 to VOO');

  // An id wins, because it is the thing that cannot be shared by two rows.
  const both = new StubNode('input');
  both.id = 'alloc-BND';
  both.setAttribute('aria-label', 'BND');
  assert.equal(controlKey(both), 'id:alloc-BND');

  // Nothing to go on, and nothing at all.
  assert.equal(controlKey(new StubNode('p')), null);
  assert.equal(controlKey(null), null);
});

test('findControl walks the whole tree, not just the top of it', () => {
  const view = viewWith({ rows: 3 });
  assert.equal(findControl(view, 'id:alloc-2').id, 'alloc-2');
  assert.equal(
    findControl(view, 'aria:Add $100 to holding 1').attributes['aria-label'],
    'Add $100 to holding 1',
  );
  assert.equal(findControl(view, 'id:nothing-like-it'), null);
  assert.equal(findControl(view, null), null);
});

test('A NEW SCREEN starts at the top, with focus on the view', () => {
  const win = fakeWindow();
  const root = new StubNode('main');
  const restore = withDocument({ window: win });
  try {
    const paint = createScreen(root, { win, doc: globalThis.document });

    paint(viewWith(), 'build:3');
    assert.equal(win.scrollY, 0);
    assert.equal(globalThis.document.activeElement, root, 'focus did not land on the view');

    // Scroll down, then move to a different screen: back to the top.
    win.scrollY = 900;
    paint(viewWith(), 'guess:3');
    assert.equal(win.scrollY, 0, 'a new screen did not start at its heading');
    assert.equal(globalThis.document.activeElement, root);
  } finally { restore(); }
});

test('THE SAME SCREEN REDRAWN keeps the scroll position and the focused control', () => {
  const win = fakeWindow();
  const root = new StubNode('main');
  const restore = withDocument({ window: win });
  try {
    const paint = createScreen(root, { win, doc: globalThis.document });
    paint(viewWith(), 'build:3');

    // The player scrolls down and puts focus on the + of the last row, as
    // tapping or tabbing to it does.
    win.scrollY = 1259;
    findControl(root, 'aria:Add $100 to holding 2').focus();
    assert.equal(controlKey(globalThis.document.activeElement), 'aria:Add $100 to holding 2');

    // Pressing it redraws the same screen.
    paint(viewWith(), 'build:3');

    assert.equal(win.scrollY, 1259, 'the redraw threw the player back up the page');
    assert.equal(
      controlKey(globalThis.document.activeElement),
      'aria:Add $100 to holding 2',
      'the redraw took focus off the button that caused it',
    );
    assert.notEqual(globalThis.document.activeElement, root);
  } finally { restore(); }
});

test('a slider keeps focus across a redraw, by its id', () => {
  const win = fakeWindow();
  const root = new StubNode('main');
  const restore = withDocument({ window: win });
  try {
    const paint = createScreen(root, { win, doc: globalThis.document });
    paint(viewWith(), 'build:3');
    win.scrollY = 400;
    findControl(root, 'id:alloc-1').focus();

    paint(viewWith(), 'build:3');
    assert.equal(globalThis.document.activeElement.id, 'alloc-1');
    assert.equal(win.scrollY, 400);
  } finally { restore(); }
});

test('the page getting taller or shorter does not move the player', () => {
  // SANDBOX'S SLIP. It never called scrollTo, so it had no jump to the top - and
  // it still lost the position, because picking a chip adds an allocator row,
  // the document grows, and the browser clamps the scroll. Restoring the
  // position explicitly is what fixes that, not merely not scrolling.
  const win = fakeWindow();
  const root = new StubNode('main');
  const restore = withDocument({ window: win });
  try {
    const paint = createScreen(root, { win, doc: globalThis.document });
    paint(viewWith({ rows: 2 }), 'build');
    win.scrollY = 1054;
    findControl(root, 'aria:Add $100 to holding 1').focus();

    paint(viewWith({ rows: 3 }), 'build');          // a holding was added
    assert.equal(win.scrollY, 1054, 'a taller page moved the player');
    assert.equal(controlKey(globalThis.document.activeElement), 'aria:Add $100 to holding 1');
  } finally { restore(); }
});

test('a control that no longer exists falls back to the view, never to nothing', () => {
  // Removing the holding whose Remove button was pressed: there is no successor
  // worth guessing at, and focus has to land somewhere a keyboard can carry on
  // from.
  const win = fakeWindow();
  const root = new StubNode('main');
  const restore = withDocument({ window: win });
  try {
    const paint = createScreen(root, { win, doc: globalThis.document });
    paint(viewWith({ rows: 3 }), 'enter');
    win.scrollY = 300;
    findControl(root, 'aria:Add $100 to holding 2').focus();

    paint(viewWith({ rows: 2 }), 'enter');          // that row is gone
    assert.equal(globalThis.document.activeElement, root);
    assert.equal(win.scrollY, 300, 'the position was lost as well as the control');
  } finally { restore(); }
});

test('a null key is always a new screen, which is the safe answer', () => {
  const win = fakeWindow();
  const root = new StubNode('main');
  const restore = withDocument({ window: win });
  try {
    const paint = createScreen(root, { win, doc: globalThis.document });
    paint(viewWith(), null);
    win.scrollY = 500;
    paint(viewWith(), null);
    assert.equal(win.scrollY, 0, 'two null keys were treated as the same screen');
  } finally { restore(); }
});

test('the after callback runs before the scroll is restored', () => {
  // A chart is drawn after attachment and can change the page height, so the
  // order matters: restoring a position and then growing the page under it puts
  // the player somewhere else again.
  const win = fakeWindow();
  const root = new StubNode('main');
  const restore = withDocument({ window: win });
  try {
    const paint = createScreen(root, { win, doc: globalThis.document });
    const order = [];
    win.scrollTo = (x, y) => { order.push(`scrollTo ${y}`); win.scrollY = y; };
    paint(viewWith(), 'reveal:6', () => order.push('drew the chart'));
    assert.deepEqual(order, ['drew the chart', 'scrollTo 0']);
  } finally { restore(); }
});
