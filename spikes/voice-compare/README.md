# Voice comparison spike: speech recognition for kiosk orders

An offline experiment, not product code. It checks how well several speech-recognition systems hear Korean and English kiosk orders (menu names, numbers, options), and how fast. Findings are in `RESULTS.md`; every clip result is in `results.json`.

**Only Google/Gemini systems are product candidates.** OpenAI and Microsoft rows are an offline comparison the user asked for. They are not used in the product and must never be used in `src/`.

## What is here

| File | What it does |
|---|---|
| `dataset.json` | 30 utterances (20 Korean, 10 English) with the key terms each must contain, plus accepted spellings |
| `synth-voices.mjs` | The 3 Gemini TTS voices |
| `synth.mjs` | Step 1: Gemini TTS → 16 kHz mono WAV, a clean copy and a noisy copy (~10 dB SNR) of each |
| `regen-tts.mjs` | Re-synthesizes a TTS take that came out wrong (spoken style tag, wrong word), checked by Gemini Flash and Chirp 3 |
| `run.mjs` | Step 2: runs one system over all clips (resumable) → `results/raw/<system>.jsonl` |
| `stale.mjs` | Lists rows to re-run after a clip changed |
| `latency-sample.mjs` | Step 2b: 10 clips, one request at a time per batch system, for round-trip times without load |
| `report.mjs` | Step 3: scores everything → `results.json`, `results/tables.md`, and refreshes the tables block in `RESULTS.md` |
| `lib/audio.mjs` | WAV I/O, resampler, pink noise, mixing |
| `lib/score.mjs` | CER, WER, key-term recall |
| `lib/systems.mjs` | One adapter per system |
| `test/score.test.mjs` | Unit tests for the scoring |

## Setup

```
cd spikes/voice-compare
npm install                      # @google/genai, ws (Node 22+; ran on Node 26)
```

Keys come from the repo `.env` through `node --env-file=../../.env` (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `MS_SPEECH_KEY`, `MS_SPEECH_ENDPOINT`). Chirp 3 uses gcloud credentials (`gcloud auth print-access-token`, project `kibo-2026`). The scripts never print keys. A system whose key is missing is recorded as "not run".

## Regenerate the audio (not in git)

The audio (about 45 MB) is not committed. To rebuild it:

```
node --env-file=../../.env synth.mjs
```

TTS output is not deterministic, so new takes differ from the ones measured here. Then listen to or check the slow voice: its style tag `[slowly, elderly voice]` is sometimes spoken aloud or a word comes out wrong. In this run that happened to `ko15_gacrux_slow` (tag spoken; it took several takes) and `ko08_gacrux_slow` (결제할게요 came out as "성적을 내줄게요"). Fix with:

```
node --env-file=../../.env regen-tts.mjs ko15_gacrux_slow ko08_gacrux_slow
node synth.mjs                   # writes only the clips that changed (noisy copies reuse other takes as babble)
```

## Run the systems

```
E=--env-file=../../.env
node $E run.mjs gemini-live                    # stream, real time, 40 ms chunks
node $E run.mjs gemini-live-lang               # + inputAudioTranscription.languageCodes
node $E run.mjs gemini-live-vocab              # + languageCodes + customVocabulary
node $E run.mjs gemini-live-menu               # + menu names in the system instruction
node $E run.mjs gemini-transcribe-live         # gemini-3.5-transcribe-live
node $E run.mjs gemini-transcribe-live-lang
node $E run.mjs gemini-transcribe-live-vocab
node $E run.mjs gemini-flash-batch
node $E run.mjs chirp3
node $E run.mjs chirp3-hints
node $E run.mjs openai-batch                   # offline comparison only
node $E run.mjs openai-realtime                # offline comparison only
node $E run.mjs mai-transcribe-2 --conc 4      # offline comparison only
node $E run.mjs mai-transcribe-2-hints --conc 4
node $E run.mjs mai-voicelive --conc 3
node $E latency-sample.mjs 10                  # batch round trips without load
node report.mjs
```

Options for `run.mjs`: `--lang ko|en`, `--cond clean|noisy`, `--limit N`, `--conc N` (default 4 for streaming, 6 for batch), `--retry-errors`, `--only id1,id2`. After a clip changes: `node stale.mjs | while read s ids; do node $E run.mjs $s --only $ids; done`.

Tests: `node --test test/score.test.mjs`.

## How it measures

- Streaming systems get the clip in 40 ms chunks paced by the wall clock, like a microphone; after the clip they keep getting its last second (silence or noise). Latency = end of speech (measured on the clean clip) → last transcript piece.
- Batch systems: latency = request round trip. Not comparable with streaming latency.
- Korean CER and English WER are corpus-level (total edits / total reference length). Korean ignores spaces and punctuation and treats 하나/한 개/1개, 두 개/2개 and so on as the same.
- Key-term recall: share of required terms found, with listed spelling variants (제로콜라 / 제로 콜라, 코울슬로 / 콜슬로).
- Hints for the "-hints", "-vocab" and "-menu" rows come from `data/kiosks/malo.json` names plus a few order words (세트, 라지세트, 단품, 포장, 매장, 결제, 취소). Nothing is taken from the test sentences.
