#!/usr/bin/env node
// scripts/export_guesses.mjs - pulls every row out of the GUESSES and
// GUESSES_PLAYTEST Analytics Engine datasets and writes them to local JSON
// files, before Cloudflare's retention window deletes them.
//
// RUN MONTHLY: 26 DECEMBER 2026, 25 JANUARY 2027 WHEN COLLECTION CLOSES, AND
// 14 FEBRUARY 2027 AT THE LATEST. Cloudflare's own docs put Workers Analytics
// Engine retention at about three months (90-92 days); Hypothesis 3's
// registered collection window alone is 60 days, so 14 February - launch plus
// 80 days - leaves about ten days of margin without leaning on the exact upper
// edge of a figure Cloudflare does not guarantee precisely. It is the LAST SAFE
// date, not the intended one. See BUILD_LOG.md sessions 2.29 and 2.36 for the
// sources and the reasoning. Every run is a full, fresh pull of whatever is
// still in each dataset - never an append - so running it again never
// duplicates anything and running it early costs nothing.
//
// Needs two environment variables, never hardcoded (CLAUDE.md rule 7):
//   CLOUDFLARE_ACCOUNT_ID   - from `npx wrangler whoami` in worker/
//   CLOUDFLARE_API_TOKEN    - a token scoped to Account Analytics: Read only
//
// RUN IT WITH `npm run export`, which reads both from a .env file in the repo
// root if there is one and falls back to whatever is already exported if there
// is not. Write that file once and each run is one command:
//
//   printf 'CLOUDFLARE_ACCOUNT_ID=...\nCLOUDFLARE_API_TOKEN=...\n' > .env
//
// .env is in .gitignore and must stay there. A token that reaches a commit is
// a token to revoke, not to tidy up afterwards.
//
// CAREFUL WHICH SHELL YOU EXPORT IT IN. `wrangler` prefers CLOUDFLARE_API_TOKEN
// over its own OAuth login, so a terminal holding this read-only analytics
// token cannot deploy the Worker - it fails with "No access to the specified
// service", which looks nothing like a permissions problem with the token you
// are actually using. Deploy from a different tab, or `unset` it first.
//
// Confirmed working against the live datasets on 27 November 2026, the day the
// Worker was deployed (BUILD_LOG.md session 2.29).

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
