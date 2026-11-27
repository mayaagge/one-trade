// worker/src/index.js - the Cloudflare Worker: two anonymous analytics
// routes, /ping and /guess, and nothing else.
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

export const MAX_BODY_BYTES = 1024;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// levels.json: levels 2 and 7 share one guess slider, 1 to 6 - the only
// values the real UI can ever produce. tests/worker.test.js cross-checks
// this against levels.json so a future level-range edit cannot drift out of
// sync unnoticed.
export const GUESS_RANGE = { min: 1, max: 6 };

// Not the slider's range: "actual" is a measured value, not typed input. The
// bound here is the mathematical one - effective bets can never fall below 1
// (fully concentrated) or above a portfolio's own holdings count, and
// docs/PRD.md caps every registered pool at 8 holdings (Hypothesis 1's
// universe, the finalPool capstone draw).
export const ACTUAL_RANGE = { min: 1, max: 8 };

export const RECORDING_LEVELS = new Set([2, 7]);
export const PING_LEVELS = new Set([1, 2, 3, 4, 5, 6, 7]);

// Mirrors js/participant.js's ID_LENGTH (32) and its own hex check exactly -
// this Worker cannot import that file (it runs in the browser, uses
// localStorage), so the shape is restated here.
const PARTICIPANT_ID_RE = /^[0-9a-f]{32}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SRC_RE = /^[a-z0-9-]{1,40}$/;

const GUESS_FIELDS = ['actual', 'date', 'guess', 'id', 'level'];

/** The exact set of keys, nothing extra and nothing missing. */
function hasExactFields(body, fields) {
  const keys = Object.keys(body).sort();
  return keys.length === fields.length && fields.every((field, i) => keys[i] === field);
}

export function isFiniteInRange(value, { min, max }) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** The UTC calendar date only, as a timestamp at midnight - so two dates on
 * the same side of midnight compare by day, not by however many hours
 * happen to separate two arbitrary times of day. */
function utcMidnight(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * A real YYYY-MM-DD, at most one calendar day from `now` - so a script
 * cannot backdate a flood, while "yesterday" and "tomorrow" both still pass
 * regardless of what time of day `now` happens to be.
 */
export function isValidDate(date, now = new Date()) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return Math.abs(utcMidnight(parsed) - utcMidnight(now)) <= ONE_DAY_MS;
}

/**
 * PREREG.md's five fields, the five fields, and only those five.
 *
 * @param {*} body parsed JSON, of any shape
 */
export function validateGuessBody(body, now = new Date()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (!hasExactFields(body, GUESS_FIELDS)) return false;
  if (typeof body.id !== 'string' || !PARTICIPANT_ID_RE.test(body.id)) return false;
  if (!RECORDING_LEVELS.has(body.level)) return false;
  if (!isFiniteInRange(body.guess, GUESS_RANGE)) return false;
  if (!isFiniteInRange(body.actual, ACTUAL_RANGE)) return false;
  if (!isValidDate(body.date, now)) return false;
  return true;
}

/** Lighter than /guess's: a ping is not a PREREG-registered record. */
export function validatePingBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const keys = Object.keys(body).sort();
  const withSrc = hasExactFields(body, ['level', 'src']);
  const withoutSrc = hasExactFields(body, ['level']);
  if (!withSrc && !withoutSrc) return false;
  if (!PING_LEVELS.has(body.level)) return false;
  if (withSrc && (typeof body.src !== 'string' || !SRC_RE.test(body.src))) return false;
  return true;
}

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

  // Keyed on the participant id, never the IP: Cloudflare's own rate-limit
  // docs advise against IP (shared by many visitors on one connection) and
  // this route already carries a better key.
  const limiter = env.GUESS_LIMITER;
  if (limiter) {
    const { success } = await limiter.limit({ key: body.id });
    if (!success) return new Response('rate limited', { status: 429, headers });
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
  // leaves the browser"), so there is no better key than the IP here. It is
  // passed to the binding's own ephemeral counter and never written to a
  // blob, an index, or a log anywhere in this file.
  const ip = request.headers.get('CF-Connecting-IP');
  const limiter = env.PING_LIMITER;
  if (limiter && ip) {
    const { success } = await limiter.limit({ key: ip });
    if (!success) return new Response('rate limited', { status: 429, headers });
  }

  const src = body.src ?? 'direct';
  env.PINGS?.writeDataPoint({
    blobs: [src],
    doubles: [body.level],
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
