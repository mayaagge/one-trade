// One Trade - fixing Hypothesis 1's new threshold, by the procedure declared in
// PREREG_AMENDMENT_2.md section 4.
//
// WHAT THIS IS FOR, in plain language. The amendment adds a stricter primary test
// for Hypothesis 1: the correlation-only ratio R, which measures how much of a
// portfolio's lost risk sources went to correlation rather than to uneven
// weights. A test needs a cut-off, and choosing one after seeing real prices
// would make the whole pre-registration worthless. So the amendment declares two
// synthetic structures in advance and derives the cut-off from them:
//
//   Tight        every pairwise correlation 0.70 - a market where nearly
//                everything moves together
//   Diversified  every pairwise correlation 0.30 - typical correlation between
//                stocks in different sectors
//
//   Threshold = midpoint of the median R under each, rounded to 2 decimals.
//
// So the number is derived, not picked. The only freedom in it is those two
// correlations and the volatility ladder below, all published before the result
// was known.
//
// WHY THE VOLATILITY LADDER. An earlier draft gave every holding the same
// volatility. That makes all but one of the eigenvalues EXACTLY TIED, which is
// the one case where effective bets has no single right answer - see the
// tied-eigenvalue note in js/math.js. The consequences were not subtle: every
// one of the 500 portfolios changed its R when only the volatility scale
// changed, by as much as 0.57, and the published threshold came out at 0.55 or
// 0.54 depending on a number that is meant to be meaningless. numpy and the
// browser disagreed as well, because their eigensolvers resolve arbitrary
// eigenvectors differently. Spreading volatility across the holdings separates
// the eigenvalues, and both languages then agree to 12 digits. A test refuses a
// flat ladder outright, so this cannot creep back.
//
// NO PRICES ARE USED HERE, and none can be: this file never takes a return
// series. It needs only the registered portfolios' weights and a covariance
// matrix built from the declared structures.
//
// Educational, not investment advice.

import { correlationOnlyRatio, median } from './hypothesis1.js';

/** Declared in PREREG_AMENDMENT_2.md section 4, before the threshold was known. */
export const TIGHT_CORRELATION = 0.70;
export const DIVERSIFIED_CORRELATION = 0.30;

/**
 * The declared volatility ladder: 0.8% a day at the low end, 2.0% at the high
 * end, spread evenly across whatever holdings a portfolio has. The range covers
 * what a quiet fund and a volatile single stock actually do in a day.
 *
 * The LEVEL of the ladder cannot affect the answer - R is a ratio of two
 * effective-bets figures computed on the same volatilities, so multiplying every
 * one of them by a constant leaves R untouched, and a test pins that to 1e-12.
 * What matters is only that the volatilities DIFFER, so the eigenvalues are not
 * tied.
 */
export const LADDER_LOW = 0.008;
export const LADDER_HIGH = 0.020;

/** Volatilities for n holdings, evenly spaced from low to high. */
export function volatilityLadder(n, low = LADDER_LOW, high = LADDER_HIGH) {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`volatilityLadder: need a whole number of holdings, got ${n}`);
  }
  if (!(low > 0)) {
    throw new Error(`volatilityLadder: the low end must be above 0, got ${low}`);
  }
  if (!(high > low)) {
    throw new Error(
      `volatilityLadder: the high end must be above the low end, got ${low} and ${high}. `
      + 'A flat ladder gives tied eigenvalues, which makes the threshold unreproducible.',
    );
  }
  if (n === 1) return [low];
  const step = (high - low) / (n - 1);
  return Array.from({ length: n }, (_, i) => low + step * i);
}

/**
 * A covariance matrix for one of the declared structures: volatilities from the
 * ladder, and one shared correlation between every pair.
 */
export function declaredCovariance(n, rho, low = LADDER_LOW, high = LADDER_HIGH) {
  const d = volatilityLadder(n, low, high);
  // Below -1/(n-1) a shared correlation cannot describe real holdings at all:
  // the matrix stops being positive semi-definite, so no returns could produce
  // it. At 1 or above it is not a correlation.
  const floor = n > 1 ? -1 / (n - 1) : -1;
  if (!(rho > floor && rho < 1)) {
    throw new Error(
      `declaredCovariance: a shared correlation must be above ${floor} and below 1 `
      + `for ${n} holdings, got ${rho}`,
    );
  }
  // Each off-diagonal entry is computed ONCE and written to both sides, so the
  // matrix is exactly symmetric. Writing rho * d[i] * d[j] on one side and
  // rho * d[j] * d[i] on the other looks identical but is not: the two multiply
  // in a different order and can differ in the last bit, and jacobiEigen in
  // js/math.js assumes a genuinely symmetric matrix. js/math.js's covariance()
  // takes the same precaution for the same reason.
  const cov = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    cov[i][i] = d[i] * d[i];
    for (let j = i + 1; j < n; j += 1) {
      const value = rho * d[i] * d[j];
      cov[i][j] = value;
      cov[j][i] = value;
    }
  }
  return cov;
}

/**
 * The median correlation-only ratio across a set of portfolios, as if their
 * holdings had the declared volatilities and the declared shared correlation.
 * Each portfolio keeps its own size and its own registered weights.
 */
export function medianRatioUnder(portfolios, rho, low = LADDER_LOW, high = LADDER_HIGH) {
  if (!Array.isArray(portfolios) || portfolios.length === 0) {
    throw new Error('medianRatioUnder: expected at least one portfolio');
  }
  const ratios = portfolios.map((portfolio) => correlationOnlyRatio(
    portfolio.weights,
    declaredCovariance(portfolio.weights.length, rho, low, high),
  ));
  return { correlation: rho, median: median(ratios), ratios };
}

/**
 * The whole declared procedure: median R under each structure, their midpoint,
 * and the midpoint rounded to two decimals, which is the threshold.
 */
export function calibrateThreshold({
  portfolios,
  tightRho = TIGHT_CORRELATION,
  diversifiedRho = DIVERSIFIED_CORRELATION,
  low = LADDER_LOW,
  high = LADDER_HIGH,
}) {
  const tight = medianRatioUnder(portfolios, tightRho, low, high);
  const diversified = medianRatioUnder(portfolios, diversifiedRho, low, high);
  const midpoint = (tight.median + diversified.median) / 2;

  return {
    portfolioCount: portfolios.length,
    ladder: { low, high },
    tight,
    diversified,
    midpoint,
    threshold: Math.round(midpoint * 100) / 100,
    disclaimer: 'Educational, not investment advice.',
  };
}
