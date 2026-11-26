# Experimenter check, not part of the candidate (it reads bench/refs/ and refs.json): does VoxLock pass a lone
# non-target voice? Each mix is split into its customer track (refs customer.wav placed at its startMs) and its
# bystander track (mix minus customer); each track and the mix go through VoxLock with the trial's enrol.wav.
# Prints output/input rms per 0.5 s block, and for the mix least-squares fits out ~ a*customer + b*bystander over the
# bystander-only region and the overlap region. Output of 11-26: logs/check-lone-bystander-20261126.txt.
#
#   PY=~/kibo-data/speaker-gate/venv/bin/python
#   $PY -I spikes/speaker-gate/candidates/c-voxlock/check_lone_bystander.py sherpa   # sherpa-onnx, models in voxlock-v2/
#   $PY -I spikes/speaker-gate/candidates/c-voxlock/check_lone_bystander.py pip      # the author's voxlock package
#                                                                                    # (downloads its own HF copy)

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

TRIALS = ["w0068", "w0737", "w0281", "w0734"]


def isolator(impl):
    if impl == "pip":
        import voxlock

        vl = voxlock.VoxLock(threads=1)
        return lambda x, trial: vl.isolate(x, sample=common.read(common.enrol_path(trial)))
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import run

    def f(x, trial):
        o = np.asarray(run.denoiser(common.enrol_path(trial))(x, common.RATE).samples, dtype=np.float32)
        return np.pad(o, (0, len(x) - len(o)))

    return f


def main():
    iso = isolator(sys.argv[1])
    refs = json.load(open(os.path.join(common.BENCH, "refs.json")))["trials"]
    for trial in TRIALS:
        r = refs[trial]
        mix = common.input_audio(trial)
        c0, _ = sf.read(os.path.join(common.BENCH, "refs", trial, "customer.wav"), dtype="float32")
        cust = np.zeros_like(mix)
        st = r["customer"]["startMs"] * 16
        cust[st : st + len(c0)] = c0[: len(mix) - st]
        by = mix - cust
        for label, x in [("bystander alone", by), ("customer alone", cust), ("mix", mix)]:
            o = iso(x, trial)
            g = [round(float(np.sqrt((o[a : a + 8000] ** 2).mean() / ((x[a : a + 8000] ** 2).mean() + 1e-12))), 2)
                 if (x[a : a + 8000] ** 2).mean() > 1e-6 else None for a in range(0, len(x) - 7999, 8000)]
            line = f"{trial} {r['customer']['who']} enrol vs {r['bystanders'][0]['who']} | {label:15s} out/in rms per 0.5 s: {g}"
            if label == "mix":
                parts = []
                regions = {"byst only": (r["bystanders"][0]["startMs"], r["customer"]["startMs"]),
                           "overlap": (r["customer"]["startMs"], min(r["bystanders"][-1]["endMs"], r["customer"]["endMs"]))}
                for name, (a, b) in regions.items():
                    sl = slice(a * 16, b * 16)
                    coef, *_ = np.linalg.lstsq(np.stack([cust[sl], by[sl]], 1), o[sl], rcond=None)
                    parts.append(f"{name}: cust {coef[0]:+.2f} byst {coef[1]:+.2f}")
                line += " | " + " | ".join(parts)
            print(line, flush=True)


if __name__ == "__main__":
    main()
