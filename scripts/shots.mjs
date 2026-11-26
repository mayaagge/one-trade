// scripts/shots.mjs - screenshots of every screen, for a design review.
//
// A DEVELOPMENT TOOL. It is not part of the game: nothing under js/, css/ or
// index.html knows it exists, playwright is a devDependency only, and the
// screenshots it writes are gitignored. tests/devTooling.test.js holds all
// three of those true so they cannot quietly stop being true.
//
// WHY IT EXISTS. Design notes cannot be written from source code: "is the one
// idea clear in five seconds" and "does this fit 375px" are questions about
// pixels. This serves the site, drives every screen with real clicks, and saves
// a picture of each at phone width in both colour schemes.
//
//   node scripts/shots.mjs            every scene, both schemes
//   node scripts/shots.mjs --only=learn   just the scenes whose id starts "learn"
//   node scripts/shots.mjs --scheme=light
//
// HOW A STATE IS REACHED, in order of preference:
//   1. real clicks, for anything a player could click;
//   2. a preview date, for the two modes that depend on the clock. mountDaily()
//      and mountWeekly() already take { now }, so the scene re-mounts the module
//      with a fixed date rather than the site gaining a date parameter;
//   3. addInitScript, for the two states nothing can click into - a storage that
//      throws, and a save seeded with stars.
//
// Educational, not investment advice.

import { chromium } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ROOT, VIEWPORT, blockStorageIn, seedInto, serve } from './dev_browser.mjs';

const OUT = join(ROOT, 'screenshots');

import { scenes } from './dev_scenes.mjs';

// ------------------------------------------------------------------ running

function parseArgs(argv) {
  const only = argv.find((a) => a.startsWith('--only='))?.slice(7) ?? null;
  const scheme = argv.find((a) => a.startsWith('--scheme='))?.slice(9) ?? null;
  return { only, scheme };
}

async function main() {
  const { only, scheme } = parseArgs(process.argv.slice(2));
  const schemes = scheme ? [scheme] : ['light', 'dark'];
  const chosen = only ? scenes.filter((s) => s.id.startsWith(only)) : scenes;
  if (chosen.length === 0) throw new Error(`no scene id starts with "${only}"`);

  // ONLY THE SHOTS THIS RUN WILL REPLACE, not the whole folder. `rm -r` on OUT
  // meant that `--only=chrome` deleted the other 59 scenes and the mockups
  // beside them, which is a surprising amount of destruction for a flag that
  // says "only".
  for (const name of schemes) {
    await mkdir(join(OUT, name), { recursive: true });
    for (const scene of chosen) {
      for (const suffix of ['', '--fold', '--FAILED']) {
        await rm(join(OUT, name, `${scene.id}${suffix}.png`), { force: true });
      }
    }
  }

  const server = await serve();
  const browser = await chromium.launch();
  const written = [];
  const failures = [];

  try {
    for (const name of schemes) {
      for (const scene of chosen) {
        const context = await browser.newContext({
          viewport: VIEWPORT,
          deviceScaleFactor: 2,
          colorScheme: name,
        });
        if (scene.blockStorage) await blockStorageIn(context);
        if (scene.seed) await seedInto(context, scene.seed);
        const page = await context.newPage();
        try {
          await scene.run(page);
          await page.waitForTimeout(120);
          const file = join(OUT, name, `${scene.id}.png`);
          await page.screenshot({ path: file, fullPage: true });
          await page.screenshot({ path: join(OUT, name, `${scene.id}--fold.png`) });
          written.push({ scene, name });
          process.stdout.write(`  ${name}  ${scene.id}\n`);
        } catch (error) {
          failures.push({ id: scene.id, scheme: name, message: error.message.split('\n')[0] });
          process.stdout.write(`  ${name}  ${scene.id}  FAILED: ${error.message.split('\n')[0]}\n`);
          try {
            await page.screenshot({ path: join(OUT, name, `${scene.id}--FAILED.png`), fullPage: true });
          } catch { /* the page may be gone */ }
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }

  const lines = ['# Screenshots', '',
    `${written.length} of ${chosen.length * schemes.length} states captured, `
    + `375px wide, at 2x. "--fold" is the first screenful only.`, ''];
  if (failures.length > 0) {
    lines.push('## Scenes that did not reach their state', '');
    for (const f of failures) lines.push(`- \`${f.id}\` (${f.scheme}): ${f.message}`);
    lines.push('');
  }
  lines.push('## States', '', '| Scene | What it shows | Dark worth reading |', '| --- | --- | --- |');
  for (const scene of chosen) {
    lines.push(`| \`${scene.id}\` | ${scene.note} | ${scene.dark ? 'yes' : 'no'} |`);
  }
  await writeFile(join(OUT, 'INDEX.md'), `${lines.join('\n')}\n`);

  process.stdout.write(`\n${written.length} captured, ${failures.length} failed. ${OUT}/INDEX.md\n`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});
