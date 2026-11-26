// tests/crashReplay.test.js - the one pure function in js/crashReplay.js: the
// plain-words sentence under a replay's chart.
//
// Everything else in that file builds DOM, which this project's tests cannot
// touch directly (CLAUDE.md rule 8: no new libraries, so no jsdom) - the same
// constraint tests/game.test.js notes for js/game.js. The screens are checked
// by driving the real page in a browser; fallSentence() is checked here,
// the way js/game.js's starsExplanation() is, on hand-built results.

import test from 'node:test';
import assert from 'node:assert/strict';

import { fallSentence } from '../js/crashReplay.js';

const INDEX_LABEL = 'S&P 500 (VOO, with dividends)';

test('fallSentence() states both falls and the share, when both fell', () => {
  // 60% VOO / 40% TLT through the 2020 crash, roughly: the portfolio fell about
  // 43% as much as the index.
  const result = { change: -0.147, indexChange: -0.3399, indexLabel: INDEX_LABEL };
  assert.equal(
    fallSentence(result),
    'Your portfolio fell 15%. The S&P 500 (VOO, with dividends) fell 34%. That is 43% of the index\'s fall.',
  );
});

test('fallSentence() says nothing about a share when the portfolio rose instead', () => {
  const result = { change: 0.02, indexChange: -0.339, indexLabel: INDEX_LABEL };
  assert.equal(
    fallSentence(result),
    'Your portfolio rose 2%. The S&P 500 (VOO, with dividends) fell 34%.',
  );
});

test('fallSentence() says nothing about a share when the index did not fall', () => {
  const result = { change: -0.02, indexChange: 0.03, indexLabel: INDEX_LABEL };
  assert.equal(
    fallSentence(result),
    'Your portfolio fell 2%. The S&P 500 (VOO, with dividends) rose 3%.',
  );
});

test('fallSentence() handles a portfolio that is exactly the index', () => {
  const result = { change: -0.3399, indexChange: -0.3399, indexLabel: INDEX_LABEL };
  assert.equal(
    fallSentence(result),
    'Your portfolio fell 34%. The S&P 500 (VOO, with dividends) fell 34%. That is 100% of the index\'s fall.',
  );
});

test('fallSentence() reads a bigger fall than the index as a multiple, not a percent over 100%', () => {
  // All in NVDA through the 2022 bear market: falls more than the fund it is
  // measured against. 0.609 / 0.2452 is 2.48, which used to read "248% of the
  // index's fall" - a percent of a part that is not a part.
  const result = { change: -0.609, indexChange: -0.2452, indexLabel: INDEX_LABEL };
  assert.equal(
    fallSentence(result),
    'Your portfolio fell 61%. The S&P 500 (VOO, with dividends) fell 25%. '
    + 'That is about 2.5 times as much as the index fell.',
  );
});

test('fallSentence() never compares the two falls as a percent above 100%', () => {
  // Every share above 1 takes the multiple, so the comparison clause can never
  // carry a percent past 100%. The shares run up to 4.08, which is the most the
  // 2022 window allows: a portfolio that fell 100% against the index's 24.52%.
  for (const share of [1.0001, 1.04, 1.5, 2.4837, 4.0]) {
    const result = { change: -0.2452 * share, indexChange: -0.2452, indexLabel: INDEX_LABEL };
    const sentence = fallSentence(result);
    const compare = sentence.slice(sentence.lastIndexOf('That is '));
    assert.match(compare, /^That is about \d+\.\d times as much as the index fell\.$/, `share ${share}`);
    assert.doesNotMatch(compare, /%/, `share ${share}`);
  }
});

test('fallSentence() keeps the percent for a share just under the index\'s fall', () => {
  // The boundary is the unrounded share, so 0.998 is still a part of the
  // index's fall and reads as one - at 100%, which is as high as it goes.
  const result = { change: -0.2452 * 0.998, indexChange: -0.2452, indexLabel: INDEX_LABEL };
  assert.equal(
    fallSentence(result),
    'Your portfolio fell 24%. The S&P 500 (VOO, with dividends) fell 25%. '
    + 'That is 100% of the index\'s fall.',
  );
});

test('fallSentence() rounds the multiple to one decimal, including just over the line', () => {
  // A share a hair over 1 is a multiple of about 1.0, and says so rather than
  // reading as "101% of the index's fall".
  const result = { change: -0.25, indexChange: -0.2452, indexLabel: INDEX_LABEL };
  assert.equal(
    fallSentence(result),
    'Your portfolio fell 25%. The S&P 500 (VOO, with dividends) fell 25%. '
    + 'That is about 1.0 times as much as the index fell.',
  );
});

test('fallSentence() handles neither line moving at all', () => {
  const result = { change: 0, indexChange: 0, indexLabel: INDEX_LABEL };
  assert.equal(
    fallSentence(result),
    'Your portfolio ended exactly where it started. The S&P 500 (VOO, with dividends) ended exactly where it started.',
  );
});

test('fallSentence() can leave the comparison off, for a screen that already made it', () => {
  // Level 6's reveal shows the ratio itself as its headline number, so the
  // sentence under it states the two falls and stops: "0.14" followed by "that is
  // 14% of the index's fall" is the same number twice on one screen.
  const result = { change: -0.0481, indexChange: -0.3399, indexLabel: INDEX_LABEL };
  assert.equal(
    fallSentence(result, { compare: false }),
    'Your portfolio fell 5%. The S&P 500 (VOO, with dividends) fell 34%.',
  );
  // The multiple comes off too, not only the percent.
  const harder = { change: -0.609, indexChange: -0.2452, indexLabel: INDEX_LABEL };
  assert.equal(
    fallSentence(harder, { compare: false }),
    'Your portfolio fell 61%. The S&P 500 (VOO, with dividends) fell 25%.',
  );
  // The default is unchanged, so Crash replay's own screen still compares.
  assert.match(fallSentence(result), /That is 14% of the index's fall\.$/);
});
