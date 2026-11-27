// js/visitSource.js - the `?src=` code this visit arrived with, remembered for
// as long as the tab is open.
//
// WHAT IT IS FOR. docs/PRD.md: "every shared link carries a short source code
// (for example ?src=club-ucla). The count ping records only that code, so you
// can see which channel works without tracking anyone." A `/ping` carries it as
// a field; a `/guess` carries it only as a query parameter the Worker reads to
// choose which dataset the row lands in (PREREG_AMENDMENT_3.md section 3), and
// never as part of the registered five-field record.
//
// WHY IT IS REMEMBERED AT ALL. The nav links are bare `#mode` fragments, so a
// query string survives moving between screens on its own. What it does not
// survive is anything that rebuilds the URL, and the source code has to outlive
// the whole visit rather than the first screen of it - a playtest session that
// stopped being tagged halfway through would put half its guesses in the real
// GUESSES dataset.
//
// THE URL ALWAYS WINS. If this load has a `?src=`, it replaces whatever was
// remembered; the stored value is used only when the URL has none. The other
// way round has a bug in it that is easy to miss: a tab that first opened with
// no source at all would cache "no source", and a deliberate
// `?src=playtest` typed into that same tab later would be ignored - exactly the
// case this is most needed for.
//
// SESSION STORAGE, NOT LOCAL. A visit is a tab, so this dies with the tab -
// unlike js/progress.js, js/participant.js and js/seenPool.js, which all mean
// to outlive it. It does survive a reload, which is the point: a refresh
// mid-playtest must not quietly untag the rest of the session. js/storage.js is
// deliberately not reused here, because that file is about localStorage and
// says so.
//
// Educational, not investment advice.

/** Its own key, like every other thing this game remembers. */
export const SRC_KEY = 'oneTrade.src';

/** A source code is a short, plain token - the same shape the Worker accepts. */
const SRC_RE = /^[a-z0-9-]{1,40}$/;

/**
 * The storage, or null when there isn't one.
 *
 * Reading the property can itself throw on a browser with site data blocked,
 * so even this is wrapped - the same care js/storage.js takes.
 */
function available() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** The `src` in a query string, if it is one this game would ever send. */
function fromUrl(search) {
  try {
    const value = new URLSearchParams(search ?? '').get('src');
    return value && SRC_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** Whatever was remembered earlier this visit, if it is still readable. */
function remembered(store) {
  if (!store) return null;
  try {
    const value = store.getItem(SRC_KEY);
    return value && SRC_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * This visit's source code, or null if it has none.
 *
 * Null rather than an empty string, because the two routes treat "no source"
 * by leaving the field out entirely: the Worker's own validation rejects a
 * `src` that is present but empty, and rightly.
 *
 * @param {string} [search] the query string, defaulting to this page's own
 * @returns {string|null}
 */
export function visitSource(search = globalThis.location?.search) {
  const url = fromUrl(search);
  const store = available();
  if (url) {
    // Remember it for the rest of the visit, and overwrite anything older.
    // A write that fails changes nothing: this load is tagged either way, and
    // only a later load in the same tab would notice.
    try {
      store?.setItem(SRC_KEY, url);
    } catch { /* storage full or blocked; the URL still decided this load */ }
    return url;
  }
  return remembered(store);
}
