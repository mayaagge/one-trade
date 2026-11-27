// tests/devTooling.test.js - the screenshot tool stays outside the game.
//
// WHY THIS IS A TEST AND NOT A PROMISE IN A COMMENT. Playwright is the first
// package this repository has ever had, and the reason it is allowed in is that
// it is a development tool the site never loads. That is a property of four
// files - index.html, package.json, .gitignore and whatever is under js/ - and
// each of them is edited for unrelated reasons. A bundler line added to
// index.html, an `npm install --save` that lands in `dependencies`, or an
// import of a dev helper from a browser module would each break the promise
// silently: the site would still work on this machine, where node_modules is
// sitting right there, and fail for a player.
//
// What is checked:
//   1. index.html loads nothing but the game's own stylesheet and entry module;
//   2. nothing under js/ imports playwright or the dev scripts;
//   3. package.json has no runtime dependencies, and playwright is a dev one;
//   4. .gitignore covers node_modules and the screenshots folder.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

test('index.html loads only the game\'s own stylesheet and entry module', () => {
  const html = read('index.html');

  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(scripts.length, 1, `index.html should have one <script>, found ${scripts.length}`);
  assert.match(scripts[0], /src="js\/app\.js"/);
  assert.match(scripts[0], /type="module"/);

  const styles = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map((m) => m[0]);
  assert.equal(styles.length, 1);
  assert.match(styles[0], /href="css\/style\.css"/);

  // The three words that would mean the site had started depending on the
  // toolchain: a bundler's output folder, the package folder itself, or a CDN.
  for (const forbidden of ['node_modules', 'playwright', 'http://', 'https://']) {
    assert.ok(!html.includes(forbidden), `index.html should not mention ${forbidden}`);
  }
});

test('nothing the browser loads imports playwright or the dev scripts', () => {
  const files = readdirSync(join(ROOT, 'js')).filter((name) => name.endsWith('.js'));
  assert.ok(files.length > 20, 'expected the browser modules to be found');
  for (const name of files) {
    const source = read(join('js', name));
    assert.ok(!source.includes('playwright'), `js/${name} must not mention playwright`);
    assert.ok(!/from\s+['"][^'"]*scripts\//.test(source), `js/${name} must not import from scripts/`);
    // Every import a browser module makes is a relative path to a sibling or a
    // data file - never a bare package name, which only a bundler could resolve.
    for (const match of source.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)) {
      assert.match(match[1], /^\.{1,2}\//, `js/${name} imports the bare package "${match[1]}"`);
    }
  }
});

test('playwright is a devDependency and the game has no runtime ones', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies, undefined, 'the game must have no runtime dependencies');
  assert.ok(pkg.devDependencies?.playwright, 'playwright should be a devDependency');
  assert.deepEqual(
    Object.keys(pkg.devDependencies),
    ['playwright'],
    'one dev dependency, so a second one is a decision rather than a drift',
  );
});

test('.gitignore keeps the package folder and the screenshots out of the repo', () => {
  const lines = read('.gitignore').split('\n').map((line) => line.trim());
  for (const entry of ['node_modules/', 'screenshots/']) {
    assert.ok(lines.includes(entry), `.gitignore should list ${entry}`);
  }
});

test('the dev scripts are the only place playwright is imported', () => {
  const scripts = readdirSync(join(ROOT, 'scripts'));
  const importers = scripts.filter((name) => {
    if (!name.endsWith('.mjs') && !name.endsWith('.js')) return false;
    return read(join('scripts', name)).includes("from 'playwright'");
  });
  assert.deepEqual(importers.sort(),
    ['dev_a11y.mjs', 'dev_checks.mjs', 'dev_phone.mjs', 'shots.mjs']);
});
