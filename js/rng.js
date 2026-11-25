// One Trade - a seeded random number generator for the browser.
//
// WHY THIS FILE EXISTS, in plain language.
//
// PREREG.md fixes the random seed at 2026 and publishes it, so that anyone can
// rerun Hypothesis 1's portfolio sampler or Hypothesis 2's block bootstrap and
// get exactly the numbers the page shows. JavaScript's own Math.random cannot
// be seeded: it starts somewhere different every time the page loads, so it
// could never reproduce a published result. This file is the replacement.
//
// It is NOT a copy of numpy's generator and does not try to be. numpy uses
// PCG64, and reproducing PCG64 plus its gamma sampler in the browser would be
// hundreds of lines of bit arithmetic for no benefit: nothing in PREREG.md asks
// the two languages to draw the same numbers. The known-answer tests that must
// match numpy to 1e-9 (CLAUDE.md rule 3) test the MATH - effective bets,
// covariance, correlation, beta - and that math is unchanged and untouched by
// this file. What a sampler has to be is reproducible, and that is what is
// tested here.
//
// The generator is sfc32 (Chris Doty-Humphrey's "small fast counting"
// generator, from the PractRand test suite), with its four 32-bit state words
// set up by splitmix32. Both are short, public and well tested. sfc32 has a
// guaranteed minimum period of 2^32 draws and an expected period near 2^127,
// which is far beyond the few million draws this project makes.
//
// Educational, not investment advice.

// Fixed at pre-registration; see PREREG.md, "Values fixed at registration".
export const SEED = 2026;

// 2^32, the number of distinct values one 32-bit word can take.
const TWO_32 = 4294967296;

/**
 * splitmix32: turns one seed number into a stream of well-mixed 32-bit words.
 * Used only to fill sfc32's four state words, so that a small, tidy seed like
 * 2026 does not leave the state nearly all zeros.
 */
function splitmix32(seed) {
  let a = seed | 0;
  return function next() {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

/**
 * sfc32: the generator proper. Four 32-bit words of state in, one 32-bit word
 * out per call.
 */
function sfc32(seedWords) {
  let [a, b, c, d] = seedWords;
  return function next() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
}

/**
 * Build a generator from a seed. Each call returns an independent generator
 * with its own state, so two generators made from the same seed produce the
 * same draws and neither disturbs the other.
 *
 * @param {number} seed whole number; 2026 for anything PREREG.md covers
 * @returns {{uniform: Function, uniformOpen: Function, int: Function,
 *            pick: Function, dirichletFlat: Function}}
 */
export function makeRng(seed = SEED) {
  if (!Number.isInteger(seed)) {
    throw new Error(`makeRng: the seed must be a whole number, got ${seed}`);
  }
  const mix = splitmix32(seed);
  const next = sfc32([mix(), mix(), mix(), mix()]);

  // sfc32 is usually run a dozen times before its output is used, so that the
  // first draws do not depend too directly on how the state was seeded.
  for (let i = 0; i < 12; i += 1) next();

  /**
   * A number in [0, 1). Built from two 32-bit words, giving the full 53 bits of
   * precision a JavaScript number carries. One word alone would only produce
   * multiples of 2^-32, which is too coarse for the Dirichlet draw's -ln(u).
   */
  function uniform() {
    const high = next() >>> 5;        // 27 bits
    const low = next() >>> 6;         // 26 bits
    return (high * 67108864 + low) / 9007199254740992;   // (high * 2^26 + low) / 2^53
  }

  /**
   * A number strictly inside (0, 1). The Dirichlet draw takes -ln(u), which is
   * Infinity at u = 0, so that one value has to be excluded. Redrawing is the
   * honest way to do it: nudging a zero up to some tiny number instead would
   * quietly change the distribution. u = 0 arrives about once in 9,007 trillion
   * draws, so in practice this loop runs once.
   */
  function uniformOpen() {
    let u = uniform();
    while (u <= 0) u = uniform();
    return u;                         // uniform() is already strictly below 1
  }

  /**
   * A whole number from 0 to size - 1, every value equally likely.
   *
   * Plain `next() % size` would be slightly biased, because 2^32 does not
   * divide evenly by most sizes, so the first few values would come up a touch
   * more often. Discarding the leftover tail at the top of the range removes
   * that bias completely.
   */
  function int(size) {
    if (!Number.isInteger(size) || size < 1 || size > TWO_32) {
      throw new Error(`int: need a whole size from 1 to 2^32, got ${size}`);
    }
    const limit = Math.floor(TWO_32 / size) * size;     // largest unbiased cut-off
    let x = next();
    while (x >= limit) x = next();
    return x % size;
  }

  /**
   * Choose count distinct items from a pool, every combination equally likely.
   * This is a partial Fisher-Yates shuffle on a copy, so the caller's pool is
   * never modified and no item can be chosen twice.
   */
  function pick(pool, count) {
    if (!Array.isArray(pool)) throw new Error('pick: expected an array to draw from');
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`pick: count must be a whole number of 0 or more, got ${count}`);
    }
    if (count > pool.length) {
      throw new Error(`pick: asked for ${count} items from a pool of ${pool.length}`);
    }
    const items = [...pool];
    for (let i = 0; i < count; i += 1) {
      const j = i + int(items.length - i);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items.slice(0, count);
  }

  /**
   * Dollar weights from a FLAT Dirichlet distribution: k weights, all above
   * zero, summing to 1, drawn uniformly from every such set of weights. This is
   * what PREREG.md means by "Dollar weights are drawn from a flat Dirichlet
   * distribution".
   *
   * A flat Dirichlet is Dirichlet(1, 1, ..., 1). For that case there is an
   * exact one-line recipe: draw k independent exponentials and divide each by
   * their total. An exponential is -ln(u) for u uniform in (0, 1), which is why
   * uniformOpen exists. No gamma sampler is needed, and no approximation is
   * involved - this is the distribution itself, not a stand-in for it.
   *
   * It is deliberately NOT equal weighting: a flat draw of 4 weights has a
   * largest weight averaging 0.52, because a beginner's money is rarely spread
   * evenly.
   */
  function dirichletFlat(k) {
    if (!Number.isInteger(k) || k < 1) {
      throw new Error(`dirichletFlat: need a whole number of holdings of 1 or more, got ${k}`);
    }
    if (k === 1) return [1];
    const draws = new Array(k);
    let total = 0;
    for (let i = 0; i < k; i += 1) {
      const value = -Math.log(uniformOpen());     // an Exponential(1) draw
      draws[i] = value;
      total += value;
    }
    if (!(total > 0)) throw new Error('dirichletFlat: the draws summed to zero');
    return draws.map((value) => value / total);
  }

  return { uniform, uniformOpen, int, pick, dirichletFlat };
}
