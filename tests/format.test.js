// tests/format.test.js - the one place that formats a number or a date for a
// player, checked against known answers rather than against itself.
//
// The true minus sign (U+2212) is the thing every one of these functions is
// obliged to use for a negative value; a hyphen-minus anywhere in these
// assertions would be the bug this file exists to catch.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MINUS, withMinus, money, percent, signedPercent, signedPoints,
  formatMeasure, CLOSE_TO_THRESHOLD, longDate, formatShortDate,
} from '../js/format.js';

test('MINUS is the true minus, not a hyphen', () => {
  assert.equal(MINUS, '−');
  assert.notEqual(MINUS, '-');
});

test('withMinus() swaps a leading hyphen and nothing else', () => {
  assert.equal(withMinus('-15%'), `${MINUS}15%`);
  assert.equal(withMinus('15%'), '15%');
  assert.equal(withMinus('0%'), '0%');
  assert.equal(withMinus('3.5 holdings - picked'), '3.5 holdings - picked',
    'only a LEADING hyphen is a sign; one in the middle of a sentence is not');
  assert.equal(withMinus('-0'), '0', 'a rounding artefact, not a negative zero');
  assert.equal(withMinus('-0.00'), '0.00');
});

test('money() is $1,480 style', () => {
  assert.equal(money(1480), '$1,480');
  assert.equal(money(10000), '$10,000');
  assert.equal(money(0), '$0');
  assert.equal(money(2000), '$2,000');
});

test('percent() rounds to a whole percent and signs a negative share', () => {
  assert.equal(percent(0.355), '36%');
  assert.equal(percent(0.5), '50%');
  assert.equal(percent(1), '100%');
  assert.equal(percent(-0.05), `${MINUS}5%`);
  assert.equal(percent(-0.003), '0%', '-0 must not print as a sign with nothing after it');
});

test('percent() rejects a non-number', () => {
  assert.throws(() => percent(Number.NaN));
  assert.throws(() => percent(undefined));
});

test('signedPercent() signs a move, and never signs zero', () => {
  assert.equal(signedPercent(0.14), '+14%');
  assert.equal(signedPercent(-0.02), `${MINUS}2%`);
  assert.equal(signedPercent(0), '0%');
  assert.equal(signedPercent(-0.001), '0%', 'rounds to 0 and must not read -0%');
});

test('signedPoints() signs a percentage-point gap', () => {
  assert.equal(signedPoints(3), '+3');
  assert.equal(signedPoints(-2), `${MINUS}2`);
  assert.equal(signedPoints(0), '0');
});

test('formatMeasure() keeps the 2-normally-4-when-close rule, with a true minus', () => {
  assert.equal(formatMeasure(0.7996, { threshold: 0.8 }), '0.7996');
  assert.equal(formatMeasure(0.95, { threshold: 0.8 }), '0.95');
  assert.equal(formatMeasure(-0.117, { threshold: -0.5 }), `${MINUS}0.12`);
  assert.equal(formatMeasure(Number.NaN), '–');
});

test('formatMeasure() percent display signs a negative share of risk', () => {
  assert.equal(formatMeasure(-0.003, { display: 'percent' }), '0%');
  assert.equal(formatMeasure(-0.05, { display: 'percent' }), `${MINUS}5%`);
  assert.equal(formatMeasure(1.1, { display: 'percent' }), '110%');
});

test('CLOSE_TO_THRESHOLD is still 0.005, half a percentage point', () => {
  assert.equal(CLOSE_TO_THRESHOLD, 0.005);
});

test('longDate() is "25 Nov 2026" - day, short month, year', () => {
  assert.equal(longDate('2026-11-25'), '25 Nov 2026');
  assert.equal(longDate('2026-01-05'), '5 Jan 2026');
  assert.equal(longDate('2023-11-21'), '21 Nov 2023');
});

test('longDate() refuses a date that is not ISO', () => {
  assert.throws(() => longDate('25 November 2026'));
});

test('formatShortDate() is "Mon D" for a chart axis', () => {
  assert.equal(formatShortDate('2020-02-19'), 'Feb 19');
  assert.equal(formatShortDate('2020-03-06'), 'Mar 6');
});
