// js/participant.js - the anonymous per-browser ID that guess records carry.
//
// PREREG.md, Hypothesis 3: "Each guess sends one anonymous record: a random
// per-browser ID, level, guess, actual value and date. No tickers, amounts or
// personal data." This file is that ID and nothing else.
//
// WHAT IT IS FOR, and it is only one thing: pairing. Hypothesis 3 compares each
// player's level-2 error with their own level-7 error, and a one-sided sign test
// on the per-player improvement. Without something that says "these two rows are
// the same browser" there are no pairs, and the registered test cannot be
// computed at all - only two unpaired distributions, which is a different and
// weaker claim.
//
// IT IS NOT AN IDENTITY. It is random, carries nothing about the person or the
// device, is never shown, and is never sent anywhere until the Worker exists.
// docs/PRD.md: "It proves the levels were finished, not who finished them."
//
// ITS OWN KEY, AND RESET DOES NOT CLEAR IT. Both decisions were settled in
// BUILD_LOG.md session 2.19 before there was any code to settle them for:
//
//   * Its own key, not a field inside the progress record, because js/progress.js
//     voids any record carrying a key it does not expect - that strictness is
//     what keeps other modes out of a player's stars - and an ID living inside it
//     would be either an exception to that rule or a record that voids itself.
//
//   * Reset progress must NOT clear it. A player resetting their stars has not
//     asked to become a new participant, and an ID that reset with the stars
//     would silently split one player's level-2 and level-7 guesses into two rows
//     the sign test would never pair. That is a data loss nothing would report.
//
// A BROWSER THAT CANNOT STORE still gets an ID - a fresh one each visit, from
// the same function - so the game plays normally and that visit's own level-2 and
// level-7 records still pair with each other. What is lost is pairing ACROSS
// visits, which is the most a browser with no storage can offer anybody.
//
// Educational, not investment advice.

import { read, write } from './storage.js';

/**
 * Its own key, versioned in the value and not in the name, for the same reason
 * js/progress.js versions its record: a key that changed with the format would
 * strand a participant behind a name nothing reads, and they would be counted
 * as two people.
 */
export const PARTICIPANT_KEY = 'oneTrade.participant';

/** How many hex characters the ID has. 32 is 128 bits: no collisions to worry about. */
const ID_LENGTH = 32;

/**
 * A random ID, from the strongest source the browser offers.
 *
 * crypto.getRandomValues where there is one, and Math.random where there is not.
 * The fallback is genuinely fine here and it is worth saying why: this ID is a
 * label for pairing two rows, not a secret and not a capability. Nothing is
 * protected by it being unguessable, so a weaker source costs nothing - whereas
 * refusing to make one on an old browser would quietly drop that player out of
 * Hypothesis 3 altogether.
 */
export function newId(random = Math.random) {
  const bytes = new Uint8Array(ID_LENGTH / 2);
  const source = globalThis.crypto;
  if (source && typeof source.getRandomValues === 'function') {
    source.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(random() * 256);
  }
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Is this a record this version can read? Anything else is a fresh start. */
function usable(record) {
  return Boolean(record)
    && typeof record === 'object'
    && record.version === 1
    && typeof record.id === 'string'
    && record.id.length === ID_LENGTH
    && /^[0-9a-f]+$/.test(record.id);
}

/**
 * This browser's ID, made on the first call and kept from then on.
 *
 * Returns the ID and whether it is stored, because the two are different facts
 * and a caller may care: an unstored ID still pairs this visit's own records
 * with each other, and cannot pair them with a later visit's.
 *
 * @returns {{id: string, stored: boolean, fresh: boolean}}
 */
export function participantId({ random = Math.random } = {}) {
  const saved = read(PARTICIPANT_KEY, null);
  if (usable(saved)) return { id: saved.id, stored: true, fresh: false };
  const id = newId(random);
  return { id, stored: write(PARTICIPANT_KEY, { version: 1, id }), fresh: true };
}
