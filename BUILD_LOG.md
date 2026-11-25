# Build log

## 2026-11-25: Choosing the AI basket (before session 1.2)
- Changed: Wrote basket.json with 13 AI stocks, a one-sentence selection rule, and a reason for each.
- I decided or corrected: Claude's first draft included SMCI. I swapped it for AMZN because SMCI is extremely volatile and had an accounting crisis in 2024, which could distort an equal-weight basket, and AMZN is a name every student recognizes. I also kept TSLA out because most of its revenue still comes from cars, and TSM out because the basket is limited to US companies.

## 2026-11-25: Pre-registration (sessions 1.2 and 1.3)
- Changed: Wrote tickers.json (40 tickers, 9 groups) and PREREG.md; pushed the annotated prereg tag. Added PREREG_AMENDMENT.md moving the freeze date to 24 Nov 2026.
- I decided or corrected: Added a 9th group for VOO, VTI and QQQ; fixed CSCO's reason; chose JPM, JNJ, PG and seed 2026; moved the freeze date forward before any data was downloaded so I can use real prices now.

## 2026-11-25: Tests first (session 1.4)
- Changed: Wrote tests/make_fixtures.py (numpy, seed 2026, five cases), the generated tests/fixtures/known_answers.json, and tests/math.test.js (48 tests). Stubbed js/math.js so the suite runs red: 47 failures, all "not implemented". Added package.json (no dependencies, just `"type": "module"` so node can load the browser files) and .gitignore.
- I decided or corrected: Claude found that Case 2 cannot use randomly sampled returns. Sampling two "independent" assets gave an effective-bets answer of 1.82 instead of 2, because a sample correlation of even 0.000002 breaks the tie between the eigenvalues. The two hand-derivable cases now use an exact covariance matrix and only the other three use seeded returns. Also kept numpy out of the system Python by using a .venv.

### Note for the Methods tab: tied eigenvalues

Effective bets splits a portfolio's risk into principal components. When two
components have exactly the same variance, there is no single right way to draw
them: any rotation within that plane fits equally well, and the effective-bets
number changes depending on which one is chosen.

The clearest example is two independent holdings of equal volatility held 50/50.
Drawn one way, the portfolio sits half on each component and the answer is 2
bets. Drawn another, it sits entirely on one component and the answer is 1 bet.
Both are mathematically valid. One Trade returns the first, because it matches
what anyone would work out by hand.

This is not only a tie-breaking rule. Two such holdings with a correlation of
just 0.01 give an answer of 1.0 rather than 2.0, so the measure is genuinely
unstable when holdings are close to equally volatile and close to uncorrelated.
Real portfolios rarely sit exactly there, but players who build near-symmetric
portfolios may see the number jump. This is a sharper version of weakness 9 in
the PRD: the measure is built from components, not from holdings, and the
components are not always uniquely defined.
