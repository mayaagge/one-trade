// scripts/dev_a11y.mjs - WCAG 2.2 AA, measured rather than eyeballed.
//
// A DEVELOPMENT TOOL. Not loaded by the site - tests/devTooling.test.js checks.
//
//   node scripts/dev_a11y.mjs [--scheme=light|dark] [--only=learn]
//
// WHY MEASURE INSTEAD OF LOOKING. Contrast is a ratio of computed colours and a
// tap target is a rectangle in CSS pixels. Both are things an eye guesses badly
// from a screenshot and a browser answers exactly. Every number below comes out
// of getComputedStyle and getBoundingClientRect on the real page, at 375px, in
// the scheme being tested.
//
// WHAT IT CHECKS, against docs/PRD.md's phone-first rule and WCAG 2.2 AA:
//   - sideways scrolling: scrollWidth against innerWidth, naming what overflows
//   - tap targets: every control's rectangle against 44x44 (2.5.8 asks 24x24;
//     docs/PRD.md and this review ask 44, which is the stricter bar)
//   - contrast: 4.5:1 for text under 24px/18.66px bold, 3:1 for large text, and
//     3:1 for a control's own boundary
//   - real elements: headings in order, an input with no visible label, a
//     canvas or chart with no text alternative, a control that is not a button
//   - aria-live, where a reveal replaces a number without moving focus
//
// Educational, not investment advice.

import { chromium } from 'playwright';

import { VIEWPORT, blockStorageIn, seedInto, serve } from './dev_browser.mjs';
import { scenes } from './dev_scenes.mjs';

/** The page-side audit. Runs inside the browser, so it can read computed style. */
const AUDIT = () => {
  // --- colour -----------------------------------------------------------
  const parse = (value) => {
    const nums = String(value).match(/[\d.]+/g);
    if (!nums) return null;
    const [r, g, b, a = '1'] = nums.map(Number);
    return { r, g, b, a: a === undefined ? 1 : a };
  };
  const luminance = ({ r, g, b }) => {
    const channel = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const over = (front, back) => ({
    r: front.r * front.a + back.r * (1 - front.a),
    g: front.g * front.a + back.g * (1 - front.a),
    b: front.b * front.a + back.b * (1 - front.a),
    a: 1,
  });
  const ratio = (one, two) => {
    const a = luminance(one);
    const b = luminance(two);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  /** What is actually behind a node, following ancestors through transparency. */
  const backdropOf = (node) => {
    let at = node;
    let colour = { r: 255, g: 255, b: 255, a: 1 };
    const stack = [];
    while (at && at !== document.documentElement.parentNode) {
      const bg = parse(getComputedStyle(at).backgroundColor);
      if (bg && bg.a > 0) stack.push(bg);
      if (bg && bg.a === 1) { colour = bg; break; }
      at = at.parentElement;
    }
    for (const layer of stack.reverse()) colour = over(layer, colour);
    return colour;
  };

  /**
   * The opacity actually applied to a node, ancestors included.
   *
   * THIS STYLESHEET DIMS TEXT WITH `opacity`, not with a colour: .daily-count,
   * .daily-window and .daily-square-text all sit at 0.7 to 0.8. getComputedStyle
   * reports their `color` undimmed, so a contrast check that read `color` alone
   * would report a ratio the screen does not actually show. Folding opacity into
   * the text colour's alpha is what makes the numbers below true.
   */
  const opacityOf = (node) => {
    let total = 1;
    let at = node;
    while (at && at.nodeType === 1) {
      const value = parseFloat(getComputedStyle(at).opacity);
      if (Number.isFinite(value)) total *= value;
      at = at.parentElement;
    }
    return total;
  };

  const visible = (node) => {
    const style = getComputedStyle(node);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };

  const describe = (node) => {
    const classes = String(node.className || '').split(' ').filter(Boolean).slice(0, 2).join('.');
    return `${node.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
  };
  const snippet = (node) => (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 42);

  const report = {
    overflow: null,
    small: [],
    contrast: [],
    headings: [],
    inputs: [],
    charts: [],
    live: [],
    notButtons: [],
  };

  // --- sideways scrolling ----------------------------------------------
  const doc = document.documentElement;
  if (doc.scrollWidth > window.innerWidth + 1) {
    report.overflow = {
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      by: [...document.querySelectorAll('body *')]
        .filter((n) => visible(n) && n.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 4)
        .map(describe),
    };
  }

  // --- tap targets ------------------------------------------------------
  // REAL, ENABLED CONTROLS ONLY. WCAG exempts a disabled control from both the
  // contrast rules and the target-size rule, and a disabled Play button on a
  // locked level would otherwise be reported as the worst contrast on the menu
  // - which is correct arithmetic about something that is not a defect.
  // tabindex="-1" is excluded too: <main> and the chart's scroller are made
  // focusable so a script or a skip link can move to them, not tapped.
  const controls = [...document.querySelectorAll('button, a[href], input, select, textarea')]
    .filter((node) => visible(node) && !node.disabled && node.getAttribute('tabindex') !== '-1');
  for (const node of controls) {
    const box = node.getBoundingClientRect();
    const width = Math.round(box.width);
    const height = Math.round(box.height);
    if (width < 44 || height < 44) {
      report.small.push({ what: describe(node), text: snippet(node), width, height });
    }
  }

  // --- contrast ---------------------------------------------------------
  const textNodes = [...document.querySelectorAll('body *')].filter((node) => {
    if (!visible(node)) return false;
    // Only nodes with their own text, so a wrapper is not measured twice.
    return [...node.childNodes].some((kid) => kid.nodeType === 3 && kid.textContent.trim().length > 0);
  });
  for (const node of textNodes) {
    if (node.closest('button:disabled, input:disabled, select:disabled, textarea:disabled')) continue;
    const style = getComputedStyle(node);
    const colour = parse(style.color);
    if (!colour) continue;
    const back = backdropOf(node);
    const dimmed = { ...colour, a: colour.a * opacityOf(node) };
    const front = dimmed.a < 1 ? over(dimmed, back) : dimmed;
    const size = parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const got = ratio(front, back);
    if (got < need) {
      report.contrast.push({
        what: describe(node),
        text: snippet(node),
        colour: opacityOf(node) < 1
          ? `${style.color} at opacity ${Math.round(opacityOf(node) * 100) / 100}`
          : style.color,
        behind: `rgb(${Math.round(back.r)}, ${Math.round(back.g)}, ${Math.round(back.b)})`,
        size: Math.round(size * 10) / 10,
        need,
        got: Math.round(got * 100) / 100,
      });
    }
  }

  // --- a control's own boundary, 3:1 ------------------------------------
  for (const node of controls) {
    // NOT A RANGE INPUT. Its affordance is the track and thumb the browser draws
    // from accent-color, and neither is reachable from getComputedStyle: the
    // "background" of the element is a colour nobody sees, so measuring it
    // reported 1.07:1 for a slider whose thumb is actually at 8.5:1.
    if (node.tagName === 'INPUT' && node.getAttribute('type') === 'range') continue;
    const style = getComputedStyle(node);
    const border = parse(style.borderTopColor);
    const width = parseFloat(style.borderTopWidth);
    const fill = parse(style.backgroundColor);
    const around = backdropOf(node.parentElement ?? document.body);
    const edges = [];
    if (border && width > 0 && border.a > 0) edges.push(ratio(over(border, around), around));
    if (fill && fill.a > 0) edges.push(ratio(over(fill, around), around));
    if (edges.length > 0 && Math.max(...edges) < 3) {
      report.contrast.push({
        what: `${describe(node)} (its own edge)`,
        text: '',
        colour: style.borderTopColor,
        behind: `rgb(${Math.round(around.r)}, ${Math.round(around.g)}, ${Math.round(around.b)})`,
        size: null,
        need: 3,
        got: Math.round(Math.max(...edges) * 100) / 100,
      });
    }
  }

  // --- headings in order -------------------------------------------------
  let last = 0;
  for (const node of [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(visible)) {
    const level = Number(node.tagName[1]);
    if (last !== 0 && level > last + 1) {
      report.headings.push({ from: `h${last}`, to: `h${level}`, text: snippet(node) });
    }
    last = level;
  }

  // --- inputs with no visible label --------------------------------------
  for (const node of [...document.querySelectorAll('input, select, textarea')].filter(visible)) {
    const id = node.getAttribute('id');
    const labelled = (id && document.querySelector(`label[for="${id}"]`))
      || node.closest('label');
    if (!labelled) {
      report.inputs.push({
        what: describe(node),
        type: node.getAttribute('type') ?? 'text',
        ariaLabel: node.getAttribute('aria-label'),
      });
    }
  }

  // --- charts and cards with no words -------------------------------------
  for (const node of [...document.querySelectorAll('canvas, svg')].filter(visible)) {
    const described = node.getAttribute('aria-label')
      || node.getAttribute('role')
      || (node.getAttribute('aria-describedby') && 'describedby')
      || node.querySelector('title, desc')
      || node.getAttribute('alt');
    if (!described) report.charts.push({ what: describe(node) });
  }
  for (const node of [...document.querySelectorAll('img')].filter(visible)) {
    if (node.getAttribute('alt') === null) report.charts.push({ what: `${describe(node)} (no alt)` });
  }

  // --- anything announced ---------------------------------------------
  report.live = [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')]
    .map((node) => `${describe(node)}[${node.getAttribute('aria-live') ?? node.getAttribute('role')}]`);

  // --- a control that is not a real element -------------------------------
  for (const node of [...document.querySelectorAll('[onclick], div[tabindex], span[tabindex]')]) {
    report.notButtons.push(describe(node));
  }

  report.lang = document.documentElement.getAttribute('lang');
  report.title = document.title;
  return report;
};

async function main() {
  const argv = process.argv.slice(2);
  const only = argv.find((a) => a.startsWith('--only='))?.slice(7) ?? null;
  const scheme = argv.find((a) => a.startsWith('--scheme='))?.slice(9) ?? 'light';
  const chosen = only ? scenes.filter((s) => s.id.startsWith(only)) : scenes;

  const server = await serve();
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const scene of chosen) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
        colorScheme: scheme,
        // MOTION OFF, for two reasons. An audit has to measure the SETTLED
        // screen: with animation on, the reveal's gap sentence was caught
        // part-way through its 520ms fade and reported at 1.16:1, which looks
        // exactly like a contrast failure and is not one. And measuring the
        // reduced-motion path is itself worth doing - it is the path that has to
        // be complete and readable with nothing moving.
        reducedMotion: 'reduce',
      });
      if (scene.blockStorage) await blockStorageIn(context);
      if (scene.seed) await seedInto(context, scene.seed);
      const page = await context.newPage();
      try {
        await scene.run(page);
        await page.waitForTimeout(150);
        results.push({ id: scene.id, report: await page.evaluate(AUDIT) });
      } catch (error) {
        results.push({ id: scene.id, error: error.message.split('\n')[0] });
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }

  // ---- rolled up, because the same control fails on 40 screens ----------
  const smallest = new Map();
  const worstContrast = new Map();
  const overflowing = [];
  const headingJumps = new Map();
  const unlabelled = new Map();
  const chartless = new Map();
  const liveOn = [];
  const failed = [];

  for (const { id, report, error } of results) {
    if (error) { failed.push(`${id}: ${error}`); continue; }
    if (report.overflow) overflowing.push({ id, ...report.overflow });
    for (const row of report.small) {
      const key = `${row.what} "${row.text}"`;
      const before = smallest.get(key);
      if (!before || row.width * row.height < before.width * before.height) {
        smallest.set(key, { ...row, on: id, count: (before?.count ?? 0) + 1 });
      } else { before.count += 1; }
    }
    for (const row of report.contrast) {
      const key = `${row.what} "${row.text}"`;
      const before = worstContrast.get(key);
      if (!before || row.got < before.got) worstContrast.set(key, { ...row, on: id });
    }
    for (const row of report.headings) {
      headingJumps.set(`${row.from} to ${row.to} at "${row.text}"`, id);
    }
    for (const row of report.inputs) {
      unlabelled.set(`${row.what} type=${row.type} aria-label=${JSON.stringify(row.ariaLabel)}`, id);
    }
    for (const row of report.charts) chartless.set(row.what, id);
    if (report.live.length > 0) liveOn.push(`${id}: ${report.live.join(', ')}`);
  }

  const out = [];
  out.push(`# Accessibility, measured — ${scheme} mode, ${VIEWPORT.width}px`, '');
  out.push(`${results.length - failed.length} of ${chosen.length} screens measured.`, '');
  if (failed.length) out.push('Could not reach:', ...failed.map((f) => `- ${f}`), '');

  out.push(`## Sideways scrolling — ${overflowing.length} of ${results.length} screens`, '');
  if (overflowing.length === 0) out.push('None.', '');
  else {
    const sample = overflowing[0];
    out.push(`Every one of them the same: scrollWidth ${sample.scrollWidth} against an innerWidth of `
      + `${sample.innerWidth}. Past the edge: ${sample.by.join(', ')}.`, '');
  }

  out.push('## Tap targets under 44x44', '');
  out.push('| Control | smallest seen | screens | example screen |');
  out.push('| --- | --- | --- | --- |');
  for (const [key, row] of [...smallest].sort((a, b) =>
    a[1].width * a[1].height - b[1].width * b[1].height)) {
    out.push(`| ${key} | ${row.width} x ${row.height} | ${row.count} | \`${row.on}\` |`);
  }
  out.push('');

  out.push('## Contrast below the bar', '');
  out.push('| What | text | colour on backdrop | size | needs | has | screen |');
  out.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const [, row] of [...worstContrast].sort((a, b) => a[1].got - b[1].got)) {
    out.push(`| ${row.what} | ${row.text} | ${row.colour} on ${row.behind} | `
      + `${row.size ?? '-'} | ${row.need}:1 | **${row.got}:1** | \`${row.on}\` |`);
  }
  out.push('');

  out.push('## Headings out of order', '');
  if (headingJumps.size === 0) out.push('None.', '');
  else for (const [key, id] of headingJumps) out.push(`- ${key} (\`${id}\`)`);
  out.push('');

  out.push('## Inputs with no visible <label>', '');
  if (unlabelled.size === 0) out.push('None.', '');
  else for (const [key, id] of unlabelled) out.push(`- ${key} (\`${id}\`)`);
  out.push('');

  out.push('## Charts, canvases and images with no text alternative', '');
  if (chartless.size === 0) out.push('None.', '');
  else for (const [key, id] of chartless) out.push(`- ${key} (\`${id}\`)`);
  out.push('');

  out.push('## Anything announced to a screen reader (aria-live, role=status/alert)', '');
  out.push(liveOn.length === 0
    ? 'Nothing, on any screen.'
    : liveOn.map((l) => `- ${l}`).join('\n'));
  out.push('');

  const first = results.find((r) => r.report);
  out.push('## The document itself', '');
  out.push(`- \`lang\`: ${JSON.stringify(first?.report?.lang)}`);
  out.push(`- \`title\`: ${JSON.stringify(first?.report?.title)}`);

  process.stdout.write(`${out.join('\n')}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});
