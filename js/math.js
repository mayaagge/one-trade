// One Trade - portfolio math, run entirely in the browser.
//
// STATUS: stubs only. Every function throws "not implemented" on purpose, so
// tests/math.test.js fails red before any of this is written. See CLAUDE.md
// rule 3: for any math, write the test first.
//
// Every number here must match tests/fixtures/known_answers.json, computed with
// numpy by tests/make_fixtures.py, to a relative 1e-9.
//
// Educational, not investment advice.

// Variance shares at or below this are dropped from the entropy sum, which is
// how 0 * ln(0) = 0 is defined. Must stay identical to SHARE_CUTOFF in
// tests/make_fixtures.py, or Python and JavaScript will disagree.
export const SHARE_CUTOFF = 1e-12;

/**
 * Eigenvalues and eigenvectors of a symmetric matrix, by the Jacobi rotation
 * method. Written by hand because browsers have no eigensolver and the project
 * takes no new libraries (CLAUDE.md rule 8).
 *
 * TIED EIGENVALUES - why this matters, and why Case 2 depends on it.
 *
 * When two eigenvalues are equal, their eigenvectors are not unique: any
 * rotation within that plane is an equally valid answer. Effective bets is not
 * invariant to that choice, so the basis we return decides the number.
 *
 * Case 2 in the fixtures is two independent, equally volatile assets held
 * 50/50, whose covariance matrix is exactly diagonal with both eigenvalues
 * equal. Returning the standard basis (the identity) gives shares of 0.5 and
 * 0.5, so ENB is exactly 2, the hand-derivable answer. Returning the 45-degree
 * rotation instead would put the whole portfolio on one component, giving
 * shares of 1 and 0, so ENB would be exactly 1.
 *
 * So: when every off-diagonal entry is already zero, perform NO rotations and
 * return the identity. A matrix that is already diagonal is already solved.
 *
 * This is a real property of the measure, not a quirk of our code. A
 * correlation of only 0.01 between those same two assets drops ENB from 2 to 1.
 * Near-tied eigenvalues make the answer genuinely unstable, which belongs in
 * the Methods tab, not hidden in here.
 *
 * @param {number[][]} matrix symmetric square matrix
 * @returns {{values: number[], vectors: number[][]}} vectors in columns
 */
export function jacobiEigen(matrix) {
  throw new Error('not implemented');
}

/** Sample covariance matrix of daily returns, one column per holding, ddof 1. */
export function covariance(returns) {
  throw new Error('not implemented');
}

/** Pearson correlation matrix of daily returns, one column per holding. */
export function correlation(returns) {
  throw new Error('not implemented');
}

/**
 * Meucci 2009 effective number of bets: the exponential of the entropy of the
 * portfolio's variance shares across principal components. Tiny negative
 * eigenvalues are clamped to 0 before use; shares at or below SHARE_CUTOFF are
 * dropped.
 */
export function effectiveBets(weights, cov) {
  throw new Error('not implemented');
}

/** Each holding's share of portfolio variance. The shares sum to 1. */
export function riskShares(weights, cov) {
  throw new Error('not implemented');
}

/** Beta of one return series to another: cov(a, b) / var(b). */
export function betaTo(portfolioReturns, basketReturns) {
  throw new Error('not implemented');
}

/** Daily portfolio returns from holding returns and dollar weights. */
export function portfolioReturns(returns, weights) {
  throw new Error('not implemented');
}
