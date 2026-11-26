// tests/myPortfolio.test.js - My real portfolio, rendered and typed into.
//
// This mode is the one place in One Trade where a player's own money is on the
// screen. docs/PRD.md promises of it: "Enter real holdings in dollars; nothing is
// stored or sent", and of the whole project: "Prices come in; holdings never go
// out." Those promises are what most of this file is about.
//
// THE PRIVACY TEST WATCHES EVERY WAY A BROWSER CAN SEND DATA, not just fetch. A
// test that only watched fetch would pass while an <img src> carried a ticker
// list to a server in a query string, or a beacon did it on unload. So the
// browser this file builds has fetch, XMLHttpRequest, sendBeacon, Image,
// WebSocket, EventSource, form.submit and the clipboard all watched, plus every
// way the URL can be changed, and the test asserts that NONE of them is touched
// from the moment the first holding is entered.
//
// WHY "AFTER THE FIRST HOLDING" RATHER THAN NEVER. The four data files - the
// ticker list, the levels, the basket and the prices - are fetched when the mode
// opens, before anything has been typed, and they are the "prices come in" half
// of the promise. What must never happen is a request AFTER there is something
// private to put in one.
//
// AND IT MAY NOT SOUND LIKE ADVICE. Somebody reading this screen is looking at
// their own savings, so the words have to describe what the portfolio does and
// never what to do about it. BANNED_PHRASES is that rule as data, and the audit
// below scans everything the screens actually render.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { StubNode, textOf, withDocument } from './stubDom.js';
import {
  BANNED_PHRASES, PRIVACY_LINE, mountMyPortfolio, shownShareTotal,
} from '../js/myPortfolio.js';
import { MOST_HOLDINGS } from '../js/holdings.js';
import { validateLevels } from '../js/levels.js';

const root = new URL('..', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));
const LEVELS = validateLevels(readJson('levels.json'));
const TICKERS = readJson('tickers.json');
const BASKET = readJson('basket.json');
const GAME = readJson('data/game.json');

const UNIVERSE = TICKERS.groups
  .flatMap((g) => g.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));

/**
 * A browser with every exit watched.
 *
 * `sent` collects anything that would leave the machine, by any route. It is
 * asserted empty, so a new route added to the view - or to a module it imports -
 * shows up here as a failure rather than as silence.
 */
function browser() {
  const asked = [];
  const sent = [];
  const stored = [];
  const urlChanges = [];

  class WatchedXhr {
    open(method, url) { sent.push(`xhr ${method} ${url}`); }

    send(body) { sent.push(`xhr send ${body ?? ''}`); }

    setRequestHeader() {}
  }

  // An <img> whose src is set is a GET request, which is the classic way to
  // smuggle data out of a page that never calls fetch.
  class WatchedImage {
    set src(value) { sent.push(`img ${value}`); }

    get src() { return ''; }
  }

  const location = {
    origin: 'http://localhost:8000',
    pathname: '/',
    hash: '#mine',
    href: 'http://localhost:8000/#mine',
    assign: (url) => urlChanges.push(`assign ${url}`),
    replace: (url) => urlChanges.push(`replace ${url}`),
  };

  const restore = withDocument({
    localStorage: {
      getItem: (key) => { stored.push(`getItem ${key}`); return null; },
      setItem: (key, value) => { stored.push(`setItem ${key}=${value}`); },
      removeItem: (key) => { stored.push(`removeItem ${key}`); },
    },
    sessionStorage: {
      getItem: (key) => { stored.push(`session getItem ${key}`); return null; },
      setItem: (key, value) => { stored.push(`session setItem ${key}=${value}`); },
      removeItem: (key) => { stored.push(`session removeItem ${key}`); },
    },
    location,
    history: {
      pushState: (state, title, url) => urlChanges.push(`pushState ${url}`),
      replaceState: (state, title, url) => urlChanges.push(`replaceState ${url}`),
    },
    navigator: {
      sendBeacon: (url, body) => { sent.push(`beacon ${url} ${body ?? ''}`); return true; },
      clipboard: { writeText: (text) => { sent.push(`clipboard ${text}`); return Promise.resolve(); } },
      share: async (data) => { sent.push(`share ${JSON.stringify(data)}`); },
    },
    XMLHttpRequest: WatchedXhr,
    Image: WatchedImage,
    WebSocket: class { constructor(url) { sent.push(`ws ${url}`); } },
    EventSource: class { constructor(url) { sent.push(`sse ${url}`); } },
    fetch: async (url, options) => {
      const name = String(url);
      asked.push(name);
      sent.push(`fetch ${name} ${options?.body ?? ''}`);
      const body = name.includes('levels.json') ? LEVELS
        : name.includes('basket.json') ? BASKET
          : name.includes('game.json') ? GAME
            : TICKERS;
      return { ok: true, status: 200, json: async () => body };
    },
  });

  return {
    root: new StubNode('main'), asked, sent, stored, urlChanges, location, restore,
  };
}

const DATA_FILES = ['basket.json', 'data/game.json', 'levels.json', 'tickers.json'];

const tagged = (view, tag) => view.all().filter((node) => node.tagName === tag);
const boxNamed = (view, name) => tagged(view, 'INPUT')
  .find((node) => node.attributes['data-box'] === name);

/**
 * A button by what it SAYS or by what it is announced as.
 *
 * The remove buttons read "Remove" on screen and "Remove VOO" to a screen
 * reader: fifteen rows each saying "Remove NVDA" in full is a wall of text on a
 * phone, while "Remove" on its own tells somebody listening nothing about which
 * row they are on. So the ticker is in the aria-label, and a test looking only
 * at the visible text would never find the button it means.
 */
const buttonSaying = (view, pattern) => tagged(view, 'BUTTON')
  .find((node) => pattern.test(node.textContent) || pattern.test(node.attributes['aria-label'] ?? ''));

/** Type a holding in and press Add, as a player does. */
function enter(view, ticker, dollars) {
  boxNamed(view, 'ticker').typeText(ticker);
  boxNamed(view, 'dollars').typeText(dollars);
  buttonSaying(view, /^Add$/).click();
}

// --- the entry screen -------------------------------------------------------

test('the entry screen says what it is, and promises nothing is kept', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    const text = textOf(b.root);
    assert.match(text, /My real portfolio/);
    assert.ok(text.includes(PRIVACY_LINE), 'the privacy line is not on the screen');
    assert.equal(PRIVACY_LINE, 'Nothing is saved or sent. Leaving this page clears it.');
    assert.match(text, /Educational, not investment advice\./);
  } finally { b.restore(); }
});

test('the ticker box offers type-ahead from tickers.json', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    const box = boxNamed(b.root, 'ticker');
    const listId = box.attributes.list;
    assert.ok(listId, 'the ticker box has no type-ahead list');

    const datalist = tagged(b.root, 'DATALIST').find((node) => node.attributes.id === listId);
    assert.ok(datalist, `no datalist with id ${listId}`);
    const offered = datalist.children.map((option) => option.attributes.value);
    assert.deepEqual([...offered].sort(), [...UNIVERSE].sort(),
      'the type-ahead list is not tickers.json');
  } finally { b.restore(); }
});

test('the dollar box asks a phone for the number keyboard', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    const box = boxNamed(b.root, 'dollars');
    // inputmode numeric rather than type=number: type=number brings a spinner
    // and silently drops a comma, and this box accepts "12,500".
    assert.equal(box.attributes.inputmode, 'numeric');
    assert.notEqual(box.attributes.type, 'number');
  } finally { b.restore(); }
});

// --- adding and removing ----------------------------------------------------

test('a holding is added, and its share is of the real total', async () => {
  const b = browser();
  try {
    const ctx = await mountMyPortfolio(b.root);
    enter(b.root, 'VOO', '5,000');
    enter(b.root, 'NVDA', '2000');
    enter(b.root, 'BND', '3000');

    assert.deepEqual(ctx.list.rows, [
      { ticker: 'VOO', dollars: 5000 },
      { ticker: 'NVDA', dollars: 2000 },
      { ticker: 'BND', dollars: 3000 },
    ]);
    const text = textOf(b.root);
    assert.match(text, /\$5,000/);
    assert.match(text, /50%/);
    assert.match(text, /20%/);
    assert.match(text, /30%/);
    assert.match(text, /\$10,000/, 'the total is not on the screen');
  } finally { b.restore(); }
});

test('the total and the shares follow every change', async () => {
  const b = browser();
  try {
    const ctx = await mountMyPortfolio(b.root);
    enter(b.root, 'VOO', '5000');
    enter(b.root, 'BND', '5000');
    assert.match(textOf(b.root), /50%/);

    // A third holding of $10,000 makes the first two 25% each.
    enter(b.root, 'GLD', '10000');
    assert.equal(ctx.list.total(), 20000);
    assert.match(textOf(b.root), /25%/);

    buttonSaying(b.root, /Remove GLD/).click();
    assert.equal(ctx.list.total(), 10000);
    assert.match(textOf(b.root), /50%/);
    assert.ok(!/GLD/.test(textOf(b.root).replace(/GLD(?=<\/option>)/g, '')),
      'a removed holding is still on the screen');
  } finally { b.restore(); }
});

test('every row has its own remove button, named for its holding', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    enter(b.root, 'VOO', '5000');
    enter(b.root, 'NVDA', '5000');
    for (const ticker of ['VOO', 'NVDA']) {
      const remove = buttonSaying(b.root, new RegExp(`Remove ${ticker}`));
      assert.ok(remove, `no remove button for ${ticker}`);
    }
  } finally { b.restore(); }
});

// --- what cannot be used ----------------------------------------------------

test('a ticker not in tickers.json is reported on its own box, and nothing is added', async () => {
  const b = browser();
  try {
    const ctx = await mountMyPortfolio(b.root);
    enter(b.root, 'TSLA', '5000');

    assert.deepEqual(ctx.list.rows, [], 'the unknown holding was added');
    const text = textOf(b.root);
    assert.match(text, /TSLA is not one of the tickers this game carries/);
    // The message is attached to the ticker box, not dropped at the foot of the page.
    const problem = b.root.querySelector('field-problem');
    assert.ok(problem, 'the problem is not shown against a box');
    assert.match(problem.textContent, /TSLA/);
    assert.equal(problem.attributes['data-for'], 'ticker');
    // It reads as a fact about this game, not as the player's mistake.
    assert.ok(!/error|invalid|illegal|sorry/i.test(text), `reads as an error: ${text}`);
  } finally { b.restore(); }
});

test('cents are taken and rounded, and the row shows what was recorded', async () => {
  const b = browser();
  try {
    const ctx = await mountMyPortfolio(b.root);
    enter(b.root, 'VOO', '$12,500.37');
    assert.deepEqual(ctx.list.rows, [{ ticker: 'VOO', dollars: 12500 }]);
    assert.equal(b.root.querySelector('field-problem'), null, 'a real balance was refused');
    // The ROUNDED amount is what the row says, not what was typed: rounding
    // changes the number, so the screen shows the number it is using.
    const text = textOf(b.root);
    assert.match(text, /\$12,500/);
    assert.ok(!text.includes('12,500.37'), 'the screen echoes the cents it did not keep');
  } finally { b.restore(); }
});

test('an amount that cannot be read is reported on the dollar box', async () => {
  const b = browser();
  try {
    const ctx = await mountMyPortfolio(b.root);
    enter(b.root, 'VOO', '5k');
    assert.deepEqual(ctx.list.rows, []);
    const problem = b.root.querySelector('field-problem');
    assert.equal(problem.attributes['data-for'], 'dollars');
    assert.match(problem.textContent, /not a number of dollars/);
  } finally { b.restore(); }
});

// --- what was left out -------------------------------------------------------

test('a refused row says its amount is not in the total', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    enter(b.root, 'TSLA', '600');
    const text = textOf(b.root);
    assert.match(text, /Not included in the total: TSLA \(\$600\)/);
    assert.match(text, /not part of any measure/);
  } finally { b.restore(); }
});

test('the amount stays reported after the problem beside the box is gone', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    enter(b.root, 'TSLA', '600');
    enter(b.root, 'VOO', '4,200');
    // The complaint beside the box goes - it has been dealt with - but the money
    // is still missing, and a screen that forgot it would be showing $4,200 of a
    // $4,800 portfolio with nothing saying so.
    assert.equal(b.root.querySelector('field-problem'), null, 'a stale complaint');
    assert.match(textOf(b.root), /Not included in the total: TSLA \(\$600\)/);
  } finally { b.restore(); }
});

test('the measures screen says what is missing, so it cannot read as the whole portfolio', async () => {
  const b = browser();
  try {
    const ctx = await mountMyPortfolio(b.root);
    enter(b.root, 'VOO', '4,200');
    enter(b.root, 'NVDA', '1,850');
    enter(b.root, 'TSLA', '600');            // refused: not in this game's list
    enter(b.root, 'QQQ', '1,100');
    buttonSaying(b.root, /See what this portfolio does/).click();

    assert.equal(ctx.result.value, 7150, 'the total is not the three holdings that went in');
    const text = textOf(b.root);
    assert.match(text, /\$7,150 across 3 holdings/);
    assert.match(text, /Not included in the total: TSLA \(\$600\)/);
  } finally { b.restore(); }
});

test('retyping the same money under a ticker that works stops it being reported', async () => {
  const b = browser();
  try {
    const ctx = await mountMyPortfolio(b.root);
    enter(b.root, 'NVDAA', '1,850');          // a typo
    assert.match(textOf(b.root), /NVDAA \(\$1,850\)/);
    enter(b.root, 'NVDA', '1,850');           // the fix: same money, real ticker
    assert.deepEqual(ctx.excluded, [], 'money now in the total is still reported as out');
    assert.ok(!/Not included/.test(textOf(b.root)));
  } finally { b.restore(); }
});

test('two refused rows are both reported, and the same one twice is reported once', async () => {
  const b = browser();
  try {
    const ctx = await mountMyPortfolio(b.root);
    enter(b.root, 'TSLA', '600');
    enter(b.root, 'TSLA', '600');             // the same row again
    assert.equal(ctx.excluded.length, 1, 'the same refusal was recorded twice');
    enter(b.root, 'ZZZZ', '1,000');
    const text = textOf(b.root);
    assert.match(text, /TSLA \(\$600\)/);
    assert.match(text, /ZZZZ \(\$1,000\)/);
    assert.match(text, /Those amounts are not part of any measure/);
  } finally { b.restore(); }
});

test('a refused row with no readable amount is reported by name alone', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    enter(b.root, 'TSLA', '5k');
    // No amount to name, so the line names the holding and claims no figure.
    assert.match(textOf(b.root), /Not included in the total: TSLA\./);
  } finally { b.restore(); }
});

test('an empty ticker box is somebody not finished, not a holding left out', async () => {
  const b = browser();
  try {
    const ctx = await mountMyPortfolio(b.root);
    enter(b.root, '', '600');
    assert.deepEqual(ctx.excluded, [], 'an unfinished row was recorded as missing money');
    assert.ok(!/Not included/.test(textOf(b.root)));
  } finally { b.restore(); }
});

test('clearing everything clears what was left out too', async () => {
  const b = browser();
  try {
    const ctx = await mountMyPortfolio(b.root);
    enter(b.root, 'VOO', '5000');
    enter(b.root, 'TSLA', '600');
    buttonSaying(b.root, /Clear everything/).click();
    assert.deepEqual(ctx.excluded, []);
    assert.ok(!/Not included/.test(textOf(b.root)));
  } finally { b.restore(); }
});

test('a problem is cleared by the next good row, not left on the screen', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    enter(b.root, 'TSLA', '5000');
    assert.ok(b.root.querySelector('field-problem'), 'no problem was shown');
    enter(b.root, 'VOO', '5000');
    assert.equal(b.root.querySelector('field-problem'), null, 'the old problem is still there');
  } finally { b.restore(); }
});

test('the boxes are emptied after a row is added, and kept after a refused one', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    enter(b.root, 'VOO', '5000');
    assert.equal(boxNamed(b.root, 'ticker').value, '', 'the ticker box kept its text');
    assert.equal(boxNamed(b.root, 'dollars').value, '', 'the dollar box kept its text');

    // A refused row keeps what was typed, so a one-character typo is a
    // one-character fix rather than the whole row again.
    enter(b.root, 'TSLA', '4,000');
    assert.equal(boxNamed(b.root, 'ticker').value, 'TSLA');
    assert.equal(boxNamed(b.root, 'dollars').value, '4,000');
  } finally { b.restore(); }
});

// --- how many ---------------------------------------------------------------

test('the measures wait for two holdings and say how many are needed', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    const see = () => buttonSaying(b.root, /See what this portfolio does/);
    assert.equal(see().disabled, true);

    enter(b.root, 'VOO', '5000');
    assert.equal(see().disabled, true);
    assert.match(textOf(b.root), /Add one more holding/);

    enter(b.root, 'BND', '5000');
    assert.equal(see().disabled, false);
  } finally { b.restore(); }
});

test('the fifteenth holding is the last, and the box says so instead of taking a sixteenth', async () => {
  const b = browser();
  try {
    const ctx = await mountMyPortfolio(b.root);
    for (const ticker of UNIVERSE.slice(0, MOST_HOLDINGS)) enter(b.root, ticker, '1000');
    assert.equal(ctx.list.rows.length, MOST_HOLDINGS);

    enter(b.root, UNIVERSE[MOST_HOLDINGS], '1000');
    assert.equal(ctx.list.rows.length, MOST_HOLDINGS, 'a sixteenth holding was added');
    assert.match(textOf(b.root), /up to 15 holdings/);
    // A full list stops offering the boxes rather than refusing a tap later.
    assert.equal(buttonSaying(b.root, /^Add$/).disabled, true);
  } finally { b.restore(); }
});

// --- the measures ------------------------------------------------------------

test('the measures are the real total, not $10,000', async () => {
  const b = browser();
  try {
    const ctx = await mountMyPortfolio(b.root);
    enter(b.root, 'VOO', '30,000');
    enter(b.root, 'NVDA', '20,000');
    buttonSaying(b.root, /See what this portfolio does/).click();

    assert.equal(ctx.problem, null, `${ctx.problem}`);
    assert.equal(ctx.result.value, 50000, 'the measures used something other than the real total');
    assert.equal(ctx.result.loss.value, 50000);

    // The loss is worked out on $50,000, so it is five times a $10,000 one.
    const text = textOf(b.root);
    const expected = Math.round(Math.abs(ctx.result.loss.worst)).toLocaleString('en-US');
    assert.match(text, new RegExp(`\\$${expected}`));
    assert.ok(Math.abs(ctx.result.loss.worst) > 1000,
      'a $50,000 portfolio lost less than a $10,000 one would');
  } finally { b.restore(); }
});

test('the measures screen shows all six, and the privacy line again', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    enter(b.root, 'QQQ', '4000');
    enter(b.root, 'NVDA', '3000');
    enter(b.root, 'GLD', '2000');
    enter(b.root, 'BND', '1000');
    buttonSaying(b.root, /See what this portfolio does/).click();

    const text = textOf(b.root);
    assert.match(text, /Effective bets/);
    assert.match(text, /counts risk, not money/);
    assert.match(text, /Share of money/);
    assert.match(text, /Share of risk/);
    assert.match(text, /Which holdings move together/);
    assert.match(text, /Beta to the AI basket, all days/);
    assert.match(text, /Beta on the worst 10% of days/);
    assert.match(text, /A 20% fall in the AI basket/);
    assert.match(text, /Measured over 756 trading days/);
    assert.ok(text.includes(PRIVACY_LINE), 'the privacy line is missing from the measures screen');
    assert.match(text, /Educational, not investment advice\./);
  } finally { b.restore(); }
});

test('the holdings can be changed after measuring, and cleared outright', async () => {
  const b = browser();
  try {
    const ctx = await mountMyPortfolio(b.root);
    enter(b.root, 'VOO', '5000');
    enter(b.root, 'BND', '5000');
    buttonSaying(b.root, /See what this portfolio does/).click();

    buttonSaying(b.root, /Change these holdings/).click();
    assert.equal(ctx.list.rows.length, 2, 'the holdings were lost');

    buttonSaying(b.root, /Clear everything/).click();
    assert.deepEqual(ctx.list.rows, [], 'the holdings were not cleared');
    assert.equal(ctx.result, null, 'the measures survived the clear');
  } finally { b.restore(); }
});

// --- nothing leaves ----------------------------------------------------------

test('nothing is sent, by any route, once holdings are entered', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);

    // Everything up to here is the four data files, which are the "prices come
    // in" half of the promise. From this line on, nothing may go out at all.
    assert.deepEqual([...b.asked].sort(), DATA_FILES);
    const sentOnTheWayIn = b.sent.length;

    enter(b.root, 'VOO', '30,000');
    enter(b.root, 'NVDA', '20,000');
    enter(b.root, 'TSLA', '1000');            // a refused row, which must not go out either
    buttonSaying(b.root, /See what this portfolio does/).click();
    buttonSaying(b.root, /Change these holdings/).click();
    buttonSaying(b.root, /Remove VOO/).click();
    enter(b.root, 'BND', '5000');
    buttonSaying(b.root, /See what this portfolio does/).click();

    const after = b.sent.slice(sentOnTheWayIn);
    assert.deepEqual(after, [], `something left the browser: ${after.join(' | ')}`);
    assert.deepEqual([...b.asked].sort(), DATA_FILES, 'a file was fetched after holdings were in');
  } finally { b.restore(); }
});

test('nothing is saved, in either storage', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    enter(b.root, 'VOO', '30,000');
    enter(b.root, 'NVDA', '20,000');
    buttonSaying(b.root, /See what this portfolio does/).click();
    assert.deepEqual(b.stored, [], `storage was touched: ${b.stored.join(', ')}`);
  } finally { b.restore(); }
});

test('nothing is put in the URL', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    const before = { ...b.location };
    enter(b.root, 'VOO', '30,000');
    enter(b.root, 'NVDA', '20,000');
    buttonSaying(b.root, /See what this portfolio does/).click();

    assert.deepEqual(b.urlChanges, [], `the URL was changed: ${b.urlChanges.join(', ')}`);
    assert.equal(b.location.hash, before.hash, 'the hash changed');
    assert.equal(b.location.href, before.href, 'the href changed');
    assert.ok(!String(b.location.href).includes('VOO'), 'a holding reached the URL');
  } finally { b.restore(); }
});

test('there is no share card here: a card is a thing that leaves', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    enter(b.root, 'VOO', '5000');
    enter(b.root, 'NVDA', '5000');
    buttonSaying(b.root, /See what this portfolio does/).click();
    const text = textOf(b.root);
    // Not /share/i: the measures themselves are shares - "Share of money",
    // "the shares of risk add up to 100%" - so this looks for the CONTROLS a
    // share card brings and for its own wording, never for the word.
    assert.ok(!/Share my score|Copy the link|Download the image/i.test(text),
      `a share card leaked in: ${text}`);
    assert.equal(buttonSaying(b.root, /^Share/), undefined, 'a Share button');
    assert.equal(b.root.querySelectorAll('share-row').length, 0, 'a share row');
    assert.equal(b.root.querySelectorAll('share-preview').length, 0, 'a share preview');
    assert.equal(tagged(b.root, 'CANVAS').length, 0, 'a canvas, which is how a card is drawn');
  } finally { b.restore(); }
});

// --- how it reads ------------------------------------------------------------

/** Everything the screens say, with the disclaimer's own "advice" taken out. */
function wordsOf(view) {
  return textOf(view).split(' | ')
    .filter((line) => line !== 'Educational, not investment advice.')
    .join(' | ');
}

test('no screen in this mode tells anybody what to do', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    const screens = [wordsOf(b.root)];

    enter(b.root, 'TSLA', '5000');                        // the refused-row screen
    screens.push(wordsOf(b.root));
    enter(b.root, 'QQQ', '40,000');
    enter(b.root, 'NVDA', '30,000');
    enter(b.root, 'GLD', '20,000');
    enter(b.root, 'BND', '10,000');
    screens.push(wordsOf(b.root));
    buttonSaying(b.root, /See what this portfolio does/).click();
    screens.push(wordsOf(b.root));                        // the measures screen

    for (const words of screens) {
      for (const banned of BANNED_PHRASES) {
        assert.ok(!banned.test(words),
          `"${banned}" matched: ${words.match(banned)?.[0]} - in: ${words.slice(0, 200)}`);
      }
    }
  } finally { b.restore(); }
});

test('the banned list covers the phrases that would make this advice', () => {
  // The list is data, so it can be read here. These are the shapes that turn a
  // description into a recommendation; each must be caught.
  const wouldBeAdvice = [
    'You should sell some NVDA.',
    'Consider trimming your largest holding.',
    'We recommend holding more bonds.',
    'You would be better off with an index fund.',
    'This portfolio has too much in one stock.',
    'You need to diversify.',
    'Buy more bonds.',
  ];
  for (const sentence of wouldBeAdvice) {
    assert.ok(BANNED_PHRASES.some((banned) => banned.test(sentence)),
      `nothing in the banned list catches: ${sentence}`);
  }
});

test('the measures are described, not judged', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    enter(b.root, 'NVDA', '9,000');
    enter(b.root, 'AMD', '1,000');
    buttonSaying(b.root, /See what this portfolio does/).click();
    const text = textOf(b.root);
    // A portfolio that is 90% one AI stock is as concentrated as this screen
    // gets, and it is still described rather than graded: no verdict words.
    assert.ok(!/risky|dangerous|unwise|poor|bad|good|well.diversified|concentrated enough/i.test(text),
      `a judgment leaked in: ${text}`);
  } finally { b.restore(); }
});

// --- failures ----------------------------------------------------------------

test('data that will not load is one message, not a dead screen', async () => {
  const b = browser();
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => (String(url).includes('game.json')
      ? { ok: false, status: 404, json: async () => ({}) }
      : realFetch(url));
    const ctx = await mountMyPortfolio(b.root);
    assert.equal(ctx, null);
    assert.match(textOf(b.root), /could not load its data/);
    assert.match(textOf(b.root), /Educational, not investment advice\./);
  } finally { b.restore(); }
});

test('a portfolio that cannot be measured says so and keeps the holdings', async () => {
  const b = browser();
  try {
    const ctx = await mountMyPortfolio(b.root);
    enter(b.root, 'VOO', '5000');
    enter(b.root, 'NVDA', '5000');
    ctx.levels = { ...ctx.levels, window: { days: 756, minDays: 100000 } };
    buttonSaying(b.root, /See what this portfolio does/).click();

    assert.match(textOf(b.root), /could not be measured/);
    assert.equal(ctx.list.rows.length, 2, 'the holdings were thrown away');
  } finally { b.restore(); }
});

// --------------------------------------------- the total row's percentage

/** The share cells, rows then total, as the screen renders them. */
const shareCells = (view) => view.all()
  .filter((node) => String(node.className ?? '').includes('holding-share'))
  .map((node) => node.textContent);

test('the total row shows what the column actually adds up to', async () => {
  // THE 100% BUG. The row shares are rounded to whole percents, and three
  // holdings of a third each render 33% three times; the total used to print a
  // literal "100%" above them, so the screen disagreed with its own column. A
  // reader adding the column up is doing the right thing and must not be told
  // they are wrong.
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    enter(b.root, 'VOO', '3333');
    enter(b.root, 'BND', '3333');
    enter(b.root, 'GLD', '3334');

    assert.deepEqual(shareCells(b.root), ['Share', '33%', '33%', '33%', '99%'],
      '33 + 33 + 33 is 99, and the total row has to say so');
    const text = textOf(b.root);
    assert.match(text, /Shares are rounded to whole percents/);
    assert.match(text, /Every measure uses the exact amounts\./);
    // The dollars are untouched: only the percentage was ever wrong.
    assert.match(text, /\$10,000/);
  } finally { b.restore(); }
});

test('a portfolio whose shares do add to 100% says nothing about rounding', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    enter(b.root, 'VOO', '5000');
    enter(b.root, 'BND', '5000');

    assert.deepEqual(shareCells(b.root), ['Share', '50%', '50%', '100%']);
    assert.ok(!/rounded to whole percents/.test(textOf(b.root)),
      'the rounding note appeared on a portfolio that does add up');
  } finally { b.restore(); }
});

test('seven equal holdings come to 98%, and the screen agrees', async () => {
  const b = browser();
  try {
    await mountMyPortfolio(b.root);
    for (const ticker of ['VOO', 'QQQ', 'BND', 'GLD', 'TLT', 'NVDA', 'JNJ']) {
      enter(b.root, ticker, '1000');
    }
    assert.deepEqual(
      shareCells(b.root),
      ['Share', '14%', '14%', '14%', '14%', '14%', '14%', '14%', '98%'],
      'seven fourteens is 98',
    );
  } finally { b.restore(); }
});

test('shownShareTotal() is the same arithmetic the rows are drawn with', async () => {
  // The helper and the screen cannot drift: whatever the rows say, added up, is
  // what the total says. Checked across awkward splits rather than one.
  const b = browser();
  try {
    for (const amounts of [
      ['3333', '3333', '3334'],
      ['1000', '1000', '1000', '1000', '1000', '1000', '1000'],
      ['4212', '1850', '900', '1100'],
      ['9999', '1'],
      ['1', '1', '1'],
    ]) {
      const fresh = browser();
      try {
        await mountMyPortfolio(fresh.root);
        const names = ['VOO', 'BND', 'GLD', 'TLT', 'QQQ', 'NVDA', 'JNJ'];
        for (const [i, dollars] of amounts.entries()) enter(fresh.root, names[i], dollars);
        const cells = shareCells(fresh.root).slice(1);          // drop the heading
        const rows = cells.slice(0, -1).map((cell) => Number(cell.replace('%', '')));
        const shown = Number(cells[cells.length - 1].replace('%', ''));
        assert.equal(
          shown, rows.reduce((sum, value) => sum + value, 0),
          `the total ${shown}% is not the sum of ${rows.join(' + ')}`,
        );
      } finally { fresh.restore(); }
    }
  } finally { b.restore(); }
});
