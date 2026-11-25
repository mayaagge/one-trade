// Runs the threshold calibration declared in PREREG_AMENDMENT_2.md section 4 and
// prints the result. Nothing is written to disk: the number goes into the
// amendment by hand, so that a person decides to publish it.
//
// NO PRICES ARE USED OR TOUCHED. The calibration scores the registered
// portfolios' weights against two declared synthetic structures. It never opens
// a price file, and there is none in the repository to open.
//
// Run: node scripts/calibrate_threshold.mjs
//
// Educational, not investment advice.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SEED } from '../js/rng.js';
import { registeredSets, MEDIAN_THRESHOLD } from '../js/hypothesis1.js';
import {
  TIGHT_CORRELATION,
  DIVERSIFIED_CORRELATION,
  LADDER_LOW,
  LADDER_HIGH,
  volatilityLadder,
  calibrateThreshold,
  medianRatioUnder,
} from '../js/calibration.js';

const here = dirname(fileURLToPath(import.meta.url));
const basket = JSON.parse(readFileSync(join(here, '..', 'basket.json'), 'utf8'))
  .stocks.map((stock) => stock.ticker);

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const six = (x) => x.toFixed(6);

console.log('One Trade - Hypothesis 1 threshold calibration');
console.log('PREREG_AMENDMENT_2.md section 4. Synthetic structures only, no prices.\n');

console.log(`Basket            ${basket.length} names from basket.json`);
console.log(`Seed              ${SEED}`);
console.log(`Volatility ladder ${pct(LADDER_LOW)} to ${pct(LADDER_HIGH)} a day, evenly spaced`);
console.log(`                  3 holdings: ${volatilityLadder(3).map(pct).join(', ')}`);
console.log(`                  8 holdings: ${volatilityLadder(8).map(pct).join(', ')}\n`);

const { beginner, control } = registeredSets({ basket, seed: SEED });
const result = calibrateThreshold({ portfolios: beginner });

console.log(`Scored            ${result.portfolioCount} registered beginner portfolios\n`);
console.log(`  median R, tight structure       (correlation ${TIGHT_CORRELATION})  ${six(result.tight.median)}`);
console.log(`  median R, diversified structure (correlation ${DIVERSIFIED_CORRELATION})  ${six(result.diversified.median)}`);
console.log(`  midpoint                                             ${six(result.midpoint)}`);
console.log(`\n  THRESHOLD, rounded to two decimals:                  ${result.threshold.toFixed(2)}`);
console.log(`\n  Supported if the median R is below ${result.threshold.toFixed(2)}.`);

// Two checks a reader can verify from this output alone.
console.log('\nChecks:');
const sane = result.tight.median < result.threshold && result.threshold < result.diversified.median;
console.log(`  threshold sits between the two medians            ${sane ? 'yes' : 'NO'}`);
const scaled = medianRatioUnder(beginner, TIGHT_CORRELATION, LADDER_LOW * 2.5, LADDER_HIGH * 2.5).median;
console.log(`  unchanged when the whole ladder is scaled by 2.5  `
  + `${Math.abs(scaled - result.tight.median) < 1e-12 ? 'yes' : 'NO'} `
  + `(moved ${Math.abs(scaled - result.tight.median).toExponential(1)})`);
const zero = medianRatioUnder(beginner, 0).median;
console.log(`  exactly 1 when no holding is correlated           `
  + `${Math.abs(zero - 1) < 1e-12 ? 'yes' : 'NO'} (${six(zero)})`);

// Reported beside the verdict, not part of it.
const controlResult = calibrateThreshold({ portfolios: control });
console.log('\nAlso reported, not part of the verdict:');
console.log(`  the control set's median R, tight structure       ${six(controlResult.tight.median)}`);
console.log(`  the control set's median R, diversified structure ${six(controlResult.diversified.median)}`);
console.log(`  the registered v1 threshold, unchanged            ${MEDIAN_THRESHOLD.toFixed(2)}`);
console.log('\nEducational, not investment advice.');
