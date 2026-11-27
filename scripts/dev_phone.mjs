// scripts/dev_phone.mjs - how long levels 1 to 3 take on a mid-range phone.
//
// A DEVELOPMENT TOOL, like scripts/shots.mjs and scripts/dev_checks.mjs. Not
// part of the game, not loaded by it, held outside it by tests/devTooling.test.js.
//
//   node scripts/dev_phone.mjs
//
// WHY THIS EXISTS. docs/PRD.md's launch list says "Levels 1 to 3 can be played
// in under 10 minutes on a mid-range phone", and that had never been measured -
// only assumed from the design review, which ran at 375px on a desktop and
// answers a different question.
//
// WHAT IT IS AND IS NOT. This is an ESTIMATE, not the launch item. It measures
// what a machine can measure - page load and redraw time under throttling - and
// then ADDS a model of the human part: reading at 200 words a minute and a
// per-tap allowance. It cannot see a first-time player stopping to work out
// what "effective bets" means, re-reading the task, or picking tickers they
// recognise. Only Maya's real-phone run closes the item; this says whether 10
// minutes is plausible or obviously wrong.
//
// THE PROFILE IS LIGHTHOUSE'S OWN MOBILE PROFILE, so the number is comparable
// to something: 4x CPU slowdown, and Slow 4G at 1.6 Mbit/s down, 750 kbit/s up,
// 150ms round trip.
//
// THE TOTAL IS DELIBERATELY AN UPPER BOUND. Machine time, reading time and tap
// time are added together, while a real player reads WHILE the page is working.
// Overlap would only make it faster, so the total is the pessimistic end.
//
// Educational, not investment advice.

import { chromium } from 'playwright';

import { btn, chip, open, serve, slide } from './dev_browser.mjs';

/** Lighthouse's mobile throttling, so the figure is comparable to something. */
const CPU_SLOWDOWN = 4;
const SLOW_4G = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};

/** A phone, not a desktop window. */
const PHONE = { width: 375, height: 812 };

/** How fast a person reads prose on a screen they have not seen before. */
const WORDS_PER_MINUTE = 200;

/**
 * Seconds per deliberate tap on a phone: find the target, aim, tap, see it
 * land. Not a double-click benchmark - a considered tap by somebody deciding
 * as they go.
 */
const SECONDS_PER_TAP = 1.5;

/** Seconds per slider drag, which is a longer gesture than a tap. */
const SECONDS_PER_DRAG = 4;

const steps = [];

/** Run one action, and record how long the PAGE took to settle afterwards. */
async function timed(label, taps, drags, run) {
  const started = Date.now();
  await run();
  const machineMs = Date.now() - started;
  steps.push({ label, machineMs, taps, drags });
  process.stdout.write(`  ${label.padEnd(44)} ${String(machineMs).padStart(6)}ms\n`);
}

/**
 * Every word on screen right now.
 *
 * The whole document, because a first-time player reads the heading, the task,
 * the chips' group names and the result - not a curated subset of them. Read
 * once per screen and summed, so a screen a player passes through twice is
 * counted twice, as they would read it twice.
 */
async function wordsOnScreen(page) {
  return page.evaluate(() => {
    const main = document.getElementById('view') ?? document.body;
    const text = main.innerText ?? main.textContent ?? '';
    return text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
  });
}

async function main() {
  const server = await serve();
  const browser = await chromium.launch();
  let words = 0;
  const screens = [];

  try {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });

    const readScreen = async (name) => {
      const count = await wordsOnScreen(page);
      screens.push({ name, words: count });
      words += count;
    };

    process.stdout.write(`\nMachine time, ${CPU_SLOWDOWN}x CPU and Slow 4G:\n`);

    // A FIRST-TIME PLAYER, so no seeded progress: level 1 is the only one open.
    await timed('cold load of the page', 0, 0, async () => {
      await open(page, '#learn');
    });
    await readScreen('the Learn menu');

    // ---- level 1: two holdings that move together ----------------------
    await timed('open level 1', 1, 0, async () => {
      await page.locator('.level-card').nth(0).locator('button').click();
      await page.locator('.round-step').waitFor();
    });
    await readScreen('level 1, build');
    await timed('pick VOO and VTI', 2, 0, async () => {
      await chip(page, 'VOO').click();
      await chip(page, 'VTI').click();
    });
    await timed('go to the guess', 1, 0, async () => {
      await btn(page, 'Next: your guess').click();
    });
    await readScreen('level 1, guess');
    await timed('set the guess', 0, 1, async () => {
      await slide(page, 0.9);
    });
    await timed('reveal', 1, 0, async () => {
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(900); // the reveal animates; a player watches it
    });
    await readScreen('level 1, reveal and Why card');

    // ---- level 2: the dealt portfolio ----------------------------------
    await timed('on to level 2', 1, 0, async () => {
      await btn(page, 'Next: level 2').click();
      await page.locator('.round-step').waitFor();
    });
    await readScreen('level 2, the dealt portfolio');
    // The portfolio is DEALT on this level, so the build screen is a thing to
    // read rather than a thing to fill in - but it is still a screen the player
    // has to leave before the slider exists.
    await timed('go to the guess', 1, 0, async () => {
      await btn(page, 'Next: your guess').click();
    });
    await readScreen('level 2, guess');
    await timed('set the guess', 0, 1, async () => {
      await slide(page, 2.5);
    });
    await timed('reveal', 1, 0, async () => {
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(900);
    });
    await readScreen('level 2, reveal and Why card');

    // ---- level 3: five holdings, a known passing design -----------------
    await timed('on to level 3', 1, 0, async () => {
      await btn(page, 'Next: level 3').click();
      await page.locator('.round-step').waitFor();
    });
    await readScreen('level 3, build');
    await timed('pick five holdings', 5, 0, async () => {
      for (const ticker of ['TLT', 'COP', 'VXUS', 'MSFT', 'PG']) await chip(page, ticker).click();
    });
    await timed('even split', 1, 0, async () => {
      await btn(page, 'Even split').click();
    });
    await timed('go to the guess', 1, 0, async () => {
      await btn(page, 'Next: your guess').click();
    });
    await readScreen('level 3, guess');
    await timed('set the guess', 0, 1, async () => {
      await slide(page, 3.2);
    });
    await timed('reveal', 1, 0, async () => {
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(900);
    });
    await readScreen('level 3, reveal and Why card');

    await context.close();
  } finally {
    await browser.close();
    server.kill();
  }

  // ------------------------------------------------------------- the sums
  const machineSeconds = steps.reduce((t, s) => t + s.machineMs, 0) / 1000;
  const taps = steps.reduce((t, s) => t + s.taps, 0);
  const drags = steps.reduce((t, s) => t + s.drags, 0);
  const tapSeconds = taps * SECONDS_PER_TAP + drags * SECONDS_PER_DRAG;
  const readingSeconds = (words / WORDS_PER_MINUTE) * 60;
  const total = machineSeconds + tapSeconds + readingSeconds;

  const mmss = (s) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;

  process.stdout.write('\nWords on screen, read once each:\n');
  for (const s of screens) process.stdout.write(`  ${s.name.padEnd(36)} ${String(s.words).padStart(5)}\n`);

  process.stdout.write(`\n${'-'.repeat(62)}\n`);
  process.stdout.write(`  machine, ${CPU_SLOWDOWN}x CPU + Slow 4G`.padEnd(44) + `${mmss(machineSeconds)}\n`);
  process.stdout.write(`  reading, ${words} words at ${WORDS_PER_MINUTE} wpm`.padEnd(44) + `${mmss(readingSeconds)}\n`);
  process.stdout.write(`  taps, ${taps} at ${SECONDS_PER_TAP}s + ${drags} drags at ${SECONDS_PER_DRAG}s`.padEnd(44) + `${mmss(tapSeconds)}\n`);
  process.stdout.write(`${'-'.repeat(62)}\n`);
  process.stdout.write(`  ESTIMATED TOTAL`.padEnd(44) + `${mmss(total)}\n`);
  process.stdout.write(`  the launch item allows`.padEnd(44) + `10m 00s\n`);
  const margin = 600 - total;
  process.stdout.write(`  ${margin >= 0 ? 'under by' : 'OVER by'}`.padEnd(44) + `${mmss(Math.abs(margin))}\n`);
  process.stdout.write(`${'-'.repeat(62)}\n`);

  // THE MARGIN IS A READING-SPEED QUESTION, NOT A PHONE QUESTION. Machine time
  // is a few per cent of this; the words are almost all of it. 200 wpm is an
  // average for ordinary prose, and this screen is full of terms a first-time
  // player has never met - so the slower rows are the ones to look at.
  process.stdout.write('\nIf the reader is slower than 200 wpm:\n');
  for (const wpm of [250, 200, 175, 150, 125]) {
    const read = (words / wpm) * 60;
    const t = machineSeconds + tapSeconds + read;
    const m = 600 - t;
    const flag = m >= 0 ? 'under by' : 'OVER by ';
    process.stdout.write(`  ${String(wpm).padStart(3)} wpm   total ${mmss(t).padStart(7)}   ${flag} ${mmss(Math.abs(m))}\n`);
  }
  process.stdout.write(`\n  reading is ${Math.round((readingSeconds / total) * 100)}% of the estimate; `
    + `the machine is ${Math.round((machineSeconds / total) * 100)}%.\n`);

  process.stdout.write('\nAn ESTIMATE, and an upper bound: reading, tapping and machine time are\n');
  process.stdout.write('added rather than overlapped. It does not model a first-time player\n');
  process.stdout.write('stopping to think. Only a real phone closes the launch item.\n\n');
  process.stdout.write('Educational, not investment advice.\n');
}

await main();
