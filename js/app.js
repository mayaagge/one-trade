// js/app.js - picks a view from the URL hash. Nothing else lives here.

import { mountResearch } from './research.js';
import { mountLearn } from './game.js';
import { mountCrash } from './crashReplay.js';
import { mountDaily } from './dailyView.js';
import { mountWeekly } from './weeklyView.js';
import { mountSandbox } from './sandbox.js';
import { mountMyPortfolio } from './myPortfolio.js';

/**
 * The mode a visitor lands on.
 *
 * LEARN, NOT RESEARCH. The hash is the only thing in the URL, so every link
 * without one - the address typed from a poster, the shared score card, a
 * bookmark - resolves to this. It used to be Research, which meant the first
 * thing a first-year read was "Hypothesis 1 (hidden concentration): not
 * supported on the headline correlation-only test". Research is still one tap
 * away in the nav, and is still where a professor should be sent.
 */
const DEFAULT_MODE = 'learn';
const MODES = ['learn', 'daily', 'weekly', 'crash', 'sandbox', 'mine', 'research'];

/** The mode named by a hash such as "#research", or the default. */
export function modeFromHash(hash) {
  const name = String(hash || '').replace(/^#/, '');
  return MODES.includes(name) ? name : DEFAULT_MODE;
}

function render() {
  const root = document.getElementById('view');
  const mode = modeFromHash(window.location.hash);

  for (const link of document.querySelectorAll('.modes a')) {
    const current = link.dataset.mode === mode;
    link.classList.toggle('current', current);
    if (current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  if (mode === 'research') {
    mountResearch(root);
    return;
  }
  if (mode === 'learn') {
    mountLearn(root);
    return;
  }
  if (mode === 'daily') {
    mountDaily(root);
    return;
  }
  if (mode === 'weekly') {
    mountWeekly(root);
    return;
  }
  if (mode === 'crash') {
    mountCrash(root);
    return;
  }
  // "mine" rather than "my-real-portfolio": the hash is the whole of what this
  // mode ever puts in the URL, and it names the MODE, never a holding.
  if (mode === 'mine') {
    mountMyPortfolio(root);
    return;
  }
  mountSandbox(root);
}

// The bootstrap, and the only two lines here with an effect.
//
// GUARDED SO THE FILE CAN BE IMPORTED. A module that reaches for `window` on its
// first executed line cannot be imported anywhere there isn't one, which is why
// nothing tested this file until the day a nav link and a route came apart -
// `#mine` was in the nav before it was in MODES, and a mode the router does not
// know falls silently through to the default. tests/app.test.js holds the two
// lists together now, and it can only do that if it can load this file.
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', render);
  render();
}
