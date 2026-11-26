// js/app.js - picks a view from the URL hash. Nothing else lives here.

import { mountResearch } from './research.js';
import { mountLearn } from './game.js';
import { mountCrash } from './crashReplay.js';
import { mountDaily } from './dailyView.js';
import { mountWeekly } from './weeklyView.js';
import { mountSandbox } from './sandbox.js';

const DEFAULT_MODE = 'research';
const MODES = ['learn', 'daily', 'weekly', 'crash', 'sandbox', 'research'];

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
  mountSandbox(root);
}

window.addEventListener('hashchange', render);
render();
