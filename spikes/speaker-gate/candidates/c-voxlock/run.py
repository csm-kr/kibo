# C: target-speaker extraction with VoxLock (route C in ../../candidates.md), through sherpa-onnx 2.0.3.
# The enrolment is given explicitly (voice_sample = the trial's enrol.wav): VoxLock's own online mode enrols whoever
# speaks first for 3 s, and the bench plays bystanders before the customer.
#
#   extract: bench/out/c-voxlock/<trial>/{meta.json,out.wav}           (out.wav = the extracted customer)
#   vad:     bench/out/c-voxlock-vad/<trial>/meta.json, input_from c-voxlock, segments from Silero VAD on its out.wav
#
#   PY=~/kibo-data/speaker-gate/venv/bin/python; R=spikes/speaker-gate/candidates/c-voxlock/run.py
#   $PY -I $R extract [--trials words] [--shard 0/3]     # shards run as separate one-thread processes
#   $PY -I $R speed --n 20 && $PY -I $R relabel          # speed alone on a quiet machine, then fix latency_ms
#   $PY -I $R vad
#
# The bench's enrol.wav is synthetic or public read speech, so passing it as a file is fine here; in the app the
# sample must stay in memory (docs/SECURITY.md), which sherpa-onnx's file-path option does not allow.
# The offline denoiser runs the same causal chunk model over the file; its output is time-aligned with the mix (lag 0,
# checked 11-26). latency_ms = 24 ms algorithmic + a 40 ms chunk + the compute for one 40 ms chunk at the measured rate
# (the `speed` step: online denoiser, 40 ms chunks, one thread).

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

import numpy as np  # noqa: E402

ENROLL = "voxlock-v2/voxlock_enroll.onnx"
CHUNK = "voxlock-v2/voxlock_chunk_int8.onnx"
ALGO_MS, CHUNK_MS = 24, 40
PREROLL_S, HANG_S = 0.2, 0.7


def denoiser(sample, online=False):
    import sherpa_onnx

    vc = sherpa_onnx.OfflineSpeechDenoiserVoxLockModelConfig(
        enroll_model=os.path.join(common.MODELS, ENROLL), chunk_model=os.path.join(common.MODELS, CHUNK), voice_sample=sample
    )
    mc = sherpa_onnx.OfflineSpeechDenoiserModelConfig(voxlock=vc, num_threads=1)
    if online:
        return sherpa_onnx.OnlineSpeechDenoiser(sherpa_onnx.OnlineSpeechDenoiserConfig(model=mc))
    return sherpa_onnx.OfflineSpeechDenoiser(sherpa_onnx.OfflineSpeechDenoiserConfig(model=mc))


def declared_latency():
    """24 ms algorithmic + one 40 ms chunk + the compute for that chunk, from the latest speed log (1.0 x real time
    until one exists)."""
    d = os.path.join(common.HERE, "c-voxlock", "logs")
    logs = sorted(f for f in os.listdir(d) if f.startswith("speed-")) if os.path.isdir(d) else []
    rtf = json.load(open(os.path.join(d, logs[-1])))["rtf"] if logs else 1.0
    return int(np.ceil(ALGO_MS + CHUNK_MS + CHUNK_MS * rtf))


def extract(args):
    name = "c-voxlock"
    sha, ids = common.trials(args.trials)
    i, n = (int(v) for v in args.shard.split("/"))
    ids = ids[i::n]
    common.start(name, sha)
    latency = declared_latency()
    for k, t in enumerate(ids):
        if os.path.exists(os.path.join(common.BENCH, "out", name, t, "out.wav")):
            continue  # resume after a stop (disk rule)
        x = common.input_audio(t)
        o = denoiser(common.enrol_path(t))(x, common.RATE)
        y = np.asarray(o.samples, dtype=np.float32)
        assert o.sample_rate == common.RATE and len(y) <= len(x), (t, o.sample_rate, len(y), len(x))
        common.write(name, t, {"latency_ms": latency, "enrol": "enrol.wav (explicit)"}, out=y)
        if k % 50 == 0:
            print(f"{name} shard {i}/{n}: {k}/{len(ids)}", flush=True)
    print(f"{name} shard {i}/{n}: done {len(ids)}, latency_ms {latency}")


def speed(args):
    """Compute per second of audio through the online denoiser, 40 ms chunks, one thread, on the first `--n` word
    trials of the manifest (fixed list). Run it alone on a quiet machine; then re-run `relabel`."""
    _, ids = common.trials("words")
    ids = ids[: args.n]
    rows, per_chunk = [], []
    step = CHUNK_MS * common.RATE // 1000
    for t in ids:
        x = common.input_audio(t)
        d = denoiser(common.enrol_path(t), online=True)
        t0 = time.perf_counter()
        for a in range(0, len(x), step):
            c0 = time.perf_counter()
            d.run(x[a : a + step], common.RATE)
            per_chunk.append(time.perf_counter() - c0)
        d.flush()
        rows.append((len(x) / common.RATE, time.perf_counter() - t0))
    rtf = sum(c for _, c in rows) / sum(a for a, _ in rows)
    common.speed_log(
        "c-voxlock", rows,
        {"models": [ENROLL, CHUNK], "mode": "OnlineSpeechDenoiser, 40 ms chunks", "rtf": round(rtf, 3),
         "chunk_ms_median": round(1000 * float(np.median(per_chunk)), 2), "chunk_ms_p95": round(1000 * float(np.percentile(per_chunk, 95)), 2),
         "latency_ms_declared": int(np.ceil(ALGO_MS + CHUNK_MS + CHUNK_MS * rtf)), "load_avg_at_end": os.getloadavg()[0]},
    )


def relabel(args):
    sha, ids = common.trials(args.trials)
    latency = declared_latency()
    for t in ids:
        p = os.path.join(common.BENCH, "out", "c-voxlock", t, "meta.json")
        m = json.load(open(p))
        m["latency_ms"] = latency
        json.dump(m, open(p, "w"))
    print(f"c-voxlock: latency_ms {latency} on {len(ids)} trials")


def vad(args):
    name, src = "c-voxlock-vad", "c-voxlock"
    sha, ids = common.trials(args.trials)
    common.start(name, sha)
    rows = []
    for t in ids:
        x = common.input_audio(t, src)
        t0 = time.perf_counter()
        speech = common.vad_segments(x)
        rows.append((len(x) / common.RATE, time.perf_counter() - t0))
        segs = common.merge([[a - PREROLL_S, b + HANG_S] for a, b in speech], len(x) / common.RATE)
        # Silero decides on 32 ms windows; its compute here is well under 1 ms per window.
        common.write(name, t, {"latency_ms": 33, "segments": segs, "input_from": src})
    common.speed_log(name, rows, {"model": "silero_vad.onnx", "on": "c-voxlock out.wav", "preroll_s": PREROLL_S, "hang_s": HANG_S})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["extract", "vad", "speed", "relabel"])
    ap.add_argument("--trials", default="words")
    ap.add_argument("--shard", default="0/1", help="i/n: this process takes every n-th trial from i")
    ap.add_argument("--n", type=int, default=20, help="speed: number of trials")
    args = ap.parse_args()
    {"extract": extract, "vad": vad, "speed": speed, "relabel": relabel}[args.step](args)


if __name__ == "__main__":
    main()
