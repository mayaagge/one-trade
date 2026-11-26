// tests/workflow.test.js - the refresh workflow's failure wiring.
//
// WHY A TEST FOR A YAML FILE. The refresh job runs unattended at 18:30 New York
// and nobody reads a green log, so the one thing that must not break quietly is
// the bit that decides whether the run is green. Two bugs are easy to write
// there and impossible to notice:
//
//   1. `continue-on-error: true` rewrites a failed step's CONCLUSION to success
//      - that is what it is for - and leaves its OUTCOME as failure. A gate
//        written on `conclusion` is green every single time, including the
//        evening everything broke.
//   2. A step that can fail on DATA rather than on code, and is not
//      continue-on-error, skips every step after it. That is how one lagging
//      ticker used to take the puzzle build, the tests and the commit with it.
//
// There is no YAML parser in this project and adding one for this would be a
// dependency for a handful of lines (CLAUDE.md rule 8), so the file is read as
// text. That is enough: every check below is about which words appear in the
// gate, and the gate's own expression is pulled out and EVALUATED against made-up
// step outcomes, so this tests what the condition does and not only how it reads.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = (name) => fileURLToPath(new URL(`../${name}`, import.meta.url));
const REFRESH = readFileSync(path('.github/workflows/refresh.yml'), 'utf8');
const TESTS_WORKFLOW = readFileSync(path('.github/workflows/test.yml'), 'utf8');

/** The steps that may fail on data and must therefore not stop the job. */
const DATA_STEPS = ['stale', 'rebuild', 'puzzle', 'levelcheck', 'poolcheck', 'crossfetch'];

/** The gate's `if:` expression, as written in the file. */
function gateExpression() {
  const match = /- name: Go red if anything above failed\n\s+if: >-\n([\s\S]*?)\n\s+run: \|/.exec(REFRESH);
  assert.ok(match, 'the "Go red if anything above failed" step has no `if: >-` block');
  return match[1].split('\n').map((line) => line.trim()).join(' ').trim();
}

/**
 * Evaluate the gate the way Actions would, for a made-up set of outcomes.
 * The expression is a chain of `steps.<id>.outcome == 'failure'` joined by `||`,
 * which is a subset of both languages, so translating it is three replacements.
 */
function gateFires(outcomes) {
  const js = gateExpression().replaceAll('==', '===').replaceAll("'", '"');
  const steps = Object.fromEntries(
    DATA_STEPS.map((id) => [id, { outcome: outcomes[id] ?? 'success' }]),
  );
  // eslint-disable-next-line no-new-func
  return Function('steps', `"use strict"; return (${js});`)(steps);
}

// ------------------------------------------------------------------ the gate

test('the gate reads outcome, never conclusion', () => {
  const expression = gateExpression();
  for (const id of DATA_STEPS) {
    assert.ok(
      expression.includes(`steps.${id}.outcome == 'failure'`),
      `the gate does not test steps.${id}.outcome, so that step could fail silently`,
    );
  }
  assert.ok(
    !/steps\.\w+\.conclusion/.test(REFRESH),
    'the workflow reads a step conclusion somewhere. With continue-on-error a failed step\'s '
    + 'conclusion is "success", so a check on it is always green.',
  );
});

test('a failed rebuild turns the run red', () => {
  assert.equal(gateFires({ rebuild: 'failure' }), true);
});

test('a failed puzzle build turns the run red, with the prices already committed', () => {
  assert.equal(gateFires({ puzzle: 'failure' }), true);
});

test('each data step on its own turns the run red', () => {
  for (const id of DATA_STEPS) {
    assert.equal(gateFires({ [id]: 'failure' }), true, `${id} failing does not colour the run`);
  }
});

test('an ordinary evening stays green', () => {
  assert.equal(gateFires({}), false);
  // A fetch that failed leaves rebuild and levelcheck skipped, not failed.
  assert.equal(gateFires({ rebuild: 'skipped', levelcheck: 'skipped' }), false);
});

test('the gate would be blind if it were written on conclusion', () => {
  // The bug this file exists for, demonstrated rather than described: with
  // continue-on-error, conclusion is "success" even when the step failed.
  const asWritten = gateExpression();
  const broken = asWritten.replaceAll('.outcome', '.conclusion').replaceAll('==', '===').replaceAll("'", '"');
  const stepsAfterContinueOnError = Object.fromEntries(
    DATA_STEPS.map((id) => [id, { outcome: 'failure', conclusion: 'success' }]),
  );
  // eslint-disable-next-line no-new-func
  const fires = Function('steps', `"use strict"; return (${broken});`)(stepsAfterContinueOnError);
  assert.equal(fires, false, 'the conclusion-based gate is supposed to be the blind one');
  assert.equal(gateFires(Object.fromEntries(DATA_STEPS.map((id) => [id, 'failure']))), true);
});

// ------------------------------------------------------- the steps themselves

test('every step that can fail on data carries continue-on-error', () => {
  for (const id of DATA_STEPS) {
    const block = new RegExp(`id: ${id}\\n(?:\\s+(?:if|env|continue-on-error):[^\\n]*\\n)*`).exec(REFRESH);
    assert.ok(block, `no step has id: ${id}`);
    assert.ok(
      block[0].includes('continue-on-error: true'),
      `the "${id}" step is not continue-on-error, so a bad evening would skip every step after it`,
    );
  }
});

test('the tests are the one hard gate, and the commit says so out loud', () => {
  const testStep = /- name: Run the tests\n\s+id: tests\n([\s\S]*?)\n\n/.exec(REFRESH);
  assert.ok(testStep, 'there is no step with id: tests');
  assert.ok(
    !testStep[1].includes('continue-on-error'),
    'the test step is continue-on-error, so broken code could commit data',
  );
  // Implied by the step order anyway, but written down so that adding
  // continue-on-error above cannot quietly start committing on red tests.
  for (const name of ['Refuse to commit anything but', 'Commit, if the data changed']) {
    const step = new RegExp(`- name: ${name}[^\\n]*\\n\\s+if: ([^\\n]+)`).exec(REFRESH);
    assert.ok(step, `no step named ${name}`);
    assert.equal(step[1].trim(), "steps.tests.outcome == 'success'");
  }
});

test('the pre-commit test run defers the two-fetch comparisons, and something runs them later', () => {
  assert.match(REFRESH, /ONE_TRADE_SKIP_CROSS_FETCH: '1'/);
  const after = REFRESH.slice(REFRESH.indexOf('- name: Commit, if the data changed'));
  assert.match(after, /id: crossfetch/, 'nothing runs the deferred tests after the commit');
  for (const file of ['tests/liveRolling.test.js', 'tests/research.test.js', 'tests/crash.test.js']) {
    assert.ok(after.includes(file), `${file} holds a deferred test but is never run after the commit`);
  }
  // And the flag is only ever SET once - mentions in comments do not count,
  // but a second step quietly setting it would mean tests nothing ever runs.
  assert.equal((REFRESH.match(/^\s+ONE_TRADE_SKIP_CROSS_FETCH:/gm) ?? []).length, 1);
  assert.ok(
    !TESTS_WORKFLOW.includes('ONE_TRADE_SKIP_CROSS_FETCH'),
    'the Tests workflow skips the two-fetch comparisons; there it reads the committed file and should run them',
  );
});

test('both workflows check out deep enough for the puzzle freeze check', () => {
  for (const [name, text] of [['refresh.yml', REFRESH], ['test.yml', TESTS_WORKFLOW]]) {
    assert.match(text, /fetch-depth: 2/, `${name} does not fetch the parent commit`);
  }
});

test('the actions run on a supported Node runtime', () => {
  // actions/setup-python v5 targets Node 20, which the runner forces onto Node
  // 24 with a deprecation warning on every run.
  assert.ok(
    !/setup-python@v[1-6]\b/.test(REFRESH),
    'actions/setup-python is on a version that targets Node 20',
  );
  assert.match(REFRESH, /setup-python@v7/);
});
