# Shared helpers for the speaker-gate candidates (file contract: spikes/speaker-gate/README.md "The contract").
# A candidate reads only bench/inputs/<trial>/{mix,enrol}.wav and writes bench/out/<name>/<trial>/{meta.json,out.wav}
# plus bench/out/<name>/MANIFEST. It never reads bench/refs/ or refs.json.

import hashlib
import json
import os
import shutil
import time

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
BENCH = os.path.normpath(os.path.join(HERE, "..", "bench"))
MODELS = os.path.expanduser("~/kibo-data/speaker-gate/models")
RATE = 16000
MIN_FREE_BYTES = 300 * 1024 * 1024


def manifest():
    raw = open(os.path.join(BENCH, "manifest.json"), "rb").read()
    return hashlib.sha256(raw).hexdigest(), json.loads(raw)["trials"]


def trials(which):
    """Trial ids from manifest.json; `which` is "words", "live", "all", a comma-separated list of ids, or a file
    with one id per line (manifest order is kept)."""
    sha, ts = manifest()
    if os.path.isfile(which):
        which = ",".join(open(which).read().split())
    if which in ("words", "live"):
        return sha, [t["id"] for t in ts if t["set"] == which]
    if which == "all":
        return sha, [t["id"] for t in ts]
    wanted = set(which.split(","))
    return sha, [t["id"] for t in ts if t["id"] in wanted]


def read(path):
    x, rate = sf.read(path, dtype="float32")
    if x.ndim > 1:
        x = x.mean(axis=1)
    assert rate == RATE, f"{path}: {rate} Hz"
    return x


def input_audio(trial, input_from=None):
    """The mix, or the out.wav of the candidate this one is chained after (on the mix's time base)."""
    mix = read(os.path.join(BENCH, "inputs", trial, "mix.wav"))
    if not input_from:
        return mix
    meta = json.load(open(os.path.join(BENCH, "out", input_from, trial, "meta.json")))
    o = read(os.path.join(BENCH, "out", input_from, trial, "out.wav"))
    off = round(meta.get("out_offset_ms", 0) * RATE / 1000)
    x = np.zeros_like(mix)
    x[off : off + len(o)] = o[: len(mix) - off]
    return x


def enrol_path(trial):
    return os.path.join(BENCH, "inputs", trial, "enrol.wav")


def check_disk():
    free = shutil.disk_usage(BENCH).free
    if free < MIN_FREE_BYTES:
        raise SystemExit(f"stopping: only {free // (1024 * 1024)} MiB free on disk (limit {MIN_FREE_BYTES // (1024 * 1024)})")


def start(name, sha):
    d = os.path.join(BENCH, "out", name)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "MANIFEST"), "w") as f:
        f.write(sha + "\n")


def write(name, trial, meta, out=None):
    d = os.path.join(BENCH, "out", name, trial)
    os.makedirs(d, exist_ok=True)
    if out is not None:
        check_disk()
        sf.write(os.path.join(d, "out.wav"), np.clip(out, -1, 1), RATE, subtype="PCM_16")
    with open(os.path.join(d, "meta.json"), "w") as f:
        json.dump(meta, f)


def vad_segments(x, threshold=0.5):
    """Silero VAD (sherpa-onnx) speech segments as [start_s, end_s] lists. Fixed settings, not tuned on the bench."""
    import sherpa_onnx

    cfg = sherpa_onnx.VadModelConfig(
        silero_vad=sherpa_onnx.SileroVadModelConfig(
            model=os.path.join(MODELS, "silero-vad", "silero_vad.onnx"),
            threshold=threshold,
            min_silence_duration=0.25,
            min_speech_duration=0.1,
            max_speech_duration=30,
            window_size=512,
        ),
        sample_rate=RATE,
        num_threads=1,
    )
    vad = sherpa_onnx.VoiceActivityDetector(cfg, buffer_size_in_seconds=60)
    out = []

    def drain():
        while not vad.empty():
            seg = vad.front
            out.append([seg.start / RATE, (seg.start + len(seg.samples)) / RATE])
            vad.pop()

    for i in range(0, len(x), 512):
        vad.accept_waveform(x[i : i + 512])
        drain()
    vad.flush()
    drain()
    return out


def merge(segs, length_s):
    """Clip to [0, length] and merge overlapping or touching segments; returns [[start_ms, end_ms], ...]."""
    segs = sorted([max(0.0, a), min(length_s, b)] for a, b in segs if b > a)
    out = []
    for a, b in segs:
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return [[round(1000 * a), round(1000 * b)] for a, b in out if b > a]


def speed_log(name, rows, extra):
    """rows: (audio_seconds, compute_seconds) per trial. Writes candidates/<name>/logs/speed-<stamp>.json."""
    audio = sum(a for a, _ in rows)
    comp = sum(c for _, c in rows)
    out = {
        "candidate": name,
        "trials": len(rows),
        "audio_s": round(audio, 1),
        "compute_s": round(comp, 2),
        "ms_per_audio_s": round(1000 * comp / audio, 1) if audio else None,
        "threads": 1,
        "machine": "this MacBook (Apple silicon), one thread",
        **extra,
    }
    d = os.path.join(HERE, name, "logs")
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, f"speed-{time.strftime('%Y%m%dT%H%M%S')}.json")
    json.dump(out, open(p, "w"), indent=1)
    print(json.dumps(out))
    return p
