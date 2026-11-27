# One Trade: instructions for Claude

## What this project is
One Trade is a free browser game that teaches university students
diversification, using live market data and pretend money.
The full specification is docs/PRD.md. Read it before planning any work.
If a request conflicts with the PRD, stop and ask me.

## About me
I am a first-year at UChicago. I know Python, JavaScript, web pages, Github, and modelling
(numpy, pandas). I am new to Cloudflare. 

## How we work
1. Before writing code, give me a short plan: the files you will create
   or change, and how we will test it. Wait for my OK.
2. Work in small steps: one feature per session.
3. For any math, write the test first. Browser math must match the
   numpy known-answer tests to 1e-9.
4. After every change, run the tests and show me the result.
5. After creating or changing a file, explain what it does in five
   bullet points or fewer.
6. Never fetch real prices until the git tag `prereg-v3` exists on GitHub.
7. Never put secrets (API keys, the Worker secret) in code or commits.
   Use environment variables and .gitignore.
8. Keep it simple: plain HTML, CSS and JavaScript. No frameworks or new
   libraries unless I agree first.
9. Do not add features that are not in the PRD. Suggest them instead.
10. Every screen that shows a number must say
    "Educational, not investment advice."

## Project layout
- index.html: the page
- js/: browser code (math.js, levels.js, game.js and so on)
- js/returns.js: the snapshot turned into date-aligned daily returns
- worker/: the Cloudflare Worker
- data/: the price snapshot, and results.json
- scripts/fetch_data.py: downloads prices
- scripts/run_research.mjs: reproduces every verdict, writes data/results.json
- tests/: known-answer tests
- docs/PRD.md: the specification

## Commands
- Run the site locally: python3 -m http.server 8000
- Run JavaScript tests: node --test "tests/**/*.test.js"
- Make test fixtures: python tests/make_fixtures.py
- npm run export: pulls the guess records out of Analytics Engine to
  data/guess_exports/. Run it weekly once collection starts, with .env
  filled in. Not from a terminal you deploy the Worker from.
- npm run shots: screenshots every screen at phone width in both colour
  schemes, into gitignored screenshots/. Needs Playwright.
- npm run checks: drives a real browser to check scroll position, focus
  and tap targets survive a redraw - the things a node test cannot see.
- npm run phone: estimates how long levels 1 to 3 take on a mid-range phone
  (4x CPU, Slow 4G) plus reading and tap time. An estimate, not a real phone.
- npm run a11y: contrast ratios, tap-target sizes and heading order, which
  Lighthouse does not reach. Run it alongside Lighthouse, not instead.