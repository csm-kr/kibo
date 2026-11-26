# The report table: key word-layer cells per language, from the newest bench/logs/words-<candidate>-*.json of each
# candidate (logs only; no refs). Each cell is "kept% / leaked%" (customer words kept, bystander words leaked).
#   python3 -I spikes/speaker-gate/candidates/table.py open hold-oracle customer-oracle l0-gtcrn ...
#   python3 -I spikes/speaker-gate/candidates/table.py --cells silent+order@0,order@0 l2-campp ...   (other cells; each
#   cell then also shows in how many trials the bystander leaked: "k/n" trials at or above the judge's leakAt)

import json
import os
import sys

LOGS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bench", "logs")
CELLS = ["alone", "chat@-10", "chat@0", "order@-10", "order@0", "babble@0", "music@0", "song@0"]


def newest(cand):
    """The newest full run (all word trials), skipping runs over a --trials slice."""
    names = sorted(f for f in os.listdir(LOGS) if f.startswith(f"words-{cand}-2") and f.endswith(".json"))
    for f in reversed(names):
        if len(json.load(open(os.path.join(LOGS, f)))["rows"]) == 960:
            return f
    return None


def main():
    global CELLS
    cands = sys.argv[1:]
    custom = cands[:1] == ["--cells"]
    if custom:
        CELLS, cands = cands[1].split(","), cands[2:]
    logs = {c: newest(c) for c in cands}
    data = {c: {x["cell"]: x for x in json.load(open(os.path.join(LOGS, f)))["cells"]} for c, f in logs.items() if f}
    for lang in ["en", "ko"]:
        print(f"\n{lang}: kept% / leaked% (n = 12 per cell unless shown)")
        print("| candidate | " + " | ".join(CELLS) + " |")
        print("|---|" + "---|" * len(CELLS))
        for c in cands:
            if c not in data:
                print(f"| {c} | " + " | ".join(["not measured"] * len(CELLS)) + " |")
                continue
            row = []
            for cell in CELLS:
                x = data[c].get(f"{lang}/{cell}")
                if not x:
                    row.append("-")
                    continue
                s = f"{'-' if x['keptPct'] is None else x['keptPct']} / {'-' if x['leakedPct'] is None else x['leakedPct']}"
                if custom and x["trialsLeaking"]["n"]:
                    s += f" ({x['trialsLeaking']['k']}/{x['trialsLeaking']['n']})"
                row.append(s if x["n"] == 12 else f"{s} (n={x['n']})")
            print(f"| {c} | " + " | ".join(row) + " |")
    if custom:
        print("\nlogs:")
        for c, f in logs.items():
            print(f"  {c}: {f or 'none'}")
        return
    # By bystander content: each family pooled over its levels (-15..+5 dB; yes has 5 levels, song 3), without the L2
    # dev cells chat@-5 and read@-5 for every row. "silent+" = the customer says nothing, a bystander talks at 0 dB.
    fams = ["chat", "order", "read", "yes", "song"]
    for lang in ["en", "ko"]:
        print(f"\n{lang} by bystander content: kept% / leaked% pooled over levels (n trials); then bystander-only leaked%")
        print("| candidate | " + " | ".join(fams) + " | silent+chat | silent+order | silent+read |")
        print("|---|" + "---|" * (len(fams) + 3))
        for c in cands:
            if c not in logs or not logs[c]:
                continue
            rows = [r for r in json.load(open(os.path.join(LOGS, logs[c])))["rows"] if r["lang"] == lang]
            out = []
            for f in fams:
                rs = [r for r in rows if r["cell"].split("@")[0] == f and r["cell"] not in ("chat@-5", "read@-5")]
                kt, ct = sum(r["kept"] for r in rs), sum(r["customerTotal"] for r in rs)
                lk, bt = sum(r["leaked"] for r in rs), sum(r["bystanderTotal"] for r in rs)
                out.append(f"{round(100 * kt / ct) if ct else '-'} / {round(100 * lk / bt) if bt else '-'} ({len(rs)})")
            for f in ["silent+chat@0", "silent+order@0", "silent+read@0"]:
                rs = [r for r in rows if r["cell"] == f]
                lk, bt = sum(r["leaked"] for r in rs), sum(r["bystanderTotal"] for r in rs)
                out.append(f"{round(100 * lk / bt) if bt else '-'} ({len(rs)})")
            print(f"| {c} | " + " | ".join(out) + " |")
    print("\nlogs:")
    for c, f in logs.items():
        print(f"  {c}: {f or 'none'}")


if __name__ == "__main__":
    main()
