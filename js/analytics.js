// js/analytics.js - the only file in this game that sends anything anywhere.
//
// TWO ROUTES, AND NOTHING ELSE EVER. docs/PRD.md: "two kinds of anonymous
// record go to the Worker, and nothing else. A count ping carries the level
// reached and a source code from the link. A guess record carries a random
// per-browser ID, the level, the guess, the actual value and the date. Neither
// carries tickers, amounts, names or emails."
//
// FIRE AND FORGET, BY CONSTRUCTION. Nothing here is awaited by a caller and
// nothing here can throw into one: every send ends in a `.catch()` that does
// nothing at all. A Worker that is down, blocked by an extension, or simply
// never configured must leave the game playing exactly as it does now -
// docs/PRD.md milestone 3 step 5 is the test that says so, and
// tests/guessRecords.test.js is where it lives.
//
// KEEPALIVE, BECAUSE THE MOMENT A GUESS LOCKS IS THE MOMENT A PLAYER MOVES ON.
// A record is sent the instant its guess is locked (PREREG_AMENDMENT_3.md
// section 1 depends on that: arrival order is the only thing distinguishing
// level 7's three rows). The player may close the tab or follow a share link a
// heartbeat later, and a normal fetch is cancelled when the page goes away.
// `keepalive: true` lets the browser finish it. The bodies here are about a
// hundred bytes, nowhere near the 64 KB a browser allows in flight this way.
//
// Educational, not investment advice.

import { PROXY } from './config.js';
import { visitSource } from './visitSource.js';

/**
 * Post a body and forget about it.
 *
 * Returns the promise only so a test can await the send; nothing in the game
 * does, and nothing in the game may start depending on it.
 */
function send(path, body) {
  // No Worker configured is not an error. It is how this game ran for its
  // first two milestones, and how it runs on a laptop.
  if (!PROXY) return Promise.resolve();
  return fetch(`${PROXY}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => { /* a record that cannot be sent is a record that is lost, and that is all */ });
}

/**
 * One guess record, at the moment its guess locked.
 *
 * `row` is already exactly PREREG.md's five fields - js/game.js's record()
 * builds it and this does not add to it. The source code rides in the query
 * string instead, where the Worker reads it to choose a dataset and never
 * writes it into the row (worker/src/index.js, and a test in
 * tests/worker.test.js holds that).
 */
export function sendGuess(row) {
  const src = visitSource();
  const query = src ? `?src=${encodeURIComponent(src)}` : '';
  return send(`/guess${query}`, row);
}

/**
 * One count ping, the first time this visit reaches a level.
 *
 * The source code is a FIELD here rather than a query parameter, because for a
 * ping it is the point: it is how a shared link's channel gets counted. There
 * is no per-browser id on a ping and there never will be.
 *
 * `passed` IS WHAT KEEPS TWO SUCCESS TARGETS MEASURABLE. It says whether every
 * level BEFORE this one had been passed at the moment this one was reached -
 * vacuously true on level 1, since nothing stands before it. Until session 2.38
 * a level only unlocked by passing the one before, so reaching level 4 WAS
 * passing level 3 and the ping needed to carry nothing; now that a level
 * unlocks by being played, docs/PRD.md's "players who finish level 3" and
 * "players who reach level 7" would have quietly started counting something
 * weaker. They are read off the pings where this is true instead.
 *
 * STILL NO PER-BROWSER ID, so this is a property of a visit and not of a
 * person, exactly like the level and the source code beside it.
 */
export function sendPing(level, passed) {
  const src = visitSource();
  const body = { level, passed: Boolean(passed) };
  return send('/ping', src ? { ...body, src } : body);
}
