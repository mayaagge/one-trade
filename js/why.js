// js/why.js - the "Why?" card: which rule explains this portfolio, and the
// template that words it.
//
// docs/PRD.md, Tier 1: "After each reveal, rule-based templates name the
// specific cause, such as the most correlated pair, the biggest gap between
// dollar share and risk share, or one group holding most of the risk." And the
// reason it is built this way rather than with a language model: "template text
// cannot invent wrong answers."
//
// SO NOTHING HERE WRITES A SENTENCE. Every sentence a player can read is a
// template in why.json. This file does two things to it: it decides which
// template applies, and it fills in the named placeholders. It never
// concatenates, reorders or appends prose, and fillTemplate() throws rather than
// leave a {placeholder} on the screen or quietly drop a value nobody used.
//
// A card can carry TWO templates - a lead-in saying how the round went, and the
// card itself - and they are kept as two strings all the way to the screen,
// which renders them as two lines. Joining them into one would be this file
// writing a sentence, which is the one thing it does not do.
// tests/why.test.js checks this mechanically: the text that comes out must equal
// the template that went in with its values substituted.
//
// WHAT THE NUMBERS ARE. All of them come from js/math.js, over the same window
// the reveal measured: correlation() for the closest pair, riskShares() for each
// holding's share of portfolio variance. A group's share of risk is the sum of
// its holdings' shares, which is exact, because the shares are additive by
// construction. Nothing new is computed here, and the known-answer tests hold
// the facts to numpy at 1e-9 anyway (CLAUDE.md rule 3), because the card states
// these numbers to a player.
//
// LEVEL 1 TAKES A DIFFERENT PATH, and it is the first thing to understand here.
// It asks for two holdings and no money split, so the risk-share rules would
// describe a split the player never chose. It gets a correlation card instead,
// one per "Same bet?" bucket, keyed by the bucket keys in levels.json. The four
// rules are for levels 2 and 3, which allocate money.
//
// Educational, not investment advice.

import { correlation, covariance, riskShares } from './math.js';
import { formatMeasure } from './levels.js';

export const WHY_URL = 'why.json';
export const DISCLAIMER = 'Educational, not investment advice.';

/**
 * The placeholders each kind of card is allowed to use.
 *
 * A template in why.json may use any subset of its list and nothing else, so a
 * placeholder cannot be added to the JSON alone and reach a player as literal
 * text. "bucketCard" covers every entry in bucketCards, whatever levels.json
 * names its buckets: this file does not need to know those names, and
 * tests/why.test.js holds the two files to each other.
 */
export const PLACEHOLDERS = {
  bucketCard: ['a', 'b', 'r'],
  pair: ['a', 'b', 'r'],
  pairLowRisk: ['a', 'b', 'r', 'riskPct'],
  groupRisk: ['group', 'count', 'total', 'dollarPct', 'riskPct'],
  riskGapOver: ['ticker', 'dollarPct', 'riskPct'],
  riskGapUnder: ['ticker', 'dollarPct', 'riskPct'],
  fallback: [],
};

/** The rule keys this file knows how to apply. why.json may not invent one. */
export const RULE_KEYS = ['groupRisk', 'pair', 'pairLowRisk', 'riskGapOver', 'riskGapUnder'];

/**
 * The lead-in lines, one of which opens a card on the levels that take one.
 *
 * Two pairs, because two kinds of level ask for two different things. A level
 * that checks the portfolio reports a verdict on the portfolio - passed or
 * missed. A level whose pass rule IS the guess has no portfolio to pass or miss,
 * so its line reports on the guess - close, or wide of it. js/round.js decides
 * which pair applies from the level's own pass rule.
 */
export const LEAD_IN_KEYS = ['passed', 'missed', 'closeGuess', 'wideGuess'];

// ------------------------------------------------------------------ loading

/** Every {placeholder} in a template, in the order it appears. */
export function placeholdersIn(template) {
  return [...String(template).matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]);
}

/**
 * Check a why file over, and throw on anything that would otherwise reach a
 * player as broken text.
 */
export function validateWhy(data) {
  if (!data || typeof data !== 'object') throw new Error('why: expected an object');

  const checkCard = (card, allowed, where) => {
    if (!card || typeof card.template !== 'string' || card.template.length === 0) {
      throw new Error(`${where}: a template is missing`);
    }
    if (typeof card.says !== 'string' || card.says.length === 0) {
      throw new Error(`${where}: "says" is missing, so no screen could name the rule`);
    }
    for (const name of placeholdersIn(card.template)) {
      if (!allowed.includes(name)) {
        throw new Error(
          `${where}: the template uses {${name}}, which nothing can fill. `
          + `This card allows ${allowed.length === 0 ? 'no placeholders' : allowed.map((a) => `{${a}}`).join(', ')}.`,
        );
      }
    }
  };

  if (!data.bucketCards || typeof data.bucketCards !== 'object') {
    throw new Error('why: bucketCards is missing, so level 1 would have no card');
  }
  for (const [key, card] of Object.entries(data.bucketCards)) {
    checkCard(card, PLACEHOLDERS.bucketCard, `why: bucketCards.${key}`);
  }

  if (!Array.isArray(data.rules) || data.rules.length === 0) {
    throw new Error('why: a non-empty rules array is missing');
  }
  const byKey = new Map();
  for (const rule of data.rules) {
    if (!RULE_KEYS.includes(rule.key)) {
      throw new Error(`why: rule "${rule.key}" is not one this code can apply (${RULE_KEYS.join(', ')})`);
    }
    if (byKey.has(rule.key)) throw new Error(`why: duplicate rule ${rule.key}`);
    if (!rule.when || typeof rule.when !== 'object') throw new Error(`why: rule ${rule.key} has no "when"`);
    checkCard(rule, PLACEHOLDERS[rule.key], `why: rule ${rule.key}`);
    byKey.set(rule.key, rule);
  }

  if (!Array.isArray(data.order) || data.order.length === 0) {
    throw new Error('why: an order is missing, so a portfolio firing two rules would have no card');
  }
  for (const key of data.order) {
    if (!byKey.has(key)) throw new Error(`why: the order names ${key}, which has no rule`);
  }
  for (const key of byKey.keys()) {
    if (!data.order.includes(key)) throw new Error(`why: rule ${key} is in no order, so it could never be shown`);
  }

  checkCard(data.fallback, PLACEHOLDERS.fallback, 'why: fallback');

  if (!data.leadIn || typeof data.leadIn !== 'object') {
    throw new Error('why: leadIn is missing, so no card could say whether the round was passed');
  }
  for (const key of LEAD_IN_KEYS) {
    const line = data.leadIn[key];
    if (typeof line !== 'string' || line.length === 0) {
      throw new Error(`why: leadIn.${key} is missing`);
    }
    // A lead-in is a fixed line, not a template. It says whether the round was
    // passed and nothing else, so there is nothing in it to fill in, and
    // allowing one would mean deciding what it could name.
    const found = placeholdersIn(line);
    if (found.length > 0) {
      throw new Error(`why: leadIn.${key} uses {${found[0]}}; a lead-in takes no placeholders`);
    }
  }

  return data;
}

/** Read why.json. The caller handles the failure, as with the other data files. */
export async function loadWhy(url = WHY_URL) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return validateWhy(await response.json());
}

/** Ticker -> its group, from tickers.json. The group rule needs the labels. */
export function groupIndex(tickersDoc) {
  const index = new Map();
  for (const group of tickersDoc?.groups ?? []) {
    for (const entry of group.tickers ?? []) {
      const ticker = typeof entry === 'string' ? entry : entry.ticker;
      index.set(ticker, { key: group.key, label: group.label });
    }
  }
  if (index.size === 0) throw new Error('groupIndex: tickers.json carried no groups');
  return index;
}

// ------------------------------------------------------------------ wording

/**
 * One template, with its named placeholders filled in.
 *
 * Throws on a placeholder with no value, and on a value no placeholder uses: the
 * first would print "{a}" at a player, and the second means the caller and the
 * template disagree about what the card is saying.
 */
export function fillTemplate(template, values) {
  const used = new Set();
  const text = String(template).replace(/\{([a-zA-Z]+)\}/g, (_, name) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) {
      throw new Error(`fillTemplate: nothing to put in {${name}}`);
    }
    used.add(name);
    return String(values[name]);
  });
  for (const name of Object.keys(values)) {
    if (!used.has(name)) throw new Error(`fillTemplate: the value "${name}" fits no placeholder in this template`);
  }
  return text;
}

/** A share of the portfolio, as a whole percent. */
export function percent(share) {
  if (!Number.isFinite(share)) throw new Error('percent: expected a number');
  return `${Math.round(share * 100)}%`;
}

/**
 * A correlation, as the card shows it.
 *
 * When the correlation IS the level's pass-checked measure - which is level 1,
 * where the pair is the whole portfolio - it is formatted through the same
 * formatMeasure() the reveal panel uses, against the same threshold. Otherwise
 * the panel could read 0.7996 and the card 0.80, and the screen would contradict
 * itself about whether the level was passed.
 */
export function formatCorrelation(r, threshold = null) {
  return formatMeasure(r, { threshold });
}

// -------------------------------------------------------------------- facts

/**
 * Everything the rules below are allowed to look at, computed once.
 *
 * @param {string[]} options.tickers  the holdings, in weight order
 * @param {number[]} options.weights  dollar shares, summing to 1
 * @param {number[][]} options.matrix daily returns, one row per day
 * @param {Map} [options.groups]      ticker -> {key, label}; without it the group rule is skipped
 */
export function whyFacts({ tickers, weights, matrix, groups = null }) {
  if (!Array.isArray(tickers) || tickers.length === 0) throw new Error('whyFacts: no holdings');
  if (tickers.length !== weights.length) {
    throw new Error(`whyFacts: ${tickers.length} holdings and ${weights.length} weights`);
  }

  const shares = riskShares(weights, covariance(matrix));
  const holdings = tickers.map((ticker, i) => ({
    ticker,
    dollarShare: weights[i],
    riskShare: shares[i],
    // What the card is about: a holding's risk can be far bigger, or far
    // smaller, than its share of the money.
    gap: shares[i] - weights[i],
    group: groups ? groups.get(ticker) ?? null : null,
  }));

  // The closest pair, and what share of the portfolio's risk the two of them
  // carry between them. Ties keep index order, which is weight order, so the
  // answer does not depend on how the object was built.
  //
  // THE PAIR IS THE MOST CORRELATED PAIR, chosen before any thought about risk.
  // The template says "the closest pair you hold", and a pair picked for its
  // risk share rather than its correlation would make that sentence false. The
  // risk share is a condition on whether the card is worth showing, not on which
  // pair it is about: a pair carrying a third of the risk is a true observation
  // about a corner of the portfolio, and saying it crowds out what is actually
  // driving the number.
  let pair = null;
  if (tickers.length >= 2) {
    const corr = correlation(matrix);
    let at = null;
    for (let i = 0; i < tickers.length - 1; i += 1) {
      for (let j = i + 1; j < tickers.length; j += 1) {
        if (at === null || corr[i][j] > corr[at[0]][at[1]]) at = [i, j];
      }
    }
    const [i, j] = at;
    pair = {
      a: tickers[i],
      b: tickers[j],
      r: corr[i][j],
      riskShare: shares[i] + shares[j],
    };
  }

  // Groups, with each one's risk summed from its holdings' shares.
  let groupFacts = null;
  if (groups) {
    const byKey = new Map();
    for (const holding of holdings) {
      if (!holding.group) {
        throw new Error(`whyFacts: ${holding.ticker} is in no group in tickers.json`);
      }
      const at = byKey.get(holding.group.key) ?? {
        key: holding.group.key, label: holding.group.label, count: 0, dollarShare: 0, riskShare: 0,
      };
      at.count += 1;
      at.dollarShare += holding.dollarShare;
      at.riskShare += holding.riskShare;
      byKey.set(at.key, at);
    }
    groupFacts = [...byKey.values()].sort((a, b) => b.riskShare - a.riskShare);
  }

  return { tickers: [...tickers], total: tickers.length, holdings, pair, groups: groupFacts };
}

// -------------------------------------------------------------------- rules

/**
 * Does one rule apply to these facts, and what would its card say?
 *
 * Returns {key, fires, values}. `values` is filled in whenever the rule has
 * something to talk about, even when it does not fire, so a test can see the
 * number that fell short.
 */
export function ruleCandidate(facts, rule, { pairThreshold = null } = {}) {
  const when = rule.when;
  const none = { key: rule.key, fires: false, values: null };

  if (rule.key === 'pairLowRisk') {
    // The pair card demoted: the same two holdings, named with what they are
    // actually carrying. The exact complement of the pair rule's risk condition,
    // so no pair falls between the two and gets nothing.
    if (!facts.pair) return none;
    return {
      key: rule.key,
      fires: facts.pair.r >= when.correlationAtLeast && facts.pair.riskShare < when.pairRiskBelow,
      values: {
        a: facts.pair.a,
        b: facts.pair.b,
        r: formatCorrelation(facts.pair.r, pairThreshold),
        riskPct: percent(facts.pair.riskShare),
      },
    };
  }

  if (rule.key === 'pair') {
    if (!facts.pair) return none;
    // Two conditions, and both are about whether the card is worth a player's
    // attention: the pair has to move together AND has to be carrying enough of
    // the portfolio's risk for that to be what matters about it.
    const closeEnough = facts.pair.r >= when.correlationAtLeast;
    const bigEnough = !Number.isFinite(when.pairRiskAtLeast)
      || facts.pair.riskShare >= when.pairRiskAtLeast;
    return {
      key: rule.key,
      fires: closeEnough && bigEnough,
      values: { a: facts.pair.a, b: facts.pair.b, r: formatCorrelation(facts.pair.r, pairThreshold) },
    };
  }

  if (rule.key === 'groupRisk') {
    if (!facts.groups) return none;
    const top = facts.groups[0];
    if (!top) return none;
    const fires = facts.total >= when.minHoldings
      && facts.groups.length >= when.minGroups
      && top.riskShare >= when.groupRiskAtLeast;
    return {
      key: rule.key,
      fires,
      values: {
        group: top.label,
        count: String(top.count),
        total: String(facts.total),
        dollarPct: percent(top.dollarShare),
        riskPct: percent(top.riskShare),
      },
    };
  }

  if (rule.key === 'riskGapOver' || rule.key === 'riskGapUnder') {
    const over = rule.key === 'riskGapOver';
    const best = facts.holdings.reduce(
      (found, holding) => (found === null || (over ? holding.gap > found.gap : holding.gap < found.gap)
        ? holding : found),
      null,
    );
    if (best === null) return none;
    const size = over ? best.gap : -best.gap;
    // A negative share of risk means the holding offsets the rest rather than
    // adding to it. That is a real thing a portfolio can do, and it is a
    // different lesson from "it is steadier than the rest", so it falls through
    // to the next rule rather than being worded as if it were the same.
    const sharePasses = !Number.isFinite(when.riskShareAtLeast) || best.riskShare >= when.riskShareAtLeast;
    return {
      key: rule.key,
      fires: size >= when.gapAtLeast && sharePasses,
      values: {
        ticker: best.ticker,
        dollarPct: percent(best.dollarShare),
        riskPct: percent(best.riskShare),
      },
    };
  }

  throw new Error(`ruleCandidate: no rule named ${rule.key}`);
}

/**
 * The card for one revealed portfolio.
 *
 * @param {object} facts            from whyFacts()
 * @param {object} why              why.json, validated
 * @param {string|null} options.bucket  level 1's "Same bet?" bucket; when set, the
 *                                      bucket card is used and no rule is applied
 * @param {number|null} options.pairThreshold the level's own pass threshold, when
 *                                      the level's measure is a correlation
 * @param {string|null} options.leadIn which of LEAD_IN_KEYS opens the card, or
 *                                      null on a level that takes no lead-in
 */
export function pickWhy(facts, why, { bucket = null, pairThreshold = null, leadIn = null } = {}) {
  // The lead-in is kept BESIDE the card text and never joined to it. Two
  // templates, each rendered as written, is still no generated prose; one string
  // built out of two would not be, and the test that holds the card text to its
  // own template would have nothing left to hold.
  if (leadIn !== null && !LEAD_IN_KEYS.includes(leadIn)) {
    throw new Error(`pickWhy: "${leadIn}" is not a lead-in why.json carries (${LEAD_IN_KEYS.join(', ')})`);
  }
  const leadInLine = bucket === null && leadIn !== null ? why.leadIn[leadIn] : null;

  if (bucket !== null) {
    const card = why.bucketCards[bucket];
    if (!card) throw new Error(`pickWhy: why.json has no card for the "${bucket}" bucket`);
    if (!facts.pair) throw new Error('pickWhy: a bucket card needs two holdings to name');
    const values = {
      a: facts.pair.a,
      b: facts.pair.b,
      r: formatCorrelation(facts.pair.r, pairThreshold),
    };
    return asCard(bucket, card, values, leadInLine);
  }

  for (const key of why.order) {
    const rule = why.rules.find((r) => r.key === key);
    const candidate = ruleCandidate(facts, rule, { pairThreshold });
    if (candidate.fires) return asCard(rule.key, rule, candidate.values, leadInLine);
  }
  return asCard(why.fallback.key ?? 'fallback', why.fallback, {}, leadInLine);
}

/** One card, with its text already filled in, so no screen has to word anything. */
function asCard(key, card, values, leadIn = null) {
  // The template is kept beside the text on purpose: tests/why.test.js asserts
  // that the one is the other filled in, which is what "no generated prose"
  // means in practice.
  const trimmed = {};
  for (const name of placeholdersIn(card.template)) trimmed[name] = values[name];
  return {
    key,
    says: card.says,
    template: card.template,
    values: trimmed,
    text: fillTemplate(card.template, trimmed),
    /** The line before the card, or null on a level that takes no lead-in. */
    leadIn,
  };
}
