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

test('fallSentence() handles a portfolio that fell further than the index', () => {
  // All in NVDA through the 2022 bear market: falls more than the fund it is measured against.
  const result = { change: -0.609, indexChange: -0.2452, indexLabel: INDEX_LABEL };
  assert.equal(
    fallSentence(result),
    'Your portfolio fell 61%. The S&P 500 (VOO, with dividends) fell 25%. That is 248% of the index\'s fall.',
  );
});

test('fallSentence() handles neither line moving at all', () => {
  const result = { change: 0, indexChange: 0, indexLabel: INDEX_LABEL };
  assert.equal(
    fallSentence(result),
    'Your portfolio ended exactly where it started. The S&P 500 (VOO, with dividends) ended exactly where it started.',
  );
});
