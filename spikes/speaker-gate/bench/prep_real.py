# Real recorded voices for the crowd benchmark: public read speech, both CC BY 4.0.
#   English: mini LibriSpeech dev-clean-2 (https://www.openslr.org/31/), FLAC, one folder per speaker and chapter.
#   Korean: Zeroth-Korean test split (https://www.openslr.org/40/), the Hugging Face parquet kresnik/zeroth_korean.
# Writes an index (speaker, audio file, transcript) per corpus; bench/build.ts picks utterances from it with its seed
# and decodes them losslessly with ffmpeg. The downloaded data is untrusted: run with `python -I`, keep this script in
# the repo, and pass the data folders as arguments.
#
#   python -I spikes/speaker-gate/bench/prep_real.py --libri <dir with LibriSpeech/dev-clean-2> \
#     --zeroth <test parquet> --out <new empty dir for the Korean audio and both indexes>

import argparse
import glob
import json
import os

import pyarrow.parquet as pq


def libri(root):
    out = []
    for trans in sorted(glob.glob(os.path.join(root, "*", "*", "*.trans.txt"))):
        folder = os.path.dirname(trans)
        spk = folder.split(os.sep)[-2]
        with open(trans, encoding="utf-8") as f:
            for line in f:
                uid, _, text = line.strip().partition(" ")
                path = os.path.join(folder, uid + ".flac")
                if os.path.isfile(path):
                    out.append({"speaker": spk, "id": uid, "file": os.path.abspath(path), "text": text})
    return out


def zeroth(parquet, out_dir):
    audio_dir = os.path.join(out_dir, "zeroth-audio")
    os.makedirs(audio_dir, exist_ok=True)
    out = []
    for i, row in enumerate(pq.read_table(parquet).to_pylist()):
        data = row["audio"]["bytes"]
        # The container is decided by the bytes, not by a name in the data.
        ext = "flac" if data[:4] == b"fLaC" else "wav" if data[:4] == b"RIFF" else None
        if ext is None:
            continue
        spk = str(row["speaker_id"])
        path = os.path.join(audio_dir, f"{i:05d}.{ext}")
        with open(path, "wb") as f:
            f.write(data)
        out.append({"speaker": spk, "id": f"{i:05d}", "file": os.path.abspath(path), "text": str(row["text"])})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--libri", required=True)
    ap.add_argument("--zeroth", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    for name, rows in (("libri-en", libri(a.libri)), ("zeroth-ko", zeroth(a.zeroth, a.out))):
        with open(os.path.join(a.out, f"{name}.json"), "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=0)
        print(name, len(rows), "utterances,", len({r["speaker"] for r in rows}), "speakers")


if __name__ == "__main__":
    main()
