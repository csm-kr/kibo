# L2: voice gate (route B in ../../candidates.md). CAM++ zh/en (sherpa-onnx) scores 1.0 s windows every 0.25 s
# against the enrolment; Silero VAD says where speech is. Output: segments where the customer is judged present.
#
#   score: embeddings for every trial, cached in candidates/l2/work/<name>/<trial>.json (no threshold yet)
#   gate:  segments from the cache at a fixed threshold -> bench/out/<name>/<trial>/meta.json (no out.wav)
#
#   ~/kibo-data/speaker-gate/venv/bin/python -I spikes/speaker-gate/candidates/l2/run.py score [--input-from l0-gtcrn]
#   ~/kibo-data/speaker-gate/venv/bin/python -I spikes/speaker-gate/candidates/l2/run.py gate --threshold 0.45 [--input-from l0-gtcrn]
#
# Causal by construction: the window scored at time t is [t - 1.0 s, t], so a decision at t uses no audio after t.
# When a window matches, the gate opens back to the later of the speech onset and the window's start (at most 1.0 s
# back: the app holds those frames in heldBack.ts and sends them at four times real time), and it closes 0.7 s after
# the last matching window. latency_ms is the compute per window.

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

import numpy as np  # noqa: E402

WIN_S, HOP_S = 1.0, 0.25
MIN_SPEECH_IN_WIN_S = 0.3  # a window with less speech than this is not scored
PREROLL_S, HANG_S = 0.2, 0.7
# Fixed by tune.py on the dev slice (see ../README.md); the gate step reads them from the command line.
SMOOTH, LOOKBACK_S = 3, 2.0
MODEL = "campplus-zh-en-advanced/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx"


def names(input_from):
    return ("l2-campp", None) if not input_from else (f"l2-campp-after-{input_from.removeprefix('l0-')}", input_from)


def work_dir(name):
    return os.path.join(common.HERE, "l2", "work", name)


def overlap(a0, a1, segs):
    return sum(max(0.0, min(a1, b) - max(a0, a)) for a, b in segs)


def score(args):
    import sherpa_onnx

    name, src = names(args.input_from)
    ext = sherpa_onnx.SpeakerEmbeddingExtractor(
        sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=os.path.join(common.MODELS, MODEL), num_threads=1)
    )

    def embed(x):
        s = ext.create_stream()
        s.accept_waveform(sample_rate=common.RATE, waveform=x)
        s.input_finished()
        v = np.asarray(ext.compute(s))
        return v / (np.linalg.norm(v) + 1e-12)

    _, ids = common.trials(args.trials)
    os.makedirs(work_dir(name), exist_ok=True)
    rows, per_window = [], []
    for i, t in enumerate(ids):
        x = common.input_audio(t, src)
        length = len(x) / common.RATE
        t0 = time.perf_counter()
        e = embed(common.read(common.enrol_path(t)))
        speech = common.vad_segments(x)
        hops = []
        end = WIN_S
        while end <= length + 1e-9:
            a = end - WIN_S
            sc = None
            if overlap(a, end, speech) >= MIN_SPEECH_IN_WIN_S:
                w0 = time.perf_counter()
                sc = float(e @ embed(x[int(a * common.RATE) : int(end * common.RATE)]))
                per_window.append(time.perf_counter() - w0)
            hops.append([round(end, 3), sc])
            end += HOP_S
        rows.append((length, time.perf_counter() - t0))
        json.dump({"length_s": length, "speech": speech, "hops": hops}, open(os.path.join(work_dir(name), f"{t}.json"), "w"))
        if i % 200 == 0:
            print(f"{name} score: {i}/{len(ids)}", flush=True)
    common.speed_log(
        name,
        rows,
        {"model": MODEL, "vad": "silero_vad.onnx", "window_s": WIN_S, "hop_s": HOP_S,
         "ms_per_window_median": round(1000 * float(np.median(per_window)), 1) if per_window else None,
         "windows": len(per_window)},
    )


def segments(d, threshold, smooth=SMOOTH, lookback_s=LOOKBACK_S):
    """Causal gate from one trial's cached scores.

    Smoothing: a hop matches when the mean of the scored hops among the last `smooth` hops reaches the threshold.
    Opening: back to the onset of the speech run that is under way at the window's start (or the first onset inside
    the window), but never more than `lookback_s` before the decision. A 1 s window often holds the end of one phrase
    and the start of the next, so "latest onset in the window" would drop the whole first phrase."""
    segs = []
    hops = d["hops"]
    for i, (end, sc) in enumerate(hops):
        if sc is None:
            continue
        recent = [h[1] for h in hops[max(0, i - smooth + 1) : i + 1] if h[1] is not None]
        if sum(recent) / len(recent) < threshold:
            continue
        a = end - WIN_S
        under_way = [s for s, e in d["speech"] if s <= a <= e]
        inside = [s for s, e in d["speech"] if a < s <= end]
        onset = under_way[0] if under_way else (min(inside) if inside else a)
        segs.append([max(onset, end - lookback_s) - PREROLL_S, end + HANG_S])
    return common.merge(segs, d["length_s"])


def gate(args):
    name, src = names(args.input_from)
    sha, ids = common.trials(args.trials)
    speed = sorted(f for f in os.listdir(os.path.join(common.HERE, name, "logs")) if f.startswith("speed-"))[-1]
    per_window_ms = json.load(open(os.path.join(common.HERE, name, "logs", speed)))["ms_per_window_median"]
    common.start(name, sha)
    for t in ids:
        d = json.load(open(os.path.join(work_dir(name), f"{t}.json")))
        segs = segments(d, args.threshold, args.smooth, args.lookback)
        meta = {"latency_ms": int(np.ceil(per_window_ms)), "segments": segs,
                "gate": {"threshold": args.threshold, "smooth": args.smooth, "lookback_s": args.lookback}}
        if src:
            meta["input_from"] = src
        common.write(name, t, meta)
    print(f"{name}: wrote {len(ids)} trials at threshold {args.threshold}, latency_ms {int(np.ceil(per_window_ms))}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["score", "gate"])
    ap.add_argument("--input-from", default=None)
    ap.add_argument("--trials", default="words")
    ap.add_argument("--threshold", type=float)
    ap.add_argument("--smooth", type=int, default=SMOOTH)
    ap.add_argument("--lookback", type=float, default=LOOKBACK_S)
    args = ap.parse_args()
    if args.step == "score":
        score(args)
    else:
        assert args.threshold is not None, "--threshold is required for gate"
        gate(args)


if __name__ == "__main__":
    main()
