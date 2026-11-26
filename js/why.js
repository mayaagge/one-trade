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

import {
  betaContributions,
  correlation,
  covariance,
  effectiveBets,
  equalWeightBasket,
  riskShares,
} from './math.js';
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
  quietNotABet: ['ticker', 'dollarPct', 'riskPct'],
  hiddenAi: ['ticker', 'dollarPct', 'portfolioBeta', 'contribution'],
  hiddenAiAll: ['ticker', 'dollarPct', 'portfolioBeta'],
  overRiskLimit: ['ticker', 'riskPct', 'dollarPct', 'limitPct'],
  fewBets: ['total', 'bets', 'maxRiskPct'],
  crashCushion: ['ticker', 'move', 'indexMove', 'dollarPct'],
  crashCushionElsewhere: [
    'ticker', 'move', 'indexMove', 'dollarPct', 'otherWindow', 'otherMove', 'otherIndexMove',
  ],
  crashDrag: ['ticker', 'move', 'indexMove', 'dollarPct'],
  fallback: [],
};

/** The rule keys this file knows how to apply. why.json may not invent one. */
export const RULE_KEYS = [
  'overRiskLimit', 'crashCushionElsewhere', 'crashCushion', 'crashDrag',
  'hiddenAiAll', 'hiddenAi', 'groupRisk', 'fewBets', 'pair', 'pairLowRisk',
  'riskGapOver', 'riskGapUnder', 'quietNotABet',
];

/**
 * A rule may say that it LEADS in one situation, and otherwise never speaks.
 *
 * why.json's `order` is the order for every portfolio. One card does not belong
 * in it: the card for a level 5 round that MISSED names the holding that failed
 * the level, and on any other level - or on a level 5 round that passed - it
 * would either be false or be answering a question nobody asked. So it carries a
 * `leads` block instead of a place in the order, matched against what the round
 * actually was. A rule with `leads` is deliberately absent from `order`, and
 * validateWhy() holds it to that.
 *
 * These are the facts about a round a `leads` block may match on. Keeping the
 * list here, rather than letting why.json name any field it likes, is the same
 * rule the placeholders follow: a condition cannot be invented in the JSON alone.
 */
/**
 * What a round reports about itself, for a card that leads on one kind of round.
 *
 * `mode` is how the weekly challenge gets the card about bonds: its portfolios
 * are chosen to teach, several of them hold a bond fund that takes a big share
 * of the money and almost none of the risk, and that is the lesson there. On a
 * LEVEL the same portfolio shape is usually a lesson about the loud holding
 * instead, so quietNotABet keeps its ordinary low place in why.json's order
 * everywhere else rather than outranking riskGapOver across the whole game.
 */
export const LEAD_MATCHES = ['measure', 'passed', 'mode'];

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

  // The series block, when the file carries one. A file without it is valid -
  // level 7 simply gets no card - but a file WITH a broken one must fail here
  // rather than three screens into a capstone.
  if (data.seriesCards !== undefined) {
    const block = data.seriesCards;
    if (!block || !Array.isArray(block.rules) || !Array.isArray(block.order)) {
      throw new Error('why: seriesCards needs a rules array and an order');
    }
    const seriesKeys = new Set();
    for (const rule of block.rules) {
      if (!SERIES_RULE_KEYS.includes(rule.key)) {
        throw new Error(`why: series rule "${rule.key}" is not one this code can apply (${SERIES_RULE_KEYS.join(', ')})`);
      }
      if (seriesKeys.has(rule.key)) throw new Error(`why: duplicate series rule ${rule.key}`);
      seriesKeys.add(rule.key);
      if (!rule.when || typeof rule.when !== 'object') {
        throw new Error(`why: series rule ${rule.key} has no "when"`);
      }
      checkCard(rule, SERIES_PLACEHOLDERS[rule.key], `why: seriesCards.${rule.key}`);
    }
    for (const key of block.order) {
      if (!seriesKeys.has(key)) {
        throw new Error(`why: the series order names ${key}, which has no rule`);
      }
    }
    // EVERY RULE IS IN THE ORDER, or it could never fire. A rule left out of the
    // order is dead text that reads like a live card.
    for (const key of seriesKeys) {
      if (!block.order.includes(key)) {
        throw new Error(`why: series rule ${key} is in no order, so it could never be chosen`);
      }
    }
    checkCard(block.fallback, SERIES_PLACEHOLDERS.mixedThree, 'why: seriesCards.fallback');
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
    if (rule.leads !== undefined) {
      if (!rule.leads || typeof rule.leads !== 'object' || Object.keys(rule.leads).length === 0) {
        throw new Error(`why: rule ${rule.key} has an empty "leads", which would lead on every round`);
      }
      for (const field of Object.keys(rule.leads)) {
        if (!LEAD_MATCHES.includes(field)) {
          throw new Error(
            `why: rule ${rule.key} leads on "${field}", which is not something a round reports `
            + `(${LEAD_MATCHES.join(', ')})`,
          );
        }
      }
    }
    checkCard(rule, PLACEHOLDERS[rule.key], `why: rule ${rule.key}`);
    byKey.set(rule.key, rule);
  }

  if (!Array.isArray(data.order) || data.order.length === 0) {
    throw new Error('why: an order is missing, so a portfolio firing two rules would have no card');
  }
  for (const key of data.order) {
    if (!byKey.has(key)) throw new Error(`why: the order names ${key}, which has no rule`);
  }
  for (const [key, rule] of byKey.entries()) {
    if (rule.leads) {
      // A leading rule is OUT of the order on purpose: it speaks on one kind of
      // round and stays silent on every other, so a place in the order would let
      // it answer questions nobody asked.
      if (data.order.includes(key)) {
        throw new Error(`why: rule ${key} leads on a round of its own, so it must not also be in the order`);
      }
      continue;
    }
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
 * A move over a window, as a signed whole percent: "+14%", "-2%", "0%".
 *
 * SIGNED, AND NOT WORDED. The crash cards name one holding's own move, and the
 * holding that cushioned a fall is sometimes one that rose and sometimes one that
 * merely fell least - TLT rose 14% through February 2020 and WMT fell 2% - so a
 * template cannot say "rose" or "fell" without being wrong half the time. Putting
 * the direction in the number keeps the sentence true either way, and keeps the
 * card a template filled in rather than a sentence chosen by code.
 */
export function signedPercent(change) {
  if (!Number.isFinite(change)) throw new Error('signedPercent: expected a number');
  const whole = Math.round(change * 100);
  // -0% is an artefact of rounding a tiny fall, and reads as a mistake.
  if (whole === 0) return '0%';
  return `${whole > 0 ? '+' : ''}${whole}%`;
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
export function formatCorrelation(r, threshold = null, places = undefined) {
  return formatMeasure(r, { threshold, ...(places === undefined ? {} : { places }) });
}

/**
 * A beta, as the hiddenAi card shows it: two decimals, which is what level 4's
 * own slider and reveal panel show.
 *
 * It is NOT formatted against level 4's threshold, because the numbers on this
 * card are not the pass-checked number. The card names the portfolio's beta and
 * one holding's part of it; the reveal panel above it states the beta that was
 * checked, through formatMeasure() and against the threshold, as it must.
 */
export function formatBeta(beta) {
  if (!Number.isFinite(beta)) throw new Error('formatBeta: expected a number');
  return beta.toFixed(2);
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
export function whyFacts({
  tickers, weights, matrix, groups = null, basketReturns = null, basketMembers = null,
}) {
  if (!Array.isArray(tickers) || tickers.length === 0) throw new Error('whyFacts: no holdings');
  if (tickers.length !== weights.length) {
    throw new Error(`whyFacts: ${tickers.length} holdings and ${weights.length} weights`);
  }

  const cov = covariance(matrix);
  const shares = riskShares(weights, cov);
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

  // The portfolio's beta to the basket, and where it comes from. Only a level
  // that measures a beta hands these over; without them the hiddenAi rule has
  // nothing to look at and says so, the way the group rule does without groups.
  //
  // The contributions are in BETA UNITS and are never turned into shares of the
  // total: several holdings move slightly against the AI basket, so a share can
  // run past 100% and below 0%. See js/math.js's betaContributions().
  let basket = null;
  if (Array.isArray(basketReturns)) {
    const { betas, contributions, beta } = betaContributions(matrix, weights, basketReturns);
    const members = new Set(basketMembers ?? []);
    basket = {
      beta,
      holdings: tickers.map((ticker, i) => ({
        ticker,
        beta: betas[i],
        contribution: contributions[i],
        dollarShare: weights[i],
        isMember: members.has(ticker),
        group: groups ? groups.get(ticker) ?? null : null,
      })),
    };
  }

  return {
    tickers: [...tickers],
    total: tickers.length,
    holdings,
    pair,
    groups: groupFacts,
    basket,
    // How many separate bets this portfolio really makes, over the same window
    // and the same covariance matrix as the risk shares above. The fewBets rule
    // is the one card that speaks to a portfolio which has spread its risk and
    // still made one bet.
    bets: effectiveBets(weights, cov),
    // The biggest holding's share of the risk, which is level 5's own measure and
    // the fewBets rule's test that the risk really is spread.
    maxRiskShare: shares.reduce((most, share) => (share > most ? share : most), -Infinity),
  };
}

/**
 * The facts for a REPLAYED round - level 6 - which are a different kind of fact
 * from everything above.
 *
 * whyFacts() reads a covariance matrix over three years. A replay has 23 days of
 * one particular February, and asking those rules about it would be a category
 * error dressed as a number: over a crash nearly everything correlates above 0.9,
 * so every round would be told its holdings move together. What a player who just
 * watched two lines actually wants to know is WHICH HOLDING did that to them, and
 * that is arithmetic on the replay itself - no covariance, no thresholds tuned on
 * a short window, nothing that could be subtly wrong.
 *
 * @param {object} result   a js/crash.js replay(), with its per-holding gains
 * @param {object} elsewhere ticker -> the other windows it can be replayed in,
 *                           from js/crash.js's elsewhereFor()
 */
export function crashFacts(result, { elsewhere = {} } = {}) {
  if (!result || !Array.isArray(result.holdings)) {
    throw new Error('crashFacts: expected a replay result with its holdings');
  }
  return {
    crash: {
      window: result.window,
      change: result.change,
      indexChange: result.indexChange,
      indexLabel: result.indexLabel,
      holdings: result.holdings.map((holding) => ({
        ...holding,
        elsewhere: elsewhere[holding.ticker] ?? [],
      })),
    },
  };
}

// -------------------------------------------------------------------- rules

/**
 * Does one rule apply to these facts, and what would its card say?
 *
 * Returns {key, fires, values}. `values` is filled in whenever the rule has
 * something to talk about, even when it does not fire, so a test can see the
 * number that fell short.
 */
export function ruleCandidate(facts, rule, { pairThreshold = null, pairPlaces = undefined, limit = null } = {}) {
  const when = rule.when;
  const none = { key: rule.key, fires: false, values: null };

  if (rule.key === 'overRiskLimit') {
    // The holding that failed level 5: the biggest share of the risk, named with
    // both of its shares and with the limit it went past. It needs the LEVEL'S
    // OWN limit, which is not why.json's to know, so the number is passed in and
    // the card states the same one the reveal panel checked against.
    if (!Number.isFinite(limit)) return none;
    const worst = facts.holdings.reduce(
      (found, holding) => (found === null || holding.riskShare > found.riskShare ? holding : found),
      null,
    );
    if (worst === null) return none;
    return {
      key: rule.key,
      fires: worst.riskShare > limit,
      values: {
        ticker: worst.ticker,
        riskPct: percent(worst.riskShare),
        dollarPct: percent(worst.dollarShare),
        limitPct: percent(limit),
      },
    };
  }

  if (rule.key === 'crashCushion' || rule.key === 'crashCushionElsewhere' || rule.key === 'crashDrag') {
    if (!facts.crash) return none;
    const { holdings, indexChange } = facts.crash;
    if (holdings.length === 0 || !(indexChange < 0)) return none;

    // THE HOLDING THAT MOVED THE MONEY, in dollars rather than in percent. On a
    // round that passed, the one that made the most (or lost the least) is what
    // held the portfolio up; on one that missed, the one that lost the most is
    // what took it down. Ties go to the first picked, as everywhere else here.
    const drag = rule.key === 'crashDrag';
    const pick = holdings.reduce(
      (found, holding) => (found === null
        || (drag ? holding.gain < found.gain : holding.gain > found.gain)
        ? holding
        : found),
      null,
    );
    const values = {
      ticker: pick.ticker,
      move: signedPercent(pick.change),
      indexMove: percent(Math.abs(indexChange)),
      dollarPct: percent(pick.dollarShare),
    };

    if (rule.key !== 'crashCushionElsewhere') {
      // A cushion that did not actually cushion, or a drag that did not drag,
      // would be a card describing the opposite of what happened. On a passing
      // round the best holding can still have lost money - a portfolio can fall
      // 14% with every holding down - and "held this up" is then about holding up
      // BETTER, which the card's own numbers show: its move beside the index's.
      return { key: rule.key, fires: true, values };
    }

    // THE CUSHION THAT WAS NOT ONE EVERY TIME. It fires only when the holding
    // ROSE here - which makes "this is what held you up" unarguable - and fell
    // harder than the index in another window of the same file. Then the card can
    // warn without a word of it being typed in: in February 2020 that is TLT, up
    // 14% here and down 29% against the index's 25% through 2022.
    if (!(pick.change > 0)) return none;
    const failed = (pick.elsewhere ?? [])
      .filter((window) => window.indexChange < 0 && window.change < window.indexChange)
      // The window it underperformed by the most, so the warning is the strongest
      // true one rather than whichever window the file happens to list first.
      .sort((a, b) => (a.change - a.indexChange) - (b.change - b.indexChange))[0];
    if (!failed) return none;
    return {
      key: rule.key,
      fires: true,
      values: {
        ...values,
        // The in-sentence form, not the heading: this name lands in the middle of
        // the card's second sentence, where "The 2022 bear market" reads wrong.
        otherWindow: failed.inSentence,
        otherMove: signedPercent(failed.change),
        otherIndexMove: percent(Math.abs(failed.indexChange)),
      },
    };
  }

  if (rule.key === 'hiddenAi' || rule.key === 'hiddenAiAll') {
    // The AI a player is holding WITHOUT having picked an AI name: the exposure
    // arrives through a fund. Three conditions, and each one is about whether
    // that sentence is true of this portfolio rather than about how it reads.
    if (!facts.basket) return none;
    const { beta, holdings } = facts.basket;
    // A portfolio that barely moves with the basket, or moves against it, has no
    // exposure to explain, and a share of a beta near zero means nothing.
    if (!(beta >= when.portfolioBetaAtLeast)) return none;
    const biggest = holdings.reduce(
      (found, holding) => (found === null || holding.contribution > found.contribution ? holding : found),
      null,
    );
    if (biggest === null || biggest.contribution <= 0) return none;
    // IT HAS TO BE A FUND. "The AI is inside the fund" is false of a chipmaker,
    // and INTC is not in basket.json but carries a beta of 1.0 to it, so without
    // this the card would name INTC and say something untrue. why.json lists the
    // fund groups, so the claim and the test that guards it sit together.
    const fundGroups = when.fundGroups ?? [];
    const isFund = biggest.group !== null && fundGroups.includes(biggest.group.key);
    const qualifies = isFund && !biggest.isMember;

    // ALL OF IT, or part of it. The two rules are exact complements, and the test
    // is what the card will PRINT rather than the raw numbers: a fund at 0.1692
    // of a 0.1707 beta prints "0.17 of 0.17", which reads as a typo and not as a
    // measurement. Holdings that move against the basket are what make this the
    // ordinary case on level 4 rather than a rare one.
    const carriesAll = biggest.contribution >= beta
      || formatBeta(biggest.contribution) === formatBeta(beta);
    const values = {
      ticker: biggest.ticker,
      dollarPct: percent(biggest.dollarShare),
      portfolioBeta: formatBeta(beta),
    };
    if (rule.key === 'hiddenAiAll') {
      return { key: rule.key, fires: qualifies && carriesAll, values };
    }
    return {
      key: rule.key,
      fires: qualifies && !carriesAll && biggest.contribution >= when.shareOfBetaAtLeast * beta,
      values: { ...values, contribution: formatBeta(biggest.contribution) },
    };
  }

  if (rule.key === 'fewBets') {
    // Risk spread evenly, and still one bet. The card level 5 needs, because a
    // player who passes that level without being told this learns the opposite.
    if (!Number.isFinite(facts.bets) || !Number.isFinite(facts.maxRiskShare)) return none;
    return {
      key: rule.key,
      fires: facts.total >= when.minHoldings
        && facts.maxRiskShare < when.maxRiskShareBelow
        && facts.bets < when.betsBelow,
      values: {
        total: String(facts.total),
        bets: facts.bets.toFixed(2),
        maxRiskPct: percent(facts.maxRiskShare),
      },
    };
  }

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
        r: formatCorrelation(facts.pair.r, pairThreshold, pairPlaces),
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
      values: { a: facts.pair.a, b: facts.pair.b, r: formatCorrelation(facts.pair.r, pairThreshold, pairPlaces) },
    };
  }

  if (rule.key === 'groupRisk') {
    if (!facts.groups) return none;
    const top = facts.groups[0];
    if (!top) return none;
    const fires = facts.total >= when.minHoldings
      && facts.groups.length >= when.minGroups
      // A group of one holding is a holding, not a group: it reads as "1 of your
      // 4 holdings are AI stocks" and says less than the risk-gap card would.
      && top.count >= (when.minHoldingsInGroup ?? 1)
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

  if (rule.key === 'quietNotABet') {
    // THE LESSON A PLAYER WHO HOLDS BONDS MOST NEEDS. A bond fund can be half
    // the money and a twentieth of the risk, and effective bets counts the
    // risk - so the holding that makes the portfolio feel diversified is the
    // one adding least to the number. riskGapUnder says the first half of
    // that; this says what it does to the count, and only for a loan fund,
    // because "bonds steady a portfolio" is not a sentence to print about an
    // international fund that happens to be quiet this window.
    const loans = new Set(when.tickers ?? []);
    const quietest = facts.holdings
      .filter((holding) => loans.has(holding.ticker))
      .reduce((found, holding) => (found === null || holding.gap < found.gap ? holding : found), null);
    if (quietest === null) return none;
    return {
      key: rule.key,
      fires: -quietest.gap >= when.gapAtLeast,
      values: {
        ticker: quietest.ticker,
        dollarPct: percent(quietest.dollarShare),
        riskPct: percent(quietest.riskShare),
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
 * The rules that LEAD on this round, in the order why.json lists them.
 *
 * A rule leads when every field of its `leads` block matches the round. An
 * `outcome` that says nothing - which is every level that is not asking - leads
 * nothing, so the order is why.json's own and every other level is untouched.
 */
export function leadingRules(why, outcome = null) {
  if (!outcome) return [];
  return (why.rules ?? [])
    .filter((rule) => rule.leads && Object.entries(rule.leads)
      .every(([field, wanted]) => outcome[field] === wanted))
    .map((rule) => rule.key);
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
 * @param {object|null} options.outcome what this round WAS - {measure, passed} -
 *                                      which decides whether any rule leads
 * @param {number|null} options.limit   the level's own pass threshold, for a card
 *                                      that states the limit a holding went past
 * @param {number} [options.pairPlaces]  how many decimals the correlation gets, from
 *                                      the level's revealPlaces. Level 1 reveals three,
 *                                      and a card reading 1.00 under a panel reading
 *                                      0.996 would be the screen contradicting itself
 */
export function pickWhy(facts, why, {
  bucket = null, pairThreshold = null, pairPlaces = undefined, leadIn = null, outcome = null,
  limit = null,
} = {}) {
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
      r: formatCorrelation(facts.pair.r, pairThreshold, pairPlaces),
    };
    return asCard(bucket, card, values, leadInLine);
  }

  // A rule that leads on this round speaks before why.json's own order. On every
  // round that nothing leads on, this is exactly why.json's order.
  for (const key of [...leadingRules(why, outcome), ...why.order]) {
    const rule = why.rules.find((r) => r.key === key);
    const candidate = ruleCandidate(facts, rule, { pairThreshold, pairPlaces, limit });
    if (candidate.fires) return asCard(rule.key, rule, candidate.values, leadInLine);
  }
  return asCard(why.fallback.key ?? 'fallback', why.fallback, {}, leadInLine);
}

// ------------------------------------------------------- the series card
//
// Level 7's card is about THREE PORTFOLIOS TOGETHER, which is a different kind
// of question from every card above it. Those name something inside one
// portfolio - a pair that moves together, a group holding most of the risk. A
// capstone card has a better thing to name: the shape of a player's three
// errors, which is the misconception itself rather than a symptom of it.
//
// Guessing high on the portfolio with the most holdings is the error the whole
// game is built against: eight holdings read as eight bets. Guessing low on the
// one that really is spread is the same mistake from the other side. Hedging one
// number across all three is a third thing again, and worth naming because the
// strata make it certain to fail.

/** The series rule keys this file knows how to apply. why.json may not invent one. */
export const SERIES_RULE_KEYS = [
  'readThePortfolios', 'sameNumberThrice', 'countedHoldings', 'missedTheSpread',
  'oneNumberThrice',
];

export const SERIES_PLACEHOLDERS = {
  readThePortfolios: ['worst'],
  sameNumberThrice: ['guess'],
  countedHoldings: ['holdings', 'bets', 'guess'],
  missedTheSpread: ['holdings', 'bets', 'guess', 'groups'],
  oneNumberThrice: ['spread', 'low', 'high'],
  mixedThree: [],
};

/**
 * What a finished series says about the three guesses, as facts a card may
 * match on.
 *
 * `parts` is one entry per portfolio, in play order:
 * {guess, actual, holdings, groups, stratum}.
 */
export function seriesFacts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error('seriesFacts: a series has no parts to read');
  }
  for (const part of parts) {
    if (!Number.isFinite(part.guess) || !Number.isFinite(part.actual)) {
      throw new Error('seriesFacts: every part needs a guess and an actual value');
    }
  }
  const signed = parts.map((part) => ({ ...part, by: part.guess - part.actual }));
  const guesses = parts.map((part) => part.guess);

  return {
    parts: signed,
    worstError: Math.max(...signed.map((part) => Math.abs(part.by))),
    /** How far apart the three GUESSES were - a hedge is a narrow spread. */
    guessSpread: Math.max(...guesses) - Math.min(...guesses),
    lowestGuess: Math.min(...guesses),
    highestGuess: Math.max(...guesses),
    /** The portfolio whose bets were most overestimated, and the most underestimated. */
    over: signed.reduce((a, b) => (b.by > a.by ? b : a)),
    under: signed.reduce((a, b) => (b.by < a.by ? b : a)),
  };
}

/** Does one series rule fire on these facts, and with what to fill its template? */
function seriesCandidate(facts, rule) {
  const when = rule.when ?? {};
  const pct = (value) => `${Math.round(100 * value)}%`;
  const bets = (value) => value.toFixed(2);

  if (rule.key === 'readThePortfolios') {
    if (!(facts.worstError <= when.worstErrorAtMost)) return { fires: false };
    return { fires: true, values: { worst: bets(facts.worstError) } };
  }
  if (rule.key === 'countedHoldings') {
    const part = facts.over;
    if (!(part.by >= when.overByAtLeast) || !(part.holdings >= when.minHoldings)) {
      return { fires: false };
    }
    return {
      fires: true,
      values: { holdings: String(part.holdings), bets: bets(part.actual), guess: bets(part.guess) },
    };
  }
  if (rule.key === 'missedTheSpread') {
    const part = facts.under;
    if (!(-part.by >= when.underByAtLeast) || !(part.actual >= when.betsAtLeast)) {
      return { fires: false };
    }
    return {
      fires: true,
      values: {
        holdings: String(part.holdings),
        bets: bets(part.actual),
        guess: bets(part.guess),
        groups: String(part.groups),
      },
    };
  }
  // THE SAME NUMBER THREE TIMES IS ITS OWN CARD, and not a special case of the
  // one below it. "Your three guesses ran from 2.00 to 2.00 - 0.00 bets apart"
  // is what one card for both reads like, and typing one number three times is
  // the single likeliest way to fail this level. Found by playing it.
  if (rule.key === 'sameNumberThrice') {
    if (facts.guessSpread > (when.guessSpreadAtMost ?? 0)) return { fires: false };
    return { fires: true, values: { guess: bets(facts.lowestGuess) } };
  }
  if (rule.key === 'oneNumberThrice') {
    if (!(facts.guessSpread <= when.guessSpreadAtMost)) return { fires: false };
    return {
      fires: true,
      values: {
        spread: bets(facts.guessSpread),
        low: bets(facts.lowestGuess),
        high: bets(facts.highestGuess),
      },
    };
  }
  throw new Error(`seriesCandidate: no rule named ${rule.key}`);
}

/**
 * The card for a finished series: the first rule in why.json's series order that
 * fires, or the fallback.
 *
 * NO LEAD-IN. The lead-ins are verdicts about one guess - "that was close" -
 * and the series screen already states its verdict and its stars above the card,
 * worked out from all three. A fourth verdict in a fifth voice would be the same
 * news again.
 */
export function pickSeriesWhy(facts, why) {
  const block = why.seriesCards;
  if (!block) throw new Error('pickSeriesWhy: why.json has no seriesCards block');
  for (const key of block.order) {
    const rule = block.rules.find((r) => r.key === key);
    if (!rule) throw new Error(`pickSeriesWhy: the series order names ${key}, which has no rule`);
    const candidate = seriesCandidate(facts, rule);
    if (candidate.fires) return asCard(rule.key, rule, candidate.values, null);
  }
  return asCard(block.fallback.key ?? 'mixedThree', block.fallback, {}, null);
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
