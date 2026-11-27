// js/seenPool.js - which pool-of-20 (and capstone) portfolios this browser
// has already been dealt, persisted so level 7's draw can leave them out
// across visits, not only within one.
//
// PREREG_AMENDMENT_3.md section 2 registers that persisting this exclusion
// only EXTENDS the registered draw rather than changing it: the marginal draw
// over the pool of 20 stays exactly uniform under any label-symmetric
// exclusion, so it cannot change which verdict the registered test can
// reach - only how many repeat-portfolio rows a returning player is spared.
// BUILD_LOG.md session 2.19 raised the question; session 2.27 settled it.
//
// ITS OWN KEY, AND RESET DOES NOT CLEAR IT - same reasoning as
// js/participant.js: resetting your stars is not asking to be dealt a
// portfolio whose answer you already know.
//
// Educational, not investment advice.

import { read, write } from './storage.js';

export const SEEN_POOL_KEY = 'oneTrade.seenPool';

/** Is this a record this version can read? Anything else is a fresh start. */
function usable(record) {
  return Boolean(record)
    && typeof record === 'object'
    && record.version === 1
    && Array.isArray(record.ids)
    && record.ids.every((id) => typeof id === 'string');
}

/** Every "pool:id" string this browser has been dealt, or none if unreadable. */
export function loadSeenPool() {
  const saved = read(SEEN_POOL_KEY, null);
  return usable(saved) ? saved.ids : [];
}

/**
 * Save the full set. True if it is definitely saved.
 *
 * Takes anything iterable of strings - js/game.js keeps the session's own copy
 * as a Set - and always writes the whole thing, because this is a mirror of
 * that Set, not a log of what changed.
 */
export function saveSeenPool(ids) {
  return write(SEEN_POOL_KEY, { version: 1, ids: [...ids] });
}
