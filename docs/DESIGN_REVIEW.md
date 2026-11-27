# Design review, 26 November 2026

Every screen and state of One Trade, read at 375px in light and dark mode, before
the playtest. No site code was changed in this session.

**How the findings were reached.** `scripts/shots.mjs` serves the site and drives
all 63 states with real clicks; `scripts/dev_a11y.mjs` measures contrast, tap
targets, headings and labels on the live page; `scripts/dev_checks.mjs` measures
the scroll jump and reads every percentage out of the DOM. Numbers below come
from those runs, not from looking at pictures. Where I looked at a picture and
the measurement disagreed, the measurement is what is written down.

Rankings: **must fix before playtest**, **should fix**, **later**.

---

## 0. The three things worth reading first

1. **The mode nav overflows every screen** (`scrollWidth` 602 against a 375px
   window, on 63 of 63 states). Three of the seven modes are off-screen, and the
   whole site scrolls sideways. One missing `flex-wrap`.
2. **The site opens on Research, and so does every shared link.** `?src=share`
   carries no hash, `modeFromHash('')` falls through to `DEFAULT_MODE`, and the
   first thing a first-year reads is "Hypothesis 1 (hidden concentration): not
   supported on the headline correlation-only test".
3. **One colour fails AA in both schemes and it is the colour of every button.**
   `--series-1` is 4.13:1 on white and 3.43:1 under white text in dark mode.

---

## 1. Every screen and state

63 states, all captured. **The pictures are not committed:** `screenshots/` is
build output, gitignored, and regenerated locally with `npm run shots`, which
writes the folder, the images and the `screenshots/INDEX.md` that lists them.
`--fold` files are the first screenful, which is what the five-second question
is judged on. Two of them are kept as committed copies, in `docs/images/`,
because the README shows them.

| Mode | States captured |
| --- | --- |
| Chrome | loading, skip link focused, nav at 375px, a data file 404 |
| Learn | menu fresh / with stars / storage blocked / reset asked; levels 1–6 build, guess and reveal; level 3's share card; level 5 concentrated; level 6 with the money in the wrong kind, and its crash chart; level 7's first portfolio, first reveal and summary |
| Daily | not ready (the real state today), pair 1, mid-puzzle, finished, file 404 |
| Weekly | not started (the real state today), guess, reveal |
| Crash replay | chooser, 2020 build, 2020 built, 2020 reveal, 2022 reveal |
| Sandbox | empty, built, measures, spread measures, one holding, twelve holdings |
| My real portfolio | empty, four rows, refused ticker, refused amount, measures, full at fifteen, three thirds |
| Research | the page, results 404 |

Two states are real rather than simulated: today is 26 November, the puzzle file
starts on the 27th and the weekly's first Monday is the 30th, so "not ready" and
"not started" are what a visitor sees right now. The playing states were reached
with the modules' own `now` option, not by changing the site.

### Is the one idea clear within five seconds?

| Screen | Verdict |
| --- | --- |
| Learn menu | **Yes.** Title, one-line promise, seven cards. |
| Build | **No.** The heading is followed by 9 group headings and 40 chips; the money is a full screen below the fold. The level's goal is stated once and then scrolls away. |
| Guess | **Yes.** The best screen in the game: one question, one big number, one slider. |
| Reveal | **No, and this is the one that matters.** The answer sits in a bordered box at the same weight as the five blocks under it. Nothing marks it as the moment. |
| Daily pair | **Yes.** |
| Daily, mid-puzzle | **No.** The explanation of the pair just answered is inserted *above* the next question, so the live question is pushed below the fold. |
| Weekly | **Yes.** |
| Crash chooser | **Yes.** |
| Sandbox measures | **Yes** at the top ("Effective bets 1.11"), then three screenfuls. |
| My real portfolio | **Yes.** |
| Research | **No**, and it is the landing page. See finding 0.2. |

### Jargon, as it actually appears

Swept the rendered text of all 63 screens. **`covariance` and `principal
component` appear on no screen at all** — already confined to the code and the
docs, as asked.

`beta` is explained in plain words wherever it appears: level 4's reveal says
"Beta says how far your portfolio moves when the AI basket moves: 1 means it
moves with the basket one for one", and Sandbox says "How much this portfolio
moved for each 1% the equal-weight AI basket moved". The stress-days beta is
labelled "Beta on the worst 10% of days" with "the 75 days the S&P 500 fell
hardest in this window" under it. **Both are already in plain words** — but the
plain words are *below* the number in the quietest text, and the label above it
still leads with "Beta". Leading with the plain sentence and naming the term
second would cost nothing.

The real jargon problem is the **Learn menu**: every card is labelled with a
term the screen never defines — `CORRELATION`, `EFFECTIVE BETS`, `DIVERSIFYING
ACROSS GROUPS`, `INDEX CONCENTRATION`, `RISK SHARE VS DOLLAR SHARE`, `BEHAVIOUR
UNDER STRESS`, `EVERYTHING` — and it is set in the lowest-contrast text on the
page (3.16:1, below AA). The first screen of the game tells a first-year seven
things they cannot read and would not understand.

One more: the level 3 reveal calls the same measure two things four lines apart —
"Separate bets this portfolio really makes" in the panel and "at least 3
effective bets" in the stars note.

### Layout at 375px

`#view` is exactly 375px on every screen and **nothing inside the content area
crosses the right edge**. The only overflow is the nav. (I first read the "Remove"
button on My real portfolio as clipped; measuring it says it ends 15px inside the
edge. The picture was misleading, the rectangle was not.)

### Tap targets

Measured, not estimated. Chips, `+`/`−`, the answer buttons and the sliders are
**all at or above 44×44**. Three things are not:

| Control | Size | Screens |
| --- | --- | --- |
| Nav links | 65×**37** to 91×**37** | all 63 |
| Skip link | 110×**25** | all 63 |
| Daily "Share" | **52×21** | daily finished |

### Numbers rounded the same way everywhere

No. See section 6.

---

## 2. The two known bugs

### The scroll jump — confirmed, and the diagnosis is not quite what we thought

Scrolled each screen to the bottom, clicked a control that redraws the *same*
screen, and read `window.scrollY` back:

| Screen and control | height | before | after | jumped |
| --- | --- | --- | --- | --- |
| learn / build / `+` | 2071 | 1259 | **0** | yes |
| learn / build / chip | 1922 | 1110 | **0** | yes |
| learn / menu / Reset progress | 2335 | 1523 | **0** | yes |
| crash / build / `+` | 1988 | 1176 | **0** | yes |
| sandbox / build / `+` | 2094 | 1282 | 1282 | no |
| sandbox / build / chip | 1866 | 1054 | **438** | yes, partly |
| mine / enter / Add | 1235 | 423 | 423 | no |
| mine / enter / Remove | 1412 | 600 | 541 | no |
| daily / playing / answer | 1239 | 427 | 404 | no |

**The cause is `window.scrollTo(0, 0)` at the end of `draw()`** in
[game.js:1107](../js/game.js#L1107) and [crashReplay.js:328](../js/crashReplay.js#L328).
`draw()` is the whole-screen redraw, and it also runs on every `+` tap, every
chip tap and every Reset tap — so a line written for "a new screen starts at its
heading" fires on redraws that are not new screens. Sandbox and My real portfolio
call only `root.focus({ preventScroll: true })`, which is why they are better.

**Sandbox is not actually immune.** Its `+` button holds position exactly,
because the redraw does not change the page height. Its *chip* tap adds an
allocator row, the height changes, and the position still slips from 1054 to 438.
So the fix is two things, not one:

- drop the unconditional `scrollTo`, and scroll to the top only when the screen
  actually changes (menu → build → guess → reveal), not on every redraw;
- that alone leaves the Sandbox-style slip, so the redraw needs to preserve
  position across a height change — the honest fix is to stop replacing the whole
  view for a change that only touches one row.

**must fix before playtest**

### Focus is thrown away with the scroll, and that is worse

Every one of those redraws also leaves focus on `main#view`. A keyboard or
switch user who presses `+` is returned to the top of the content and has to Tab
all the way back to press it again; moving $2,000 to $2,500 is five round trips.
The daily puzzle drops focus to `body` entirely. Same root cause, same fix: a
redraw that is not a new screen should put focus back on the control that caused
it.

**must fix before playtest**

### The 100% issue — found, but not where we expected

I checked the build step on every level, Sandbox and Crash replay, as asked.
**The build allocator is clean everywhere.** $100 steps out of $10,000 make every
share a whole percent, so the column always sums to exactly 100%. A property test
of 400 random chip and `+`/`−` actions per level found no sequence where the
dollars fail to sum to the total or the displayed shares fail to sum to 100%.

Measured columns, all exact: level 3 (`20 20 20 20 20`), level 4 at the QQQ floor
(`30 23 23 24`), level 6 at the kind floor (`30 30 20 20`), Sandbox at 3 and 7
holdings (`34 33 33`, `15 15 14 14 14 14 14`), Crash replay (`25 25 25 25`).

**Where it is real is My real portfolio**, whose dollars are arbitrary:

| What was entered | Row shares | Total row says |
| --- | --- | --- |
| $3,333 / $3,333 / $3,334 | 33% 33% 33% = **99%** | **100%** |
| seven × $1,000 | 14% × 7 = **98%** | **100%** |
| $4,213 / $1,850 / $900 / $1,100 | 52 23 11 14 = 100% | 100% |

The total is a literal string at [myPortfolio.js:198](../js/myPortfolio.js#L198),
so it asserts 100% over a column that often does not reach it. The same thing
reaches the measures screen: three equal holdings render a "Share of money"
column of `33% 33% 33%` under a note that reads "The shares of risk add up to
100%".

**And a related one worth deciding at the same time.** A share of risk can
genuinely pass 100% and go negative on this data — `QQQ $9,000 + TLT $400 + PG
$300 + KO $300` gives QQQ **100.2%** and KO **−0.3%**. `percent()` rounds those
to "100%" and "0%", so nothing wrong is displayed today, but the note asserting
they add to 100% is written as though a share were always between 0 and 100.

Since you saw this before My real portfolio existed, **this may not be the one you
remember.** The description in your message came through as the unfilled
placeholder, so I hunted rather than looked. If none of the above matches, tell me
what you saw and I will go again — the tool makes it cheap now.

**must fix before playtest** (the total row and the note)

---

## 3. The decided changes, with what the code says about them

### Pass to unlock

Today's rule is *played*, not passed: `unlockedThrough()` opens the level after
the furthest **played**, and `levelCard()` prints "Play level N to open this one."

**What `migrate()` does with a save where a level was played but not passed:
nothing, and it needs to do nothing.** Every record already stores
`{ played: true, stars, error }` per level, so "played but not passed" is already
representable — it is `stars: 0`. No format change, no version bump, no migration
branch. `usableEntry()` keeps accepting exactly those three keys.

The behaviour change is handled by a clause already in `isUnlocked()`:

```js
return at >= 0 && (at <= open || levelProgress(progress, levelId) !== null);
```

A level with any record **stays open whatever the rule says**. So a player who
had reached level 4 by failing level 3 keeps level 4; only the *next* step
follows the new rule. Nobody loses a level they had already opened, and the
grandfathering costs no new code. Worth a test that says so, because it is the
kind of clause a later tidy-up deletes.

Other pieces: locked cards read "Pass level N to unlock this one"; `unlock`
replaces `open` everywhere (the lock note, and the `aria-label` "Level N opens
when level N−1 has been played"); a `hint` per level in `levels.json` shown after
3 failed tries, for you to edit.

**On the hints**, one caution from the data: level 2's pass condition is "make a
guess", so it cannot be failed, and level 7's is "all 3 guesses within 1", which
fails as a set rather than per portfolio. The counter has to count *attempts at a
level*, not failed reveals, or those two never show a hint and level 7 shows one
mid-series.

**Hypothesis 3 gets harder to reach, and it should be logged as a cost, not a
footnote.** PREREG.md pairs each player's level-2 error with their level-7 error
and needs 60 players with both. Today a player reaches level 7 by *playing* six
levels; after this change they must *pass* levels 1–6, including level 4's beta
under 0.50 and level 6's half-the-index fall. Every player who would have
stumbled through now stops. The 60-player minimum was not set against a
pass-gated ladder.

**Mitigation worth considering, as a suggestion rather than a change:** the hint
after 3 tries is the thing standing between this and a wall. It is doing real
statistical work now, not just being kind.

### The solvability check's warning

`scripts/check_levels.mjs` today prints `FAIL - fewer than 3` when a level has
too few winning designs. Under pass-to-unlock, **zero** winning designs is a
different kind of failure from *few*: it stops every player at that level
permanently and nobody reaches any level after it. The warning should say so in
those words, and should distinguish zero from few.

### Sliders on every build step

One per holding, $100 steps, "Money left: $X", the check button disabled until
it is $0, an "Even split" button, `+`/`−` and a typed amount for fine work. No
measure before the guess — that holds today and must keep holding.

**One consequence to decide before building it.** Today's `adjustDollars()`
compensates: raising one holding takes the step out of the largest other one, so
the total is *always* exactly $10,000 and **"Money left" would always read $0**.
A money-left readout only means something if sliders move independently and the
money can sit unassigned. That is a real change to the build model, not a
restyle, and it changes what `buildComplete()` is checking. It also means a player
can get stuck at "Money left: $100" with every slider at a floor — the "Even
split" button is the way out, so it is load-bearing rather than a convenience.

**And it makes the build screen longer, not shorter.** In the mockup, five
holdings with a label row, a slider and a `+`/`−` row come to about 650px, on top
of a picker that is already a screenful. Putting `+`/`−` on the same line as the
slider is worth trying.

### A group-risk panel for Sandbox

Logged as an idea, not built — `whyFacts()` already returns each group's share of
the risk, so it is a rendering job. Revisit after the playtest with the question
the playtest can answer: do players reading the shares table work out the group
story themselves? **later**

### The PRD

Line 117's Learn row reads "Levels 1 to 7, in order; progress saved in the
browser" and needs the pass rule. The PRD does not say which mode the site opens
on, so `DEFAULT_MODE = 'research'` is a code choice nobody wrote down.

---

## 4. Visual design: three directions

Three files, openable in a browser, each showing **the level 3 build and the
level 3 reveal** at 375px, following your system light/dark setting:

- `design/mockup-a.html` — **Notebook**
- `design/mockup-b.html` — **Number line**
- `design/mockup-c.html` — **Editorial**

Those three files in `design/` are the mockups themselves — open them in a
browser, and each follows your system light/dark setting, so there is nothing
separate to look at for the two schemes. They are committed, and
`npm run mockups` rewrites them. There are no PNG versions: an earlier draft of
this line pointed at `screenshots/mockups/`, which `scripts/make_mockups.mjs`
has never written to.

Every word and number in all three is the one on the screen today; only the
design differs, so the comparison is about the design and not about my typing.
The build step is drawn **with the sliders decided for this round**, since the
chosen look will be applied to that screen and not to the `+`/`−` one. Each file
carries its own palette, its font, its spacing and a table of **every colour pair
with its measured contrast ratio** — all three pass 4.5:1 for text and 3:1 for
control edges in both schemes, and the generator fails rather than writing a file
if any pair does not.

| | A — Notebook | B — Number line | C — Editorial |
| --- | --- | --- | --- |
| Character | Lab notebook: hairlines, no shadows | Quiet app, loud reveal | Well-set textbook on cream |
| Web font | **None** (system-ui) | One: Inter, self-hosted | One: Source Serif, numbers only |
| Accent (light) | `#1a4fb0` 7.5:1 | `#1d4ed8` 6.7:1 | `#7c2d12` 9.4:1 |
| Button fill | the accent | the accent | **ink**, so rust only ever means "missed" |
| Shape | 6px, no shadow | 12px, one shadow on the answer only | 2px rules, few boxes |
| The reveal | Guess and answer in two labelled cells with the gap named between them ("out by 1.14"); the number counts from the guess to the answer over 450ms | A scale from the level's own min to max: the guess is a hollow marker, the answer slides in and lands solid, the span between them fills | The answer alone on a full-width band, large serif, rising 8px over 300ms; the guess written small beneath |

All three keep three semantic colours apart and use them for nothing else:
accent = "this is the action and the live value", `clears` green, `misses` rust.
All animation sits inside `@media (prefers-reduced-motion: no-preference)`.

**My reading, since you will ask.** **B** does the most teaching: the gap between
the guess and the answer is drawn to scale, which is the lesson, and it is the
only one where the "3.00 needed" threshold is visible as a place rather than as a
sentence. **A** is the safest and the cheapest — no web font, nothing to
self-host, and it will still look right in three years. **C** is the most
credible to a professor and the least like a trading app, and its serif number is
the most satisfying single element of the three.

Worth knowing before you pick: the mockups show a **shortened chip list** (15
tickers, 4 groups) so the files stay readable. The real build screen has 40 chips
under 9 headings, so it is longer than it looks here in all three.

**Current state, for comparison:** the stylesheet today has **zero** transitions
and **zero** animations, and no `prefers-reduced-motion` query. There is nothing
to disable yet — the query is a thing the restyle must add, not a gap it must
close. The daily puzzle hard-codes `#2e7d4f` and `#8a8a8a` outside the palette,
and green appears nowhere else in the game.

---

## 5. Accessibility, WCAG 2.2 AA

Measured on the live page at 375px in both schemes. `lang="en"` ✓, one `h1` per
screen ✓, every control a real `<button>` ✓, no `onclick` on a `div` ✓, charts
and the share card carry `role="img"` and an `aria-label` ✓.

### Contrast — two systemic failures

**One. `--series-1` is the colour of almost everything and it fails both ways.**

| Pair | Needs | Has |
| --- | --- | --- |
| `#257de0` as text on white (light) | 4.5:1 | **4.13:1** |
| white text on `#257de0` (light) | 4.5:1 | **4.13:1** |
| white text on `#338ced` (dark) | 4.5:1 | **3.43:1** |

That one variable is every primary button label (Play, Next: your guess, Reveal
the answer, See what this portfolio does, Replay this one, Watch it play out,
Change this portfolio), every selected chip, the current nav pill, every star,
every "N clears the M needed" line, every link, and the `summary` on Research.
Dark mode is the worse of the two. **Splitting it into a text blue and a darker
fill blue fixes dozens of instances at once.** **must fix before playtest**

**Two. `.level-locked { opacity: 0.72 }` dims the first screen below AA.** The
locked cards' concept labels, lock notes and "not played" come out at
**3.16:1** at 13px — six of the seven cards on the screen a player lands on.
Dimming with `opacity` instead of a colour also hides the real value from the
palette and from any audit. **must fix before playtest**

**Three, smaller: control edges.** `rgba(11, 11, 11, 0.1)` gives **1.24:1** in
light and **1.26:1** in dark against 3:1 — on chips, quiet buttons, the `+`/`−`
steps and the text boxes. The guess slider's track is **1.05:1**. The skip link
is 3.92:1 as text and 1.05:1 at its edge. **should fix**

### Keyboard

Tabbing a build screen reaches every chip and every `+`/`−` in order with a
visible 2px ring. Two gaps:

- **The guess slider has no ring of its own** — only the browser's 1px default
  (`rgb(0, 95, 204)`), because there is no `.guess-slider:focus-visible` rule.
  It is the single most important control in the game. **should fix**
- **`.modes a` has no `:focus-visible` rule either.** **should fix**

Arrow keys on the slider work: the readout goes from "—" to "3.1" on one
ArrowRight. ✓

And see section 2: focus is thrown to `main` on every redraw, which is a keyboard
defect before it is anything else. **must fix before playtest**

### Labels, headings, announcements

- **No input has a visible `<label>`.** Five guess sliders and both My real
  portfolio boxes carry `aria-label` only. **should fix**
- **Headings skip h1 → h3** on six screens: level 2's "Your starter portfolio",
  level 7's "Mystery portfolio 1 of 3" and "Your three guesses", Sandbox's "AI
  stocks", the weekly's "Why?", and My real portfolio's "Where the money is".
  **should fix**
- **Nothing on any reveal is announced.** `role="status"` exists on the chart
  readout and on My real portfolio's field problems, and nowhere else. Pressing
  "Reveal the answer" replaces the screen and says nothing to a screen reader.
  **must fix before playtest**
- **Error screens are not announced either**, and they are written for a
  developer: "data/game.json returned 404. Serve the page from the project root
  with "python3 -m http.server 8000"". At a playtest, on a phone, that is what a
  student will read. Needs a player's sentence, a retry, and `role="alert"`.
  **must fix before playtest**

### Text at 200%

`body { font-size: 16px }` is a fixed pixel size. Doubling the browser's base
font takes `h1` from 27.2px to 54.4px and leaves **body text at 16px** — the page
honours the reader's preference for headings and ignores it for the text they
actually read. `body { font-size: 1rem }`. **should fix**

### Colour is never the only signal

Holds. Pass and fail say "clears" and "misses" in words; stars are counted in
words; the daily says "right"/"wrong" beside the swatch; the crash chart names
both lines in a text legend. One weakness: the daily's "wrong" swatch is a pale
grey that reads as *empty* rather than as wrong. **should fix**

---

## 6. Formatting: one style, defined in one place

Nothing here is defined in one place today. What is actually on screen:

**Dates — four styles, two of them on the same screen.**

| Style | Example | Where |
| --- | --- | --- |
| ISO | `2023-11-21 to 2026-11-25` | every reveal, every measures panel |
| Long | `25 November 2026` | every footer, the daily, the weekly |
| Month-day | `Feb 19`, `Mar 6` | chart axes |
| `25 Nov 2026` (the one you want) | — | nowhere |

The level 3 reveal carries ISO and long simultaneously. **must fix before
playtest** — it is the most visible inconsistency in the game.

**Minus signs.** A hyphen is used for negative numbers (`-15` in the measures
difference column). The true minus `−` appears only as the `−` button's label.
**should fix**

**Correlations.** The rule is 2 places, 3 on level 1. Level 1 shows `0.996` ✓.
**Sandbox shows 3 places** (`0.583`, `0.526`) where it should show 2; the daily
shows 2 ✓. **should fix**

**One measure, three precisions, four lines apart.** The level 3 reveal:

```
2.06            the answer, 2 places
You guessed 3.2 the guess, 1 place
2.06 misses the 3.00 needed   the threshold, 2 places
```

**should fix**

**Money.** `$1,480` style holds everywhere — `$10,000`, `$2,000`, `$1,881 to
$1,966`, `$4,213` ✓. The chart axis abbreviates to `$11K`, which is reasonable on
an axis but is a fourth money format and should be a decision rather than an
accident. **later**

**Percentages.** Whole numbers everywhere except where a decimal decides a pass
(`35.49%`), which is the rule working as intended ✓.

**Line length.** Body copy wraps at roughly 45–55 characters at 375px, inside the
65 asked for ✓.

**The fix is one module.** `money()` lives in `js/build.js`, `percent()` and
`signedPercent()` in `js/why.js`, `formatMeasure()` and `formatGuess()` in
`js/levels.js`, and `longDate()` in two view files, with
`Math.round(x * 100) + '%'` written out by hand in four more places. One
`js/format.js` that owns money, percentages, measures, dates and the minus sign,
with the others re-exporting from it, is the change that makes "the same
everywhere" checkable by a test instead of by eye.

---

## 7. The order for the fixes session

As you set it, with what belongs in each step.

1. **Bugs** — the nav overflow; `scrollTo` and the focus throw; the 100% total
   row and the risk-share note; the landing mode and the shared link.
2. **Pass to unlock and sliders** — including the `check_levels.mjs` warning, the
   hint-after-3-tries counter, the PRD's line 117, and the Hypothesis 3 note in
   `BUILD_LOG.md`.
3. **The chosen look** — applied through shared CSS variables, with the daily's
   two hard-coded hexes folded in and a `prefers-reduced-motion` query added.
4. **Accessibility and formatting** — the two contrast failures, the slider and
   nav focus rings, visible labels, heading order, `aria-live` on reveals,
   player-facing errors, `body { font-size: 1rem }`, and `js/format.js`.
5. **A Lighthouse accessibility audit of every screen.**

A note on step 5: Lighthouse scores one URL, and this is a hash-routed app, so it
will audit whatever mode the hash names — seven runs, not one. `scripts/dev_a11y.mjs`
already measures the things Lighthouse cannot reach by itself, so the two are
worth running together rather than one instead of the other.

Educational, not investment advice.
