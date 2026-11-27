// tests/sandbox.test.js - the Sandbox screen, actually rendered and played.
//
// Rendered through tests/stubDom.js with the real tickers.json, levels.json,
// basket.json and data/game.json, so the numbers on the screen are the numbers a
// player gets. tests/measures.test.js checks those numbers against numpy; this
// file checks the screen - which is the part a unit test cannot reach.
//
// THE FOUR THINGS IT CATCHES:
//
//   * NOTHING IS SENT AND NOTHING IS SAVED. Sandbox has no guess record and no
//     ping to send - docs/PRD.md gives the Worker those two messages and this
//     mode produces neither - and nothing here is worth storing. The screen is
//     built and played with fetch, sendBeacon and localStorage all watched: the
//     only requests allowed are the four data files, and the only storage calls
//     allowed are none.
//   * EVERY MEASURE IS ON THE SCREEN. docs/PRD.md asks Sandbox for all of them,
//     and a panel quietly left out would look like a finished screen.
//   * EFFECTIVE BETS NEVER APPEARS WITHOUT ITS SENTENCE. docs/PRD.md: "It counts
//     risk, not money... The page says this wherever the number appears."
//   * THERE IS NO GUESS STEP. The mode is for taking a portfolio apart, not for
//     scoring a prediction, so a slider or a star here would be a different mode.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { StubNode, textOf, withDocument } from './stubDom.js';
import { mountSandbox } from '../js/sandbox.js';
import { rankedPairs } from '../js/measuresView.js';
import { BETS_NOTE } from '../js/measures.js';
import { validateLevels } from '../js/levels.js';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));
const LEVELS = validateLevels(readJson('levels.json'));
const TICKERS = readJson('tickers.json');
const BASKET = readJson('basket.json');
const GAME = readJson('data/game.json');

/**
 * A browser for one render, with every way out of it watched.
 *
 * `stored` and `sent` stay empty for the whole of this file; a test that only
 * counted fetches would miss a beacon, and this mode must send nothing at all.
 */
function browser() {
  const asked = [];
  const stored = [];
  const sent = [];
  const restore = withDocument({
    localStorage: {
      getItem: () => { stored.push('getItem'); return null; },
      setItem: (key) => { stored.push(`setItem ${key}`); },
      removeItem: (key) => { stored.push(`removeItem ${key}`); },
    },
    location: { origin: 'http://localhost:8000', pathname: '/', hash: '#sandbox' },
    navigator: { sendBeacon: (url) => { sent.push(`beacon ${url}`); return true; } },
    fetch: async (url) => {
      const name = String(url);
      asked.push(name);
      const body = name.includes('levels.json') ? LEVELS
        : name.includes('basket.json') ? BASKET
          : name.includes('game.json') ? GAME
            : TICKERS;
      return { ok: true, status: 200, json: async () => body };
    },
  });
  return { root: new StubNode('main'), asked, stored, sent, restore };
}

/** Pick holdings by tapping their chips, exactly as a player does. */
function pick(view, tickers) {
  for (const ticker of tickers) {
    const chip = view.querySelectorAll('chip').find((node) => node._text === ticker);
    assert.ok(chip, `no chip for ${ticker}`);
    assert.equal(chip.disabled, false, `${ticker}'s chip is disabled`);
    chip.click();
  }
}

const buttonSaying = (view, pattern) => view.querySelectorAll('btn')
  .find((node) => pattern.test(node.textContent));

test('the build screen comes up with the whole ticker list and no guess', async () => {
  const b = browser();
  try {
    const ctx = await mountSandbox(b.root);
    const text = textOf(b.root);

    assert.match(text, /Sandbox/);
    assert.match(text, /Build a portfolio/);
    assert.match(text, /Educational, not investment advice\./);
    assert.match(text, /Live prices through/);

    // Every ticker in tickers.json has a chip, under its group heading.
    const chips = b.root.querySelectorAll('chip').map((node) => node._text);
    const universe = TICKERS.groups
      .flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));
    assert.deepEqual([...chips].sort(), [...universe].sort());
    for (const group of TICKERS.groups) assert.match(text, new RegExp(group.label));

    // No guess step: no slider, no prompt, no stars. Tested as the CONTROL and
    // the prompt rather than as the word, because the lede's own sentence is
    // "with no guess to make first" - the one place the word belongs here.
    assert.equal(b.root.querySelectorAll('guess-slider').length, 0, 'a guess slider');
    assert.ok(!b.root.all().some((node) => node.tagName === 'INPUT'), 'an input control');
    assert.ok(!/guess the|your guess|Lock (it )?in|Reveal the answer|★|☆/i.test(text),
      `a guess step leaked in: ${text}`);
    assert.equal((text.match(/guess/gi) ?? []).length, 1, 'the word "guess" appears more than once');
    assert.equal(ctx.state, 'build');
  } finally { b.restore(); }
});

test('two holdings are needed before the measures can be seen, and it says why', async () => {
  const b = browser();
  try {
    const view = await mountSandbox(b.root);
    const see = () => buttonSaying(b.root, /See what this portfolio does/);

    assert.equal(see().disabled, true, 'offered with nothing picked');
    assert.match(textOf(b.root), /Pick at least 2 holdings/);

    pick(b.root, ['VOO']);
    assert.equal(see().disabled, true, 'offered with one holding');
    assert.match(textOf(b.root), /need a pair to be about/);

    pick(b.root, ['BND']);
    assert.equal(see().disabled, false, 'still refused with two holdings and the money split');
    assert.equal(view.build.picks.length, 2);
  } finally { b.restore(); }
});

test('a portfolio shows every measure docs/PRD.md asks Sandbox for', async () => {
  const b = browser();
  try {
    const ctx = await mountSandbox(b.root);
    pick(b.root, ['QQQ', 'NVDA', 'GLD', 'BND']);
    buttonSaying(b.root, /See what this portfolio does/).click();

    assert.equal(ctx.problem, null, `the portfolio would not measure: ${ctx.problem}`);
    const text = textOf(b.root);

    // 1. Effective bets, with the sentence that must go wherever it appears.
    assert.match(text, /Effective bets/);
    assert.match(text, /counts risk, not money/);
    assert.ok(text.includes(BETS_NOTE), 'the risk-not-money note is not the shared one');

    // 2. Share of risk next to dollar share, for every holding.
    assert.match(text, /Share of money/);
    assert.match(text, /Share of risk/);
    for (const ticker of ['QQQ', 'NVDA', 'GLD', 'BND']) {
      assert.match(text, new RegExp(ticker), `${ticker} is missing from the shares table`);
    }

    // 3. Correlation between the holdings.
    assert.match(text, /Which holdings move together/);
    assert.match(text, /correlation of daily returns/i);

    // 4, 5 and 6. Both betas and the loss as a range.
    assert.match(text, /Beta to the AI basket, all days/);
    assert.match(text, /Beta on the worst 10% of days/);
    assert.match(text, /A 20% fall in the AI basket/);
    assert.match(text, /\$[\d,]+ to \$[\d,]+/, 'the loss is not shown as a range');

    // And the window it was all measured over.
    assert.match(text, /Measured over 756 trading days/);
    assert.match(text, /Educational, not investment advice\./);
  } finally { b.restore(); }
});

test('the numbers on the screen are the ones measureAll computed', async () => {
  const b = browser();
  try {
    const ctx = await mountSandbox(b.root);
    pick(b.root, ['VOO', 'NVDA', 'BND']);
    buttonSaying(b.root, /See what this portfolio does/).click();

    const result = ctx.result;
    const text = textOf(b.root);

    // Effective bets to two decimals, as the panel shows it.
    assert.match(text, new RegExp(result.bets.toFixed(2).replace('.', '\\.')));
    // Both betas to two decimals.
    assert.match(text, new RegExp(result.beta.allDays.toFixed(2).replace('.', '\\.')));
    assert.match(text, new RegExp(result.beta.stressDays.toFixed(2).replace('.', '\\.')));
    // The stress day count, which is 10% of the window.
    assert.equal(result.stress.count, 75);
    assert.match(text, /75 days the S&P 500 fell hardest/);
    // The loss range, rounded to whole dollars, worst first.
    // Printed smaller loss first, so the range reads forwards.
    const worst = Math.round(Math.abs(result.loss.worst)).toLocaleString('en-US');
    const mildest = Math.round(Math.abs(result.loss.mildest)).toLocaleString('en-US');
    assert.match(text, new RegExp(`\\$${mildest} to \\$${worst}`));
    assert.ok(Math.abs(result.loss.mildest) <= Math.abs(result.loss.worst),
      'worst should be the bigger loss of the two');
  } finally { b.restore(); }
});

test('the correlation list is ranked closest first and owns up to what it leaves out', async () => {
  const b = browser();
  try {
    const ctx = await mountSandbox(b.root);
    // Twelve holdings: 66 pairs, more than the ten the list shows.
    pick(b.root, ['NVDA', 'AMD', 'AVGO', 'MRVL', 'MU', 'ANET', 'MSFT', 'GOOGL', 'AMZN', 'META', 'BND', 'GLD']);
    buttonSaying(b.root, /See what this portfolio does/).click();
    assert.equal(ctx.problem, null, ctx.problem);

    const pairs = rankedPairs(ctx.result);
    assert.equal(pairs.length, 66, 'twelve holdings make 66 pairs');
    for (let i = 1; i < pairs.length; i += 1) {
      assert.ok(pairs[i - 1].r >= pairs[i].r, 'the pairs are not ranked closest first');
    }

    const text = textOf(b.root);
    // The screen says 10 of 66 rather than cutting the list off silently.
    assert.match(text, /The 10 closest of the 66 pairs/);
    // The closest pair is on the screen; the 60th is not.
    assert.match(text, new RegExp(`${pairs[0].a} and ${pairs[0].b}`));
    const rows = b.root.querySelectorAll('pair-row');
    assert.equal(rows.length, 10, 'the list shows more or fewer than it says');
  } finally { b.restore(); }
});

test('two holdings show their one pair, and say it is the one', async () => {
  const b = browser();
  try {
    const ctx = await mountSandbox(b.root);
    pick(b.root, ['VOO', 'VTI']);
    buttonSaying(b.root, /See what this portfolio does/).click();

    assert.match(textOf(b.root), /The one pair this portfolio holds/);
    assert.equal(b.root.querySelectorAll('pair-row').length, 1);
    // VOO and VTI are the same bet, and the screen should say so plainly enough
    // that a player can see it: both track the whole US market.
    assert.ok(ctx.result.correlations[0][1] > 0.9,
      `VOO and VTI should move together, got ${ctx.result.correlations[0][1]}`);
  } finally { b.restore(); }
});

test('nothing is sent and nothing is saved, however much is built', async () => {
  const b = browser();
  try {
    await mountSandbox(b.root);
    pick(b.root, ['QQQ', 'NVDA', 'BND']);
    buttonSaying(b.root, /See what this portfolio does/).click();
    buttonSaying(b.root, /Change this portfolio/).click();
    pick(b.root, ['GLD']);
    buttonSaying(b.root, /See what this portfolio does/).click();
    buttonSaying(b.root, /Start a new portfolio/).click();
    pick(b.root, ['VOO', 'TLT']);
    buttonSaying(b.root, /See what this portfolio does/).click();

    // The only requests are the five data files, each read once on the way in.
    // names.json joined them on 27 November 2026 - what each ticker IS, for
    // the "What are these?" list - and like the rest it is read on the way in
    // and never again, however much the player builds.
    assert.deepEqual([...b.asked].sort(),
      ['basket.json', 'data/game.json', 'levels.json', 'names.json', 'tickers.json']);
    assert.equal(b.sent.length, 0, `something was sent: ${b.sent.join(', ')}`);
    assert.deepEqual(b.stored, [], `storage was touched: ${b.stored.join(', ')}`);
  } finally { b.restore(); }
});

test('there is no share card and no stars in this mode', async () => {
  const b = browser();
  try {
    await mountSandbox(b.root);
    pick(b.root, ['VOO', 'NVDA']);
    buttonSaying(b.root, /See what this portfolio does/).click();
    const text = textOf(b.root);
    // Not /star/i: "Start a new portfolio" contains it, and a test that fails on
    // its own button is a test nobody keeps.
    assert.ok(!/Share my score|★|☆|\bstars?\b/i.test(text), `a score or a card leaked in: ${text}`);
    assert.equal(b.root.querySelectorAll('share-row').length, 0);
  } finally { b.restore(); }
});

test('"Change this portfolio" keeps the holdings; "Start a new portfolio" clears them', async () => {
  const b = browser();
  try {
    const ctx = await mountSandbox(b.root);
    pick(b.root, ['VOO', 'NVDA', 'BND']);
    buttonSaying(b.root, /See what this portfolio does/).click();

    buttonSaying(b.root, /Change this portfolio/).click();
    assert.deepEqual(ctx.build.picks, ['VOO', 'NVDA', 'BND'], 'the holdings were cleared');

    buttonSaying(b.root, /See what this portfolio does/).click();
    buttonSaying(b.root, /Start a new portfolio/).click();
    assert.deepEqual(ctx.build.picks, [], 'the holdings were kept');
  } finally { b.restore(); }
});

test('a portfolio the data cannot measure says so and keeps the holdings', async () => {
  const b = browser();
  try {
    const ctx = await mountSandbox(b.root);
    pick(b.root, ['VOO', 'NVDA']);
    // Stand in for data that cannot carry the window: the real files always can,
    // so the failure is forced rather than waited for.
    ctx.levels = { ...ctx.levels, window: { days: 756, minDays: 100000 } };
    buttonSaying(b.root, /See what this portfolio does/).click();

    assert.match(textOf(b.root), /could not be measured/);
    assert.match(textOf(b.root), /Educational, not investment advice\./);
    assert.deepEqual(ctx.build.picks, ['VOO', 'NVDA'], 'the holdings were thrown away');
  } finally { b.restore(); }
});

test('data that will not load is one message on the way in, not a dead screen', async () => {
  const b = browser();
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => (String(url).includes('game.json')
      ? { ok: false, status: 404, json: async () => ({}) }
      : realFetch(url));
    const ctx = await mountSandbox(b.root);
    assert.equal(ctx, null);
    assert.match(textOf(b.root), /Sandbox could not load its data/);
    assert.match(textOf(b.root), /python3 -m http\.server 8000/);
    assert.match(textOf(b.root), /Educational, not investment advice\./);
  } finally { b.restore(); }
});
