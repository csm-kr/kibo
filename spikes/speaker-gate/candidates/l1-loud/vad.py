# Voice-activity flags for the loudness gate (l1-loud): Silero VAD (MIT) through sherpa-onnx, one flag per 32 ms
# window (512 samples at 16 kHz), for each trial's mix.wav and enrol.wav. Reads bench/inputs only. The gate itself is
# TypeScript (gate.ts); this only says "speech or not" per window, so music and bangs do not teach the gate a level.
#
#   ~/kibo-data/speaker-gate/venv/bin/python -I spikes/speaker-gate/candidates/l1-loud/vad.py [--trials w0001,...]

import argparse
import json
import os
import sys

import numpy as np
import sherpa_onnx
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
BENCH = os.path.normpath(os.path.join(HERE, "..", "..", "bench"))
MODEL = os.path.expanduser("~/kibo-data/speaker-gate/models/silero-vad/silero_vad.onnx")
WIN = 512


def flags(x):
    cfg = sherpa_onnx.VadModelConfig()
    cfg.silero_vad.model = MODEL
    cfg.silero_vad.threshold = 0.5
    cfg.silero_vad.min_silence_duration = 0.1
    cfg.silero_vad.min_speech_duration = 0.064
    cfg.silero_vad.window_size = WIN
    cfg.sample_rate = 16000
    cfg.num_threads = 1
    vad = sherpa_onnx.VoiceActivityDetector(cfg, buffer_size_in_seconds=120)
    out = []
    for i in range(0, len(x) - WIN + 1, WIN):
        vad.accept_waveform(x[i : i + WIN])
        out.append("1" if vad.is_speech_detected() else "0")
        while not vad.empty():
            vad.pop()
    return "".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trials", default="all")
    a = ap.parse_args()
    trials = [t["id"] for t in json.load(open(os.path.join(BENCH, "manifest.json")))["trials"]]
    if a.trials != "all":
        want = set(a.trials.split(","))
        trials = [t for t in trials if t in want]
    out_dir = os.path.join(HERE, "work")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "vad.json")
    done = json.load(open(path)) if os.path.exists(path) else {}
    for n, t in enumerate(trials):
        if t in done:
            continue
        row = {}
        for f in ("mix", "enrol"):
            x, rate = sf.read(os.path.join(BENCH, "inputs", t, f + ".wav"), dtype="float32")
            assert rate == 16000
            row[f] = flags(np.ascontiguousarray(x))
        done[t] = row
        if n % 100 == 0:
            print(n, t, file=sys.stderr)
    json.dump(done, open(path + ".tmp", "w"))
    os.replace(path + ".tmp", path)
    print(len(done), "trials")


if __name__ == "__main__":
    main()
