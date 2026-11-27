// tests/launchWindow.test.js - docs/PRD.md's launch dates against each other,
// against CLAUDE.md, and against the git tag they all claim to come from.
//
// WHY THIS EXISTS. On 27 November 2026 the PRD counted every date from the day
// GitHub Pages first served the site and Hypothesis 3's window started at the
// `launch` tag, a day apart, and the collection window between them came to 59
// days against the 60 PREREG.md registers. Nothing could have caught it: both
// statements were individually true, in one document, and the suite holds code
// to data and data to the PRD's tables - not the PRD's prose to its own
// arithmetic. A person read the dates against each other. This is that reading,
// written down.
//
// WHAT IT DOES NOT DO. It does not check that 60 is the right number: that is
// registered in PREREG.md and is not ours to move. It checks that the document
// says one thing, and that the thing it says is what the arithmetic gives.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const read = (name) => readFileSync(fileURLToPath(new URL(name, root)), 'utf8');

const PRD = read('docs/PRD.md');
const CLAUDE = read('CLAUDE.md');

const DAY = 24 * 60 * 60 * 1000;
/** PREREG.md's registered collection window, in days. Not ours to change. */
const REGISTERED_DAYS = 60;
/**
 * Analytics Engine keeps rows about three months, so the last export has to
 * happen before that. docs/PRD.md fixes it at launch plus 80 days: the last
 * safe date rather than the intended one.
 */
const LAST_EXPORT_DAY = 80;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/**
 * A date as the PRD writes one: "27 November 2026, 22:20:16 UTC", or without
 * the time, "15 February 2027".
 *
 * Returns a Date, and throws rather than returning an Invalid Date, because a
 * date this file cannot read is a date nobody can check.
 */
export function prdDate(text) {
  const m = String(text).trim()
    .match(/^(\d{1,2}) ([A-Z][a-z]+) (\d{4})(?:, (\d{2}):(\d{2}):(\d{2}) UTC)?$/);
  assert.ok(m, `cannot read "${text}" as a date`);
  const [, day, month, year, hh = '00', mm = '00', ss = '00'] = m;
  const monthIndex = MONTHS.indexOf(month);
  assert.notEqual(monthIndex, -1, `"${month}" is not a month`);
  return new Date(Date.UTC(
    Number(year), monthIndex, Number(day), Number(hh), Number(mm), Number(ss),
  ));
}

/** One row of the launch-window table, by the label in its first cell. */
function tableRow(label) {
  const line = PRD.split('\n').find((l) => l.startsWith(`| **${label}**`) || l.startsWith(`| ${label} `));
  assert.ok(line, `docs/PRD.md has no launch-window row for "${label}"`);
  const cells = line.split('|').map((cell) => cell.trim());
  return cells[2].replace(/\*\*/g, '');
}

const launch = prdDate(tableRow('Launch'));
const closes = prdDate(tableRow('Collection closes'));
const exports = tableRow('Export runs').split(',')
  .map((part) => part.trim())
  .filter(Boolean)
  // "27 December 2026" splits cleanly; a time would not, and the export dates
  // deliberately carry none - they are days somebody runs a command on.
  .map(prdDate);

// ------------------------------------------------------- the arithmetic

test('collection closes exactly 60 days after launch', () => {
  // THE BUG THIS FILE EXISTS FOR. It was 59.
  const days = (closes - launch) / DAY;
  assert.equal(days, REGISTERED_DAYS,
    `the PRD's window is ${days} days; PREREG.md registers ${REGISTERED_DAYS}`);
  // To the second, not to the day: both ends carry a time and they must match,
  // or the window is 60 days give or take a few hours.
  assert.equal(closes.getTime() - launch.getTime(), REGISTERED_DAYS * DAY);
});

test('the three export dates are the schedule the PRD describes', () => {
  assert.equal(exports.length, 3, 'the PRD names a number of export runs other than three');

  // DAYS, NOT INSTANTS. An export is a day somebody runs a command on, and
  // the PRD writes those without a time; launch and the close carry one. The
  // first draft of this test compared an export against the close as
  // timestamps and failed on 22 hours and 20 minutes, which is the test being
  // wrong rather than the document.
  const dayOf = (date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const launchDay = dayOf(launch);
  const after = (date) => (dayOf(date) - launchDay) / DAY;

  // Monthly: the first is about a month in. A month is not a fixed number of
  // days, so this is a range rather than an equality - it is the one of the
  // three that is a cadence rather than a deadline.
  assert.ok(after(exports[0]) >= 28 && after(exports[0]) <= 31,
    `the first export is ${after(exports[0])} days after launch`);

  // The second IS the close. Milestone 4 says "when collection closes", and a
  // second date near it would be two claims about the same day.
  assert.equal(dayOf(exports[1]), dayOf(closes),
    'the middle export is not the day collection closes');

  // The last is the deadline, exactly.
  assert.equal(after(exports[2]), LAST_EXPORT_DAY,
    `the last export is ${after(exports[2])} days after launch; the PRD fixes it at ${LAST_EXPORT_DAY}`);

  // And they are in order, which a hand-written list can stop being.
  assert.deepEqual([...exports].sort((a, b) => a - b), exports, 'the export dates are out of order');
});

test('Hypothesis 3 states the same window as the table', () => {
  // The dates appear twice in one document, which is how they came apart the
  // first time. Point 4 of the test design carries them in prose.
  const sentence = PRD.split('\n').find((line) => line.includes('Data collection closes 60 days after launch.'));
  assert.ok(sentence, 'Hypothesis 3 no longer states when collection closes');
  const dates = sentence.match(/\d{1,2} [A-Z][a-z]+ \d{4}, \d{2}:\d{2}:\d{2} UTC/g) ?? [];
  assert.equal(dates.length, 2, `Hypothesis 3 names ${dates.length} dates, not the two bounds`);
  assert.equal(prdDate(dates[0]).getTime(), launch.getTime(),
    "Hypothesis 3's window starts somewhere other than launch");
  assert.equal(prdDate(dates[1]).getTime(), closes.getTime(),
    "Hypothesis 3's window ends somewhere other than the close");
});

test("CLAUDE.md's export dates are the PRD's export dates", () => {
  // These were stale for a day when the window was corrected, which is how a
  // second copy of a date behaves.
  const short = (date) => `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCFullYear()}`;
  for (const date of exports) {
    assert.ok(CLAUDE.includes(short(date)),
      `CLAUDE.md does not name the export run on ${short(date)}`);
  }
});

// --------------------------------------------- the document against the repo

test('the PRD\'s launch date is the launch tag\'s own timestamp', () => {
  // THE DEEPEST OF THESE: the document agreeing with the thing it describes.
  // Everything above holds the PRD to itself, and a document can be perfectly
  // consistent about a date that is not the tag's.
  let tagged;
  try {
    tagged = execFileSync('git', ['for-each-ref', '--format=%(taggerdate:iso-strict)', 'refs/tags/launch'],
      { cwd: fileURLToPath(root), encoding: 'utf8' }).trim();
  } catch {
    tagged = '';
  }
  if (tagged === '') {
    // A clone without tags, which is what `git clone --no-tags` and a CI
    // checkout without fetch-tags give. Not a failure - there is nothing to
    // compare - but it is said out loud so a silent skip cannot be mistaken
    // for a pass. .github/workflows/test.yml sets fetch-tags so that CI, the
    // one place this must run, always has it.
    console.log('      (no `launch` tag in this clone; run `git fetch --tags` to check it)');
    return;
  }
  assert.equal(new Date(tagged).getTime(), launch.getTime(),
    `the tag is ${tagged} and docs/PRD.md says ${launch.toISOString()}`);
});
