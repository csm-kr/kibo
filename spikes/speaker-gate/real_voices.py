# Stage 1 (docs/GOAL.md "Speaker-aware listening"): can a speaker-verification model tell the customer's voice from a
# bystander's in short windows, also when both talk at once? Real recorded voices (public read speech: English mini
# LibriSpeech dev-clean-2, Korean Zeroth test, both CC BY 4.0) and the TTS clips from voices.ts.
#
# For each trial: the customer is enrolled from 3 s of one utterance; windows (1.0 s and 1.5 s) are cut from another
# utterance of the same person, from a bystander, and from mixtures where the bystander is 10, 5 or 0 dB below the
# customer (SIR +10, +5, 0). Score = cosine between the enrolment and the window embedding.
# Reported per model, set and window: EER (customer alone against bystander alone); at the threshold that lets 5% of
# bystander-alone windows through, how many customer windows pass (alone and in each mixture); ms per embedding.
#
# Run (models and data are downloaded outside the repo; see README.md):
#   python -I spikes/speaker-gate/real_voices.py --models <dir> --libri <dev-clean-2 dir> --zeroth <test parquet> \
#     --tts spikes/speaker-gate/audio/tts --out spikes/speaker-gate/logs/real-voices.json

import argparse
import glob
import io
import json
import os
import random
import time

import numpy as np
import pyarrow.parquet as pq
import sherpa_onnx
import soundfile as sf

RATE = 16000
ENROL_S = 3.0
WINDOWS_S = (1.0, 1.5)
SIRS_DB = (10, 5, 0)


def load(data, rate):
    x = np.asarray(data, dtype=np.float32)
    if x.ndim > 1:
        x = x.mean(axis=1)
    if rate != RATE:
        # Linear resampling is enough for a speaker embedding; every set here is already 16 kHz.
        n = int(len(x) * RATE / rate)
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)
    return x


def speech_only(x, frame=320, floor_db=35):
    """Drops 20 ms frames more than floor_db below the loudest one (pauses between words and sentences)."""
    n = len(x) // frame
    if n == 0:
        return x
    f = x[: n * frame].reshape(n, frame)
    e = 10 * np.log10((f**2).mean(axis=1) + 1e-12)
    return f[e > e.max() - floor_db].reshape(-1)


def rms(x):
    return float(np.sqrt((x**2).mean() + 1e-12))


def sets(args):
    out = {}
    libri = {}
    for path in sorted(glob.glob(os.path.join(args.libri, "*", "*", "*.flac"))):
        spk = path.split(os.sep)[-3]
        data, rate = sf.read(path)
        libri.setdefault(spk, []).append(speech_only(load(data, rate)))
    out["en-real"] = libri
    t = pq.read_table(args.zeroth).to_pylist()
    zeroth = {}
    for row in t:
        data, rate = sf.read(io.BytesIO(row["audio"]["bytes"]))
        zeroth.setdefault(str(row["speaker_id"]), []).append(speech_only(load(data, rate)))
    out["ko-real"] = zeroth
    tts = {}
    for path in sorted(glob.glob(os.path.join(args.tts, "*.wav"))):
        data, rate = sf.read(path)
        tts.setdefault(os.path.basename(path).split("-")[0], []).append(speech_only(load(data, rate)))
    out["tts"] = tts
    return out


def trials(speakers, n, rng):
    """(enrolment, customer utterance, bystander utterance) triples; the enrolment is built from other utterances."""
    ids = [s for s, us in speakers.items() if len(us) >= 3]
    out = []
    for _ in range(n):
        spk = rng.choice(ids)
        other = rng.choice([s for s in ids if s != spk])
        us = list(speakers[spk])
        rng.shuffle(us)
        test = us.pop()
        enrol = np.concatenate(us)[: int(ENROL_S * RATE)]
        if len(enrol) < ENROL_S * RATE:
            continue
        out.append((enrol, test, rng.choice(speakers[other])))
    return out


def cut(x, seconds, rng):
    n = int(seconds * RATE)
    if len(x) <= n:
        return np.pad(x, (0, n - len(x)))
    start = rng.randrange(0, len(x) - n)
    return x[start : start + n]


def eer(pos, neg):
    pos, neg = np.asarray(pos), np.asarray(neg)
    best = (1.0, 0.0)
    for th in np.unique(np.concatenate([pos, neg])):
        frr = (pos < th).mean()
        far = (neg >= th).mean()
        if abs(frr - far) < best[0]:
            best = (abs(frr - far), (frr + far) / 2)
    return float(best[1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True)
    ap.add_argument("--libri", required=True)
    ap.add_argument("--zeroth", required=True)
    ap.add_argument("--tts", required=True)
    ap.add_argument("--trials", type=int, default=120)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    data = sets(args)
    plan = {}
    for name, speakers in data.items():
        rng = random.Random(7)
        plan[name] = []
        for enrol, test, other in trials(speakers, args.trials, rng):
            row = {"enrol": enrol, "windows": {}}
            for w in WINDOWS_S:
                c = cut(test, w, rng)
                b = cut(other, w, rng)
                b_alone = b * (rms(c) / rms(b))
                row["windows"][w] = {
                    "customer": c,
                    "bystander": b_alone,
                    **{f"sir{sir}": c + b_alone * 10 ** (-sir / 20) for sir in SIRS_DB},
                }
            plan[name].append(row)
        print(f"{name}: {len(speakers)} speakers, {len(plan[name])} trials", flush=True)

    results = {"sets": {k: {"speakers": len(v), "trials": len(plan[k])} for k, v in data.items()}, "models": {}}
    for model in sorted(glob.glob(os.path.join(args.models, "*.onnx"))):
        name = os.path.basename(model).replace(".onnx", "")
        ext = sherpa_onnx.SpeakerEmbeddingExtractor(
            sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=model, num_threads=1, provider="cpu")
        )
        timings = []

        def embed(x):
            s = ext.create_stream()
            s.accept_waveform(sample_rate=RATE, waveform=x)
            s.input_finished()
            t0 = time.perf_counter()
            v = np.asarray(ext.compute(s))
            timings.append((len(x) / RATE, time.perf_counter() - t0))
            return v / (np.linalg.norm(v) + 1e-12)

        per_set = {}
        for set_name, rows in plan.items():
            scores = {w: {} for w in WINDOWS_S}
            for row in rows:
                e = embed(row["enrol"])
                for w, conds in row["windows"].items():
                    for cond, x in conds.items():
                        scores[w].setdefault(cond, []).append(float(e @ embed(x)))
            per_w = {}
            for w, s in scores.items():
                th = float(np.quantile(s["bystander"], 0.95))
                per_w[str(w)] = {
                    "eer": round(eer(s["customer"], s["bystander"]), 4),
                    "threshold_at_5pct_bystander": round(th, 4),
                    "customer_pass": {c: round(float((np.asarray(v) >= th).mean()), 3) for c, v in s.items() if c != "bystander"},
                }
            per_set[set_name] = per_w
        one_s = [t for d, t in timings if abs(d - 1.0) < 1e-6]
        results["models"][name] = {
            "size_mb": round(os.path.getsize(model) / 1e6, 1),
            "ms_per_1s_window": round(1000 * float(np.median(one_s)), 1),
            "sets": per_set,
        }
        print(json.dumps({name: results["models"][name]}), flush=True)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(results, f, indent=1)


if __name__ == "__main__":
    main()
