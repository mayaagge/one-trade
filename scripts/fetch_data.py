"""Download 10 years of daily adjusted closes and save them as one JSON snapshot.

Usage:
    .venv/bin/python scripts/fetch_data.py                      # full list
    .venv/bin/python scripts/fetch_data.py --tickers NVDA,PLTR --out data/test_two.json

Rules (see PREREG_AMENDMENT.md and PREREG_AMENDMENT_2.md):
  * Refuses to run unless the prereg-v3 tag is on GitHub.
  * Window: first trading day on or after 24 Nov 2016, to 24 Nov 2026.
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
    raw = yf.download(symbols, start=WINDOW_START, end=end_exclusive, interval="1d",
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
            closes[s] = col

    # 4. Report history and gaps.
    print(f"Window: first trading day on or after {WINDOW_START} to {FREEZE_DATE}")
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
        "window_start_requested": WINDOW_START,
        "freeze_date": FREEZE_DATE,
        "prices": {s: {"dates": [d.strftime("%Y-%m-%d") for d in c.index],
                       "close": [round(float(v), 6) for v in c.values]}
                   for s, c in closes.items()},
    }
    out = ROOT / args.out
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snapshot))
    print(f"\nWrote {out.relative_to(ROOT)} ({len(closes)} tickers)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
