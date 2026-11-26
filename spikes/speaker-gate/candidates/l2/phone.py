# What the L2 voice gate would need on a phone, from local data only (no transcriber calls). Experimenter tool.
#
#   ~/kibo-data/speaker-gate/venv/bin/python -I spikes/speaker-gate/candidates/l2/phone.py
#
# 1. model: file size, and the CAM++ network alone in onnxruntime (one thread) on a 1.0 s window of fbank frames.
# 2. decision delay: on the cells where the customer speaks alone (alone, quiet-6, quiet-12, short; trial-to-cell map
#    from the judge's l2-campp word log, not refs), the time from the first Silero onset to the gate's first "open"
#    decision, at the settings fixed on the dev slice. The app must hold back at least this much audio.
# 3. enrolment length: on the dev slice only (the same 48 trials tune.py uses, which read refs.json), the enrolment
#    cut to its first N seconds of speech; speech time kept and leaked at the same fixed settings (not re-tuned).

import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
import common  # noqa: E402
import run as l2  # noqa: E402
import tune  # noqa: E402

import numpy as np  # noqa: E402

TH, SMOOTH, LOOKBACK = 0.35, 3, 1.0  # l2-campp/logs/tune-20261126T233859.json
WORD_LOG = "words-l2-campp-2026-11-26T14-49-34-842Z.json"
ALONE_CELLS = ["alone", "quiet-6", "quiet-12", "short"]
ENROL_S = [1.0, 1.5, 2.0, 3.0, None]  # None = the whole enrol.wav


def model_time():
    import onnxruntime as ort

    path = os.path.join(common.MODELS, l2.MODEL)
    so = ort.SessionOptions()
    so.intra_op_num_threads = so.inter_op_num_threads = 1
    s = ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])
    x = np.random.default_rng(0).standard_normal((1, 98, 80)).astype(np.float32)  # 1.0 s = 98 frames of 10 ms
    for _ in range(10):
        s.run(None, {"x": x})
    ts = []
    for _ in range(200):
        t0 = time.perf_counter()
        s.run(None, {"x": x})
        ts.append(time.perf_counter() - t0)
    return {"file_mb": round(os.path.getsize(path) / 1e6, 1), "ort_ms_per_1s_window_median": round(1000 * float(np.median(ts)), 1),
            "ort_ms_p90": round(1000 * float(np.percentile(ts, 90)), 1), "load_avg": round(os.getloadavg()[0], 1)}


def decision_delay():
    rows = json.load(open(os.path.join(common.BENCH, "logs", WORD_LOG)))["rows"]
    out = {}
    for lang in ["en", "ko"]:
        for cell in ALONE_CELLS:
            ds, never = [], 0
            for r in rows:
                if r["lang"] != lang or r["cell"] != cell:
                    continue
                d = json.load(open(os.path.join(l2.work_dir("l2-campp"), f"{r['trial']}.json")))
                if not d["speech"]:
                    never += 1
                    continue
                onset = d["speech"][0][0]
                opened = None
                hops = d["hops"]
                for i, (end, sc) in enumerate(hops):
                    recent = [h[1] for h in hops[max(0, i - SMOOTH + 1) : i + 1] if h[1] is not None]
                    if sc is not None and sum(recent) / len(recent) >= TH:
                        opened = end
                        break
                if opened is None:
                    never += 1
                    continue
                ds.append(1000 * (opened - onset))
            out[f"{lang}/{cell}"] = {"n": len(ds) + never, "never_opened": never,
                                     "delay_ms_median": round(float(np.median(ds))) if ds else None,
                                     "delay_ms_p90": round(float(np.percentile(ds, 90))) if ds else None}
    return out


def enrol_length():
    import sherpa_onnx

    ext = sherpa_onnx.SpeakerEmbeddingExtractor(
        sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=os.path.join(common.MODELS, l2.MODEL), num_threads=1))

    def embed(x):
        s = ext.create_stream()
        s.accept_waveform(sample_rate=common.RATE, waveform=x)
        s.input_finished()
        v = np.asarray(ext.compute(s))
        return v / (np.linalg.norm(v) + 1e-12)

    refs = json.load(open(os.path.join(common.BENCH, "refs.json")))
    ids = [t for c in tune.DEV_CELLS for t in refs["cells"][c]]
    tot = {n: {"kept": 0, "cust": 0, "leak": 0, "byst": 0} for n in ENROL_S}
    for t in ids:
        r = refs["trials"][t]
        d = json.load(open(os.path.join(l2.work_dir("l2-campp"), f"{t}.json")))
        x = common.input_audio(t)
        wins = {i: embed(x[int((end - l2.WIN_S) * common.RATE) : int(end * common.RATE)])
                for i, (end, sc) in enumerate(d["hops"]) if sc is not None}
        e = common.read(common.enrol_path(t))
        speech = np.concatenate([e[int(a * common.RATE) : int(b * common.RATE)] for a, b in common.vad_segments(e)])
        cust = r["customer"]["speechSpans"] if r["customer"] else []
        byst = tune.minus([[b["startMs"], b["endMs"]] for b in r["bystanders"]], cust)
        for n in ENROL_S:
            v = embed(speech if n is None else speech[: int(n * common.RATE)])
            dd = dict(d, hops=[[end, float(v @ wins[i]) if i in wins else None] for i, (end, _) in enumerate(d["hops"])])
            segs = l2.segments(dd, TH, SMOOTH, LOOKBACK)
            for k, val in {"kept": tune.ov(cust, segs), "cust": tune.ov(cust, cust), "leak": tune.ov(byst, segs), "byst": tune.ov(byst, byst)}.items():
                tot[n][k] += val
    return {("whole" if n is None else f"{n}s"): {"kept": round(v["kept"] / v["cust"], 3), "leaked": round(v["leak"] / v["byst"], 3)}
            for n, v in tot.items()}


def main():
    res = {"settings": {"threshold": TH, "smooth": SMOOTH, "lookback_s": LOOKBACK}, "model": model_time()}
    print(res["model"], flush=True)
    res["decision_delay"] = decision_delay()
    print(json.dumps(res["decision_delay"]), flush=True)
    res["enrol_length_dev_slice"] = enrol_length()
    print(json.dumps(res["enrol_length_dev_slice"]), flush=True)
    d = os.path.join(common.HERE, "l2-campp", "logs")
    p = os.path.join(d, f"phone-{time.strftime('%Y%m%dT%H%M%S')}.json")
    json.dump(res, open(p, "w"), indent=1)
    print("log", p)


if __name__ == "__main__":
    main()
