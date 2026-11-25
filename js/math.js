// One Trade - portfolio math, run entirely in the browser.
//
// Every number here must match tests/fixtures/known_answers.json, computed with
// numpy by tests/make_fixtures.py, to a relative 1e-9.
//
// Conventions, chosen to match numpy so the two can be compared at all:
//   - returns is a matrix with one ROW per day and one COLUMN per holding.
//   - covariance and correlation use ddof = 1 (the sample, not the population).
//   - eigenvalues come back in ascending order, like numpy.linalg.eigh, and
//     eigenvectors are the COLUMNS of the returned matrix.
//
// Educational, not investment advice.

// Variance shares at or below this are dropped from the entropy sum, which is
// how 0 * ln(0) = 0 is defined. Must stay identical to SHARE_CUTOFF in
// tests/make_fixtures.py, or Python and JavaScript will disagree.
export const SHARE_CUTOFF = 1e-12;

// Jacobi gives up after this many sweeps. A symmetric matrix of the sizes this
// game uses (at most a few dozen holdings) converges in well under 10, so
// hitting the cap means the input was not a valid symmetric matrix.
const MAX_SWEEPS = 100;

// --- small helpers ----------------------------------------------------------

/** Copy a matrix into fresh plain arrays of numbers, so we never edit a caller's data. */
function copyMatrix(matrix) {
  return matrix.map((row) => Array.from(row, Number));
}

/** Identity matrix of size n. */
function identity(n) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

/** Check a matrix is square and non-empty, and return its size. */
function squareSize(matrix, what) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error(`${what}: expected a non-empty square matrix`);
  }
  const n = matrix.length;
  for (const row of matrix) {
    if (!Array.isArray(row) || row.length !== n) {
      throw new Error(`${what}: expected a square matrix, got a ${n}-row matrix with a row of ${row?.length}`);
    }
  }
  return n;
}

/** Check returns is a non-empty day-by-holding matrix, and return its shape. */
function returnsShape(returns, what) {
  if (!Array.isArray(returns) || returns.length === 0 || !Array.isArray(returns[0])) {
    throw new Error(`${what}: expected a matrix of returns, one row per day`);
  }
  const days = returns.length;
  const holdings = returns[0].length;
  if (holdings === 0) throw new Error(`${what}: expected at least one holding`);
  for (const row of returns) {
    if (!Array.isArray(row) || row.length !== holdings) {
      throw new Error(`${what}: every day must have the same number of holdings`);
    }
  }
  if (days < 2) throw new Error(`${what}: need at least 2 days for a sample covariance (ddof 1)`);
  return { days, holdings };
}

/** Column means of a day-by-holding matrix. */
function columnMeans(returns, days, holdings) {
  const means = new Array(holdings).fill(0);
  for (let t = 0; t < days; t += 1) {
    for (let i = 0; i < holdings; i += 1) means[i] += returns[t][i];
  }
  return means.map((sum) => sum / days);
}

/** Matrix times vector: (M w)_i = sum_j M[i][j] * w[j]. */
function matVec(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, j) => sum + value * vector[j], 0));
}

/** The portfolio variance w' Sigma w. */
function quadraticForm(weights, cov) {
  const sigmaW = matVec(cov, weights);
  return weights.reduce((sum, w, i) => sum + w * sigmaW[i], 0);
}

// --- eigen decomposition ----------------------------------------------------

/**
 * Eigenvalues and eigenvectors of a symmetric matrix, by the Jacobi rotation
 * method. Written by hand because browsers have no eigensolver and the project
 * takes no new libraries (CLAUDE.md rule 8).
 *
 * How it works, in plain language: a Jacobi rotation is a turn in the plane of
 * two holdings, chosen to make one off-diagonal entry of the covariance matrix
 * exactly zero. Doing that again and again, over every pair in turn, drives all
 * the off-diagonal entries to zero. What is left on the diagonal are the
 * eigenvalues, and the rotations multiplied together are the eigenvectors.
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
  const n = squareSize(matrix, 'jacobiEigen');
  const a = copyMatrix(matrix);          // working copy, rotated towards diagonal
  const v = identity(n);                 // accumulated rotations, eigenvectors in columns

  for (let sweep = 0; sweep < MAX_SWEEPS; sweep += 1) {
    // Size of what is still off the diagonal. Exactly zero means we are done -
    // and on sweep 0 it means the matrix arrived diagonal, so we rotate nothing
    // and hand back the identity. See the tied-eigenvalue note above.
    let off = 0;
    for (let p = 0; p < n - 1; p += 1) {
      for (let q = p + 1; q < n; q += 1) off += Math.abs(a[p][q]);
    }
    if (off === 0) break;

    // For the first few sweeps, only attack the entries that are big relative to
    // what is left. This is the standard Jacobi threshold strategy: it avoids
    // spending rotations on entries that later sweeps would have cleared anyway.
    const threshold = sweep < 3 ? (0.2 * off) / (n * n) : 0;

    for (let p = 0; p < n - 1; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        const apq = a[p][q];
        const gap = 100 * Math.abs(apq);

        // If a[p][q] is so much smaller than both diagonal entries that rotating
        // could not change them, it is already zero as far as doubles care.
        if (sweep > 3
            && Math.abs(a[p][p]) + gap === Math.abs(a[p][p])
            && Math.abs(a[q][q]) + gap === Math.abs(a[q][q])) {
          a[p][q] = 0;
          a[q][p] = 0;
          continue;
        }
        if (Math.abs(apq) <= threshold) continue;

        // Choose the rotation that sends a[p][q] to exactly zero. t is the
        // tangent of the rotation angle; the smaller root is taken for stability.
        const diff = a[q][q] - a[p][p];
        let t;
        if (Math.abs(diff) + gap === Math.abs(diff)) {
          t = apq / diff;                                   // tiny angle, avoid cancellation
        } else {
          const theta = (0.5 * diff) / apq;
          t = 1 / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
          if (theta < 0) t = -t;
        }
        const c = 1 / Math.sqrt(1 + t * t);                 // cosine
        const s = t * c;                                    // sine
        const tau = s / (1 + c);                            // s / (1 + c), kept small on purpose
        const h = t * apq;

        a[p][p] -= h;
        a[q][q] += h;
        a[p][q] = 0;
        a[q][p] = 0;

        // Carry the rotation through the rest of the matrix. Written as
        // x -= s * (y + tau * x) rather than c and s directly: the correction is
        // small next to x, so fewer significant digits are lost.
        const rotate = (m, i, j, k, l) => {
          const g = m[i][j];
          const hh = m[k][l];
          m[i][j] = g - s * (hh + g * tau);
          m[k][l] = hh + s * (g - hh * tau);
        };
        for (let j = 0; j < p; j += 1) rotate(a, j, p, j, q);
        for (let j = p + 1; j < q; j += 1) rotate(a, p, j, j, q);
        for (let j = q + 1; j < n; j += 1) rotate(a, p, j, q, j);
        for (let j = 0; j < n; j += 1) rotate(v, j, p, j, q);
        // Keep the working copy symmetric, since only one triangle was updated.
        for (let i = 0; i < n; i += 1) {
          for (let j = i + 1; j < n; j += 1) a[j][i] = a[i][j];
        }
      }
    }

    if (sweep === MAX_SWEEPS - 1) {
      throw new Error('jacobiEigen: did not converge; is the matrix symmetric?');
    }
  }

  // Sort ascending, like numpy.linalg.eigh. Array.prototype.sort is stable, so
  // tied eigenvalues keep the order they came in and a diagonal matrix keeps the
  // identity it was given.
  const order = [...Array(n).keys()].sort((i, j) => a[i][i] - a[j][j]);
  return {
    values: order.map((k) => a[k][k]),
    vectors: Array.from({ length: n }, (_, i) => order.map((k) => v[i][k])),
  };
}

// --- the four measures ------------------------------------------------------

/** Sample covariance matrix of daily returns, one column per holding, ddof 1. */
export function covariance(returns) {
  const { days, holdings } = returnsShape(returns, 'covariance');
  const means = columnMeans(returns, days, holdings);
  const cov = Array.from({ length: holdings }, () => new Array(holdings).fill(0));

  for (let i = 0; i < holdings; i += 1) {
    for (let j = i; j < holdings; j += 1) {
      let sum = 0;
      for (let t = 0; t < days; t += 1) {
        sum += (returns[t][i] - means[i]) * (returns[t][j] - means[j]);
      }
      const value = sum / (days - 1);
      cov[i][j] = value;
      cov[j][i] = value;        // one computation per pair, so the result is exactly symmetric
    }
  }
  return cov;
}

/** Pearson correlation matrix of daily returns, one column per holding. */
export function correlation(returns) {
  const cov = covariance(returns);
  const n = cov.length;
  const sd = cov.map((row, i) => Math.sqrt(row[i]));

  return cov.map((row, i) => row.map((value, j) => {
    if (sd[i] === 0 || sd[j] === 0) return i === j ? 1 : 0;   // a flat series has no correlation
    const r = value / sd[i] / sd[j];                          // divide twice, as numpy.corrcoef does
    return Math.min(1, Math.max(-1, r));                      // rounding can push it a hair past 1
  }));
}

/**
 * Meucci 2009 effective number of bets: the exponential of the entropy of the
 * portfolio's variance shares across principal components. Tiny negative
 * eigenvalues are clamped to 0 before use; shares at or below SHARE_CUTOFF are
 * dropped.
 */
export function effectiveBets(weights, cov) {
  const n = squareSize(cov, 'effectiveBets');
  if (weights.length !== n) {
    throw new Error(`effectiveBets: ${weights.length} weights for a ${n}-by-${n} covariance matrix`);
  }
  const w = Array.from(weights, Number);
  const { values, vectors } = jacobiEigen(cov);
  const lambda = values.map((value) => (value < 0 ? 0 : value));   // clamp rounding noise

  const portVar = quadraticForm(w, cov);
  if (!(portVar > 0)) {
    throw new Error('effectiveBets: portfolio variance is not positive, so there are no shares');
  }

  let entropy = 0;
  for (let k = 0; k < n; k += 1) {
    // Exposure to component k, then that component's share of portfolio variance.
    let wTilde = 0;
    for (let i = 0; i < n; i += 1) wTilde += vectors[i][k] * w[i];
    const share = (wTilde * wTilde * lambda[k]) / portVar;
    if (share > SHARE_CUTOFF) entropy -= share * Math.log(share);   // defines 0 * ln(0) = 0
  }
  return Math.exp(entropy);
}

/** Each holding's share of portfolio variance. The shares sum to 1. */
export function riskShares(weights, cov) {
  const n = squareSize(cov, 'riskShares');
  if (weights.length !== n) {
    throw new Error(`riskShares: ${weights.length} weights for a ${n}-by-${n} covariance matrix`);
  }
  const w = Array.from(weights, Number);
  const sigmaW = matVec(cov, w);
  const portVar = w.reduce((sum, value, i) => sum + value * sigmaW[i], 0);
  if (!(portVar > 0)) {
    throw new Error('riskShares: portfolio variance is not positive, so there are no shares');
  }
  return w.map((value, i) => (value * sigmaW[i]) / portVar);
}

/** Beta of one return series to another: cov(a, b) / var(b). */
export function betaTo(portfolioReturnSeries, basketReturns) {
  const p = Array.from(portfolioReturnSeries, Number);
  const b = Array.from(basketReturns, Number);
  if (p.length !== b.length) {
    throw new Error(`betaTo: ${p.length} portfolio days against ${b.length} basket days`);
  }
  if (p.length < 2) throw new Error('betaTo: need at least 2 days (ddof 1)');

  const meanP = p.reduce((sum, x) => sum + x, 0) / p.length;
  const meanB = b.reduce((sum, x) => sum + x, 0) / b.length;

  let covPB = 0;
  let varB = 0;
  for (let t = 0; t < p.length; t += 1) {
    covPB += (p[t] - meanP) * (b[t] - meanB);
    varB += (b[t] - meanB) * (b[t] - meanB);
  }
  if (varB === 0) throw new Error('betaTo: the basket never moves, so beta is undefined');
  return covPB / varB;          // the (days - 1) divisors cancel
}

/** Daily portfolio returns from holding returns and dollar weights. */
export function portfolioReturns(returns, weights) {
  if (!Array.isArray(returns) || returns.length === 0) {
    throw new Error('portfolioReturns: expected a matrix of returns, one row per day');
  }
  const w = Array.from(weights, Number);
  return returns.map((day, t) => {
    if (!Array.isArray(day) || day.length !== w.length) {
      throw new Error(`portfolioReturns: day ${t} has ${day?.length} holdings, expected ${w.length}`);
    }
    return day.reduce((sum, value, i) => sum + value * w[i], 0);
  });
}
