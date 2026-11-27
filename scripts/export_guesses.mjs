#!/usr/bin/env node
// scripts/export_guesses.mjs - pulls every row out of the GUESSES and
// GUESSES_PLAYTEST Analytics Engine datasets and writes them to local JSON
// files, before Cloudflare's retention window deletes them.
//
// MUST RUN BY DAY 80 AFTER LAUNCH, AT THE LATEST. Cloudflare's own docs put
// Workers Analytics Engine retention at about three months (90-92 days);
// Hypothesis 3's registered collection window alone is 60 days. Day 80
// leaves about ten days of margin on top of that for the export itself to
// happen, without leaning on the exact upper edge of a figure Cloudflare
// does not guarantee precisely. See BUILD_LOG.md session 2.27 for the
// sources and the reasoning. Running it earlier costs nothing - a row
// exported once just gets exported again next run - but a row exported too
// late is gone for good.
//
// Needs two environment variables, never hardcoded (CLAUDE.md rule 7):
//   CLOUDFLARE_ACCOUNT_ID   - from `npx wrangler whoami` in worker/
//   CLOUDFLARE_API_TOKEN    - a token scoped to Account Analytics: Read only
//
// Usage: CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/export_guesses.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN first - see this file\'s header.');
  process.exit(1);
}

// worker/wrangler.toml's dataset names, not the binding names.
const DATASETS = ['one_trade_guesses', 'one_trade_guesses_playtest'];

async function exportDataset(name) {
  // blob1/blob2 and double1-3 are the columns worker/src/index.js writes, in
  // the order it writes them: [id, date] and [level, guess, actual].
  const sql = `SELECT timestamp, blob1 AS id, blob2 AS date, double1 AS level, double2 AS guess, double3 AS actual FROM ${name}`;
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'text/plain' },
      body: sql,
    },
  );
  if (!response.ok) {
    throw new Error(`${name}: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

const outDir = fileURLToPath(new URL('../data/guess_exports/', import.meta.url));
mkdirSync(outDir, { recursive: true });

for (const name of DATASETS) {
  const data = await exportDataset(name);
  const path = fileURLToPath(new URL(`../data/guess_exports/${name}.json`, import.meta.url));
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`${name}: wrote ${data?.data?.length ?? 0} rows to ${path}`);
}
