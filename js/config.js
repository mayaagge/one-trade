// js/config.js - the few values that differ between a laptop and the live site.
//
// One place to fill in, rather than a string buried in a view.
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

/**
 * The Worker, for the two anonymous analytics routes and nothing else.
 *
 * NOT A SECRET, AND NOT A PROXY. It is a public endpoint anyone can see in a
 * network tab, which is why it sits in a committed file rather than anywhere
 * near an environment variable. The name "PROXY" is what docs/PRD.md's
 * milestone 3 step 2 called it back when the Worker was going to stand between
 * Yahoo and the browser; it never did (see the PRD's Architecture section), so
 * this is the analytics address, carrying `/ping` and `/guess`.
 *
 * Deployed 27 November 2026. Set this to null to turn both routes off: every
 * send in js/analytics.js is a no-op without it, and the game plays exactly the
 * same either way.
 */
export const PROXY = 'https://one-trade-worker.trade1234.workers.dev';
