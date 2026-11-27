// worker/src/validate.js - the pure parts of worker/src/index.js: no
// Request, no Response, no env, nothing the Workers runtime treats
// specially.
//
// ITS OWN FILE, AND THIS IS NOT JUST ORGANIZATION. The Workers runtime
// inspects every named export of the module it loads as the entrypoint and
// expects each one to be a function or a class - a plain constant like a
// number or an object fails to start the whole Worker with "Incorrect type
// for map entry ... not of type 'function or ExportedHandler'". Caught by
// running `wrangler dev` for the first time: worker/src/index.js used to
// export MAX_BODY_BYTES, GUESS_RANGE and the rest directly, for
// tests/worker.test.js to import, and that is exactly what broke. Moving
// them here means worker/src/index.js can export nothing but
// `export default { fetch }`, which is the only shape the runtime actually
// wants, while tests/worker.test.js still imports the real functions and
// constants from here, not copies.
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
  const withSrc = hasExactFields(body, ['level', 'src']);
  const withoutSrc = hasExactFields(body, ['level']);
  if (!withSrc && !withoutSrc) return false;
  if (!PING_LEVELS.has(body.level)) return false;
  if (withSrc && (typeof body.src !== 'string' || !SRC_RE.test(body.src))) return false;
  return true;
}

/** True if the limiter says this key is over budget. No limiter or no key
 * means nothing to check, not a free pass that throws. */
export async function rateLimited(limiter, key) {
  if (!limiter || !key) return false;
  const { success } = await limiter.limit({ key });
  return !success;
}
