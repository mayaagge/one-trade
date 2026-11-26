// tests/share.test.js - the share plumbing both screens use.
//
// js/share.js is what came out of js/dailyView.js when the share card needed the
// same two things the daily puzzle already had: a link to the game, and a way to
// get something out of the browser. The pure half is tested here; the half that
// touches navigator and the clipboard is exercised by rendering the screens in
// tests/dailyView.test.js.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';

import { shareUrl, withSource } from '../js/share.js';
import { shareUrl as dailyShareUrl } from '../js/daily.js';

test('withSource adds the source code, whatever the link already carries', () => {
  assert.equal(withSource('https://example.org/one-trade/', 'share'), 'https://example.org/one-trade/?src=share');
  assert.equal(withSource('https://example.org/?a=1', 'daily'), 'https://example.org/?a=1&src=daily');
});

test('withSource on no link is no link, rather than a bare query', () => {
  // A share with no link beats a share that posts "?src=share".
  assert.equal(withSource('', 'share'), '');
  assert.equal(withSource(null, 'share'), '');
});

test('shareUrl prefers ABOUT.url and falls back to the page it is served from', () => {
  assert.equal(shareUrl({ url: 'https://example.org/one-trade/' }, null), 'https://example.org/one-trade/');
  assert.equal(
    shareUrl({ url: null }, { origin: 'http://localhost:8000', pathname: '/index.html' }),
    'http://localhost:8000/index.html',
  );
  assert.equal(shareUrl({ url: null }, null), '');
});

test('the daily puzzle and the share card use one implementation, not two', () => {
  // js/daily.js re-exports it, so the puzzle keeps the import it always had.
  assert.equal(dailyShareUrl, shareUrl);
});
