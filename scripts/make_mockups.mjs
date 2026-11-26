// scripts/make_mockups.mjs - writes the three visual directions to design/.
//
// A DEVELOPMENT TOOL, like the rest of scripts/. The files it writes are
// standalone: they load no script, no web font and nothing from the site, so
// opening one cannot change or break the game. index.html does not know they
// exist.
//
//   node scripts/make_mockups.mjs
//
// WHY A GENERATOR AND NOT THREE HAND-WRITTEN PAGES. The three directions have
// to be compared, which means the only thing allowed to differ between them is
// the design: the same screens, the same words, the same numbers, the same
// markup. One template with three variable sets is the only way to be sure of
// that - three hand-written files would differ in a dozen accidental ways and
// the comparison would be measuring my typing.
//
// EVERY WORD AND NUMBER IS THE ONE ON THE SCREEN TODAY, taken from the level 3
// screenshots, because the brief is to restyle without changing any wording,
// number or rule. The build step is drawn with the sliders decided for this
// round, since the chosen look will be applied to that build screen and not to
// the one with the +/- buttons.
//
// EVERY COLOUR PAIR BELOW WAS CHECKED. The ratios in each direction's spec panel
// are computed here, not asserted - see contrast().
//
// Educational, not investment advice.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'design');

// ------------------------------------------------------------- contrast

const hex = (value) => {
  const n = parseInt(value.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const luminance = ({ r, g, b }) => {
  const channel = (x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
function contrast(one, two) {
  const a = luminance(hex(one));
  const b = luminance(hex(two));
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}

// --------------------------------------------------------- the directions

const directions = [
  {
    key: 'a',
    name: 'A — Notebook',
    idea: 'A lab notebook: hairlines, no shadows, one ink and one blue. '
      + 'Credible first, friendly second. The reveal shows the guess and the answer '
      + 'side by side, because the lesson is the gap between them.',
    font: 'None. system-ui everywhere, which is the font the reader already '
      + 'reads in and the only one that costs nothing to load.',
    spacing: '8px scale (8/16/24/32). Hairline 1px borders, 6px radius, no shadow. '
      + 'Cards sit on the plane with a rule, not a lift.',
    reveal: 'The guess and the answer stand in two labelled columns with the gap '
      + 'named between them. The answer counts from the guess to the true number '
      + 'over 450ms, so the eye travels the distance it got wrong.',
    light: {
      plane: '#f7f7f6', surface: '#ffffff', ink: '#16181d', quiet: '#5c5f66',
      edge: '#767b85', hair: '#dcdee3', accent: '#1a4fb0', onAccent: '#ffffff',
      primary: '#1a4fb0', onPrimary: '#ffffff',
      clears: '#0f5c4a', misses: '#8a3a12', ghost: '#e8eaee',
    },
    dark: {
      plane: '#0c0d0f', surface: '#15171a', ink: '#eef0f3', quiet: '#a8adb6',
      edge: '#6b7078', hair: '#2a2d33', accent: '#7fb3ff', onAccent: '#0c0d0f',
      primary: '#7fb3ff', onPrimary: '#0c0d0f',
      clears: '#5fd4b4', misses: '#ffa94d', ghost: '#23262b',
    },
    radius: '6px', cardLift: 'none', numberFont: 'var(--sans)', numberWeight: '700',
    numberSize: '3rem', headSize: '1.5rem', letter: '0',
  },
  {
    key: 'b',
    name: 'B — Number line',
    idea: 'Quiet while building, then the reveal becomes a number line: the guess '
      + 'is a hollow marker, the answer slides in and lands as a solid one. The '
      + 'distance between them is the whole lesson, drawn to scale.',
    font: 'One, self-hosted: Inter. Approximated here by the system sans so this '
      + 'file loads nothing; ship it as two woff2 files (400, 700) from the repo.',
    spacing: '4px scale (4/8/12/16/24). 12px radius, one soft shadow on the card '
      + 'that holds the answer and nowhere else, so the reveal is the only thing '
      + 'that lifts off the page.',
    reveal: 'A scale from the level\'s own minimum to its maximum. The guess is '
      + 'marked first, the answer slides along and stops, and the span between '
      + 'them fills in. The number grows from 0.9 to 1 as it lands.',
    light: {
      plane: '#f4f6f8', surface: '#ffffff', ink: '#14171c', quiet: '#5c5f66',
      edge: '#767b85', hair: '#dde1e7', accent: '#1d4ed8', onAccent: '#ffffff',
      primary: '#1d4ed8', onPrimary: '#ffffff',
      clears: '#0f5c4a', misses: '#8a3a12', ghost: '#e4e9f2',
    },
    dark: {
      plane: '#0c0e12', surface: '#161920', ink: '#eef1f6', quiet: '#a8adb6',
      edge: '#6b7078', hair: '#272b33', accent: '#8fc0ff', onAccent: '#0c0e12',
      primary: '#8fc0ff', onPrimary: '#0c0e12',
      clears: '#5fd4b4', misses: '#ffa94d', ghost: '#1f242d',
    },
    radius: '12px', cardLift: '0 1px 2px rgba(10, 14, 20, 0.08), 0 8px 24px rgba(10, 14, 20, 0.06)',
    numberFont: 'var(--sans)', numberWeight: '700', numberSize: '3.4rem',
    headSize: '1.5rem', letter: '-0.01em',
  },
  {
    key: 'c',
    name: 'C — Editorial',
    idea: 'Cream paper and a serif for the numbers only. Reads like a well-set '
      + 'textbook rather than a trading app, which is the look that survives being '
      + 'put on a projector in a seminar room.',
    font: 'One, self-hosted: Source Serif 4, used for the big numbers and nothing '
      + 'else. Approximated here by Iowan Old Style / Charter / Georgia, which are '
      + 'already on a Mac. Body text stays system sans.',
    spacing: '8px scale with wider gutters (20px side margins), 1.6 line height, '
      + '2px rules instead of boxes. Fewer containers: the page is sections '
      + 'separated by rules, not a stack of cards.',
    reveal: 'The answer arrives alone on a full-width band, large and set in the '
      + 'serif, rising 8px and fading in over 300ms. The guess is written small '
      + 'beneath it, so the comparison is read rather than animated.',
    light: {
      plane: '#faf7f2', surface: '#fffdf9', ink: '#1a1714', quiet: '#5e574e',
      edge: '#7a7168', hair: '#e2dbd0', accent: '#7c2d12', onAccent: '#fffdf9',
      primary: '#1a1714', onPrimary: '#fffdf9',
      clears: '#0f5c4a', misses: '#8a3a12', ghost: '#ece5d9',
    },
    dark: {
      plane: '#100e0c', surface: '#1a1714', ink: '#f2ede5', quiet: '#b0a89c',
      edge: '#7a7168', hair: '#2e2922', accent: '#ffb86b', onAccent: '#100e0c',
      primary: '#f2ede5', onPrimary: '#100e0c',
      clears: '#5fd4b4', misses: '#ff9a52', ghost: '#262119',
    },
    colourNote: 'Rust means "it missed" and nothing else; the primary button is '
      + 'ink on cream, so no colour carries two meanings.',
    radius: '2px', cardLift: 'none',
    numberFont: '"Iowan Old Style", "Charter", Georgia, serif',
    numberWeight: '600', numberSize: '3.6rem', headSize: '1.6rem', letter: '0',
  },
];

// ------------------------------------------------------------ the markup
//
// THE SAME WORDS AND NUMBERS IN ALL THREE. Level 3, five holdings at $2,000 each,
// 2.06 effective bets against a guess of 3.2 - exactly what the live screens say.

const CHIPS = [
  ['AI stocks', ['NVDA', 'AMD', 'AVGO', 'MRVL', 'MU']],
  ['Health care', ['JNJ', 'UNH', 'ABBV']],
  ['Bonds and gold', ['BND', 'GLD', 'TLT', 'LQD']],
  ['Core US funds', ['VOO', 'VTI', 'QQQ']],
];
const HELD = new Set(['NVDA', 'JNJ', 'BND', 'GLD', 'VOO']);
const ROWS = [['NVDA', 2000], ['VOO', 2000], ['BND', 2000], ['GLD', 2000], ['JNJ', 2000]];

function buildScreen() {
  const groups = CHIPS.map(([label, names]) => `
        <section class="picker-group">
          <h3 class="picker-group-label">${label}</h3>
          <div class="picker-row">
            ${names.map((n) => `<button type="button" class="chip${HELD.has(n) ? ' chip-on' : ''}" aria-pressed="${HELD.has(n)}">${n}</button>`).join('\n            ')}
          </div>
        </section>`).join('');

  const rows = ROWS.map(([ticker, dollars], i) => `
        <div class="alloc-row">
          <label class="alloc-label" for="s${i}">${ticker}</label>
          <output class="alloc-amount" for="s${i}"><strong>$${dollars.toLocaleString('en-US')}</strong><span class="alloc-share">20%</span></output>
          <input class="alloc-slider" id="s${i}" type="range" min="100" max="9600" step="100" value="${dollars}">
          <div class="alloc-fine">
            <button type="button" class="btn btn-step" aria-label="Take $100 off ${ticker}">&minus;</button>
            <button type="button" class="btn btn-step" aria-label="Add $100 to ${ticker}">+</button>
          </div>
        </div>`).join('');

  return `
    <div class="view view-round">
      <header class="round-head">
        <p class="round-step">Level 3 &middot; Build</p>
        <h1>Three real bets</h1>
      </header>
      <p class="lede">Build a 5-holding portfolio that makes at least 3 separate bets.</p>
      <p class="picker-count">5 of 5 picked</p>
      <h2 class="section-head">Pick your holdings</h2>
      ${groups}
      <h2 class="section-head">Split your $10,000</h2>
      <p class="money-left">Money left: <strong>$0</strong></p>
      <button type="button" class="btn btn-quiet btn-even">Even split</button>
      ${rows}
      <p class="note">Moves in $100 steps, always adding up to $10,000. It starts split evenly.</p>
      <button type="button" class="btn btn-primary btn-wide">Next: your guess</button>
      <button type="button" class="btn btn-quiet btn-wide">Back to the levels</button>
      <div class="game-foot">
        <p class="live-chip">Live prices through 25 Nov 2026</p>
        <p class="disclaimer-inline">Educational, not investment advice.</p>
      </div>
    </div>`;
}

/** The reveal, which is the one thing the three directions really differ on. */
function revealScreen(direction) {
  const common = `
      <header class="round-head">
        <p class="round-step">Level 3 &middot; Reveal</p>
        <h1>Three real bets</h1>
      </header>`;

  const why = `
      <section class="why-card">
        <h2 class="why-head">Why?</h2>
        <p class="why-lead">Here's what held you back:</p>
        <p class="why-body">NVDA is 20% of your money but 62% of your risk. Share of
          risk is not share of dollars: a holding that swings harder than the rest
          carries more of the risk than its size suggests.</p>
      </section>
      <p class="note holdings-line">NVDA $2,000 &middot; VOO $2,000 &middot; BND $2,000 &middot; GLD $2,000 &middot; JNJ $2,000</p>
      <p class="note">Measured over 756 trading days, 21 Nov 2023 to 25 Nov 2026.</p>
      <button type="button" class="btn btn-primary btn-wide">Next: level 4</button>
      <button type="button" class="btn btn-quiet btn-wide">Play this level again</button>
      <div class="game-foot">
        <p class="live-chip">Live prices through 25 Nov 2026</p>
        <p class="disclaimer-inline">Educational, not investment advice.</p>
      </div>`;

  const stars = `
      <p class="stars" role="img" aria-label="No stars this time">
        <span class="star star-off">&#9733;</span><span class="star star-off">&#9733;</span><span class="star star-off">&#9733;</span>
      </p>
      <p class="stars-note">No stars this time: at least 3 effective bets is what this
        level needs. The guess still counts &mdash; look at the number above.</p>`;

  if (direction.key === 'a') {
    return `
    <div class="view view-round view-reveal">${common}
      <section class="reveal-panel" aria-live="polite">
        <div class="two-up">
          <div class="two-up-cell">
            <p class="cell-label">You guessed</p>
            <p class="cell-value cell-guess js-guess">3.2</p>
          </div>
          <div class="two-up-gap" aria-hidden="true">
            <span class="gap-bar"></span>
            <span class="gap-words">out by 1.14</span>
          </div>
          <div class="two-up-cell">
            <p class="cell-label">Separate bets this portfolio really makes</p>
            <p class="cell-value cell-answer js-count" data-from="3.2" data-to="2.06">2.06</p>
          </div>
        </div>
        <p class="verdict verdict-miss">2.06 misses the 3.00 needed</p>
      </section>
      ${stars}${why}
    </div>`;
  }

  if (direction.key === 'b') {
    return `
    <div class="view view-round view-reveal">${common}
      <section class="reveal-panel reveal-lift" aria-live="polite">
        <p class="cell-label">Separate bets this portfolio really makes</p>
        <p class="cell-value cell-answer js-pop">2.06</p>
        <div class="numberline" aria-hidden="true">
          <span class="numberline-track"></span>
          <span class="numberline-span js-span"></span>
          <span class="numberline-mark mark-guess" style="left: 55%"><span>your guess 3.2</span></span>
          <span class="numberline-mark mark-answer js-slide" style="left: 26.5%"><span>2.06</span></span>
          <span class="numberline-need" style="left: 50%"><span>3.00 needed</span></span>
        </div>
        <p class="numberline-ends" aria-hidden="true"><span>1.0</span><span>5.0</span></p>
        <p class="verdict verdict-miss">2.06 misses the 3.00 needed</p>
      </section>
      ${stars}${why}
    </div>`;
  }

  return `
    <div class="view view-round view-reveal">${common}
      <section class="reveal-band" aria-live="polite">
        <p class="cell-label">Separate bets this portfolio really makes</p>
        <p class="cell-value cell-answer js-rise">2.06</p>
        <p class="cell-under">You guessed 3.2</p>
      </section>
      <p class="verdict verdict-miss">2.06 misses the 3.00 needed</p>
      ${stars}${why}
    </div>`;
}

// --------------------------------------------------------------- the CSS

function variables(scheme) {
  return Object.entries(scheme).map(([name, value]) => `    --${name}: ${value};`).join('\n');
}

function css(direction) {
  return `
  :root {
    color-scheme: light;
${variables(direction.light)}
    --sans: system-ui, -apple-system, "Segoe UI", sans-serif;
    --radius: ${direction.radius};
    --lift: ${direction.cardLift};
    --number-font: ${direction.numberFont};
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
${variables(direction.dark)}
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: var(--sans); font-size: 1rem; line-height: 1.55;
    color: var(--ink); background: var(--plane);
  }
  /* ---- the page that shows the mockups, not part of the direction ---- */
  .sheet { max-width: 60rem; margin: 0 auto; padding: 24px 16px 64px; }
  .sheet h1.title { font-size: 1.6rem; margin: 0 0 4px; }
  .sheet .sub { color: var(--quiet); margin: 0 0 24px; }
  .spec { border: 1px solid var(--hair); border-radius: var(--radius);
    background: var(--surface); padding: 16px; margin: 0 0 24px; }
  .spec dt { font-weight: 700; margin-top: 12px; }
  .spec dt:first-child { margin-top: 0; }
  .spec dd { margin: 2px 0 0; color: var(--quiet); }
  .swatches { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0; padding: 0; list-style: none; }
  .swatches li { font-size: 0.75rem; color: var(--quiet); text-align: center; }
  .swatch { display: block; width: 56px; height: 32px; border-radius: 4px;
    border: 1px solid var(--hair); margin-bottom: 2px; }
  .frames { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
  .frame-wrap { }
  .frame-label { font-size: 0.8rem; color: var(--quiet); margin: 0 0 6px;
    text-transform: uppercase; letter-spacing: 0.06em; }
  .frame { width: 375px; border: 1px solid var(--edge); border-radius: 18px;
    overflow: hidden; background: var(--plane); }
  .replay { margin: 16px 0 0; }

  /* ---- the direction itself ---- */
  .view { padding: 20px 16px 24px; }
  .round-head { margin-bottom: 12px; }
  .round-step { margin: 0 0 2px; font-size: 0.8rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--quiet); }
  h1 { font-size: ${direction.headSize}; line-height: 1.2; margin: 0;
    letter-spacing: ${direction.letter}; }
  .lede { margin: 0 0 16px; }
  .section-head { font-size: 0.95rem; margin: 24px 0 8px; }
  .picker-count { color: var(--quiet); font-size: 0.9rem; margin: 0 0 8px; }
  .picker-group { margin: 0 0 12px; }
  .picker-group-label { font-size: 0.78rem; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--quiet); margin: 0 0 6px; }
  .picker-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { min-height: 44px; min-width: 44px; padding: 10px 14px; font: inherit;
    border: 1px solid var(--edge); border-radius: 999px; background: var(--surface);
    color: var(--ink); cursor: pointer; }
  .chip-on { background: var(--accent); border-color: var(--accent); color: var(--onAccent); font-weight: 700; }
  .money-left { margin: 0 0 8px; color: var(--quiet); }
  .money-left strong { color: var(--ink); }
  .btn { min-height: 44px; font: inherit; border-radius: var(--radius); cursor: pointer;
    border: 1px solid var(--edge); background: var(--surface); color: var(--ink); padding: 10px 16px; }
  /* THE BUTTON FILL IS ITS OWN VARIABLE, not the accent. In direction C the
     accent is a rust that also means "it missed", and a button in that colour
     would make one colour mean both "do this" and "you got it wrong". */
  .btn-primary { background: var(--primary); border-color: var(--primary);
    color: var(--onPrimary); font-weight: 700; }
  .btn-wide { display: block; width: 100%; margin-top: 12px; }
  .btn-even { margin: 0 0 16px; }
  .btn-step { min-width: 44px; padding: 10px; font-size: 1.1rem; }
  .alloc-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px;
    align-items: center; padding: 12px 0; border-top: 1px solid var(--hair); }
  .alloc-label { font-weight: 700; }
  .alloc-amount { text-align: right; }
  .alloc-amount .alloc-share { color: var(--quiet); font-size: 0.85rem; margin-left: 6px; }
  .alloc-slider { grid-column: 1 / -1; width: 100%; min-height: 44px; accent-color: var(--accent); }
  .alloc-fine { grid-column: 1 / -1; display: flex; gap: 8px; }
  .note { font-size: 0.85rem; color: var(--quiet); margin: 8px 0; }
  .game-foot { margin-top: 20px; padding-top: 12px; border-top: 1px solid var(--hair); }
  .live-chip, .disclaimer-inline { margin: 0; font-size: 0.8rem; color: var(--quiet); }
  .disclaimer-inline { font-weight: 700; color: var(--ink); margin-top: 2px; }

  /* ---- the reveal ---- */
  .cell-label { margin: 0 0 4px; font-size: 0.85rem; color: var(--quiet); }
  .cell-value { margin: 0; font-family: var(--number-font);
    font-weight: ${direction.numberWeight}; font-size: ${direction.numberSize};
    line-height: 1.05; letter-spacing: ${direction.letter}; }
  .cell-guess { color: var(--quiet); font-size: 2rem; }
  .verdict { font-weight: 700; margin: 12px 0 0; }
  .verdict-miss { color: var(--misses); }
  .verdict-pass { color: var(--clears); }
  .stars { margin: 16px 0 4px; font-size: 1.6rem; letter-spacing: 6px; }
  .star-off { color: var(--ghost); }
  .star-on { color: var(--accent); }
  .stars-note { font-size: 0.9rem; color: var(--quiet); margin: 0 0 16px; }
  .why-card { border-left: 4px solid var(--accent); background: var(--surface);
    padding: 12px 14px; border-radius: 0 var(--radius) var(--radius) 0; margin: 0 0 16px; }
  .why-head { font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--quiet); margin: 0 0 6px; }
  .why-lead { font-weight: 700; margin: 0 0 6px; }
  .why-body { margin: 0; }
  .holdings-line { word-spacing: 0.1em; }

  .reveal-panel { background: var(--surface); border: 1px solid var(--hair);
    border-radius: var(--radius); padding: 16px; }
  .reveal-lift { box-shadow: var(--lift); }

  /* A: two columns, the gap named between them */
  .two-up { display: grid; grid-template-columns: 1fr; gap: 10px; }
  .two-up-gap { display: flex; align-items: center; gap: 8px; }
  .gap-bar { flex: 1; height: 2px; background: var(--accent); }
  .gap-words { font-size: 0.8rem; color: var(--quiet); white-space: nowrap; }

  /* B: the number line */
  .numberline { position: relative; height: 84px; margin: 24px 0 0; }
  .numberline-track { position: absolute; left: 0; right: 0; top: 30px; height: 3px;
    background: var(--ghost); border-radius: 2px; }
  .numberline-span { position: absolute; top: 30px; height: 3px; background: var(--misses);
    left: 26.5%; width: 28.5%; }
  .numberline-mark { position: absolute; top: 22px; transform: translateX(-50%); }
  .numberline-mark span { position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
    font-size: 0.75rem; color: var(--quiet); white-space: nowrap; }
  .mark-guess::before { content: ""; display: block; width: 18px; height: 18px;
    border-radius: 50%; border: 3px solid var(--quiet); background: var(--surface); }
  .mark-answer::before { content: ""; display: block; width: 18px; height: 18px;
    border-radius: 50%; background: var(--accent); }
  .mark-answer span { color: var(--accent); font-weight: 700; top: 22px; }
  /* THE GUESS LABEL SITS TO THE RIGHT OF ITS DOT, not under it. The guess at 3.2
     and the 3.00 the level needs are only 5% of the scale apart, so two centred
     labels overlap - which is exactly the pair a player most needs to read. */
  .mark-guess span { left: auto; right: -8px; transform: none; top: 24px; }
  .numberline-need { position: absolute; top: 14px; transform: translateX(-50%); }
  .numberline-need::before { content: ""; display: block; width: 2px; height: 34px;
    background: var(--edge); margin: 0 auto; }
  .numberline-need span { position: absolute; top: -18px; left: 50%; transform: translateX(-50%);
    font-size: 0.72rem; color: var(--quiet); white-space: nowrap; }
  .numberline-ends { display: flex; justify-content: space-between; margin: 8px 0 0;
    font-size: 0.8rem; color: var(--quiet); }

  /* C: the band */
  .reveal-band { border-top: 2px solid var(--ink); border-bottom: 2px solid var(--ink);
    padding: 20px 0; margin: 0 0 4px; }
  .cell-under { margin: 6px 0 0; color: var(--quiet); }

  /* ---- motion, off when the reader asks for it off ---- */
  @media (prefers-reduced-motion: no-preference) {
    .is-playing .js-pop { animation: pop 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
    .is-playing .js-slide { animation: slide 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
    .is-playing .js-span { animation: grow 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
    .is-playing .js-rise { animation: rise 320ms ease-out both; }
    @keyframes pop { from { transform: scale(0.9); opacity: 0; } to { transform: none; opacity: 1; } }
    @keyframes slide { from { left: 55%; } to { left: 26.5%; } }
    @keyframes grow { from { width: 0; left: 55%; } to { width: 28.5%; left: 26.5%; } }
    @keyframes rise { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
  }
`;
}

// -------------------------------------------------------------- the page

function page(direction) {
  const L = direction.light;
  const D = direction.dark;
  const checks = [
    ['body text on the plane', L.ink, L.plane, 4.5],
    ['quiet text on the plane', L.quiet, L.plane, 4.5],
    ['quiet text on a card', L.quiet, L.surface, 4.5],
    ['the accent as text on a card', L.accent, L.surface, 4.5],
    ['button words on the button fill', L.onPrimary, L.primary, 4.5],
    ['a control edge on the plane', L.edge, L.plane, 3],
    ['"clears" on a card', L.clears, L.surface, 4.5],
    ['"misses" on a card', L.misses, L.surface, 4.5],
    ['dark: body text on the plane', D.ink, D.plane, 4.5],
    ['dark: quiet text on the plane', D.quiet, D.plane, 4.5],
    ['dark: the accent as text on a card', D.accent, D.surface, 4.5],
    ['dark: button words on the button fill', D.onPrimary, D.primary, 4.5],
    ['dark: a control edge on the plane', D.edge, D.plane, 3],
    ['dark: "clears" on a card', D.clears, D.surface, 4.5],
  ];
  const rows = checks.map(([what, a, b, need]) => {
    const got = contrast(a, b);
    return `<tr><td>${what}</td><td><code>${a}</code> on <code>${b}</code></td>`
      + `<td>${need}:1</td><td><strong>${got}:1</strong> ${got >= need ? '&#10003;' : '&#10007; FAILS'}</td></tr>`;
  }).join('\n          ');

  const swatches = Object.entries(L).map(([name, value]) =>
    `<li><span class="swatch" style="background: ${value}"></span>${name}<br><code>${value}</code></li>`).join('\n            ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>One Trade — visual direction ${direction.name}</title>
<style>${css(direction)}</style>
</head>
<body>
<div class="sheet">
  <h1 class="title">One Trade — visual direction ${direction.name}</h1>
  <p class="sub">Level 3, the build step and the reveal, at 375px. Follows your
    system light/dark setting. Every word and number is the one on the screen
    today; only the design differs between the three files.</p>

  <dl class="spec">
    <dt>The idea</dt><dd>${direction.idea}</dd>
    <dt>Web font</dt><dd>${direction.font}</dd>
    <dt>Spacing and shape</dt><dd>${direction.spacing}</dd>
    <dt>What the reveal does</dt><dd>${direction.reveal}</dd>
    <dt>Palette, light mode</dt>
    <dd><ul class="swatches">
            ${swatches}
    </ul></dd>
  </dl>

  <div class="spec">
    <strong>Every colour pair, checked</strong>
    <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.85rem;">
      <thead><tr style="text-align: left;"><th>What</th><th>Pair</th><th>Needs</th><th>Has</th></tr></thead>
      <tbody>
          ${rows}
      </tbody>
    </table>
  </div>

  <div class="frames">
    <div class="frame-wrap">
      <p class="frame-label">Build</p>
      <div class="frame">${buildScreen()}</div>
    </div>
    <div class="frame-wrap">
      <p class="frame-label">Reveal</p>
      <div class="frame" id="reveal">${revealScreen(direction)}</div>
      <button type="button" class="btn replay" id="replay">Play the reveal again</button>
    </div>
  </div>
</div>
<script>
  // The only script in this file, and it only replays the reveal so the motion
  // can be seen more than once. Nothing here is proposed for the site.
  const frame = document.getElementById('reveal');
  const play = () => {
    frame.classList.remove('is-playing');
    void frame.offsetWidth;
    frame.classList.add('is-playing');
    const counter = frame.querySelector('.js-count');
    if (!counter || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const from = Number(counter.dataset.from);
    const to = Number(counter.dataset.to);
    const started = performance.now();
    const step = (now) => {
      const at = Math.min(1, (now - started) / 450);
      counter.textContent = (from + (to - from) * at).toFixed(2);
      if (at < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  document.getElementById('replay').addEventListener('click', play);
  play();
</script>
</body>
</html>
`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const written = [];
  for (const direction of directions) {
    const file = join(OUT, `mockup-${direction.key}.html`);
    await writeFile(file, page(direction));
    written.push(file);
  }

  // Anything that fails its own bar is a bug in the proposal, not a note.
  const failures = [];
  for (const direction of directions) {
    for (const [scheme, set] of [['light', direction.light], ['dark', direction.dark]]) {
      const pairs = [
        ['ink on plane', set.ink, set.plane, 4.5],
        ['quiet on plane', set.quiet, set.plane, 4.5],
        ['quiet on surface', set.quiet, set.surface, 4.5],
        ['accent on surface', set.accent, set.surface, 4.5],
        ['onAccent on accent', set.onAccent, set.accent, 4.5],
        ['onPrimary on primary', set.onPrimary, set.primary, 4.5],
        ['edge on plane', set.edge, set.plane, 3],
        ['clears on surface', set.clears, set.surface, 4.5],
        ['misses on surface', set.misses, set.surface, 4.5],
      ];
      for (const [what, a, b, need] of pairs) {
        const got = contrast(a, b);
        if (got < need) failures.push(`${direction.name} ${scheme}: ${what} is ${got}:1, needs ${need}:1`);
      }
    }
  }

  process.stdout.write(`${written.map((f) => `wrote ${f}`).join('\n')}\n`);
  process.stdout.write(failures.length === 0
    ? '\nEvery colour pair in all three directions passes its bar, in both schemes.\n'
    : `\n${failures.length} pairs FAIL:\n${failures.join('\n')}\n`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});
