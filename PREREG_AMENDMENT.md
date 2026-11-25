# One Trade — pre-registration amendment 1

**Amendment date:** 25 November 2026

**Status of the data at this date: no prices have been downloaded.** The repository
contains no price file, and none existed at the `prereg` tag either. Anyone can check
this: there is no `data/` directory and no `scripts/fetch_data.py` at either tag, so no
result of any kind existed when this amendment was written. That is what makes the
amendment legitimate rather than a change made after seeing an answer.

**What is not changing:** [PREREG.md](PREREG.md) is not edited. It stays exactly as it
was committed at the `prereg` tag, and the `prereg` tag itself stays where it is. This
file records every difference from it. Where the two disagree, this file wins, and
everything in PREREG.md that is not listed below is unchanged.

**Reason for the amendment:** to use real prices now rather than wait six days. Nothing
about any hypothesis, threshold, sample size, seed or verdict rule is changed; the
change is to dates and to the rule that gates downloading.

---

## 1. New freeze date

| | Was, in PREREG.md | Is now |
| --- | --- | --- |
| Freeze date | The last trading day on or before 30 November 2026 | **24 November 2026** |

24 November 2026 is a Tuesday and a normal trading day. It is the last completed
trading day before this amendment, chosen so that no partial day of trading is
included.

## 2. Hypothesis 2's windows, restated from the new freeze date

Hypothesis 2's windows are defined relative to the freeze date:

- The recent 12 months is the 12 months **ending on** the freeze date.
- The 10-year window and the earliest 12 months **start 10 years before** the freeze date.

Resolved against the freeze date of 24 November 2026, those are:

| Window | Dates |
| --- | --- |
| Full window (10 years) | 24 November 2016 to 24 November 2026 |
| Earliest 12 months | 24 November 2016 to 23 November 2017 |
| Recent 12 months | 25 November 2025 to 24 November 2026 |

PREREG.md stated these as "December 2016 to November 2026", "Dec 2016 to Nov 2017" and
"Dec 2025 to Nov 2026". The dates above replace those.

Note for the data step: 24 November 2016 was Thanksgiving, so US markets were closed.
The window therefore begins at the first trading day on or after 24 November 2016. This
is a property of the calendar, not a change to the window.

## 3. New rule for downloading prices

| | Was, in PREREG.md | Is now |
| --- | --- | --- |
| When prices may be downloaded | No price is downloaded before 1 December 2026 | **Prices may be downloaded once the `prereg-v2` tag is on GitHub** |

The 1 December 2026 rule is withdrawn. The gate is now the `prereg-v2` tag, which marks
the commit containing this amendment. Downloading before that tag is on GitHub is still
not allowed, so the amendment is timestamped publicly before any data exists.

## 4. One claim in PREREG.md that no longer holds

PREREG.md's preamble says of its copied research section: "The PRD stays the source of
truth; a test checks the two remain identical." Because `docs/PRD.md` is updated to the
new dates and PREREG.md deliberately is not, those two texts are no longer identical,
and that test would now fail by design. It is replaced by two checks:

1. PREREG.md is byte-for-byte unchanged from the `prereg` tag.
2. Every difference between PREREG.md and the PRD's research section is listed in this file.

## 5. Unchanged

Everything else in PREREG.md stands, in particular: all three hypotheses and their
claims; every threshold (H1's 0.60 median, H2's 0.10 correlation rise and 90% interval,
H3's 60 players, 70% error ratio and p below 0.05); the sample sizes of 500 beginner and
500 control portfolios; the 3 to 8 holdings range; the flat Dirichlet weights; the
20-day blocks and 2,000 resamples; RSP as H2's benchmark; the leave-one-out reruns; the
random seed 2026; the 3 non-AI stocks JPM, JNJ and PG; the frozen 13-name basket in
basket.json; the universe in tickers.json, whose ticker list is unchanged (see section 6 for a wording fix to one descriptive note in it); and the rule that every verdict is reported
whichever way it comes out.

## 6. One wording fix in tickers.json

The ticker list, the 9 groups and every reason in tickers.json are unchanged. One
descriptive note in it referred to the old window and is corrected to match this
amendment:

| | Was | Is now |
| --- | --- | --- |
| `history_note` | "...the whole 10-year window that starts in December 2016." | "...the whole 10-year window, which starts on the first trading day on or after 24 November 2016." |

No ticker was added, removed or regrouped, and no `full_history` value changed.

Educational, not investment advice.
