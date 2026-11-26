# Speaker-aware listening: candidate methods (stage 2 input)

Written 2026-11-26 for `docs/GOAL.md` section 5 "Speaker-aware listening" (ADR-014). The problem is the cocktail
party: other voices (one bystander, or several at once) or music under the customer. The owner's order of work
(memo, 11-26): (1) enrol the customer's voice from a short sample, (2) filter by voice before transcribing, (3) drop
words that do not belong to the order.

Rule R-001 applies: every number or capability names its source URL, or says "unverified". Published numbers are
the authors' own, on their test sets, not ours; the frozen benchmark in `bench/` is the judge.

Status: complete for stage 2 planning (2026-11-26), with kibo-59's two addenda (D as a library route for music and
singing; E meaning and F loudness as layers). Ranked choice per route and for the layer stack: section I, the end of
this file. Nothing here is measured on our benchmark yet; the only runs are the environment check in section G.

## 0. Constraints that decide the ranking

- **Adopt line** (`docs/GOAL.md` section 5): at 0 dB overlap the order right in 18 or more of 20 and bystander items
  added in 1 or fewer; the customer alone no worse than today; added delay 0.5 s or less for B and C, 1.5 s or less
  for A. Fallback goal if nothing removes overlap: "as good as hold without the press" (B alone).
- **Two problems** (`docs/GOAL.md`): turns (bystanders between the customer's sentences) are fixed by a gate (B);
  overlap (a bystander at the same moment) only by extraction (C) or by a model that attributes words to the
  customer (A). Music is a third condition added 11-26; a speaker gate does not remove music under the customer.
- **Where it runs.** The phone talks to Gemini Live directly by default; the `kibo-voice` relay carries audio only
  when the key cannot generate (`GEMINI_LIVE_BACKEND=auto`, `docs/ARCHITECTURE.md` "Voice", ADR-012). So any
  server-side option means routing *all* voice through the relay (Vertex AI Live, `us-central1`), not only the
  fallback case. Measured so far: last word to kiosk highlight median 1,542 ms through the relay against 1,590 ms
  direct, the 0.7 s before the release included (4 runs each, synthetic voices, `spikes/crowd-voice/README.md`), so
  the relay hop itself was not slower there.
- **Delay budget today** (what any candidate adds to): end of the user's speech to the AI's first reaction with hold
  to talk and `audioStreamEnd` median 1,288 ms (17 runs, release fixed 0.2 s after the last word); release to the
  first reaction in the five-hold sessions median 828 ms (110 holds) (`spikes/crowd-voice/README.md`); Live's input
  transcript arrives about 1.15 s after the end of speech (`spikes/voice-compare/RESULTS.md`).
- **Only measured Gemini Flash audio round trip:** `gemini-3.8-flash` `generateContent`, WAV inline, "Transcribe
  exactly", default thinking: median 2,523 ms (1,921 to 3,258; 10 clips, one at a time, 2026-10-12;
  `spikes/voice-compare/RESULTS.md` "Batch round trip without load"). That is already over route A's 1.5 s line
  before any speaker logic; thinking off or a smaller model is unmeasured.
- **Owner's word and privacy.** A model that is not Gemini needs the owner's explicit word before it goes into
  `src/` (`docs/GOAL.md` stage 3; CLAUDE.md "Gemini for all AI features"); Google AI usage is 40% of the score
  (CLAUDE.md). A voiceprint lives only in memory for one voice start and is never written anywhere
  (`docs/SECURITY.md` "Speaker-aware listening").

## A. Gemini only (and other Google AI)

Docs read 2026-11-26. The Gemini API docs moved from `ai.google.dev/gemini-api/docs/*` to `aistudio.google.com/docs/*`
and the Vertex docs to `docs.cloud.google.com/gemini-enterprise-agent-platform/...` (301 redirects). Every quote
below was fetched and matched verbatim on that day. Three questions are kept apart: (Q1) speaker labels exist?
(Q2) can an enrolment sample pick the speaker? (Q3) what about overlapping speech or music?

**Verdict: no Google AI doc offers a way to return only one speaker's words while another person talks at the same
moment.** Diarization exists (batch only); denoisers say they do not remove voices; nothing takes an enrolment
sample to pick a speaker; and the docs never mention overlap. "Not documented" is not "impossible": route A is a
bench question, but it starts with no documented support and a measured latency over its line.

| Option | Q1 labels | Q2 sample picks speaker | Q3 overlap / music | Streaming | Delay evidence |
|---|---|---|---|---|---|
| A1. `gemini-3.5-transcribe` with `diarization_mode: "speaker"`, customer's sample prepended to the turn | yes, `spk_1`... up to 8 | not documented (the prepend trick is ours) | overlap: docs silent | no ("not supported in live streaming sessions") | unmeasured |
| A2. Gemini Flash `generateContent`: sample + mixture, "write only speaker 1's words" (the GOAL's candidate A) | by prompt only | not documented | docs silent | no | 2,523 ms median for plain transcription (ours) |
| A3. Cloud STT `chirp_3` diarization (same prepend trick) | yes, numbered | no | denoiser removes music, "doesn't remove background human voices" | diarization not in `StreamingRecognize` | 1,944 ms median without diarization (ours) |
| A4. Gemini Live settings (proactive audio, VAD) | no | no | decides whether to answer, does not filter words | yes | measured no gain (11-22) |

- **A1, Gemini 3.5 Transcribe** (https://aistudio.google.com/docs/transcribe): "converts speech in audio files into
  text using the Gemini 3.5 Transcribe model (`gemini-3.5-transcribe`)"; diarization "tags each segment with a speaker
  identifier like `spk_1` or `spk_2`. Up to 8 speakers are supported (attribution for 3 or more speakers is
  experimental)"; "Audio processing is limited to 30 minutes when features like speaker diarization ... are
  enabled"; the page has no occurrence of "overlap". Diarization and `custom_vocabulary` cannot be combined ("The API
  rejects requests that include `custom_vocabulary` with either feature", research pass quote, not re-fetched). The
  live model has none: "Speaker diarization is not supported in live streaming sessions"
  (https://aistudio.google.com/docs/live-api/live-transcribe). Languages: `ko-KR` and `en-US` listed, `en-SG` not
  (research pass). Price "$0.003/min (audio)" (research pass, not re-fetched). **Idea for the bench (ours, untested):**
  put the customer's 3 s enrolment in front of each turn, diarize, keep only the words with the enrolment's label.
  That is a Google-AI-only way to use an enrolment; it fixes turns (bystander sentences get another label) but
  diarization labels *segments*, so words spoken over the customer can still land under the customer's label.
- **A2, Gemini Flash audio understanding** (https://aistudio.google.com/docs/audio): lists "Speaker diarization
  (identifying different speakers)" as a prompt task; "32 tokens per second of audio (1 minute = 1,920 tokens)"; the
  page has no example of a reference voice and no text on overlap. Vertex: "Use speaker A, speaker B, etc. to
  identify speakers" (https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/audio-understanding,
  research pass). Measured on our side: plain transcription with `gemini-3.8-flash` took a median 2,523 ms
  (`spikes/voice-compare/RESULTS.md`), over A's 1.5 s line before any speaker logic; the same idea on Live (a spoken
  sample, "only my voice") gave no gain at 0 dB on 11-22 (`spikes/crowd-voice/README.md`), and Gemini Embedding 2
  carries words, not voices (`spikes/speaker-gate/README.md`).
- **A3, Cloud Speech-to-Text `chirp_3`** (https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3): "Chirp 3
  supports speaker diarization in Recognize and BatchRecognize, but not in StreamingRecognize" (the general page
  https://docs.cloud.google.com/speech-to-text/docs/multiple-voices says "Cloud STT supports speaker diarization for all
  speech recognition methods: speech:recognize and Streaming": the docs conflict; the model page is the more specific).
  Denoiser: "Set denoise_audio=true to reduce non-speech background noise such as music, rain, or traffic", applies
  "only to Speech.StreamingRecognize", and "**The denoiser doesn't remove background human voices.**" So Chirp 3's
  streaming denoiser is a Google-AI answer for *music* (see D), not for voices; whether it removes *singing* is not
  stated. Our measured `chirp_3` `recognize` round trip: median 1,944 ms, 1,669 ms with phrase hints
  (`spikes/voice-compare/RESULTS.md`, location `us`; `asia-northeast1` refused). Languages for diarization: `ko-KR`
  and `en-US` with `chirp_3` in `us`/`eu`; `en-SG` only on telephony models without diarization (research pass, from
  https://docs.cloud.google.com/speech-to-text/docs/speech-to-text-supported-languages).
- **A4, Gemini Live** (https://aistudio.google.com/docs/live-api/capabilities): proactive audio, "Gemini can
  proactively decide not to respond if the content is not relevant", "Permanently enabled on Gemini 3.8 Live". Vertex:
  "Proactive Audio helps Gemini avoid interruptions from background noise or external chatter, and prevents Gemini
  from responding if external chatter is introduced during a conversation"
  (https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/configure-gemini-capabilities). It
  chooses whether to *answer*; it does not take bystanders' words out of the turn. It was already on when the open
  microphone scored 0 of 12 at -20 dB (`spikes/crowd-voice/README.md`). No voice-isolation or noise-suppression
  setting was found on the Live pages; Vertex troubleshooting says "move the microphone closer to the user or use a
  microphone with better noise cancellation" (research pass). The only voice-sample feature in Live is for the AI's
  own synthesized voice (voice replication), not for input.
- **Cloud Speaker ID** (verification, "Enrollment Free", "Verification $0.01 / 1 count",
  https://cloud.google.com/speaker-id/pricing; research pass): docs page returns 404 and the product page redirects to
  Gemini Enterprise CX; a per-call verification API priced per count, not a streaming gate. Not usable tomorrow.

**First to try for A: A1** (`gemini-3.5-transcribe`, diarization on, enrolment prepended), because it is the only
documented Google speaker-labelling tool in the Gemini API and the cheapest per minute; run A2 in the same bench pass
as the GOAL defines it (thinking set as low as the model allows), since both are a few cheap calls. Expected added
delay: unmeasured for A1; A2's plain transcription alone was 2.5 s, so **A is expected to miss its 1.5 s line**
unless the bench shows otherwise. Rule A out if, at 0 dB overlap, bystander words still appear under the customer's
label or in A2's output in more than 1 of 20, or the round trip median is over 1.5 s.

## B. Gate: speaker verification + voice activity

**What the published evidence says about short windows.** One paper retrained the main architectures under one recipe
and scored 0.5, 1 and 2 s test chunks on clean VoxCeleb1-O ("16 short chunks per utterance are evaluated
independently", https://arxiv.org/html/2611.15288, read through a research pass): EER 15.69 / 5.86 / 2.23% for CAM++,
11.32 / 4.87 / 2.13% for ERes2NetV2, 18.61 / 7.41 / 2.88% for ECAPA, 11.25 / 4.17 / 1.62% for ReDimNet-B4. These are
retrained architectures, not the released checkpoints, and clean speech. Reading: a single 1 s window misjudges about
1 in 20 even in quiet, so the gate must smooth over several windows (open on a run of matches, close after about
0.7 s without one, as ADR-014 plans) and its threshold must come from the bench, not from a paper. No family has a
published result with music or babble as the noise (MUSAN appears only as training augmentation, e.g. CAM++
https://arxiv.org/abs/2303.00332), and none was trained on Korean as far as the cards say.

### B1. 3D-Speaker CAM++ zh/en "common advanced", recommended first for B (downloaded)

- File `3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx`, 28.3 MB, sherpa-onnx release (section G);
  upstream https://modelscope.cn/models/iic/speech_campplus_sv_zh_en_16k-common_advanced, **Apache License 2.0**
  (ModelScope licence field). Training: "large-scale Chinese and English speaker datasets" (translated from the Chinese
  card), not named on the card; Korean not mentioned. EER: CN-Celeb test 5.98%, VoxCeleb-O 1.16% (same card).
- 7.18M parameters, single-thread CPU RTF 0.013 (the sibling card https://modelscope.cn/models/iic/speech_campplus_sv_en_voxceleb_16k,
  CPU model not named; the paper says "RTF was evaluated on CPU under single-thread condition",
  https://arxiv.org/abs/2303.00332). Ours: 105 ms to embed 3.42 s on one thread (section G, one run).
- Why first: smallest and fastest of the packaged models, Apache on the card, and the only packaged model whose card
  says it was trained on two languages. Its own weakness is published too: the single-language siblings beat it on
  their own tests (VoxCeleb-only CAM++ 0.73% on Vox1-O; Chinese-only CAM++ 4.32% on CN-Celeb).
- A known bug is fixed in this file: CAM++ ONNX gave "an embedding that depends on the input length modulo 2 seconds
  under onnxruntime 1.21 to 1.28"; "digital silence of 2.0 s and of 2.3 s gives two embeddings with cosine 0.026"
  when broken (https://github.com/k2-fsa/sherpa-onnx/pull/4241, issue #4201; the 3D-Speaker export was fixed in
  #4237, "export CAM++ segment pooling with count_include_pad=False", merged 2026-11-19, the date the assets were
  re-uploaded). The issue's own repro on the downloaded file with sherpa-onnx 2.0.3: digital silence 2.0 s vs 2.3 s
  cosine 0.997, 1.0 s vs 1.3 s 0.995 (ResNet34-LM: 0.999 and 0.989). Matters because every gate window is shorter
  than one 2 s pooling segment. (Scratch script, not kept: `np.zeros` of each length through
  `SpeakerEmbeddingExtractor`, cosine of the two vectors.)

### B2. WeSpeaker ResNet34-LM, second (downloaded)

- File `wespeaker_en_voxceleb_resnet34_LM.onnx`, 26.5 MB; upstream
  https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34-LM, card `license: cc-by-4.0`; WeSpeaker: "the
  pretrained model on VoxCeleb follows Creative Commons Attribution 4.0" (https://wenet-e2e.github.io/wespeaker/pretrained.html).
  The same weights are what pyannote wraps ("Wrapper around wespeaker-voxceleb-resnet34-LM",
  https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM).
- 6.63M parameters; VoxCeleb only; Korean not stated. WeSpeaker says the LM variants "could perform better on long
  audios, e.g. >3s" (https://github.com/wenet-e2e/wespeaker/blob/master/docs/pretrained.md): a doc remark, not a
  test, but it suggests also trying the plain `wespeaker_en_voxceleb_resnet34.onnx` (26.5 MB, same release) on 1 s
  windows. Ours: 391 ms for 3.42 s on one thread (section G), about 4 times CAM++.
- Why second: a different training set and architecture from B1, the most widely used open speaker model, and
  already present in pyannote. Licence caveat in "Licence risk" below.

### B3. Others (not downloaded)

| Model (sherpa-onnx file) | MB | Weights licence | Training / Korean | Why not first |
|---|---|---|---|---|
| ERes2NetV2 zh-cn (`3dspeaker_speech_eres2netv2_sv_zh-cn_16k-common.onnx`) | 71.4 | Apache License 2.0 (https://modelscope.cn/models/iic/speech_eres2netv2_sv_zh-cn_16k-common) | Chinese only, about 200k speakers; CN-Celeb 3.81% | Best short-window architecture among the packaged ones (above), but Chinese-only and 2.5 times the size; **third choice**, not fetched because free disk fell to 1.3 GiB during this session |
| NeMo TitaNet small (`nemo_en_titanet_small.onnx`) | 40.3 | NGC card: the NeMo toolkit licence (Apache-2.0); the HF card of TitaNet large says CC-BY-4.0 (research pass; the two disagree) | "several thousand hours of English speech" (https://huggingface.co/nvidia/speakerverification_en_titanet_large); 6.4M params, 1.08% EER (https://catalog.ngc.nvidia.com/orgs/nvidia/teams/nemo/models/titanet_small) | No short-window result; English only |
| SpeechBrain ECAPA (`speechbrain/spkrec-ecapa-voxceleb`) | 83.3 (ckpt) | apache-2.0 card | VoxCeleb 1+2; 0.80% EER | No ONNX in sherpa-onnx, none official found; ECAPA is the weakest at 0.5 and 1 s above |
| ReDimNet (IDRnD) | | code MIT; weights licence not stated; S/M models trained on VoxBlink2, which says "no commercial application is allowed" (https://voxblink2.github.io) | | No ONNX; licence |

### B4. Speaker-conditioned VAD and streaming diarization (not first choices)

- Personal VAD: `wq2012/personal_vad` (Apache-2.0, weights on HF, 265 KB TFLite; trained on "8-language Multilingual
  LibriSpeech", no Korean; its speaker encoder is research scale, https://github.com/wq2012/personal_vad);
  `fclearner/Personal-vad-2.0` (Apache-2.0, CAM++ embeddings, one "sanitized speaker-aware checkpoint",
  https://github.com/fclearner/Personal-vad-2.0); `pirxus/personalVAD` is GPL-3.0. Tiny and frame-level (the right
  shape for a gate), but small research checkpoints: worth a look only if B1 is too coarse.
- Streaming diarization: NVIDIA `diar_streaming_sortformer_4spk-v2` (CC-BY-4.0, 117M params, 0.32 to 1.04 s input
  latency, speed published on GPU only, https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2) and
  `nvidia/nemotron-3-diarization` (openmdw-1.1, "ready for commercial or non-commercial use", 100M params, up to 8
  speakers, lowest recommended latency 0.32 s; not conditioned on a target speaker,
  https://huggingface.co/nvidia/nemotron-3-diarization). Ten times heavier than B1, no CPU numbers.

### Licence risk shared by every VoxCeleb-trained model

VoxCeleb's own page: "The VoxCeleb dataset is available to download for research purposes under a Creative Commons
Attribution 4.0 International License" (https://mm.kaist.ac.kr/datasets/voxceleb/, fetched 2026-11-26). The weights'
cards say CC BY 4.0 or Apache-2.0, both of which allow commercial use, but the dataset says "research purposes".
This touches B2, TitaNet, ECAPA, VoxLock's ECAPA base and possibly B1 (its training sets are not named). Not a
lawyer's reading; the owner decides before anything ships. Using the models in a benchmark is research use.

### Gate behaviour to expect (own reading, unverified until the bench)

- Fixes turns, not overlap: when the customer speaks, the whole stretch goes up, bystander included (`docs/GOAL.md`).
- Music under the customer lowers the match score, so the likely failure is the gate shutting the customer out
  (false reject), not letting music in; a hold must always work as the way back (ADR-014).
- Added delay: the frames wait in `heldBack.ts` while the gate decides and then go up at four times real time, so
  the start costs little; the end costs the close rule (about 0.7 s without a match) against today's release. Compute
  is small (B1: about 105 ms per 3.42 s on one thread). Expected under the 0.5 s line, unverified.
- Runs where: sherpa-onnx Python in a relay sidecar (checked, section G); Node and browser builds in D.

## C. Target-speaker extraction

### C1. VoxLock (causal band-split RNN target-speaker extractor), recommended first for C

Found in the sherpa-onnx 2.0.3 headers while setting up the environment (`sherpa_onnx/include/sherpa-onnx/c-api/c-api.h`:
"VoxLock keeps the voice of one speaker (the caller) and removes other voices. The model is from
https://github.com/arbazsiddiqui/voxlock").

- **What it does, in the owner's order of work.** One stream in, the customer's voice out; the online mode "passes
  the audio through unchanged until 3 seconds of speech have been heard; that speech is used as the voice sample"
  (`c-api.h`, `SherpaOnnxOfflineSpeechDenoiserVoxLockModelConfig.voice_sample`). That is step 1 (enrol from a short
  sample) and step 2 (filter before transcribing) in one model. A sample can also be given up front: "If you already
  have a sample ... isolation starts with the first chunk" (README, https://github.com/arbazsiddiqui/voxlock).
- **Weights and licence.** Hugging Face model card `license: apache-2.0`, `base_model:
  Wespeaker/wespeaker-voxceleb-ecapa-tdnn512` (https://huggingface.co/arbazsiddiqui/voxlock, read through the HF API);
  repo licence Apache-2.0 (GitHub API, https://github.com/arbazsiddiqui/voxlock). The base WeSpeaker ECAPA512 card is
  also `apache-2.0` (https://huggingface.co/Wespeaker/wespeaker-voxceleb-ecapa-tdnn512). It is "fine-tuned from the
  REAL-TSE challenge baseline" (README); that repo has no LICENSE file (GitHub API `license: null`) but its README
  says the checkpoints' "model parameters ... are released under Apache-2.0, permitting commercial use ... Third-party
  pretrained parameters, including the WeSpeaker ECAPA-TDNN weights ... remain subject to their applicable upstream
  licenses" (https://github.com/REAL-TSE/wesep-real-tse, README line 76). WeSpeaker's own page: "the pretrained model
  on VoxCeleb follows Creative Commons Attribution 4.0 International License"
  (https://wenet-e2e.github.io/wespeaker/pretrained.html). Both allow commercial use; **CC BY 4.0 needs attribution**
  (credit WeSpeaker/VoxCeleb wherever the model ships). Training data: LibriSpeech and AMI (README
  "Acknowledgements"); their licences unverified here.
- **ONNX files.** Two release tags exist. sherpa-onnx's own `scripts/voxlock/README.md` says "The models with meta
  data can be downloaded from https://github.com/arbazsiddiqui/voxlock/releases/tag/sherpa-onnx-models-v2" and that
  the older tag `sherpa-onnx-models` models "still work"; "The 1.2.0 models use less CPU: their enroll model also
  computes everything that depends only on the voice sample" (https://github.com/k2-fsa/sherpa-onnx/tree/master/scripts/voxlock).
  The sherpa-onnx 2.0.3 header and VoxLock's README still link the older tag. Use v2. Whether the installed 2.0.3
  wheel loads v2 was not run (no extraction models downloaded, per the task). sha256 from the GitHub API:
  - v2 (2026-10-27): `voxlock_enroll.onnx` 21,024,406 B `850ed19ec52ff80421e4746b0028647f36ffba4997ab776b5180c49bd948f41e`;
    `voxlock_chunk_int8.onnx` 56,561,266 B `2d1716a0df324188ec43e134ec72ba22d8ae13a7f2ce3a976a81113db844a65a`;
    `voxlock_enroll_fp16.onnx` 10,894,582 B `e60ebd8617cc9dd330f860aee3ef7478281d5f81faee5ecdcfb30e9a569efd56`;
    `voxlock_chunk_fp16.onnx` 38.9 MB `727f85dd71570baca5f990b6519a03667be4f6e87f8fa21c9efe0e73b7c89ad5`.
  - older `sherpa-onnx-models` (2026-10-23): `voxlock_enroll.onnx` 12,476,014 B
    `5d06048c156bb8cd422d29848e6d38fb26a7b39f6f7fd92eccf2a6ed1ce003c6`; `voxlock_chunk_int8.onnx` 66,608,910 B
    `df61a9d0062b0adbcf1182302b1eb8b815f15ac47ea4923e8e164c1aff64121d`.
  - The pip package fetches its own copy ("The 74 MB model downloads on first use", README) from
    https://huggingface.co/arbazsiddiqui/voxlock (`onnx/v2`). `pip install voxlock` (1.3.1, Apache-2.0) requires
    numpy, onnxruntime, huggingface_hub, soundfile and soxr; no PyTorch (PyPI `requires_dist`, 2026-11-26).
- **Causal, 24 ms algorithmic latency, 27M parameters:** "The model has 27M parameters and 24 ms of algorithmic
  latency, plus the chunk" (README "Performance"). End to end in frameworks: "184 ms delay at 16 kHz; `chunk_ms=40`
  gives 104 ms" (Pipecat), "124 ms delay at 16 kHz" (LiveKit) (README). Well inside the 0.5 s line, by the author's
  numbers.
- **CPU speed (author's numbers, one Xeon @ 2.20 GHz thread, onnxruntime 1.31.1, int8):** real-time factor 1.10 at
  20 ms chunks, 0.77 at 40 ms, 0.61 at 80 ms; fp16/fp32 need 163 to 165% of a core at 20 ms (README "Performance",
  "Quantized models"). So one live customer costs most of one vCPU on the relay; `kibo-voice` instance size and
  concurrency would have to change (own reading, not measured).
- **Where it runs.** (a) Relay: yes in principle; it is built into sherpa-onnx's C++ denoisers "from 2.0.1"
  (README "sherpa-onnx"), and the Python package `pip install voxlock` streams with `stream.push(chunk)` (README
  "Streaming"). Whether the Node addon `sherpa-onnx-node` exposes it is unverified (see D). (b) Phone: the README says
  it "runs on CPU and in the browser" and the HF Space browser demo uses the fp16 model
  (https://huggingface.co/spaces/arbazsiddiqui/voxlock); iOS Safari speed and memory unverified, and 50 MB of fp16
  weights plus 163% of a server core per call makes a phone doubtful (own reading).
- **Published evidence for overlap (author's own, `verified: False` on the HF card):** on 265 real recordings of the
  Krisp Voice Isolation Benchmark ("how a second voice breaks speech-to-text"; English, 47 speakers;
  https://huggingface.co/datasets/Krisp-AI/VoiceIsolation-Benchmark-Dataset, licence CC BY-NC 4.0, so not for our
  bench), word error rate 4.95% against 23.21% with no processing, and 0.11 background words leaked per minute
  against 66.48; on held-out AMI meetings 10.12% against 33.03% (README "Results"). The streaming mode that finds the
  caller by itself (`live()`) scores 5.15% on the same 265 recordings (README "Streaming"). The same table puts
  DeepFilterNet3 at 13.30% / 22.77 leaked per minute and its own REAL-TSE starting checkpoint at 9.81% / 13.73.
- **Music:** not in the training description ("room noise" only, README "Training"); no published result with
  music. Unverified.
- **Languages:** HF card `language: ['en']`; LibriSpeech and AMI are English. **Korean absent from training.**
  Whether it keeps a Korean speaker is unverified; the bench's Korean set decides.
- **Failure modes to test:** it enrols whoever speaks first for 3 s (the online default), so a bystander who speaks
  first is locked in; a voice sample given up front avoids that. **This decides how to run it:** the crowd scenario
  plays 5 s of bystanders before the customer speaks (`spikes/crowd-voice/README.md` "Method"), and a kiosk queue does
  the same, so the online self-enrolment would lock onto a bystander. Give it the enrolment explicitly (the bench's
  first 3 s of the customer; in the app, for example the customer's first hold). In sherpa-onnx the up-front sample is a *wave file
  path* (`voice_sample`), which would write the customer's voice to a file, against `docs/SECURITY.md` ("never
  written to ... disk"); the Python package takes it in memory (README), or the online mode enrols from the stream.
  Young project: repo created 2026-10-11, 126 stars (GitHub API, 2026-11-26), one author, numbers self-reported.
- **More from the paper** (https://arxiv.org/abs/2610.40727, read through a fetch summary, so the wording may differ
  slightly): "The model is English-trained, 16 kHz and single-caller"; given someone else's 3 s sample, the REAL-TSE
  checkpoint "follows that person and loses 61% of the caller's words", VoxLock 17% (8% with the right sample); and
  "Both comparison sets were seen during development" (the paper's own limit). The "leaked" metric counts only
  stretches where the background talks alone; **no published number isolates the moments when both talk at once**,
  which is exactly our 0 dB overlap cell.
- Browser: the demo runs onnxruntime-web (WASM) and uses one thread unless the page is cross-origin isolated
  (`demo/worker.js`: `numThreads = self.crossOriginIsolated ? ... : 1`); sherpa-onnx's WASM speech-enhancement code
  carries a VoxLock config (https://github.com/k2-fsa/sherpa-onnx/tree/master/wasm/speech-enhancement). Neither run
  by us; no published phone speed.

### C2. REAL-TSE causal baseline (VoxLock's starting point): a control, not a contender

- Checkpoints `tfmap_context_causal_100` and `spk_emb_causal_100` (plus two non-causal), Google Drive link in the
  README (https://github.com/REAL-TSE/wesep-real-tse); Apache-2.0 for the parameters (quote in C1). PyTorch only, no
  ONNX: needs a custom export, so it ranks last by the owner's rule.
- Trained on Libri2Mix at 16 kHz; causal, 24 ms latency (challenge page https://real-tse.github.io/challenge, read
  through a summary). On the Krisp recordings 9.81% WER and 13.73 leaked words per minute against VoxLock's 4.95% and
  0.11 (VoxLock README). Its organisers call its scores "a lower bound" (same page). CPU speed: not published.
- Use only to check that VoxLock's fine-tuning is what helps, if the bench has time.

### C3. Not usable tomorrow (and why)

| Option | Weights | Why not |
|---|---|---|
| PS4 (https://huggingface.co/TaurenMountain/PS4, Apache-2.0, 283 MB `.pt`) | yes | Trained on real meetings (Chinese, English), but causal or not is not stated and there is no ONNX: cannot be judged against 0.5 s |
| WeSep (https://github.com/wenet-e2e/wesep) | `bsrnn_ecapa_vox1` on ModelScope, Apache-2.0 (branch `wesep_2024`) | main says "official pretrained model packages are under validation"; causal not stated; no ONNX |
| ClearerVoice-Studio SpEx+ (`alibabasglab/log_wsj0-2mix_speech_SpEx-plus_2spk`, Apache-2.0) | yes | "SpEx+ (Non-causal)", WSJ0-2mix only; its packaged TSE (`AV_MossFormer2_TSE_16K`) needs face video |
| ESPnet SpeakerBeam (`espnet/Wangyou_Zhang_librimix_train_enh_tse_td_speakerbeam_raw`, CC BY 4.0) | yes | "sample_rate: 8000", "causal: false" |
| ConVoiFilter (`nguyenvulebinh/voice-filter`, Apache-2.0) | yes | Halves Whisper WER on LibriCSS 40% overlap (32.73 to 16.83, https://arxiv.org/html/2308.11380) but streaming not stated |
| USEF-TSE | yes | "Attribution-NonCommercial 4.0": not for commercial use |
| pyannote ToTaToNet (`pyannote/separation-ami-1.0`, MIT, gated) | yes | Blind separation of up to 3 speakers on 5 s windows; no enrolment, so it is not TSE |
| SpeakerBeam (BUT), SpEx (GPL-3.0), VoiceFilter (maum-ai: embedder only), VoiceFilter-Lite, TEA-PSE, pDCCRN, pDeepFilterNet2, Personalized PercepNet, X-TF-GridNet, streaming DPO-TSE (560 ms chunks) | none found | No downloadable separator weights. "pBSRN" has no exact match; the nearest (BSRNN + speaker attentive module, arXiv 2302.09953) has no code or weights |

Sources for this table: the research pass of 11-26 (URLs in each row; ESPnet, ClearerVoice and WeSep quotes are from
their model cards and READMEs). Rows marked "not found" mean not found, not "does not exist".

## D. Music and singing removal with an off-the-shelf library

The owner, 11-26 (via kibo-59, translated): "singing and that kind of filtering should be done with a library." So D
is a route of its own, ranked like A to C, preferring options that are one `pip install` or `npm install` away with
the weights included; a model that needs training or a custom export ranks last.

**Plain answer on singing and second voices: no library found removes a singing voice, or a second talker, without
knowing the customer's voice.** Three kinds exist, and the sources say what each keeps:

1. *Speech enhancers* (DeepFilterNet, RNNoise, GTCRN, DPDFNet, WebRTC noise suppression) are trained to keep voices.
   The DNS Challenge noise set was cleaned of voices ("We used a speech activity detector to remove the clips with
   any kind of speech activity", https://ar5iv.labs.arxiv.org/html/2202.13288), and voice detectors "often
   misclassify singing as speech" (https://arxiv.org/abs/2512.09713); AudioSet files Singing under "Human voice"
   (https://research.google.com/audioset/ontology/singing_1.html). These are training-data facts, not tests; the
   inference is that such models keep singing. Krisp's noise canceller, as LiveKit documents it, "Removes
   environmental background noise such as traffic, fans, and music while preserving all speech"
   (https://docs.livekit.io/transport/media/enhanced-noise-cancellation.md, fetched 2026-11-26). No open model has a
   published evaluation with music or singing as the noise.
2. *Dominant-voice isolators* (W3C `voiceIsolation`, Krisp's voice isolation, ai-coustics) keep the loudest voice
   without enrolment, and document their leaks: "Background voices are loud. The model lets some of that speech
   through" and "A background voice speaks before the primary speaker. The model keeps it until a more dominant
   speaker starts to talk" (same LiveKit page). A singer on a loudspeaker can be the dominant voice.
3. *Speaker-aware* models know the customer's voice: the gate (B) and target-speaker extraction (C). **VoxLock (C1) is
   itself an off-the-shelf library** (`pip install voxlock`, or built into sherpa-onnx 2.0.3, Apache-2.0), so the
   owner's "use a library" holds for singing too; but music and singing are not in its training (C1).

So music under the customer goes to a D library, and singing and other voices go to C1 (or B for turns). Chaining
D in front of C1 is an option for the bench; each adds its own few tens of ms.

### D1. GTCRN, recommended first for D (weights bundled, speed published, phone and relay)

- "48.2 K parameters and 33.0 MMACs per second", "RTF of 0.07 on the 12th Gen Intel(R) Core(TM) i5-12400",
  "trained on DNS3 and VCTK-DEMAND datasets" (https://github.com/Xiaobin-Rong/gtcrn; licence MIT by the GitHub API).
  16 kHz; about 32 ms window (`torch.stft(x1, 512, 256, 512` in `gtcrn.py`, own arithmetic).
- Phone: `@sapphi-red/web-noise-suppressor` 0.4.2 (`GtcrnWorkletNode`) and `@sapphi-red/gtcrn-wasm` 0.0.3, "WebAssembly
  (SIMD) build", "Bundled model weights derive from GTCRN (MIT)" (npm registry, research pass): one `npm install`
  with weights, but a 0.0.x package from one maintainer. Relay: sherpa-onnx `gtcrn_simple.onnx` (523 KB, separate
  download, https://k2-fsa.github.io/sherpa/onnx/speech-enhancement/models.html).

**Exact weight files for L0** (release https://github.com/k2-fsa/sherpa-onnx/releases/tag/speech-enhancement-models,
sizes and digests from the GitHub API, 2026-11-26; not downloaded). DPDFNet 16 kHz variants per
https://k2-fsa.github.io/sherpa/onnx/speech-enhancement/dpdfnet.html: "dpdfnet_baseline , dpdfnet2 , dpdfnet4 , or
dpdfnet8 for 16 kHz downstream ASR", with `dpdfnet_baseline` "Fastest / lowest resource usage" (2.31M params, 0.36
GMACs) and `dpdfnet2` "Real-time / embedded devices" (2.49M, 1.35 GMACs).

| File | Bytes | sha256 |
|---|---|---|
| `gtcrn_simple.onnx` | 535,638 | no digest listed by GitHub; hash it on download |
| `dpdfnet_baseline.onnx` (16 kHz) | 8,791,035 | `debaf0e8893479fca91b8b4c1eae8db195aa8980ccc9012f5809fde2b738151a` |
| `dpdfnet2.onnx` (16 kHz) | 10,249,356 | `ce35d6025fc71df0ef10d1540e1b7916837bbfe5f6896deb744508d2cad487a9` |

### D2. DPDFNet 16 kHz in sherpa-onnx, second

- "a family of causal, single-channel speech enhancement models", extending DeepFilterNet2
  (https://k2-fsa.github.io/sherpa/onnx/speech-enhancement/dpdfnet.html, research pass); by Ceva
  (https://arxiv.org/abs/2512.16420). Code Apache-2.0 (https://github.com/ceva-ip/DPDFNet, GitHub API) and weights
  `apache-2.0` (https://huggingface.co/Ceva-IP/DPDFNet, HF API). 8, 16 and 48 kHz variants, 2.31M to 3.63M
  parameters, ONNX 8.3 to 14.2 MB; "first enhanced output arrives after one full model window (~20 ms)" (GitHub
  README, research pass). CPU speed: not published. Music or singing: no result found.
- Package: already in our venv (sherpa-onnx 2.0.3 `OfflineSpeechDenoiserDpdfNetModelConfig`, streaming through
  `OnlineSpeechDenoiser`); weights are a separate small download; also `pip install dpdfnet` 0.6.0 (weights from HF).
- Why second: same runtime as B1 and C1, 16 kHz, causal, Apache for code and weights; but its weights are a
  separate download and no CPU speed is published, so by the owner's rule it ranks under GTCRN. Run it in the same
  bench pass (the same `OnlineSpeechDenoiser` call with another config).

### D3. Others

| Option | Licence | Package | Latency / CPU | Why not first |
|---|---|---|---|---|
| DeepFilterNet 3 | "All code and model weights in this repository are dual-licensed" MIT/Apache (https://github.com/Rikorose/DeepFilterNet) | pip `deepfilternet` 0.5.6 (last release 2023); npm only a third-party fork (`@lofcz/deepfilternet-web` 0.1.0, 34 MB) | DF2: "overall algorithmic delay of 40 ms" (https://arxiv.org/pdf/2205.05474); DF3: "real-time-factor of 0.19 on a single threaded notebook CPU" (https://arxiv.org/abs/2305.08227) | 48 kHz only (resampling both ways); stale packages. On the Krisp second-voice recordings it cut WER 23.21% to 13.30% and leaked words 66.48 to 22.77 per minute (VoxLock README, the author's run): plain enhancement removes some distant voices, far less than C1 |
| RNNoise | BSD-3-Clause (GitHub API) | npm `@jitsi/rnnoise-wasm` 0.2.1, `@shiguredo/rnnoise-wasm`; pip `pyrnnoise` 0.4.6; default model built in | 10 ms lookahead, "about 60x faster than real-time on an x86 CPU" (https://jmvalin.ca/demo/rnnoise/) | 48 kHz; an older, small design; no music result |
| WebRTC audio processing (classic noise suppression) | WebRTC is BSD-style; these packages' licences unverified | pip `webrtc-noise-gain` 1.3.0 ("for noise suppression and auto gain only", 10 ms frames); npm `@ai-ecoverse/wasm-webrtc-audio-processing` | 10 ms | Built for steady noise; music is not steady (own reading) |
| Browser `noiseSuppression` / `voiceIsolation` | n/a | the browser | n/a | **iOS Safari:** WebKit's `MediaTrackSupportedConstraints.idl` lists only `boolean echoCancellation = true;` (https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/mediastream/MediaTrackSupportedConstraints.idl, fetched 2026-11-26): `noiseSuppression` and `voiceIsolation` are not supported, and echo cancellation switches Apple's voice-processing unit (`kAudioUnitSubType_VoiceProcessingIO`, research pass). The system "Voice Isolation" mic mode is "The microphone mode that the user selects in Control Center" and read-only to apps (https://developer.apple.com/documentation/avfoundation/avcapturedevice/preferredmicrophonemode); whether it applies to Safari is unverified. **Chrome:** `voiceIsolation` "only takes effect on platforms where there is low-level support", ChromeOS from M123 (https://groups.google.com/a/chromium.org/g/blink-dev/c/hPMvCu-3iPA); Android unverified |
| Google AI: Chirp 3 `denoise_audio` | Google Cloud | `StreamingRecognize` option | n/a | "reduce non-speech background noise such as music" but it cleans Chirp's own transcript and returns no audio, so it cannot sit in front of Live (A3) |
| Krisp SDK | commercial; terms not public | "Web (JS/WASM), iOS and Android" (https://krisp.ai/sdk, research pass) | | Paid, terms unknown; its noise canceller keeps "all speech" (above) |
| Music source separation: Demucs 4.1.0 (MIT), Spleeter 2.4.2 (MIT), Open-Unmix 1.3.0 | code MIT; Open-Unmix `umxl` weights "non-commercial use (CC BY-NC-SA 4.0)" | pip | Demucs "maximum segment length of 7.8 seconds", CPU "roughly equal to 1.5 times the duration of the track"; Open-Unmix "cannot be used in an online/real-time manner" (READMEs, research pass) | Offline only; and singing goes to the "vocals" stem, the same place as the customer (whether speech lands there too is unverified) |

### Where each route can run (checked 2026-11-26)

| Runtime | Speaker embedding (B) | VoxLock (C1) | Enhancers (D) | VAD | Source |
|---|---|---|---|---|---|
| Python sherpa-onnx 2.0.3 (relay sidecar) | yes, run here | config present | config present | yes | section G, our venv |
| Node `sherpa-onnx-node` 2.0.3 (relay itself) | `SpeakerEmbeddingExtractor`, `SpeakerEmbeddingManager` exported | via `OnlineSpeechDenoiser`; the voxlock option in Node unverified | `OnlineSpeechDenoiser` exported | `Vad` exported | https://unpkg.com/sherpa-onnx-node@2.0.3/sherpa-onnx.js; `optionalDependencies` include `sherpa-onnx-linux-x64` (Cloud Run) |
| sherpa-onnx WASM (phone) | **no** WASM build exposes it (`wasm/` has asr, kws, speaker-diarization, speech-enhancement, tts, vad, vad-asr; GitHub API) | speech-enhancement JS config has voxlock (research pass) | GTCRN demo | yes | https://github.com/k2-fsa/sherpa-onnx/tree/master/wasm |
| onnxruntime-web (phone) | possible with own feature code (custom work) | VoxLock's own browser demo | yes | yes | threads "Only when ... `crossOriginIsolated`" (https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html) |

Phone risks: sherpa-onnx issue #1315 "WASM ASR "loadPackage" fails in Safari running on IOS" was closed unresolved
(https://github.com/k2-fsa/sherpa-onnx/issues/1315), and WebKit bug 304810 (status NEW) "causes many AI models loaded
through ONNX runtime to fail on iOS 26" (https://bugs.webkit.org/show_bug.cgi?id=304810) (both research pass). So the
relay is the safer first place for every route; a phone build is a later step. Voice activity for the gate: Silero
VAD, MIT, "less than **1ms** to be processed on a single CPU thread", 8 or 16 kHz, in sherpa-onnx
(https://github.com/snakers4/silero-vad). File for L1 and L2: `silero_vad.onnx`, 643,854 bytes, sha256
`9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6`, release
https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models (GitHub API, 2026-11-26; not downloaded; the same release
also has `ten-vad.onnx`, 332,211 bytes, licence not checked).

**First to try for D: D1 GTCRN** (sherpa-onnx `gtcrn_simple.onnx` on the relay; `@sapphi-red/web-noise-suppressor`
on the phone), with D2 DPDFNet in the same pass. Expected added delay about 16 to 32 ms (GTCRN frame and window) or
about 20 ms (DPDFNet, author's figure), plus the chunk; far under 0.5 s. Rule one out if, in the bench's music cell,
it does not raise the order rate or the customer's kept words, or if it lowers them for the customer alone.

## E. Meaning (Gemini): act only on speech addressed to KIBO (layer L3)

The owner, 11-26 (via kibo-59, translated): "a voice embedding is hard, so test whether filtering by MEANING is good
enough". This is also step 3 of the owner's memo (drop words that do not belong to the order).

**What Gemini Live offers** (`gemini-3.8-live`; https://aistudio.google.com/docs/live-api/capabilities and the API
reference https://aistudio.google.com/api-reference/live, fetched 2026-11-26):

- **Proactive audio:** "Gemini can proactively decide not to respond if the content is not relevant"; "Permanently
  enabled on Gemini 3.8 Live ... (setting `proactive_audio: false` returns an error)". Vertex describes it as helping
  "Gemini avoid interruptions from background noise or external chatter, and prevents Gemini from responding if
  external chatter is introduced during a conversation" (A4). It decides whether to *answer*; it does not take words
  out of the turn. It was on in the 11-22 runs where the open microphone got 0 of 12 orders right at -20 dB.
- **Turn coverage:** 3.8 Live defaults to `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO`: "Includes audio activity and
  all video since the last turn. With automatic activity detection, audio activity means speech and excludes
  silence". The other values (`TURN_INCLUDES_ONLY_ACTIVITY`, `TURN_INCLUDES_ALL_INPUT`) change silence and video, not
  speakers: any voice the server's detector calls speech is in the customer's turn.
- **Activity handling:** default `START_OF_ACTIVITY_INTERRUPTS` ("barge in"); `NO_INTERRUPTION`: "The model's response
  will not be interrupted". Stops a bystander from cutting off KIBO's spoken reply; filters no words.
- **Client-side activity:** "the automatic VAD can be disabled by setting
  `realtimeInputConfig.automaticActivityDetection.disabled` to `true` ... the client is responsible for detecting
  user speech and sending `activityStart` and `activityEnd`" (capabilities). This is how a loudness gate (F) or a
  voice gate (B) would mark the customer's turns exactly, instead of today's `audioStreamEnd` after a hold.
- **Input transcription:** `input_audio_transcription` transcribes the input audio; on our tests it is a separate
  recognizer that does not see the instructions (`spikes/voice-compare/RESULTS.md` finding 3).
- **Affective dialog:** "Not supported (removed; omit `enable_affective_dialog`)" on 3.8 Live. No addressee or
  "device-directed speech" setting on the capabilities page or the API reference (searched "directed" and
  "addressed": no hits on either). The reference's one "speaker" hit is a `diarization` field ("Configures speaker
  diarization") next to `wordTimestamp` and `sourceText`, while the live-transcribe guide says "Speaker diarization
  is not supported in live streaming sessions" (A1): a docs conflict, untested, and labels would not filter words
  anyway.

**Three designs and their added delay:**

| Design | How | Added delay | Evidence so far |
|---|---|---|---|
| E1. Instructions only, inside Live | Tell Live to act only on words addressed to the ordering assistant that answer what it just asked or add to this order; a second, different order or talk between other people gets no action, or a short "Was that for me?" | none | Not measured in this form. The nearest test, "recognise only my voice" with or without a sample, gave no gain at 0 dB (`paying` 2, 1 and 1 of 6, 11-22) |
| E2. Flash step before Live | Send the stretch (after L0/L1) to `gemini-3.8-flash` with the menu and the question KIBO just asked; it returns only the words addressed to the assistant; Live gets that as text (`sendClientContent`) and answers by voice | about +2 s: Flash transcription alone took a median 2,523 ms (`spikes/voice-compare/RESULTS.md`), and Live's first audio after a text turn was 794 ms in one relay run (`docs/ARCHITECTURE.md` "Vertex relay"), against about 1.3 s from end of speech to first reaction today (own arithmetic) | None on overlap; Live also loses the audio itself (tone, hesitation) |
| E3. Check after Live | Before a cart-changing tool call is applied, a Flash text call judges whether the input transcript (and the question KIBO asked) supports it; refused calls return "ask again" to Live | one text call per cart change: median 2.2 s, p90 3.8 s (text agent, one model call, `docs/plan/NUMBERS.md`), on the path to the kiosk highlight | None; the server already refuses anything not in menu data |

**What meaning cannot filter.** A bystander ordering from the same menu: in our runs the bystanders' words that broke
orders were menu items (spicy chicken burger, cola, bulgogi burger, `spikes/crowd-voice/README.md`). A bystander's
"yes" or "large" said right after KIBO asks. And words merged into the customer's sentence: "the transcript mixes the
bystanders' words into the user's" (same README), so the meaning layer sees one sentence with one speaker. Meaning
removes off-topic talk; on-topic talk from the queue needs L1 (a farther voice is quieter), L2 (another voice) or C.

**First to try for E: E1** (no delay, no cost, keeps Gemini as the only AI in the path), scored alone and on top of
L0 and L1. E3 only if E1 leaves actions taken on talk that was clearly not addressed to KIBO and the delay is
accepted for that one moment. E2 is ruled out by delay unless the bench shows Flash far faster than 2.5 s.

## F. Loudness: keep the voice near the phone (layer L1)

The owner, 11-26 (via kibo-59, translated): "throw away what is too low in decibels; design the experiment so it
hears well."

**What went wrong with the first gate** (`spikes/crowd-voice/nearGate.ts`, README "Limits" and "What the gate costs
the user", independent review 11-22): it learned only from frames above its own bar and never decayed, so a user who
spoke 12 dB more quietly was not heard (15 dB: never again); a sound about 3 times louder than the user for 200 to
500 ms raised the bar over the user's voice; a bystander within 9 dB pulled the bar down; speech arriving under about
0.014 RMS was cut from the start; the user's own "Yes." 12 dB under their order was lost in 3 of 3; and it worked only
while bystanders were at least 15 dB quieter than a user it had heard for a whole sentence (warm: -15 dB 3 of 3,
-10 dB 1 of 3; a gate warmed on 1 s did not help).

**What a correct design changes** (own design for the bench; the published practice is listed below):

1. Two tracked levels instead of one: a *floor* for the room (rises slowly, falls fast) and a *near level* for the
   customer (learned only from frames a voice detector calls speech, so music does not teach it), and the near
   level *decays* toward floor plus a margin when the customer has been silent, so any lock-out ends by itself
   within seconds.
2. A single loud event cannot move the near level: rate-limit how fast it rises, ignore frames far above it, and
   learn only from runs of speech frames.
3. The bar follows the dialogue: right after KIBO asks a yes/no or choice question, accept a quieter voice for a few
   seconds (the short "yes" case), since the app knows which question is open.
4. Decide by level relative to the floor as well as absolute level, because automatic gain on the phone moves the
   absolute level (see below).
5. Open fast (two speech frames, with the pre-roll in `heldBack.ts`), close after a hangover, and drive Live with
   `activityStart` / `activityEnd` (E) or the existing hold machinery; a hold always works as the way back.

Expected added delay: about zero beyond today's hold, since held frames catch up at four times real time (own
reading). What it cannot do: tell apart a bystander as loud as the customer at the microphone (shoulder to shoulder,
a loudspeaker); measured: hold to talk itself fails beyond 0 dB (`spikes/crowd-voice/README.md`).

**Published practice the design follows:**

- Room floor: WebRTC AGC2 "Updates the noise floor with instant decay and slow attack", "Update the noise floor
  every 5 seconds", and "During the observation period it's only allowed to lower the energy"
  (https://webrtc.googlesource.com/src/+/refs/heads/main/modules/audio_processing/agc2/noise_level_estimator.cc,
  fetched 2026-11-26). The classic WebRTC VAD takes "the median of the five smallest feature values in a 100 frames
  long window" (`common_audio/vad/vad_sp.h`, research pass). Minimum statistics (Martin 2001) "tracks spectral minima
  in each frequency band without any distinction between speech activity and speech pause"
  (https://www.iks.rwth-aachen.de/publikationen/publications-detail//martin01c/, research pass).
- Speech level learned only from sure speech, with a way back: AGC2's speech level uses frames above a voice
  confidence of 0.95 (`kVadConfidenceThreshold = 0.95f`, `agc2_common.h`) and, after a too-short run of speech,
  says "Reset to the last reliable state"
  (https://webrtc.googlesource.com/src/+/refs/heads/main/modules/audio_processing/agc2/speech_level_estimator_impl.cc,
  fetched). That is the cure for v1's lock-out by a 200 to 500 ms bang.
- Active speech level (ITU-T P.56, through Kabal's report https://www.mmsp.ece.mcgill.ca/Documents/Reports/1999/KabalR1999.pdf,
  research pass): envelope smoothed with a "time constant (0.03 seconds)", "hangover (H = 0.2 seconds", and the speech
  threshold sits 15.9 dB under the active level ("In Recommendation P.56, M is 15.9 dB"); smoothing is "useful to
  avoid triggering the hangover by brief noise pulses". P.56's 15.9 dB describes when *one* talker is active, not
  how far under the customer a bystander must be; v1's bar sat about 9 dB under the learned level
  (`NEAR_RATIO = 0.35`), so the depth is a bench parameter, not a number to copy (below).
- One-microphone distance cues: the direct-to-reverberant ratio "decreases with distance", reverberation is "roughly
  independent of its distance to the microphone", and the proximity effect "is only strong for sources less than one
  meter away" (https://www.isca-archive.org/interspeech_2022/patterson22_interspeech.pdf, a neural separator on
  simulated rooms; research pass). No published level-only near/far speech classifier was found.

**What the phone gives the gate:**

- Constraints: MDN's compat data lists `autoGainControl` and `noiseSuppression` as Chrome 67+, Safari "version_added":
  false (iOS mirrors desktop Safari), and `echoCancellation` as Chrome 53+, Safari 13.1+
  (https://github.com/mdn/browser-compat-data/blob/main/api/MediaDevices.json, `getSupportedConstraints`, fetched
  2026-11-26). `voiceIsolation` has no compat entry; Chrome limits it to "a selected number of ChromeOS devices"
  (https://chromestatus.com/api/v0/features/5106413661847552, research pass). Chromium's default is
  `bool auto_gain_control = true;` (research pass), so on Android the gate should ask for `autoGainControl: false`.
- iOS Safari: the one audio-processing switch is `echoCancellation`; WebKit uses Apple's voice-processing unit when it
  is true (`m_shouldUseVPIO = enableEchoCancellation();`) and `kAudioUnitSubType_RemoteIO` when false
  (https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/mediastream/cocoa/CoreAudioCaptureUnit.cpp,
  fetched). Apple's voice processing includes "echo cancellation, noise suppression, automatic gain control"
  (https://developer.apple.com/videos/play/wwdc2023/10235/, research pass) and its AGC "is in an enabled state by
  default" (https://developer.apple.com/documentation/avfaudio/avaudioinputnode/isvoiceprocessingagcenabled, research
  pass). So **a page cannot turn off AGC alone on iOS**; `echoCancellation: false` drops all of it and, per a WebKit
  report, changes the output speaker (https://bugs.webkit.org/show_bug.cgi?id=326286, research pass), which costs a
  voice assistant its echo cancelling. KIBO keeps echo cancellation on iOS (`docs/ARCHITECTURE.md` "Voice"), so the
  gate on iPhone must work on levels *relative to the tracked floor*, not on absolute dBFS. Apple's AGC time
  constants: unverified.
- Reading the level to say "come closer": `AnalyserNode.getFloatTimeDomainData` and `AudioWorkletProcessor.process`
  (blocks of 128 frames on the audio thread) are available from Safari 14.1
  (https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process, research pass). The level is read
  after the system's AGC, which exists "to maintain a steady overall volume level" (MDN `getSettings`), so a "come
  closer" hint should compare the customer's speech to the room floor over a few seconds rather than to a fixed dBFS
  (own reading).

**Making the customer easier to hear, rather than others harder.** Distance is the strongest lever: free-field level
falls "6dB per doubling of distance", though in real rooms "rarely as much as 6dB per doubling of distance"
(https://www.soundonsound.com/sound-advice/q-does-strength-proximity-effect-depend-volume-source, research pass);
by that rule a phone 5 cm from the mouth hears the customer about 26 dB above a person 1 m away, and a stage hall's
reverberation narrows it (own arithmetic). A headset or lavalier in the mouth's near field gains more than any model:
a cardioid reduces ambient noise "by approximately two-thirds when compared to their omni counterparts"
(https://www.shure.com/en-US/insights/microphone-directionality-polar-pattern-basics, research pass), and a headset at
2.5 cm against a phone at 15 cm is about 15.6 dB (own arithmetic). iOS Safari can use one: WebKit lists the audio
session's available inputs as microphones, allows Bluetooth hands-free (`AVAudioSessionCategoryOptionAllowBluetooth`),
and maps `deviceId` to `setPreferredInput`
(https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/mediastream/ios/AVAudioSessionCaptureDeviceManager.mm,
research pass); Apple lists "a headset microphone port" among inputs when connected
(https://developer.apple.com/documentation/avfaudio/avaudiosession/availableinputs, research pass). Whether a USB-C
lavalier becomes Safari's default input on plugging in is unverified; Bluetooth hands-free moves the output to the
headset too and lowers its audio quality (own reading; check on the stage phone). For the finale stage, a wired
headset or lavalier into the demo phone plus the phone held close is the cheapest, surest gain, and it helps every
layer; it is not a product answer for customers.

**First to try for F:** gate v2 as above (floor with instant decay and slow attack over 5 s; speech level from Silero
VAD speech frames only, reset to the last reliable level after a short burst; 0.2 s hangover; `autoGainControl:
false` where the browser allows). **Bar depth is swept on the bench (6, 9, 12, 15 dB under the speech level):** a
deeper bar keeps more of the customer but lets nearer bystanders through, and v1 at about 9 dB held only against
bystanders 15 dB quieter; the quiet "yes" is carried by lowering the bar for a few seconds after a yes/no question,
not by a deep bar all the time. No licence issue (our code; Silero VAD is MIT). Added delay about zero. Rule it out
if the customer alone loses more than today (quiet "yes" included) or any of v1's lock-out cases reproduces.

## G. Environment and downloaded models

- **Venv:** `~/kibo-data/speaker-gate/venv`, CPython 3.12.13 (uv), sherpa-onnx 2.0.3 (+ sherpa-onnx-core 2.0.3),
  numpy 2.5.5, soundfile 0.14.0, pyarrow 26.0.1 (`uv pip install`, 2026-11-26). No PyTorch. 193 MB on disk by `du`,
  but uv cloned the files from its cache, so free space moved by about 2 MB at install (`df`).
- **Models**, one new directory each under `~/kibo-data/speaker-gate/models/`, from the sherpa-onnx release
  https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models (the tag is spelled that way). The
  sha256 below was computed locally and matches the digest GitHub lists for the asset.

| Directory / file | Size | sha256 | Weights licence |
|---|---|---|---|
| `campplus-zh-en-advanced/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx` | 28.3 MB | `53cab20ba8f2eb2f6e2d89ecc18e88ef3222169b61b4419cbc13666744a4574b` | Apache License 2.0 (ModelScope `iic/speech_campplus_sv_zh_en_16k-common_advanced`, https://modelscope.cn/models/iic/speech_campplus_sv_zh_en_16k-common_advanced, licence field read through the ModelScope API) |
| `wespeaker-resnet34-lm/wespeaker_en_voxceleb_resnet34_LM.onnx` | 26.5 MB | `e9848563da86f263117134dfd7ad63c92355b37de492b55e325400c9d9c39012` | CC BY 4.0: "the pretrained model on VoxCeleb follows Creative Commons Attribution 4.0 International License" (https://wenet-e2e.github.io/wespeaker/pretrained.html); commercial use allowed with attribution |

- **Check** (`spikes/speaker-gate/env_check.py`, run with `python -I`, one TTS clip `audio/tts/Kore-en1.wav`, 3.42 s,
  one thread, this MacBook, one run each, not a benchmark): CAM++ zh/en vector length 192, load 390 ms, embed 105 ms;
  ResNet34-LM vector length 256, load 82 ms, embed 391 ms.
- **Layout note for `real_voices.py`:** it globs `*.onnx` directly inside `--models`, so with one directory per model
  pass each directory separately (or a directory of symlinks); the script was not changed.
- Not downloaded: VoxLock and every other extraction or enhancement model (task limit), PyTorch, datasets (the
  `bench-venv` and `data` folders next to `venv` belong to the bench session).

## H. Unverified

- **Overlap itself:** no model has a published number for the moments when both people talk at once; VoxLock's
  "leaked" metric counts background-only stretches. The 0 dB cell of our bench is the first measurement.
- **Korean:** no candidate (A excepted) states Korean in training; every Korean result will be new.
- **Music and singing:** no open model has a published evaluation with music or singing as the noise; Chirp 3's
  denoiser names music but not singing.
- **Licences:** VoxCeleb says "for research purposes" while the weights' cards allow commercial use (B2, TitaNet,
  ECAPA, VoxLock's base); B1's training sets are unnamed (CN-Celeb, if used, is CC BY-SA 4.0,
  https://www.openslr.org/82/, research pass); LibriSpeech and AMI licences not read; Krisp terms not public; the
  WebRTC packages' licences not read.
- **Speed:** DPDFNet CPU speed not published; VoxLock and every B model on a phone; B models on 1 s windows (only
  whole-clip timings were run here); `gemini-3.5-transcribe` round trip.
- **Runtimes:** the VoxLock option in `sherpa-onnx-node`; sherpa-onnx WASM on iOS Safari; whether iOS Control Center
  "Voice Isolation" applies to Safari; Android `voiceIsolation`.
- **Docs conflicts:** Chirp 3 diarization in `StreamingRecognize` (model page says no, general page says yes); TitaNet
  licence (NGC Apache-2.0 vs HF CC-BY-4.0).
- **Meaning (E):** E1's instruction has never been measured; the 11-22 "only my voice" test is the nearest and showed
  no gain. E2 and E3 delays are built from other measurements (Flash transcription, text agent calls), not run.
- **Loudness (F):** Apple's voice-processing AGC and noise-suppression time constants; whether the
  `echoCancellation: false` path still has system gain; whether a USB-C or Lightning lavalier becomes Safari's
  default input on plugging in; the exact iOS versions (compat data says iOS mirrors desktop Safari); P.56 read only
  through Kabal's report; no published level-only near/far speech classifier found. Gate v2 is a design, not code.
- **Disk:** free space was 3.95 GiB at the start, fell to 1.31 GiB mid-session and was 3.6 GiB at the end, so the
  drop was temporary and outside `~/kibo-data` (635 MB in all; this session's temp folder 120 KB); its cause was not
  identified. This task added about 52 MB of models and about 2 MB of venv (the venv shows 193 MB but is cloned from
  the uv cache).
- Quotes marked "research pass" were collected by a research agent and not re-fetched. Re-fetched on 2026-11-26: the
  licences of every option ranked in I, of both downloaded models and of C2 (VoxLock, its ECAPA base, REAL-TSE,
  WeSpeaker docs and both ResNet34 HF cards, CAM++ zh/en, ERes2NetV2, VoxCeleb, DPDFNet, GTCRN, DeepFilterNet,
  RNNoise, Silero), every route A quote, every Live API quote in E, the WebKit IDL and `CoreAudioCaptureUnit.cpp`
  lines, the MDN compat entries for the constraints, the two WebRTC AGC2 quotes, the `sherpa-onnx-node` exports and
  the LiveKit quotes. The licences in the "not usable" tables (C3, B3 TitaNet/ECAPA/ReDimNet, D3 music separators)
  are from the research pass.

## I. Ranked recommendation for 11-27: the layer stack

The experiment is a stack, each layer scored alone and in combination (kibo-59, 11-26): L0 library noise and music
removal (D), L1 loudness (F), L2 voice gate (B, optional), L3 meaning (E), with extraction (C) as the stretch. Route A
stays a side measurement. Every option that is not Gemini needs the owner's explicit word before `src/` (CLAUDE.md,
`docs/GOAL.md` stage 3); a bench run is not that.

| Layer | First option | Licence | Fixes | Does not fix | Added delay | Rule it out if |
|---|---|---|---|---|---|---|
| L0 | **D1 GTCRN** (sherpa-onnx `gtcrn_simple.onnx`; phone: `@sapphi-red/web-noise-suppressor`), D2 DPDFNet 16 kHz in the same pass | MIT; DPDFNet Apache-2.0 | music, steady noise (no published music test) | voices and singing: kept by design (D) | about 16 to 32 ms, DPDFNet about 20 ms, plus the chunk | no gain on the music cell, or any loss for the customer alone |
| L1 | **F gate v2**: room floor plus a decaying near level learned from speech frames, a bar that follows the open question | our code, no model | bystanders clearly quieter at the mic (v1 held to about -15 dB); turns | a voice as loud as the customer; overlap; a loudspeaker | about zero (held frames catch up at four times real time) | the customer alone gets worse (a quiet "yes" lost) or v1's lock-out cases (F) reproduce |
| L2 | **B1 CAM++ zh/en** + Silero VAD, 1 to 1.5 s windows smoothed | Apache-2.0 (card); training sets unnamed | turns from bystanders of any loudness | overlap; music under the customer lowers the match (false reject) | close rule as a release (about 0.7 s) plus about 30 ms compute per 1 s window (scaled from our 105 ms per 3.42 s); target 0.5 s, unverified | at the threshold that lets 5% of bystander windows through, too few customer windows pass (`real_voices.py` `customer_pass`), worst on the Korean set |
| L3 | **E1 instructions in Live** (act only on words addressed to KIBO) | Gemini | off-topic talk, talk between other people | a bystander ordering from the same menu; words merged into the customer's sentence | none | no gain on the bench, or the customer's own orders get refused |
| Stretch | **C1 VoxLock** int8, enrolment given explicitly and kept in memory (`voxlock` package `vl.stream(sample)`) | Apache-2.0; ECAPA base CC BY 4.0 (attribution) | overlap, other voices, singing, turns | music (not in training); Korean unknown | about 0.1 to 0.2 s (author: 104 ms with 40 ms chunks) | at 0 dB overlap under 18 of 20 or over 1 bystander item in 20; Korean customer alone worse; over about one vCPU per live customer |
| Side | **A1 `gemini-3.5-transcribe`** diarization with the enrolment prepended (A2 Flash in the same pass) | Google AI | turns (labels per segment) | overlap (docs silent) | unmeasured; Flash transcription was 2.5 s, so expected over the 1.5 s line | round trip over 1.5 s, or bystander words under the customer's label at 0 dB in over 1 of 20 |

**What the stack can reach.** L0, L1 and L3 together are the owner's preferred shape (libraries and Gemini, no
voiceprint) and should remove music, far talk and off-topic talk. None of them can separate a bystander who is as
loud as the customer, orders from the same menu and talks at the same moment, so **the 0 dB overlap adopt line is
reachable only with C1** (or with route A, which the docs do not support); without C the stack's honest target is
the fallback "as good as hold without the press". L2 adds turns from loud bystanders and needs the owner's word on a
voiceprint.

**Order to build.** L0 and L2 first (the next task given to this session), then L1 and L3 (no model to fetch), then
the combinations L0+L1+L3, +L2, and C1 in place of L2. Routing all voice through `kibo-voice` is part of every
server-side layer (section 0). Any voice sample stays in memory (`docs/SECURITY.md`): use the `voxlock` package's
in-memory sample, not sherpa-onnx's `voice_sample` file path, and never VoxLock's online self-enrolment in a queue
(it enrols whoever speaks first, C1).

## J. Measured on the judge (task 2, 2026-11-26)

Bench v2 (manifest sha256 `51967c1a81e8…`), word layer only (`score.ts --layer words`, transcriber `gemini-3.8-flash`),
no Live sessions. Code, run commands and the L2 dev slice are in `candidates/README.md`. Each cell below is "customer
words kept % / bystander words leaked %", 12 trials per cell; music@0 has no bystander words. Baselines are kibo-1b's
v2 runs: open `words-open-2026-11-26T13-51-41-631Z.json`, hold-oracle `words-hold-oracle-2026-11-26T13-56-32-346Z.json`,
customer-oracle `words-customer-oracle-2026-11-26T13-43-55-272Z.json` (all in `bench/logs/`).

Models added for this task, each in its own folder under `~/kibo-data/speaker-gate/models/`:

| Folder / file | Source | Licence | Bytes | sha256 |
|---|---|---|---|---|
| `gtcrn/gtcrn_simple.onnx` | sherpa-onnx release `speech-enhancement-models` | MIT (GTCRN) | 535,638 | `e77603ac0c23dac3227dd2d7135b3a585cbee2679048aecfa886657d3ae1b534` (no published digest to compare) |
| `dpdfnet-baseline/dpdfnet_baseline.onnx` | same release | Apache-2.0 | 8,791,035 | `debaf0e8893479fca91b8b4c1eae8db195aa8980ccc9012f5809fde2b738151a` (matches GitHub) |
| `silero-vad/silero_vad.onnx` | sherpa-onnx release `asr-models` | MIT | 643,854 | `9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6` (matches GitHub) |
| `voxlock-v2/voxlock_enroll.onnx` | github.com/arbazsiddiqui/voxlock release `sherpa-onnx-models-v2` | see C1 | 21,024,406 | `850ed19ec52ff80421e4746b0028647f36ffba4997ab776b5180c49bd948f41e` (matches GitHub) |
| `voxlock-v2/voxlock_chunk_int8.onnx` | same release | see C1 | 56,561,266 | `2d1716a0df324188ec43e134ec72ba22d8ae13a7f2ce3a976a81113db844a65a` (matches GitHub) |
| `voxlock-hf/` (deleted after use for disk) | `voxlock` 1.3.1 from PyPI, its own download of HF `arbazsiddiqui/voxlock` rev `2413b292…`, `onnx/v2/` | see C1 | 74 MB | enroll `81f305c9b7a32f13d1401f53bb4c6301826a607c9e807e60912f36ef1b9fae29`, chunk_int8 `c50ffdc8d723fd4f91cb08889f3d0143491f95967b705f35c444a0b4afe88172` |

The venv also gained the `voxlock` 1.3.1 package and its dependencies (onnxruntime 1.32.0, soxr, huggingface_hub; no
PyTorch), used only for the cross-check in J3.

### J1. l0-gtcrn: GTCRN over the whole mix (L0)

GTCRN (`gtcrn_simple.onnx`) through sherpa-onnx's denoiser over each mix; out.wav only, time-aligned with the mix (lag
0 samples, checked). latency_ms 50 (32 ms window + 16 ms hop + compute). Log
`bench/logs/words-l0-gtcrn-2026-11-26T14-19-03-314Z.json`.

| en | alone | chat@-10 | chat@0 | order@-10 | order@0 | babble@0 | music@0 | song@0 |
|---|---|---|---|---|---|---|---|---|
| open | 96 / - | 100 / 52 | 95 / 71 | 99 / 49 | 95 / 74 | 36 / 13 | 97 / - | 73 / 30 |
| l0-gtcrn | 96 / - | 96 / 43 | 78 / 63 | 90 / 43 | 92 / 64 | 32 / 12 | 98 / - | 72 / 27 |

| ko | alone | chat@-10 | chat@0 | order@-10 | order@0 | babble@0 | music@0 | song@0 |
|---|---|---|---|---|---|---|---|---|
| open | 100 / - | 100 / 38 | 99 / 82 | 100 / 53 | 98 / 91 | 52 / 12 | 99 / - | 83 / 30 |
| l0-gtcrn | 100 / - | 100 / 29 | 92 / 76 | 100 / 59 | 80 / 73 | 41 / 9 | 96 / - | 69 / 37 |

What it shows: GTCRN does not separate voices (bystander leak stays within a few points of open) and costs customer
words in the hardest cells (en chat@0 95 to 78, ko order@0 98 to 80, babble and song lower than open). Music at 0 dB
does not hurt the transcriber even without it (open keeps 97 and 99), so on this bench L0 has nothing to fix. The
song cells are a spoken voice-over of lyric-like lines (README), so this says nothing about real singing.

### J2. l2-campp: CAM++ voice gate (L2)

Silero VAD finds speech; CAM++ zh/en scores each 1.0 s window (0.25 s hop, windows with under 0.3 s of speech are not
scored) against an embedding of enrol.wav. A hop matches when the mean of the last 3 scored hops reaches the threshold;
the gate then opens back to the onset of the speech run in progress (at most 1.0 s before the decision, minus 0.2 s)
and closes 0.7 s after the last matching window. Segments only; the judge sends the mix inside them.

Tuning: threshold 0.10 to 0.70 x smoothing 1/3/5 hops x look-back 1/2/3 s, on the dev slice only (chat@-5 and
read@-5, English and Korean, 48 trials), maximising customer speech time kept minus bystander-only time leaked
(objective written before the sweep). Chosen: **threshold 0.35, smoothing 3, look-back 1.0 s** (dev slice: 86% of
customer speech time kept, 37% of bystander time leaked). Log `candidates/l2-campp/logs/tune-20261126T233859.json`.
Judge on the dev slice as a check (words, not time): kept 65 to 85%, leaked 9 to 31% per cell
(`bench/logs/words-l2-campp-slice-2026-11-26T14-42-35-140Z.json`, not reported below).

Full run: `bench/logs/words-l2-campp-2026-11-26T14-49-34-842Z.json`. latency_ms 83 = median compute of one window,
one thread, on a machine at load average 13 to 100 from other projects (not a clean speed; see J5).

| en | alone | chat@-10 | chat@0 | order@-10 | order@0 | babble@0 | music@0 | song@0 |
|---|---|---|---|---|---|---|---|---|
| open | 96 / - | 100 / 52 | 95 / 71 | 99 / 49 | 95 / 74 | 36 / 13 | 97 / - | 73 / 30 |
| hold-oracle | 96 / - | 100 / 14 | 87 / 55 | 92 / 21 | 85 / 58 | 34 / 5 | 98 / - | 88 / 11 |
| l2-campp | 86 / - | 71 / 8 | 39 / 16 | 67 / 11 | 51 / 31 | 15 / 1 | 86 / - | 50 / 9 |

| ko | alone | chat@-10 | chat@0 | order@-10 | order@0 | babble@0 | music@0 | song@0 |
|---|---|---|---|---|---|---|---|---|
| open | 100 / - | 100 / 38 | 99 / 82 | 100 / 53 | 98 / 91 | 52 / 12 | 99 / - | 83 / 30 |
| hold-oracle | 100 / - | 100 / 9 | 99 / 63 | 100 / 27 | 93 / 64 | 50 / 4 | 99 / - | 84 / 8 |
| l2-campp | 99 / - | 82 / 19 | 72 / 43 | 96 / 33 | 73 / 46 | 36 / 4 | 89 / - | 46 / 5 |

What it shows: the gate trades customer words for fewer leaks; it does not separate. When both voices are in a window
the score falls between the two speakers', so the gate shuts during overlap and takes the customer with it (en chat@0:
39% kept, 16% leaked; hold-oracle 87% / 55%). Its look-back of 1.0 s, chosen because longer look-backs leaked more on
the dev slice, clips the first phrase even when the customer is alone (en alone 86%). Scores of the same voice over
1 s windows were only 0.2 to 0.56 in the smoke test (`w0074`, `w0473`), close to the cross-speaker range; 1 s is too
short for CAM++ to be sure (its published EER at 1 s is 5.86%, measured on real speech, not on 0 dB overlap). Korean
keeps more and leaks more than English at the same setting (one threshold for both). A Korean-only threshold does not
close the gap: on the dev slice, Korean kept minus leaked is flat from 0.35 to 0.40 (0.44 to 0.45), and at the leak
English has at 0.35 (30%) Korean keeps 68% against English's 81% (threshold 0.45; same tune log). The zh/en model
separates these Korean voices less well.

L2 on the cells kibo-59 asked about (same log; "k/12" = trials where at least 20% of the bystander's words leaked):

| l2-campp | silent+chat@0 | silent+order@0 | silent+read@0 | quiet-6 | quiet-12 | alone | short | short+chat@0 | order@-10 | order@0 |
|---|---|---|---|---|---|---|---|---|---|---|
| en | - / 15 (2/12) | - / 9 (2/12) | - / 1 (0/12) | 95 / - | 93 / - | 86 / - | 22 / - | 22 / 22 (3/12) | 67 / 11 (5/12) | 51 / 31 (6/12) |
| ko | - / 26 (3/12) | - / 36 (7/12) | - / 18 (4/12) | 99 / - | 98 / - | 99 / - | 89 / - | 31 / 35 (6/12) | 96 / 33 (5/12) | 73 / 46 (9/12) |

(open leaks 90 to 100% of a lone bystander's words in all six silent+ cells, 12/12 trials each.) The voice gate closes
most of the stretch where the customer is silent, which a loudness gate cannot do when the bystander is as loud as the
customer, but Korean leaks 2 to 4 times more than English at the same threshold, and one-word customer answers
("short") rarely open it in English (22% kept; 10 of 12 trials never opened, `phone-20261127T010832.json`).

### J3. c-voxlock: VoxLock target-speaker extraction (route C)

VoxLock (`voxlock_enroll.onnx` + `voxlock_chunk_int8.onnx`) through sherpa-onnx's denoiser, with the trial's enrol.wav
as the explicit voice sample (sherpa uses its loudest 3 s). out.wav only; time-aligned with the mix (lag 0). No setting
was tuned. Log `bench/logs/words-c-voxlock-2026-11-26T16-12-39-113Z.json` (960 trials, 957 transcriber calls).
latency_ms 121 = 24 ms algorithmic + one 40 ms chunk + the compute for that chunk at the measured 1.42x real time; see
J5, which also says why that number is not a real bound.

| en | alone | chat@-10 | chat@0 | order@-10 | order@0 | babble@0 | music@0 | song@0 |
|---|---|---|---|---|---|---|---|---|
| open | 96 / - | 100 / 52 | 95 / 71 | 99 / 49 | 95 / 74 | 36 / 13 | 97 / - | 73 / 30 |
| hold-oracle | 96 / - | 100 / 14 | 87 / 55 | 92 / 21 | 85 / 58 | 34 / 5 | 98 / - | 88 / 11 |
| c-voxlock | 98 / - | 97 / 15 | 90 / 46 | 98 / 34 | 67 / 66 | 68 / 7 | 98 / - | 86 / 7 |

| ko | alone | chat@-10 | chat@0 | order@-10 | order@0 | babble@0 | music@0 | song@0 |
|---|---|---|---|---|---|---|---|---|
| open | 100 / - | 100 / 38 | 99 / 82 | 100 / 53 | 98 / 91 | 52 / 12 | 99 / - | 83 / 30 |
| hold-oracle | 100 / - | 100 / 9 | 99 / 63 | 100 / 27 | 93 / 64 | 50 / 4 | 99 / - | 84 / 8 |
| c-voxlock | 100 / - | 100 / 3 | 97 / 33 | 100 / 20 | 92 / 28 | 61 / 9 | 99 / - | 89 / 14 |

By bystander content (pooled over levels -15 to +5 dB, chat@-5 and read@-5 left out for every row; n trials), then the
cells where the customer says nothing and a bystander talks alone at 0 dB (leaked %, 12 trials each):

| | chat | order | read | yes | song | silent+chat | silent+order | silent+read |
|---|---|---|---|---|---|---|---|---|
| en open | 89 / 57 (48) | 93 / 64 (60) | 84 / 55 (48) | - / 100 (60) | 80 / 34 (36) | 100 | 95 | 98 |
| en c-voxlock | 86 / 39 (48) | 85 / 49 (60) | 85 / 17 (48) | - / 98 (60) | 86 / 12 (36) | 100 | 99 | 88 |
| ko open | 97 / 54 (48) | 96 / 65 (60) | 70 / 35 (48) | - / 92 (60) | 80 / 30 (36) | 100 | 90 | 99 |
| ko c-voxlock | 92 / 24 (48) | 94 / 22 (60) | 84 / 10 (48) | - / 85 (60) | 81 / 12 (36) | 95 | 89 | 98 |

Other cells: quiet-6 / quiet-12 / short keep 99 / 96 / 100 (en) and 99 / 100 / 100 (ko); short+chat@0 72 / 81 (en,
11/12 trials leaking) and 92 / 49 (ko, 8/12).

What it shows:

- **A lone bystander passes at full level.** When the customer is silent and someone else talks, VoxLock passes that
  voice through: 88 to 100% of the bystander's words reach the transcriber (all 12 trials leak in five of the six
  silent+ cells), and the bystander's "yes" lines pass 98% (en) and 85% (ko). The signal check in
  `candidates/c-voxlock/logs/check-lone-bystander-20261126.txt` shows why: a lone non-target voice comes out at
  1.06 to 1.08 times its input level for 4 to 6 s, the same gain as the customer alone, and the author's own `voxlock`
  1.3.1 package gives the same numbers, so this is the model, not the sherpa-onnx integration. VoxLock suppresses the
  other voice only while the enrolled voice is also present. The author's published 0.11 background words per minute
  comes from a different test (Krisp's benchmark, its own conditions); this bench's case, a nearby talker while the
  customer is silent, is not what that number measures.
- **During overlap it helps, unevenly.** It removes more bystander words than a perfect press in Korean (chat@0 33%
  vs hold-oracle 63%, order@0 28% vs 64%) and in English chat@0 (46% vs 55%), and keeps most of the customer (en chat@0 90%, ko
  order@0 92%, the other overlap cells 97 to 100%). English order@0 fails: 67% kept, 66% leaked, 11 of 12 trials leaking. The trials checked by signal show a
  similar-voice pair (w0737, two male voices: overlap fit customer 0.32, bystander 0.85) where the model follows the
  wrong voice.
- **Korean.** VoxLock does not hurt Korean on this bench: Korean keeps as much as English, and loses fewer words to
  the bystander in overlap (pooled order leak 22% vs 49%). Why is not known (the voice pairs per language were not
  compared).
- **Against the headline of section C** ("only extraction can reach the 0 dB overlap line"): partly confirmed.
  Extraction is the only candidate here that cuts 0 dB overlap leakage below the perfect press while keeping the
  customer (ko both cells, en chat@0). It is far from the customer-oracle line (0% leaked), it fails en order@0, and by
  itself it does nothing for the stretches where the customer is silent.
- Babble@0 keeps 68% (en) and 61% (ko) of the customer's words vs open 36% and 52%: extraction also helps
  understanding in a crowd.

### J4. c-voxlock-vad, and the chains not run

c-voxlock-vad: Silero VAD (threshold 0.5, fixed) on c-voxlock's out.wav, segments widened by 0.2 s before and 0.7 s
after; the judge sends c-voxlock's out.wav inside them. latency_ms 33 on top of c-voxlock. Log
`bench/logs/words-c-voxlock-vad-2026-11-26T16-17-41-752Z.json` (461 new transcriber calls; the rest were unchanged
audio).

| | alone | chat@-10 | chat@0 | order@-10 | order@0 | babble@0 | music@0 | song@0 |
|---|---|---|---|---|---|---|---|---|
| en c-voxlock-vad | 97 / - | 97 / 17 | 87 / 48 | 99 / 31 | 70 / 66 | 50 / 6 | 99 / - | 92 / 6 |
| ko c-voxlock-vad | 100 / - | 100 / 3 | 97 / 33 | 100 / 20 | 92 / 25 | 63 / 9 | 93 / - | 94 / 12 |

| | chat | order | read | yes | song | silent+chat | silent+order | silent+read |
|---|---|---|---|---|---|---|---|---|
| en c-voxlock-vad | 85 / 39 (48) | 86 / 48 (60) | 86 / 17 (48) | - / 96 (60) | 87 / 12 (36) | 95 | 99 | 86 |
| ko c-voxlock-vad | 92 / 24 (48) | 94 / 20 (60) | 86 / 7 (48) | - / 69 (60) | 86 / 11 (36) | 86 | 83 | 91 |

What it shows: a VAD after extraction changes almost nothing. The lone bystander comes out of VoxLock at full level,
so the VAD hears speech and keeps it (silent+ cells still 83 to 99%). Differences from c-voxlock are a few points
either way at n = 12, except en babble@0 (68 to 50% kept: the VAD cuts quiet customer words in babble) and the
Korean bystander "yes" lines (85 to 69% leaked) and ko silent+ cells (89 to 98% down to 83 to 91%).

Not run (kibo-59, 11-27, money for the Live flow sessions): `l2-campp-after-gtcrn` (its gate metas were written,
threshold 0.35 / smoothing 1 / look-back 1.0 s from the dev slice, `candidates/l2-campp-after-gtcrn/logs/tune-20261127T005311.json`,
but it was not judged) and `l0-dpdfnet`. The combination the results point to, the L2 gate with VoxLock inside it, was
not built or measured either.

The out.wav files of l0-gtcrn and c-voxlock were deleted after their word logs were written (disk rule); meta.json
files remain, and `l0/run.py` and `c-voxlock/run.py extract` re-create the audio.

### J5. Compute and added delay

All on this MacBook (Apple silicon, 4 performance + 4 efficiency cores), one thread, while other projects' builds and
headless browsers ran (load average 5 to 100). No number below is a clean measurement; a run on a quiet machine was not
done.

| Model (candidate) | ms of compute per second of audio | Other | Log (`candidates/<name>/logs/`) |
|---|---|---|---|
| GTCRN (l0-gtcrn) | 134.6 (offline, 960 trials) | | `l0-gtcrn/logs/speed-20261126T230633.json` |
| Silero VAD + CAM++ (l2-campp) | 413.4 (960 trials; windows scored only over speech) | 82.8 ms per 1 s window, median | `l2-campp/logs/speed-20261126T233749.json` |
| same, on GTCRN output | 639.1 (heavier load) | 102.8 ms per window | `l2-campp-after-gtcrn/logs/speed-20261127T005256.json` |
| CAM++ network only (onnxruntime) | about 230 at 4 windows per second | 57.9 ms per window (p90 70.5), load 5.7 | `l2-campp/logs/phone-20261127T010832.json` |
| Silero VAD (c-voxlock-vad) | 17.9 | | `c-voxlock-vad/logs/speed-20261127T010258.json` |
| VoxLock (c-voxlock), streaming 40 ms chunks | **1,418** (20 trials) | chunk median 47.8 ms, p95 93.0 ms | `c-voxlock/logs/speed-20261127T005646.json` |
| VoxLock, 5-trial check | offline 1 thread 1,181; 2 threads 679 | streaming 2 threads 1,810 at higher load | `c-voxlock/logs/check-speed-compare-20261127T0100.txt` |
| DPDFNet | not measured (dropped) | | |

Added delay (`latency_ms` declared to the judge): l0-gtcrn 50; l2-campp 83 (compute only; it needs the app to hold
back audio, because the gate decides 430 to 560 ms after the customer starts, median, p90 up to 1.9 s in English,
`phone-20261127T010832.json`; without the look-back it would declare about 1,000 ms); c-voxlock 121 (24 ms algorithmic
+ 40 ms chunk + compute at 1.42x real time); c-voxlock-vad 154 (121 + 33). VoxLock's 121 ms is not a real bound: at
1.42x real time on one thread it falls further behind with every second of audio, so it needs at least two threads or a
faster core to stream at all (not verified for streaming). The slowness is compute, not waiting for a core: the
20-trial run used 190 s of CPU time for 142 s of audio at 92% CPU (`time`, 11-27). Whether macOS put it on an
efficiency core part of the time is not known.

L2 on a phone (sent to kibo-59 11-27): CAM++ zh/en is 28.3 MB fp32; about 2 s of the customer's clean speech as
enrolment gives the same dev-slice operating point as the bench's 3 to 4.7 s (1.0 s: 64% kept / 20% leaked; 2.0 s:
84% / 36%; whole: 86% / 38%; threshold fixed at 0.35, `phone-20261127T010832.json`). Phone-class CPU and
onnxruntime-web speeds are assumed, not measured (2 to 4x and a further 1.5 to 3x slower than this Mac), so in the
browser it likely needs a 0.5 s hop or an int8 model.

### J6. What this means, what failed, what is unverified

**For a no-press design.** Extraction does not close the microphone. When the customer is silent and a bystander
talks, VoxLock passes the bystander at full level (88 to 100% of words, J3), and a VAD after it does not help (J4).
Something else must close the window between the customer's turns. Of what was measured here, only the voice gate
does that for a bystander as loud as the customer (l2-campp: 1 to 15% leaked in English, 18 to 36% in Korean, J2).
A loudness gate cannot when the levels are equal, and meaning cannot for a rival order (reported by kibo-59 from the
Live flow sessions, not measured here: the neighbour's order was added in 5 to 6 of 6). The stack these numbers point to is the L2 gate deciding *who*, with
VoxLock inside the open gate for overlap. That combination is not measured.

**Failed or weak:**
- VoxLock: lone bystander pass-through; en order@0 (66% leaked, 67% kept); slower than real time on one thread here.
- l2-campp: one-word answers (en short 22% kept); Korean leaks 2 to 4 times more than English at one threshold; it
  drops the customer in overlap (en chat@0 39% kept).
- l0-gtcrn: nothing to fix on this bench (music at 0 dB does not hurt the transcriber), and it costs customer words in
  the hardest cells.

**Unverified:**
- All speeds (machine under load; no quiet re-run); phone and browser speeds are assumptions.
- All voices are TTS or public read speech mixed in software; no real room, phone microphone or real singing.
- Enrolment from the customer's first words in a noisy place (the bench enrols from clean speech).
- Why VoxLock does better on Korean than English (voice pairs per language not compared).
- Nothing here ran on the Live layer.
