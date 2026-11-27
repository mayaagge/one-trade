// scripts/dev_browser.mjs - the bits scripts/shots.mjs and scripts/dev_checks.mjs
// both need: a local server, and the clicks that reach a screen.
//
// A DEVELOPMENT TOOL, like both of its callers. Nothing under js/, css/ or
// index.html imports it, and tests/devTooling.test.js keeps it that way.
//
// Educational, not investment advice.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PORT = 8123;
export const BASE = `http://127.0.0.1:${PORT}`;

/** Phone width, which docs/PRD.md's "mid-range phone" bar is judged at. */
export const VIEWPORT = { width: 375, height: 812 };

/** Where js/progress.js keeps the stars. */
export const PROGRESS_KEY = 'oneTrade.learn';

/** Every level played, so the menu and any level can be reached. */
export const ALL_PLAYED = {
  key: PROGRESS_KEY,
  value: JSON.stringify({
    version: 1,
    // EVERY FIELD js/progress.js's usableEntry() REQUIRES, and no other: the
    // keys must be exactly played, stars and error, and played must be true.
    // A record missing one of them is refused WHOLE - which is the right rule
    // and makes a half-written seed look like a browser with no save at all.
    levels: {
      1: { played: true, stars: 3, error: 0.01 },
      2: { played: true, stars: 2, error: 0.3 },
      3: { played: true, stars: 1, error: 0.9 },
      4: { played: true, stars: 0, error: 0.4 },
      5: { played: true, stars: 0, error: 0.2 },
      6: { played: true, stars: 0, error: 0.5 },
      7: { played: true, stars: 0, error: 0.8 },
    },
  }),
};

/** Serve the repo root, and wait until it answers. */
export async function serve() {
  const child = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  for (let tries = 0; tries < 60; tries += 1) {
    try {
      const response = await fetch(`${BASE}/index.html`);
      if (response.ok) return child;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => { setTimeout(resolve, 100); });
  }
  child.kill();
  throw new Error(`the local server did not answer on ${BASE}`);
}

/** Go to a mode and wait for its first heading, past the loading line. */
export async function open(page, hash) {
  await page.goto(`${BASE}/index.html${hash}`, { waitUntil: 'load' });
  await page.locator('#view h1').first().waitFor({ timeout: 15000 });
}

/** A chip in the picker, by its exact ticker. */
export function chip(page, ticker) {
  // BY ID, NOT BY TEXT. The chip's words are not stable - level 6 labels a
  // holding that is not a stock "BND bond" so the rule it has to satisfy is
  // legible without colour - and an exact-text locator silently stopped
  // finding four chips the day that shipped. The id is per ticker and is
  // already load-bearing for keeping focus across a redraw (js/build.js), so
  // it is the handle that cannot drift.
  return page.locator(`button.chip#chip-${ticker}`);
}

/** A button by its exact visible words. */
export function btn(page, words) {
  return page.locator('button').filter({ hasText: new RegExp(`^${words}$`) }).first();
}

/** Pick a list of tickers, in order. */
export async function pick(page, tickers) {
  for (const ticker of tickers) await chip(page, ticker).click();
}

/** Start one of the seven levels from the menu. */
export async function startLevel(page, id) {
  await page.locator('.level-card').nth(id - 1).locator('button').click();
  await page.locator('.round-step').waitFor();
}

/** Put a guess on the slider and let the screen catch up. */
export async function slide(page, value) {
  const slider = page.locator('input[type=range]').first();
  await slider.fill(String(value));
  await page.waitForTimeout(50);
}

/** Type a holding into My real portfolio and press Add. */
export async function addHolding(page, ticker, dollars) {
  await page.locator('[data-box="ticker"]').fill(ticker);
  await page.locator('[data-box="dollars"]').fill(String(dollars));
  await btn(page, 'Add').click();
  await page.waitForTimeout(30);
}

/**
 * Re-mount a clock-dependent mode on a fixed date.
 *
 * The site itself has no date parameter and gains none: mountDaily() and
 * mountWeekly() already take `now`, and this reaches that option from outside.
 */
export async function preview(page, module, mount, now) {
  await page.evaluate(async ({ module: path, mount: name, now: date }) => {
    const loaded = await import(path);
    const root = document.getElementById('view');
    await loaded[name](root, { now: date, storageKey: `preview.${name}.${date}` });
  }, { module, mount, now });
  await page.locator('#view h1').first().waitFor();
}

/** A context that has already stored some progress. */
export async function seedInto(context, seed) {
  await context.addInitScript(({ key, value }) => {
    try { window.localStorage.setItem(key, value); } catch { /* nothing to do */ }
  }, seed);
}

/** A context whose storage throws on every call, as a blocked browser's does. */
export async function blockStorageIn(context) {
  await context.addInitScript(() => {
    const throwing = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
      removeItem() { throw new Error('blocked'); },
    };
    Object.defineProperty(window, 'localStorage', { get() { return throwing; } });
    Object.defineProperty(window, 'sessionStorage', { get() { return throwing; } });
  });
}
