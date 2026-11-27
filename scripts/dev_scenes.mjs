// scripts/dev_scenes.mjs - one list of every screen and state, with the clicks
// that reach it. scripts/shots.mjs photographs them; scripts/dev_a11y.mjs
// measures them.
//
// A DEVELOPMENT TOOL. Not loaded by the site - tests/devTooling.test.js checks.
//
// Each scene leaves the page showing one state. `dark` marks the ones where
// colour carries meaning - reveals, charts, the daily grid, errors, focus rings
// - which are the dark-mode shots worth reading closely.
//
// Educational, not investment advice.

import {
  ALL_PLAYED, BASE, addHolding, btn, chip, open, pick, preview, slide, startLevel,
} from './dev_browser.mjs';

export const scenes = [
  // ---------------------------------------------------------------- chrome
  {
    id: 'chrome-01-loading',
    note: 'The loading line, before any mode has its data',
    dark: true,
    async run(page) {
      await page.route('**/data/game.json', () => {});   // never answers
      await page.goto(`${BASE}/index.html#learn`, { waitUntil: 'commit' });
      await page.locator('.loading').waitFor();
    },
  },
  {
    id: 'chrome-02-skip-link',
    note: 'The skip link, focused - the first thing a keyboard reaches',
    dark: true,
    async run(page) {
      await open(page, '#research');
      await page.keyboard.press('Tab');
    },
  },
  {
    id: 'chrome-03-nav-wrap',
    note: 'The seven mode links at 375px',
    async run(page) {
      await open(page, '#research');
    },
  },
  {
    id: 'chrome-04-data-missing',
    note: 'Learn when a data file 404s',
    dark: true,
    async run(page) {
      await page.route('**/data/game.json', (route) => route.fulfill({ status: 404, body: 'no' }));
      await open(page, '#learn');
    },
  },

  {
    id: 'chrome-05-about',
    note: 'The About tab: what every word in the game means',
    async run(page) {
      await open(page, '#about');
    },
  },
  {
    id: 'chrome-06-about-levels',
    note: 'About, scrolled to "What each level teaches"',
    dark: true,
    async run(page) {
      await open(page, '#about');
      await page.locator('#about-levels').scrollIntoViewIfNeeded();
    },
  },

  // ----------------------------------------------------------------- learn
  {
    id: 'learn-01-menu-fresh',
    note: 'The level list on a browser that has played nothing',
    async run(page) {
      await open(page, '#learn');
    },
  },
  {
    id: 'learn-02-menu-stars',
    note: 'The level list with stars saved',
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
    },
  },
  {
    id: 'learn-03-menu-storage-blocked',
    note: 'The level list when the browser refuses to store anything',
    dark: true,
    blockStorage: true,
    async run(page) {
      await open(page, '#learn');
    },
  },
  {
    id: 'learn-04-menu-reset-ask',
    note: 'Reset progress, asking first',
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await btn(page, 'Reset progress').click();
    },
  },
  {
    id: 'learn-05-l1-build-empty',
    note: 'Level 1, nothing picked yet',
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 1);
    },
  },
  {
    id: 'learn-06-l1-build-done',
    note: 'Level 1, two holdings picked and the money split',
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 1);
      await pick(page, ['VOO', 'VTI']);
    },
  },
  {
    id: 'learn-07-l1-guess-blank',
    note: 'Level 1, the slider before it has been touched',
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 1);
      await pick(page, ['VOO', 'VTI']);
      await btn(page, 'Next: your guess').click();
    },
  },
  {
    id: 'learn-08-l1-guess-keyboard',
    note: 'Level 1, the slider focused and moved by arrow keys',
    dark: true,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 1);
      await pick(page, ['VOO', 'VTI']);
      await btn(page, 'Next: your guess').click();
      const slider = page.locator('input[type=range]').first();
      await slider.focus();
      for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowRight');
    },
  },
  {
    id: 'learn-09-l1-reveal',
    note: 'Level 1, the reveal and the Why? card',
    dark: true,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 1);
      await pick(page, ['VOO', 'VTI']);
      await btn(page, 'Next: your guess').click();
      await slide(page, 0.85);
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(150);
    },
  },
  {
    id: 'learn-09b-l1-reveal-apart',
    note: 'Level 1 missed - two lines that part, which is what the low number means',
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 1);
      // Gold and the S&P 500 move on different things, so this misses the bar
      // and the two lines wander apart. The same-bet pair above is the other
      // half of the lesson and the chart has to show both convincingly.
      await pick(page, ['VOO', 'GLD']);
      await btn(page, 'Next: your guess').click();
      await slide(page, 0.6);
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(150);
    },
  },
  {
    id: 'learn-10-l2-build-dealt',
    note: 'Level 2, the dealt starter portfolio',
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 2);
    },
  },
  {
    id: 'learn-11-l2-guess',
    note: 'Level 2, the bets slider',
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 2);
      await btn(page, 'Next: your guess').click();
    },
  },
  {
    id: 'learn-12-l2-reveal',
    note: 'Level 2, the reveal',
    dark: true,
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 2);
      await btn(page, 'Next: your guess').click();
      await slide(page, 2.5);
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(150);
    },
  },
  {
    id: 'learn-13-l3-build-part',
    note: 'Level 3, three of five picked - the incomplete build',
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 3);
      await pick(page, ['NVDA', 'VOO', 'BND']);
    },
  },
  {
    id: 'learn-14-l3-build-done',
    note: 'Level 3, five holdings and the allocator',
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 3);
      await pick(page, ['NVDA', 'VOO', 'BND', 'GLD', 'JNJ']);
    },
  },
  {
    id: 'learn-15-l3-build-moved',
    note: 'Level 3 with money still to spend - the state "Money left" exists for',
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 3);
      await pick(page, ['NVDA', 'VOO', 'BND', 'GLD', 'JNJ']);
      // THE MINUS, not the plus. One slider moves one holding now, so a fresh
      // build has nothing left to raise anything with: taking $700 off the first
      // holding is what puts money on the table and disables the check button.
      const minus = page.locator('.alloc-row').first().locator('button').first();
      for (let i = 0; i < 7; i += 1) await minus.click();
    },
  },
  {
    id: 'learn-16-l3-guess',
    note: 'Level 3, the guess',
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 3);
      await pick(page, ['NVDA', 'VOO', 'BND', 'GLD', 'JNJ']);
      await btn(page, 'Next: your guess').click();
      await slide(page, 3.2);
    },
  },
  {
    id: 'learn-17-l3-reveal',
    note: 'Level 3, the reveal - the one the mockups will be drawn on',
    dark: true,
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 3);
      await pick(page, ['NVDA', 'VOO', 'BND', 'GLD', 'JNJ']);
      await btn(page, 'Next: your guess').click();
      await slide(page, 3.2);
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(150);
    },
  },
  {
    id: 'learn-17b-l3-try-again',
    note: 'Level 3 missed, tried again - the same portfolio and the card that explained it',
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 3);
      // The same five as the reveal above, which make 2.06 bets and miss the
      // 3 the level asks for - so the reveal offers to try again.
      await pick(page, ['NVDA', 'VOO', 'BND', 'GLD', 'JNJ']);
      await btn(page, 'Next: your guess').click();
      await slide(page, 3.2);
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(150);
      await btn(page, 'Try again with this portfolio').click();
    },
  },
  {
    id: 'learn-18-l3-share-card',
    note: 'Level 3, the share card drawn',
    dark: true,
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 3);
      await pick(page, ['NVDA', 'VOO', 'BND', 'GLD', 'JNJ']);
      await btn(page, 'Next: your guess').click();
      await slide(page, 3.2);
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(150);
      const share = page.locator('.share-card-button');
      if (await share.count()) {
        await share.click();
        await page.waitForTimeout(600);
      }
    },
  },
  {
    id: 'learn-19-l4-build-floor',
    note: 'Level 4, QQQ locked at its 30% floor',
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 4);
      await pick(page, ['BND', 'TLT', 'GLD']);
    },
  },
  {
    id: 'learn-20-l4-reveal',
    note: 'Level 4, the beta reveal',
    dark: true,
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 4);
      await pick(page, ['BND', 'TLT', 'GLD']);
      await btn(page, 'Next: your guess').click();
      await slide(page, 0.3);
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(150);
    },
  },
  {
    id: 'learn-21-l5-build',
    note: 'Level 5, four holdings',
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 5);
      await pick(page, ['VOO', 'BND', 'GLD', 'JNJ']);
    },
  },
  {
    id: 'learn-22-l5-guess-percent',
    note: 'Level 5, the slider in percent - 25% to 100%',
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 5);
      await pick(page, ['VOO', 'BND', 'GLD', 'JNJ']);
      await btn(page, 'Next: your guess').click();
      await slide(page, 1);
    },
    seed: ALL_PLAYED,
  },
  {
    id: 'learn-23-l5-reveal',
    note: 'Level 5, the share-of-risk reveal',
    dark: true,
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 5);
      await pick(page, ['VOO', 'BND', 'GLD', 'JNJ']);
      await btn(page, 'Next: your guess').click();
      await slide(page, 0.4);
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(150);
    },
  },
  {
    id: 'learn-24-l5-reveal-concentrated',
    note: 'Level 5 with one holding carrying nearly everything',
    dark: true,
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 5);
      await pick(page, ['NVDA', 'AMD', 'AVGO', 'BND']);
      // Empty the other three to their floors with their sliders, then put
      // everything that frees into the first holding.
      for (let row = 1; row < 4; row += 1) {
        await page.locator('.alloc-slider').nth(row).fill('100');
      }
      await page.locator('.alloc-slider').first().fill('9700');
      await btn(page, 'Next: your guess').click();
      await slide(page, 0.9);
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(150);
    },
  },
  {
    id: 'learn-25-l6-build-wrong-kind',
    note: 'Level 6 with nothing in stocks - the disabled Next and its hint',
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 6);
      await pick(page, ['BND', 'TLT', 'LQD', 'GLD']);
    },
  },
  {
    id: 'learn-26-l6-build-ok',
    note: 'Level 6 with 60% in stocks',
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 6);
      await pick(page, ['WMT', 'PG', 'TLT', 'BND']);
    },
  },
  {
    id: 'learn-27-l6-unavailable',
    note: 'Level 6 offering a holding the 2020 window cannot replay',
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 6);
    },
    seed: ALL_PLAYED,
  },
  {
    id: 'learn-28-l6-reveal-chart',
    note: 'Level 6, the two-line crash chart',
    dark: true,
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 6);
      await pick(page, ['WMT', 'PG', 'TLT', 'BND']);
      await btn(page, 'Next: your guess').click();
      await slide(page, 0.5);
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(400);
    },
  },
  {
    id: 'learn-29-l7-portfolio-1',
    note: 'Level 7, the first of three mystery portfolios',
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 7);
    },
  },
  {
    id: 'learn-30-l7-reveal-1',
    note: 'Level 7, the first reveal with Next portfolio',
    dark: true,
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 7);
      await btn(page, 'Next: your guess').click();
      await slide(page, 2.5);
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(150);
    },
  },
  {
    id: 'learn-31-l7-summary',
    note: 'Level 7, all three answered, the summary',
    dark: true,
    seed: ALL_PLAYED,
    async run(page) {
      await open(page, '#learn');
      await startLevel(page, 7);
      for (let round = 0; round < 3; round += 1) {
        await btn(page, 'Next: your guess').click();
        await slide(page, 2.5);
        await btn(page, 'Reveal the answer').click();
        await page.waitForTimeout(150);
        const on = round === 2 ? 'See how you did' : 'Next portfolio';
        await btn(page, on).click();
        await page.waitForTimeout(150);
      }
    },
  },

  // ----------------------------------------------------------------- daily
  {
    id: 'daily-01-not-ready',
    note: "Today, 26 Nov: the puzzle file starts tomorrow, so the real waiting screen",
    dark: true,
    async run(page) {
      await open(page, '#daily');
    },
  },
  {
    id: 'daily-02-pair-1',
    note: 'Preview 27 Nov: the first pair',
    async run(page) {
      await open(page, '#daily');
      await preview(page, '/js/dailyView.js', 'mountDaily', '2026-11-27');
    },
  },
  {
    id: 'daily-03-mid',
    note: 'Preview 27 Nov: two answered, the reveals above the next pair',
    dark: true,
    async run(page) {
      await open(page, '#daily');
      await preview(page, '/js/dailyView.js', 'mountDaily', '2026-11-27');
      for (let i = 0; i < 2; i += 1) {
        await page.locator('.daily-card button').first().click();
        await page.waitForTimeout(80);
      }
    },
  },
  {
    id: 'daily-04-finished',
    note: 'Preview 27 Nov: all five answered, the summary and the share card',
    dark: true,
    async run(page) {
      await open(page, '#daily');
      await preview(page, '/js/dailyView.js', 'mountDaily', '2026-11-27');
      for (let i = 0; i < 5; i += 1) {
        const card = page.locator('.daily-card button');
        if (await card.count() === 0) break;
        await card.first().click();
        await page.waitForTimeout(80);
      }
    },
  },
  {
    id: 'daily-05-error',
    note: 'The daily when its file 404s',
    dark: true,
    async run(page) {
      await page.route('**/data/daily.json', (route) => route.fulfill({ status: 404, body: 'no' }));
      await open(page, '#daily');
    },
  },

  // ---------------------------------------------------------------- weekly
  {
    id: 'weekly-01-not-started',
    note: 'Today, 26 Nov: before the first Monday',
    async run(page) {
      await open(page, '#weekly');
    },
  },
  {
    id: 'weekly-02-guess',
    note: 'Preview Monday 30 Nov: the week\'s question',
    async run(page) {
      await open(page, '#weekly');
      await preview(page, '/js/weeklyView.js', 'mountWeekly', '2026-11-30');
    },
  },
  {
    id: 'weekly-03-reveal',
    note: 'Preview Monday 30 Nov: the reveal',
    dark: true,
    async run(page) {
      await open(page, '#weekly');
      await preview(page, '/js/weeklyView.js', 'mountWeekly', '2026-11-30');
      await slide(page, 2.5);
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(200);
    },
  },

  // ----------------------------------------------------------------- crash
  {
    id: 'crash-01-chooser',
    note: 'The three crash windows',
    async run(page) {
      await open(page, '#crash');
    },
  },
  {
    id: 'crash-02-build-2020',
    note: 'Building for the 2020 crash, with PLTR unavailable',
    async run(page) {
      await open(page, '#crash');
      await btn(page, 'Replay this one').click();
      await page.waitForTimeout(100);
    },
  },
  {
    id: 'crash-03-build-picked',
    note: 'Four holdings picked for the 2020 crash',
    async run(page) {
      await open(page, '#crash');
      await btn(page, 'Replay this one').click();
      await page.waitForTimeout(100);
      await pick(page, ['VOO', 'TLT', 'WMT', 'GLD']);
    },
  },
  {
    id: 'crash-04-reveal',
    note: 'The 2020 crash played out - two lines',
    dark: true,
    async run(page) {
      await open(page, '#crash');
      await btn(page, 'Replay this one').click();
      await page.waitForTimeout(100);
      await pick(page, ['VOO', 'TLT', 'WMT', 'GLD']);
      await btn(page, 'Watch it play out').click();
      await page.waitForTimeout(500);
    },
  },
  {
    id: 'crash-05-reveal-2022',
    note: 'The 2022 bear market - the long window',
    dark: true,
    async run(page) {
      await open(page, '#crash');
      await page.locator('.crash-card, article').nth(1).locator('button').click();
      await page.waitForTimeout(100);
      await pick(page, ['NVDA', 'QQQ', 'META', 'AMD']);
      await btn(page, 'Watch it play out').click();
      await page.waitForTimeout(500);
    },
  },

  // --------------------------------------------------------------- sandbox
  {
    id: 'sandbox-01-empty',
    note: 'Sandbox with nothing picked - the whole ticker list',
    async run(page) {
      await open(page, '#sandbox');
    },
  },
  {
    id: 'sandbox-02-built',
    note: 'Sandbox with four AI stocks',
    async run(page) {
      await open(page, '#sandbox');
      await pick(page, ['NVDA', 'AMD', 'AVGO', 'MSFT']);
    },
  },
  {
    id: 'sandbox-03-measures',
    note: 'Sandbox measures: four AI stocks, the lesson the game is named after',
    dark: true,
    async run(page) {
      await open(page, '#sandbox');
      await pick(page, ['NVDA', 'AMD', 'AVGO', 'MSFT']);
      await btn(page, 'See what this portfolio does').click();
      await page.waitForTimeout(200);
    },
  },
  {
    id: 'sandbox-04-measures-spread',
    note: 'Sandbox measures: a spread portfolio, for the contrast',
    dark: true,
    async run(page) {
      await open(page, '#sandbox');
      await pick(page, ['JNJ', 'TLT', 'GOOGL', 'LQD', 'COP']);
      await btn(page, 'See what this portfolio does').click();
      await page.waitForTimeout(200);
    },
  },
  {
    id: 'sandbox-05-one-holding',
    note: 'Sandbox with a single holding - the smallest portfolio it allows',
    async run(page) {
      await open(page, '#sandbox');
      await pick(page, ['VOO']);
    },
  },
  {
    id: 'sandbox-06-many',
    note: 'Sandbox with twelve holdings - the long allocator',
    async run(page) {
      await open(page, '#sandbox');
      await pick(page, ['NVDA', 'AMD', 'AVGO', 'MSFT', 'VOO', 'QQQ', 'BND', 'GLD',
        'TLT', 'JNJ', 'PG', 'XOM']);
    },
  },

  // ------------------------------------------------------- my real portfolio
  {
    id: 'mine-01-empty',
    note: 'My real portfolio, before anything is typed',
    async run(page) {
      await open(page, '#mine');
    },
  },
  {
    id: 'mine-02-rows',
    note: 'Four holdings entered, with the shares',
    async run(page) {
      await open(page, '#mine');
      await addHolding(page, 'VOO', '4212.50');
      await addHolding(page, 'NVDA', '1850.37');
      await addHolding(page, 'BND', '900');
      await addHolding(page, 'QQQ', '1100');
    },
  },
  {
    id: 'mine-03-refused-ticker',
    note: 'A ticker this game does not carry, refused',
    dark: true,
    async run(page) {
      await open(page, '#mine');
      await addHolding(page, 'VOO', '4000');
      await addHolding(page, 'TSLA', '600');
    },
  },
  {
    id: 'mine-04-refused-amount',
    note: 'A misgrouped comma, refused',
    dark: true,
    async run(page) {
      await open(page, '#mine');
      await addHolding(page, 'VOO', '4000');
      await addHolding(page, 'BND', '1,25');
    },
  },
  {
    id: 'mine-05-measures',
    note: 'The measures, with money left out of the total',
    dark: true,
    async run(page) {
      await open(page, '#mine');
      await addHolding(page, 'VOO', '4212.50');
      await addHolding(page, 'NVDA', '1850.37');
      await addHolding(page, 'BND', '900');
      await addHolding(page, 'TSLA', '600');
      await addHolding(page, 'QQQ', '1100');
      await btn(page, 'See what this portfolio does').click();
      await page.waitForTimeout(200);
    },
  },
  {
    id: 'mine-06-full',
    note: 'Fifteen holdings, the boxes disabled with the reason',
    async run(page) {
      await open(page, '#mine');
      const names = ['VOO', 'QQQ', 'BND', 'GLD', 'TLT', 'LQD', 'NVDA', 'AMD', 'MSFT',
        'JNJ', 'PG', 'KO', 'XOM', 'JPM', 'VXUS'];
      for (const [i, ticker] of names.entries()) {
        await addHolding(page, ticker, String(1000 + i * 137));
      }
    },
  },
  {
    id: 'mine-07-thirds',
    note: 'Three holdings of a third each - what the shares round to',
    async run(page) {
      await open(page, '#mine');
      await addHolding(page, 'VOO', '3333');
      await addHolding(page, 'BND', '3333');
      await addHolding(page, 'GLD', '3334');
    },
  },

  // -------------------------------------------------------------- research
  {
    id: 'research-01-page',
    note: 'The research page, whole',
    dark: true,
    async run(page) {
      await open(page, '#research');
      await page.waitForTimeout(500);
    },
  },
  {
    id: 'research-02-error',
    note: 'Research when results.json 404s',
    dark: true,
    async run(page) {
      await page.route('**/data/results.json', (route) => route.fulfill({ status: 404, body: 'no' }));
      await open(page, '#research');
    },
  },
];

