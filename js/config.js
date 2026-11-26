// js/config.js - the few values that differ between a laptop and the live site.
//
// docs/PRD.md, milestone 3 step 2: "Set PROXY and ABOUT.url, deploy to GitHub
// Pages". They are declared here, unset, so that the code which needs them can
// be written and tested before the deploy that fills them in - and so there is
// one place to fill in rather than a string buried in a view.
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
