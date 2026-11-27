// worker/src/index.js - the Cloudflare Worker: two anonymous analytics
// routes, /ping and /guess, and nothing else.
//
// EXPORTS NOTHING BUT `export default { fetch }`. The Workers runtime
// inspects every named export of this module and requires each one to be a
// function or a class; a plain constant breaks the whole Worker at startup
// ("Incorrect type for map entry ... not of type 'function or
// ExportedHandler'"), caught the first time `wrangler dev` actually ran
// this file. Every validator, constant and helper worth testing directly
// lives in worker/src/validate.js instead, which this file imports from and
// the Workers runtime never loads on its own.
//
// NO PRICE PROXY. docs/PRD.md's Architecture section: prices reach the
// browser entirely through the committed snapshot and the scheduled GitHub
// Actions refresh. This Worker never sees a price.
//
// NO SECRET. Completion codes (the one feature that would have needed one)
// are deferred - see docs/PRD.md milestone 3's note, BUILD_LOG.md session
// 2.27.
//
// VALIDATION EXISTS BECAUSE THE ORIGIN CHECK DOES NOT. Rejecting other
// websites' browsers stops nothing a script POSTing directly with no Origin
// header would notice. See docs/PRD.md's known weaknesses, row 10.
//
// Educational, not investment advice.

import {
  MAX_BODY_BYTES, passedValue, rateLimited, validateGuessBody, validatePingBody,
} from './validate.js';

function corsHeaders(origin, allowedOrigin) {
  if (!allowedOrigin || origin !== allowedOrigin) return null;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

/** Reads the body as JSON, refusing anything over the size cap before parsing. */
async function readJsonBody(request, maxBytes) {
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) return { error: 'too large' };
  try {
    return { body: JSON.parse(new TextDecoder().decode(buf)) };
  } catch {
    return { error: 'not JSON' };
  }
}

async function handleGuess(request, env, url, headers) {
  const { body, error } = await readJsonBody(request, MAX_BODY_BYTES);
  if (error || !validateGuessBody(body)) {
    return new Response('invalid guess record', { status: 400, headers });
  }

  // TWO LIMITERS, BECAUSE THE ID ALONE CAN BE DODGED. Nothing about the id
  // is issued or checked by this server - a script can mint a fresh random
  // one on every request and the id-keyed limiter would never see a
  // repeat. GUESS_IP_LIMITER closes that gap - its OWN binding, generous
  // enough that a full class sharing one campus-wifi IP never trips it by
  // playing normally. It is NOT PING_LIMITER: sharing one IP-keyed budget
  // between the two routes meant a class's pings alone could exhaust it
  // before a single real guess got through. The IP itself is passed
  // straight to the binding's own ephemeral counter and never written to a
  // blob, an index, or a log anywhere in this file.
  const ip = request.headers.get('CF-Connecting-IP');
  if (await rateLimited(env.GUESS_IP_LIMITER, ip)) {
    return new Response('rate limited', { status: 429, headers });
  }
  // Kept alongside the IP check, not replaced by it, and deliberately
  // tighter: this one still catches a flood that reuses a single id from
  // many different IPs.
  if (await rateLimited(env.GUESS_LIMITER, body.id)) {
    return new Response('rate limited', { status: 429, headers });
  }

  // ?src=playtest never touches the registered five-field record - it only
  // decides which dataset the row lands in. PREREG_AMENDMENT_3.md section 3.
  const playtest = url.searchParams.get('src') === 'playtest';
  const dataset = playtest ? env.GUESSES_PLAYTEST : env.GUESSES;
  dataset?.writeDataPoint({
    blobs: [body.id, body.date],
    doubles: [body.level, body.guess, body.actual],
    // One id per index (Analytics Engine allows exactly one): a player's
    // level-2 and level-7 rows share an index value, so equitable sampling
    // keeps or drops them together rather than splitting a pair.
    indexes: [body.id],
  });
  return new Response(null, { status: 204, headers });
}

async function handlePing(request, env, url, headers) {
  const { body, error } = await readJsonBody(request, MAX_BODY_BYTES);
  if (error || !validatePingBody(body)) {
    return new Response('invalid ping', { status: 400, headers });
  }

  // No participant id ever rides along on a ping (by design - PRD's "What
  // leaves the browser"), so there is no better key than the IP here. Its
  // own binding, PING_LIMITER - not GUESS_IP_LIMITER, and not shared with
  // /guess: a class's pings sharing one campus-wifi IP must never be able
  // to exhaust the budget /guess needs. The IP itself is never written to
  // a blob, an index, or a log anywhere in this file.
  const ip = request.headers.get('CF-Connecting-IP');
  if (await rateLimited(env.PING_LIMITER, ip)) {
    return new Response('rate limited', { status: 429, headers });
  }

  const src = body.src ?? 'direct';
  env.PINGS?.writeDataPoint({
    blobs: [src],
    // The level reached, then whether every level before it had been passed
    // when it was reached: 1 yes, 0 no, -1 the client did not say (a page
    // open since before session 2.38). docs/PRD.md reads "players who finish
    // level 3" off level 4's pings where the second number is 1.
    doubles: [body.level, passedValue(body)],
    indexes: [src],
  });
  return new Response(null, { status: 204, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: headers ? 204 : 403, headers: headers ?? {} });
    }
    if (!headers) return new Response('forbidden origin', { status: 403 });
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405, headers });

    if (url.pathname === '/guess') return handleGuess(request, env, url, headers);
    if (url.pathname === '/ping') return handlePing(request, env, url, headers);
    return new Response('not found', { status: 404, headers });
  },
};
