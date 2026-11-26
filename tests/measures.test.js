// tests/measures.test.js - the measures Sandbox and My real portfolio show,
// against numpy.
//
// The expected numbers come from tests/fixtures/known_answers.json's
// stress_window block, computed by tests/make_fixtures.py. The two share nothing
// but that file.
//
// WHAT IS ACTUALLY NEW HERE, and so what these tests are really for. Effective
// bets, risk shares, correlation and beta are js/math.js's and are already
// checked by tests/math.test.js; measureAll() only assembles them. The new part
// is the SELECTION rule - which 75 of 756 days are market stress days - and the
// WINDOW it is applied to. Both are the kind of thing that is wrong silently:
// the worst 10% of the file rather than of the window is still 10% of something,
// still produces a plausible beta, and is still wrong.
//
// So the fixture carries an 800-row game.json-shaped document and every case
// slices 756 rows out of it. A test handed a ready-made 756-row matrix would
// pass either way.
//
// Educational, not investment advice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  BETS_NOTE,
  DISCLAIMER,
  betaOnDays,
  measureAll,
  stressDayIndices,
  stressRules,
  stressTestLoss,
} from '../js/measures.js';
import { validateLevels, validateStressTest } from '../js/levels.js';
import { groupIndex } from '../js/why.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const readJson = (name) => JSON.parse(readFileSync(join(root, name), 'utf8'));

const fixtures = JSON.parse(readFileSync(join(here, 'fixtures', 'known_answers.json'), 'utf8'));
const STRESS = fixtures.stress_window;
const REL = fixtures.tolerance.relative;   // 1e-9, CLAUDE.md rule 3
const ABS = fixtures.tolerance.absolute;   // 1e-12

const LEVELS = validateLevels(readJson('levels.json'));
const TICKERS = readJson('tickers.json');

function assertClose(actual, expected, what) {
  assert.equal(Number.isFinite(actual), true, `${what}: expected a finite number, got ${actual}`);
  const diff = Math.abs(actual - expected);
  const scale = Math.max(Math.abs(expected), Math.abs(actual));
  const ok = scale < 1 ? diff <= Math.max(ABS, scale * REL) : diff / scale <= REL;
  assert.equal(ok, true, `${what}: expected ${expected}, got ${actual} (difference ${diff})`);
}

function assertVectorClose(actual, expected, what) {
  assert.equal(actual.length, expected.length, `${what}: wrong length`);
  expected.forEach((value, i) => assertClose(actual[i], value, `${what}[${i}]`));
}

/**
 * The fixture's document, in data/game.json's own shape: meta, a tickers list
 * and one row per trading day. Built here rather than stored that way so the
 * fixture stays readable as columns.
 */
function fixtureGame() {
  return {
    meta: {
      days: STRESS.dates.length,
      firstDate: STRESS.dates[0],
      liveThrough: STRESS.dates[STRESS.dates.length - 1],
      liveLabel: `Live prices through ${STRESS.dates[STRESS.dates.length - 1]}`,
      calendarTicker: STRESS.benchmark,
    },
    tickers: STRESS.tickers,
    rows: STRESS.dates.map((date, day) => [
      date,
      ...STRESS.tickers.map((ticker) => STRESS.columns[ticker][day]),
    ]),
  };
}

/** The fixture's levels file: the real window, the real stress rules. */
const fixtureLevels = {
  window: { days: STRESS.window_days, minDays: LEVELS.window.minDays },
  stressTest: {
    shock: STRESS.shock,
    stressDays: { fraction: STRESS.fraction, benchmark: STRESS.benchmark },
  },
};

// --- the selection rule, on series small enough to count by eye -------------

for (const c of STRESS.selection_cases) {
  test(`stress days: ${c.name}`, () => {
    if (c.expected_error) {
      assert.throws(
        () => stressDayIndices(c.returns, c.fraction),
        new RegExp(c.expected_error),
        `${c.name}: ${c.description}`,
      );
      return;
    }
    const days = stressDayIndices(c.returns, c.fraction);
    assert.equal(days.length, c.expected_count, `${c.name}: wrong number of stress days`);
    assert.deepEqual(days, c.expected_indices, `${c.name}: ${c.description}`);
  });
}

test('the stress days come back in date order, not worst-first', () => {
  // Day 15 is the worst in the tie case; it comes LAST because 5 and 12 are
  // earlier days. A caller slices matrix rows with these.
  const c = STRESS.selection_cases.find((x) => x.name === 'selection_tie_at_the_cut');
  const days = stressDayIndices(c.returns, c.fraction);
  assert.deepEqual(days, [...days].sort((a, b) => a - b), 'not ascending');
  assert.equal(days[days.length - 1], 15, 'the worst day should be last, by date');
});

test('a day with no return is refused rather than ranked as a zero', () => {
  const returns = [0.01, -0.02, null, -0.05, 0.00, 0.02, -0.01, 0.04, -0.03, 0.01,
    0.02, -0.06, 0.01, -0.04, 0.00, 0.03, -0.02, 0.01, -0.05, 0.02];
  assert.throws(() => stressDayIndices(returns, 0.10), /no return on day 2/);
});

test('a fraction outside 0 to 1 is refused', () => {
  const returns = Array.from({ length: 100 }, (_, i) => (i % 7) * -0.001);
  for (const fraction of [0, 1, 1.5, -0.1, NaN]) {
    assert.throws(() => stressDayIndices(returns, fraction), /between 0 and 1/);
  }
});

// --- the loss ---------------------------------------------------------------

test('the stress-test loss is value x beta x shock, and a loss is negative', () => {
  // Hand-derivable: $10,000 at a beta of 1 in a 20% fall loses $2,000.
  assertClose(stressTestLoss(10000, 1, -0.20), -2000, 'the whole-market case');
  assertClose(stressTestLoss(10000, 0.5, -0.20), -1000, 'half the beta, half the loss');
  assertClose(stressTestLoss(7500, 1.4, -0.20), -2100, 'a levered portfolio');
});

test('a positive shock is refused: the scenario is a fall', () => {
  assert.throws(() => stressTestLoss(10000, 1, 0.20), /negative fall/);
});

// --- the whole chain, over a window sliced out of a longer file --------------

for (const c of STRESS.cases) {
  const dollars = Object.fromEntries(c.holdings.map((t, i) => [t, c.dollars[i]]));

  test(`${c.name}: the window and the stress days match numpy`, () => {
    const result = measureAll({
      game: fixtureGame(),
      dollars,
      basket: STRESS.basket_members,
      levels: fixtureLevels,
    });
    assert.equal(result.days, c.expected.days, c.description);
    assert.equal(result.startDate, c.expected.start_date, 'window start');
    assert.equal(result.endDate, c.expected.end_date, 'window end');
    assert.equal(result.stress.count, c.expected.stress_day_count, 'how many stress days');
    assert.deepEqual(result.stress.days, c.expected.stress_day_indices, 'which days');
    assert.deepEqual(result.stress.dates, c.expected.stress_day_dates, 'the dates of those days');
  });

  test(`${c.name}: every measure matches numpy`, () => {
    const result = measureAll({
      game: fixtureGame(),
      dollars,
      basket: STRESS.basket_members,
      levels: fixtureLevels,
    });
    assertClose(result.bets, c.expected.effective_bets, 'effective bets');
    assertVectorClose(
      result.holdings.map((holding) => holding.riskShare),
      c.expected.risk_shares,
      'risk shares',
    );
    assertVectorClose(result.holdings.map((h) => h.dollarShare), c.weights, 'dollar shares');
    c.expected.correlation.forEach((row, i) => {
      assertVectorClose(result.correlations[i], row, `correlation row ${i}`);
    });
    // Beta over every day, and over the stress days only. js/measures.js sums
    // both from the holdings' own contributions while numpy takes them off the
    // weighted portfolio series - two routes to the same identity, so this also
    // checks that beta really is linear in the weights on a 75-day subset.
    assertClose(result.beta.allDays, c.expected.beta_all_days, 'beta, all days');
    assertClose(result.beta.stressDays, c.expected.beta_stress_days, 'beta, stress days');
    assertClose(result.loss.atAllDays, c.expected.loss_all_days, 'loss at the all-days beta');
    assertClose(result.loss.atStressDays, c.expected.loss_stress_days, 'loss at the stress beta');
  });

  if (c.expected_exact) {
    test(`${c.name}: the hand-derivable answers are exact`, () => {
      const result = measureAll({
        game: fixtureGame(),
        dollars,
        basket: STRESS.basket_members,
        levels: fixtureLevels,
      });
      assertClose(result.beta.allDays, c.expected_exact.beta_all_days, 'beta is exactly 1');
      assertClose(result.beta.stressDays, c.expected_exact.beta_stress_days,
        'subsetting days cannot change an identity');
      assertClose(result.loss.atAllDays, c.expected_exact.loss_all_days, 'the whole shock');
    });
  }
}

test('the 10% is of the window, not of the file', () => {
  // The late-listing case: 800 rows in the file, a 500-day window, 50 stress
  // days. Code that took 10% of the file would say 80 - this is the correction
  // the fixture exists to hold.
  const c = STRESS.cases.find((x) => x.name === 'stress_window_cut_short_by_a_late_listing');
  const result = measureAll({
    game: fixtureGame(),
    dollars: Object.fromEntries(c.holdings.map((t, i) => [t, c.dollars[i]])),
    basket: STRESS.basket_members,
    levels: fixtureLevels,
  });
  assert.equal(STRESS.dates.length, 800, 'the fixture file should be longer than the window');
  assert.equal(result.days, 500, 'the window');
  assert.equal(result.stress.count, 50, 'stress days are 10% of the 500, not of the 800');
});

test('the window is the 756 levels.json asks for, never the rows the file keeps', () => {
  // data/game.json keeps a spare week of days on purpose (BUILD_LOG.md, "Keep a
  // spare week of days in game.json"), so the file is longer than the window and
  // the two numbers are genuinely different.
  const game = readJson('data/game.json');
  const result = measureAll({
    game,
    dollars: { VOO: 5000, NVDA: 3000, BND: 2000 },
    basket: readJson('basket.json').stocks.map((s) => s.ticker),
    levels: LEVELS,
  });
  assert.equal(LEVELS.window.days, 756);
  assert.ok(game.meta.days > LEVELS.window.days,
    `the file keeps ${game.meta.days} rows, which should be more than the ${LEVELS.window.days}-day window`);
  assert.equal(result.days, 756, 'the window took the file\'s length instead of its own');
  assert.equal(result.stress.count, 75, '10% of 756, floored');
});

// --- the real files ---------------------------------------------------------

test('a real portfolio measures over the real data, and the pieces agree', () => {
  const result = measureAll({
    game: readJson('data/game.json'),
    dollars: { QQQ: 4000, NVDA: 3000, GLD: 2000, BND: 1000 },
    basket: readJson('basket.json').stocks.map((s) => s.ticker),
    levels: LEVELS,
    groups: groupIndex(TICKERS),
  });

  assert.equal(result.value, 10000);
  assertVectorClose(result.holdings.map((h) => h.dollarShare), [0.4, 0.3, 0.2, 0.1], 'dollar shares');

  // The shares of risk sum to 1, which is what lets the screen print them beside
  // the dollar shares and compare the two directly.
  assertClose(result.holdings.reduce((sum, h) => sum + h.riskShare, 0), 1, 'risk shares sum');

  // Effective bets is between 1 and the number of holdings, by definition.
  assert.ok(result.bets > 1 && result.bets < 4, `bets out of range: ${result.bets}`);

  // Every holding is in a group, so the group panel can never show a blank.
  assert.ok(result.groups.every((group) => group.label.length > 0), 'a group with no label');
  assertClose(result.groups.reduce((sum, g) => sum + g.riskShare, 0), 1, 'group risk shares sum');

  // The loss range brackets both betas, and both are losses.
  assert.ok(result.loss.worst <= result.loss.mildest, 'the range is the wrong way round');
  assert.ok(result.loss.worst < 0 && result.loss.mildest < 0, 'a stress fall should lose money');

  // The dates are real trading days from the file, and there are 75 of them.
  assert.equal(result.stress.count, 75);
  assert.equal(result.stress.dates.length, 75);
  assert.ok(result.stress.dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)), 'a bad date');
});

test('the shock and the stress rule come from levels.json, not from the code', () => {
  const rules = stressRules(LEVELS);
  assert.equal(rules.shock, LEVELS.stressTest.shock);
  assert.equal(rules.fraction, LEVELS.stressTest.stressDays.fraction);
  assert.equal(rules.benchmark, LEVELS.stressTest.stressDays.benchmark);
  // The benchmark is an outside one, as docs/PRD.md requires: not an AI name.
  const aiNames = readJson('basket.json').stocks.map((s) => s.ticker);
  assert.ok(!aiNames.includes(rules.benchmark),
    'stress must not be defined by the stocks under study');
  // And it is a column data/game.json actually carries.
  assert.ok(readJson('data/game.json').tickers.includes(rules.benchmark),
    `data/game.json has no ${rules.benchmark} column`);
});

test('levels.json with no stress block is an error naming the file, not a default shock', () => {
  assert.throws(() => stressRules({ window: LEVELS.window }), /levels\.json has no stressTest/);
  // And the validator lets the block be absent - the Learn ladder needs none.
  assert.doesNotThrow(() => validateStressTest({ levels: [] }));
});

test('the reason for the shock is written down beside it', () => {
  // Rule 9 of how we work: a number that is not in docs/PRD.md has to say why it
  // is what it is, where a reviewer reads the rules.
  assert.match(LEVELS.stressTest.shockNote, /20%/);
  assert.match(LEVELS.stressTest.note, /docs\/PRD\.md/);
  assert.match(LEVELS.stressTest.stressDays.note, /756/);
});

// --- what the screens must say ----------------------------------------------

test('effective bets is never shown without saying it counts risk, not money', () => {
  assert.match(BETS_NOTE, /counts risk, not money/);
  assert.equal(DISCLAIMER, 'Educational, not investment advice.');
});

// --- what measureAll refuses ------------------------------------------------

test('one holding is not a portfolio', () => {
  assert.throws(() => measureAll({
    game: readJson('data/game.json'),
    dollars: { VOO: 10000 },
    basket: readJson('basket.json').stocks.map((s) => s.ticker),
    levels: LEVELS,
  }), /not a portfolio/);
});

test('nothing allocated is refused', () => {
  assert.throws(() => measureAll({
    game: readJson('data/game.json'),
    dollars: {},
    basket: readJson('basket.json').stocks.map((s) => s.ticker),
    levels: LEVELS,
  }), /nothing is allocated/);
});

test('a window shorter than the 252-day minimum is refused, not shown', () => {
  const game = fixtureGame();
  // Cut the file down to 200 rows: shorter than minDays, so no measure is
  // trustworthy and none is returned.
  game.rows = game.rows.slice(-200);
  assert.throws(() => measureAll({
    game,
    dollars: { AAA: 5000, BBB: 5000 },
    basket: STRESS.basket_members,
    levels: fixtureLevels,
  }), /fewer than the 252 this game needs/);
});

test('betaOnDays needs at least two days', () => {
  const matrix = [[0.01, 0.02], [0.03, -0.01], [0.00, 0.01]];
  assert.throws(() => betaOnDays(matrix, [0.5, 0.5], [0.01, 0.02, 0.0], [1]), /at least 2 days/);
});
