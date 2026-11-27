// tests/visitSource.test.js - the `?src=` code a visit carries, and how long
// it carries it.
//
// THE CASE THIS FILE EXISTS FOR: a tab that opened with no source code, then
// loaded `?src=playtest` later. Maya's own testing works exactly that way -
// open the live site, play, then deliberately retag the session - and an
// earlier draft of js/visitSource.js would have ignored the second load,
// because it cached "no source" from the first and preferred the cache. Every
// guess from that session would then have gone to the real GUESSES dataset.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SRC_KEY, visitSource } from '../js/visitSource.js';

/** A sessionStorage for one test, and the teardown that takes it away again. */
function withSession(store = {}, { broken = false } = {}) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'sessionStorage');
  const previous = globalThis.sessionStorage;
  globalThis.sessionStorage = broken ? {
    getItem() { throw new Error('storage is blocked'); },
    setItem() { throw new Error('storage is blocked'); },
  } : {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
  };
  return () => {
    if (had) globalThis.sessionStorage = previous;
    else delete globalThis.sessionStorage;
  };
}

/** No sessionStorage at all, which is what a locked-down browser does. */
function withoutSession() {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'sessionStorage');
  const previous = globalThis.sessionStorage;
  delete globalThis.sessionStorage;
  return () => { if (had) globalThis.sessionStorage = previous; };
}

test('no source code anywhere is null, not an empty string', () => {
  // Null, because both routes leave the field out entirely rather than send
  // an empty one - which the Worker's own validation rejects.
  const restore = withSession();
  try {
    assert.equal(visitSource(''), null);
    assert.equal(visitSource('?mode=learn'), null);
  } finally { restore(); }
});

test('a source code in the URL is used, and remembered for the visit', () => {
  const store = {};
  const restore = withSession(store);
  try {
    assert.equal(visitSource('?src=playtest'), 'playtest');
    assert.equal(store[SRC_KEY], 'playtest', 'it was not remembered');
    // A later screen in the same visit, with the query string gone.
    assert.equal(visitSource(''), 'playtest', 'the visit forgot its own source');
  } finally { restore(); }
});

test('a tab that started with no source still picks up ?src=playtest later', () => {
  // THE WHOLE REASON THIS FILE EXISTS. Caching "no source" and preferring the
  // cache would send this session's guesses to the real dataset.
  const store = {};
  const restore = withSession(store);
  try {
    assert.equal(visitSource(''), null, 'nothing to start with');
    assert.equal(visitSource('?src=playtest'), 'playtest', 'the URL did not win');
    assert.equal(store[SRC_KEY], 'playtest');
    assert.equal(visitSource(''), 'playtest', 'and now it is remembered');
  } finally { restore(); }
});

test('the URL always wins, and replaces an older remembered code', () => {
  const store = { [SRC_KEY]: 'daily' };
  const restore = withSession(store);
  try {
    assert.equal(visitSource('?src=playtest'), 'playtest', 'the stored code beat the URL');
    assert.equal(store[SRC_KEY], 'playtest', 'the stored code was not replaced');
  } finally { restore(); }
});

test('a source code with other parameters around it is still found', () => {
  const restore = withSession();
  try {
    assert.equal(visitSource('?utm=x&src=club-ucla'), 'club-ucla');
  } finally { restore(); }
});

test('a source code that is not the shape this game sends is ignored', () => {
  // Not validation theatre: whatever this returns goes straight into a URL
  // and into a ping's field, and the Worker rejects anything else anyway.
  const store = {};
  const restore = withSession(store);
  try {
    assert.equal(visitSource('?src=DROP TABLE'), null);
    assert.equal(visitSource('?src=<script>'), null);
    assert.equal(visitSource(`?src=${'a'.repeat(41)}`), null);
    assert.equal(visitSource('?src='), null);
    assert.equal(store[SRC_KEY], undefined, 'a rejected code was remembered anyway');
  } finally { restore(); }
});

test('a remembered code that is not usable is ignored, not trusted', () => {
  const restore = withSession({ [SRC_KEY]: 'NOT VALID' });
  try {
    assert.equal(visitSource(''), null);
  } finally { restore(); }
});

test('a browser with no session storage still tags the load it is on', () => {
  const restore = withoutSession();
  try {
    assert.equal(visitSource('?src=playtest'), 'playtest', 'this load must still be tagged');
    assert.equal(visitSource(''), null, 'with nowhere to remember it, it cannot carry over');
  } finally { restore(); }
});

test('a storage that throws on every call changes nothing about this load', () => {
  const restore = withSession({}, { broken: true });
  try {
    assert.equal(visitSource('?src=playtest'), 'playtest');
    assert.equal(visitSource(''), null);
  } finally { restore(); }
});
