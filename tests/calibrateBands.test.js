// tests/calibrateBands.test.js - the figures docs/PRD.md's band amendment quotes.
//
// WHY A TEST AND NOT JUST A SCRIPT. The amendment of 27 November 2026 is an
// argument built on numbers: 85% of level 5's passing answers hug a bucket
// edge, level 1's hug none, a guess 6 points high scored 1 star where the same
// error low scored 2. Those numbers are the reason the bands moved, and they
// were read out of the frozen snapshot by scripts/calibrate_bands.mjs. A
// quoted figure that nobody checks again is a figure that quietly stops being
// true - so this holds each one to the data it came from.
//
// THE FROZEN SNAPSHOT, deliberately. data/prices.json never moves, so these
// are stable; the same run against data/game.json would give different figures
// and prove nothing about what the amendment says.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildReturns } from '../js/returns.js';
import { validateCrashes } from '../js/crash.js';
import { levelById, validateLevels } from '../js/levels.js';
import {
  checkLevel1, checkLevel4, checkLevel5, checkLevel6Builds, LEVEL6_BUILDS,
} from '../scripts/check_levels.mjs';
import {
  AMENDED_LEVELS, REGISTERED_BUCKET_LEVELS, TWO_STAR_MULTIPLE,
  analyseLevel, scorePair,
} from '../scripts/calibrate_bands.mjs';

const root = new URL('..', import.meta.url);
const read = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(name, root)), 'utf8'));

const LEVELS = validateLevels(read('levels.json'));
const PRD = readFileSync(fileURLToPath(new URL('docs/PRD.md', root)), 'utf8');
const built = buildReturns(read('data/prices.json'));
const tickersFile = read('tickers.json');
const basket = read('basket.json').stocks.map((stock) => stock.ticker);
const crashes = validateCrashes(read('data/crashes.json'));
const universe = tickersFile.groups
  .flatMap((group) => group.tickers.map((t) => (typeof t === 'string' ? t : t.ticker)));

const level = (id) => levelById(LEVELS, id);
const analysed = {
  1: () => analyseLevel(level(1), checkLevel1(built, level(1)).winners),
  4: () => analyseLevel(level(4), checkLevel4(built, level(4), universe, basket).winners),
  5: () => analyseLevel(level(5), checkLevel5(built, level(5), universe).winners),
  6: () => analyseLevel(
    level(6),
    checkLevel6Builds(crashes, level(6), LEVEL6_BUILDS).filter((row) => row.passed),
  ),
};

// --------------------------------------------- the defect the amendment names

test('every passing design on a bucket level lands in one bucket, which is the defect', () => {
  // "a passing answer always lands in the same bucket - the bottom one, 100%
  // of passing designs". Stars are only awarded to a portfolio that passed, so
  // a two-star bucket test on these levels was never the three-way judgement
  // it was written as.
  for (const id of REGISTERED_BUCKET_LEVELS) {
    const { buckets, spread: s } = analysed[id]();
    assert.ok(s.n > 0, `level ${id} has no passing design to measure`);
    assert.equal(Object.keys(buckets).length, 1,
      `level ${id}'s passing designs span ${JSON.stringify(buckets)}, not one bucket`);
    assert.equal(Object.values(buckets)[0], s.n);
  }
});

test('85% of level 5\'s passing answers sit within the three-star band of an edge', () => {
  const { hugging } = analysed[5]();
  assert.equal(hugging.of, 126, 'the passing-design count has moved');
  assert.equal(hugging.count, 107);
  assert.equal(Math.round((100 * hugging.count) / hugging.of), 85,
    "the PRD quotes 85%, and this is where the figure comes from");
  assert.match(PRD, /85% of level 5's passing answers sit within the three-star band of an edge/);
});

test("level 1's answers hug an edge now that its bar IS that edge", () => {
  // THE BEFORE FIGURES ARE HISTORY AND THE PRD KEEPS THEM: at a bar of 0.80,
  // 0 of 8 passing pairs sat within the three-star band of an edge, which is
  // why the first amendment left level 1 alone. Moving the bar to 0.70 put it
  // ON the edge, and the room went: a pair cannot pass without being in the
  // "same bet" bucket. That is why the band followed the bar.
  const { hugging, spread: s } = analysed[1]();
  assert.equal(hugging.of, 16, 'the passing-pair count at the 0.70 bar has moved');
  assert.equal(hugging.count, 8);
  assert.equal(s.median.toFixed(4), '0.8304');
  assert.ok(hugging.distance.median < 2 * level(1).stars.three.of,
    'the nearest edge is still clear of twice the band, so the defect would not apply');
  // Both amendments are on the page, with the before figures kept visible.
  assert.match(PRD, /0 of 8; the nearest edge a median 0\.2483 away/);
  assert.match(PRD, /8 of its 16 passing pairs now sit within the band of an edge/);
});

test('level 5 scored the same error differently by direction, before the amendment', () => {
  // The sentence the amendment leads with: "a guess 6 points high scored 1
  // star and a guess 6 points low scored 2". scorePair()'s `old` column is the
  // registered rule, computed from its own definition rather than from the
  // file, so this keeps working now that levels.json no longer says it.
  const five = level(5);
  const actual = 0.3302;
  const high = scorePair(five, { actual, guess: actual + 0.06 });
  const low = scorePair(five, { actual, guess: actual - 0.06 });
  assert.equal(high.old, 1, 'the registered rule gave more than one star 6 points high');
  assert.equal(low.old, 2, 'the registered rule gave other than two stars 6 points low');
  // And now they agree, which is the whole of the change.
  assert.equal(high.proposed, 2);
  assert.equal(low.proposed, 2);
  assert.match(PRD, /a guess 6 points high scored 1 star and a guess 6 points low scored 2/);
});

// --------------------------------------------------- what the amendment moved

test('all four bucket levels now score the second star on a distance', () => {
  // Levels 4, 5 and 6 by the first amendment; level 1 by the second, when its
  // pass bar moved onto a bucket edge.
  assert.deepEqual([...AMENDED_LEVELS].sort(), [1, 4, 5, 6]);
  assert.deepEqual([...AMENDED_LEVELS].sort(), [...REGISTERED_BUCKET_LEVELS].sort(),
    'a level registered on a bucket is no longer amended, or the other way round');
  for (const id of AMENDED_LEVELS) {
    assert.equal(level(id).stars.two.test, 'within', `level ${id} still scores a bucket`);
    assert.equal(level(id).stars.two.of, level(id).stars.three.of * TWO_STAR_MULTIPLE);
  }
});

test('the gains and losses are the ones the PRD reports, swept over every guess', () => {
  // "level 5 gains a star on 5 guesses and loses one on none; level 4 gains on
  // 1 and loses on 3; level 6 gains on 2 and loses on 5." Against each level's
  // median passing answer, over every guess its own slider can produce.
  const counts = {};
  for (const id of [1, 4, 5, 6]) {
    const { sweep } = analysed[id]();
    counts[id] = { gained: sweep.gained.length, lost: sweep.lost.length };
  }
  assert.deepEqual(counts, {
    1: { gained: 6, lost: 0 },   // purely gentler, once its bar moved too
    4: { gained: 1, lost: 3 },
    5: { gained: 5, lost: 0 },
    6: { gained: 2, lost: 5 },
  });
  assert.match(PRD, /level 5 gains a star on 5 guesses and loses one on none; level 4 gains on 1 and loses on 3; level 6 gains on 2 and loses on 5; level 1, once its bar moved too, gains on 6 and loses on none/);
});

test('every guess level 5 gained is one that was punished for crossing the edge', () => {
  // The gains are not scattered: each is a guess ABOVE the answer, outside the
  // three-star band and inside twice it - exactly the window the bucket rule
  // was deciding by direction rather than by distance.
  const { sweep } = analysed[5]();
  const five = level(5);
  for (const row of sweep.gained) {
    assert.ok(row.error > 0, `a guess below the answer gained a star: ${JSON.stringify(row)}`);
    assert.ok(Math.abs(row.error) > five.stars.three.of, 'it was already inside the three-star band');
    assert.ok(Math.abs(row.error) <= five.stars.two.of + 1e-9, 'it is outside the new two-star band');
    assert.equal(row.old, 1);
    assert.equal(row.proposed, 2);
  }
  assert.equal(sweep.lost.length, 0, 'level 5 lost a star somewhere, which it should not have');
});

test('every star lost is a guess further out than three times the three-star band', () => {
  // The other half, reported rather than buried: levels 4 and 6 do take stars
  // away. Each one is a guess on the passing side that the bucket rule gave
  // two stars to however far out it was. If a loss ever lands closer in than
  // this, the amendment's "the losses are all far-off guesses" stops being true.
  for (const id of [4, 6]) {
    const { sweep } = analysed[id]();
    const band = level(id).stars.three.of;
    for (const row of sweep.lost) {
      assert.ok(Math.abs(row.error) > 2 * band,
        `level ${id} took a star from a guess only ${row.error.toFixed(4)} out`);
      assert.equal(row.old, 2);
      assert.equal(row.proposed, 1);
    }
  }
});
