// js/storage.js - the browser's own storage, for code that must not care
// whether it is there.
//
// docs/PRD.md: "Progress, stars and portfolios stay in the browser's own
// storage, and the page works even if that storage is unavailable." This is the
// one place that is dealt with, so that no caller has to.
//
// UNAVAILABLE IS NOT ONE THING, and that is why this file exists rather than a
// try/catch at each call site. localStorage can be
//
//   * absent, on a stripped-down or very old browser;
//   * present but throwing on every call, which is what a browser does when the
//     user has blocked site data, and what Safari used to do in private mode;
//   * present but full, where the read works and the write throws;
//   * present and holding something that is not JSON, because another tab or an
//     older version of this game put it there.
//
// Each of those is a test in tests/storage.test.js. Every function here answers
// with the fallback, or with false, and none of them ever throws.
//
// NOTHING HERE LEAVES THE BROWSER. docs/PRD.md: "Prices come in; holdings never
// go out."
//
// Educational, not investment advice.

/**
 * The storage, or null when there isn't one.
 *
 * Reading the property can itself throw - a blocked browser raises on access,
 * not only on use - so even this is wrapped.
 */
function available() {
  try {
    const storage = globalThis.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

/**
 * The value stored under a key, or `fallback` if there is no usable one.
 *
 * A fallback rather than undefined, so a caller can destructure the result
 * without checking twice. Anything unreadable - no storage, a throwing
 * storage, a key that was never written, a value that is not JSON - is the
 * same answer: you have nothing saved.
 *
 * @param {string} key
 * @param {*} fallback what to answer when nothing usable is stored
 */
export function read(key, fallback = null) {
  const storage = available();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw);
  } catch {
    // Unparseable, or a storage that threw. Either way there is nothing to
    // restore, and the caller gets on with a fresh start.
    return fallback;
  }
}

/**
 * Store a value under a key. True if it is definitely saved.
 *
 * The caller is told whether it worked rather than being left to assume: a game
 * that cannot save progress is still playable, and it is the screen's business
 * whether to say so.
 */
export function write(key, value) {
  const storage = available();
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // A full disk, a blocked storage, or a value with a cycle in it.
    return false;
  }
}

/** Take a key away. True if it is definitely gone. */
export function remove(key) {
  const storage = available();
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
