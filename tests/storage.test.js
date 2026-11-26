// tests/storage.test.js - the browser's own storage, and every way it fails.
//
// WHY THIS IS ITS OWN FILE. docs/PRD.md: "Progress, stars and portfolios stay
// in the browser's own storage, and the page works even if that storage is
// unavailable." Unavailable is not one thing. localStorage can be absent
// (an old or stripped-down browser), present but throwing on every call
// (Safari in private browsing used to, and a user who has blocked site data
// still does), present but full (a write throws QuotaExceededError), or present
// and holding something that is not JSON at all, because another tab or an
// earlier version of this game wrote it.
//
// Each of those is a test below, because "wrapped in try/catch" is easy to
// write and easy to get subtly wrong - a catch around the read and not the
// write, or one that returns undefined where the caller expected a default.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';

import { read, write, remove } from '../js/storage.js';

/** A localStorage that works, backed by a plain object. */
function workingStorage(seed = {}) {
  const store = { ...seed };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    _store: store,
  };
}

/** A localStorage where every call throws, as a blocked one does. */
function throwingStorage(message = 'The operation is insecure.') {
  return {
    getItem() { throw new Error(message); },
    setItem() { throw new Error(message); },
    removeItem() { throw new Error(message); },
  };
}

/** Run a body with a given globalThis.localStorage, then put it back. */
function withStorage(storage, body) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const previous = globalThis.localStorage;
  if (storage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = storage;
  try {
    return body();
  } finally {
    if (had) globalThis.localStorage = previous;
    else delete globalThis.localStorage;
  }
}

// ------------------------------------------------------------ it works

test('a value written comes back the same', () => {
  withStorage(workingStorage(), () => {
    assert.equal(write('oneTrade.test', { date: '2026-11-27', answers: ['same'] }), true);
    assert.deepEqual(read('oneTrade.test', null), { date: '2026-11-27', answers: ['same'] });
  });
});

test('a key that was never written gives the fallback', () => {
  withStorage(workingStorage(), () => {
    assert.equal(read('oneTrade.missing', 'fallback'), 'fallback');
    assert.equal(read('oneTrade.missing', null), null);
    // A fallback is returned, not undefined: a caller destructuring the result
    // should not have to check for both.
    assert.deepEqual(read('oneTrade.missing', { answers: [] }), { answers: [] });
  });
});

test('remove takes a value away', () => {
  withStorage(workingStorage(), () => {
    write('oneTrade.test', 1);
    assert.equal(remove('oneTrade.test'), true);
    assert.equal(read('oneTrade.test', 'gone'), 'gone');
  });
});

test('false and 0 survive the round trip, rather than reading as missing', () => {
  withStorage(workingStorage(), () => {
    write('oneTrade.false', false);
    write('oneTrade.zero', 0);
    assert.equal(read('oneTrade.false', 'fallback'), false);
    assert.equal(read('oneTrade.zero', 'fallback'), 0);
  });
});

// ------------------------------------------------------- it is not there

test('no localStorage at all: the fallback, and no throw', () => {
  withStorage(undefined, () => {
    assert.equal(read('oneTrade.test', 'fallback'), 'fallback');
    assert.equal(write('oneTrade.test', { a: 1 }), false);
    assert.equal(remove('oneTrade.test'), false);
  });
});

test('localStorage that is null is the same as none', () => {
  withStorage(null, () => {
    assert.equal(read('oneTrade.test', 'fallback'), 'fallback');
    assert.equal(write('oneTrade.test', 1), false);
  });
});

// ---------------------------------------------------------- it throws

test('storage that throws on every call: the fallback, and no throw', () => {
  withStorage(throwingStorage(), () => {
    assert.equal(read('oneTrade.test', 'fallback'), 'fallback');
    assert.equal(write('oneTrade.test', { a: 1 }), false);
    assert.equal(remove('oneTrade.test'), false);
  });
});

test('a full disk fails the write and leaves the page standing', () => {
  const full = workingStorage();
  full.setItem = () => {
    const error = new Error('QuotaExceededError');
    error.name = 'QuotaExceededError';
    throw error;
  };
  withStorage(full, () => {
    assert.equal(write('oneTrade.test', { a: 1 }), false);
    assert.equal(read('oneTrade.test', 'fallback'), 'fallback');
  });
});

test('a value that is not JSON gives the fallback instead of throwing', () => {
  // Another tab, an older version of the game, or a user poking at devtools.
  withStorage(workingStorage({ 'oneTrade.test': 'not json {' }), () => {
    assert.equal(read('oneTrade.test', 'fallback'), 'fallback');
    // And the bad value can still be written over.
    assert.equal(write('oneTrade.test', { a: 1 }), true);
    assert.deepEqual(read('oneTrade.test', null), { a: 1 });
  });
});

test('a value that will not serialise fails the write rather than the page', () => {
  withStorage(workingStorage(), () => {
    const circular = {};
    circular.self = circular;
    assert.equal(write('oneTrade.test', circular), false);
    assert.equal(read('oneTrade.test', 'fallback'), 'fallback');
  });
});
