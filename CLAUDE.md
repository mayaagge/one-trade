# One Trade: instructions for Claude

## What this project is
One Trade is a free browser game that teaches university students
diversification, using live market data and pretend money.
The full specification is docs/PRD.md. Read it before planning any work.
If a request conflicts with the PRD, stop and ask me.

## About me
I am a first-year university student. I know Python and modelling
(numpy, pandas). I am new to JavaScript, web pages, Cloudflare and
GitHub Actions. Explain anything web-related in plain language.

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
- worker/: the Cloudflare Worker
- data/: the price snapshot
- scripts/fetch_data.py: downloads prices
- tests/: known-answer tests
- docs/PRD.md: the specification

## Commands
- Run the site locally: python -m http.server 8000
- Run JavaScript tests: node --test "tests/**/*.test.js"
- Make test fixtures: python tests/make_fixtures.py