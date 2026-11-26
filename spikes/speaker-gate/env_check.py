# Environment check for spikes/speaker-gate: loads one speaker-verification ONNX model through sherpa-onnx and
# embeds one clip. Prints only the vector length and the time taken (never the vector).
#
#   ~/kibo-data/speaker-gate/venv/bin/python -I spikes/speaker-gate/env_check.py \
#     --model ~/kibo-data/speaker-gate/models/<dir>/<file>.onnx --wav spikes/speaker-gate/audio/tts/Kore-en1.wav

import argparse
import time

import numpy as np
import sherpa_onnx
import soundfile as sf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--wav", required=True)
    args = ap.parse_args()

    t0 = time.perf_counter()
    ext = sherpa_onnx.SpeakerEmbeddingExtractor(
        sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=args.model, num_threads=1, provider="cpu")
    )
    load_ms = 1000 * (time.perf_counter() - t0)

    data, rate = sf.read(args.wav, dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)
    s = ext.create_stream()
    s.accept_waveform(sample_rate=rate, waveform=data)
    s.input_finished()
    t1 = time.perf_counter()
    v = np.asarray(ext.compute(s))
    embed_ms = 1000 * (time.perf_counter() - t1)

    print(f"dim={len(v)} (extractor.dim={ext.dim}) clip_s={len(data) / rate:.2f} load_ms={load_ms:.0f} embed_ms={embed_ms:.1f}")


if __name__ == "__main__":
    main()
