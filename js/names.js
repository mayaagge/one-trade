// js/names.js - what each ticker is, from names.json.
//
// WHY THIS IS A FILE AND NOT A LOOKUP IN tickers.json. tickers.json is a
// registered value: docs/PRD.md fixes "the 9 groups in tickers.json" at the
// prereg tag, and both hypotheses draw their universe from it. Adding display
// text to it would mean editing a file whose point is that it does not change.
// names.json holds only what a player reads, and tests/names.test.js holds the
// two to each other so a new ticker cannot be half-added.
//
// NO SECTOR IN HERE, which is a rule and not an oversight. Level 1 hides the
// group headings because they say which holdings move together; a description
// reading "NVDA - AI stock" beside the picker would hand that straight back.
// The four kinds say what a thing IS - stock, stock fund, bond fund, gold -
// never what it moves with, and a test fails on any kind containing a group's
// name.
//
// Educational, not investment advice.

export const NAMES_URL = 'names.json';

/** The four kinds a holding can be, as names.json writes them. */
export const KINDS = ['stock', 'stock fund', 'bond fund', 'gold'];

/**
 * Check a names file over, and throw on anything a screen would otherwise
 * discover halfway through drawing itself.
 *
 * It does NOT check coverage against tickers.json: this file is loaded by the
 * browser, which has no business refusing to start a game because a ticker
 * nobody picked is undescribed. tests/names.test.js is where coverage lives,
 * and it is exact there.
 */
export function validateNames(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('names: expected an object');
  const tickers = doc.tickers;
  if (!tickers || typeof tickers !== 'object' || Array.isArray(tickers)) {
    throw new Error('names: expected a tickers object');
  }
  for (const [ticker, entry] of Object.entries(tickers)) {
    if (!entry || typeof entry !== 'object') throw new Error(`names: ${ticker} has no entry`);
    if (typeof entry.name !== 'string' || entry.name.length === 0) {
      throw new Error(`names: ${ticker} has no name`);
    }
    if (!KINDS.includes(entry.kind)) {
      throw new Error(`names: ${ticker}'s kind "${entry.kind}" is not one of ${KINDS.join(', ')}`);
    }
  }
  return doc;
}

/**
 * A holding's full name, or the ticker itself when there is none.
 *
 * FALLS BACK TO THE TICKER RATHER THAN THROWING. A missing description is a
 * gap in a file, not a reason a player cannot play: the screen shows what it
 * has always shown and the test suite is what notices.
 */
export function nameOf(names, ticker) {
  return names?.tickers?.[ticker]?.name ?? ticker;
}

/** What kind of thing a holding is, or null. */
export function kindOf(names, ticker) {
  return names?.tickers?.[ticker]?.kind ?? null;
}

/**
 * One line describing a holding: "NVDA - NVIDIA, a stock".
 *
 * THE ARTICLE IS WORKED OUT, not written into the file, because "a stock" and
 * "a bond fund" are the file's job and "an" is English's. None of the four
 * kinds begins with a vowel today; the rule is here so that the day one does,
 * the screen does not read "a gold".
 */
export function describe(names, ticker) {
  const name = nameOf(names, ticker);
  const kind = kindOf(names, ticker);
  if (!kind) return `${ticker} - ${name}`;
  const article = /^[aeiou]/i.test(kind) ? 'an' : 'a';
  return `${ticker} - ${name}, ${article} ${kind}`;
}

/**
 * The tickers a build can offer, in alphabetical order, each with its name and
 * kind.
 *
 * ALPHABETICAL AND NOT GROUPED, for the same reason level 1's picker is: a
 * list ordered by group is a list that says which holdings move together. This
 * one is shown on every build screen, including level 1's, so it cannot be the
 * one place that gives the game away.
 */
export function describePool(names, pool) {
  return [...pool]
    .sort((a, b) => a.localeCompare(b))
    .map((ticker) => ({ ticker, name: nameOf(names, ticker), kind: kindOf(names, ticker) }));
}

/** Read names.json. A caller that cannot get it shows tickers and carries on. */
export async function loadNames(url = NAMES_URL) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return validateNames(await response.json());
}
