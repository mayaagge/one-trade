// tests/app.test.js - the router and the nav agree with each other.
//
// js/app.js picks a view from the URL hash and index.html lists the modes a
// player can click. Nothing checked that those two lists were the same, and the
// way they come apart is SILENT: a nav link whose mode the router does not know
// falls through to the default, so clicking "My real portfolio" would quietly
// show Research, with no error anywhere and the link highlighted as current.
// That is exactly what `#mine` did until the route was added.
//
// index.html is read as text, as tests/workflow.test.js reads the workflows:
// this project has no DOM parser and needs none for a list of links.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { modeFromHash } from '../js/app.js';

const root = new URL('..', import.meta.url);
const read = (name) => readFileSync(fileURLToPath(new URL(name, root)), 'utf8');

const INDEX = read('index.html');
const APP = read('js/app.js');

/** The modes js/app.js will answer to, read from the file rather than retyped. */
const MODES = JSON.parse(
  APP.match(/const MODES = (\[[^\]]*\]);/)[1].replace(/'/g, '"'),
);

/** Every mode the nav offers, in the order a player sees them. */
const NAV = [...INDEX.matchAll(/data-mode="([a-z-]+)"/g)].map((m) => m[1]);

test('the nav and the router offer the same modes', () => {
  assert.deepEqual([...NAV].sort(), [...MODES].sort(),
    'a nav link and a route have come apart');
});

test('every nav link goes to its own mode', () => {
  // The href and the data-mode have to match, or the link highlights one mode
  // and navigates to another.
  for (const [, href, mode] of INDEX.matchAll(/href="#([a-z-]+)" data-mode="([a-z-]+)"/g)) {
    assert.equal(href, mode, `the link to #${href} is marked as mode ${mode}`);
  }
  assert.equal(NAV.length, [...new Set(NAV)].length, 'a mode is in the nav twice');
});

test('each mode is reached by its own hash', () => {
  for (const mode of MODES) {
    assert.equal(modeFromHash(`#${mode}`), mode);
    assert.equal(modeFromHash(mode), mode, 'a hash with no # should still work');
  }
});

test('anything else falls back to one mode, not to a blank page', () => {
  for (const hash of ['', '#', '#nonsense', '#MINE', '#mine/VOO', null, undefined, '#learn2']) {
    const mode = modeFromHash(hash);
    assert.ok(MODES.includes(mode), `${hash} gave ${mode}, which is not a mode`);
  }
});

test('My real portfolio is a mode of its own, and the nav says what it is', () => {
  assert.ok(MODES.includes('mine'), 'the router does not know #mine');
  assert.ok(NAV.includes('mine'), 'the nav does not offer it');
  assert.match(INDEX, /data-mode="mine">My real portfolio</,
    'the link does not say what the mode is');
});

test('the hash never carries anything but the mode name', () => {
  // Every link in the nav is a bare mode. A query string or a path after the
  // hash would be a place for a holding to end up.
  for (const [, href] of INDEX.matchAll(/href="(#[^"]*)"/g)) {
    assert.match(href, /^#[a-z-]+$/, `${href} is more than a mode name`);
  }
});
