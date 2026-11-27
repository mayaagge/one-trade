// scripts/dev_checks.mjs - the two bugs that a screenshot cannot show.
//
// A DEVELOPMENT TOOL, like scripts/shots.mjs. Not part of the game, not loaded
// by it, and held outside it by tests/devTooling.test.js.
//
//   node scripts/dev_checks.mjs
//
// WHAT IT MEASURES
//
// 1. THE SCROLL JUMP. Scroll a screen to the bottom, click something that
//    redraws, and read window.scrollY back. A screenshot cannot show this: both
//    pictures look identical, because the jump is in the scroll position and
//    not in the pixels. Reported per screen, so "every screen except Sandbox"
//    can be confirmed or corrected rather than taken on trust.
//
// 2. THE 100% ISSUE. Read every percentage a screen renders straight out of the
//    DOM and add them up. A column of whole percents that sums to 99 or 101
//    under a total that insists on 100% is the kind of thing the eye slides
//    past in a screenshot and a sum does not.
//
// 3. THE NUMBER LINE'S LABELS OVERLAPPING SOMETHING. Render the reveal's number
//    line across a sweep of guess-and-answer pairs at two widths, read every
//    box out with getBoundingClientRect, and intersect them. A screenshot of
//    ONE pair cannot show this, which is exactly how "your guess 3.6" shipped
//    sitting on top of its own marker: the pair in the screenshot looked fine.
//    Overlap is a question about rendered text width against a transform, and
//    neither a stub DOM nor a picture of one case can answer it.
//
// Educational, not investment advice.

import { chromium } from 'playwright';

import {
  ALL_PLAYED, VIEWPORT, addHolding, btn, open, pick, seedInto, serve, slide, startLevel,
} from './dev_browser.mjs';

// ------------------------------------------------------------- scroll jump
//
// Each case: get to a screen, scroll down, then click a control that causes the
// mode's draw() to run. `click` must NOT be a control that moves to another
// screen - a new screen starting at the top is correct behaviour.

const scrollCases = [
  {
    id: 'learn / build / + button',
    seed: ALL_PLAYED,
    async reach(page) {
      await open(page, '#learn');
      await startLevel(page, 3);
      await pick(page, ['NVDA', 'VOO', 'BND', 'GLD', 'JNJ']);
    },
    // THE MINUS, not the plus. A fresh build has every dollar allocated, so the
    // + is correctly disabled now that one slider moves one holding; clicking a
    // disabled button waits for 30 seconds and reports nothing. The - causes the
    // same redraw.
    click: (page) => page.locator('.alloc-row').last().locator('button').first(),
  },
  {
    id: 'learn / build / ticker chip',
    seed: ALL_PLAYED,
    async reach(page) {
      await open(page, '#learn');
      await startLevel(page, 3);
      await pick(page, ['NVDA', 'VOO']);
    },
    click: (page) => page.locator('button.chip').filter({ hasText: /^GLD$/ }),
  },
  {
    id: 'learn / menu / Reset progress',
    seed: ALL_PLAYED,
    async reach(page) {
      await open(page, '#learn');
    },
    click: (page) => btn(page, 'Reset progress'),
  },
  {
    id: 'crash / build / + button',
    async reach(page) {
      await open(page, '#crash');
      await btn(page, 'Replay this one').click();
      await page.waitForTimeout(150);
      await pick(page, ['VOO', 'TLT', 'WMT', 'GLD']);
    },
    // THE MINUS, not the plus. A fresh build has every dollar allocated, so the
    // + is correctly disabled now that one slider moves one holding; clicking a
    // disabled button waits for 30 seconds and reports nothing. The - causes the
    // same redraw.
    click: (page) => page.locator('.alloc-row').last().locator('button').first(),
  },
  {
    id: 'sandbox / build / + button',
    async reach(page) {
      await open(page, '#sandbox');
      await pick(page, ['NVDA', 'AMD', 'AVGO', 'MSFT', 'VOO', 'QQQ']);
    },
    // THE MINUS, not the plus. A fresh build has every dollar allocated, so the
    // + is correctly disabled now that one slider moves one holding; clicking a
    // disabled button waits for 30 seconds and reports nothing. The - causes the
    // same redraw.
    click: (page) => page.locator('.alloc-row').last().locator('button').first(),
  },
  {
    id: 'sandbox / build / ticker chip',
    async reach(page) {
      await open(page, '#sandbox');
      await pick(page, ['NVDA', 'AMD']);
    },
    click: (page) => page.locator('button.chip').filter({ hasText: /^XOM$/ }),
  },
  {
    id: 'mine / enter / Add',
    async reach(page) {
      await open(page, '#mine');
      await addHolding(page, 'VOO', '4000');
      await addHolding(page, 'BND', '2000');
      await page.locator('[data-box="ticker"]').fill('GLD');
      await page.locator('[data-box="dollars"]').fill('1500');
    },
    click: (page) => btn(page, 'Add'),
  },
  {
    id: 'mine / enter / Remove',
    async reach(page) {
      await open(page, '#mine');
      for (const [i, t] of ['VOO', 'BND', 'GLD', 'TLT', 'NVDA'].entries()) {
        await addHolding(page, t, String(1000 + i * 250));
      }
    },
    click: (page) => page.locator('.holding-row button').last(),
  },
  {
    id: 'daily / playing / answer button',
    async reach(page) {
      await open(page, '#daily');
      await page.evaluate(async () => {
        const loaded = await import('/js/dailyView.js');
        await loaded.mountDaily(document.getElementById('view'),
          { now: '2026-11-27', storageKey: 'preview.scroll' });
      });
      await page.locator('.daily-card').waitFor();
      await page.locator('.daily-card button').first().click();
      await page.waitForTimeout(100);
    },
    click: (page) => page.locator('.daily-card button').first(),
  },
];

async function checkScroll(browser) {
  const rows = [];
  for (const singleCase of scrollCases) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    if (singleCase.seed) await seedInto(context, singleCase.seed);
    const page = await context.newPage();
    try {
      await singleCase.reach(page);
      await page.waitForTimeout(100);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(100);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);

      // SCROLL THE TARGET INTO VIEW BEFORE READING THE POSITION, because
      // Playwright's click() does it anyway and the reading would otherwise be
      // taken from a position the click is about to leave. That is not a
      // hypothetical: measuring a ticker chip - which sits near the top, while
      // the player is at the bottom - reported 1251 before and 792 after and
      // looked exactly like the bug, when all that had happened was Playwright
      // scrolling up to reach the chip. A player can only tap what they can see,
      // so the honest baseline is the position the control is tapped FROM.
      const target = singleCase.click(page);
      await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(80);
      const before = await page.evaluate(() => window.scrollY);
      await target.click();
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => window.scrollY);
      const focus = await page.evaluate(() => {
        const node = document.activeElement;
        if (!node) return 'none';
        return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}`
          + `${node.className ? `.${String(node.className).split(' ')[0]}` : ''}`;
      });
      rows.push({
        id: singleCase.id, height, before, after, jumped: before > 20 && after < before / 2, focus,
      });
    } catch (error) {
      rows.push({ id: singleCase.id, error: error.message.split('\n')[0] });
    }
    await context.close();
  }
  return rows;
}

// -------------------------------------------------------------- the 100%s
//
// Every screen that renders a percentage, with each percentage read back out of
// the DOM so the column can be summed.

const percentCases = [
  {
    id: 'learn L1 build (2 holdings)',
    seed: ALL_PLAYED,
    async reach(page) {
      await open(page, '#learn');
      await startLevel(page, 1);
      await pick(page, ['VOO', 'VTI']);
    },
  },
  {
    id: 'learn L3 build (5 holdings, even)',
    seed: ALL_PLAYED,
    async reach(page) {
      await open(page, '#learn');
      await startLevel(page, 3);
      await pick(page, ['NVDA', 'VOO', 'BND', 'GLD', 'JNJ']);
    },
  },
  {
    id: 'learn L3 build (5 holdings, 3 picked)',
    seed: ALL_PLAYED,
    async reach(page) {
      await open(page, '#learn');
      await startLevel(page, 3);
      await pick(page, ['NVDA', 'VOO', 'BND']);
    },
  },
  {
    id: 'learn L3 build (1 of 5 picked)',
    seed: ALL_PLAYED,
    async reach(page) {
      await open(page, '#learn');
      await startLevel(page, 3);
      await pick(page, ['NVDA']);
    },
  },
  {
    id: 'learn L4 build (QQQ floor)',
    seed: ALL_PLAYED,
    async reach(page) {
      await open(page, '#learn');
      await startLevel(page, 4);
      await pick(page, ['BND', 'TLT', 'GLD']);
    },
  },
  {
    id: 'learn L5 build (4 holdings)',
    seed: ALL_PLAYED,
    async reach(page) {
      await open(page, '#learn');
      await startLevel(page, 5);
      await pick(page, ['VOO', 'BND', 'GLD', 'JNJ']);
    },
  },
  {
    id: 'learn L6 build (kind floor)',
    seed: ALL_PLAYED,
    async reach(page) {
      await open(page, '#learn');
      await startLevel(page, 6);
      await pick(page, ['WMT', 'PG', 'TLT', 'BND']);
    },
  },
  {
    id: 'learn L2 build (dealt from the pool)',
    seed: ALL_PLAYED,
    async reach(page) {
      await open(page, '#learn');
      await startLevel(page, 2);
    },
  },
  {
    id: 'learn L5 reveal (share of risk)',
    seed: ALL_PLAYED,
    async reach(page) {
      await open(page, '#learn');
      await startLevel(page, 5);
      await pick(page, ['NVDA', 'AMD', 'AVGO', 'BND']);
      await btn(page, 'Next: your guess').click();
      await slide(page, 0.9);
      await btn(page, 'Reveal the answer').click();
      await page.waitForTimeout(200);
    },
  },
  {
    id: 'sandbox build (3 holdings)',
    async reach(page) {
      await open(page, '#sandbox');
      await pick(page, ['NVDA', 'VOO', 'BND']);
    },
  },
  {
    id: 'sandbox build (7 holdings)',
    async reach(page) {
      await open(page, '#sandbox');
      await pick(page, ['NVDA', 'AMD', 'AVGO', 'MSFT', 'VOO', 'QQQ', 'BND']);
    },
  },
  {
    id: 'sandbox build (1 holding)',
    async reach(page) {
      await open(page, '#sandbox');
      await pick(page, ['VOO']);
    },
  },
  {
    id: 'sandbox measures (risk table)',
    async reach(page) {
      await open(page, '#sandbox');
      await pick(page, ['NVDA', 'AMD', 'AVGO', 'MSFT']);
      await btn(page, 'See what this portfolio does').click();
      await page.waitForTimeout(250);
    },
  },
  {
    id: 'sandbox measures (hedged, risk shares can go negative)',
    async reach(page) {
      await open(page, '#sandbox');
      await pick(page, ['QQQ', 'PG', 'KO', 'XOM', 'TLT']);
      await btn(page, 'See what this portfolio does').click();
      await page.waitForTimeout(250);
    },
  },
  {
    id: 'crash build (4 holdings)',
    async reach(page) {
      await open(page, '#crash');
      await btn(page, 'Replay this one').click();
      await page.waitForTimeout(150);
      await pick(page, ['VOO', 'TLT', 'WMT', 'GLD']);
    },
  },
  {
    id: 'crash build (3 holdings, thirds)',
    async reach(page) {
      await open(page, '#crash');
      await btn(page, 'Replay this one').click();
      await page.waitForTimeout(150);
      await pick(page, ['VOO', 'TLT', 'WMT']);
    },
  },
  {
    id: 'mine enter (cents, 4 holdings)',
    async reach(page) {
      await open(page, '#mine');
      await addHolding(page, 'VOO', '4212.50');
      await addHolding(page, 'NVDA', '1850.37');
      await addHolding(page, 'BND', '900');
      await addHolding(page, 'QQQ', '1100');
    },
  },
  {
    id: 'mine enter (three thirds)',
    async reach(page) {
      await open(page, '#mine');
      await addHolding(page, 'VOO', '3333');
      await addHolding(page, 'BND', '3333');
      await addHolding(page, 'GLD', '3334');
    },
  },
  {
    id: 'mine enter (seven sevenths)',
    async reach(page) {
      await open(page, '#mine');
      for (const t of ['VOO', 'QQQ', 'BND', 'GLD', 'TLT', 'NVDA', 'JNJ']) {
        await addHolding(page, t, '1000');
      }
    },
  },
  {
    id: 'mine measures (risk table)',
    async reach(page) {
      await open(page, '#mine');
      await addHolding(page, 'VOO', '3333');
      await addHolding(page, 'BND', '3333');
      await addHolding(page, 'GLD', '3334');
      await btn(page, 'See what this portfolio does').click();
      await page.waitForTimeout(250);
    },
  },
];

/** Read every percentage on the page, grouped by the class that renders it. */
async function readPercents(page) {
  return page.evaluate(() => {
    const parse = (text) => {
      const match = String(text).match(/(-?\d+(?:\.\d+)?)\s*%/);
      return match ? Number(match[1]) : null;
    };
    const groups = {};
    const collect = (label, selector) => {
      const values = [...document.querySelectorAll(selector)]
        .map((node) => parse(node.textContent))
        .filter((value) => value !== null);
      if (values.length > 0) groups[label] = values;
    };
    collect('build: alloc-share', '.alloc-share');
    collect('mine: holding-share (rows + total)', '.holding-share');
    collect('measures: share of money', '.shares-table tbody tr td:nth-child(2)');
    collect('measures: share of risk', '.shares-table tbody tr td:nth-child(3)');
    collect('reveal: the value', '.reveal-value');
    return groups;
  });
}

async function checkPercents(browser) {
  const rows = [];
  for (const singleCase of percentCases) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    if (singleCase.seed) await seedInto(context, singleCase.seed);
    const page = await context.newPage();
    try {
      await singleCase.reach(page);
      await page.waitForTimeout(120);
      rows.push({ id: singleCase.id, groups: await readPercents(page) });
    } catch (error) {
      rows.push({ id: singleCase.id, error: error.message.split('\n')[0] });
    }
    await context.close();
  }
  return rows;
}

// ------------------------------------------------------------------ report

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

// ------------------------------------------------ 3. the number line's labels
//
// THE SWEEP IS THE POINT. A label's box depends on how wide its text renders,
// which depends on the number in it, so "does anything overlap" has to be asked
// of many pairs rather than one. These are chosen to include every shape the
// geometry can take: the two marks on top of each other, a hair apart, at
// opposite ends, each one alone at an edge, and the case from the bug report.

const LINE_WIDTHS = [
  { id: '375px', width: 375 },
  { id: 'desktop 1280px', width: 1280 },
];

/** [guess, answer] on level 2's own 1-to-6 scale, plus why each one is here. */
const LINE_CASES = [
  { guess: 3.6, answer: 2.68, note: 'the bug report: "your guess 3.6" over its own marker' },
  { guess: 3.2, answer: 2.06, note: "the README's own screenshot" },
  { guess: 2.68, answer: 2.68, note: 'exactly equal - both marks at one point' },
  { guess: 2.7, answer: 2.68, note: 'a hair apart' },
  { guess: 1, answer: 6, note: 'opposite ends, both at an edge' },
  { guess: 6, answer: 1, note: 'opposite ends, reversed' },
  { guess: 1, answer: 1.1, note: 'both hard against the left edge' },
  { guess: 6, answer: 5.9, note: 'both hard against the right edge' },
  { guess: 1, answer: 3, note: 'guess at the left edge, answer at the threshold' },
  { guess: 5.9, answer: 3.02, note: 'long labels, mid-scale answer' },
  { guess: 3, answer: 3, note: 'both exactly on the threshold tick' },
  { guess: 2.9, answer: 3.1, note: 'straddling the threshold tick closely' },
];

/**
 * Render the number line for one pair and report every box in it.
 *
 * The LEVEL is the real level 2 out of levels.json and the formatting is
 * js/levels.js's own, so the only synthetic part is the pair of values - which
 * is the part that has to be swept.
 */
async function measureLine(page, { guess, answer }) {
  return page.evaluate(async ({ guess: g, answer: a }) => {
    const [{ revealLine, numberLine }, { validateLevels, formatGuess }] = await Promise.all([
      import('/js/game.js'),
      import('/js/levels.js'),
    ]);
    const levels = validateLevels(await (await fetch('/levels.json')).json());
    const level = levels.levels.find((l) => l.id === 2);

    const round = {
      level,
      guessRange: () => ({ min: level.guess.min, max: level.guess.max }),
      result: {
        guess: g,
        value: a,
        shown: formatGuess(level, a),
        passed: a >= (level.pass?.threshold ?? 0),
      },
    };
    const line = revealLine(round);
    if (!line) return { error: 'revealLine returned null' };

    const host = document.createElement('div');
    host.id = 'numberline-probe';
    // Inside #view so it inherits the same width and type as the real reveal.
    const view = document.getElementById('view');
    view.replaceChildren(host);
    host.append(numberLine(round, line));
    // Let fonts and layout settle before measuring.
    await document.fonts?.ready;

    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height };
    };
    const one = (sel) => {
      const el = host.querySelector(sel);
      return el ? { ...box(el), text: el.textContent.trim() } : null;
    };
    return {
      guessMark: one('.mark-guess'),
      answerMark: one('.mark-answer'),
      track: one('.numberline-track'),
      needTick: one('.numberline-need'),
      needLabel: one('.numberline-need span'),
      guessLabel: one('.mark-guess-label'),
      answerLabel: one('.mark-answer-label'),
      host: box(host),
    };
  }, { guess, answer });
}

/** Do two boxes share any actual area? Touching edges do not count. */
function overlaps(a, b) {
  if (!a || !b) return false;
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return x > 0.5 && y > 0.5;
}

/** Every pair a label must stay clear of, named for the report. */
function clashes(m) {
  const found = [];
  const labels = [['guess label', m.guessLabel], ['answer label', m.answerLabel]];
  const obstacles = [
    ['the guess marker', m.guessMark],
    ['the answer marker', m.answerMark],
    ['the line', m.track],
    ['the threshold tick', m.needTick],
    ['the "needed" label', m.needLabel],
  ];
  for (const [labelName, label] of labels) {
    for (const [obstacleName, obstacle] of obstacles) {
      if (overlaps(label, obstacle)) found.push(`${labelName} over ${obstacleName}`);
    }
  }
  if (overlaps(m.guessLabel, m.answerLabel)) found.push('the two labels over each other');
  // And nothing may run off the number line's own box, in either direction.
  for (const [labelName, label] of labels) {
    if (!label) continue;
    if (label.left < m.host.left - 0.5) found.push(`${labelName} off the left edge`);
    if (label.right > m.host.right + 0.5) found.push(`${labelName} off the right edge`);
  }
  return found;
}

async function checkNumberLine(browser) {
  const rows = [];
  for (const { id, width } of LINE_WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    try {
      await seedInto(context, ALL_PLAYED);
      await open(page, '#learn');
      for (const testCase of LINE_CASES) {
        try {
          const m = await measureLine(page, testCase);
          if (m.error) { rows.push({ width: id, ...testCase, error: m.error }); continue; }
          rows.push({ width: id, ...testCase, clashes: clashes(m), measured: m });
        } catch (error) {
          rows.push({ width: id, ...testCase, error: error.message.split('\n')[0] });
        }
      }
    } finally {
      await context.close();
    }
  }
  return rows;
}

async function main() {
  const server = await serve();
  const browser = await chromium.launch();
  let scroll;
  let percents;
  let numberline;
  try {
    scroll = await checkScroll(browser);
    percents = await checkPercents(browser);
    numberline = await checkNumberLine(browser);
  } finally {
    await browser.close();
    server.kill();
  }

  const out = [];
  out.push('## 1. The scroll jump');
  out.push('');
  out.push('Scrolled to the bottom, then clicked a control that redraws the same screen.');
  out.push('');
  out.push('| Screen and control | page height | scrollY before | after | jumped? | focus lands on |');
  out.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of scroll) {
    if (row.error) {
      out.push(`| ${row.id} | - | - | - | could not reach: ${row.error} | - |`);
      continue;
    }
    out.push(`| ${row.id} | ${row.height} | ${row.before} | ${row.after} | `
      + `${row.jumped ? '**YES**' : 'no'} | \`${row.focus}\` |`);
  }

  out.push('');
  out.push('## 2. Every percentage, read out of the DOM');
  out.push('');
  for (const row of percents) {
    if (row.error) {
      out.push(`### ${row.id}`, '', `could not reach: ${row.error}`, '');
      continue;
    }
    out.push(`### ${row.id}`, '');
    const names = Object.keys(row.groups);
    if (names.length === 0) {
      out.push('no percentages on this screen', '');
      continue;
    }
    for (const name of names) {
      const values = row.groups[name];
      const total = Math.round(sum(values) * 100) / 100;
      const flags = [];
      if (values.some((v) => v > 100)) flags.push('A VALUE OVER 100%');
      if (values.some((v) => v < 0)) flags.push('A NEGATIVE VALUE');
      out.push(`- **${name}**: ${values.map((v) => `${v}%`).join(' ')} `
        + `→ sums to ${total}%${flags.length ? `  ← ${flags.join(', ')}` : ''}`);
    }
    out.push('');
  }

  out.push('');
  out.push('## 3. The number line: does any label overlap anything?');
  out.push('');
  out.push('Every box read with getBoundingClientRect. A label may not share area with');
  out.push('either marker (its own included), the line, the threshold tick, the "needed"');
  out.push('label, or the other label - and may not run off the line\'s own box.');
  out.push('');
  out.push('| Width | guess | answer | result | what the case is for |');
  out.push('| --- | --- | --- | --- | --- |');
  let clean = 0;
  let dirty = 0;
  for (const row of numberline) {
    if (row.error) {
      out.push(`| ${row.width} | ${row.guess} | ${row.answer} | could not measure: ${row.error} | ${row.note} |`);
      dirty += 1;
      continue;
    }
    if (row.clashes.length === 0) {
      clean += 1;
      out.push(`| ${row.width} | ${row.guess} | ${row.answer} | clear | ${row.note} |`);
    } else {
      dirty += 1;
      out.push(`| ${row.width} | ${row.guess} | ${row.answer} | **${row.clashes.join('; ')}** | ${row.note} |`);
    }
  }
  out.push('');
  out.push(`**${clean} clear, ${dirty} with an overlap.**`);

  process.stdout.write(`${out.join('\n')}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});
