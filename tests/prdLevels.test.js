// tests/prdLevels.test.js - levels.json against the level tables in docs/PRD.md.
//
// THE SPEC IS READ, NOT COPIED, which is the same thing the crash-window tests
// in tests/crash.test.js do and for the same reason. Every threshold, bucket edge
// and star band in this game is registered: docs/PRD.md says each one "is fixed
// before the level is built, never tuned once results are in". A test carrying
// its own copy of those numbers agrees with whatever it was last edited to agree
// with, and the thing worth catching is the file and the spec drifting apart.
// Reading the tables means a change to either side has to be matched on the
// other, or this fails.
//
// WHAT WENT WRONG WITHOUT IT. The Milestone 2 review (BUILD_LOG.md 2.22) found
// the PRD describing level 7's stars as bands of 1 and 0.5 when the level had
// been built on counts of three guesses - the implementation was right and the
// spec described a scheme that cannot work, and nothing in the suite compared
// them. It also found level 6's 4-holding rule missing from the spec entirely,
// then level 4's. Each was found by a person reading two files side by side,
// which is exactly the work a test should be doing.
//
// WHAT THIS CANNOT DO is check that a threshold is a GOOD threshold. Whether
// each level still has three winning designs is scripts/check_levels.mjs's job
// against real prices; this file only holds the two written records to each
// other.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { validateLevels } from '../js/levels.js';

const root = new URL('..', import.meta.url);
const read = (name) => readFileSync(fileURLToPath(new URL(name, root)), 'utf8');

const PRD = read('docs/PRD.md');
const LEVELS = validateLevels(JSON.parse(read('levels.json')));
const levelById = (id) => {
  const level = LEVELS.levels.find((l) => l.id === id);
  assert.ok(level, `levels.json has no level ${id}`);
  return level;
};

// --------------------------------------------------------------- the parse

/**
 * A number as the PRD writes one, in the measure's own units.
 *
 * "35%" is 0.35 and "5 points" is 0.05, because a share of risk is written as a
 * percent in prose and held as a fraction in the file. "half" is 0.5: level 6's
 * pass condition is "fell less than half as much as the S&P 500", and the number
 * it turns on is a word.
 *
 * The minus is U+2212, which is what the document uses in "−1 to 1".
 */
function numberIn(text) {
  // "half" is 0.5, and it has to win against any digits in the same sentence:
  // level 6's condition is "fell less than half as much as the S&P 500", where
  // the only numeral is part of the index's name.
  if (/\b(less|more) than half\b/.test(text)) return 0.5;
  const match = text.match(/(−|-)?(\d+(?:\.\d+)?)\s*(%|points?)?/);
  if (!match) return null;
  const value = Number(match[2]) * (match[1] ? -1 : 1);
  return match[3] ? value / 100 : value;
}

/** Every number in a cell, in the same units. */
function numbersIn(text) {
  return [...text.matchAll(/(−|-)?(\d+(?:\.\d+)?)\s*(%|points?)?/g)]
    .map((m) => Number(m[2]) * (m[1] ? -1 : 1) / (m[3] ? 100 : 1));
}

/**
 * Which way a pass condition compares, from the words it is written in.
 *
 * "No holding carries more than 35%" is a ceiling and reads `<=`; "under 0.5" is
 * strict. The distinction is the whole of docs/PRD.md's rule that "a portfolio
 * that fell exactly half as much did not fall LESS than half as much", so it is
 * read from the sentence rather than assumed.
 */
function comparisonIn(text) {
  if (/^no\b.*\bmore than\b/i.test(text)) return '<=';
  if (/\bunder\b|\bless than\b|\bbelow\b/i.test(text)) return '<';
  if (/\bor more\b|\bat least\b|\band above\b/i.test(text)) return '>=';
  return null;
}

/**
 * The rows of the markdown table under a given header, as arrays of cells.
 *
 * ANCHORED ON THE HEADER, because the two tables this file reads have the SAME
 * row shape - "| 1. Two of a kind | ... |", five columns each - and a pattern
 * loose enough to match one matches both. The first version of this file did
 * exactly that and read ten rows where it expected seven, which is a better
 * failure than silently checking the scoring table against the level table's
 * rules, but only just.
 */
function tableAfter(header) {
  const at = PRD.indexOf(header);
  assert.notEqual(at, -1, `docs/PRD.md has no table headed "${header}"`);
  const lines = PRD.slice(at).split('\n');
  const rows = [];
  // Skip the header and its | --- | separator, then take rows until the table
  // ends at the first line that is not one.
  for (const line of lines.slice(2)) {
    if (!line.startsWith('|')) break;
    rows.push(line.split('|').slice(1, -1).map((cell) => cell.trim()));
  }
  assert.ok(rows.length > 0, `the table headed "${header}" has no rows`);
  return rows;
}

/** The main level table: id, title, challenge and pass condition. */
function prdLevelTable() {
  const rows = tableAfter('| Level | Concept | Challenge | Pass condition |');
  assert.equal(rows.length, 7, 'the PRD level table does not have seven levels');
  return rows.map(([level, concept, challenge, pass]) => {
    const named = level.match(/^(\d)\. (.+)$/);
    assert.ok(named, `"${level}" is not a numbered level`);
    return {
      id: Number(named[1]),
      title: named[2].trim(),
      concept,
      challenge,
      pass,
    };
  });
}

/**
 * The scoring table, for the three levels whose answer is not a bets count.
 *
 * FIVE COLUMNS SINCE THE AMENDMENT of 27 November 2026. The two-star rule and
 * the buckets used to be one column, because on every row the rule WAS the
 * buckets. On levels 4 and 5 it is now a distance while the buckets stay and
 * are still named on the reveal, so they are two separate things and the table
 * says so.
 */
function prdScoringTable() {
  const rows = tableAfter(
    '| Level | The answer it asks for | 2 stars: the right bucket, or a distance '
    + '| 3 stars: within | The three buckets, named on every reveal |',
  );
  assert.equal(rows.length, 3, 'the PRD scoring table does not have three levels');
  return Object.fromEntries(rows.map(([level, answer, two, within, buckets]) => [
    Number(level.match(/^(\d)\./)[1]), { answer, two, within, buckets },
  ]));
}

/** The paragraph of the PRD containing a phrase, so prose facts can be read. */
function lineWith(phrase) {
  const at = PRD.indexOf(phrase);
  assert.notEqual(at, -1, `docs/PRD.md no longer says "${phrase}"`);
  const start = PRD.lastIndexOf('\n', at) + 1;
  const end = PRD.indexOf('\n', at);
  return PRD.slice(start, end === -1 ? undefined : end);
}

/**
 * Just the sentence containing a phrase.
 *
 * A paragraph can hold two rules - "Levels 2 and 3 ... keep the bands of 1 and
 * 0.5. Level 6 answers with a ratio of losses..." is one line and two facts -
 * and reading the levels out of the whole paragraph picked up 6 as well.
 */
function sentenceWith(phrase) {
  const line = lineWith(phrase);
  const sentence = line.split(/(?<=\.)\s+/).find((part) => part.includes(phrase));
  assert.ok(sentence, `"${phrase}" spans more than one sentence`);
  return sentence;
}

// ------------------------------------------------------- the level table

test('the PRD table and levels.json list the same seven levels, by title', () => {
  const table = prdLevelTable();
  assert.deepEqual(table.map((row) => row.id), LEVELS.levels.map((l) => l.id));
  for (const row of table) {
    assert.equal(levelById(row.id).title, row.title,
      `level ${row.id} is "${levelById(row.id).title}" in levels.json`);
  }
});

test('every pass condition in the PRD is the rule levels.json applies', () => {
  for (const row of prdLevelTable()) {
    const level = levelById(row.id);

    // Two levels do not pass on a threshold, and say so in words.
    if (/make a guess/i.test(row.pass)) {
      assert.equal(level.pass.measure, 'guess', `level ${row.id} should pass on making a guess`);
      continue;
    }
    // "All 3 guesses within 1" carries two numbers: how many guesses, and the
    // band each has to be inside. numberIn() takes the first of any cell, so
    // both are read by name here rather than by position.
    const series = row.pass.match(/^all (\d+) guesses within (\d+(?:\.\d+)?)$/i);
    if (series) {
      assert.equal(level.pass.measure, 'series', `level ${row.id} should be scored as a series`);
      assert.equal(level.pass.test, 'allWithin');
      assert.equal(level.series?.count, Number(series[1]),
        `level ${row.id}: the PRD asks for ${series[1]} guesses`);
      assert.equal(level.pass.of, Number(series[2]),
        `level ${row.id}: the PRD says "${row.pass}"`);
      continue;
    }

    assert.equal(level.pass.comparison, comparisonIn(row.pass),
      `level ${row.id}: "${row.pass}" does not read as ${level.pass.comparison}`);
    assert.equal(level.pass.threshold, numberIn(row.pass),
      `level ${row.id}: the PRD says "${row.pass}"`);
  }
});

test('every holdings count the PRD states is the count levels.json requires', () => {
  let stated = 0;
  for (const row of prdLevelTable()) {
    const level = levelById(row.id);
    // "Pick two holdings", "Build a 5-holding portfolio", "Build any 4-holding
    // portfolio", "Guess the bets in 3 mystery portfolios".
    const written = row.challenge.match(/\b(two|three|four|five|\d+)[- ]holding/i)
      ?? row.challenge.match(/\bpick (two|three|four|five)\b/i);
    if (!written) continue;
    stated += 1;
    const words = { two: 2, three: 3, four: 4, five: 5 };
    const wanted = words[written[1].toLowerCase()] ?? Number(written[1]);
    assert.equal(level.holdings?.exactly, wanted,
      `level ${row.id}: the PRD says "${row.challenge}" but levels.json asks for `
      + `${level.holdings?.exactly}`);
  }
  // EVERY LEVEL THAT FIXES A COUNT HAS TO STATE IT. The review found levels 6 and
  // then 4 requiring exactly 4 holdings with the PRD silent on both - a real pass
  // condition no reader of the spec could have predicted. This is the assertion
  // that makes the next one impossible rather than merely unlikely.
  const fixing = LEVELS.levels.filter((l) => Number.isInteger(l.holdings?.exactly));
  assert.equal(stated, fixing.length,
    `${fixing.length} levels fix a holdings count and the PRD's table states ${stated} of them: `
    + `${fixing.map((l) => l.id).join(', ')}`);
});

test('every minimum share the PRD states is the floor levels.json puts under it', () => {
  for (const row of prdLevelTable()) {
    const level = levelById(row.id);
    // "Keep at least 30% in QQQ" - a floor under one named holding.
    const named = row.challenge.match(/at least (\d+)% in ([A-Z]{1,5})\b/);
    if (named) {
      assert.equal(level.holdings?.minShare?.[named[2]], Number(named[1]) / 100,
        `level ${row.id}: the PRD asks for ${named[1]}% in ${named[2]}`);
      assert.ok((level.holdings?.required ?? []).includes(named[2]),
        `level ${row.id}: ${named[2]} carries a floor, so it has to be dealt and kept`);
    }
    // "at least 60% in stocks" - a floor on a kind.
    const kind = row.challenge.match(/at least (\d+)% in (stocks)\b/);
    if (kind) {
      assert.equal(level.holdings?.minShareIn?.share, Number(kind[1]) / 100,
        `level ${row.id}: the PRD asks for ${kind[1]}% in ${kind[2]}`);
      assert.equal(level.holdings?.minShareIn?.kind, kind[2]);
    }
  }
});

// ----------------------------------------------------- the scoring table

test('every level gives 1 star for passing, as the PRD says of all of them', () => {
  assert.match(sentenceWith('each level gives 1 star for passing'), /1 star for passing/);
  for (const level of LEVELS.levels) {
    assert.equal(level.stars.pass, 1, `level ${level.id} does not give 1 star for passing`);
  }
});

test("the scoring table's 3-star distances are the bands levels.json awards", () => {
  for (const [id, row] of Object.entries(prdScoringTable())) {
    const level = levelById(Number(id));
    assert.equal(level.stars.three.test, 'within', `level ${id} should score 3 stars on a distance`);
    assert.equal(level.stars.three.of, numberIn(row.within),
      `level ${id}: the PRD says 3 stars within "${row.within}"`);
  }
});

test("the scoring table's 2-star rule is the one levels.json applies", () => {
  // Level 1 still scores its second star on the bucket; levels 4 and 5 score
  // it on twice their own three-star band, after the amendment of 27 November
  // 2026. The table says which, per row, and this holds the file to it.
  for (const [id, row] of Object.entries(prdScoringTable())) {
    const level = levelById(Number(id));
    if (/the right bucket/.test(row.two)) {
      assert.equal(level.stars.two.test, 'bucket', `level ${id}: the PRD says 2 stars for the bucket`);
      continue;
    }
    assert.equal(level.stars.two.test, 'within', `level ${id}: the PRD says 2 stars for a distance`);
    assert.equal(level.stars.two.of, numberIn(row.two),
      `level ${id}: the PRD says 2 stars within "${row.two}"`);
  }
});

test('a two-star distance is exactly twice the three-star one, as the amendment says', () => {
  // "No new distance is introduced - each level takes double its own
  // registered three-star band." The ratio is the one levels 2 and 3 have used
  // since they were built, and this is what keeps that claim true in the file
  // rather than only in the prose.
  const amended = LEVELS.levels.filter((level) => Array.isArray(level.buckets)
    && level.stars.two.test === 'within');
  assert.deepEqual(amended.map((level) => level.id), [4, 5, 6],
    'the set of levels scoring a bucket level on a distance has changed');
  for (const level of amended) {
    assert.equal(level.stars.two.of, level.stars.three.of * 2,
      `level ${level.id}: ${level.stars.two.of} is not twice ${level.stars.three.of}`);
  }
  // And the ratio it copies is still what levels 2 and 3 do.
  for (const id of [2, 3]) {
    const level = levelById(id);
    assert.equal(level.stars.two.of, level.stars.three.of * 2);
  }
});

test("the scoring table's bucket edges are the buckets levels.json defines", () => {
  for (const [id, row] of Object.entries(prdScoringTable())) {
    const level = levelById(Number(id));
    // THE BUCKETS OUTLIVED THE STAR THEY USED TO EARN. Every edge in this
    // table is still in levels.json and still named on the reveal; what the
    // amendment of 27 November 2026 changed is only whether naming the right
    // one is worth the second star, and only on levels 4, 5 and 6.
    assert.ok(Array.isArray(level.buckets), `level ${id} has no buckets`);

    // The edges are the bucket floors, leaving out the lowest bucket's: it is
    // either null or the guess range's own bottom, and means "everything below".
    const edges = level.buckets
      .map((bucket) => bucket.min)
      .filter((min) => min !== null && min !== level.guess.min)
      .sort((a, b) => a - b);
    // Two edges make three buckets, which is what the PRD asks for throughout.
    assert.equal(level.buckets.length, 3, `level ${id} does not have three buckets`);

    // Every number in the PRD's cell that is not part of its prose aside: the
    // cell names the two edges, each of them twice, as the top of one band and
    // the bottom of the next.
    const written = [...new Set(numbersIn(row.buckets.split('—')[0]))].sort((a, b) => a - b);
    assert.deepEqual(edges, written,
      `level ${id}: the PRD's buckets read "${row.buckets.split('—')[0].trim()}"`);
  }
});

test("the scoring table's answer ranges are the ranges the slider offers", () => {
  for (const [id, row] of Object.entries(prdScoringTable())) {
    const level = levelById(Number(id));
    // "A correlation, −1 to 1", "Beta to the AI basket, 0 to 1.5", "The biggest
    // holding's share of risk, 25% to 100%".
    const range = row.answer.match(/(−?\d+(?:\.\d+)?%?) to (\d+(?:\.\d+)?%?)/);
    assert.ok(range, `level ${id}: no range found in "${row.answer}"`);
    assert.equal(level.guess.min, numberIn(range[1]), `level ${id}: the PRD's range starts at ${range[1]}`);
    assert.equal(level.guess.max, numberIn(range[2]), `level ${id}: the PRD's range ends at ${range[2]}`);
  }
});

// -------------------------------------------- the bands written in prose

test('levels 2 and 3 keep the bands of 1 and 0.5', () => {
  const sentence = sentenceWith('keep the bands of 1 and 0.5');
  const ids = [...sentence.matchAll(/Levels? (\d)(?: and (\d))?/g)]
    .flatMap((m) => [m[1], m[2]]).filter(Boolean).map(Number);
  assert.deepEqual(ids, [2, 3], `the PRD now says "${sentence.slice(0, 60)}"`);
  for (const id of ids) {
    const level = levelById(id);
    assert.equal(level.stars.two.test, 'within');
    assert.equal(level.stars.two.of, 1, `level ${id}: 2 stars should be within 1 bet`);
    assert.equal(level.stars.three.test, 'within');
    assert.equal(level.stars.three.of, 0.5, `level ${id}: 3 stars should be within half a bet`);
  }
});

test("level 6's buckets and bands are the ones the PRD writes down", () => {
  // Level 6 has no row in the scoring table - it is described in prose,
  // because it is the one level measured over a crash window. The amendment of
  // 27 November 2026 gave it a two-star distance like levels 4 and 5, so the
  // sentence now states both bands and the buckets it still names.
  const sentence = lineWith('its bands are fixed when it is built');
  const level = levelById(6);
  const written = sentence.slice(sentence.indexOf('fixed when it is built'));
  const edges = level.buckets
    .map((bucket) => bucket.min)
    .filter((min) => min !== null && min !== level.guess.min)
    .sort((a, b) => a - b);
  for (const edge of edges) {
    assert.ok(written.includes(edge.toFixed(2)),
      `level 6's bucket edge ${edge.toFixed(2)} is not in the PRD's sentence`);
  }
  const three = written.match(/3 stars within (\d+(?:\.\d+)?)/);
  assert.ok(three, "the PRD does not state level 6's 3-star band");
  assert.equal(level.stars.three.of, Number(three[1]));

  const two = written.match(/2 stars within (\d+(?:\.\d+)?)/);
  assert.ok(two, "the PRD does not state level 6's 2-star band");
  assert.equal(level.stars.two.test, 'within');
  assert.equal(level.stars.two.of, Number(two[1]));
  assert.equal(level.stars.two.of, level.stars.three.of * 2, 'twice the band, as the amendment says');
});

test("level 7's bands are counts of three guesses, as the PRD now describes them", () => {
  // The whole paragraph: the reason is in its first sentence and the bands are
  // in its last, which is the right way round for a reader and means this one
  // cannot be read a sentence at a time.
  const sentence = lineWith('Level 7 scores on three guesses, not one');
  const level = levelById(7);

  // 2 stars for two of the three within 0.5; 3 stars for all three within 0.5.
  const two = sentence.match(/2 stars for two of the three guesses within (\d+(?:\.\d+)?)/);
  const three = sentence.match(/3 stars for all three within (\d+(?:\.\d+)?)/);
  assert.ok(two && three, `the PRD no longer states level 7's bands: "${sentence.slice(0, 80)}"`);

  assert.equal(level.stars.two.test, 'countWithin');
  assert.equal(level.stars.two.of, Number(two[1]));
  assert.equal(level.stars.two.atLeast, 2);
  assert.equal(level.stars.three.test, 'countWithin');
  assert.equal(level.stars.three.of, Number(three[1]));
  assert.equal(level.stars.three.atLeast, level.series.count);

  // AND THE REASON THE PRD GIVES IS STILL TRUE OF THE FILE: a 2-star band of
  // "within 1" would be the pass rule a second time. If the pass rule ever
  // stopped being "all three within 1", that argument would need rewriting.
  assert.equal(level.pass.of, 1, "level 7's pass rule is no longer all three within 1");
  assert.notEqual(level.stars.two.of, level.pass.of,
    'the 2-star band is the pass rule again, which is what the PRD says it must not be');
});

// ------------------------------------------------------------ the pool

test('the pool of 20 the PRD registers is the pool levels.json carries', () => {
  const sentence = sentenceWith('drawn at random from one pool of 20');
  assert.match(sentence, /level 2's portfolio and the first of level 7's mystery portfolios/i);
  assert.equal(LEVELS.guessPool.portfolios.length, 20,
    'the registered pool is 20 portfolios');
  // And the PRD's own level table says the same thing in its own words.
  const row = prdLevelTable().find((r) => r.id === 2);
  assert.equal(numberIn(row.challenge.match(/pool of (\d+)/)[0]), 20);
});
