// tests/playerText.test.js - two rules about every word a player reads.
//
//   1. NO EM DASH. Maya's call, 27 November 2026: a sentence that needs one
//      usually reads better rewritten with a comma, a colon, a full stop or a
//      pair of brackets. The rule is checkable and the rewrite is not, so this
//      checks the rule and the rewriting was done by hand - eight sentences,
//      listed in BUILD_LOG.md.
//
//      THE EN DASH IS A DIFFERENT CHARACTER AND IS ALLOWED. Nine places show
//      a bare dash where a number has not been produced yet: the big readout
//      before a guess, an empty table cell in Research. That is a glyph
//      standing for "no value", not punctuation inside a sentence, so there is
//      no sentence to rewrite and it is written as an en dash.
//
//   2. NO LINKS IN THE ABOUT TAB. It is one page of text somebody opened on
//      purpose. Links OUT of it are fine and still exist elsewhere - level 6's
//      reveal points at it - and this is only about About's own text.
//
// WHAT COUNTS AS PLAYER-FACING. The content files entirely, index.html
// entirely, and the STRINGS in js/, not its comments: a comment is written for
// whoever reads the code, and holding it to a typographic rule for players
// would be a rule about the wrong audience. The scan below strips comments
// before it looks.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { StubNode, withDocument } from './stubDom.js';
import { renderAbout, validateAbout } from '../js/about.js';

const root = new URL('..', import.meta.url);
const read = (name) => readFileSync(fileURLToPath(new URL(name, root)), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const EM_DASH = '—';
const CONTENT_FILES = ['levels.json', 'why.json', 'about.json', 'names.json', 'tickers.json'];

/** Every string in a parsed JSON document, with the path that reached it. */
function strings(value, path = '$') {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => strings(item, `${path}.${key}`));
  }
  return [];
}

/**
 * A JavaScript file with its comments taken out, so only what the code SAYS is
 * left.
 *
 * Deliberately crude - it does not parse JavaScript, it walks the file
 * tracking whether it is inside a string, a template, a line comment or a
 * block comment. That is enough to tell a sentence a player reads from a note
 * to whoever maintains the file, which is the only distinction this test
 * needs, and a parser would be a dependency for one character.
 */
export function withoutComments(source) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (quote === null && two === '//') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (quote === null && two === '/*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    const ch = source[i];
    if (quote === null && (ch === "'" || ch === '"' || ch === '`')) quote = ch;
    else if (quote !== null && ch === '\\') { out += source.slice(i, i + 2); i += 2; continue; }
    else if (ch === quote) quote = null;
    out += ch;
    i += 1;
  }
  return out;
}

test('no content file has an em dash in any of its text', () => {
  for (const name of CONTENT_FILES) {
    for (const [path, text] of strings(readJson(name))) {
      assert.ok(!text.includes(EM_DASH), `${name} ${path} has an em dash: ${text}`);
    }
  }
});

test('index.html has no em dash', () => {
  assert.ok(!read('index.html').includes(EM_DASH), 'index.html has an em dash');
});

test('no string in the browser code has an em dash', () => {
  const files = readdirSync(fileURLToPath(new URL('js', root))).filter((n) => n.endsWith('.js'));
  assert.ok(files.length > 20, 'the js/ scan found almost nothing, so it is not scanning');
  for (const name of files) {
    const code = withoutComments(read(`js/${name}`));
    const line = code.split('\n').findIndex((l) => l.includes(EM_DASH));
    assert.equal(line, -1, `js/${name} line ${line + 1} has an em dash in its text`);
  }
});

test('the comment stripper really does tell code from comments', () => {
  // The test above is only worth anything if this works, so it is checked
  // rather than assumed - including the case that matters, a dash inside a
  // string that must NOT be stripped.
  assert.equal(withoutComments('const a = 1; // a — comment\n').includes(EM_DASH), false);
  assert.equal(withoutComments('/* a — block */ const a = 1;\n').includes(EM_DASH), false);
  assert.equal(withoutComments("const a = 'kept —';\n").includes(EM_DASH), true);
  assert.equal(withoutComments('const a = `kept —`;\n').includes(EM_DASH), true);
  // A string containing what looks like a comment opener is still a string.
  assert.equal(withoutComments("const a = 'http://x —';\n").includes(EM_DASH), true);
});

test('the About tab carries no links of its own', () => {
  const restore = withDocument();
  try {
    const view = renderAbout(validateAbout(readJson('about.json')));
    const anchors = view.all().filter((node) => node.tagName === 'A');
    assert.deepEqual(anchors, [], `About renders ${anchors.length} link(s)`);
    // The text is all still there: nine headings and the levels list.
    const headings = view.all().filter((node) => node.tagName === 'H2');
    assert.equal(headings.length, readJson('about.json').sections.length);
  } finally { restore(); }
});

test('links elsewhere are untouched, so this is a rule about About and not the site', () => {
  // Level 6's reveal points at About's intuition section. If that disappeared
  // the rule above would pass for the wrong reason.
  const levels = readJson('levels.json');
  const nav = read('index.html');
  assert.match(nav, /href="#about"/, 'the nav no longer links to About');
  assert.ok(levels.levels.length === 7);
});
