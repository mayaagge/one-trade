// js/shareCard.js - the picture a player posts after a level.
//
// docs/PRD.md: "after each level, a 'Share my score' button makes an image like
// 'I found 3.2 bets in 5 holdings. Can you beat it?' with a challenge link. It
// includes stars and the headline number, never real holdings."
//
// THE CARD IS DECIDED BEFORE IT IS DRAWN. shareCardContent() below returns the
// whole card as plain data - the level, the stars, one headline, the link, the
// disclaimer - and drawShareCard() turns that object into 1080 x 1080 pixels
// without adding a word of its own. So everything a player could post is
// decided by a pure function that node can run, and tests/shareCard.test.js
// scans the finished text rather than reading the templates.
//
// TWO THINGS NEVER GO ON A CARD:
//
//   * THE PORTFOLIO. No ticker, no dollar amount, no weight, on any level. The
//     card says what the portfolio DID, never what it held.
//   * ON A POOL LEVEL, THE ANSWER. Levels 2 and 7 are dealt their portfolios
//     from the Hypothesis 3 pools, so the same portfolio reaches other players.
//     Their cards carry the stars and how close the guess was, and neither the
//     answer nor the guess - because the two together are the answer. That is
//     hidesValue() below, read off the level's own "fixed" portfolio rule
//     rather than from a list of level numbers, so a pool level added later is
//     covered the day it is added.
//
// THE WORDS LIVE IN levels.json, in each level's "share" block, like every
// other rule this game applies. A headline here would be a seventh place where
// a measure is described, and the one nobody would think to check.
//
// Educational, not investment advice.

import { DISCLAIMER } from './levels.js';
import { withSource } from './share.js';

/** The source code this card's link carries. */
export const SHARE_SOURCE = 'share';

/** 1080 x 1080, the size docs/PRD.md asks for and every feed accepts. */
export const CARD_SIZE = 1080;

/** How many stars a level can give. */
export const STARS = 3;

/**
 * Does this level hide its answer from the card?
 *
 * True for a level whose portfolio is DEALT rather than built - levels 2 and 7,
 * the two drawn from the Hypothesis 3 pools. A player builds their own
 * portfolio on every other level, so its number tells nobody else anything.
 */
export function hidesValue(level) {
  // An explicit answer in the file wins, so a mode that is dealt a portfolio
  // can still say out loud which way it has chosen - and has to. The default
  // is the safe one: anything dealt rather than built hides its answer unless
  // the data says otherwise.
  if (typeof level?.share?.hidesAnswer === 'boolean') return level.share.hidesAnswer;
  return level?.holdings?.fixed === true;
}

/**
 * The headline, filled in from the level's own measure.
 *
 * A level that hides its value fills {band} from its star bands; every other
 * level fills {value} with the string the reveal screen printed and {holdings}
 * with how many holdings there were. Two levels carry a second line for a value
 * their first line cannot describe - a beta that moves against the basket, a
 * portfolio that did not fall at all - and those are named for the condition
 * they cover rather than hidden behind a threshold in here.
 */
export function shareHeadline(level, { stars, shown = null, value = null, holdings = null }) {
  const share = level.share ?? {};
  if (hidesValue(level)) {
    const band = share.bands?.[String(stars)];
    if (typeof band !== 'string') {
      throw new Error(`level ${level.id}: no share band for ${stars} stars`);
    }
    // THE ENDING COMES FROM THE BAND TOO. "Can you?" asks a friend to match the
    // result, which on the lowest band would be asking them to do worse.
    const ending = share.endings?.[String(stars)];
    if (typeof ending !== 'string') {
      throw new Error(`level ${level.id}: no share ending for ${stars} stars`);
    }
    return share.headline.replace('{band}', band).replace('{ending}', ending);
  }
  if (Number.isFinite(value)) {
    if (value <= 0 && share.headlineAtOrBelowZero) return share.headlineAtOrBelowZero;
    if (value < 0 && share.headlineBelowZero) return share.headlineBelowZero;
  }
  return share.headline
    .replace('{value}', shown ?? '')
    .replace('{holdings}', holdings === null ? '' : String(holdings));
}

/**
 * The whole card, as plain data.
 *
 * @param {object} options.level    the level, from levels.json
 * @param {number} options.stars    0 to 3
 * @param {string} [options.shown]  the measure as the reveal screen printed it
 * @param {number} [options.value]  the measure itself, for the two levels whose
 *                                  headline changes at zero
 * @param {number} [options.holdings] how many holdings, for a headline that counts them
 * @param {string} [options.url]    where the game lives, before the source code
 */
export function shareCardContent({
  level, stars, shown = null, value = null, holdings = null, url = '', subtitle = null,
}) {
  if (!Number.isInteger(stars) || stars < 0 || stars > STARS) {
    throw new Error(`a share card needs 0 to ${STARS} stars, not ${stars}`);
  }
  const headline = shareHeadline(level, { stars, shown, value, holdings });
  const starsText = `${stars} of ${STARS} stars`;
  // A numbered level says which one. The weekly challenge has no number and is
  // not in the ladder, so it says its own name - and never the portfolio's,
  // which is a list of the holdings in words.
  const named = Number.isInteger(level.id) ? `Level ${level.id} · ${level.title}` : level.title;
  const levelLine = subtitle ? `${named} · ${subtitle}` : named;
  return {
    size: CARD_SIZE,
    wordmark: 'One Trade',
    levelLine,
    stars: { count: stars, of: STARS, text: starsText },
    headline,
    // The source code docs/PRD.md asks every shared link to carry. The level
    // cards say ?src=share; the weekly says ?src=weekly, from its own block.
    link: withSource(url, level.share?.source ?? SHARE_SOURCE),
    disclaimer: DISCLAIMER,
    fileName: `one-trade-${Number.isInteger(level.id) ? `level-${level.id}` : level.id}.png`,
    // What the card says, for a screen reader and for the share sheet's own
    // description. It is the same words in the same order as the picture.
    alt: `One Trade, ${levelLine}. ${starsText}. ${headline} ${DISCLAIMER}`,
  };
}

/** The card's words, in the order they are drawn. The thing tests scan. */
export function cardText(content) {
  return [
    content.wordmark,
    content.levelLine,
    content.stars.text,
    content.headline,
    content.link,
    content.disclaimer,
  ].filter(Boolean).join('\n');
}

/**
 * What goes in the share sheet beside the picture.
 *
 * Shorter than the card - a feed shows the image, and the text under it is read
 * as a caption - and under the same two rules: nothing about the portfolio, and
 * nothing a pool level hides. It carries the disclaimer because it carries a
 * number, which is the rule every screen in this game follows.
 */
export function shareMessage(content) {
  return [content.headline, content.link, content.disclaimer].filter(Boolean).join('\n');
}

/** A card for a one-question level, from the result js/round.js revealed. */
export function cardFromResult(level, result, url = '', { subtitle = null } = {}) {
  return shareCardContent({
    level,
    subtitle,
    stars: result.stars,
    shown: result.shown,
    value: result.value,
    holdings: result.tickers?.length ?? null,
    url,
  });
}

/**
 * A card for level 7, from the verdict over its three guesses.
 *
 * It takes the VERDICT and not the three results, because that is all the card
 * is allowed to know: the stars, and nothing about the portfolios.
 */
export function cardFromSeries(level, verdict, url = '') {
  return shareCardContent({ level, stars: verdict.stars, url });
}

// ---------------------------------------------------------------- the drawing

/**
 * The layout, in card pixels. Written down rather than scattered through the
 * drawing, so the picture can be nudged without reading the code that paints it.
 */
const LAYOUT = {
  pad: 88,
  ink: '#191919',
  quiet: '#666666',
  surface: '#ffffff',
  rule: '#e7e7e7',
  star: '#257de0',          // the palette's categorical slot 1, as in the charts
  starEmpty: '#e7e7e7',
  sans: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  wordmarkY: 150,
  levelY: 232,
  starsY: 400,
  starRadius: 54,
  starGap: 150,
  headlineTop: 560,
  headlineSize: 64,
  headlineLeading: 86,
  linkY: 930,
  disclaimerY: 992,
};

/** One five-pointed star, filled or empty, centred on (x, y). */
function star(ctx, x, y, radius, filled) {
  ctx.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const reach = point % 2 === 0 ? radius : radius * 0.42;
    // Start at the top: -90 degrees, then every 36 degrees round.
    const angle = (Math.PI / 5) * point - Math.PI / 2;
    const px = x + reach * Math.cos(angle);
    const py = y + reach * Math.sin(angle);
    if (point === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? LAYOUT.star : LAYOUT.starEmpty;
  ctx.fill();
}

/**
 * Break a line to fit the card's width, by measuring it.
 *
 * Exported because it is the only part of the drawing with an answer worth
 * checking, and a test can check it with any object that can measure text.
 */
export function wrapLines(measure, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Wait for the fonts the card draws with.
 *
 * WITHOUT THIS THE CARD IS DRAWN IN THE FALLBACK FACE. A canvas does not wait:
 * it paints with whatever is loaded at the moment fillText runs, and measureText
 * returns that face's widths, so the headline would be wrapped to one font and
 * painted in another. document.fonts.load() asks for the exact sizes and weights
 * this card uses, then ready waits for everything in flight.
 */
export async function fontsReady(doc = globalThis.document) {
  const fonts = doc?.fonts;
  if (!fonts) return;                      // an old browser: draw with what there is
  try {
    await Promise.all([
      fonts.load(`700 ${LAYOUT.headlineSize}px ${LAYOUT.sans}`),
      fonts.load(`600 40px ${LAYOUT.sans}`),
      fonts.load(`400 30px ${LAYOUT.sans}`),
    ]);
    await fonts.ready;
  } catch {
    // A font that will not load is not a reason to refuse to draw.
  }
}

/**
 * Draw a card onto a canvas. Call fontsReady() first.
 *
 * It adds no words: everything painted here comes out of `content`.
 */
export function drawShareCard(canvas, content) {
  const size = content.size ?? CARD_SIZE;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const centre = size / 2;

  ctx.fillStyle = LAYOUT.surface;
  ctx.fillRect(0, 0, size, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = LAYOUT.quiet;
  ctx.font = `600 34px ${LAYOUT.sans}`;
  ctx.fillText(content.wordmark, centre, LAYOUT.wordmarkY);

  ctx.fillStyle = LAYOUT.ink;
  ctx.font = `600 54px ${LAYOUT.sans}`;
  ctx.fillText(content.levelLine, centre, LAYOUT.levelY);

  // The stars, drawn rather than typed: a glyph would depend on a font the
  // device may not have, and this card is a picture before it is text.
  const first = centre - LAYOUT.starGap * (content.stars.of - 1) / 2;
  for (let i = 0; i < content.stars.of; i += 1) {
    star(ctx, first + i * LAYOUT.starGap, LAYOUT.starsY, LAYOUT.starRadius, i < content.stars.count);
  }

  ctx.fillStyle = LAYOUT.ink;
  ctx.font = `700 ${LAYOUT.headlineSize}px ${LAYOUT.sans}`;
  const lines = wrapLines((text) => ctx.measureText(text).width, content.headline, size - LAYOUT.pad * 2);
  lines.forEach((line, i) => {
    ctx.fillText(line, centre, LAYOUT.headlineTop + i * LAYOUT.headlineLeading);
  });

  ctx.strokeStyle = LAYOUT.rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LAYOUT.pad, LAYOUT.linkY - 56);
  ctx.lineTo(size - LAYOUT.pad, LAYOUT.linkY - 56);
  ctx.stroke();

  if (content.link) {
    ctx.fillStyle = LAYOUT.quiet;
    ctx.font = `400 32px ${LAYOUT.sans}`;
    ctx.fillText(content.link, centre, LAYOUT.linkY);
  }

  // The disclaimer is on the card because the card shows a number, and
  // CLAUDE.md asks every screen that shows one to carry it. A picture posted
  // somewhere else is exactly the screen that needs it most.
  ctx.fillStyle = LAYOUT.ink;
  ctx.font = `600 30px ${LAYOUT.sans}`;
  ctx.fillText(content.disclaimer, centre, LAYOUT.disclaimerY);

  return canvas;
}
