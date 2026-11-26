// js/screen.js - putting a view on the page without losing the player's place.
//
// WHY THIS FILE EXISTS. Every mode in this game redraws by building a whole new
// view and calling root.replaceChildren(), which is what makes the screens easy
// to reason about: the state decides what is on screen and there is no partial
// update to get out of step with it. The cost is that the redraw throws away two
// things the browser was keeping - where the page was scrolled to, and which
// control had focus - and a redraw happens on every tap, not just when the
// screen changes.
//
// WHAT THAT LOOKED LIKE. A player scrolled to the bottom of level 3's build
// screen, tapped +, and was returned to the heading: js/game.js and
// js/crashReplay.js called window.scrollTo(0, 0) at the end of draw(), a line
// written for "a new screen starts at its heading" that also ran on redraws
// which were not new screens. js/sandbox.js and js/myPortfolio.js never called
// it and were better but not immune - adding a holding changes the page height,
// the browser clamps the scroll, and Sandbox still slipped from 1054 to 438.
// And every one of them moved focus to <main>, so pressing + with a keyboard
// cost a full journey back through the Tab order. Measured in
// scripts/dev_checks.mjs; written up in docs/DESIGN_REVIEW.md.
//
// THE RULE THIS FILE IMPLEMENTS. A screen CHANGE starts at the top with focus on
// the view, because it is a new thing to read. A redraw of the SAME screen puts
// the player back exactly where they were: same scroll position, same control
// focused. Which of the two it is comes from a key the caller supplies - what
// screen this is - rather than from guessing.
//
// Educational, not investment advice.

/**
 * How a control is found again after the screen is redrawn under it.
 *
 * NOT A CSS SELECTOR, deliberately. Matching one would mean depending on
 * querySelector's full grammar, which tests/stubDom.js does not have; this is a
 * plain string compared against the same two attributes on the way back. The two
 * are enough because every control this game draws carries one: the sliders have
 * ids, and every button has an aria-label naming what it does to which holding.
 *
 * Returns null for anything with neither, and for the view itself - there is
 * nothing to restore when focus was not on a control.
 */
export function controlKey(node) {
  if (!node) return null;
  const id = node.id || node.getAttribute?.('id');
  if (id) return `id:${id}`;
  const label = node.getAttribute?.('aria-label');
  if (label) return `aria:${label}`;
  return null;
}

/** Every node under this one, in order. Works on a real DOM and on the stub. */
function* descendants(node) {
  for (const child of node.children ?? []) {
    yield child;
    yield* descendants(child);
  }
}

/** The control that key names, or null if this view has no such control. */
export function findControl(root, key) {
  if (!key) return null;
  for (const node of descendants(root)) {
    if (controlKey(node) === key) return node;
  }
  return null;
}

/**
 * Put the page back where it was, which takes more than one scrollTo.
 *
 * WHY. replaceChildren() empties the element before the new view goes in, and
 * the browser has not laid the new content out at the moment the next line
 * runs. A scrollTo(0, 1251) against a document that is momentarily one
 * screenful tall is clamped to the bottom of THAT document, and the player
 * lands somewhere near the middle: measured at 1251 asked for, 792 arrived at,
 * and 1195 asked for, 495 arrived at. Not scrolling at all gave the same
 * symptom from the other direction, which is what Sandbox used to do.
 *
 * So: read a layout property first, which forces the pending reflow
 * synchronously, and scroll against the real height. Then ask again on the next
 * frame, because a chart or a web font can still change the height after that -
 * and asking twice is invisible, where arriving in the wrong place is not.
 */
function restoreScroll(browserWindow, root, scrollY) {
  if (!browserWindow?.scrollTo) return;
  // The read is the point: its value is not used, the reflow it forces is.
  void root.scrollHeight;
  browserWindow.scrollTo(0, scrollY);
  // AND AGAIN NEXT FRAME, UNCONDITIONALLY. Reading window.scrollY straight after
  // scrollTo reports the new value, so a check here always passes and always
  // skipped the second attempt - while the position still ended up wrong, at 792
  // instead of 1251. What moves it is the browser's own scroll anchoring
  // settling after a layout it could not anchor, because replaceChildren had
  // just removed everything it might have anchored to. The only reliable answer
  // is to ask once more after that has happened; a second scrollTo to a position
  // already held is invisible.
  browserWindow.requestAnimationFrame?.(() => {
    browserWindow.scrollTo(0, scrollY);
  });
}

/**
 * A painter for one mode's root element.
 *
 * Call it with the new view and a key saying WHICH SCREEN this is. Two draws
 * with the same key are the same screen redrawn - a tapped +, a picked chip, an
 * added holding - and the player's position is kept. A different key is a new
 * screen, and starts at the top.
 *
 * @param {object} root the mode's root element
 * @param {object} [options.win] the window, injectable so a test can watch it
 * @param {object} [options.doc] the document, for document.activeElement
 */
export function createScreen(root, { win = null, doc = null } = {}) {
  let last = null;

  return function paint(view, key, after = null) {
    const browserWindow = win ?? globalThis.window ?? null;
    const browserDoc = doc ?? globalThis.document ?? null;

    // A NULL KEY IS ALWAYS A NEW SCREEN. A caller that cannot say which screen
    // it is drawing gets the old behaviour, which is the safe one: starting at
    // the top is never wrong, only sometimes unhelpful.
    const sameScreen = key !== null && key === last;
    const scrollY = sameScreen ? (browserWindow?.scrollY ?? 0) : 0;
    const keep = sameScreen ? controlKey(browserDoc?.activeElement) : null;
    last = key;

    root.replaceChildren(view);
    // The chart is drawn AFTER attachment, once its box has a real width - and
    // before focus and scroll are restored, because drawing it can change the
    // page height and so what a scroll position means.
    if (after) after();

    if (sameScreen) {
      const again = findControl(root, keep);
      // Back to the control that caused the redraw. Falling back to the view
      // rather than to nothing: focus has to land somewhere a keyboard can
      // continue from, and a control that no longer exists - the + on a holding
      // just removed - has no successor worth guessing at.
      if (again?.focus) again.focus({ preventScroll: true });
      else root.focus?.({ preventScroll: true });
      restoreScroll(browserWindow, root, scrollY);
    } else {
      root.focus?.({ preventScroll: true });
      browserWindow?.scrollTo?.(0, 0);
    }
  };
}
