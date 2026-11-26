# Threshold sweep for the L2 gate on the dev slice ONLY (experimenter tool, not part of the candidate).
# Dev slice: cells chat@-5 and read@-5, English and Korean (4 cells x 12 = 48 trials). These four cells are never
# reported for any candidate. This file reads bench/refs.json for those trials (customer speech spans, bystander
# times) to count speech time kept and leaked; the candidate itself (run.py) never reads refs.
#
#   ~/kibo-data/speaker-gate/venv/bin/python -I spikes/speaker-gate/candidates/l2/tune.py [--input-from l0-gtcrn]
#
# Grid: threshold 0.10..0.70 x smoothing 1/3/5 hops x look-back 1/2/3 s.
# Objective: maximise (customer speech time inside segments) - (bystander-only time inside segments), pooled.

import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
import common  # noqa: E402
import run as l2  # noqa: E402

DEV_CELLS = ["words/en/chat@-5", "words/en/read@-5", "words/ko/chat@-5", "words/ko/read@-5"]


def ov(a, b):
    return sum(max(0, min(e1, e2) - max(s1, s2)) for s1, e1 in a for s2, e2 in b)


def minus(intervals, cut):
    out = []
    for s, e in intervals:
        parts = [[s, e]]
        for cs, ce in cut:
            nxt = []
            for ps, pe in parts:
                if ce <= ps or cs >= pe:
                    nxt.append([ps, pe])
                    continue
                if cs > ps:
                    nxt.append([ps, cs])
                if ce < pe:
                    nxt.append([ce, pe])
            parts = nxt
        out += parts
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input-from", default=None)
    args = ap.parse_args()
    name, _ = l2.names(args.input_from)
    refs = json.load(open(os.path.join(common.BENCH, "refs.json")))
    ids = [t for c in DEV_CELLS for t in refs["cells"][c]]
    sweep = []
    grid = [(round(0.10 + 0.025 * i, 3), k, lb) for i in range(25) for k in (1, 3, 5) for lb in (1.0, 2.0, 3.0)]
    for th, sm, lb in grid:
        tot = {"kept": 0, "cust": 0, "leak": 0, "byst": 0}
        by_lang = {}
        for t in ids:
            r = refs["trials"][t]
            d = json.load(open(os.path.join(l2.work_dir(name), f"{t}.json")))
            segs = l2.segments(d, th, sm, lb)
            cust = r["customer"]["speechSpans"] if r["customer"] else []
            byst = minus([[b["startMs"], b["endMs"]] for b in r["bystanders"]], cust)
            row = {"kept": ov(cust, segs), "cust": ov(cust, cust), "leak": ov(byst, segs), "byst": ov(byst, byst)}
            for key in tot:
                tot[key] += row[key]
            lang = by_lang.setdefault(r["lang"], {"kept": 0, "cust": 0, "leak": 0, "byst": 0})
            for key in lang:
                lang[key] += row[key]
        frac = lambda d: {"kept": round(d["kept"] / d["cust"], 3), "leaked": round(d["leak"] / d["byst"], 3)}
        sweep.append({"threshold": th, "smooth": sm, "lookback_s": lb, **frac(tot), "by_lang": {k: frac(v) for k, v in by_lang.items()}})
    best = max(sweep, key=lambda s: s["kept"] - s["leaked"])
    for s in sorted(sweep, key=lambda s: s["kept"] - s["leaked"])[-12:]:
        print(s["threshold"], s["smooth"], s["lookback_s"], "kept", s["kept"], "leaked", s["leaked"], s["by_lang"])
    print("chosen", best)
    d = os.path.join(common.HERE, name, "logs")
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, f"tune-{time.strftime('%Y%m%dT%H%M%S')}.json")
    json.dump({"candidate": name, "dev_cells": DEV_CELLS, "trials": len(ids), "objective": "kept - leaked (speech time, pooled)", "chosen": best, "sweep": sweep}, open(p, "w"), indent=1)
    print("log", p)


if __name__ == "__main__":
    main()
