# One Trade — pre-registration amendment 3

**Amendment date:** 26 November 2026

**Status of the data at this date: no guess record has ever been sent.** There
is no `worker/` directory, no Worker has ever been deployed, and
`/ping`/`/guess` have never been called by anything — `js/game.js`'s
`record()` has collected rows in memory since session 2.10 with a comment
saying the Worker is where it will attach, and it still does. Anyone can
check this with `git log --all --diff-filter=A --name-only -- worker/`,
which returns nothing. That is what makes this amendment legitimate rather
than a rule written to fit rows already collected.

**What is not changing:** [PREREG.md](PREREG.md) is not edited. It stays
exactly as it was committed at the `prereg` tag, and that tag stays where it
is. [PREREG_AMENDMENT.md](PREREG_AMENDMENT.md) and
[PREREG_AMENDMENT_2.md](PREREG_AMENDMENT_2.md) are not edited either. This
file records every difference from those three, all of them about
Hypothesis 3 only. Where they disagree, this file wins.

**Reason for the amendment:** PREREG.md fixes Hypothesis 3's claim, its five
fields, its pass rule and its 60-day collection window, but it is silent on
three things that only came up while building level 7 and the Worker:
which of several records from one player counts, whether the browser may
remember a portfolio it has already shown a player, and how a playtest
session's own guesses stay out of the analysis without changing the
registered record. BUILD_LOG.md sessions 2.10 and 2.19 worked out answers to
all three before any code enforced them and before any real guess existed;
this amendment is those answers, registered before the Worker that would
make them matter ever goes live.

---

## 1. Which record Hypothesis 3 reads

Level 7 locks three guesses and therefore sends three records, all carrying
level 7; the hypothesis needs the first. **The five registered fields are
unchanged** — no field names which of the three a record is for, and no pool
id is added. Adding one would be a change to the registered record to buy
something a rule can give for free.

**The rule: for each player ID, the analysis reads the earliest level-2 row
and the earliest level-7 row**, by the timestamp Workers Analytics Engine
puts on every row itself. That timestamp is not a field of the record and
costs nothing to add. A replay is handled by the same rule, not a special
case: a player's first-ever level-7 attempt is the earliest row, whatever
they do afterwards.

Two client rules make "earliest level-7 row" mean "the first mystery
portfolio," and without them this rule would be empty:

1. The three portfolios are shown in a fixed order, and portfolio 1's guess
   is locked and sent before portfolio 2 is ever offered.
2. Each record is sent the moment its guess is locked, never batched. A
   client that posted all three together at the end of the level would hand
   the Worker three rows whose arrival order says nothing about portfolio
   order.

The Worker honours both: `/guess` stores one record per request, on arrival,
and never batches, queues or reorders.

## 2. Persisting which pool portfolios a browser has seen

`js/game.js` already excludes, from level 7's first draw, every pool
portfolio this browser has been dealt before — the one level 2 just showed,
and the first portfolio of any earlier level-7 attempt — so that a repeat
measures memory of the reveal rather than learning. Until this amendment
that exclusion lived in memory only and was lost on reload.

**This amendment registers that the exclusion may be persisted across
visits**, in its own storage key, survives a Reset of progress, and falls
back to drawing from the full pool of 20 if every portfolio has already been
excluded. This changes nothing about the registered draw:

- The marginal draw stays exactly uniform over all 20. Level 2 draws one of
  20; level 7 draws one of the remaining 19 (or, once storage has excluded
  more than one, of however many remain) — for any portfolio `j`, summing
  over which ones were excluded first still gives `1/20`, because the draw
  treats all twenty labels symmetrically at every step. Persisting the
  exclusion changes how many labels are excluded by the time of a given
  draw, never the symmetry the uniformity argument rests on.
- The pair level 2 and level 7 draw stays exchangeable under a null of no
  learning, which is what the registered one-sided sign test assumes.

So persisting the exclusion is registered here as an extension of the
existing rule, not a new one: it cannot change which verdict the registered
test can reach, only how many repeat-portfolio rows a player who returns
across visits is spared.

## 3. Playtest sessions, and why they need no new field

Any playtest run (BUILD_LOG.md session 2.27; see docs/PRD.md's Milestone 4)
is opened with `?src=playtest`. The Worker reads that query parameter and,
for `/guess` requests only, writes the row to a separate Analytics Engine
dataset, `GUESSES_PLAYTEST`, instead of the registered `GUESSES` dataset.
Hypothesis 3's analysis reads `GUESSES` only. A playtest row is excluded by
which table holds it, never by a field inside the record, so the five
registered fields are identical in every row in every dataset: this is a
routing decision in front of the record, not a change to it.

## 4. Unchanged

Everything else in PREREG.md and its earlier amendments stands, in
particular: Hypothesis 3's claim, its five-field record, its pass rule (at
least 60 players, median level-7 error at most 70% of median level-2 error,
sign test p below 0.05), its 60-day collection window, and its stated limit
that there is no control group.

Educational, not investment advice.
