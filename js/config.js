// js/config.js - the few values that differ between a laptop and the live site.
//
// One place to fill in, rather than a string buried in a view.
//
// THE WORKER'S PROXY URL IS NOT HERE YET. docs/PRD.md's milestone 3 step 2 pairs
// it with ABOUT.url, and an earlier version of this note said both were
// "declared here, unset" - which was never true of the proxy, and sent a reader
// looking for a constant that did not exist. Nothing fetches through a proxy
// today: every URL the game reads is a file in this repository, which is why
// there has been nothing to configure. The constant belongs here when the Worker
// is built, beside this one.
//
// Educational, not investment advice.

/**
 * Where the game lives, for a link somebody else will open.
 *
 * Set on 26 November 2026, when GitHub Pages went live and served the site from
 * main. Anything sharing a link falls back to the page it is being served from
 * if this is ever unset, which is right on a laptop and right on the live site.
 * It is written down rather than left to fall back because the two DIFFER in the
 * case that matters: a share made while testing on localhost:8000 would
 * otherwise post a link only that laptop can open.
 */
export const ABOUT = {
  url: 'https://mayaagge.github.io/one-trade/',
};
