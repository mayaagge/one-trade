// tests/stubDom.js - the sixty lines of DOM this game's screens actually use.
//
// NOT A TEST FILE. node --test runs tests/**/*.test.js, and this is neither;
// it is the stub tests/dailyView.test.js grew and tests/gameShare.test.js now
// shares, so that two screens are checked against one idea of what a document
// is rather than two.
//
// WHY A STUB RATHER THAN A BROWSER. This project has no dependencies (CLAUDE.md
// rule 8) and no DOM library, and the other screens are checked by being
// played. That leaves the riskiest part of a view - the first render, and what
// a click does to it - running for the first time in front of a player.
//
// It is NOT a browser and does not pretend to be: no layout, no styles, no
// events beyond the click these screens use, and no canvas. What it checks is
// the thing a unit test of the pure logic cannot - that the words reach the
// screen, and that the controls a player needs are there and the ones they
// should not have are not. Playing it in a real browser is still worth doing;
// this makes sure it is worth opening.
//
// Educational, not investment advice.

export class StubNode {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.className = '';
    this.attributes = {};
    this.listeners = {};
    this._text = '';
    this.disabled = false;
  }

  /**
   * The handful of classList calls the screens make. className stays the one
   * source of truth, so matches() and querySelector() see a class added here.
   */
  get classList() {
    const classes = () => this.className.split(/\s+/).filter(Boolean);
    const set = (list) => { this.className = list.join(' '); };
    return {
      add: (...names) => set([...new Set([...classes(), ...names])]),
      remove: (...names) => set(classes().filter((name) => !names.includes(name))),
      contains: (name) => classes().includes(name),
      toggle: (name, on) => (on ?? !classes().includes(name)
        ? set([...new Set([...classes(), name])])
        : set(classes().filter((c) => c !== name))),
    };
  }

  set textContent(value) { this._text = String(value); this.children = []; }

  get textContent() {
    return this.children.length ? this.children.map((c) => c.textContent).join(' ') : this._text;
  }

  append(...nodes) { this.children.push(...nodes); }

  replaceChildren(...nodes) { this.children = nodes; this._text = ''; }

  insertBefore(node, before) {
    const at = this.children.indexOf(before);
    if (at === -1) this.children.push(node);
    else this.children.splice(at, 0, node);
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }

  addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); }

  click() {
    if (this.disabled) return;
    for (const fn of this.listeners.click ?? []) fn();
  }

  /**
   * Taking focus, which every mode's draw() does to the root so a screen change
   * is announced to a screen reader. Nothing to do here but exist: the stub has
   * no focus ring and no active element, and a view that called it would
   * otherwise fail on a method a real <main tabindex="-1"> has.
   */
  focus() {}

  /** Every node in the tree, this one first. */
  all() { return [this, ...this.children.flatMap((child) => child.all())]; }

  matches(selector) {
    return selector.split('.').filter(Boolean)
      .every((name) => this.className.split(/\s+/).includes(name));
  }

  querySelector(selector) { return this.all().find((node) => node !== this && node.matches(selector)) ?? null; }

  querySelectorAll(selector) { return this.all().filter((node) => node !== this && node.matches(selector)); }
}

/** Every string written into a tree, for a test that asks what the screen says. */
export const textOf = (node) => node.all().map((n) => n._text).filter(Boolean).join(' | ');

/**
 * Put a document on globalThis for one render, and take it away again.
 *
 * Returns the restore function, which a test calls in a finally: a global left
 * behind would leak into whatever file node runs next.
 *
 * WRITTEN WITH defineProperty, NOT ASSIGNMENT, and node is the reason. Some of
 * the globals a screen reaches for are defined on globalThis with a getter and
 * no setter - `navigator` is one - so `globalThis.navigator = stub` throws
 * "Cannot set property navigator of #<Object> which has only a getter" and a
 * test that wanted to watch navigator.sendBeacon cannot even start. Defining the
 * property replaces it outright, and the descriptor is kept so the restore puts
 * the real one back exactly as it was, getter and all.
 */
export function withDocument(extra = {}) {
  const all = { document: { createElement: (tag) => new StubNode(tag) }, ...extra };
  const previous = Object.fromEntries(
    Object.keys(all).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(all)) {
    Object.defineProperty(globalThis, key, {
      value, writable: true, configurable: true, enumerable: true,
    });
  }
  return () => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor === undefined) delete globalThis[key];
      else Object.defineProperty(globalThis, key, descriptor);
    }
  };
}
