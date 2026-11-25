"""Download 10 years of daily adjusted closes and save them as one JSON snapshot.

Usage:
    .venv/bin/python scripts/fetch_data.py                      # full list
    .venv/bin/python scripts/fetch_data.py --tickers NVDA,PLTR --out data/test_two.json

Rules (see PREREG_AMENDMENT.md and PREREG_AMENDMENT_2.md):
  * Refuses to run unless the prereg-v3 tag is on GitHub.
  * Registered window: first trading day on or after 24 Nov 2016, to 24 Nov 2026.
  * Downloads from a few days earlier as lead-in, so the window's first day has a
    close before it to compute a return from. The window itself is unchanged and is
    applied by js/returns.js.
  * If any ticker fails or is empty, nothing is written and the exit code is 1.
"""
import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TAG = "prereg-v3"
WINDOW_START = "2016-11-24"
FREEZE_DATE = "2026-11-24"

# A few days of lead-in BEFORE the registered window, and why it is needed.
#
# The registered window starts at the first trading day on or after 24 November
# 2016 (PREREG_AMENDMENT.md section 2). A daily return on that first day is the
# change from the close BEFORE it, so without a close from the previous trading
# day the window silently loses its own first day: the earliest 12 months came
# out with 250 returns over 251 trading days.
#
# So the download reaches back to FETCH_START and the registered window is
# applied later, by js/returns.js, from dates. The extra rows are lead-in only:
# they supply the first in-window return's starting price and are never a return
# of their own. Nothing about the registered window moves - this is the same
# calendar fact as the window beginning after Thanksgiving.
FETCH_START = "2016-11-14"

# Rows before this date are the pre-merger SPAC shell, not the operating
# company, so they are trimmed before analysis (see BUILD_LOG.md).
TICKER_TRIM_START = {
    "VRT": "2020-02-10",  # Vertiv's first trading day under VRT, after the
                           # GS Acquisition Holdings merger closed 2020-02-07.
}


def prereg_commit():
    """Return the commit hash the prereg-v3 tag points to, or None if not on GitHub."""
    out = subprocess.run(
        ["git", "ls-remote", "--tags", "origin", f"refs/tags/{TAG}", f"refs/tags/{TAG}^{{}}"],
        cwd=ROOT, capture_output=True, text=True,
    )
    if out.returncode != 0:
        return None
    refs = {}
    for line in out.stdout.splitlines():
        sha, ref = line.split()
        refs[ref] = sha
    # An annotated tag lists the commit on the "^{}" line; a plain tag on the first.
    return refs.get(f"refs/tags/{TAG}^{{}}") or refs.get(f"refs/tags/{TAG}")


def load_tickers():
    """Return (all symbols in order, set of symbols expected to have full history)."""
    spec = json.loads((ROOT / "tickers.json").read_text())
    basket = {b["ticker"]: b["full_history"]
              for b in json.loads((ROOT / "basket.json").read_text())["stocks"]}
    symbols, full = [], set()
    for group in spec["groups"]:
        for t in group["tickers"]:
            if isinstance(t, str):  # the AI group lists plain symbols; basket.json has the flag
                symbol, flag = t, basket[t]  # KeyError if the two files disagree
            else:
                symbol, flag = t["ticker"], t["full_history"]
            symbols.append(symbol)
            if flag:
                full.add(symbol)
    for b in spec["benchmarks"]:
        symbols.append(b["ticker"])
        if b["full_history"]:
            full.add(b["ticker"])
    return symbols, full


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", help="comma-separated list (for trials); default is every ticker")
    ap.add_argument("--out", default="data/prices.json")
    args = ap.parse_args()

    # 1. Gate: no prices before the amendment is public.
    commit = prereg_commit()
    if not commit:
        print(f"REFUSED: tag {TAG} was not found on GitHub. No prices fetched.", file=sys.stderr)
        return 1

    import pandas as pd
    import yfinance as yf

    all_symbols, full_history = load_tickers()
    symbols = args.tickers.split(",") if args.tickers else all_symbols

    # 2. Download. yfinance's end date is exclusive, so ask for the day after the freeze date.
    end_exclusive = (pd.Timestamp(FREEZE_DATE) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    raw = yf.download(symbols, start=FETCH_START, end=end_exclusive, interval="1d",
                      auto_adjust=True, progress=False, group_by="column", threads=True)

    # 3. Collect one series per ticker; list every failure.
    closes, failed = {}, []
    for s in symbols:
        try:
            col = raw["Close"][s] if len(symbols) > 1 else raw["Close"].squeeze()
            col = col.loc[:FREEZE_DATE].dropna()
        except Exception:
            col = None
        if col is None or len(col) == 0:
            failed.append(s)
        else:
            if s in TICKER_TRIM_START:
                col = col.loc[TICKER_TRIM_START[s]:]
            closes[s] = col

    # 4. Report history and gaps.
    print(f"Registered window: first trading day on or after {WINDOW_START} to {FREEZE_DATE}")
    print(f"Downloaded from {FETCH_START}, a few days earlier, so the window's first day has\n"
          f"a close before it to compute a return from. js/returns.js applies the window.")
    print(f"{'ticker':8} {'rows':>5}  {'first date':10}  {'last date':10}  notes")
    ref_dates = None
    if "^GSPC" in closes:
        ref_dates = set(closes["^GSPC"].index)
    elif closes:
        ref_dates = set().union(*[set(c.index) for c in closes.values()])
    longest = max((len(c) for c in closes.values()), default=0)
    unexpected = []
    for s, c in closes.items():
        notes = []
        first = c.index[0].strftime("%Y-%m-%d")
        last = c.index[-1].strftime("%Y-%m-%d")
        if last != FREEZE_DATE:
            notes.append(f"ends before {FREEZE_DATE}")
        if len(c) < longest:
            notes.append(f"{longest - len(c)} fewer rows than the longest series")
        if ref_dates is not None:
            window = [d for d in ref_dates if d >= c.index[0]]
            missing = sorted(d for d in window if d not in set(c.index))
            if missing:
                notes.append(f"missing {len(missing)} days vs reference, e.g. {missing[0].date()}")
        if notes and s in full_history:
            notes.append("UNEXPECTED: tickers.json says full history")
            unexpected.append(s)
        elif notes:
            notes.append("expected (full_history is false)")
        print(f"{s:8} {len(c):>5}  {first:10}  {last:10}  {'; '.join(notes) or 'ok'}")

    if failed:
        print(f"\nERROR: failed or empty: {', '.join(failed)}. No snapshot written.", file=sys.stderr)
        return 1
    if unexpected:
        print(f"\nNote: unexpected gaps in {', '.join(unexpected)} (snapshot still written).")

    # 5. Write the snapshot.
    snapshot = {
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "prereg_v3_commit": commit,
        "yfinance_version": yf.__version__,
        "fetch_start": FETCH_START,
        "fetch_start_reason": (
            "Lead-in only. A return on the window's first trading day needs the close from "
            "the trading day before it, which sits outside the registered window. The "
            "registered window is unchanged and is applied by js/returns.js."
        ),
        "window_start_requested": WINDOW_START,
        "freeze_date": FREEZE_DATE,
        "trimmed": {s: {"start": start,
                         "reason": "pre-merger SPAC shell, not the operating company"}
                    for s, start in TICKER_TRIM_START.items() if s in closes},
        "prices": {s: {"dates": [d.strftime("%Y-%m-%d") for d in c.index],
                       "close": [round(float(v), 6) for v in c.values]}
                   for s, c in closes.items()},
    }
    out = ROOT / args.out
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snapshot))
    # A trial run may write outside the repo (a scratch file), where relative_to raises.
    shown = out.relative_to(ROOT) if out.is_relative_to(ROOT) else out
    print(f"\nWrote {shown} ({len(closes)} tickers)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
