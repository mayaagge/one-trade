// js/app.js - picks a view from the URL hash. Nothing else lives here.

import { mountResearch, DISCLAIMER } from './research.js';

const DEFAULT_MODE = 'research';
const MODES = ['learn', 'sandbox', 'research'];

/** The mode named by a hash such as "#research", or the default. */
export function modeFromHash(hash) {
  const name = String(hash || '').replace(/^#/, '');
  return MODES.includes(name) ? name : DEFAULT_MODE;
}

function stub(root, title, text) {
  root.replaceChildren();
  const view = document.createElement('div');
  view.className = 'view';
  const heading = document.createElement('h1');
  heading.textContent = title;
  const body = document.createElement('p');
  body.className = 'lede';
  body.textContent = text;
  const note = document.createElement('p');
  note.className = 'disclaimer-inline';
  note.textContent = DISCLAIMER;
  view.append(heading, body, note);
  root.append(view);
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
    stub(root, 'Learn', 'Levels 1 to 7 are being built. Session 2.2 writes the levels file; session 2.3 builds the build, guess and reveal round.');
    return;
  }
  stub(root, 'Sandbox', 'Build any portfolio and see every measure. Not built yet.');
}

window.addEventListener('hashchange', render);
render();
