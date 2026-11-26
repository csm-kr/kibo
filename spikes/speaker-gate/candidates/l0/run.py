# L0: plain noise and music removal over the whole mix (route D in ../../candidates.md). No speaker knowledge.
#   ~/kibo-data/speaker-gate/venv/bin/python -I spikes/speaker-gate/candidates/l0/run.py --model gtcrn|dpdfnet [--trials words]
# Writes bench/out/l0-<model>/<trial>/{meta.json,out.wav}. Both models are causal and run in sherpa-onnx; this runs the
# offline denoiser over each file (same model, same frames) and declares the streaming delay as latency_ms.

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

import numpy as np  # noqa: E402
import sherpa_onnx  # noqa: E402

MODELS = {
    # GTCRN: STFT window 512 samples (32 ms) at hop 256 (16 ms, the online frame shift): 32 + 16 ms.
    "gtcrn": ("gtcrn/gtcrn_simple.onnx", 48),
    # DPDFNet: "first enhanced output arrives after one full model window (~20 ms)"; online frame shift 160 (10 ms).
    "dpdfnet": ("dpdfnet-baseline/dpdfnet_baseline.onnx", 30),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", choices=MODELS, required=True)
    ap.add_argument("--trials", default="words")
    args = ap.parse_args()
    rel, algo_ms = MODELS[args.model]
    path = os.path.join(common.MODELS, rel)
    if args.model == "gtcrn":
        mc = sherpa_onnx.OfflineSpeechDenoiserModelConfig(gtcrn=sherpa_onnx.OfflineSpeechDenoiserGtcrnModelConfig(model=path), num_threads=1)
    else:
        mc = sherpa_onnx.OfflineSpeechDenoiserModelConfig(dpdfnet=sherpa_onnx.OfflineSpeechDenoiserDpdfNetModelConfig(model=path), num_threads=1)
    den = sherpa_onnx.OfflineSpeechDenoiser(sherpa_onnx.OfflineSpeechDenoiserConfig(model=mc))
    name = f"l0-{args.model}"
    sha, ids = common.trials(args.trials)
    common.start(name, sha)
    rows = []
    for i, t in enumerate(ids):
        x = common.input_audio(t)
        t0 = time.perf_counter()
        o = den(x, common.RATE)
        dt = time.perf_counter() - t0
        y = np.asarray(o.samples, dtype=np.float32)
        # Output is time-aligned with the mix (lag 0, checked 11-26) and drops the last partial frame; the contract
        # allows a shorter out.wav (the rest is silence).
        assert o.sample_rate == common.RATE and len(y) <= len(x), (t, o.sample_rate, len(y), len(x))
        rows.append((len(x) / common.RATE, dt))
        # Processing per 1 s is about 0.1 s here, so one frame's compute is a few ms: counted into latency_ms.
        common.write(name, t, {"latency_ms": algo_ms + 2}, out=y)
        if i % 200 == 0:
            print(f"{name}: {i}/{len(ids)}", flush=True)
    common.speed_log(name, rows, {"model": rel, "latency_ms_declared": algo_ms + 2})


if __name__ == "__main__":
    main()
