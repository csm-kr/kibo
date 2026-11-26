# Speaker-gate candidates (L0, L2, C)

Candidates for the cocktail-party judge in `../bench/` (contract: `../README.md`, "The contract"). Research and
measured results: `../candidates.md` (sections D, B, C and the "Measured" sections at the end).

Each candidate reads only `bench/inputs/<trial>/{mix.wav,enrol.wav}` and `bench/manifest.json`, and writes
`bench/out/<name>/<trial>/meta.json` (plus `out.wav` for the audio candidates) and `bench/out/<name>/MANIFEST`. None of
them reads `bench/refs/` or `bench/refs.json`. Re-run any of them over whatever `inputs/` holds; they pick the trials
from `manifest.json`.

Python runs in `~/kibo-data/speaker-gate/venv` (sherpa-onnx 2.0.3, numpy, soundfile; no PyTorch) with `python -I`.
Models live in `~/kibo-data/speaker-gate/models/<one folder each>/` (URLs, licences and sha256 in `../candidates.md`).

| Folder | Candidate(s) in bench/out | What it does |
|---|---|---|
| `l0/` | `l0-gtcrn` (and `l0-dpdfnet`) | Noise and music removal over the whole mix; out.wav, no segments. |
| `l2/` | `l2-campp`, `l2-campp-after-gtcrn` | Voice gate: Silero VAD plus CAM++ scores of 1.0 s windows every 0.25 s against enrol.wav; segments only. |
| `c-voxlock/` | `c-voxlock`, `c-voxlock-vad` | VoxLock target-speaker extraction with enrol.wav as the explicit voice sample (out.wav); then Silero VAD segments on that out.wav. |

`common.py` holds the shared file contract helpers; `table.py` prints the report table from the judge's logs. Speed,
tuning and other logs of each candidate are in `<candidate name>/logs/` here.

```
PY=~/kibo-data/speaker-gate/venv/bin/python
$PY -I spikes/speaker-gate/candidates/l0/run.py --model gtcrn
$PY -I spikes/speaker-gate/candidates/l2/run.py score                      # embeddings, cached in l2/work/
$PY -I spikes/speaker-gate/candidates/l2/tune.py                           # dev slice only, see below
$PY -I spikes/speaker-gate/candidates/l2/run.py gate --threshold T --smooth K --lookback L
$PY -I spikes/speaker-gate/candidates/l2/run.py score --input-from l0-gtcrn   # then tune and gate the same way
$PY -I spikes/speaker-gate/candidates/c-voxlock/run.py extract [--shard i/n]
$PY -I spikes/speaker-gate/candidates/c-voxlock/run.py vad
$PY -I spikes/speaker-gate/candidates/c-voxlock/run.py speed --n 20 && $PY -I spikes/speaker-gate/candidates/c-voxlock/run.py relabel
npx tsx --env-file=.env spikes/speaker-gate/bench/score.ts --candidate <name> --layer words --conc 6
python3 -I spikes/speaker-gate/candidates/table.py open hold-oracle customer-oracle <names...>
```

`l2/phone.py` measures what the L2 gate would need on a phone (model time, decision delay, enrolment length) from local
data only. `table.py --cells a,b,... <names>` prints any other cells. After each word run the audio candidates' out.wav
files were deleted for disk (meta.json kept); re-run the candidate to re-create them. `l2-campp-after-gtcrn` has gate
metas in bench/out but was not judged (dropped for money, 11-27).

## Dev slice (L2 tuning)

The L2 gate's threshold, smoothing and look-back are chosen on the **dev slice: cells `chat@-5` and `read@-5`, English
and Korean (4 cells x 12 = 48 trials)**, and then fixed. `l2/tune.py` and `l2/phone.py` (its enrolment-length
part) are the only candidate-folder files that read `bench/refs.json` for these cells, and only for those 48 trials
(customer speech spans and bystander times, to count speech time kept and leaked). The experimenter check
`c-voxlock/check_lone_bystander.py` reads refs for 4 reported trials to split each mix into its two voices; it
changes no setting. These
four cells are never reported for any candidate. Every other candidate here has no tuned setting: GTCRN and VoxLock run
as shipped, and the Silero VAD settings in `common.py` are fixed defaults (threshold 0.5, 0.25 s minimum silence).

## Delay (latency_ms)

- `l0-gtcrn`: 50 ms (STFT window 32 ms plus one 16 ms hop plus about 2 ms of compute).
- `l2-campp`: the median compute of one window (one thread). The gate opens back to the onset of the speech run in
  progress, at most the look-back before the decision, so it relies on the app holding the audio back
  (`heldBack.ts`, sent at four times real time) and catching up before the turn ends. Only the compute is declared;
  a gate that may not look back would declare about 1,000 ms. This matters for the Live layer, not for the word layer.
- `c-voxlock`: 24 ms algorithmic plus one 40 ms chunk plus that chunk's compute, from the `speed` step (online
  denoiser, 40 ms chunks, one thread).
- `c-voxlock-vad`: 33 ms (one Silero window) on top of `c-voxlock` (the judge adds them along the chain).

## Security note

The bench's `enrol.wav` is synthetic or public read speech, so the scripts pass it as a file path. In the app the
customer's sample must stay in memory (`docs/SECURITY.md`); sherpa-onnx's VoxLock config takes only a file path, while
the `voxlock` pip package's `stream(sample)` takes an array.
